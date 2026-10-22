// Ice time, situational units and line matching (Gridiron 2.73 snaps.js, 3.26 personnel.js
// situations, 3.19 matchups, for hockey). Pure helpers: the Lines screen edits these team
// fields, and the sim reads them through the small hooks in sim.js.
//
//   team.iceShares  { F: [4 %], D: [3 %] } or unset (the identity's defaults)
//   team.units      { OT: [3], EA: [6], LP: [5], DZ: [5], SO: [5] } player ids, null = staff pick
//   team.lineMatch  true / false / unset (unset: on for a Defensive identity)
// All three are optional, so old saves load as they were.
import { composites } from "./ratings.js";
import { isForward, isDefense, isGoalie } from "./constants.js";
import { IDENTITIES, identityOf, lineRoles } from "./roles.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---- Ice time (2.73) ----------------------------------------------------------------------
// The even-strength rotation the sim aims for, in whole percent (each group adds to 100).
export const DEFAULT_SHARES = { F: [...IDENTITIES.balanced.F], D: [...IDENTITIES.balanced.D] };
export const SHARE_MIN = 5, SHARE_MAX = 60;
export function iceShares(team) {
  const base = IDENTITIES[identityOf(team)];
  const own = team?.iceShares || {};
  const pick = (g, n) => (Array.isArray(own[g]) && own[g].length === n && own[g].every((v) => Number.isFinite(v)) ? own[g] : base[g]);
  return { F: norm(pick("F", 4)), D: norm(pick("D", 3)) };
}
function norm(list) {
  const t = list.reduce((s, v) => s + Math.max(0, v), 0) || 1;
  const out = list.map((v) => Math.round((Math.max(0, v) / t) * 100));
  out[0] += 100 - out.reduce((s, v) => s + v, 0);
  return out;
}
// The sim's fractions (0 to 1) for one group.
export const shareFractions = (team, g) => iceShares(team)[g].map((v) => v / 100);
// Set one line's share; the others give or take the difference in proportion, so the list
// keeps its order and still adds to 100.
export function setShare(team, g, i, value) {
  const cur = iceShares(team)[g];
  const v = clamp(Math.round(value), SHARE_MIN, SHARE_MAX);
  const rest = cur.reduce((s, x, k) => (k === i ? s : s + x), 0) || 1;
  const left = 100 - v;
  const next = cur.map((x, k) => (k === i ? v : Math.max(SHARE_MIN, (x / rest) * left)));
  team.iceShares = { ...iceShares(team), [g]: norm(next) };
  return team.iceShares[g];
}
export function resetShares(team) { delete team.iceShares; }

// ---- Line matching (3.19) -----------------------------------------------------------------
// Which forward line the coach sends out against the other team's top line (-1: no matching).
export function matchLine(team) {
  const on = team?.lineMatch ?? !!IDENTITIES[identityOf(team)].match;
  if (!on) return -1;
  const i = lineRoles(team).F.indexOf("checking");
  return i >= 0 ? i : 2;
}

// ---- Situational units (3.26) -------------------------------------------------------------
export const UNIT_KINDS = {
  OT: { name: "3-on-3 overtime", short: "OT 3-on-3", size: 3, shape: ["F", "F", "D"], desc: "Two forwards and a defenceman for regular-season overtime." },
  EA: { name: "Extra attacker", short: "6-on-5", size: 6, shape: ["F", "F", "F", "F", "D", "D"], desc: "Who goes out when the goalie is pulled." },
  LP: { name: "Protect the lead", short: "Lead", size: 5, shape: ["F", "F", "F", "D", "D"], desc: "Late in the third with a one- or two-goal lead." },
  DZ: { name: "D-zone faceoffs", short: "D-zone draw", size: 5, shape: ["C", "F", "F", "D", "D"], desc: "Five skaters for draws in your own end." },
  SO: { name: "Shootout order", short: "Shootout", size: 5, shape: ["S", "S", "S", "S", "S"], desc: "The first five shooters, in order." },
};
const score = {
  off: (p, c) => c.off * 0.7 + p.ovr * 0.3,
  def: (p, c) => c.def * 0.7 + p.ovr * 0.3,
  draw: (p, c) => c.fof * 0.8 + c.def * 0.2,
  so: (p, c) => c.dek + c.shoot,
  ot: (p, c) => c.off * 0.5 + c.skate * 0.3 + p.ovr * 0.2,
};
const LEAN = { OT: "ot", EA: "off", LP: "def", DZ: "def", SO: "so" };
// The staff's pick for one unit from the dressed skaters, keeping the user's own picks.
function fillUnit(kind, dressed, own) {
  const K = UNIT_KINDS[kind], used = new Set(), out = [];
  const ok = (id) => id && dressed.some((x) => x.p.id === id) && !used.has(id);
  const pool = (slot) => dressed.filter((x) => !used.has(x.p.id) && (slot === "S" || (slot === "D" ? isDefense(x.p.pos) : isForward(x.p.pos))));
  const by = (key) => (a, b) => score[key](b.p, b.c) - score[key](a.p, a.c);
  K.shape.forEach((slot, j) => {
    const mine = own?.[j];
    if (ok(mine)) { used.add(mine); out[j] = mine; return; }
    out[j] = null;
  });
  K.shape.forEach((slot, j) => {
    if (out[j]) return;
    const key = slot === "C" ? "draw" : LEAN[kind];
    const pick = pool(slot).sort(by(key))[0] || dressed.filter((x) => !used.has(x.p.id)).sort(by(key))[0];
    if (pick) { used.add(pick.p.id); out[j] = pick.p.id; }
  });
  return out;
}
// Every unit for a game, from the dressed skater ids. Returns { OT, EA, LP, DZ, SO, custom }.
export function gameUnits(league, team, dressedIds) {
  const dressed = dressedIds.map((id) => league.players[id]).filter((p) => p && !isGoalie(p.pos)).map((p) => ({ p, c: composites(p) }));
  const out = { custom: {} };
  for (const kind of Object.keys(UNIT_KINDS)) {
    const own = team?.units?.[kind];
    out[kind] = fillUnit(kind, dressed, own);
    out.custom[kind] = !!own?.some(Boolean);
  }
  return out;
}
// Put a player in (or take him out of) a unit spot. id null: back to the staff's pick.
export function setUnitSlot(team, kind, j, id) {
  const K = UNIT_KINDS[kind];
  if (!K || j < 0 || j >= K.size) return;
  team.units ||= {};
  const u = (team.units[kind] ||= Array(K.size).fill(null));
  const dup = u.indexOf(id);
  if (id && dup >= 0 && dup !== j) u[dup] = u[j];
  u[j] = id || null;
  if (!u.some(Boolean)) delete team.units[kind];
}
export function resetUnit(team, kind) { if (team.units) delete team.units[kind]; }
