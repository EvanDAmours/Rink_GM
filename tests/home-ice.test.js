// Home ice for every club (r18) and the playoff shortened bench.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLeague, serializeLeague, deserializeLeague} from '../src/engine/league.js';
import {coachLines} from '../src/engine/lines.js';
import {seed} from '../src/engine/rng.js';
import {createGame, simToEnd, applyResult, playoffShares, PLAYOFF_SHARE, HOME} from '../src/engine/sim.js';
import {winProbability, HOME_EDGE} from '../src/engine/matchup.js';
import {shareFractions, setShare} from '../src/engine/situations.js';

const sum = xs => xs.reduce((a, b) => a + b, 0);

test('home clubs win 53-57% over a seeded season, with more goals and fewer penalties against', () => {
  const l = createLeague({userAbbr: 'EDM', injuries: false, seed: 732027});
  for (const t of l.teams) coachLines(l, t);
  let hw = 0, hg = 0, ag = 0, hpp = 0, app = 0;
  for (const [i, g] of l.schedule.entries()) {
    l.day = g.day; seed(91000 + i * 9337);
    const s = createGame(l, l.teams[g.h], l.teams[g.a]); simToEnd(s); applyResult(l, s);
    hw += s.winner === 'h'; hg += s.score.h; ag += s.score.a; hpp += s.special.h.opportunities; app += s.special.a.opportunities;
  }
  const n = l.schedule.length, rate = hw / n, gpg = (hg + ag) / n / 2;
  assert.ok(rate >= .53 && rate <= .57, `home win rate ${rate}`);
  assert.ok(hg > ag && hpp > app, 'home side scores more and draws more power plays');
  assert.ok(gpg > 2.8 && gpg < 3.2, `goals per team game ${gpg}`);
});

test('neutral-site games have no home edge in the model, and the shown odds carry the measured home edge', () => {
  assert.ok(HOME.quality > 0 && HOME.quality <= .05 && HOME.calls > 0 && HOME.calls <= .1);
  const l = createLeague({userAbbr: 'EDM', injuries: false, seed: 5});
  const [a] = l.teams;
  const p = winProbability(l, a, a, {home: true});
  assert.ok(Math.abs(Math.log(p / (1 - p)) - HOME_EDGE) < 1e-9);
  const s = createGame(l, l.teams[0], l.teams[1], {exhibition: true, neutral: true});
  assert.equal(s.neutral, true);
});

test('playoff shortened bench: top units play more, every group still sums to 1', () => {
  const l = createLeague({userAbbr: 'EDM', injuries: false, seed: 11});
  const t = l.teams[3], o = l.teams[4];
  delete t.iceShares; t.identity = 'balanced';
  const reg = createGame(l, t, o), po = createGame(l, t, o, {playoff: true});
  for (const g of ['F', 'D']) {
    assert.ok(Math.abs(sum(po.h.shares[g]) - 1) < 1e-9 && Math.abs(sum(reg.h.shares[g]) - 1) < 1e-9);
    assert.ok(po.h.shares[g][0] > reg.h.shares[g][0] && po.h.shares[g].at(-1) < reg.h.shares[g].at(-1), `${g} tilted to the top`);
  }
  // A balanced club plays exactly the playoff rotation.
  const bal = playoffShares([.32, .28, .23, .17], 'F');
  bal.forEach((v, i) => assert.ok(Math.abs(v - PLAYOFF_SHARE.F[i]) < 1e-9));
  // Custom sliders still apply as relative weights: a club that already rides its top line rides it more.
  setShare(t, 'F', 0, 45);
  const own = shareFractions(t, 'F'), tilted = playoffShares(own, 'F');
  assert.ok(Math.abs(sum(tilted) - 1) < 1e-9 && tilted[0] > own[0] && tilted[0] > PLAYOFF_SHARE.F[0]);
  for (let i = 1; i < 4; i++) assert.ok(tilted[i] / tilted[i - 1] < own[i] / own[i - 1] + 1e-9, 'order kept, deeper lines shaved');
});

test('McDavid baseline untouched and a saved league still loads and plays', () => {
  const l = createLeague({userAbbr: 'EDM', seed: 7});
  const mcd = Object.values(l.players).find(p => p.name === 'Connor McDavid');
  assert.equal(mcd.ovr, 99); assert.equal(mcd.number, 97); assert.equal(mcd.attrs.spw, 92);
  const back = deserializeLeague(serializeLeague(l));
  seed(3);
  const s = createGame(back, back.teams[0], back.teams[1], {playoff: true}); simToEnd(s);
  assert.equal(s.phase, 'final');
});
