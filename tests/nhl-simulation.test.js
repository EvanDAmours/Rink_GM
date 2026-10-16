import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLeague} from '../src/engine/league.js';
import {seed} from '../src/engine/rng.js';
import {createGame, stepGame, simToEnd, creditGoal, applyResult, skatersForDisplay} from '../src/engine/sim.js';
import {activePenalties, skaterCount, strengthType, assessPenalty, delayPenalty, releaseOnGoal, tickPenalties, setStoppage, takeTimeout, resetOvertimeStrength} from '../src/engine/gameRules.js';
import {shotGeometry, expectedGoal} from '../src/engine/shotModel.js';

const base = createLeague({mode: 'random', seed: 72169, injuries: false});
function fixture(gameSeed=1258) {
  const lg = structuredClone(base);
  lg.teams[0].restPct = 0; lg.teams[1].restPct = 0;
  seed(gameSeed);
  const s = createGame(lg, lg.teams[0], lg.teams[1], {userTid: 0});
  return {lg, s, h: s.h.lines.F[0], a: s.a.lines.F[0]};
}
const iceFor = s => ({h: skatersForDisplay(s, 'h'), a: skatersForDisplay(s, 'a')});

test('double-minor goal terminates only the current segment, including after time has elapsed', () => {
  const {s, a} = fixture(); assessPenalty(s, 'a', a[0], {minutes: 4});
  tickPenalties(s, 50); assert.equal(s.pen.a[0].left, 190);
  releaseOnGoal(s, 'h'); assert.equal(s.pen.a[0].left, 120);
  releaseOnGoal(s, 'h'); assert.equal(s.pen.a.length, 0);
});
test('shorthanded goals and goals against majors do not release penalties', () => {
  const {s, a} = fixture(); assessPenalty(s, 'a', a[0], {minutes: 5});
  releaseOnGoal(s, 'h'); assert.equal(s.pen.a[0].left, 300);
  releaseOnGoal(s, 'a'); assert.equal(s.pen.a[0].left, 300);
});
test('the earliest current minor segment ends first on a power-play goal', () => {
  const {s, a} = fixture(); assessPenalty(s, 'a', a[0], {minutes: 4});
  assessPenalty(s, 'a', a[1]); tickPenalties(s, 50);
  // Both current segments have 70 seconds left; assessment order breaks tie.
  releaseOnGoal(s, 'h'); assert.equal(s.pen.a[0].left, 120); assert.equal(s.pen.a[1].left, 70);
});
test('a third penalty waits for an available clock and cannot reduce a team below three', () => {
  const {s, a} = fixture();
  assessPenalty(s, 'a', a[0]); tickPenalties(s, 30);
  assessPenalty(s, 'a', a[1]); assessPenalty(s, 'a', a[2]);
  tickPenalties(s, 90);
  assert.equal(skaterCount(s, 'a'), 3);
  assert.equal(s.pen.a.find(p => p.pid === a[2]).left, 120);
  assert.ok(s.pen.a.some(p => p.pid === a[0] && p.hold));
  tickPenalties(s, 20); assert.equal(s.pen.a.find(p => p.pid === a[2]).left, 100);
  setStoppage(s, 'save'); assert.ok(!s.pen.a.some(p => p.pid === a[0]));
});
test('offsetting fighting majors exclude the fighters but keep full team strength', () => {
  const {s, h, a} = fixture();
  assessPenalty(s, 'h', h[0], {minutes: 5, offset: true});
  assessPenalty(s, 'a', a[0], {minutes: 5, offset: true});
  assert.equal(skaterCount(s, 'h'), 5); assert.equal(skaterCount(s, 'a'), 5);
  assert.ok(!skatersForDisplay(s, 'h').includes(h[0]));
  tickPenalties(s, 300); assert.ok(!skatersForDisplay(s, 'h').includes(h[0]));
  setStoppage(s, 'save'); assert.equal(s.pen.h.length, 0);
});
test('regular OT adds skaters on the power play, then stays 4-on-4 until a whistle', () => {
  const {s, a} = fixture(); s.phase = 'ot'; s.period = 4; s.clock = 300;
  assessPenalty(s, 'a', a[0]);
  assert.equal(skaterCount(s, 'h'), 4); assert.equal(skaterCount(s, 'a'), 3);
  tickPenalties(s, 120);
  assert.equal(skaterCount(s, 'h'), 4); assert.equal(skaterCount(s, 'a'), 4);
  setStoppage(s, 'save');
  assert.equal(skaterCount(s, 'h'), 3); assert.equal(skaterCount(s, 'a'), 3);
});
test('OT two-man advantage and penalty carryover use 5-on-3, not 3-on-1', () => {
  const {s, a} = fixture(); assessPenalty(s, 'a', a[0]); assessPenalty(s, 'a', a[1]);
  s.phase = 'ot'; resetOvertimeStrength(s);
  assert.equal(skaterCount(s, 'h'), 5); assert.equal(skaterCount(s, 'a'), 3);
});
test('OT power play deploys three forwards and a defenseman; three-man PK keeps two defenders', () => {
  const {s, a} = fixture(); s.phase = 'ot'; s.period = 4;
  assessPenalty(s, 'a', a[0]);
  const pp = skatersForDisplay(s, 'h'), pk = skatersForDisplay(s, 'a');
  const defense = (k, ids) => ids.filter(id => ['LD','RD'].includes(s[k].pl[id].pos)).length;
  assert.equal(pp.length, 4); assert.equal(defense('h', pp), 1);
  assert.equal(pk.length, 3); assert.equal(defense('a', pk), 2);
});
test('an OT goal ends immediately at its true elapsed OT time', () => {
  const {s, h} = fixture(); s.phase = 'ot'; s.period = 4; s.clock = 280; s.elapsed = 3620;
  const ice = iceFor(s); s.touches = [h[0], h[1]];
  creditGoal(s, 'h', h[1], ice);
  assert.equal(s.phase, 'final'); assert.equal(s.clock, 280);
  assert.equal(s.goals[0].time, 20); assert.equal(s.endedIn, 'OT');
  const snapshot = structuredClone(s); stepGame(s); assert.deepEqual(s, snapshot);
});
test('playoff OT stays five-on-five and can continue into successive 20-minute periods', () => {
  const {s} = fixture(); s.playoff = true; s.phase = 'ot'; s.period = 4; s.clock = 1;
  stepGame(s); assert.equal(s.period, 5); assert.equal(s.clock, 1200); assert.equal(skaterCount(s, 'h'), 5);
});
test('assists follow the actual touch chain, allow a prior line, and exclude the scorer and duplicates', () => {
  const {s, h} = fixture(); const previous = s.h.lines.D[1][0];
  s.touches = [previous, h[0], h[1], h[0], h[2]];
  creditGoal(s, 'h', h[2], iceFor(s));
  assert.deepEqual(s.goals[0].assists, [h[0], h[1]]);
  const x = fixture(); x.s.touches = [previous, x.h[2]];
  creditGoal(x.s, 'h', x.h[2], iceFor(x.s)); assert.deepEqual(x.s.goals[0].assists, [previous]);
});
test('a new possession or whistle clears the potential assist chain', () => {
  const {s, h} = fixture(); s.touches = [h[0], h[1]];
  setStoppage(s, 'save'); assert.deepEqual(s.touches, []);
  creditGoal(s, 'h', h[2], iceFor(s)); assert.deepEqual(s.goals[0].assists, []);
});
test('delayed minor allows an extra attacker and washes out on an even-strength goal', () => {
  const {s, h, a} = fixture(); delayPenalty(s, 'a', a[0], {minutes: 2});
  assert.equal(s.h.pulled, true); assert.equal(skatersForDisplay(s, 'h').length, 6);
  assert.equal(s.pen.a.length, 0); assert.equal(s.box[a[0]].pim, 0);
  creditGoal(s, 'h', h[0], iceFor(s));
  assert.equal(s.pen.a.length, 0); assert.equal(s.h.pulled, false);
  assert.equal(s.goals[0].strength, 'EV');
});
test('delayed double minor loses only its first half on a goal', () => {
  const {s, h, a} = fixture(); delayPenalty(s, 'a', a[0], {minutes: 4});
  creditGoal(s, 'h', h[0], iceFor(s));
  assert.equal(s.pen.a[0].left, 120); assert.equal(s.box[a[0]].pim, 2);
});
test('delayed penalty against an already shorthanded team replaces the released minor', () => {
  const {s, h, a} = fixture(); assessPenalty(s, 'a', a[0]);
  delayPenalty(s, 'a', a[1], {minutes: 2}); creditGoal(s, 'h', h[0], iceFor(s));
  assert.equal(s.pen.a.length, 1); assert.equal(s.pen.a[0].pid, a[1]);
  assert.equal(s.goals[0].strength, 'PP');
});
test('a delayed call is assessed at the next whistle and restores the goalkeeper', () => {
  const {s, a} = fixture(); delayPenalty(s, 'a', a[0], {minutes: 2});
  setStoppage(s, 'save'); assert.equal(s.h.pulled, false);
  assert.equal(s.pen.a[0].left, 120); assert.equal(s.stoppage.reason, 'penalty');
});
test('PP points, plus/minus and empty-net labels retain separate strength semantics', () => {
  const {s, h, a} = fixture(); assessPenalty(s, 'a', a[0]); s.a.pulled = true;
  const ice = iceFor(s); s.touches = [h[0], h[1]];
  creditGoal(s, 'h', h[1], ice, {empty: true});
  assert.equal(s.goals[0].type, 'EN'); assert.equal(s.goals[0].strength, 'PP');
  assert.equal(s.box[h[1]].ppg, 1); assert.equal(s.box[h[0]].ppp, 1);
  assert.equal(s.box[h[1]].pm, 0); assert.equal(s.gbox[s.a.goalie].ga, 0);
  assert.equal(activePenalties(s, 'a').length, 0);
});
test('SH goals count plus/minus even when an extra attacker restores the visible skater count', () => {
  const {s, h, a} = fixture(); assessPenalty(s, 'a', a[0]); s.a.pulled = true;
  assert.equal(strengthType(s, 'a'), 'SH');
  const ice = iceFor(s); creditGoal(s, 'a', a[1], ice);
  assert.equal(s.box[a[1]].shg, 1); assert.equal(s.box[h[0]].pm, -1);
});
test('timeout is one per team, at a stoppage, and unavailable after own icing', () => {
  const {s, h} = fixture(); s.h.fatigue[h[0]] = 70;
  setStoppage(s, 'icing', {zone: 1, side: 'a', icing: 'h'});
  assert.equal(takeTimeout(s, 'h'), false);
  setStoppage(s, 'save'); s.faceoffNext = false; assert.equal(takeTimeout(s, 'h'), false);
  s.faceoffNext = true; assert.equal(takeTimeout(s, 'h'), true);
  assert.equal(s.h.fatigue[h[0]], 40); assert.equal(takeTimeout(s, 'h'), false);
});
test('shot geometry and chance creation change expected goals in sensible directions', () => {
  const slot = shotGeometry(78, 0), point = shotGeometry(42, 20), badAngle = shotGeometry(78, 30);
  assert.ok(expectedGoal(slot) > expectedGoal(point)); assert.ok(expectedGoal(slot) > expectedGoal(badAngle));
  assert.ok(expectedGoal({...slot, rebound: true}) > expectedGoal(slot));
  assert.ok(expectedGoal({...slot, lateral: true}) > expectedGoal(slot));
  assert.ok(expectedGoal({...slot, goalie: 95}) < expectedGoal({...slot, goalie: 70}));
});
test('regulation, OT, player shots, goalie shots, scoring, TOI and points conserve across seeded games', () => {
  let empty = 0, so = 0;
  for (let i = 0; i < 100; i++) {
    const {s} = fixture(10020 + i * 7937); simToEnd(s);
    assert.notEqual(s.score.h, s.score.a); assert.ok(s.elapsed >= 3600 && s.elapsed <= 3900);
    assert.equal(s.score.h + s.score.a, s.goals.length + (s.endedIn === 'SO' ? 1 : 0));
    if (s.endedIn === 'SO') { so++; assert.equal(s.elapsed, 3900); }
    for (const k of ['h', 'a']) {
      const ids = s[k].dressed, opponent = k === 'h' ? 'a' : 'h';
      const en = s.goals.filter(g => g.side === k && g.empty).length; empty += en;
      assert.equal(s.shots[k], ids.reduce((n, id) => n + (s.box[id].sog || 0), 0));
      assert.equal(s.shots[k], Object.entries(s.gbox).filter(([id]) => s[opponent].pl[id]).reduce((n, [, b]) => n + b.sa, 0) + en);
      assert.equal(s.manpowerSeconds[k], ids.reduce((n, id) => n + (isFinite(s.box[id].g) ? s.box[id].toi : 0), 0));
      const goalieTime = Object.entries(s.gbox).filter(([id]) => s[k].pl[id]).reduce((n, [, b]) => n + b.toi, 0);
      assert.equal(goalieTime + s.emptyNetSeconds[k], s.elapsed);
      assert.equal(s.possessionTime.h + s.possessionTime.a, s.elapsed);
      for (const id of ids) if ('g' in s.box[id]) assert.equal(s.box[id].pts, s.box[id].g + s.box[id].a);
    }
    for (const g of s.goals) {
      assert.ok(g.time >= 0 && g.time <= (g.phase === 'ot' ? 300 : 1200));
      assert.ok(g.ice[g.side].includes(g.scorer)); assert.ok(g.assists.length <= 2);
      assert.ok(g.assists.every(id => id !== g.scorer));
    }
  }
  assert.ok(empty > 0); assert.ok(so > 0);
});
test('0-0 shootout credits both goalies a shutout and excludes the deciding goal from individual stats', () => {
  const {lg, s} = fixture(); s.elapsed = 3900; s.clock = 0; s.phase = 'so';
  for (const k of ['h', 'a']) s.gbox[s[k].goalie].toi = 3900;
  s.so = {h: 0, a: 0, turn: 'a', taken: {h: 0, a: 0}, hShooters: s.h.lines.F.flat(), aShooters: s.a.lines.F.flat()};
  while (s.phase !== 'final') stepGame(s);
  const result = applyResult(lg, s);
  assert.equal(result.hs + result.as, 1); assert.equal(s.goals.length, 0);
  for (const k of ['h', 'a']) {
    const st = lg.players[s[k].goalie].stats;
    assert.equal(st.so, 1); assert.equal(st.ga, 0); assert.equal(st.sa, 0);
  }
  assert.equal(lg.teams[0].rec.pts + lg.teams[1].rec.pts, 3);
  const before = structuredClone(lg.teams[0].rec); applyResult(lg, s); assert.deepEqual(lg.teams[0].rec, before);
});
test('a tactical empty-net OT loss forfeits the loser point under rule 84.2', () => {
  const {lg, s, h} = fixture(); s.phase = 'ot'; s.period = 4; s.clock = 250; s.a.pulled = true;
  s.a.pulledReason = 'tactical'; s.gbox[s.h.goalie].toi = s.gbox[s.a.goalie].toi = 3600;
  creditGoal(s, 'h', h[0], iceFor(s), {empty: true}); applyResult(lg, s);
  assert.equal(lg.teams[1].rec.pts, 0); assert.equal(lg.teams[1].rec.l, 1);
});
test('an unfinished game cannot update league records or player stats', () => {
  const {lg, s} = fixture(); assert.throws(() => applyResult(lg, s), /completed game/);
});
test('goalie starts and decisions follow the starter and eventual winning goal, including a relief appearance', () => {
  const {lg, s, h} = fixture();
  const starter = s.a.starter, relief = s.a.backup;
  s.elapsed = 1000; s.clock = 200; s.gbox[starter] = {sa: 10, ga: 0, toi: 1000};
  creditGoal(s, 'h', h[0], iceFor(s));
  s.a.goalie = relief; s.gbox[relief] = {sa: 20, ga: 0, toi: 2600};
  creditGoal(s, 'h', h[0], iceFor(s)); creditGoal(s, 'h', h[0], iceFor(s));
  s.gbox[s.h.goalie].toi = 3600; s.phase = 'final'; s.endedIn = ''; s.winner = 'h';
  applyResult(lg, s);
  assert.equal(lg.players[starter].stats.gs, 1); assert.equal(lg.players[starter].stats.l, 1);
  assert.equal(lg.players[relief].stats.gs, 0); assert.equal(lg.players[relief].stats.l, 0);
  assert.equal(lg.players[relief].stats.ga, 2);
});
test('a combined shutout awards no individual goalie shutout', () => {
  const {lg, s} = fixture(); s.phase = 'final'; s.endedIn = ''; s.winner = 'h'; s.score.h = 1;
  s.gbox[s.h.goalie].toi = 1800; s.gbox[s.h.backup] = {toi: 1800, sa: 10, ga: 0};
  s.gbox[s.a.goalie].toi = 3600; applyResult(lg, s);
  assert.equal(lg.players[s.h.goalie].stats.so, 0); assert.equal(lg.players[s.h.backup].stats.so, 0);
});
test('OT really generates penalties instead of suppressing every infraction', () => {
  let called = 0;
  for (let i = 0; i < 20; i++) {
    const {s} = fixture(2300+i); s.phase = 'ot'; s.period = 4; s.clock = 300;
    for (const k of ['h', 'a']) for (const c of Object.values(s[k].comp)) if (c.dsc) c.dsc = 0;
    simToEnd(s);
    called += (s.decisions.h.penalty || 0) + (s.decisions.a.penalty || 0);
  }
  assert.ok(called > 0);
});
test('AI uses a legal late timeout to rest an exhausted attacking unit', () => {
  const {s} = fixture(); s.period = 3; s.clock = 120; s.score.a = 1;
  for (const id of s.h.dressed) s.h.fatigue[id] = 70;
  setStoppage(s, 'save', {zone: 1, side: 'h'}); stepGame(s);
  assert.equal(s.h.timeout, true); assert.equal(s.decisions.h.timeout, 1);
});
test('AI replaces a badly beaten goalie at a whistle, retaining the actual starter', () => {
  const {s} = fixture(); s.period = 2; s.clock = 600; s.score.h = 5; s.score.a = 1;
  const starter = s.a.starter, relief = s.a.backup;
  s.gbox[starter] = {ga: 5, sa: 15, toi: 1800}; setStoppage(s, 'goal');
  stepGame(s); assert.equal(s.a.goalie, relief); assert.equal(s.a.starter, starter);
  assert.equal(s.decisions.a['goalie-change'], 1);
});
test('live user tactics remain under user control while AI reacts to a late deficit', () => {
  const {s} = fixture(); s.live = true; s.period = 3; s.clock = 100; s.score.h = 1;
  s.h.tactic = 'attack'; stepGame(s);
  assert.equal(s.h.tactic, 'attack'); assert.equal(s.a.tactic, 'attack');
});
