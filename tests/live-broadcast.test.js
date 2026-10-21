// The live game broadcast: win probability, the situation line, callouts over the rink and the
// who-beat-whom commentary. All of it is presentation: none of it may change a game.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLeague} from '../src/engine/league.js';
import {seed, snapshotRng} from '../src/engine/rng.js';
import {delayPenalty} from '../src/engine/gameRules.js';
import {createGame, stepGame, simToEnd, assessPenalty, liveWinProb, winProbNow, winProbSeries, situationLine,
  manpowerState, liveCallouts, eventCallout, momentumOf, liveTeamStats, unitsLine} from '../src/engine/sim.js';

const lg = createLeague({mode: 'random', seed: 92411, injuries: false});
const fresh = (opts = {}) => { seed(31337); return createGame(lg, lg.teams[0], lg.teams[1], {live: true, ...opts}); };
const skaters = (s, k) => s[k].dressed.filter(id => s[k].pl[id].pos !== 'G');

test('win probability stays in bounds and settles at the final horn', () => {
  for (const pre of [.2, .5, .8]) for (const diff of [-4, -1, 0, 1, 4]) for (const secsLeft of [3600, 1200, 30, 0]) {
    const p = liveWinProb({diff, secsLeft, pre});
    assert.ok(p >= .01 && p <= .99, `${pre} ${diff} ${secsLeft}: ${p}`);
  }
  assert.equal(liveWinProb({winner: 'h'}), 1);
  assert.equal(liveWinProb({winner: 'a'}), 0);
  for (const pre of [.35, .5, .62]) assert.ok(Math.abs(liveWinProb({pre}) - pre) < .01, 'puck drop matches the pre-game chance');
});

test('win probability moves the right way with the score, the clock, the clubs and the manpower', () => {
  for (const secsLeft of [3600, 1800, 600, 60]) {
    let prev = -1;
    for (const diff of [-3, -2, -1, 0, 1, 2, 3]) { const p = liveWinProb({diff, secsLeft, pre: .5}); assert.ok(p >= prev, `lead ${diff} at ${secsLeft}`); prev = p; }
    assert.ok(liveWinProb({diff: 1, secsLeft, pre: .5}) > liveWinProb({diff: 0, secsLeft, pre: .5}));
  }
  const lead = t => liveWinProb({diff: 1, secsLeft: t, pre: .5}), trail = t => liveWinProb({diff: -1, secsLeft: t, pre: .5});
  assert.ok(lead(60) > lead(600) && lead(600) > lead(1800) && lead(1800) > lead(3000), 'a lead is worth more as time runs out');
  assert.ok(trail(60) < trail(600) && trail(600) < trail(1800), 'a deficit is worth less as time runs out');
  for (const diff of [-1, 0, 1]) assert.ok(liveWinProb({diff, secsLeft: 1500, pre: .62}) > liveWinProb({diff, secsLeft: 1500, pre: .5}), 'the better club');
  const ev = liveWinProb({secsLeft: 1500, pre: .5});
  const pp = (side, adv = 1) => liveWinProb({secsLeft: 1500, pre: .5, pp: {side, adv}, ppSecs: 120});
  assert.ok(pp('h') > ev && ev > pp('a'), 'a power play helps the club that has it');
  assert.ok(pp('h', 2) > pp('h', 1), 'five on three is worth more than five on four');
  // Overtime and the shootout.
  assert.ok(Math.abs(liveWinProb({phase: 'ot', secsLeft: 300, pre: .5}) - .5) < .02);
  assert.ok(liveWinProb({phase: 'ot', secsLeft: 900, playoff: true, pre: .5, pp: {side: 'h', adv: 1}, ppSecs: 120}) > .5);
  assert.ok(liveWinProb({phase: 'so', pre: .5, so: {h: 2, a: 1}}) > liveWinProb({phase: 'so', pre: .5, so: {h: 1, a: 1}}));
});

