// Fixed rosters and independent game seeds isolate the engine from GM moves.
import assert from 'node:assert/strict';
import {createLeague} from '../src/engine/league.js';
import {createGame, simToEnd, applyResult} from '../src/engine/sim.js';
import {teamRatings} from '../src/engine/lines.js';
import {seed} from '../src/engine/rng.js';
import {readFileSync, writeFileSync} from 'node:fs';
const auditSeed = Number(process.env.NHL_SEASON_SEED || 91000);
const l = createLeague({userAbbr: 'EDM', injuries: false, seed: 732027});
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
