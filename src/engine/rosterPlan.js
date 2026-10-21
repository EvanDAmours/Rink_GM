// Build your 23 (Gridiron GM 3.7's Build your 53, translated to hockey): the off-season checklist on
// Home and the Free Agency screen. A 23-man NHL roster split by position with a typical count for
// each, how many you have signed, and the best free agent still out there at each spot with his ask.
// In the draft and re-sign week it counts only players signed for next season, so a deal that is
// running out shows up as a hole to fill.
import { MAX_ROSTER } from "./constants.js";
import { capSpace } from "./roster.js";
import { faAsk } from "./offseason.js";

// A typical NHL 23: thirteen forwards, eight defencemen, two goalies.
export const PLAN = [
  { key: "C", label: "Centers", pos: ["C"], want: 5 },
  { key: "LW", label: "Left wings", pos: ["LW"], want: 4 },
  { key: "RW", label: "Right wings", pos: ["RW"], want: 4 },
  { key: "LD", label: "Left defense", pos: ["LD"], want: 4 },
  { key: "RD", label: "Right defense", pos: ["RD"], want: 4 },
  { key: "G", label: "Goalies", pos: ["G"], want: 2 },
];
export const PLAN_PHASES = new Set(["draft", "resign", "freeagency"]);

// Signed for next season: during the draft his current deal must run past this season; from re-sign
// week on (contracts have already rolled over) any signed deal counts. A pending extension counts.
export function signedNext(league, p) {
  if (!p || p.signed === false) return false;
  if (p.extension) return true;
  return league.phase === "draft" ? p.yrs >= 2 : p.yrs >= 1;
}

// Returns { count, target, open, room, rows }, rows in PLAN order, each { key, label, want, have,
// short, top (best OVR, 0 if none), best (top free agent or null), ask (his AAV), pos }.
export function rosterPlan(league, team = league.teams[league.userTid]) {
  const mine = team.roster.map((id) => league.players[id]).filter((p) => signedNext(league, p));
  const fa = league.freeAgents.map((id) => league.players[id]).filter((p) => p && p.tid === -1 && p.signed !== false);
  const rows = PLAN.map((g) => {
    const have = mine.filter((p) => g.pos.includes(p.pos));
    const best = fa.filter((p) => g.pos.includes(p.pos)).sort((a, b) => b.ovr - a.ovr || a.age - b.age)[0] || null;
    return { key: g.key, label: g.label, want: g.want, have: have.length, short: Math.max(0, g.want - have.length), top: Math.max(0, ...have.map((p) => p.ovr)), best, ask: best ? faAsk(league, best).aav : null, pos: g.pos[0] };
  });
  return { count: mine.length, target: MAX_ROSTER, open: Math.max(0, MAX_ROSTER - mine.length), room: capSpace(league, team), rows };
}
