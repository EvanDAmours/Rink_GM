// Light mode, as in the football game. Three choices: Dark, Light or Auto (follow the device).
// Saved per device. The stylesheets are drawn dark; ui/light.css (made by
// scripts/gen-light-css.mjs from every stylesheet) re-maps their dark surfaces, pale text and
// slate borders when <html> has the "light" class, and the rules built here do the same for the
// colours written inline in the screens. Moments, the live rink, the papers and the title screen
// keep their own look (KEEP_DARK).
const KEY = "rk_theme";
export const THEMES = [["dark", "Dark"], ["light", "Light"], ["auto", "Auto"]];
export const KEEP_DARK = [".keep-dark", ".lx-pc", ".lg-wall", ".lg-banner", ".gg-head", ".rk-phead", ".rk-hm", ".mm-overlay", ".rinkwrap", ".lr-stage", ".gg-paper-frame", ".gg-paper", ".rkt", ".gg-splash", ".lv-bug", ".rk-tour-card"];

const hasDoc = () => typeof document !== "undefined" && typeof window !== "undefined";
const store = () => { try { return globalThis.localStorage || null; } catch { return null; } };

export function normalizeTheme(v) { return v === "light" || v === "auto" ? v : "dark"; }

export function getTheme(storage = store()) {
  try { return normalizeTheme(storage?.getItem(KEY)); } catch { return "dark"; }
}
export function saveTheme(theme, storage = store()) {
  try { storage?.setItem(KEY, normalizeTheme(theme)); return true; } catch { return false; }
}
// What a choice means right now: Auto follows the device's light/dark setting.
export function resolveTheme(theme, prefersLight = devicePrefersLight()) {
  const t = normalizeTheme(theme);
  return t === "auto" ? (prefersLight ? "light" : "dark") : t;
}
function devicePrefersLight() {
  try { return !!window.matchMedia?.("(prefers-color-scheme: light)").matches; } catch { return false; }
}

