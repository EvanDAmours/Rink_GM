// Roles, slot fit and position moves (Gridiron 3.19 roles.js, 1.56 dline.js, 1.53/1.67 positions.js,
// for hockey).
//
// Slot fit: every skater is rated for the spot he fills, not only his listed position.
//   Wing to the other wing is cheap: free if he shoots on that side, -2 if not.
//   A centre on the wing loses a point; a winger at centre loses 2 to 6, by his faceoffs.
//   A defenceman on his off side is free if he shoots that way, -3 if not.
//   A forward on defence (or a defenceman up front) loses 6 to 14, by his defence (or offence).
// The sim uses the slot rating at even strength (sim.js applySlotFit), the Lines cards show it,
// and the staff fill holes with the best slot fit.
//
// Roles: each line, pair and unit has a role (scoring line, checking line, shutdown pair...),
// and each spot on it asks for something. A player's role fit is his OVR moved by how well his
// skills match what the spot asks for, and by his slot fit.
import { composites } from "./ratings.js";
import { isForward, isDefense, isGoalie } from "./constants.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const SKATER_SLOTS = ["LW", "C", "RW", "LD", "RD"];
const SIDE = { LW: "L", RW: "R", LD: "L", RD: "R" };

// How many rating points a player gives up in this slot (0 or less).
export function slotFit(p, slot) {
  if (!p || !slot) return 0;
  if (slot === "G") return isGoalie(p.pos) ? 0 : -40;
  if (isGoalie(p.pos)) return -40;
  if (p.pos === slot) return 0;
  const c = composites(p);
  const shoots = p.shoots || (SIDE[p.pos] === "R" ? "R" : "L");
  if (isForward(p.pos) && isForward(slot)) {
    if (slot === "C") return -Math.round(clamp((86 - (c.fof ?? 70)) / 6, 2, 6));
    if (p.pos === "C") return -1;
    return shoots === SIDE[slot] ? 0 : -2;
  }
  if (isDefense(p.pos) && isDefense(slot)) return shoots === SIDE[slot] ? 0 : -3;
  if (isForward(p.pos)) return -Math.round(clamp(6 + (80 - c.def) / 3, 6, 14));
  return -Math.round(clamp(6 + (80 - c.off) / 3, 6, 14)) - (slot === "C" ? 2 : 0);
}
export const slotRating = (p, slot) => (p ? clamp(p.ovr + slotFit(p, slot), 40, 99) : 0);
// "free" (no cost), "cheap" (1-2 points) or "costly", for the move previews.
export const moveCost = (p, slot) => { const f = -slotFit(p, slot); return f === 0 ? "free" : f <= 2 ? "cheap" : "costly"; };

// ---- Position moves (1.53) ----------------------------------------------------------------
// "Move to": he plays the new position from now on, re-rated by his slot fit there. The move
// remembers where he came from, so moving him back restores his old rating exactly (growth
// since is kept). ovrOffset moves with it, so later re-rates (camp, development) keep the shift.
export function canMove(p, to) {
  return !!p && !isGoalie(p.pos) && SKATER_SLOTS.includes(to) && to !== p.pos;
}
export function movePreview(p, to) {
  if (!canMove(p, to)) return null;
  const from = p.posFrom;
  const shift = from ? (from.pos === to ? -from.shift : -from.shift + slotFit({ ...p, pos: from.pos }, to)) : slotFit(p, to);
  return { to, ovr: clamp(p.ovr + shift, 40, 99), shift, back: from?.pos === to };
}
export function movePosition(league, pid, to) {
  const p = league.players[pid];
  const pv = movePreview(p, to);
  if (!pv) return { ok: false, msg: "Pick another skater position." };
  const origin = p.posFrom?.pos || p.pos;
  const totalShift = (p.posFrom?.shift || 0) + pv.shift;
  p.ovr = pv.ovr;
  p.ovrOffset = (p.ovrOffset || 0) + pv.shift;
  p.pos = to;
  if (pv.back) delete p.posFrom;
  else p.posFrom = { pos: origin, shift: totalShift };
  return { ok: true, msg: pv.back ? `${p.name} moves back to ${to}. His rating is restored to ${p.ovr}.` : `${p.name} moves to ${to}. He rates ${p.ovr} there${pv.shift ? ` (${pv.shift > 0 ? "+" : ""}${pv.shift})` : ""}.` };
}

