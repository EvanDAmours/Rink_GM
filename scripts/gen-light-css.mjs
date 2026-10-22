// Builds src/ui/light.css: light-mode overrides for every stylesheet, made by re-mapping the dark
// surfaces, pale text and slate borders written in them (the maps live in src/ui/theme.js).
// Run after changing colours in any stylesheet:  node scripts/gen-light-css.mjs
// Every override sits in @scope (html.light) to (the keep-dark parts), which adds no specificity,
// and the file loads last, so it wins over the rule it re-maps and anything more specific still wins.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SURFACES, TEXT, BORDERS, KEEP_DARK } from "../src/ui/theme.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// load order: the screens' own stylesheets (imported with App), then main.jsx's.
export const FILES = [
  "src/ui/callup.css", "src/ui/contracts.css", "src/ui/draft.css", "src/ui/home.css", "src/ui/lines.css", "src/ui/live.css",
  "src/ui/prep.css", "src/ui/scouting.css", "src/ui/standings.css",
  "src/styles.css", "src/ui/premium.css", "src/ui/clubhouse.css", "src/ui/gridiron.css", "src/ui/mobile.css",
];
// selectors that belong to things keeping their own look
const KEEP_RE = /\.(gg-head|rk-phead|rk-hm|mm-|lr-|rinkwrap|gg-paper|rkt|gg-splash|lv-bug|keep-dark|rk-tour-card)/;
const notKeep = `:where(:not(${KEEP_DARK.map((k) => `${k} *`).join(", ")}, ${KEEP_DARK.join(", ")}))`;

const HEX = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;
const expand = (h) => { h = h.toLowerCase(); return h.length <= 4 ? h.split("").map((c) => c + c).join("") : h; };
// "#1e293bcc" -> ["#1e293b", "cc"]
const split = (raw) => { const e = expand(raw.slice(1)); return ["#" + e.slice(0, 6), e.slice(6)]; };

function remapValue(value, kind) {
  let hit = false;
  const out = value.replace(HEX, (raw) => {
    const [base, alpha] = split(raw);
    let to = null;
    if (kind === "bg") {
      if (SURFACES[base]) to = SURFACES[base];
      else if (base === "#ffffff" && alpha && alpha !== "ff") to = "#0f172a"; // white tint over dark -> ink tint
      else if (base === "#000000" && alpha && parseInt(alpha, 16) < 0xb0 && /gradient|^#/.test(value.trim())) to = null;
    } else if (kind === "text") {
      if (TEXT[base]) to = TEXT[base];
    } else if (kind === "border") {
      if (BORDERS[base]) to = BORDERS[base];
      else if (base === "#ffffff" && alpha && alpha !== "ff") to = "#0f172a";
    }
    if (!to) return raw;
    hit = true;
    return to + alpha;
  });
  return hit ? out : null;
}

const kindOf = (prop) => {
  if (/^(background|background-color|background-image)$/.test(prop)) return "bg";
  if (/^(color|fill|stroke|-webkit-text-fill-color|caret-color|text-decoration-color)$/.test(prop)) return "text";
  if (/^(border|border-(top|bottom|left|right)|border(-(top|bottom|left|right))?-color|outline|outline-color|column-rule)$/.test(prop)) return "border";
  if (prop === "box-shadow") return "border";
  return null;
};

function strip(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ""); }

// Splits a block of CSS into [prelude, body] pairs at the top level.
function blocks(css) {
  const out = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    const prelude = css.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < css.length && depth) { if (css[j] === "{") depth++; else if (css[j] === "}") depth--; j++; }
    out.push([prelude.replace(/^[;\s]*(@import[^;]*;|@charset[^;]*;)*/g, "").trim(), css.slice(open + 1, j - 1)]);
    i = j;
  }
  return out;
}
function decls(body) {
  const list = [];
  let depth = 0, cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === ";" && !depth) { list.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) list.push(cur);
  return list.map((d) => { const k = d.indexOf(":"); return k < 0 ? null : [d.slice(0, k).trim().toLowerCase(), d.slice(k + 1).trim()]; }).filter(Boolean);
}
function splitSelectors(sel) {
  const out = []; let depth = 0, cur = "";
  for (const ch of sel) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && !depth) { out.push(cur.trim()); cur = ""; } else cur += ch; }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function scope(sel) {
  if (KEEP_RE.test(sel)) return null;
  if (/^:root\b/.test(sel)) return null; // tokens are redefined by hand below
  if (/^html\b/.test(sel)) return sel.replace(/^html/, ":scope");
  if (/^\*/.test(sel)) return null;
  return sel;
}

