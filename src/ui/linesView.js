// Pure helpers for the Lines screen: how much ice each line gets, short names, off-position spots. No React here, so the tests can check the layout without a browser.
import { isDefense, isGoalie } from "../engine/constants.js";
import { DEFAULT_SHARES, iceShares } from "../engine/situations.js";
import { PP_SPLIT } from "../engine/sim.js";

// ---- Ice time ------------------------------------------------------------------------------
// The bench's even-strength rotation comes from the engine (situations.js: the club's sliders,
// or its identity's defaults; sim.js keeps the same default), the power-play split (sim.js PP_SPLIT:
// PP1 takes 80 of every 115 seconds while it's fresh) and the penalty kill's even rotation every 38 seconds.
export const ES_SHARE = { F: DEFAULT_SHARES.F.map((v) => v / 100), D: DEFAULT_SHARES.D.map((v) => v / 100) };
export const PP_SHARE = [PP_SPLIT.first / PP_SPLIT.cycle, (PP_SPLIT.cycle - PP_SPLIT.first) / PP_SPLIT.cycle];
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
