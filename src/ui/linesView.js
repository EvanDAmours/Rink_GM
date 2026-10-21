// Pure helpers for the Lines screen (rink and list views), like the football game's depth chart:
// where every spot sits on the rink, how much ice each line gets, and names that fit under a
// spot. No React here, so the tests can check the layout without a browser.
import { isDefense, isGoalie } from "../engine/constants.js";
import { DEFAULT_SHARES, iceShares } from "../engine/situations.js";

// ---- Ice time ------------------------------------------------------------------------------
// The bench's even-strength rotation comes from the engine (situations.js: the club's sliders,
// or its identity's defaults; sim.js keeps the same default), the power-play split (PP1 takes 65
// of every 115 seconds while it's fresh) and the penalty kill's even rotation every 38 seconds.
export const ES_SHARE = { F: DEFAULT_SHARES.F.map((v) => v / 100), D: DEFAULT_SHARES.D.map((v) => v / 100) };
export const PP_SHARE = [65 / 115, 50 / 115];
export const PK_SHARE = [0.5, 0.5];

// Share of ice time (whole percent) a unit gets: kind "F" | "D" | "PP" | "PK", index i. With a
// team, the even-strength shares are that club's own.
export function iceShare(kind, i, team) {
  if (team && (kind === "F" || kind === "D")) { const v = iceShares(team)[kind][i]; return v ?? 0; }
  const list = kind === "PP" ? PP_SHARE : kind === "PK" ? PK_SHARE : ES_SHARE[kind];
  return list && list[i] != null ? Math.round(list[i] * 100) : 0;
}

// Starter and backup share of starts from the starter's rest share (0 to 1).
export function goalieShare(rest) {
  const b = Math.round(Math.max(0, Math.min(1, Number(rest) || 0)) * 100);
  return [100 - b, b];
}

// ---- Names ---------------------------------------------------------------------------------
const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;
const PARTICLE = /^(st\.?|de|del|della|la|le|van|von|da|di|der|den|af|mac)$/i;
// "Connor McDavid" -> "McDavid", "Martin St. Louis" -> "St. Louis", "Tim Stützle Jr." -> "Stützle".
export function lastName(name) {
  const w = String(name || "").trim().split(/\s+/).filter((x) => x && !SUFFIX.test(x));
  if (w.length < 2) return w[0] || "";
  const k = w.length - 2;
  return k >= 1 && PARTICLE.test(w[k]) ? w.slice(k).join(" ") : w[w.length - 1];
}
// Everything before the surname: "Connor" (or "" for a one-word name).
export function firstName(name) {
  const n = String(name || "").trim(), l = lastName(n);
  const i = n.lastIndexOf(l);
  return i > 0 ? n.slice(0, i).trim() : "";
}
// A full name, or "C. McDavid" when the full name is longer than `max` characters.
export function listName(name, max = 22) {
  const n = String(name || "").trim();
  if (n.length <= max) return n;
  const f = firstName(n);
  return f ? `${f[0]}. ${lastName(n)}` : n;
}
// The type size class for a surname under a rink spot: long names step down, so they fit.
export const nameSize = (last) => (String(last).length <= 9 ? "" : String(last).length <= 11 ? "m" : "s");

// ---- The rink ------------------------------------------------------------------------------
// The rink is drawn two ways: landscape on wider screens (640 x 336 at full size, attacking to the
// right) and portrait on phones (attacking up, a fixed 540px tall). Positions are percentages of
// the rink; each spot is centred on its rating ring, with the position chip and the name below.
export const RINK = { land: { w: 640, h: 336 }, port: { w: 358, h: 540 } };
// How far a spot reaches from its ring centre (px): up to the ring top, down to the name.
export const FOOT = {
  land: { up: 18, down: 18 + 2 + 14 + 2 + 13, small: { up: 13, down: 13 + 2 + 14 + 2 + 13 } },
  port: { up: 15, down: 15 + 2 + 13 + 2 + 12, small: { up: 12, down: 12 + 2 + 13 + 2 + 12 } },
};

