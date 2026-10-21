// Player development depth (Gridiron 1.5, 1.34, 1.61, 1.75, 1.997, 2.76, 2.77, 2.80, 3.27):
// Generational talents, the wall, big-season rewards, breakouts, ceilings, season form and roles.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLeague} from '../src/engine/league.js';
import {createGame, simToEnd, applyResult} from '../src/engine/sim.js';
import {seed} from '../src/engine/rng.js';
import {generateDraftClass} from '../src/engine/draft.js';
import {startNewSeason} from '../src/engine/offseason.js';
import {seasonMilestones, isLandslide, SEASON_LEADERS} from '../src/engine/awards.js';
import {DEV_TRAITS, rollDev, developPlayer, retirementChance, ageCurve, wallToll, breakoutRoll, isGenerationalPot, potTier, GENERATIONAL_POT, blankStats, createPlayer} from '../src/engine/players.js';
import {realDevTrait, assignRealDevTraits, ensureDevelopment, seasonForm, formLabel, seasonRole, roleGrowth, awardGrowth, applyAwardGrowth, GENERATIONAL_NAMES} from '../src/engine/development.js';
import {computeOvr} from '../src/engine/ratings.js';

const real = createLeague({userAbbr: 'EDM', seed: 2027, injuries: false});
const byName = (lg, n) => Object.values(lg.players).find((p) => p.name === n);

test('real players get deliberate traits; McDavid keeps his published baseline', () => {
  const m = byName(real, 'Connor McDavid');
  assert.deepEqual([m.ovr, m.number, m.attrs.spw], [99, 97, 92]);
  assert.equal(m.dev, 'generational');
  for (const n of ['Nathan MacKinnon', 'Macklin Celebrini', 'Connor Bedard', 'Matvei Michkov']) assert.equal(byName(real, n).dev, 'generational', n);
  assert.equal(byName(real, 'Nikita Kucherov').dev, 'superstar');
  const gens = Object.values(real.players).filter((p) => p.dev === 'generational');
  assert.ok(gens.length >= 8 && gens.length <= 14, `${gens.length} generational talents`);
  // A Generational young talent's ceiling is the Generational tier.
  assert.ok(byName(real, 'Matvei Michkov').pot >= GENERATIONAL_POT);
  assert.ok(DEV_TRAITS.generational.name === 'Generational');
});

test('older saves get the deliberate traits once', () => {
  const lg = structuredClone(real);
  delete lg.devTraitsVersion;
  byName(lg, 'Connor McDavid').dev = 'normal';
  ensureDevelopment(lg);
  assert.equal(byName(lg, 'Connor McDavid').dev, 'generational');
  assert.equal(lg.devTraitsVersion, 1);
  byName(lg, 'Connor McDavid').dev = 'star';
  ensureDevelopment(lg);
  assert.equal(byName(lg, 'Connor McDavid').dev, 'star', 'not reassigned twice');
});

test('a generated draft has a Generational talent about one year in five, at the top', () => {
  const lg = createLeague({mode: 'random', seed: 77, injuries: false});
  let gens = 0, years = 30;
  for (let y = 0; y < years; y++) {
    seed(1000 + y);
    const ids = generateDraftClass(lg, 2030 + y);
    for (const id of ids) if (lg.players[id].dev === 'generational') { gens++; assert.ok(lg.players[id].pot >= 93); }
    for (const id of ids) delete lg.players[id];
  }
  assert.ok(gens / years > 0.05 && gens / years < 0.6, `${gens} in ${years} drafts`);
  assert.equal(rollDev('anyone', 70) === 'generational', false);
});

test('draft projections: a ceiling of 96+ is the Generational tier', () => {
  assert.equal(isGenerationalPot(96), true);
  assert.equal(isGenerationalPot(95), false);
  assert.equal(potTier(97), 'Generational talent');
  assert.equal(potTier(90), null);
});