test('the live line follows a real game and ends on the result', () => {
  const s = fresh();
  let last = null;
  for (let i = 0; i < 200 && s.phase !== 'final'; i++) {
    stepGame(s);
    const w = winProbNow(s, .55);
    assert.ok(w >= 0 && w <= 1);
    last = w;
  }
  assert.ok(last != null);
  simToEnd(s);
  assert.equal(winProbNow(s, .55), s.winner === 'h' ? 1 : 0);
  const line = winProbSeries(s, .55);
  assert.ok(line.length > 100);
  for (let i = 1; i < line.length; i++) assert.ok(line[i].t >= line[i - 1].t && line[i].wp >= 0 && line[i].wp <= 1);
  assert.equal(line.at(-1).wp, s.winner === 'h' ? 1 : 0);
});

test('the situation line reads like a broadcast', () => {
  const H = lg.teams[0].abbr, A = lg.teams[1].abbr;
  let s = fresh();
  assert.equal(situationLine(s).text, 'Even strength · 5-on-5');
  assessPenalty(s, 'a', skaters(s, 'a')[0], {minutes: 2});
  assert.equal(situationLine(s).text, `${H} power play · 5-on-4 · 2:00 left`);
  assert.equal(situationLine(s).side, 'h');
  assessPenalty(s, 'a', skaters(s, 'a')[1], {minutes: 2});
  assert.equal(situationLine(s).text, `${H} power play · 5-on-3 · 2:00 left`);

  s = fresh();
  assessPenalty(s, 'a', skaters(s, 'a')[0], {minutes: 2}); assessPenalty(s, 'h', skaters(s, 'h')[0], {minutes: 2});
  assert.equal(situationLine(s).text, '4-on-4 · even strength');

  s = fresh();
  s.a.pulled = true; s.a.pulledReason = 'tactical';
  assert.equal(situationLine(s).text, `Empty net · ${A} 6-on-5`);

  s = fresh();
  delayPenalty(s, 'a', skaters(s, 'a')[0], {minutes: 2});
  assert.equal(situationLine(s).text, `Delayed penalty on ${A} · ${H} 6-on-5`);

  s = fresh();
  s.phase = 'ot'; s.period = 4; s.clock = 300;
  assert.equal(situationLine(s).text, '3-on-3 overtime');
  s = fresh({playoff: true});
  s.phase = 'ot'; s.period = 4; s.clock = 1200;
  assert.equal(situationLine(s).text, 'Playoff overtime · 5-on-5 · next goal wins');

  s = fresh();
  s.phase = 'so'; s.so = {round: 0, h: 1, a: 0, taken: {h: 1, a: 1}, turn: 'a', attempts: []};
  assert.equal(situationLine(s).text, 'Shootout · round 2');
  s.so.taken.a = 2; s.so.turn = 'h';
  assert.equal(situationLine(s).text, 'Shootout · round 2');
});

