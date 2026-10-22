// Display size, as in the football game: the whole game scaled to fit the screen. Auto picks by
// the window (laptops a bit smaller so screens fit without scrolling, big desktops a bit larger so
// nothing looks tiny); Laptop and Desktop force one. Phones are never scaled. Saved per device.
const KEY = "rk_display";
export const DISPLAYS = [["auto", "Auto"], ["laptop", "Laptop"], ["desktop", "Desktop"]];
const ZOOM = { laptop: 0.9, desktop: 1.2 };
const store = () => { try { return globalThis.localStorage || null; } catch { return null; } };

export function normalizeDisplay(v) { return ZOOM[v] ? v : "auto"; }
export function getDisplay(storage = store()) {
  try { return normalizeDisplay(storage?.getItem(KEY)); } catch { return "auto"; }
}
export function saveDisplay(d, storage = store()) {
  try { storage?.setItem(KEY, normalizeDisplay(d)); return true; } catch { return false; }
}
// The scale a setting means on a window of this size (phones and the phone layout: always 1).
export function displayZoom(d, w = 1440, h = 900, phone = false) {
  if (phone || w < 900) return 1;
  const k = normalizeDisplay(d);
  if (ZOOM[k]) return ZOOM[k];
  if (w >= 1800 && h >= 1000) return 1.15;
  if (w <= 1600 && h < 860) return 0.92;
  return 1;
}
let current = "auto";
let bound = false;
function paint() {
  const root = document.documentElement;
  const z = displayZoom(current, window.innerWidth, window.innerHeight, root.classList.contains("rk-phone"));
  root.style.zoom = z === 1 ? "" : String(z);
  // fill the window at any scale: 100vh means the unscaled window, so divide it back out
  root.style.setProperty("--vh", `${100 / z}vh`);
  root.dataset.display = current;
}
export function applyDisplay(d, { save = true } = {}) {
  current = normalizeDisplay(d);
  if (save) saveDisplay(current);
  if (typeof document === "undefined" || typeof window === "undefined") return current;
  paint();
  if (!bound) { bound = true; window.addEventListener("resize", paint); }
  return current;
}
