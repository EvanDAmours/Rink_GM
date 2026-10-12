// Pack the Vite build into one self-contained page (CSS + JS inlined) for
// hosting as a single file, e.g. a claude.ai Artifact.
//   npm run build:artifact   ->  dist/rink-gm.html
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const dist = new URL("../dist/", import.meta.url).pathname;
const html = readFileSync(join(dist, "index.html"), "utf8");
const cssHref = html.match(/<link[^>]+rel="stylesheet"[^>]+href="\.?\/?(assets\/[^"]+\.css)"/)?.[1];
const jsSrc = html.match(/<script[^>]+src="\.?\/?(assets\/[^"]+\.js)"/)?.[1];
if (!cssHref || !jsSrc) throw new Error("Run `vite build` first: couldn't find the built CSS/JS in dist/index.html");

const css = readFileSync(join(dist, cssHref), "utf8");
// Keep the inline script from closing early or entering HTML comment parsing.
const js = readFileSync(join(dist, jsSrc), "utf8").replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]+>/)?.[0] || "";

const page = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#080d13"><title>Rink GM — Franchise Experience</title>
${fonts}
<style>
${css}
</style></head><body>
<div id="root"></div>
<script type="module">
${js}
</script></body></html>
`;
writeFileSync(join(dist, "rink-gm.html"), page);
console.log(`dist/rink-gm.html — ${(page.length / 1024).toFixed(0)} KB`);

// Dedicated Pages mobile entry uses the same origin/save storage as desktop.
mkdirSync(join(dist,"mobile"),{recursive:true});
writeFileSync(join(dist,"mobile/index.html"),page);