const F_POS = ["LW", "C", "RW"];
const D_POS = ["LD", "RD"];
// Landscape: the goalie in the crease on the left, the pairs across the defensive half (P1 to P3),
// the lines across the attacking half (L1 to L4). Left wings on top, right wings below.
const LAND = { x: { G: 7, D: [18.8, 30.4, 42], F: [54.6, 66.2, 77.8, 89.4] }, y: { LW: 15, C: 47, RW: 79, LD: 31, RD: 63, G: 47, G2: 79 }, w: { F: 11.2, D: 11.2, G: 11 } };
// Portrait: one row per unit, top to bottom: L1 to L4, P1 to P3, then the crease. Left wings on
// the left. The starter is in the crease with the backup beside him.
const PORT = { x: { LW: 30, C: 57, RW: 84, LD: 43.5, RD: 70.5, G: 57, G2: 84 }, y: { F: [5.5, 17.2, 28.9, 40.6], D: [54, 65.7, 77.4], G: 90 }, w: 26 };
const TAG_LAND_Y = 3.6, TAG_PORT_X = 7;

// Every even-strength spot: { key, g, i, j, pos, unit, small, land: [x, y, w], port: [x, y, w] }.
// g/i/j address the slot in team.lines (F[i][j], D[i][j], G[i]).
export function esSpots(L) {
  const out = [];
  (L?.F || []).forEach((line, i) => line.forEach((_, j) => {
    const pos = F_POS[j];
    out.push({ key: `F${i}${j}`, g: "F", i, j, pos, unit: `L${i + 1}`, land: [LAND.x.F[i], LAND.y[pos], LAND.w.F], port: [PORT.x[pos], PORT.y.F[i], PORT.w] });
  }));
  (L?.D || []).forEach((pair, i) => pair.forEach((_, j) => {
    const pos = D_POS[j];
    out.push({ key: `D${i}${j}`, g: "D", i, j, pos, unit: `P${i + 1}`, land: [LAND.x.D[i], LAND.y[pos], LAND.w.D], port: [PORT.x[pos], PORT.y.D[i], PORT.w] });
  }));
  out.push({ key: "G0", g: "G", i: 0, pos: "G", unit: "G", land: [LAND.x.G, LAND.y.G, LAND.w.G], port: [PORT.x.G, PORT.y.G, PORT.w] });
  out.push({ key: "G1", g: "G", i: 1, pos: "G", unit: "G", small: true, land: [LAND.x.G, LAND.y.G2, LAND.w.G], port: [PORT.x.G2, PORT.y.G, PORT.w] });
  return out;
}

// The unit labels on the rink (L1, P1, G): over each column in landscape, beside each row in portrait.
export function esTags(L) {
  return [
    ...(L?.F || []).map((_, i) => ({ key: `L${i + 1}`, kind: "F", i, land: [LAND.x.F[i], TAG_LAND_Y], port: [TAG_PORT_X, PORT.y.F[i]] })),
    ...(L?.D || []).map((_, i) => ({ key: `P${i + 1}`, kind: "D", i, land: [LAND.x.D[i], TAG_LAND_Y], port: [TAG_PORT_X, PORT.y.D[i]] })),
    { key: "G", kind: "G", i: 0, land: [LAND.x.G, TAG_LAND_Y], port: [TAG_PORT_X, PORT.y.G] },
  ];
}

// The band behind a highlighted unit: a column in landscape, a row in portrait (percent boxes).
export function esBand(unit) {
  const m = /^([LP])(\d)$/.exec(unit || "");
  const land = (x, w) => ({ x: x - w / 2, y: 0, w, h: 100 });
  const port = (y) => ({ x: 0, y: y - ((FOOT.port.up + 5) / RINK.port.h) * 100, w: 100, h: ((FOOT.port.up + FOOT.port.down + 9) / RINK.port.h) * 100 });
  if (unit === "G") return { land: land(LAND.x.G, 11.6), port: port(PORT.y.G) };
  if (!m) return null;
  const i = Number(m[2]) - 1;
  if (m[1] === "L" && LAND.x.F[i] != null) return { land: land(LAND.x.F[i], 11.6), port: port(PORT.y.F[i]) };
  if (m[1] === "P" && LAND.x.D[i] != null) return { land: land(LAND.x.D[i], 11.6), port: port(PORT.y.D[i]) };
  return null;
}

