// Preseason training camp, as in Gridiron GM: exhibition games with a practice report, a rookie
// dev camp, a one-player training focus, a camp-wide focus group that pays off at season's end,
// and position battles. Boosts are real player development (attributes move, OVR is recomputed),
// bounded and bought with Season Points; nothing touches another club or the regular season.
import { stream, clamp } from "./rng.js";
import { createGame, simToEnd } from "./sim.js";
import { progressAttributes, computeOvr } from "./ratings.js";
import { isGoalie, isDefense } from "./constants.js";
import { spendSP, ensurePulse } from "./clubPulse.js";
import { TRAINING } from "./franchise.js";
import { logTx } from "./roster.js";

export const CAMP_GAMES = 4;
export const CAMP_COSTS = { devCamp: 3, focus: 2, battle: 1 };
export const CAMP_GROUPS = {
  offense: { name: "🎯 Offense", desc: "Forwards", test: (p) => !isGoalie(p.pos) && !isDefense(p.pos) },
  defense: { name: "🛡️ Defense", desc: "Defensemen", test: (p) => isDefense(p.pos) },
  goaltending: { name: "🥅 Goaltending", desc: "Goalies", test: (p) => isGoalie(p.pos) },
};
export const CAMP_BATTLE_POS = ["C", "LW", "RW", "LD", "RD", "G"];

export function ensureCamp(league) {
  const t = league.teams[league.userTid];
  if (!t.camp || t.camp.year !== league.year) t.camp = { year: league.year, games: [], risk: false, devCamp: null, focused: [], group: t.camp?.year === league.year ? t.camp.group : null, battles: {} };
  return t.camp;
}
const campOpen = (league) => league.phase === "preseason";
const mine = (league) => {
  const t = league.teams[league.userTid];
  return [...t.roster, ...t.prospects].map((id) => league.players[id]).filter(Boolean);
};
// Move a player's rating by n OVR through his attributes (the same path seasonal development uses).
function develop(p, n) {
  const before = p.ovr;
  progressAttributes(p, n);
  if (p.ovr < before) p.ovr = before;
  p.pot = Math.max(p.pot, p.ovr);
  p.campGain = (p.campGain || 0) + (p.ovr - before);
  return p.ovr - before;
}

const GRADE = (score) => (score >= 9 ? "A+" : score >= 7 ? "A" : score >= 5.5 ? "B+" : score >= 4 ? "B" : score >= 2.5 ? "C" : score >= 1 ? "D" : "F");