// ---- Roles (3.19) -------------------------------------------------------------------------
// What each role asks for: weights over the sim composites.
export const ROLES = {
  SNIPER: { name: "Sniper", wants: "A shot and the hands to get it off.", w: { shoot: 3, hands: 1.5, off: 1, skate: 0.5 } },
  PLAYC: { name: "Playmaking C", wants: "Vision, passing and the draw.", w: { pass: 3, hands: 1.5, fof: 1.2, off: 0.8 } },
  SCORE: { name: "Scoring wing", wants: "Offence: shot, hands and pace.", w: { off: 2.5, shoot: 1.5, skate: 1 } },
  TWOC: { name: "Two-way C", wants: "Draws, defence and enough offence.", w: { fof: 1.5, def: 2, pass: 1, off: 1 } },
  NETF: { name: "Net-front", wants: "Size, strength and hands in tight.", w: { phys: 2.5, hands: 1.5, shoot: 1 } },
  CHECK: { name: "Checker", wants: "Defence, effort and forechecking.", w: { def: 2.5, phys: 1.5, skate: 1 } },
  SHUTC: { name: "Shutdown C", wants: "Defence and faceoffs above all.", w: { def: 2.5, fof: 2, phys: 0.5 } },
  ENERGY: { name: "Energy", wants: "Legs and hits: change the game's pace.", w: { skate: 2, phys: 2.5, def: 0.5 } },
  PUCKD: { name: "Puck mover", wants: "Skating and the first pass.", w: { pass: 2.5, skate: 2, hands: 1 } },
  SHUTD: { name: "Shutdown D", wants: "Defence, blocks and strength.", w: { def: 3, blk: 1.5, phys: 1 } },
  TWOD: { name: "Two-way D", wants: "A bit of everything.", w: { def: 2, pass: 1.5, skate: 1 } },
  PHYSD: { name: "Physical D", wants: "Size, hits and clearing the crease.", w: { phys: 3, def: 1.5, blk: 1 } },
  PPQB: { name: "PP quarterback", wants: "Passing, vision and a shot from the point.", w: { pass: 3, shoot: 1.5, hands: 1 } },
  PPF: { name: "PP forward", wants: "Offence with the extra man.", w: { off: 2.5, shoot: 1.5, pass: 1 } },
  PK: { name: "Penalty killer", wants: "Defence, blocks and discipline.", w: { def: 3, blk: 1, skate: 1, dsc: 0.5 } },
};
// The role a line or pair plays, and what each of its spots asks for.
export const LINE_ROLES = {
  scoring: { name: "Scoring line", short: "Scoring", slots: ["SNIPER", "PLAYC", "SCORE"] },
  twoway: { name: "Two-way line", short: "Two-way", slots: ["SCORE", "TWOC", "NETF"] },
  checking: { name: "Checking line", short: "Checking", slots: ["CHECK", "SHUTC", "CHECK"] },
  energy: { name: "Energy line", short: "Energy", slots: ["ENERGY", "TWOC", "ENERGY"] },
};
export const PAIR_ROLES = {
  shutdown: { name: "Shutdown pair", short: "Shutdown", slots: ["SHUTD", "TWOD"] },
  puck: { name: "Puck-moving pair", short: "Puck-moving", slots: ["PUCKD", "TWOD"] },
  physical: { name: "Physical pair", short: "Physical", slots: ["PHYSD", "TWOD"] },
};
export const DEFAULT_LINE_ROLES = { F: ["scoring", "twoway", "checking", "energy"], D: ["shutdown", "puck", "physical"] };
export function lineRoles(team) {
  const r = team?.lineRoles || {};
  return {
    F: DEFAULT_LINE_ROLES.F.map((d, i) => (LINE_ROLES[r.F?.[i]] ? r.F[i] : d)),
    D: DEFAULT_LINE_ROLES.D.map((d, i) => (PAIR_ROLES[r.D?.[i]] ? r.D[i] : d)),
  };
}
// The role key a slot asks for. g: "F" | "D" | "PP" | "PK"; i: line; j: spot.
export function slotRole(team, g, i, j, p) {
  const R = lineRoles(team);
  if (g === "F") return LINE_ROLES[R.F[i]]?.slots[j] || "SCORE";
  if (g === "D") return PAIR_ROLES[R.D[i]]?.slots[j] || "TWOD";
  if (g === "PP") return p && isDefense(p.pos) ? "PPQB" : "PPF";
  if (g === "PK") return "PK";
  return null;
}
const GENERIC = { F: { off: 1, def: 1, pass: 0.5, skate: 0.5 }, D: { def: 1.5, pass: 0.75, skate: 0.5, off: 0.5 } };
const mix = (c, w) => { let s = 0, t = 0; for (const k in w) { s += (c[k] ?? 70) * w[k]; t += w[k]; } return t ? s / t : 70; };
// A player's rating in a role: his OVR, moved by how much better (or worse) his skills fit what
// the role asks for than a generic skater's, and by his slot fit at pos.
export function roleFit(p, role, pos) {
  if (!p || isGoalie(p.pos) || !ROLES[role]) return p?.ovr ?? 0;
  const c = composites(p);
  const lean = mix(c, ROLES[role].w) - mix(c, GENERIC[isDefense(p.pos) ? "D" : "F"]);
  return clamp(Math.round(p.ovr + lean * 0.6 + (pos ? slotFit(p, pos) : 0)), 40, 99);
}
// His best roles, for the player card: [{ role, name, fit }], best first.
export function bestRoles(p, n = 3) {
  if (!p || isGoalie(p.pos)) return [];
  const keys = isDefense(p.pos) ? ["PUCKD", "SHUTD", "TWOD", "PHYSD", "PPQB", "PK"] : ["SNIPER", "PLAYC", "SCORE", "TWOC", "NETF", "CHECK", "SHUTC", "ENERGY", "PPF", "PK"];
  return keys.map((role) => ({ role, name: ROLES[role].name, fit: roleFit(p, role) })).sort((a, b) => b.fit - a.fit).slice(0, n);
}