test('the wall: normal veterans decline faster from 33; Generational talents and elite goalies escape it', () => {
  const at = (pos, age, dev, ovr = 88) => ({id: 'x', pos, age, dev, ovr, pot: ovr});
  assert.ok(wallToll(at('C', 34, 'normal'), 'normal', () => 0.5) >= 1);
  assert.equal(wallToll(at('C', 32, 'normal'), 'normal', () => 0.5), 0);
  assert.equal(wallToll(at('LD', 33, 'normal'), 'normal', () => 0.5), 0, 'defensemen a year later');
  assert.equal(wallToll(at('C', 38, 'generational'), 'generational', () => 0.99), 0);
  assert.equal(wallToll(at('G', 37, 'normal', 90), 'normal', () => 0.5), 0, 'elite goalie spared');
  assert.ok(wallToll(at('G', 37, 'normal', 80), 'normal', () => 0.5) >= 1);
  // A Generational prime runs longer and declines at half pace.
  assert.ok(ageCurve(at('C', 33, 'generational', 95)) > ageCurve(at('C', 33, 'normal', 95)) + 1);
  assert.ok(ageCurve(at('C', 36, 'superstar', 90)) > ageCurve(at('C', 36, 'normal', 90)));
  // and he plays on longer.
  assert.ok(retirementChance({age: 37, ovr: 84, pos: 'C', tid: 0, dev: 'generational'}) < retirementChance({age: 37, ovr: 84, pos: 'C', tid: 0, dev: 'normal'}));
});

test('young players at their ceiling only creep past it (1.75), Superstars outgrow theirs', () => {
  seed(55);
  let over = 0, sup = 0;
  for (let i = 0; i < 300; i++) {
    const p = createPlayer({id: `n${i}`, name: 'N', pos: 'C', type: 'TWF', ovr: 80, age: 21, pot: 80, dev: 'normal'}, 2026);
    developPlayer(p, 0.5);
    if (p.ovr > 81) over++;
    const q = createPlayer({id: `s${i}`, name: 'S', pos: 'C', type: 'TWF', ovr: 80, age: 21, pot: 80, dev: 'superstar'}, 2026);
    developPlayer(q, 0.5);
    if (q.ovr > 81) sup++;
  }
  assert.ok(over < 40, `${over} normal players jumped past their ceiling`);
  assert.ok(sup > over * 2, `superstars ${sup} vs normal ${over}`);
});

test('breakouts are rare and follow the trait', () => {
  let r = 0;
  const seq = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  const count = (dev, age) => { let n = 0; for (let i = 0; i < 4000; i++) if (breakoutRoll({id: `b${i}`, age, dev}, seq) >= 2) n++; return n / 4000; };
  const star = count('star', 22), normal = count('normal', 22), old = count('star', 27);
  assert.ok(star > 0.015 && star < 0.05, `star ${star}`);
  assert.ok(normal > 0.005 && normal < 0.03, `normal ${normal}`);
  assert.equal(old, 0);
});

test('milestones, league leaders and landslides are found and rewarded', () => {
  const lg = structuredClone(real);
  const sk = Object.values(lg.players).filter((p) => p.tid >= 0 && p.pos !== 'G');
  for (const p of sk) p.stats = {...blankStats(p.pos), gp: 80, g: 10, a: 15, pts: 25};
  const [a, b] = sk;
  Object.assign(a.stats, {g: 62, a: 70, pts: 132});
  Object.assign(b.stats, {g: 45, a: 64, pts: 109});
  const m = seasonMilestones(lg);
  assert.ok(m[a.id].hits.includes('40 goals') && m[a.id].hits.includes('100 points'));
  assert.ok(m[a.id].landslides.some((x) => x.includes('points')), JSON.stringify(m[a.id]));
  assert.ok(m[a.id].landslides.some((x) => x.includes('goals')));
  assert.ok(isLandslide(SEASON_LEADERS[0], 132, 109));
  assert.ok(!isLandslide(SEASON_LEADERS[0], 112, 104));
  // A landslide: +3, a higher ceiling and a trait step for a young player.
  const kid = {...a, ovr: 84, pot: 86, age: 23, dev: 'normal', attrs: {...a.attrs}};
  const g = awardGrowth(kid, m[a.id], 23);
  assert.equal(g.boost, 3);
  assert.equal(g.dev, 'star');
  const res = applyAwardGrowth(kid, g, kid.ovr);
  assert.ok(res.gain >= 4 && kid.pot >= kid.ovr + 3 && kid.dev === 'star');
  // A plain lead for a veteran is +1 OVR.
  const vet = awardGrowth({dev: 'normal'}, {hits: [], leads: ['led the league in assists (70)'], landslides: []}, 31);
  assert.deepEqual([vet.ovr, vet.dev], [1, null]);
});