// One preseason exhibition: the real game engine, no standings, no stats, optional injury risk.
export function playExhibition(league) {
  if (!campOpen(league)) return { ok: false, msg: "Exhibition games are played in the preseason." };
  const camp = ensureCamp(league);
  if (camp.games.length >= CAMP_GAMES) return { ok: false, msg: "All four preseason games have been played." };
  const t = league.teams[league.userTid];
  const r = stream(`${league.year}|exh|${camp.games.length}`);
  const opps = league.teams.filter((x) => x.id !== t.id);
  const opp = opps[r.int(0, opps.length - 1)];
  const home = camp.games.length % 2 === 0;
  const s = createGame(league, home ? t : opp, home ? opp : t, { exhibition: true, userTid: t.id });
  simToEnd(s);
  const us = home ? "h" : "a";
  const scored = { us: s.score[us], them: s.score[us === "h" ? "a" : "h"] };
  const lines = Object.entries(s.box)
    .map(([id, b]) => ({ p: league.players[id], b }))
    .filter(({ p }) => p && p.tid === t.id && !isGoalie(p.pos))
    .map(({ p, b }) => ({ id: p.id, name: p.name, pos: p.pos, ovr: p.ovr, g: b.g || 0, a: b.a || 0, sog: b.sog || 0, pm: b.pm || 0, score: (b.g || 0) * 3 + (b.a || 0) * 2 + (b.sog || 0) * 0.4 + (b.pm || 0) * 0.5 + (b.hit || 0) * 0.2 + (b.blk || 0) * 0.3 }));
  for (const [id, gb] of Object.entries(s.gbox)) {
    const p = league.players[id];
    if (p?.tid !== t.id || !gb.sa) continue;
    lines.push({ id, name: p.name, pos: p.pos, ovr: p.ovr, sv: gb.sa - gb.ga, sa: gb.sa, score: ((gb.sa - gb.ga) / gb.sa - 0.88) * 60 + 2 });
  }
  lines.sort((a, b) => b.score - a.score);
  lines.forEach((l) => (l.grade = GRADE(l.score)));
  // Standout young players bank a little development: best forward, defenseman and goalie.
  const bonuses = [];
  for (const [, test] of [["F", (l) => !isGoalie(l.pos) && !isDefense(l.pos)], ["D", (l) => isDefense(l.pos)], ["G", (l) => isGoalie(l.pos)]]) {
    const top = lines.find((l) => test(l) && league.players[l.id].age <= 27 && l.score >= 4);
    if (!top) continue;
    const p = league.players[top.id];
    p.campWork = (p.campWork || 0) + 1;
    if (p.campWork >= 2) {
      p.campWork = 0;
      develop(p, 1);
      bonuses.push({ name: p.name, pos: p.pos, grade: top.grade, gain: true });
    } else bonuses.push({ name: p.name, pos: p.pos, grade: top.grade, gain: false });
  }
  const hurt = [];
  if (camp.risk) {
    for (const id of t.roster) {
      const p = league.players[id];
      if (p && p.injury <= 0 && stream(`${league.year}|exhinj|${camp.games.length}|${id}`).chance(0.03)) {
        p.injury = 1 + stream(`${id}|exhlen|${league.year}`).int(0, 3);
        p.injuryNote = "preseason knock";
        hurt.push(p.name);
      }
    }
  }
  const game = { opp: opp.abbr, oppTid: opp.id, home, ...scored, ot: s.period > 3, lines: lines.slice(0, 8), bonuses, hurt };
  camp.games.push(game);
  return { ok: true, msg: `Preseason ${scored.us > scored.them ? "win" : "loss"}: ${scored.us}-${scored.them} vs ${opp.abbr}${hurt.length ? ` · injured: ${hurt.join(", ")}` : ""}.`, game };
}

export function devCampCandidates(league) {
  return mine(league).filter((p) => p.age <= 23 && p.injury <= 0).sort((a, b) => b.pot - a.pot || b.ovr - a.ovr).slice(0, 6);
}
export function runDevCamp(league, pid) {
  if (!campOpen(league)) return { ok: false, msg: "Dev camp runs in the preseason." };
  const camp = ensureCamp(league);
  if (camp.devCamp) return { ok: false, msg: "Dev camp is done for this year." };
  const p = league.players[pid];
  if (!p || !devCampCandidates(league).some((x) => x.id === pid)) return { ok: false, msg: "Choose one of your young players (23 or under)." };
  if (!spendSP(league, CAMP_COSTS.devCamp, `Dev camp: ${p.name}`)) return { ok: false, msg: `Dev camp costs ${CAMP_COSTS.devCamp} SP.` };
  const before = p.ovr;
  develop(p, 3);
  camp.devCamp = { pid, name: p.name, before, after: p.ovr };
  logTx(league, `🎓 Dev camp: ${p.name} ${before} → ${p.ovr} OVR`, [p.tid]);
  return { ok: true, msg: `🎓 Dev camp: ${p.name} ${before} → ${p.ovr} OVR.` };
}

