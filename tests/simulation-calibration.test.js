// Fast guards for league-average calibration and the team-quality curve.
// Full-length evidence lives in scripts/season-audit.mjs and docs/SIMULATION_AUDIT.md;
// these seeded samples catch accidental drift within broad statistical tolerance.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLeague} from '../src/engine/league.js';
import {createGame, simToEnd, exposure} from '../src/engine/sim.js';
import {leagueNorms, teamForm, FORM_LIMIT} from '../src/engine/matchup.js';
import {seed} from '../src/engine/rng.js';
import {isGoalie} from '../src/engine/constants.js';

const real = createLeague({userAbbr: 'EDM', injuries: false, seed: 732027});

function sample(lg, games, offset = 0) {
  const t = {games: 0, goals: 0, shots: 0, sa: 0, ga: 0, ppo: 0, ppg: 0, ot: 0, so: 0, home: 0};
  for (const [i, g] of lg.schedule.slice(offset, offset + games).entries()) {
    lg.day = g.day; seed(515000 + i * 7919);
    const s = simToEnd(createGame(lg, lg.teams[g.h], lg.teams[g.a]));
    t.games++; t.goals += s.score.h + s.score.a; t.shots += s.shots.h + s.shots.a;
    for (const b of Object.values(s.gbox)) { t.sa += b.sa; t.ga += b.ga; }
    for (const k of ['h', 'a']) { t.ppo += s.special[k].opportunities; t.ppg += s.special[k].goals; }
    t.ot += !!s.endedIn; t.so += s.endedIn === 'SO'; t.home += s.winner === 'h';
  }
  const tg = t.games * 2;
  return {gpg: t.goals / tg, shots: t.shots / tg, sv: 1 - t.ga / t.sa, pp: t.ppg / t.ppo, ppo: t.ppo / tg, ot: t.ot / t.games, so: t.so / t.games, home: t.home / t.games};
}

test('published-roster league averages stay near NHL means', () => {
  const r = sample(structuredClone(real), 420);
  const msg = JSON.stringify(r);
  assert.ok(r.gpg > 2.8 && r.gpg < 3.4, `goals/team/game ${msg}`);
  assert.ok(r.shots > 27 && r.shots < 30.5, `shots/team/game ${msg}`);
  assert.ok(r.sv > .888 && r.sv < .912, `save% ${msg}`);
  assert.ok(r.pp > .15 && r.pp < .27, `PP% ${msg}`);
  assert.ok(r.ppo > 2.4 && r.ppo < 3.4, `PP opportunities ${msg}`);
  assert.ok(r.ot > .15 && r.ot < .33, `OT rate ${msg}`);
  assert.ok(r.so > .03 && r.so < .15, `SO rate ${msg}`);
  assert.ok(r.home > .48 && r.home < .63, `home wins ${msg}`);
});

test('league norms recentre ratings: a uniformly better league scores like the old one', () => {
  const lifted = structuredClone(real);
  for (const p of Object.values(lifted.players)) for (const k in p.attrs) if (Number.isFinite(p.attrs[k])) p.attrs[k] = Math.min(99, p.attrs[k] + 4);
  const a = leagueNorms(real), b = leagueNorms(lifted);
  assert.ok(b.off > a.off + 2 && b.goalie > a.goalie + 2, 'norms follow the league rating scale');
  const before = sample(structuredClone(real), 200, 600), after = sample(lifted, 200, 600);
  assert.ok(Math.abs(after.gpg - before.gpg) < .3, `scoring drifted ${before.gpg} -> ${after.gpg}`);
  assert.ok(Math.abs(after.sv - before.sv) < .012, `save% drifted ${before.sv} -> ${after.sv}`);
});

test('team quality decides results without making the best club unbeatable', () => {
  const lg = structuredClone(real);
  const best = lg.teams.find(t => t.abbr === 'COL'), worst = lg.teams.find(t => t.abbr === 'VAN');
  let wins = 0, gf = 0, ga = 0; const n = 260;
  for (let i = 0; i < n; i++) {
    seed(620000 + i * 104729); const swap = i % 2, side = swap ? 'a' : 'h';
    const s = simToEnd(createGame(lg, swap ? worst : best, swap ? best : worst));
    wins += s.winner === side; gf += s.score[side]; ga += s.score[swap ? 'h' : 'a'];
  }
  assert.ok(gf > ga, 'the stronger roster outscores the weaker one');
  assert.ok(wins / n > .6 && wins / n < .85, `best-vs-worst win rate ${wins / n}`);
});

test('morale and chemistry are neutral by default and bounded to a few percent', () => {
  assert.equal(teamForm({}), 0);
  assert.equal(teamForm({morale: 50, chemistry: 75}), 0);
  assert.ok(teamForm({morale: 100, chemistry: 100}) <= FORM_LIMIT && teamForm({morale: 100, chemistry: 100}) > 0);
  assert.ok(teamForm({morale: 0, chemistry: 0}) >= -FORM_LIMIT && teamForm({morale: 0, chemistry: 0}) < 0);
  assert.ok(teamForm({morale: 70}) > teamForm({morale: 50}) && teamForm({chemistry: 60}) < 0);
  const lg = structuredClone(real); lg.teams[0].morale = 95; lg.teams[0].chemistry = 95; seed(9);
  const s = createGame(lg, lg.teams[0], lg.teams[1]);
  assert.ok(s.h.form > 0 && s.h.form <= FORM_LIMIT && s.a.form === teamForm(lg.teams[1]));
});

test('balanced systems carry no counterattack exposure; risky ones do, and no side gets a user boost', () => {
  assert.equal(exposure({tactic: 'balanced', plan: {forecheck: 'balanced', neutral: 'balanced', attack: 'balanced'}}), 0);
  assert.ok(exposure({tactic: 'attack', plan: {forecheck: 'aggressive', attack: 'rush'}}) > exposure({tactic: 'attack', plan: {}}));
  const lg = structuredClone(real); seed(31);
  const asUser = createGame(lg, lg.teams[0], lg.teams[1], {userTid: lg.teams[0].id}); seed(31);
  const asAI = createGame(lg, lg.teams[0], lg.teams[1], {userTid: -1});
  assert.equal(asUser.h.form, asAI.h.form); assert.deepEqual(asUser.norms, asAI.norms);
  assert.ok(lg.teams[0].roster.every(id => isGoalie(lg.players[id].pos) || asUser.h.comp[id] === undefined || asUser.h.comp[id].off === asAI.h.comp[id].off));
});
