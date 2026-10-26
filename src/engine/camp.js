// Preseason games: up to four exhibitions with a practice report, as in Gridiron GM. They are for
// fun and form only: no OVR changes (development lives in the season plan, developmentPlan.js),
// nothing touches another club or the regular season.
import { stream } from "./rng.js";
import { createGame, simToEnd } from "./sim.js";
import { isGoalie } from "./constants.js";
import { ensurePulse } from "./clubPulse.js";

export const CAMP_GAMES = 4;

export function ensureCamp(league) {
  const t = league.teams[league.userTid];
  if (!t.camp || t.camp.year !== league.year) t.camp = { year: league.year, games: [], risk: false };
  return t.camp;
}
const campOpen = (league) => league.phase === "preseason";

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
  const game = { opp: opp.abbr, oppTid: opp.id, home, ...scored, ot: s.period > 3, lines: lines.slice(0, 8), hurt };
  camp.games.push(game);
  return { ok: true, msg: `Preseason ${scored.us > scored.them ? "win" : "loss"}: ${scored.us}-${scored.them} vs ${opp.abbr}${hurt.length ? ` · injured: ${hurt.join(", ")}` : ""}.`, game };
}

export function campStatus(league) {
  ensurePulse(league);
  return ensureCamp(league);
}