// Special teams: each unit gets its own half of the rink. Unit 1 attacks (or defends) the left end
// in landscape and the top end in portrait; unit 2 the other end. d is depth from the goal line
// (0) to the red line (1); u is across the ice (0 to 100).
// (Landscape spots hang their name below the ring, so across the ice there runs 15 to 79 there;
// v is the portrait position across, where a spot is the same width either side.)
const PP_SPOT = { P0: { d: 0.72, u: 47, v: 50 }, P1: { d: 0.72, u: 27, v: 28 }, P2: { d: 0.72, u: 67, v: 72 }, FL: { d: 0.36, u: 15, v: 16 }, FR: { d: 0.36, u: 79, v: 84 }, NF: { d: 0.12, u: 47, v: 50 }, BU: { d: 0.44, u: 47, v: 50 } };
const PK_SPOT = { DL: { d: 0.2, u: 27, v: 30 }, DR: { d: 0.2, u: 67, v: 70 }, FL: { d: 0.52, u: 27, v: 30 }, FR: { d: 0.52, u: 67, v: 70 }, X: { d: 0.82, u: 47, v: 50 } };
const CLASH = { P0: ["P1", "P2"], P1: ["P0"], P2: ["P0"] };
const prefs = (kind, nD) => kind === "PP"
  ? { D: nD <= 1 ? ["P0", "P1", "P2", "BU", "NF"] : ["P1", "P2", "BU", "NF", "FL", "FR"], F: ["FL", "FR", "NF", "BU", "P0", "P1", "P2"] }
  : { D: ["DL", "DR", "FL", "FR", "X"], F: ["FL", "FR", "DL", "DR", "X"] };
const GOAL = 6, RED = 50; // landscape goal line and red line (% of width)
const PGOAL = 4, PRED = 50; // portrait goal line and red line (% of height)
const SW = { land: 11, port: 26 };

// Positions for one PP or PK unit. defense: one boolean per player (is he a defenceman).
// Points go to defencemen on the power play; the low box to defencemen on the kill.
export function stSpots(kind, half, defense) {
  const nD = defense.filter(Boolean).length;
  const pr = prefs(kind, nD), table = kind === "PP" ? PP_SPOT : PK_SPOT;
  const used = new Set(), at = [];
  const take = (list) => list.find((k) => !used.has(k) && !(CLASH[k] || []).some((c) => used.has(c)));
  const order = defense.map((d, j) => ({ d, j })).sort((a, b) => Number(b.d) - Number(a.d));
  for (const { d, j } of order) {
    const k = take(d ? pr.D : pr.F) || take(Object.keys(table));
    if (k) used.add(k);
    at[j] = k || null;
  }
  return at.map((k, j) => {
    const s = table[k] || { d: 0.5, u: 47, v: 50 };
    const lx = half === 0 ? GOAL + s.d * (RED - GOAL) : 100 - GOAL - s.d * (RED - GOAL);
    const py = half === 0 ? PGOAL + s.d * (PRED - PGOAL) : 100 - PGOAL - s.d * (PRED - PGOAL);
    return { key: `${kind}${half}${j}`, g: kind, i: half, j, spot: k, land: [lx, s.u, SW.land], port: [s.v, py, SW.port] };
  });
}

// The label for each half on the special-teams rink: over each half in landscape, either side of
// the red line on the left in portrait (the corners are rounded off).
export function stTags(kind) {
  return [0, 1].map((i) => ({ key: `${kind}${i + 1}`, kind, i, land: [i === 0 ? 28 : 72, TAG_LAND_Y], port: [TAG_PORT_X + 2, i === 0 ? 45.5 : 54.5] }));
}
export function stBand(i) {
  return { land: { x: i === 0 ? 0 : 50, y: 0, w: 50, h: 100 }, port: { x: 0, y: i === 0 ? 0 : 50, w: 100, h: 50 } };
}

// Does a player play this slot naturally? (Wingers play either wing; a centre is a centre.)
export function offPosition(p, pos) {
  if (!p || !pos || pos === "PP" || pos === "PK") return false;
  if (pos === "G") return !isGoalie(p.pos);
  if (pos === "LD" || pos === "RD") return !isDefense(p.pos);
  if (pos === "C") return p.pos !== "C";
  return isDefense(p.pos) || isGoalie(p.pos);
}

// ---- The plan strip ------------------------------------------------------------------------
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");
// "Aggressive forecheck · Trap · Cycle": the game plan in a few words.
export function planWords(plan) {
  if (!plan) return "";
  const fc = plan.forecheck === "aggressive" ? "Aggressive forecheck" : "Balanced forecheck";
  const nz = plan.neutral === "trap" ? "Trap" : "Balanced neutral zone";
  const at = plan.attack && plan.attack !== "balanced" ? `${cap(plan.attack)} attack` : "Balanced attack";
  return `${fc} · ${nz} · ${at}`;
}
