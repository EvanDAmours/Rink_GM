// Finish the Vite build for hosting:
//   npm run build:artifact / build:pages  ->
//     dist/rink-gm.html       one self-contained page (CSS + JS inlined), e.g. for a claude.ai Artifact
//     dist/mobile/index.html  the phone page for GitHub Pages: the same self-contained page, drawn
//                             at 90% with the phone layout, its own manifest and offline copy
//     dist/index.html         the desktop page, marked for offline play and app install
//     dist/offline.json       every file each page needs offline; dist/sw.js gets the build's version
// The service worker and web manifest come from public/ (Vite copies them into dist/). Paths stay
// relative, so the site works at /Rink_GM/ on GitHub Pages or any other folder (VITE_BASE_PATH).
// Optional argument: the build folder (default dist/).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { createHash } from "node:crypto";

const dist = process.argv[2] ? resolve(process.argv[2]) : new URL("../dist/", import.meta.url).pathname;
const html = readFileSync(join(dist, "index.html"), "utf8");
const cssHref = html.match(/<link[^>]+rel="stylesheet"[^>]+href="\.?\/?(assets\/[^"]+\.css)"/)?.[1];
const jsSrc = html.match(/<script[^>]+src="\.?\/?(assets\/[^"]+\.js)"/)?.[1];
if (!cssHref || !jsSrc) throw new Error("Run `vite build` first: couldn't find the built CSS/JS in dist/index.html");

const css = readFileSync(join(dist, cssHref), "utf8");
// Keep the inline script from closing early or entering HTML comment parsing.
const js = readFileSync(join(dist, jsSrc), "utf8").replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]+>/)?.[0] || "";
const icon = html.match(/<link rel="icon"[^>]+>/)?.[0] || "";

const single = ({ viewport, title, head = "" }) => `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="${viewport}"><meta name="theme-color" content="#080d13"><title>${title}</title>
${icon ? `${icon}\n` : ""}${head}${fonts}
<style>
${css}
</style></head><body>
<div id="root"></div>
<script type="module">
${js}
</script></body></html>
`;

const page = single({ viewport: "width=device-width, initial-scale=1", title: "Rink GM — Franchise Experience" });
writeFileSync(join(dist, "rink-gm.html"), page);
console.log(`dist/rink-gm.html — ${(page.length / 1024).toFixed(0)} KB`);

// Offline play and app install (Pages only: the single file above stays a plain page).
const offline = existsSync(join(dist, "sw.js")) && existsSync(join(dist, "manifest.json"));
const appHead = (rel, statusBar) => [
  `<meta name="rink-sw" content="${rel}sw.js">`,
  `<link rel="manifest" href="manifest.json">`,
  `<link rel="apple-touch-icon" href="${rel}icons/icon-180.png">`,
  `<meta name="mobile-web-app-capable" content="yes">`,
  `<meta name="apple-mobile-web-app-capable" content="yes">`,
  `<meta name="apple-mobile-web-app-title" content="Rink GM">`,
  `<meta name="apple-mobile-web-app-status-bar-style" content="${statusBar}">`,
].join("\n") + "\n";

// Dedicated Pages mobile entry: same origin, so the same saved league as the desktop page.
// Phone layout and 90% scale (src/ui/mobile.js reads the rink-entry tag); viewport-fit=cover
// lets the phone header and tab bar sit inside the notch and home-bar safe areas.
const mobile = single({
  viewport: "width=device-width, initial-scale=0.9, viewport-fit=cover",
  title: "Rink GM",
  head: `<meta name="rink-entry" content="mobile">\n${offline ? appHead("../", "black-translucent") : ""}`,
});
mkdirSync(join(dist, "mobile"), { recursive: true });
writeFileSync(join(dist, "mobile/index.html"), mobile);

if (offline) {
  // The desktop page: marked for the worker and the install prompt.
  if (!html.includes('name="rink-sw"')) writeFileSync(join(dist, "index.html"), html.replace("</head>", `${appHead("", "black")}</head>`));
  // The phone page installs as its own app, starting at /mobile/.
  const man = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));
  writeFileSync(join(dist, "mobile/manifest.json"), JSON.stringify({ ...man, id: "./", start_url: "./", scope: "./", icons: man.icons.map((i) => ({ ...i, src: `../${i.src}` })) }, null, 2));

  // Every file the game needs, per page. Version = a hash of all of them, stamped into sw.js so
  // each deploy installs a fresh worker, which saves the new files.
  const files = [];
  const walk = (dir) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else files.push(relative(dist, p).split("\\").join("/")); } };
  walk(dist);
  const skip = new Set(["offline.json", "sw.js", "rink-gm.html", "404.html", ".nojekyll"]);
  const all = files.filter((f) => !skip.has(f) && !f.endsWith(".map")).sort();
  const hash = createHash("sha1");
  for (const f of all) hash.update(f).update(readFileSync(join(dist, f)));
  const version = hash.digest("hex").slice(0, 12);
  const desktop = all.filter((f) => !f.startsWith("mobile/"));
  const phone = all.filter((f) => f.startsWith("mobile/") || f.startsWith("icons/"));
  writeFileSync(join(dist, "offline.json"), JSON.stringify({ version, desktop, mobile: phone }));
  const sw = readFileSync(join(dist, "sw.js"), "utf8");
  writeFileSync(join(dist, "sw.js"), sw.replace(/const VERSION = "[^"]*";/, `const VERSION = ${JSON.stringify(version)};`));
  const kb = (list) => (list.reduce((s, f) => s + statSync(join(dist, f)).size, 0) / 1024).toFixed(0);
  console.log(`offline.json — version ${version}: desktop ${desktop.length} files (${kb(desktop)} KB), mobile ${phone.length} files (${kb(phone)} KB)`);
}
console.log(`dist/mobile/index.html — ${(mobile.length / 1024).toFixed(0)} KB`);