test('callouts: goals with their tags, penalties then the power play, kills, fights, pulled goalies and the shootout', () => {
  const s = fresh();
  const H = s.h.abbr, A = s.a.abbr;
  const [h1] = skaters(s, 'h'), a1 = skaters(s, 'a')[0];
  const kinds = list => list.map(c => c.kind);
  // A penalty: PENALTY, then POWER PLAY with its length.
  let before = manpowerState(s);
  assessPenalty(s, 'a', a1, {minutes: 2});
  let after = manpowerState(s);
  let calls = liveCallouts([{t: 'pen', side: 'a', pid: a1, minutes: 2, call: 'Tripping', text: 'Penalty'}], before, after, s);
  assert.deepEqual(kinds(calls), ['pen', 'pp']);
  assert.equal(calls[0].title, 'PENALTY');
  assert.equal(calls[1].title, 'POWER PLAY');
  assert.match(calls[1].sub, new RegExp(`^${H} · 5-on-4 · 2:00$`));
  // Killed off: the power play ends with no goal.
  before = manpowerState(s);
  s.pen.a = [];
  after = manpowerState(s);
  assert.deepEqual(kinds(liveCallouts([], before, after, s)), ['killed']);
  assert.equal(liveCallouts([], before, after, s)[0].title, 'PP KILLED');
  // ...but not when the power play scored.
  assert.deepEqual(kinds(liveCallouts([{t: 'goal', side: 'h', scorer: h1, assists: [], strength: 'PP', empty: false, text: 'GOAL!'}], before, after, s)), ['goal']);
  // Goal tags.
  for (const [ev, tag] of [[{strength: 'PP'}, 'PP'], [{strength: 'SH'}, 'SH'], [{strength: 'PP', empty: true}, 'EN'], [{strength: 'EV'}, null]]) {
    const c = eventCallout({t: 'goal', side: 'h', scorer: h1, assists: [], ...ev, text: 'GOAL!'}, s);
    assert.equal(c.title, 'GOAL!'); assert.equal(c.tag, tag);
  }
  // Older saved events without the fields still get their tag from the text.
  assert.equal(eventCallout({t: 'goal', side: 'h', text: 'GOAL! X scores on a wrist shot (Y) — power play. A 1, B 0'}, s).tag, 'PP');
  // Hat trick.
  s.goals.push(...[1, 2, 3].map(() => ({side: 'h', scorer: h1})));
  assert.deepEqual(kinds(liveCallouts([{t: 'goal', side: 'h', scorer: h1, assists: [], strength: 'EV', text: 'GOAL!'}], null, null, s)), ['goal', 'hat']);
  s.goals.length = 0;
  // Fight, goalie pulled (from the ice, so a pull you make counts too), shootout.
  assert.equal(eventCallout({t: 'fight', text: 'A and B — five each for fighting.'}, s).title, 'FIGHT!');
  before = manpowerState(s); s.a.pulled = true; after = manpowerState(s);
  calls = liveCallouts([], before, after, s);
  assert.deepEqual(kinds(calls), ['pull']); assert.equal(calls[0].title, 'GOALIE PULLED'); assert.equal(calls[0].sub, `${A} go 6-on-5`);
  assert.equal(calls[0].block, false, 'a pulled goalie does not stop play');
  s.a.pulled = false; s.a.pulledReason = 'delayed-penalty';
  before = manpowerState(s); s.a.pulled = true; after = manpowerState(s);
  assert.deepEqual(liveCallouts([], before, after, s), [], 'the delayed-penalty extra attacker is not a pulled goalie');
  s.a.pulled = false;
  assert.equal(eventCallout({t: 'so-goal', side: 'h', pid: h1, round: 2}, s).title, 'GOAL!');
  assert.equal(eventCallout({t: 'so-goal', side: 'h', pid: h1, round: 2}, s).tag, 'SO');
  assert.equal(eventCallout({t: 'so-miss', side: 'a', pid: a1, round: 2}, s).title, 'NO GOAL');
  assert.equal(eventCallout({t: 'period', period: 2, phase: 'reg'}, s).title, 'END OF THE 1ST');
  assert.equal(eventCallout({t: 'period', period: 1, phase: 'reg'}, s), null, 'no callout for the opening puck drop');
  assert.equal(eventCallout({t: 'save', side: 'a'}, s), null);
});