// React writes inline colours as rgb(), so that's what the selectors look for.
const rgb = (hex) => { const h = hex.replace("#", ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(", "); };
export const SURFACES = {
  "#080c14": "#eef1f6", "#111827": "#ffffff", "#0f172a": "#f4f6fa", "#0b1220": "#ffffff", "#1e293b": "#e7ebf1",
  "#0d1424": "#f4f6fa", "#0a1520": "#f2f6fa", "#0a0f1a": "#f4f6fa", "#1e3a5f": "#dbeafe", "#0d1a2d": "#eef4fb",
  "#0d1020": "#f2f2fb", "#0d1a0d": "#effaf0", "#0d1824": "#f0f6fb", "#1a1a2e": "#f3f3f8", "#0a0f00": "#fbf8ee",
  "#080f1e": "#e9edf4", "#0d1a2a": "#eef4fb", "#13261d": "#e6f6ec", "#0b1120": "#f4f6fa", "#111a2b": "#f4f6fa",
  "#080d13": "#eef1f6", "#052e16": "#dcfce7", "#14532d": "#dcfce7", "#7f1d1d": "#fee2e2", "#450a0a": "#fee2e2",
  "#1e1b4b": "#ede9fe", "#4c1d95": "#ede9fe", "#78350f": "#fef3c7", "#071b27": "#e0f2fe", "#334155": "#dde3eb",
  "#1b1a17": "#f4f2ec", "#0f2a1a": "#e6f6ec", "#0d1526": "#f4f6fa", "#0c1322": "#f4f6fa", "#162033": "#eef1f6",
};
export const TEXT = {
  "#e0e6f0": "#0f172a", "#e2e8f0": "#1e293b", "#cbd5e1": "#334155", "#94a3b8": "#475569", "#f1f5f9": "#0f172a",
  "#eab308": "#a16207", "#f59e0b": "#b45309", "#fde68a": "#a16207", "#fbbf24": "#b45309", "#fcd34d": "#a16207", "#facc15": "#a16207",
  "#22c55e": "#15803d", "#4ade80": "#15803d", "#86efac": "#15803d", "#bbf7d0": "#166534", "#fca5a5": "#b91c1c", "#f87171": "#dc2626", "#fecaca": "#b91c1c",
  "#7dd3fc": "#0369a1", "#38bdf8": "#0284c7", "#60a5fa": "#2563eb", "#93c5fd": "#1d4ed8", "#bfdbfe": "#1d4ed8",
  "#a78bfa": "#6d28d9", "#c4b5fd": "#6d28d9", "#ddd6fe": "#6d28d9", "#e9d5ff": "#6d28d9", "#fdba74": "#c2410c", "#fef3c7": "#92400e",
  "#f9a8d4": "#be185d", "#f5c542": "#a16207", "#84cc16": "#4d7c0f", "#a3e635": "#4d7c0f", "#e0f2fe": "#0369a1",
};
export const BORDERS = { "#1e293b": "#d3d9e2", "#334155": "#cbd2dc", "#1e3a5f": "#bfd3ea", "#14532d": "#cfe3d6", "#0f172a": "#d3d9e2", "#0b1220": "#d3d9e2" };

const L = "html.light";
const free = `:not(${KEEP_DARK.map((k) => `${k} *`).join(", ")}):not(${KEEP_DARK.join(", ")})`;

// The rules for inline colours (the football game's approach).
export function buildInlineCss() {
  const out = [`${L} { color-scheme: light; }`];
  const surf = [...Object.keys(SURFACES).flatMap((h) => [`background: rgb(${rgb(h)})`, `background-color: rgb(${rgb(h)})`]), "background: rgba(", "background-color: rgba(", "background: transparent"];
  for (const [d, l] of Object.entries(SURFACES)) {
    const r = rgb(d);
    out.push(`${L} [style*="background: rgb(${r})"]${free}, ${L} [style*="background-color: rgb(${r})"]${free} { background: ${l} !important; }`);
  }
  for (const [d, l] of Object.entries(TEXT)) {
    const sel = `[style*="color: rgb(${rgb(d)})"]`;
    const list = [`${L} ${sel}:not([style*="background"])${free}`, ...surf.map((s) => `${L} ${sel}[style*="${s}"]${free}`)];
    out.push(`${list.join(", ")} { color: ${l} !important; }`);
  }
  // white text sitting on a remapped surface
  out.push(Object.keys(SURFACES).map((h) => `${L} [style*="color: rgb(255, 255, 255)"][style*="background: rgb(${rgb(h)})"]${free}`).join(", ") + " { color: #0f172a !important; }");
  const accent = ':not([style*="border-left: 3px"]):not([style*="border-left: 4px"]):not([style*="border-top: 3px"])';
  for (const [b, l] of Object.entries(BORDERS)) {
    const r = rgb(b);
    for (const side of ["border", "border-top", "border-bottom", "border-left", "border-right"]) {
      const prop = side === "border" ? "border-color" : `${side}-color`;
      out.push(`${L} [style*="${side}: 1px solid rgb(${r})"]${accent}${free}, ${L} [style*="${side}: 2px solid rgb(${r})"]${accent}${free} { ${prop}: ${l} !important; }`);
    }
  }
  return out.join("\n");
}

let mq = null;
let current = "dark";
const onDevice = () => { if (current === "auto") paint("auto"); };
function paint(theme) {
  const on = resolveTheme(theme) === "light";
  const root = document.documentElement;
  root.classList.toggle("light", on);
  root.dataset.theme = on ? "light" : "dark";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", on ? "#eef1f6" : "#080d13");
}
// Applies a choice and remembers it on this device.
export function applyTheme(theme, { save = true } = {}) {
  current = normalizeTheme(theme);
  if (save) saveTheme(current);
  if (!hasDoc()) return current;
  if (!document.getElementById("rk-theme-css")) {
    const s = document.createElement("style");
    s.id = "rk-theme-css";
    s.textContent = buildInlineCss();
    document.head.appendChild(s);
  }
  if (!mq) {
    try { mq = window.matchMedia("(prefers-color-scheme: light)"); mq.addEventListener?.("change", onDevice); } catch { mq = null; }
  }
  paint(current);
  return current;
}
