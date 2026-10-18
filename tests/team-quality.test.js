import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLeague} from '../src/engine/league.js';
import {createGame, simToEnd} from '../src/engine/sim.js';
import {seed} from '../src/engine/rng.js';
import {coachLines} from '../src/engine/lines.js';
import {teamStrength, leagueStrength, matchupEdge, defaultStyle} from '../src/engine/matchup.js';

const league = createLeague({userAbbr: 'EDM', injuries: false, seed: 732027});
for (const t of league.teams) coachLines(league, t);
const by = abbr => league.teams.find(t => t.abbr === abbr);

test('team strength pools star power: an elite first line makes an elite offence', () => {
  const mu = leagueStrength(league);
  const ranked = league.teams.map(t => ({abbr: t.abbr, ...teamStrength(league, t)})).sort((a, b) => b.off - a.off);
  const edm = ranked.find(t => t.abbr === 'EDM');
  assert.ok(ranked.indexOf(edm) < 5, `Edmonton's offence should rank in the top five, got ${ranked.indexOf(edm) + 1}`);
  assert.ok(edm.off > mu.off + 1.5);
  assert.ok(edm.goalie < mu.goalie, 'its goaltending remains a weakness, exactly as rated');
});

test('matchup edges are league-relative and zero-mean, so league averages hold', () => {
  let sum = 0, n = 0;
  for (const a of league.teams) for (const b of league.teams) if (a !== b) { sum += matchupEdge(league, a, b); n++; }
  assert.ok(Math.abs(sum / n) < .25, `mean edge ${sum / n}`);
  assert.ok(matchupEdge(league, by('COL'), by('VAN')) > matchupEdge(league, by('VAN'), by('COL')));
});

test('benches play to their personnel unless the GM chose a system', () => {
  assert.notEqual(defaultStyle(league, by('EDM')), 'defend', 'an elite offence with ordinary goaltending does not sit back all season');
  const t = structuredClone(by('EDM')); t.strategy = 'defend';
  assert.equal(defaultStyle(league, t), 'defend');
});

test('results follow team quality: a superstar line out-produces an ordinary first line', () => {
  const edm = by('EDM'), stl = by('STL');
  const line1 = {edm: {g: 0, sec: 0}, stl: {g: 0, sec: 0}};
  const tally = (s, k, acc) => {
    acc.sec += s.unitStats[k]['Line 1']?.seconds || 0;
    acc.g += s.shotLog.filter(x => x.side === k && x.unit === 'Line 1' && x.result === 'goal').length;
  };
  for (let i = 0; i < 160; i++) {
    seed(4100 + i);
    const home = i % 2 === 0;
    const s = createGame(league, home ? edm : stl, home ? stl : edm); simToEnd(s);
    tally(s, home ? 'h' : 'a', line1.edm); tally(s, home ? 'a' : 'h', line1.stl);
    assert.equal(s.phase, 'final');
  }
  const per60 = x => x.g / x.sec * 3600;
  assert.ok(per60(line1.edm) > per60(line1.stl) * 1.08, `McDavid's line ${per60(line1.edm).toFixed(2)} vs ${per60(line1.stl).toFixed(2)} goals/60`);
});
