// Fixed rosters and independent game seeds isolate the engine from GM moves.
import assert from 'node:assert/strict';
import {createLeague} from '../src/engine/league.js';
import {createGame, simToEnd, applyResult} from '../src/engine/sim.js';
import {teamRatings, coachLines} from '../src/engine/lines.js';
import {seed} from '../src/engine/rng.js';
import {readFileSync, writeFileSync} from 'node:fs';
const auditSeed = Number(process.env.NHL_SEASON_SEED || 91000);
const l = createLeague({userAbbr: 'EDM', injuries: false, seed: 732027});
// Benches dress their best healthy players, as AI coaches do in play after week one.
for (const t of l.teams) coachLines(l, t);
const strength = new Map(l.teams.map(t => [t.id, teamRatings(l, t).ovr]));
const total = {pp: 0, ppg: 0, ot: 0, so: 0, empty: 0, assists: 0, goals: 0, decisions: {}, regulationGoals: 0};
for (const [i, g] of l.schedule.entries()) {
  l.day = g.day; seed(auditSeed + i * 9337);
  const s = createGame(l, l.teams[g.h], l.teams[g.a]); simToEnd(s); applyResult(l, s);
  total.ot += !!s.endedIn; total.so += s.endedIn === 'SO';
  total.goals += s.goals.length; total.assists += s.goals.reduce((n, g) => n + g.assists.length, 0);
  total.empty += s.goals.filter(g => g.empty).length;
  total.regulationGoals += s.goals.filter(g => g.phase === 'reg').length;
  for (const k of ['h', 'a']) {
    total.pp += s.special[k].opportunities; total.ppg += s.special[k].goals;
    for (const [action, count] of Object.entries(s.decisions[k])) total.decisions[action] = (total.decisions[action] || 0) + count;
    const opponent = k === 'h' ? 'a' : 'h';
    const en = s.goals.filter(g => g.side === k && g.empty).length;
    const goalieShots = Object.entries(s.gbox).filter(([id]) => s[opponent].pl[id]).reduce((n, [, b]) => n + b.sa, 0);
    assert.equal(s.shots[k], goalieShots + en, 'shots reconcile with goalie and empty-net accounting');
  }
}
const teams = l.teams.map(t => ({abbr: t.abbr, ovr: strength.get(t.id), record: t.rec})).sort((a, b) => b.record.pts - a.record.pts);
const sk = Object.values(l.players).filter(p => p.pos !== 'G' && p.stats.gp);
const leaders = [...sk].sort((a, b) => b.stats.pts - a.stats.pts).slice(0, 15).map(p => ({name: p.name, ovr: p.ovr, stats: p.stats}));
const goalies = Object.values(l.players).filter(p => p.pos === 'G' && p.stats.sa);
const saves = goalies.reduce((a, p) => a + p.stats.sa - p.stats.ga, 0), shots = goalies.reduce((a, p) => a + p.stats.sa, 0);
const gp = l.schedule.length, benchmark = JSON.parse(readFileSync(new URL('../docs/nhl-calibration-2025-26.json', import.meta.url))).benchmarks;
const report = {date: new Date().toISOString(), auditSeed, games: gp,
  goalsPerTeamGame: l.teams.reduce((a, t) => a + t.rec.gf, 0) / (gp * 2),
  shotsPerTeamGame: (shots + total.empty) / (gp * 2), goalieShotsPerTeamGame: shots / (gp * 2), savePct: saves / shots,
  powerPlayPct: total.ppg / total.pp, powerPlaysPerTeamGame: total.pp / (gp * 2),
  overtimeRate: total.ot / gp, shootoutRate: total.so / gp, emptyNetGoalsPerGame: total.empty / gp,
  assistsPerGoal: total.assists / total.goals, benchmark, decisions: total.decisions, teams, leaders,
  mcdavid: sk.find(p => p.name === 'Connor McDavid')?.stats};