export function runTrainingFocus(league, pid, skill) {
  if (!campOpen(league)) return { ok: false, msg: "Training focus is a preseason activity." };
  const camp = ensureCamp(league);
  const p = league.players[pid];
  const sk = TRAINING[skill];
  if (!p || p.tid !== league.userTid || !sk) return { ok: false, msg: "Choose a player and a skill." };
  if (isGoalie(p.pos) !== (skill === "goaltending")) return { ok: false, msg: "Choose a skill that fits his position." };
  if (camp.focused.includes(pid)) return { ok: false, msg: `${p.name} has already had his training focus this camp.` };
  if (!spendSP(league, CAMP_COSTS.focus, `Training focus: ${p.name}`)) return { ok: false, msg: `Training focus costs ${CAMP_COSTS.focus} SP.` };
  const before = p.ovr;
  for (const k of sk.keys) if (Number.isFinite(p.attrs[k])) p.attrs[k] = clamp(p.attrs[k] + 1.5, 40, 99);
  p.ovr = Math.max(before, Math.min(99, Math.max(40, computeOvr(p.attrs, p.type) + (p.ovrOffset || 0))));
  p.pot = Math.max(p.pot, p.ovr);
  p.campGain = (p.campGain || 0) + (p.ovr - before);
  camp.focused.push(pid);
  return { ok: true, msg: `🏋️ ${p.name}: ${sk.name} +1.5${p.ovr > before ? ` (OVR ${before} → ${p.ovr})` : ""}.` };
}

export function setCampGroup(league, group) {
  if (!campOpen(league)) return { ok: false, msg: "Pick the camp focus during the preseason." };
  if (group && !CAMP_GROUPS[group]) return { ok: false, msg: "Unknown focus." };
  ensureCamp(league).group = group || null;
  return { ok: true, msg: group ? `Camp focus: ${CAMP_GROUPS[group].name}. The top five there gain +1 OVR at the end of the regular season.` : "Camp focus cleared." };
}
// End of the regular season: the camp focus pays off for the five best players in that group.
export function applyCampGroup(league) {
  const t = league.teams[league.userTid];
  const c = t?.camp;
  if (!c || c.year !== league.year || !c.group || c.groupPaid) return [];
  c.groupPaid = true;
  const top = t.roster.map((id) => league.players[id]).filter((p) => p && CAMP_GROUPS[c.group].test(p)).sort((a, b) => b.ovr - a.ovr).slice(0, 5);
  const out = top.map((p) => ({ name: p.name, gain: develop(p, 1) }));
  league.inbox?.push({ year: league.year, day: league.day, text: `🏋️ Training camp focus paid off: ${out.map((x) => x.name).join(", ")} improved.` });
  return out;
}

export function battlePairs(league) {
  const ps = mine(league).filter((p) => p.injury <= 0);
  return CAMP_BATTLE_POS.map((pos) => [pos, ps.filter((p) => p.pos === pos).sort((a, b) => b.ovr - a.ovr).slice(0, 2)]).filter(([, pair]) => pair.length === 2);
}
export function runBattle(league, pos) {
  if (!campOpen(league)) return { ok: false, msg: "Position battles happen in the preseason." };
  const camp = ensureCamp(league);
  if (camp.battles[pos]) return { ok: false, msg: `The ${pos} battle is already decided.` };
  const pair = battlePairs(league).find(([p]) => p === pos)?.[1];
  if (!pair) return { ok: false, msg: "Not enough healthy players for that battle." };
  if (!spendSP(league, CAMP_COSTS.battle, `${pos} battle`)) return { ok: false, msg: `A position battle costs ${CAMP_COSTS.battle} SP.` };
  const r = stream(`${league.year}|battle|${pos}|${pair[0].id}`);
  const winner = r.chance(0.6) ? pair[0] : pair[1];
  const loser = winner === pair[0] ? pair[1] : pair[0];
  develop(winner, 1);
  camp.battles[pos] = { winner: winner.name, loser: loser.name, ovr: winner.ovr };
  return { ok: true, msg: `⚔️ ${pos} battle: ${winner.name} beats ${loser.name} and gains +1 OVR.` };
}

export function campStatus(league) {
  ensurePulse(league);
  return ensureCamp(league);
}
