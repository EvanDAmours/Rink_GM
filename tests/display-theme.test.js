import test from "node:test";
import assert from "node:assert/strict";
import { getTheme, saveTheme, resolveTheme, normalizeTheme, buildInlineCss } from "../src/ui/theme.js";
import { getDisplay, saveDisplay, displayZoom } from "../src/ui/display.js";

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };

test("theme choice is saved per device and survives blocked storage", () => {
  const s = mem();
  assert.equal(getTheme(s), "dark");
  assert.ok(saveTheme("light", s));
  assert.equal(getTheme(s), "light");
  saveTheme("auto", s);
  assert.equal(getTheme(s), "auto");
  saveTheme("neon", s);
  assert.equal(getTheme(s), "dark");
  assert.equal(getTheme(broken), "dark");
  assert.equal(saveTheme("light", broken), false);
  assert.equal(normalizeTheme(undefined), "dark");
});

test("auto follows the device", () => {
  assert.equal(resolveTheme("auto", true), "light");
  assert.equal(resolveTheme("auto", false), "dark");
  assert.equal(resolveTheme("light", false), "light");
  assert.match(buildInlineCss(), /html\.light/);
});

test("display size is saved and phones are never scaled", () => {
  const s = mem();
  assert.equal(getDisplay(s), "auto");
  saveDisplay("laptop", s);
  assert.equal(getDisplay(s), "laptop");
  assert.equal(getDisplay(broken), "auto");
  assert.equal(displayZoom("laptop", 1440, 900), 0.9);
  assert.equal(displayZoom("desktop", 1440, 900), 1.2);
  assert.equal(displayZoom("desktop", 390, 844), 1);
  assert.equal(displayZoom("desktop", 1440, 900, true), 1);
  assert.equal(displayZoom("auto", 1920, 1080), 1.15);
  assert.equal(displayZoom("auto", 1440, 800), 0.92);
});