report.checks = {
  scoring: Math.abs(report.goalsPerTeamGame - benchmark.goalsPerTeamGame) < .25,
  shots: Math.abs(report.shotsPerTeamGame - benchmark.shotsPerTeamGame) < 1.5,
  saves: Math.abs(report.savePct - benchmark.savePct) < .012,
  powerPlay: Math.abs(report.powerPlayPct - benchmark.powerPlayPct) < .055,
  opportunities: Math.abs(report.powerPlaysPerTeamGame - benchmark.powerPlaysPerTeamGame) < .5,
  overtime: Math.abs(report.overtimeRate - benchmark.overtimeRate) < .065,
  shootouts: Math.abs(report.shootoutRate - benchmark.shootoutRate) < .045,
};
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n');
const {teams: _, leaders: __, ...summary} = report;
console.log(JSON.stringify({...summary, leaders: leaders.slice(0, 5).map(p => ({name: p.name, g: p.stats.g, a: p.stats.a, pts: p.stats.pts}))}));
if (Object.values(report.checks).some(x => !x)) process.exitCode = 1;

// Multi-season check (Gridiron 1.88): NHL_CAREER_SEASONS=8 plays full franchise seasons with
// development, drafts and free agency, and reports each season's Art Ross and Rocket Richard
// leaders and the league's 90+/95+ counts, so star scoring and ratings can be seen not to run away.
if (Number(process.env.NHL_CAREER_SEASONS) > 0) {
  const L = await import('../src/engine/league.js');
  const {simPlayoffDay} = await import('../src/engine/playoffs.js');
  const {simDraftToUser} = await import('../src/engine/draft.js');
  const {simFADay, ratingLevel} = await import('../src/engine/offseason.js');
  seed(Number(process.env.NHL_CAREER_SEED || 4242));
  const lg = L.createLeague({userAbbr: 'EDM', seed: 151});
  const count = f => Object.values(lg.players).filter(p => p.tid >= 0 && f(p)).length;
  const seasons = [];
  for (let n = 0; n < Number(process.env.NHL_CAREER_SEASONS); n++) {
    L.startRegularSeason(lg); L.simRestOfSeason(lg);
    const sk = Object.values(lg.players).filter(p => p.pos !== 'G' && p.stats.gp);
    const byP = [...sk].sort((a, b) => b.stats.pts - a.stats.pts), byG = [...sk].sort((a, b) => b.stats.g - a.stats.g);
    const row = {year: lg.year, artRoss: {name: byP[0].name, ovr: byP[0].ovr, g: byP[0].stats.g, a: byP[0].stats.a, pts: byP[0].stats.pts}, second: byP[1].stats.pts, tenth: byP[9].stats.pts,
      rocket: {name: byG[0].name, g: byG[0].stats.g}, hundredPoint: byP.filter(p => p.stats.pts >= 100).length, fortyGoal: byG.filter(p => p.stats.g >= 40).length};
    L.endRegularSeason(lg); while (lg.playoffs.champion == null) simPlayoffDay(lg);
    L.finishPlayoffs(lg); simDraftToUser(lg, {all: true}); L.completeDraft(lg);
    L.goToFreeAgency(lg); while (!simFADay(lg)) {} L.beginNextSeason(lg);
    Object.assign(row, {after: {n90: count(p => p.ovr >= 90), n95: count(p => p.ovr >= 95), n99: count(p => p.ovr >= 99), generational: count(p => p.dev === 'generational'), level: +ratingLevel(lg).toFixed(2)},
      cornerstones: (lg.devReport?.rows || []).filter(r => r.kinds.includes('cornerstone')).map(r => r.name), breakouts: (lg.devReport?.rows || []).filter(r => r.kinds.includes('breakout')).length});
    seasons.push(row); console.log(JSON.stringify(row));
  }
  if (process.env.NHL_CAREER_OUT) writeFileSync(process.env.NHL_CAREER_OUT, JSON.stringify({date: new Date().toISOString(), seed: Number(process.env.NHL_CAREER_SEED || 4242), seasons}, null, 2) + '\n');
}
