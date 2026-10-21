// Offline play, as in the football game. On install it saves every file the game needs (listed
// in offline.json by scripts/build-artifact.mjs: the page, its code and styles with the rosters,
// logos and fonts inside, the manifest and icons), so after one visit the game runs with no
// connection at all. Pages come from the network first (a new version is picked up as soon as it's
// deployed) and fall back to the saved copy offline; built files are versioned by name, so the
// saved copy is used straight away. NHL player photos are saved as they're shown.
//
// One worker script, two registrations: the desktop page registers it for the site folder
// (/Rink_GM/) and the phone page for /Rink_GM/mobile/. Each saves only its own page, so a phone
// that only ever opens /mobile/ doesn't also download the desktop build.
const VERSION = "dev"; // stamped by build-artifact.mjs, so every deploy installs a fresh copy
const ROOT = new URL("./", self.location).pathname; // the site folder (where this file lives)
const SCOPE = new URL(self.registration.scope).pathname; // the pages this copy looks after
const MOBILE = SCOPE !== ROOT && SCOPE.startsWith(`${ROOT}mobile/`);
const CACHE = `rink-gm-v1 ${SCOPE}`;
const PHOTOS = "rink-gm-photos";
const PHOTO_LIMIT = 400;

const tell = async (msg) => { for (const c of await self.clients.matchAll({ includeUncontrolled: true })) c.postMessage(msg); };
// /Rink_GM/ and /Rink_GM/index.html are the same page: keep one copy.
const pageKey = (url) => { const u = new URL(url, self.location); u.search = ""; u.hash = ""; if (u.pathname.endsWith("/")) u.pathname += "index.html"; return u.href; };

// Save everything this scope needs. Reports progress to open pages: { type: 'offline', done, total }.
async function saveAll() {
  const res = await fetch(`${ROOT}offline.json`, { cache: "no-store" });
  if (!res.ok) return;
  const list = await res.json();
  const files = (MOBILE ? list.mobile : list.desktop) || [];
  const cache = await caches.open(CACHE);
  const urls = files.map((f) => pageKey(ROOT + f));
  let done = 0;
  const report = (extra = {}) => tell({ type: "offline", scope: SCOPE, done, total: urls.length, version: list.version, ...extra });
  // a few at a time; skip built files already saved (they never change under the same name)
  const queue = [...urls];
  const worker = async () => {
    while (queue.length) {
      const u = queue.shift();
      if (!(u.includes("/assets/") && await cache.match(u))) {
        try { const r = await fetch(u, { cache: "no-cache" }); if (r.ok) await cache.put(u, r); } catch { /* try again next visit */ }
      }
      done++;
      await report();
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  await cache.put(`${SCOPE}__offline-ready`, new Response(JSON.stringify({ version: list.version, at: Date.now(), total: urls.length }), { headers: { "Content-Type": "application/json" } }));
  await report({ ready: true });
  // drop built files from older versions
  const keep = new Set(urls);
  for (const req of await cache.keys()) if (req.url.includes("/assets/") && !keep.has(req.url)) await cache.delete(req);
}

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(saveAll().catch(() => {}));
});

self.addEventListener("activate", (e) => {
  // older stores for this scope (a renamed cache) go; the other scope's store stays
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("rink-gm-v") && k.endsWith(` ${SCOPE}`) && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Player photos: cross-site (assets.nhle.com), saved as they're shown. Kept to a few hundred.
async function trimPhotos(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - PHOTO_LIMIT; i++) await cache.delete(keys[i]);
}
async function savePhoto(cache, url) {
  const hit = await cache.match(url);
  if (hit) return hit;
  const r = await fetch(url, { mode: "no-cors", credentials: "omit" });
  if (r.ok || r.type === "opaque") { await cache.put(url, r.clone()); }
  return r;
}
const photo = (req) => caches.open(PHOTOS).then((c) => c.match(req.url).then((hit) => hit || fetch(req).then((r) => {
  if (r.ok || r.type === "opaque") { const rc = r.clone(); c.put(req.url, rc).then(() => trimPhotos(c)); }
  return r;
}))).catch(() => Response.error());

// The page can ask for a fresh save (the "Get ready for offline" button) or extra files (your
// club's player photos).
self.addEventListener("message", (e) => {
  if (e.data?.type === "save-all" && (!e.data.scope || e.data.scope === SCOPE)) e.waitUntil(saveAll().catch(() => {}));
  if (e.data?.type === "save-urls") {
    e.waitUntil(caches.open(PHOTOS).then(async (c) => {
      for (const u of (e.data.urls || []).slice(0, PHOTO_LIMIT)) { try { await savePhoto(c, u); } catch { /* skip it */ } }
      await trimPhotos(c);
      await tell({ type: "saved-urls" });
    }));
  }
});

const networkFirst = (req) => {
  const key = pageKey(req.url);
  return fetch(req)
    .then((r) => { if (r.ok) { const rc = r.clone(); caches.open(CACHE).then((c) => c.put(key, rc)); } return r; })
    .catch(() => caches.open(CACHE).then((c) => c.match(key).then((hit) => hit || (req.mode === "navigate" ? c.match(`${SCOPE}index.html`) : undefined))).then((r) => r || Response.error()));
};
const cacheFirst = (req) => caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((r) => {
  if (r.ok) { const rc = r.clone(); c.put(req, rc); }
  return r;
})));

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.hostname === "assets.nhle.com" && url.pathname.startsWith("/mugs/")) { e.respondWith(photo(e.request)); return; }
  if (url.origin !== self.location.origin || !url.pathname.startsWith(ROOT)) return;
  if (url.pathname.startsWith(`${ROOT}api/`)) return; // the schedule service (where one runs) is always live
  if (!MOBILE && url.pathname.startsWith(`${ROOT}mobile/`)) return; // the phone page has its own copy
  const isPage = e.request.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname.endsWith("/");
  if (isPage || url.pathname.endsWith("offline.json") || url.pathname.endsWith("manifest.json")) e.respondWith(networkFirst(e.request));
  else e.respondWith(cacheFirst(e.request));
});
