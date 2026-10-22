// Phone mode: the same game laid out for phones (a slim header, a bottom tab bar, a big action
// button above it and a "More" sheet for everything else), as in the football game.
// On for the phone entry (published at /Rink_GM/mobile/, which build-artifact.mjs marks with
// <meta name="rink-entry" content="mobile">), with ?mobile in the address, and on any screen
// 760px wide or less (?desktop keeps the computer layout there).
import { useEffect, useState } from "react";

const hasDoc = typeof document !== "undefined" && typeof window !== "undefined";
const search = hasDoc ? window.location.search || "" : "";
const entryMeta = hasDoc ? document.querySelector('meta[name="rink-entry"]')?.getAttribute("content") : null;

// The phone entry itself (or ?mobile): phone mode at any width, drawn at 90%.
export const MOBILE_ENTRY = hasDoc && (entryMeta === "mobile" || /[?&]mobile\b/.test(search) || /\/mobile\/(index\.html)?$/.test(window.location.pathname));
export const FORCE_DESKTOP = hasDoc && /[?&]desktop\b/.test(search);
export const MOBILE_SCALE = 0.9;
export const PHONE_QUERY = "(max-width: 760px)";

const narrow = () => {
  try { return !!window.matchMedia?.(PHONE_QUERY).matches; } catch { return false; }
};
export const isPhone = () => hasDoc && (MOBILE_ENTRY || (!FORCE_DESKTOP && narrow()));

// The computer layout of this page: /mobile/ goes back to the main page; elsewhere ?desktop.
// Same site, so the same saved league.
export function desktopUrl() {
  if (!hasDoc) return "./";
  const here = new URL(window.location.href);
  if (/\/mobile\/(index\.html)?$/.test(here.pathname)) return new URL("../?desktop", here).href;
  here.searchParams.delete("mobile");
  here.searchParams.set("desktop", "1");
  return here.href;
}
// The phone page: the published site has it next to this one at mobile/; anywhere else
// (a local server, the dev build) it's this page with ?mobile.
export function phoneUrl() {
  if (!hasDoc) return "mobile/";
  const here = new URL(window.location.href);
  if (/\/mobile\/(index\.html)?$/.test(here.pathname)) return here.href;
  if (document.querySelector('meta[name="rink-sw"]')) return new URL("mobile/", here).href.split("?")[0];
  here.searchParams.delete("desktop");
  here.searchParams.set("mobile", "1");
  return here.href;
}

if (hasDoc) {
  const root = document.documentElement;
  if (MOBILE_ENTRY) {
    root.classList.add("rk-mobile-entry");
    // Draw the whole game at 90% on phones, so screens hold a bit more and feel less crowded.
    // The browser widens the page to match (a 390px phone gets 433px of layout), so every size
    // scales together instead of each screen being shrunk by hand.
    const vp = document.querySelector('meta[name="viewport"]');
    if (vp) vp.setAttribute("content", `width=device-width, initial-scale=${MOBILE_SCALE}, viewport-fit=cover`);
  }
  const apply = () => root.classList.toggle("rk-phone", isPhone());
  apply();
  try { window.matchMedia?.(PHONE_QUERY).addEventListener?.("change", apply); } catch { /* old browsers: decided once */ }
}

// Re-renders when the window crosses the phone width (a desktop window made narrow, a tablet turned).
export function usePhone() {
  const [on, setOn] = useState(isPhone);
  useEffect(() => {
    if (!hasDoc || MOBILE_ENTRY) return undefined;
    let mq;
    try { mq = window.matchMedia(PHONE_QUERY); } catch { return undefined; }
    const up = () => setOn(isPhone());
    mq.addEventListener?.("change", up);
    up();
    return () => mq.removeEventListener?.("change", up);
  }, []);
  return on;
}

// Swipe between a hub's sections on phones, as in the football game. A clear sideways swipe
// (long, mostly horizontal, not starting in something that scrolls sideways or a form control)
// calls onSwipe(+1) for the next section or onSwipe(-1) for the previous one.
export function swipeHandlers(onSwipe) {
  let x0 = null, y0 = 0, t0 = 0;
  const scrollsX = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { if (e.matches?.("input, select, textarea, [data-noswipe]")) return true; if (e.scrollWidth > e.clientWidth + 4 && /auto|scroll/.test(getComputedStyle(e).overflowX)) return true; } return false; };
  return {
    onTouchStart: (e) => { const t = e.touches[0]; x0 = e.touches.length === 1 && !scrollsX(e.target) ? t.clientX : null; y0 = t.clientY; t0 = Date.now(); },
    onTouchEnd: (e) => {
      if (x0 == null) return;
      const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2 && Date.now() - t0 < 700) onSwipe(dx < 0 ? 1 : -1);
    },
  };
}