test('season form is fixed per player and season, mostly small, sometimes a career year', () => {
  assert.equal(seasonForm('abc', 2027), seasonForm('abc', 2027));
  const fs = Array.from({length: 4000}, (_, i) => seasonForm(`p${i}`, 2027));
  const mean = fs.reduce((x, y) => x + y, 0) / fs.length;
  assert.ok(Math.abs(mean) < 0.1, `mean ${mean}`);
  const hot = fs.filter((f) => f >= 3).length / fs.length;
  assert.ok(hot > 0.02 && hot < 0.1, `career years ${hot}`);
  assert.ok(fs.every((f) => f >= -4 && f <= 4));
  const id = Array.from({length: 500}, (_, i) => `p${i}`).find((x) => seasonForm(x, 2027) >= 3);
  assert.equal(formLabel({id, stats: {gp: 5}}, 2027), null, 'not shown before ten games');
  assert.equal(formLabel({id, stats: {gp: 20}}, 2027).text, 'Career year');
});

test('games record each skater\'s role; the summer tilts his skills toward it without moving his OVR', () => {
  const lg = structuredClone(real);
  const [h, a] = lg.teams;
  for (let i = 0; i < 4; i++) { seed(300 + i); const s = createGame(lg, h, a); simToEnd(s); applyResult(lg, s); }
  const top = lg.players[h.lines.F[0][1]];
  assert.equal(top.roles.y, lg.year);
  assert.ok(top.roles.F[0] >= 3, JSON.stringify(top.roles));
  top.roles.gp = 70; top.roles.F = [70, 0, 0, 0];
  const r = seasonRole(top, lg.year);
  assert.ok(['top6', 'netfront'].includes(r.role) && r.share > 0.9);
  top.age = 22;
  const before = top.ovr, oaw = top.attrs.oaw, daw = top.attrs.daw;
  const grew = roleGrowth(top, lg.year, 22);
  assert.ok(grew);
  assert.equal(top.ovr, before);
  assert.equal(top.grewAs.year, lg.year + 1);
  if (grew === 'top6') assert.ok(top.attrs.oaw >= oaw && top.attrs.daw <= daw);
});

test('rollover pays off big seasons and writes the off-season report', () => {
  const lg = structuredClone(real);
  const t = lg.teams[lg.userTid];
  const star = lg.players[t.roster.find((id) => lg.players[id].name === 'Leon Draisaitl')];
  for (const p of Object.values(lg.players)) if (p.tid >= 0 && p.pos !== 'G') Object.assign(p.stats, {gp: 80, g: 8, a: 12, pts: 20});
  Object.assign(star.stats, {gp: 84, g: 70, a: 80, pts: 150});
  seed(9);
  startNewSeason(lg);
  assert.equal(lg.devReport.year, lg.year);
  const row = lg.devReport.rows.find((r) => r.pid === star.id);
  assert.ok(row && row.kinds.includes('cornerstone'), JSON.stringify(row));
  assert.ok(lg.moments.some((m) => m.kind === 'dev-cornerstone' && m.p.name === 'Leon Draisaitl'));
  assert.ok(lg.inbox.some((x) => /Off-season report/.test(x.text)));
  assert.equal(star.stats.gp, 0, 'stats reset after the rewards were read');
});
