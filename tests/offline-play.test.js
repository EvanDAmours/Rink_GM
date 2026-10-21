// Offline play and the phone page (Gridiron 2.32 / 2.58): scripts/build-artifact.mjs turns a Vite
// build into the GitHub Pages site (desktop page, /mobile/ at 90%, offline list, stamped worker)
// and leaves the single-file copy plain; public/sw.js saves each page's own files and serves them
// with the network off.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import vm from "node:vm";

const root = new URL("..", import.meta.url).pathname;

// A Vite-shaped build: index.html pointing at hashed assets, plus everything in public/.
function fakeDist() {
  const dir = mkdtempSync(join(tmpdir(), "rink-pages-"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "assets/index-abc123.js"), "console.log('rink');</script><!--x");
  writeFileSync(join(dir, "assets/index-abc123.css"), "body{color:#fff}");
  writeFileSync(join(dir, "index.html"), `<!doctype html><html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" /><link rel="icon" href="data:image/svg+xml,x" /><script type="module" crossorigin src="./assets/index-abc123.js"></script><link rel="stylesheet" crossorigin href="./assets/index-abc123.css"></head><body><div id="root"></div></body></html>`);
  cpSync(join(root, "public"), dir, { recursive: true });
  return dir;
}

test("build-artifact: desktop page, phone page at 90%, offline list and a stamped worker", () => {
  const dist = fakeDist();
  try {
    execFileSync("node", [join(root, "scripts/build-artifact.mjs"), dist], { stdio: "pipe" });
    const desk = readFileSync(join(dist, "index.html"), "utf8");
    const phone = readFileSync(join(dist, "mobile/index.html"), "utf8");
    const single = readFileSync(join(dist, "rink-gm.html"), "utf8");
    // the desktop page: registered for offline and installable, still loading its own assets
    assert.match(desk, /<meta name="rink-sw" content="sw\.js">/);
    assert.match(desk, /<link rel="manifest" href="manifest\.json">/);
    assert.match(desk, /src="\.\/assets\/index-abc123\.js"/);
    // the phone page: self-contained, 90%, marked as the phone entry, its own manifest, the shared worker
    assert.match(phone, /initial-scale=0\.9, viewport-fit=cover/);
    assert.match(phone, /<meta name="rink-entry" content="mobile">/);
    assert.match(phone, /<meta name="rink-sw" content="\.\.\/sw\.js">/);
    assert.match(phone, /<link rel="manifest" href="manifest\.json">/);
    assert.match(phone, /href="\.\.\/icons\/icon-180\.png"/);
    assert.ok(!phone.includes("assets/index-abc123"), "the phone page doesn't depend on ../assets");
    assert.ok(phone.includes("<\\/script") && phone.includes("<\\!--"), "inline code is escaped");
    // the single file (claude.ai Artifact): no worker, no manifest, normal scale
    assert.ok(!single.includes("rink-sw") && !single.includes('rel="manifest"') && !single.includes("rink-entry"));
    assert.match(single, /initial-scale=1"/);
    // the phone app starts and stays at /mobile/; its icons are the site's
    const man = JSON.parse(readFileSync(join(dist, "mobile/manifest.json"), "utf8"));
    assert.equal(man.start_url, "./"); assert.equal(man.scope, "./");
    assert.ok(man.icons.every((i) => i.src.startsWith("../icons/")));
    for (const i of man.icons) assert.ok(existsSync(join(dist, "mobile", i.src)), `${i.src} exists`);
    // each page saves only its own files
    const off = JSON.parse(readFileSync(join(dist, "offline.json"), "utf8"));
    assert.match(off.version, /^[0-9a-f]{12}$/);
    assert.ok(off.desktop.includes("index.html") && off.desktop.includes("assets/index-abc123.js") && off.desktop.includes("manifest.json"));
    assert.ok(!off.desktop.some((f) => f.startsWith("mobile/")));
    assert.ok(off.mobile.includes("mobile/index.html") && off.mobile.includes("mobile/manifest.json") && off.mobile.includes("icons/icon-192.png"));
    assert.ok(!off.mobile.some((f) => f.startsWith("assets/")), "the phone page needs no desktop assets");
    for (const list of [off.desktop, off.mobile]) assert.ok(!list.some((f) => ["sw.js", "offline.json", "rink-gm.html"].includes(f)));
    // every deploy installs a fresh worker
    assert.ok(readFileSync(join(dist, "sw.js"), "utf8").includes(`const VERSION = "${off.version}";`));
    // running it again changes nothing that matters (no double tags)
    execFileSync("node", [join(root, "scripts/build-artifact.mjs"), dist], { stdio: "pipe" });
    assert.equal((readFileSync(join(dist, "index.html"), "utf8").match(/rink-sw/g) || []).length, 1);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

// The worker in a sandbox: an in-memory Cache Storage, a fake network, and the two registrations.
function worker(scope, { online = true, files = {} } = {}) {
  const stores = new Map();
  // like the real Cache API: keys are full URLs, relative ones resolve against the worker
  const req = (u) => new URL(typeof u === "string" ? u : u.url, "http://site.test/Rink_GM/sw.js").href;
  const cacheFor = () => {
    const m = new Map();
    return {
      m,
      match: async (u, o) => {
        const k = req(u);
        if (m.has(k)) return m.get(k);
        if (o?.ignoreSearch) for (const [kk, v] of m) if (kk.split("?")[0] === k.split("?")[0]) return v;
        return undefined;
      },
      put: async (u, r) => { m.set(req(u), r); },
      keys: async () => [...m.keys()].map((url) => ({ url })),
      delete: async (u) => m.delete(req(u)),
    };
  };
  const caches = {
    open: async (n) => { if (!stores.has(n)) stores.set(n, cacheFor()); return stores.get(n); },
    keys: async () => [...stores.keys()],
    delete: async (n) => stores.delete(n),
    match: async (u) => { for (const c of stores.values()) { const h = await c.match(u); if (h) return h; } },
  };
  class Res { constructor(body, init = {}) { this.body = body; this.ok = (init.status ?? 200) < 400; this.status = init.status ?? 200; this.type = "basic"; } clone() { return this; } async json() { return JSON.parse(this.body); } static error() { const r = new Res(null, { status: 0 }); r.ok = false; r.type = "error"; return r; } }
  const fetched = [];
  const fetch = async (u) => {
    const url = req(u); fetched.push(url);
    if (!online) throw new TypeError("offline");
    const path = new URL(url).pathname;
    if (path in files) return new Res(files[path]);
    return new Res("missing", { status: 404 });
  };
  const listeners = {};
  const self = { location: new URL("http://site.test/Rink_GM/sw.js"), registration: { scope: `http://site.test${scope}` }, skipWaiting() {}, clients: { claim: async () => {}, matchAll: async () => [] }, addEventListener: (t, f) => { listeners[t] = f; } };
  vm.runInNewContext(readFileSync(join(root, "public/sw.js"), "utf8"), { self, caches, fetch, Response: Res, URL, JSON, Date, Promise, Set, Math, console });
  const dispatch = async (url, mode = "no-cors") => {
    let out = null;
    listeners.fetch({ request: { url, method: "GET", mode }, respondWith: (p) => { out = p; } });
    return out ? await out : "passthrough";
  };
  return { listeners, stores, fetched, dispatch, setOnline: (v) => { online = v; } };
}

const SITE = {
  "/Rink_GM/offline.json": JSON.stringify({ version: "v1", desktop: ["index.html", "assets/index-abc.js", "manifest.json"], mobile: ["mobile/index.html", "mobile/manifest.json"] }),
  "/Rink_GM/index.html": "<desktop>", "/Rink_GM/assets/index-abc.js": "js", "/Rink_GM/manifest.json": "{}",
  "/Rink_GM/mobile/index.html": "<phone>", "/Rink_GM/mobile/manifest.json": "{}",
};

test("service worker: each page saves its own files and opens with the network off", async () => {
  for (const [scope, page, own, other] of [["/Rink_GM/", "/Rink_GM/", "/Rink_GM/assets/index-abc.js", "/Rink_GM/mobile/index.html"], ["/Rink_GM/mobile/", "/Rink_GM/mobile/", "/Rink_GM/mobile/manifest.json", "/Rink_GM/assets/index-abc.js"]]) {
    const w = worker(scope, { files: SITE });
    let saved;
    w.listeners.install({ waitUntil: (p) => { saved = p; } });
    await saved;
    const store = w.stores.get(`rink-gm-v1 ${scope}`);
    assert.ok(store, `a store for ${scope}`);
    const keys = [...store.m.keys()].map((u) => new URL(u).pathname);
    assert.ok(keys.includes(`${scope}__offline-ready`), "marked ready");
    assert.ok(keys.includes(own), `${scope} saved ${own}`);
    assert.ok(!keys.includes(other), `${scope} didn't save ${other}`);
    // offline: the page (asked for as the folder, with a query) and its files come from the store
    w.setOnline(false);
    const pageRes = await w.dispatch(`http://site.test${page}?debug`, "navigate");
    assert.equal(pageRes.body, scope.endsWith("mobile/") ? "<phone>" : "<desktop>");
    const asset = await w.dispatch(`http://site.test${own}`);
    assert.ok(asset.ok, `${own} offline`);
  }
});

test("service worker: the desktop copy leaves /mobile/ and other sites alone; player photos are kept", async () => {
  const w = worker("/Rink_GM/", { files: SITE });
  assert.equal(await w.dispatch("http://site.test/Rink_GM/mobile/index.html", "navigate"), "passthrough");
  assert.equal(await w.dispatch("http://other.test/x.js"), "passthrough");
  assert.equal(await w.dispatch("http://site.test/Rink_GM/api/nhl/schedule?season=2026"), "passthrough");
  // an NHL headshot is fetched once and then served from the photo store
  const photo = "https://assets.nhle.com/mugs/nhl/latest/8478402.png";
  const files = { "/mugs/nhl/latest/8478402.png": "png" };
  const w2 = worker("/Rink_GM/", { files });
  const first = await w2.dispatch(photo);
  assert.ok(first.ok);
  await new Promise((r) => setTimeout(r, 10));
  w2.setOnline(false);
  const again = await w2.dispatch(photo);
  assert.equal(again.body, "png");
  // offline and never seen: an error, so the page shows the sweater instead
  const miss = await w2.dispatch("https://assets.nhle.com/mugs/nhl/latest/1.png");
  assert.equal(miss.ok, false);
});