function rule(prelude, body) {
  const ds = decls(body);
  const bgDecl = ds.find(([p]) => p === "background" || p === "background-color");
  const bgRemapped = bgDecl && remapValue(bgDecl[1], "bg");
  // a see-through tint (#22c55e18, rgba(…, .1)) reads light over a light page, so its text is re-mapped too
  const tint = (v) => /^(#[0-9a-f]{6}[0-7][0-9a-f]|#[0-9a-f]{3}[0-7]|rgba\([^)]*,\s*0?\.[0-4]\d*\))$/i.test(v.trim());
  const bgIsColour = bgDecl && !bgRemapped && !tint(bgDecl[1]) && !/transparent|none|inherit|var\(--(panel|bg|ice)/.test(bgDecl[1]);
  const out = [];
  for (const [p, v] of ds) {
    const kind = kindOf(p);
    if (!kind) continue;
    let nv = remapValue(v, kind);
    // white text: re-mapped only where the same rule sits it on a dark surface
    if (kind === "text" && !nv && bgRemapped && /^#fff(fff)?\b/i.test(v)) nv = v.replace(/^#fff(fff)?/i, "#0f172a");
    // pale text on a coloured (not dark) background stays as it is
    if (kind === "text" && nv && bgIsColour) nv = null;
    if (nv) out.push(`${p}: ${nv}`);
  }
  if (!out.length) return "";
  const sels = splitSelectors(prelude).map(scope).filter(Boolean);
  if (!sels.length) return "";
  return `${sels.join(",\n")} { ${out.join("; ")}; }\n`;
}

function walk(css) {
  let out = "";
  for (const [prelude, body] of blocks(css)) {
    if (!prelude) continue;
    if (/^@(media|supports|container|layer)/.test(prelude)) {
      const inner = walk(body);
      if (inner) out += `${prelude} {\n${inner}}\n`;
    } else if (prelude.startsWith("@")) continue; // keyframes, font-face
    else out += rule(prelude, body);
  }
  return out;
}

const TOKENS = `html.light {
  --bg: #eef1f6; --bg2: #ffffff; --panel: #ffffff; --panel2: #f4f6fa; --line: #d3d9e2;
  --text: #0f172a; --muted: #475569; --dim: #2563eb; --accent: #b45309; --good: #15803d; --warn: #b45309; --bad: #dc2626;
  --ice: #ffffff; color-scheme: light;
  --gg-bg: #eef1f6; --gg-cd: #ffffff; --gg-bd: #d3d9e2; --gg-tx: #0f172a; --gg-mt: #64748b; --gg-sl: #475569;
  --gg-gn: #15803d; --gg-bl: #2563eb; --gg-gd: #a16207; --gg-am: #b45309; --gg-rd: #dc2626;
}
html.light body { background: radial-gradient(1200px 600px at 10% -10%, #e2e8f0 0%, transparent 60%), #eef1f6; color: #0f172a; }
html.light :where(input, select, textarea)${notKeep} { background: #fff; color: #0f172a; border-color: #cbd2dc; }
html.light :where(${KEEP_DARK.join(", ")}) {
  color-scheme: dark; color: #e0e6f0;
  --bg: #111827; --bg2: #edf2f7; --panel: #111827; --panel2: #eaf0f6; --line: #334155;
  --text: #e0e6f0; --muted: #cbd5e1; --dim: #60a5fa; --accent: #fbbf24; --good: #4ade80; --warn: #fbbf24; --bad: #f87171; --ice: #111827;
  --gg-bg: #080c14; --gg-cd: #111827; --gg-bd: #1e293b; --gg-tx: #e0e6f0; --gg-mt: #64748b; --gg-sl: #94a3b8;
  --gg-gn: #22c55e; --gg-bl: #3b82f6; --gg-gd: #eab308; --gg-am: #f59e0b; --gg-rd: #ef4444;
}
`;

export function generate() {
  let out = `/* Light mode overrides. GENERATED by scripts/gen-light-css.mjs from the stylesheets; do not edit by hand.\n   Hand-written light fixes live in src/ui/light-fixes.css. */\n${TOKENS}`;
  out += `@scope (html.light) to (${KEEP_DARK.join(", ")}) {\n`;
  for (const f of FILES) {
    const css = strip(fs.readFileSync(path.join(root, f), "utf8"));
    const body = walk(css);
    if (body) out += `\n/* ${f} */\n${body}`;
  }
  return out + "}\n";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const css = generate();
  fs.writeFileSync(path.join(root, "src/ui/light.css"), css);
  console.log(`light.css: ${css.split("\n").length} lines`);
}