// ---- Team identity (3.19) -----------------------------------------------------------------
// How the club wants to play. It sets the default ice time by line (the sliders start here) and
// what the coaches lean toward when they pick the game plan.
export const IDENTITIES = {
  balanced: { name: "Balanced", icon: "⚖️", desc: "Roll four lines. No lean.", F: [32, 28, 23, 17], D: [39, 34, 27] },
  skill: { name: "Skill", icon: "✨", desc: "Ride the top six and cycle for the best look.", F: [35, 30, 21, 14], D: [41, 34, 25], plan: { attack: "cycle" } },
  speed: { name: "Speed", icon: "💨", desc: "Attack off the rush and push the pace.", F: [33, 29, 22, 16], D: [40, 34, 26], plan: { attack: "rush" } },
  heavy: { name: "Heavy", icon: "🪨", desc: "Dump it in, forecheck hard, wear them down.", F: [30, 27, 24, 19], D: [38, 34, 28], plan: { forecheck: "aggressive", attack: "shoot" } },
  defensive: { name: "Defensive", icon: "🛡️", desc: "Trap the neutral zone and lean on the checkers.", F: [30, 27, 25, 18], D: [39, 34, 27], plan: { neutral: "trap" }, match: true },
};
export const identityOf = (team) => (IDENTITIES[team?.identity] ? team.identity : "balanced");