test('callouts in real games match the plays that earned them', () => {
  let goals = 0, pens = 0, pps = 0;
  for (let g = 0; g < 4; g++) {
    seed(5000 + g);
    const s = createGame(lg, lg.teams[2 + g], lg.teams[10 + g], {live: true});
    let seen = manpowerState(s);
    while (s.phase !== 'final') {
      const n = s.events.length;
      stepGame(s);
      const ev = s.events.slice(n), now = manpowerState(s);
      const calls = liveCallouts(ev, seen, now, s);
      for (const e of ev.filter(e => e.t === 'goal')) {
        goals++;
        const c = calls.find(c => c.kind === 'goal' && c.side === e.side);
        assert.ok(c, 'every goal gets a GOAL callout');
        assert.equal(c.tag, e.empty ? 'EN' : e.strength === 'PP' || e.strength === 'SH' ? e.strength : null);
      }
      for (const e of ev.filter(e => e.t === 'pen')) { pens++; assert.ok(calls.some(c => c.kind === 'pen' && c.side === e.side)); }
      for (const c of calls.filter(c => c.kind === 'pp')) { pps++; assert.equal(now.pp, c.side); }
      seen = now;
    }
  }
  assert.ok(goals > 5 && pens > 3 && pps > 2, `${goals} goals, ${pens} penalties, ${pps} power plays`);
});

test('who beat whom: the commentary names the beaten defender and the units, and never changes a game', () => {
  let named = 0, units = 0;
  for (let i = 0; i < 8; i++) {
    seed(7700 + i); const quick = createGame(lg, lg.teams[i], lg.teams[i + 8]); simToEnd(quick);
    seed(7700 + i); const live = createGame(lg, lg.teams[i], lg.teams[i + 8], {live: true});
    // Every helper the live screen calls between steps, on every step.
    while (live.phase !== 'final') {
      stepGame(live);
      const rng = JSON.stringify(live.rng), outer = JSON.stringify(snapshotRng());
      situationLine(live); winProbNow(live, .5); momentumOf(live, 'h'); liveTeamStats(live, 'a');
      liveCallouts(live.events.slice(-3), manpowerState(live), manpowerState(live), live);
      unitsLine(live.events.at(-1), live); winProbSeries(live, .5, 300);
      assert.equal(JSON.stringify(live.rng), rng); assert.equal(JSON.stringify(snapshotRng()), outer);
    }
    assert.deepEqual(live.score, quick.score); assert.deepEqual(live.shots, quick.shots); assert.deepEqual(live.box, quick.box);
    assert.deepEqual(live.gbox, quick.gbox); assert.deepEqual(live.goals, quick.goals); assert.deepEqual(live.shotLog, quick.shotLog);
    assert.equal(live.winner, quick.winner);
    for (const e of live.events) {
      if (e.beat) {
        named++;
        const def = e.t === 'goal' ? (e.side === 'h' ? 'a' : 'h') : e.side;
        const name = live[def].pl[e.beat].name.split(' ').slice(1).join(' ');
        assert.ok(e.text.includes(name), e.text);
        assert.match(live[def].pl[e.beat].pos, /^[LR]D$/);
      }
      if (['goal', 'save', 'block', 'miss', 'pen'].includes(e.t)) {
        assert.ok(e.on && e.str, `${e.t} carries the units on the ice`);
        assert.match(unitsLine(e, live), /^[A-Z]{2,3} (L\d \+ Pair \d|PP\d|PK\d) vs [A-Z]{2,3} (L\d \+ Pair \d|PP\d|PK\d) · \dv\d$/);
        units++;
      }
    }
  }
  assert.ok(named > 20, `${named} plays name the beaten defender`);
  assert.ok(units > 200);
});

test('momentum: share of the last five minutes of attempts', () => {
  const s = fresh();
  assert.deepEqual(momentumOf(s, 'h'), {value: 50, label: 'Even'});
  s.elapsed = 900;
  const at = (side, result, sec) => ({side, result, period: 1, clock: 1200 - sec});
  s.shotLog = [at('a', 'save', 100), at('a', 'save', 120), ...[0, 1, 2, 3, 4, 5].map(i => at('h', i % 2 ? 'save' : 'miss', 700 + i * 20)), at('h', 'goal', 880)];
  const h = momentumOf(s, 'h'), a = momentumOf(s, 'a');
  assert.equal(h.label, 'Hot'); assert.equal(a.label, 'Cold');
  assert.ok(h.value > 65 && a.value < 35 && h.value <= 100 && a.value >= 0);
});
