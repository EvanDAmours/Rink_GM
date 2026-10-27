import {gamePlan} from './teamPlanning.js';
import {snapshotRng, restoreRng} from './rng.js';
import {coachingEffects, schemeFit, lineChemistry, seasonForm, recordRoles} from './development.js';
import {recordGame} from './records.js';
import {rand, chance, weighted, randInt, randFloat, pick, clamp, stream} from './rng.js';
import {composites} from './ratings.js';
import {syncLines, gameLines} from './lines.js';
import {isForward, isDefense, isGoalie} from './constants.js';
import {blankStats, chanceInjury, injuryLength} from './players.js';
import {opposite as other, isOpenIce, activePenalties, skaterCount, strengthType,
  setStoppage, assessPenalty, releaseOnGoal, tickPenalties, nextPenaltyBoundary,
  notePowerPlays, resetOvertimeStrength, takeTimeout, delayPenalty, settleDelayedPenalty} from './gameRules.js';
import {shotGeometry, expectedGoal, shotSkills, shiftEfficiency} from './shotModel.js';
import {matchupEdge, defaultStyle} from './matchup.js';
import {slotFit} from './roles.js';
import {shareFractions, gameUnits, matchLine, UNIT_KINDS} from './situations.js';
import {recordGameUnits, tallyUsage} from './unitStats.js';
export {shotSkills, shiftEfficiency, takeTimeout, skaterCount, assessPenalty};

// The UI advances ten seconds at a time. Internally, events occur on their own
// playing-time clock, split at penalty expirations and period boundaries.
const STEP = 10, PERIOD = 1200, REG_OT = 300;
// Default even-strength rotation; a club's own shares (Lines sliders, identity) come from
// situations.js iceShares and live on side.shares.
const F_SHARE = [.32, .28, .23, .17], D_SHARE = [.39, .34, .27];
// Playoff shortened bench: the top lines and pairs play more for every club alike. The tilt is the
// playoff rotation over the regular-season default, applied to whatever a club's own rotation is
// (identity or the Lines sliders), then renormalised: a balanced club plays exactly PLAYOFF_SHARE,
// and a GM's custom shares keep their shape relative to each other, only shifted toward the top.
export const PLAYOFF_SHARE = Object.freeze({F: [.35, .30, .22, .13], D: [.42, .35, .23]});
export function playoffShares(shares, group) {
  const base = group === 'F' ? F_SHARE : D_SHARE, po = PLAYOFF_SHARE[group];
  const w = shares.map((v, i) => Math.max(0, v) * po[i] / base[i]), t = w.reduce((a, b) => a + b, 0) || 1;
  return w.map(v => v / t);
}
// Home ice (every club alike, regular season and playoffs; off at neutral sites). Besides the
// last change, the home side gets slightly better looks (shot-quality log-odds), slightly cleaner
// zone entries, and a few fewer penalties called against it (and a few more against the visitors),
// each split evenly around zero so league scoring and calls stay put. Calibrated to the NHL's
// ~54-55% home win rate (2015-25 regular seasons); see scripts/simulation-audit.mjs.
export const HOME = Object.freeze({quality: .03, entry: .01, calls: .06});
const homeSign = (s, k) => s.neutral ? 0 : k === 'h' ? 1 : -1;
// How a club's league-relative edge (matchup.js, in rating points) moves play:
// tempo while in possession, zone-entry and cycle execution, and shot quality.
// starWeight lets the best player on the ice pull a unit's offence toward him.
export const EDGE = Object.freeze({pace: .003, entry: .002, pass: .001, quality: .0135, unitQuality: .0135, unitNorm: 5, starWeight: .85, starNorm: 4,
  // Skill steepness of possession play: breakouts, controlled-entry choice, entry and cycle execution.
  breakout: .003, carry: .012, execution: .0032, passing: .006,
  // Star share (Gridiron 1.88): an elite puck handler (control composite above eliteAt) draws the
  // puck far more often, convexly (e-fold every `elite` points), and as a carrier he creates more for
  // his linemates than he shoots himself (`distribute` per point, at most .12).
  eliteAt: 91.5, elite: 2.4, eliteCap: 6, eliteRef: 94.5, distribute: .012, touchCap: .58});
// The elite threshold follows the league's own top end: when the ten best puck handlers' control
// rises above the 2026 league's (eliteRef), the bar rises with it, so the star share stays the same
// share instead of compounding as ratings drift. Fixed per season and kept on the league (like the
// matchup means) so a loaded save plays the same.
export function eliteBar(league) {
  const hit = league?.eliteBar;
  if (hit && hit.year === league.year) return hit.at;
  const ctrl = [];
  for (const t of league?.teams || []) for (const id of t.roster || []) { const p = league.players[id]; if (p?.attrs && !isGoalie(p.pos)) ctrl.push(composites(p).ctrl); }
  ctrl.sort((a, b) => b - a);
  const top = ctrl.slice(0, 10), mean = top.length ? top.reduce((a, b) => a + b, 0) / top.length : EDGE.eliteRef;
  const at = EDGE.eliteAt + Math.max(0, mean - EDGE.eliteRef);
  if (league?.teams) league.eliteBar = {year: league.year, at};
  return at;
}
const FORM_KEYS = ['skate', 'shoot', 'hands', 'pass', 'def', 'off', 'ctrl', 'goalie'];
const visualStreams = new WeakMap();
const visual = s => visualStreams.get(s);
const avg = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const nameOf = (side, id) => side.pl[id]?.name || '?';
const lastName = (side, id) => nameOf(side, id).split(' ').slice(1).join(' ') || nameOf(side, id);
const depthOf = (s, k) => (s.puck.x - 100) * (zoneX(s, k, 1) > 100 ? 1 : -1);
function push(s, e) { s.events.push({...e, period: s.period, clock: s.clock, phase: s.phase}); }
function addBox(s, id, field, n = 1) { if (s.box[id] && field in s.box[id]) s.box[id][field] += n; }

export const REST_OPTIONS = [0, 10, 20, 30, 40, 50];
export function restShare(league, team, userTeam = team.id === league.userTid) {
  if (userTeam) return team.restPct != null ? team.restPct / 100 : team.autoGoalie === false ? 0 : .2;
  const [g1, g2] = (team.lines?.G || []).map(id => league.players[id]);
  if (!g1 || !g2) return .2;
  const gap = g1.ovr - g2.ovr;
  return gap <= 1 ? .42 : gap <= 3 ? .33 : gap <= 6 ? .25 : .18;
}

// League talent anchor (Rink 1.x drift fix): over a long franchise the skater pool thins (aging
// and retirements replaced by raw draftees) while starting goalies hold their level, so scoring
// sank and the few grown stars ran away from the league. Each season the depth of the skater pool
// (the top 384 finishers, about twelve forwards a club) and the 32 best goalies are measured
// against the 2026 league, and the gap is applied to every skater's composites and finishing and to
// every goalie's save skill. A league at its 2026 level plays unchanged. Fixed per season and kept
// on the league (like the elite bar) so a loaded save plays the same.
export const ANCHOR = Object.freeze({skaters: 85.4, goalies: 88.1, depth: 384, starters: 32, cap: 12, gain: 2.2, finish: .6, top: 95});
// The lift is full for depth players and tapers to nothing at the league's top end (ANCHOR.top), so
// the gap between stars and the rest returns to its 2026 width instead of widening as depth thins.
export const anchorLift = (a, x) => a > 0 ? a * clamp((ANCHOR.top - x) / (ANCHOR.top - ANCHOR.skaters + 4), 0, 1) : a;
export function talentAnchor(league) {
  const hit = league?.talentAnchor;
  if (hit && hit.year === league.year) return hit;
  const fin = [], gk = [];
  for (const t of league?.teams || []) for (const id of t.roster || []) {
    const p = league.players[id]; if (!p?.attrs) continue;
    if (isGoalie(p.pos)) gk.push(composites(p).goalie); else fin.push(shotSkills(p, 'wrist').finishing);
  }
  const top = (a, n, ref) => { a.sort((x, y) => y - x); const s = a.slice(0, n); return s.length >= n / 2 ? s.reduce((x, y) => x + y, 0) / s.length : ref; };
  const out = {year: league?.year,
    skater: clamp((ANCHOR.skaters - top(fin, ANCHOR.depth, ANCHOR.skaters)) * ANCHOR.gain, -ANCHOR.cap, ANCHOR.cap),
    goalie: clamp(ANCHOR.goalies - top(gk, ANCHOR.starters, ANCHOR.goalies), -ANCHOR.cap, ANCHOR.cap)};
  if (league?.teams) league.talentAnchor = out;
  return out;
}

function makeSide(league, team, opts) {
  const userTeam = team.id === opts.userTid;
  syncLines(league, team);
  const lines = gameLines(league, team);
  const dressed = [...new Set([...lines.F.flat(), ...lines.D.flat(), ...lines.G].filter(Boolean))];
  const pl = {}, comp = {}, fatigue = {}, form = {}, star = {}, bar = eliteBar(league), anchor = talentAnchor(league);
  for (const id of dressed) {
    pl[id] = league.players[id]; comp[id] = composites(pl[id]); fatigue[id] = 0;
    // His star pull, from his own puck control (form doesn't compound it).
    star[id] = Math.exp(clamp(comp[id].ctrl - bar, 0, EDGE.eliteCap) / EDGE.elite);
    // Season form (Gridiron 1.61): a career year or a slump moves every composite and his finishing.
    const f = opts.exhibition ? 0 : seasonForm(id, league.year);
    if (f) { form[id] = f; for (const k of FORM_KEYS) if (k in comp[id]) comp[id][k] += f; }
    const fit = schemeFit(pl[id], team);
    if (comp[id].off) { comp[id].off += fit; comp[id].def += fit; }
    if (anchor.skater && !isGoalie(pl[id].pos)) for (const k of FORM_KEYS) if (k in comp[id]) comp[id][k] += anchorLift(anchor.skater, comp[id][k]);
  }
  let goalie = lines.G[0];
  const backup = lines.G[1];
  let rest = restShare(league, team, userTeam);
  const last = pl[goalie]?.lastGoalieStart;
  if (!userTeam && last?.year === league.year && league.day - last.day <= 1) rest = Math.max(rest, .82);
  if (!opts.playoff && backup && chance(rest) || !goalie) goalie = backup || goalie;
  return {tid: team.id, abbr: team.abbr, user: userTeam, coaching: coachingEffects(league, team),
    chemistry: lines.F.map(ids => lineChemistry(league, team, ids)), dChem: lines.D.map(ids => lineChemistry(league, team, ids, 'D')),
    pref: defaultStyle(league, team), tactic: defaultStyle(league, team),
    lines, dressed, form, star, eliteAt: bar, anchor, unavailable:team.roster.filter(id=>league.players[id]?.injury>0||league.players[id]?.ltir), pl, comp, fatigue, goalie, starter: goalie, backup: goalie === lines.G[0] ? backup : lines.G[0],
    pulled: false, autoPull: true, ride: false, timeout: false, boost: 0,
    fIdx: 0, dIdx: 0, fShift: 0, dShift: 0, fToi: [0, 0, 0, 0], dToi: [0, 0, 0],
    fShiftLength: 45, dShiftLength: 55, pulledReason: null, ...linesSetup(league, team, lines, comp, pl, opts)};
}

export function createGame(league, home, away, opts = {}) {
  const s = {playoff: !!opts.playoff, exhibition: !!opts.exhibition, threeOnThree: !!opts.threeOnThree, neutral: !!opts.neutral,
    live: !!opts.live, userSide: opts.userTid === home.id ? 'h' : opts.userTid === away.id ? 'a' : null,
    year: league.year, day: league.day,
    h: makeSide(league, home, opts), a: makeSide(league, away, opts),
    shotLog: [], unitStats: {h:{}, a:{}},
    period: 1, clock: PERIOD, elapsed: 0, phase: 'reg', score: {h: 0, a: 0}, shots: {h: 0, a: 0},
    pen: {h: [], a: []}, ppTime: {h: 0, a: 0}, otCounts: null,
    special: {h: {opportunities: 0, goals: 0, seconds: 0}, a: {opportunities: 0, goals: 0, seconds: 0}},
    attempts: {h: 0, a: 0}, xg: {h: 0, a: 0}, possessionTime: {h: 0, a: 0},
    manpowerSeconds: {h: 0, a: 0}, emptyNetSeconds: {h: 0, a: 0},
    decisions: {h: {}, a: {}}, goals: [], events: [], box: {}, gbox: {},
    so: null, winner: null, faceoffNext: true, centerDraw: true,
    stoppage: {reason: 'period', zone: 0, side: null, icing: null},
    puck: {x: 100, y: 42.5}, poss: null, zone: 0, carrier: null, touches: [], rush: false, lateral: false, steps: 0};
  visualStreams.set(s, stream(`presentation|${randInt(1, 2147483647)}`));
  for (const side of [s.h, s.a]) {
    for (const id of side.dressed) s.box[id] = blankStats(side.pl[id].pos);
    if (side.goalie) s.gbox[side.goalie] = {sa: 0, ga: 0, toi: 0};
  }
  s.h.plan = gamePlan(league, home, away); s.a.plan = gamePlan(league, away, home);
  s.h.edge = matchupEdge(league, home, away); s.a.edge = matchupEdge(league, away, home);
  s.rng = snapshotRng();
  if (s.live) push(s, {t: 'period', text: `Puck drop! ${home.abbr} vs ${away.abbr} — 1st period underway.`});
  return s;
}

// Elite finishing pays off less per point above FINISH.knee (Rink 1.x tuning): the best snipers
// still lead the league, but in the 55-65 goal range real seasons show rather than 70-80.
// Power play: PP1 takes `first` of every `cycle` seconds while it's fresh (the Lines screen shows the same split).
export const PP_SPLIT = Object.freeze({cycle: 115, first: 80});
export const FINISH = Object.freeze({knee: 83, slope: .15});
export const finishCurve = (f) => (f > FINISH.knee ? FINISH.knee + (f - FINISH.knee) * FINISH.slope : f);
function decision(s, k, action) { s.decisions[k][action] = (s.decisions[k][action] || 0) + 1; }
const puckWeight = (side, id) => (side.comp[id].ctrl / 82) ** 3 * (side.comp[id].pass / 82) ** 2 * (side.star?.[id] ?? Math.exp(clamp(side.comp[id].ctrl - (side.eliteAt ?? EDGE.eliteAt), 0, EDGE.eliteCap) / EDGE.elite));
// Who gets the puck: weighted by skill, but no one player takes more than touchCap of a unit's
// touches, however far above his linemates he is (a lone star on a weak club still has to share).
function share(items, f) {
  const w = items.map(f), tot = w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) if (w[i] > EDGE.touchCap * tot) w[i] = EDGE.touchCap / (1 - EDGE.touchCap) * (tot - w[i]);
  const idx = weighted(items.map((_, i) => i), i => w[i]);
  return items[idx];
}
function touch(s, k, id) {
  if (!id) return;
  if (s.poss !== k) s.touches = [];
  s.poss = k; s.carrier = id;
  if (s.touches.at(-1) !== id) s.touches.push(id);
  if (s.touches.length > 12) s.touches.shift();
}
function zoneX(s, k, depth) {
  // Shootouts defend the same ends as periods 1 and 3 (Rule 84.4).
  const homeRight = s.phase === 'so' || s.period % 2 === 1;
  return (k === 'h' ? homeRight : !homeRight) ? 100 + depth : 100 - depth;
}

function chooseLine(s, k, group) {
  const side = s[k], rows = side.lines[group], toi = group === 'F' ? side.fToi : side.dToi;
  let shares = (group === 'F' ? side.shares?.F : side.shares?.D) || (group === 'F' ? F_SHARE : D_SHARE);
  const late = s.period >= 3 && s.clock <= 480 && Math.abs(s.score[k] - s.score[other(k)]) <= 2;
  if (side.ride || late) shares = group === 'F' ? [.40, .32, .20, .08] : [.46, .35, .19];
  const total = toi.reduce((a, b) => a + b, 0);
  const defensiveDraw = s.stoppage?.zone === 1 && s.stoppage.side === other(k);
  const offensiveDraw = s.stoppage?.zone === 1 && s.stoppage.side === k;
  const matching = k === 'h' && defensiveDraw && s.a.fIdx === 0;
  let best = 0, bestValue = -Infinity;
  rows.forEach((ids, i) => {
    const available = ids.filter(id => id && !s.pen[k].some(p => p.pid === id));
    if (!available.length) return;
    const ability = avg(available.map(id => defensiveDraw || matching ? side.comp[id].def : side.comp[id].off));
    const need = (total + 60) * shares[i] - toi[i];
    const value = need - avg(available.map(id => side.fatigue[id])) * 2.2
      + (offensiveDraw || defensiveDraw || matching ? (ability - 80) * 2 : 0) + rand() * 8
      + (group === 'F' ? matchBonus(s, k, i) : 0);
    if (value > bestValue) { bestValue = value; best = i; }
  });
  return best;
}

function rotate(s, k, whistle) {
  const side = s[k];
  if (whistle && s.stoppage?.icing === k) return;
  // No wholesale changes while hemmed in defensively. A safe clear or a
  // whistle gives the coach an opportunity to change exhausted units.
  const safe = whistle || depthOf(s, k) > -20 && (s.poss === k || s.zone === 0);
  if (!safe) return;
  if (side.fShift <= 0 || whistle && side.fShift < 25) {
    side.fIdx = chooseLine(s, k, 'F'); side.fShift = randInt(38, 48); side.fShiftLength = side.fShift;
  }
  if (side.dShift <= 0 || whistle && side.dShift < 25) {
    side.dIdx = chooseLine(s, k, 'D'); side.dShift = randInt(45, 58); side.dShiftLength = side.dShift;
  }
}

function onIce(s, k) {
  const side = s[k], n = skaterCount(s, k), type = strengthType(s, k);
  const boxed = s.pen[k].length ? new Set(s.pen[k].map(p => p.pid)) : null;
  const free = id => id && !isGoalie(side.pl[id]?.pos) && !(boxed && boxed.has(id));
  let ids;
  side.unitOn = null;
  if (type === 'PP') {
    const first = side.lines.PP[0].filter(free);
    const unit = s.ppTime[k] % PP_SPLIT.cycle < PP_SPLIT.first && avg(first.map(id => side.fatigue[id])) < 65 ? 0 : 1;
    ids = side.lines.PP[unit].filter(free);
    if (n === 4) ids = [...ids.filter(id => isForward(side.pl[id].pos)).slice(0, 3), ...ids.filter(id => isDefense(side.pl[id].pos)).slice(0, 1)];
  } else if (type === 'SH') {
    const unit = Math.floor(s.ppTime[other(k)] / 38) % 2;
    ids = side.lines.PK[unit].filter(free);
    if (n === 3) ids = [...ids.filter(id => isForward(side.pl[id].pos)).slice(0, 1), ...ids.filter(id => isDefense(side.pl[id].pos)).slice(0, 2)];
  } else if ((ids = situationalIce(s, k, n, free))) {
    // a situational unit is on (OT trio, extra attacker, lead protection, D-zone draw)
  } else {
    const f = side.lines.F[side.fIdx].filter(free), d = side.lines.D[side.dIdx].filter(free);
    ids = n === 3 ? [f[1] || f[0], f[0] || f[2], d[0]]
      : n === 4 ? [f[1] || f[0], f[0] || f[2], ...d] : [...f, ...d];
  }
  ids = [...new Set(ids.filter(free))];
  const want = n + (side.pulled ? 1 : 0);
  if (ids.length < want) {
    const bench = side.dressed.filter(id => free(id) && !ids.includes(id)).sort((a, b) => {
      const score = id => (side.pulled || type === 'PP' ? side.comp[id].off : side.pl[id].ovr) - side.fatigue[id] * .12;
      return score(b) - score(a);
    });
    ids.push(...bench.slice(0, want - ids.length));
  }
  return ids.slice(0, want);
}
export const skatersForDisplay = (s, k) => onIce(s, k);

function rate(s, k, ids) {
  // Hot path: called twice per ten-second step. Composites and shift efficiency are
  // looked up once per skater, then each key is a plain loop (same numbers as the
  // map/avg version, without the allocations).
  const side = s[k], n = ids.length, comps = new Array(n), eff = new Array(n);
  for (let i = 0; i < n; i++) { const id = ids[i]; comps[i] = side.comp[id]; eff[i] = shiftEfficiency(side.pl[id].attrs.end, side.fatigue[id]); }
  const get = key => { if (!n) return 0; let sum = 0; for (let i = 0; i < n; i++) sum += comps[i][key] * eff[i]; return sum / n; };
  // The best player on the ice drives his unit's attack: elite skaters carry,
  // distribute and finish far more than an equal share of the puck.
  const pulled = key => { let sum = 0, max = -Infinity; for (let i = 0; i < n; i++) { const v = comps[i][key] * eff[i]; sum += v; if (v > max) max = v; } const m = n ? sum / n : 0; return m + (max - m - EDGE.starNorm) * EDGE.starWeight; };
  return {off: pulled('off') + (side.chemistry[side.fIdx] || 0), ctrl: pulled('ctrl'), pass: pulled('pass'),
    def: get('def') + (side.dChem?.[side.dIdx] || 0) * .6, skate: get('skate'), phys: get('phys'), blk: get('blk'), dsc: get('dsc'), n};
}

function coach(s, k) {
  const side = s[k], diff = s.score[k] - s.score[other(k)];
  if (!(side.user && s.live)) {
    side.tactic = s.period >= 3 && s.clock <= 600 && diff < 0 ? 'attack'
      : s.period >= 3 && s.clock <= 480 && diff > 0 ? 'defend'
      : !s.playoff && s.phase === 'reg' && s.period === 3 && s.clock <= 600 && diff === 0 && strengthType(s,k)==='EV' ? 'defend' : side.pref;
    // Nobody sits back on the power play: a defensive system still attacks with the extra man.
    if (side.tactic === 'defend' && strengthType(s, k) === 'PP' && !(s.period >= 3 && s.clock <= 480 && diff > 0)) side.tactic = 'balanced';
    if (s.faceoffNext && !side.timeout && s.period >= 3 && diff < 0 && diff >= -2 && s.clock <= 180
      && avg(onIce(s, k).map(id => side.fatigue[id])) > 30) {
      if (takeTimeout(s, k)) {
        decision(s, k, 'timeout');
        if (s.live) push(s, {t: 'timeout', side: k, text: `${side.abbr} use their timeout to rest the unit and plan the next shift.`});
      }
    }
    const gb = s.gbox[side.goalie];
    if (s.faceoffNext && s.stoppage?.icing !== k && side.backup && gb?.ga >= (s.playoff ? 6 : 5)
      && gb.toi >= 1200 && gb.ga / Math.max(1, gb.sa) > .20 && diff <= -3 && !side.replaced) {
      const old = side.goalie;
      side.goalie = side.backup; side.backup = old; side.replaced = true;
      s.gbox[side.goalie] ||= {sa: 0, ga: 0, toi: 0};
      decision(s, k, 'goalie-change');
      if (s.live) push(s, {t: 'goalie', side: k, text: `${side.abbr} turn to ${nameOf(side, side.goalie)} in goal.`});
    }
  }
  if (s.delayedPenalty && other(s.delayedPenalty.k) === k) return;
  if (side.user && s.live && !side.autoPull) return;
  const late = s.phase === 'reg' && s.period === 3;
  const threshold = diff === -1 ? 150 : diff === -2 ? 240 : diff === -3 ? 300 : 0;
  const want = late && threshold > 0 && s.clock <= threshold && strengthType(s, k) !== 'SH';
  // Pull after established possession or an attacking-zone/neutral stoppage.
  const safe = s.faceoffNext ? s.stoppage?.side !== other(k) : s.poss === k && depthOf(s, k) >= 0;
  if (want && safe && !side.pulled) {
    side.pulled = true; side.pulledReason = 'tactical'; decision(s, k, 'goalie-pull');
    if (s.live) push(s, {t: 'pull', side: k, text: `${side.abbr} pull ${lastName(side, side.goalie)} for an extra attacker.`});
  } else if (side.pulled && !want) { side.pulled = false; side.pulledReason = null; }
}

function pickCenter(side, ids, assigned = false) {
  const c = side.lines.F[side.fIdx]?.[1];
  if (assigned && ids.includes(c)) return c;
  const forwards = ids.filter(id => isForward(side.pl[id].pos));
  return [...(forwards.length ? forwards : ids)].sort((a, b) => side.comp[b].fof - side.comp[a].fof)[0];
}

function faceoff(s) {
  // Visitors set their unit first; home coach can then match it (Rule 82).
  rotate(s, 'a', true); rotate(s, 'h', true);
  markDzDraw(s);
  const ice = {h: onIce(s, 'h'), a: onIce(s, 'a')};
  const assigned = skaterCount(s, 'h') === 5 && skaterCount(s, 'a') === 5;
  const h = pickCenter(s.h, ice.h, assigned), a = pickCenter(s.a, ice.a, assigned);
  const winner = chance(clamp(.5 + (s.h.comp[h].fof - s.a.comp[a].fof) * .0045 + .005, .25, .75)) ? 'h' : 'a';
  addBox(s, winner === 'h' ? h : a, 'fow'); addBox(s, winner === 'h' ? a : h, 'fol');
  const spot = s.stoppage || {zone: 0};
  s.zone = spot.zone === 1 ? (winner === spot.side ? 1 : -1) : 0;
  s.puck = {x: spot.zone === 1 ? zoneX(s, spot.side, 69) : 100, y: spot.zone === 1 ? (chance(.5) ? 20.5 : 64.5) : 42.5};
  s.touches = []; touch(s, winner, winner === 'h' ? h : a);
  // The draw winner usually moves it to a teammate, rather than shooting off
  // every faceoff. Only actual touches can become assists.
  const receiver = share(ice[winner].filter(id => id !== s.carrier), id => puckWeight(s[winner], id));
  touch(s, winner, receiver);
  s.rush = false; s.lateral = false; s.faceoffNext = false; s.stoppage = null;
  if (s.live && visual(s).chance(.3)) push(s, {t: 'fo', side: winner, text: `${lastName(s[winner], winner === 'h' ? h : a)} wins the draw.`, ...s.puck});
}

function playingTime(s, dt, ice) {
  s.elapsed += dt; s.clock = Math.max(0, s.clock - dt);
  if (s.poss) s.possessionTime[s.poss] += dt;
  for (const k of ['h', 'a']) {
    const side = s[k], on = ice[k], type = strengthType(s, k);
    s.unitStats ||= {h:{},a:{}};
    const unit = type === 'EV' ? `Line ${side.fIdx + 1}` : type;
    const u=s.unitStats[k][unit] ||= {seconds:0}; u.seconds+=dt;
    s.manpowerSeconds[k] += on.length * dt;
    if (side.pulled) s.emptyNetSeconds[k] += dt;
    side.fShift -= dt; side.dShift -= dt; side.fToi[side.fIdx] += dt; side.dToi[side.dIdx] += dt;
    // Skaters on the ice tire by dt; everyone else recovers at three quarters of that.
    const skaters = side.skaters || (side.skaters = side.dressed.filter(id => !isGoalie(side.pl[id].pos)));
    for (let i = 0; i < skaters.length; i++) {
      const id = skaters[i];
      if (on.includes(id)) { side.fatigue[id] += dt; addBox(s, id, 'toi', dt); }
      else side.fatigue[id] = Math.max(0, side.fatigue[id] - dt * .75);
    }
    if (!side.pulled && s.gbox[side.goalie]) s.gbox[side.goalie].toi += dt;
    if (type === 'PP') { s.ppTime[k] += dt; s.special[k].seconds += dt; }
    else s.ppTime[k] = 0;
  }
  tallyUsage(s, dt);
  tickPenalties(s, dt); notePowerPlays(s);
}

function changePossession(s, k, ice) {
  if (s.delayedPenalty?.k === k) { setStoppage(s, 'penalty'); return; }
  s.zone = -s.zone; s.touches = []; s.rush = false; s.lateral = false;
  touch(s, k, weighted(ice[k], id => s[k].comp[id].ctrl));
}

function hockeyEvent(s, ice, R) {
  const k = s.poss || 'h', o = other(k), att = s[k], def = s[o];
  const manEdge = R[k].n - R[o].n;
  const carrierSkill = att.comp[s.carrier] || R[k];
  const discipline = (R.h.dsc + R.a.dsc) / 2;
  const callFor = chance(.72) ? o : k;
  if (!s.delayedPenalty && chance(.0155 * (100 - discipline) / 22 * (1 - homeSign(s, callFor) * HOME.calls))) {
    const penalized = callFor;
    const ids = ice[penalized].filter(id => !s.pen[penalized].some(p => p.pid === id));
    const pid = weighted(ids, id => Math.max(1, 100 - s[penalized].comp[id].dsc) + s[penalized].comp[id].agr * .12);
    if (pid) {
      const type = pick(['Tripping', 'Hooking', 'Holding', 'Slashing', 'Interference', 'High-sticking', 'Cross-checking']);
      const minutes = type === 'High-sticking' && chance(.15) ? 4 : chance(.006) ? 5 : 2;
      const tag = s.live ? onIceTag(s, ice) : null; // the units on the ice when the call was made
      if (penalized === o) delayPenalty(s, penalized, pid, {type, minutes});
      else assessPenalty(s, penalized, pid, {type, minutes});
      decision(s, penalized, 'penalty');
      if (s.live) push(s, {t: 'pen', side: penalized, pid, minutes, call: type, delayed: penalized === o, ...tag, text: `Penalty: ${nameOf(s[penalized], pid)} — ${minutes} minutes for ${type.toLowerCase()}.`});
      return;
    }
  }
  if (!isOpenIce(s) && chance(.0005)) {
    const h = weighted(ice.h, id => s.h.comp[id].fgt ** 2), a = weighted(ice.a, id => s.a.comp[id].fgt ** 2);
    if (h && a) {
      assessPenalty(s, 'h', h, {type: 'Fighting', minutes: 5, offset: true});
      assessPenalty(s, 'a', a, {type: 'Fighting', minutes: 5, offset: true});
      if (s.live) push(s, {t: 'fight', pids: [h, a], text: `${nameOf(s.h, h)} and ${nameOf(s.a, a)} — five each for fighting.`});
      return;
    }
  }
  // Checking and puck battles are consequences of contesting possession.
  if (chance(.125 * R[o].phys / 82)) {
    const hitter = weighted(ice[o], id => def.comp[id].phys ** 2); addBox(s, hitter, 'hit');
    if (s.live && visual(s).chance(.25)) push(s, {t: 'hit', side: o, text: `${lastName(def, hitter)} finishes a check on ${lastName(att, s.carrier)}.`, ...s.puck});
  }
  if (s.zone === -1) {
    decision(s, k, strengthType(s, k) === 'SH' ? 'clear' : 'breakout');
    const clear = strengthType(s, k) === 'SH';
    const success = clamp((clear ? .76 : .72) + (carrierSkill.pass * .65 + R[k].pass * .35 + carrierSkill.ctrl * .5 + R[k].ctrl * .5 - R[o].def - R[o].skate) * EDGE.breakout + manEdge * .055, .35, .92);
    if (chance(success)) {
      const receiver = share(ice[k].filter(id => id !== s.carrier), id => puckWeight(att, id) * (isForward(att.pl[id].pos) ? 1.5 : 1));
      touch(s, k, receiver); s.zone = clear ? 1 : 0; s.puck = {x: zoneX(s, k, clear ? 55 : -8), y: randFloat(15, 70)};
      if (clear) changePossession(s, o, ice);
    } else if (!clear && chance(.17)) {
      decision(s, k, 'icing'); setStoppage(s, 'icing', {zone: 1, side: o, icing: k});
      if (s.live) push(s, {t: 'icing', side: k, text: `${att.abbr} ice the puck and must keep their unit on.`});
    } else changePossession(s, o, ice);
    return;
  }
  if (s.zone === 0) {
    if (chance(.035)) {
      decision(s, k, 'offside'); setStoppage(s, 'offside');
      if (s.live) push(s, {t: 'offside', side: k, text: `${att.abbr} are offside at the blue line.`});
      return;
    }
    const entryControl = carrierSkill.ctrl * .65 + R[k].ctrl * .35;
    // A defending club clogs the neutral zone; an attacking one is exposed to counters.
    const posture = def.tactic === 'defend' ? -.04 : def.tactic === 'attack' ? .03 : 0;
    const carry = clamp(.63 - (def.plan?.neutral === 'trap' ? .08 : 0) + (att.plan?.attack === 'rush' ? .06 : 0) + (entryControl - R[o].def) * EDGE.carry + (att.tactic === 'attack' ? .07 : att.tactic === 'defend' ? -.08 : 0) + posture, .25, .9);
    const controlled = chance(carry);
    decision(s, k, controlled ? 'controlled-entry' : 'dump-and-chase');
    const success = (controlled ? .69 + (entryControl + carrierSkill.skate * .5 + R[k].skate * .5 - R[o].def * 2) * EDGE.execution
      : .48 + (R[k].phys + R[k].skate - R[o].phys - R[o].def) * EDGE.execution) + manEdge * .06 + (att.edge || 0) * EDGE.entry + posture + (att.plan?.forecheck === 'aggressive' && !controlled ? .06 : 0) - (def.plan?.neutral === 'trap' && controlled ? .035 : 0) + homeSign(s, k) * HOME.entry;
    s.zone = 1; s.puck = {x: zoneX(s, k, controlled ? 58 : 82), y: randFloat(12, 73)};
    if (chance(clamp(success, .25, .9))) {
      s.rush = controlled; s.lateral = false;
      touch(s, k, share(ice[k], id => puckWeight(att, id) * (isForward(att.pl[id].pos) ? 1.8 : .5)));
    } else changePossession(s, o, ice);
    return;
  }
  const advantage = manEdge;
  // Protecting a lead retains the puck and avoids low-percentage point shots;
  // trailing teams attack faster but expose themselves to counterattacks.
  let shoot = .50 + (att.plan?.attack === 'shoot' ? .07 : att.plan?.attack === 'cycle' ? -.035 : 0) + (att.tactic === 'attack' ? .07 : att.tactic === 'defend' ? -.06 : 0);
  if (att.pulled) shoot += .07;
  const carrier = att.pl[s.carrier];
  if (carrier?.type === 'PLY') shoot -= .07;
  if (carrier?.type === 'SNP') shoot += .06;
  const cs = att.comp[s.carrier], over = cs ? Math.log(att.star?.[s.carrier] ?? 1) * EDGE.elite : 0;
  if (over > 0) shoot -= Math.min(.12, over * EDGE.distribute);
  if (chance(shoot)) {
    decision(s, k, 'shoot'); shotAttempt(s, k, ice, R); return;
  }
  decision(s, k, s.rush ? 'rush-pass' : 'cycle');
  const passing = carrierSkill.pass * .65 + R[k].pass * .35;
  const success = clamp(.78 + (passing - R[o].def) * EDGE.passing + advantage * .035 + (att.edge || 0) * EDGE.pass
    - (att.tactic === 'attack' ? .035 : 0) - (att.plan?.forecheck === 'aggressive' ? .025 : 0), .45, .94);
  if (chance(success)) {
    const receiver = share(ice[k].filter(id => id !== s.carrier), id => {
      const p = att.pl[id], c = att.comp[id];
      return (c.ctrl / 82) ** 2 * ((c.shoot / 82) ** 3 * (p.type === 'SNP' ? 1.3 : 1) + (c.pass / 82) ** 3 * (p.type === 'PLY' ? 1.3 : 1));
    });
    touch(s, k, receiver); s.lateral = chance(clamp(.40 + (carrierSkill.pass - 82) * .01, .15, .65)); s.rush = false;
    s.puck = {x: zoneX(s, k, isDefense(att.pl[receiver].pos) ? randFloat(42, 60) : randFloat(62, 80)), y: randFloat(20, 65)};
  } else changePossession(s, o, ice);
}

// ---------- Lines, roles and situations (roles.js, situations.js) ----------
// Kept apart from the scoring model on purpose. None of these draw from the random stream.
// linesSetup: per-side fields made once at puck drop. Slot fit moves a skater's composites by
// what he gives up in his even-strength slot (a winger at centre, a forward on defence...);
// natural slots cost nothing, so the staff's usual lineups play as before.
const F_SLOTS = ['LW', 'C', 'RW'], D_SLOTS = ['LD', 'RD'];
const SLOT_WEIGHT = .6;
function linesSetup(league, team, lines, comp, pl, opts = {}) {
  const fit = (id, slot) => {
    const c = comp[id], f = pl[id] ? slotFit(pl[id], slot) : 0;
    if (!c || !f || !('off' in c)) return;
    for (const key of ['off', 'def', 'ctrl', 'pass']) c[key] += f * SLOT_WEIGHT;
  };
  lines.F.forEach(row => row.forEach((id, j) => id && fit(id, F_SLOTS[j])));
  lines.D.forEach(row => row.forEach((id, j) => id && fit(id, D_SLOTS[j])));
  const dressed = [...lines.F.flat(), ...lines.D.flat()].filter(Boolean);
  const own = {F: shareFractions(team, 'F'), D: shareFractions(team, 'D')};
  const shares = opts.playoff ? {F: playoffShares(own.F, 'F'), D: playoffShares(own.D, 'D')} : own;
  return {shares, units: gameUnits(league, team, dressed),
    matchIdx: matchLine(team), unitOn: null, dzUntil: -1};
}
// Line matching: when the other club's top line is out, a matching coach favours his checking
// line (always with the last change at home, on a whistle on the road).
function matchBonus(s, k, i) {
  const side = s[k], opp = s[other(k)];
  if (side.matchIdx == null || side.matchIdx < 0 || i !== side.matchIdx || opp.fIdx !== 0) return 0;
  return k === 'h' || s.faceoffNext ? 14 : 0;
}
// A defensive-zone draw at five-on-five sends out the D-zone unit for the first 20 seconds.
function markDzDraw(s) {
  for (const k of ['h', 'a']) {
    const side = s[k];
    if (s.stoppage?.zone === 1 && s.stoppage.side === other(k) && skaterCount(s, k) === 5 && skaterCount(s, other(k)) === 5 && !side.pulled && side.units?.custom?.DZ) side.dzUntil = s.elapsed + 20;
  }
}
// Which situational unit (if any) is on: the extra attacker with the goalie pulled, the overtime
// trio at three-on-three, lead protection in the last 90 seconds, the D-zone unit after a draw.
// A tired unit (average fatigue over 45 seconds) gives way to the normal rotation.
function situationalIce(s, k, n, free) {
  const side = s[k], U = side.units;
  if (!U) return null;
  const lead = s.score[k] - s.score[other(k)];
  let kind = null;
  if (side.pulled && n === 5) kind = 'EA';
  else if (s.phase === 'ot' && !s.playoff && n === 3 && skaterCount(s, other(k)) === 3) kind = 'OT';
  else if (n === 5 && s.phase === 'reg' && s.period === 3 && s.clock <= 90 && lead >= 1 && lead <= 2 && U.custom?.LP) kind = 'LP';
  else if (n === 5 && side.dzUntil > s.elapsed) kind = 'DZ';
  const ids = kind ? (U[kind] || []).filter(free) : [];
  const size = kind ? UNIT_KINDS[kind].size : 0;
  if (!kind || ids.length < size - 1 || (kind !== 'EA' && avg(ids.map(id => side.fatigue[id])) > 45)) { side.lastUnit = null; return null; }
  if (s.live && side.lastUnit !== kind) push(s, {t: 'play', side: k, text: `${side.abbr} send out their ${UNIT_KINDS[kind].name.toLowerCase()} unit: ${ids.map(id => lastName(side, id)).join(', ')}.`});
  side.unitOn = kind; side.lastUnit = kind;
  return ids.slice(0, kind === 'OT' ? 3 : size);
}

// ---------- Commentary (live games only) ----------
// Who beat whom, read off the game state at the moment of the play: the units on the ice,
// the defenceman on the side the chance came from, how it was made. Pure reads: nothing here
// draws from the game's random stream, so a live game and a quick sim stay identical.
const LINE_WORD = ['first', 'second', 'third', 'fourth'];
function unitOf(s, k, ids) {
  const side = s[k], type = strengthType(s, k);
  const share = row => (row || []).filter(id => ids.includes(id)).length;
  if (type !== 'EV') {
    const tag = type === 'PP' ? 'PP' : 'PK', rows = side.lines[tag] || [];
    return `${tag}${share(rows[1]) > share(rows[0]) ? 2 : 1}`;
  }
  return `L${side.fIdx + 1} + Pair ${side.dIdx + 1}`;
}
function onIceTag(s, ice) {
  return {on: {h: unitOf(s, 'h', ice.h), a: unitOf(s, 'a', ice.a)}, str: {h: ice.h.length, a: ice.a.length}};
}
function beatenDefender(s, k, ice, y) {
  const o = other(k), def = s[o];
  const ds = ice[o].filter(id => isDefense(def.pl[id]?.pos));
  if (ds.length < 2) return ds[0] || null;
  // Defending its net, a club faces up ice, so its left defenceman has the side of the rink
  // on his left. The shot's side of the rink says whose side the chance came from.
  const netRight = zoneX(s, k, 89) > 100;
  const left = Number.isFinite(y) ? (netRight ? y > 42.5 : y < 42.5) : false;
  return ds.find(id => def.pl[id].pos === (left ? 'LD' : 'RD')) || ds[left ? 0 : 1];
}
function chanceCall(s, k, ice, {shooter, type, rebound = false, depth, y, xg = 0, goal = false}) {
  const o = other(k), att = s[k], def = s[o];
  if (!(goal || rebound || s.rush || s.lateral || xg >= .12)) return null;
  const pos = att.pl[shooter]?.pos;
  if (isForward(pos)) {
    const d = beatenDefender(s, k, ice, y);
    if (d) return {beat: d, name: lastName(def, d), how: rebound ? 'to the rebound' : type === 'tip-in' ? 'in front'
      : s.rush ? 'on the rush' : s.lateral ? 'on the backdoor' : depth >= 70 ? 'in the slot' : 'off the cycle'};
  }
  // A point shot, or no defenceman back: name the line matchup instead, at even strength.
  if (goal && !def.pulled && strengthType(s, k) === 'EV') {
    return {matchup: `${isDefense(pos) ? 'from the point ' : ''}against ${def.abbr}'s ${LINE_WORD[def.fIdx] || 'fourth'} line`};
  }
  return null;
}

function shotAttempt(s, k, ice, R, rebound = false) {
  const o = other(k), att = s[k], def = s[o];
  let shooter = s.carrier;
  if (rebound || !ice[k].includes(shooter)) {
    shooter = weighted(ice[k], id => (att.comp[id].shoot / 80) ** 3 * (isDefense(att.pl[id].pos) ? .35 : 1));
    touch(s, k, shooter);
  }
  const p = att.pl[shooter], isD = isDefense(p.pos);
  const type = rebound ? pick(['rebound', 'tip-in', 'backhand']) : isD ? pick(['slap shot', 'wrist shot', 'one-timer'])
    : s.lateral ? 'one-timer' : pick(['wrist shot', 'wrist shot', 'snap shot', 'backhand', 'tip-in']);
  const skill = shotSkills(p, type), efficiency = shiftEfficiency(p.attrs.end, att.fatigue[shooter]);
  let depth = rebound ? randFloat(80, 87) : isD ? randFloat(38, 61) : randFloat(60, 84);
  let y = rebound ? randFloat(36, 49) : isD ? randFloat(13, 72) : randFloat(20, 65);
  // A player shoots from the current chance, rather than teleporting a point
  // shooter into the slot. Entry/cycle decisions set the base location.
  if (!rebound && !isD) { depth = clamp((depth + depthOf(s, k)) / 2, 50, 86); y = (y + s.puck.y) / 2; }
  const x = zoneX(s, k, depth), geometry = shotGeometry(depth, y - 42.5);
  s.puck = {x, y}; s.attempts[k]++;
  const attempt = {side:k,pid:shooter,goalie:def.pulled?null:def.goalie,period:s.period,clock:s.clock,x:Math.round(x*10)/10,y:Math.round(y*10)/10,strength:strengthType(s,k),unit:strengthType(s,k)==='EV'?`Line ${att.fIdx+1}`:strengthType(s,k),defendingUnit:strengthType(s,o)==='EV'?`Line ${def.fIdx+1}`:strengthType(s,o),result:'miss',chance:null};
  (s.shotLog ||= []).push(attempt);
  const advantage = skaterCount(s, k) - skaterCount(s, o) + (att.pulled ? 1 : 0) - (def.pulled ? 1 : 0);
  const pBlock = rebound ? .06 : clamp(.23 * R[o].blk / 82 * (isD ? 1.35 : .86) - advantage * .02, .08, .42);
  if (chance(pBlock)) {
    attempt.result = 'block';
    const blocker = weighted(ice[o], id => def.comp[id].blk ** 2 * (isDefense(def.pl[id].pos) ? 1.5 : 1));
    addBox(s, blocker, 'blk');
    if (s.live) push(s, {t: 'block', side: o, att: k, ...onIceTag(s, ice), text: `${lastName(att, shooter)} fires — blocked by ${lastName(def, blocker)}.`, x, y});
    if (chance(.55)) changePossession(s, o, ice);
    return;
  }
  const pMiss = clamp(.245 - ((skill.accuracy + anchorLift(att.anchor?.skater || 0, skill.accuracy) * ANCHOR.finish) * efficiency - 82) * .0035 + geometry.angle * .035, .10, .42);
  if (chance(pMiss)) {
    if (s.live && visual(s).chance(.5)) push(s, {t: 'miss', side: k, att: k, ...onIceTag(s, ice), text: `${lastName(att, shooter)} fires wide.`, x, y});
    if (chance(.56)) changePossession(s, o, ice);
    return;
  }
  if (def.pulled) {
    // Every shot that would enter an empty goal IS a goal. Failed empty-net
    // attempts are misses, never phantom saves or shots faced by a goalie.
    addBox(s, shooter, 'sog'); s.shots[k]++; s.xg[k] += 1;
    attempt.result = 'goal'; attempt.chance = 1;
    creditGoal(s, k, shooter, ice, {empty: true, shotType: type, x, y, xg: 1, depth, rebound}); return;
  }
  addBox(s, shooter, 'sog'); s.shots[k]++;
  const goalie = def.pl[def.goalie], saveKey = pick(['glh', 'gll', 'sth', 'stl', 'fiv']);
  const goalieSkill = (def.comp[def.goalie]?.goalie ?? 70) * .7 + (goalie?.attrs[saveKey] ?? 70) * .3 + (def.coaching?.goalie || 0) + (def.anchor?.goalie || 0);
  // Shot quality also follows the units on the ice: a star-driven unit against a
  // weak defending unit creates better looks than its shot location alone says.
  const quality = (att.edge || 0) * EDGE.quality + (R[k].off - R[o].def - EDGE.unitNorm) * EDGE.unitQuality + (def.tactic === 'defend' ? -.06 : def.tactic === 'attack' ? .04 : 0) + homeSign(s, k) * HOME.quality;
  const xg = expectedGoal({...geometry, finishing: finishCurve((skill.finishing + (att.form?.[shooter] || 0) + anchorLift(att.anchor?.skater || 0, skill.finishing) * ANCHOR.finish) * efficiency), goalie: goalieSkill, quality,
    rebound, rush: s.rush, lateral: s.lateral, screen: type === 'tip-in', advantage, openIce: isOpenIce(s)});
  s.xg[k] += xg; attempt.chance = Math.round(xg*1000)/1000; attempt.result = 'save';
  if (s.gbox[def.goalie]) s.gbox[def.goalie].sa++;
  if (chance(xg)) { attempt.result = 'goal'; creditGoal(s, k, shooter, ice, {shotType: type, x, y, xg, depth, rebound}); return; }
  if (s.live) {
    const call = chanceCall(s, k, ice, {shooter, type, rebound, depth, y, xg});
    const keeper = lastName(def, def.goalie);
    push(s, {t: 'save', side: o, att: k, chance: !!call, beat: call?.beat || null, ...onIceTag(s, ice),
      text: call?.beat ? `${lastName(att, shooter)} beats ${call.name} ${call.how} — ${type}, save ${keeper}.`
        : `${lastName(att, shooter)} with a ${type} — save ${keeper}.`, x: zoneX(s, k, 89), y: 42.5});
  }
  const reb = def.comp[def.goalie]?.reb ?? 75;
  if (!rebound && chance(clamp(.11 + (82 - reb) * .002 + (82 - (goalie?.attrs.rec ?? 82)) * .001, .04, .24))) {
    decision(s, k, 'rebound'); shotAttempt(s, k, ice, R, true);
  } else if (chance(.46)) setStoppage(s, 'save', {zone: 1, side: k});
  else changePossession(s, o, ice);
}

// Scoring is shared by every game mode. Assist order is the last two distinct
// teammates who actually touched the puck, with no intervening opposing control.
export function creditGoal(s, k, shooter, ice, {empty = false, shotType = 'wrist shot', x, y, xg = 0, depth, rebound = false} = {}) {
  const o = other(k), att = s[k], def = s[o], strength = strengthType(s, k);
  // Commentary is read off the ice before the goal resets the strength (live games only).
  const tag = s.live ? onIceTag(s, ice) : null;
  const call = s.live && !empty ? chanceCall(s, k, ice, {shooter, type: shotType, rebound, depth, y, xg, goal: true}) : null;
  const assists = [];
  for (const id of [...s.touches].reverse()) {
    if (id !== shooter && !assists.includes(id) && att.pl[id]) assists.push(id);
    if (assists.length === 2) break;
  }
  s.score[k]++;
  if (!empty && s.gbox[def.goalie]) s.gbox[def.goalie].ga++;
  addBox(s, shooter, 'g'); addBox(s, shooter, 'pts');
  for (const id of assists) { addBox(s, id, 'a'); addBox(s, id, 'pts'); }
  if (strength === 'PP') {
    addBox(s, shooter, 'ppg'); addBox(s, shooter, 'ppp');
    for (const id of assists) addBox(s, id, 'ppp');
    s.special[k].goals++;
  }
  if (strength === 'SH') addBox(s, shooter, 'shg');
  if (strength !== 'PP') {
    for (const id of ice[k]) addBox(s, id, 'pm');
    for (const id of ice[o]) addBox(s, id, 'pm', -1);
  }
  const duration = s.phase === 'ot' && !s.playoff ? REG_OT : PERIOD;
  s.goals.push({side: k, scorer: shooter, assists, period: s.period, phase: s.phase,
    time: duration - s.clock, elapsed: s.elapsed, type: empty ? 'EN' : strength, strength, empty,
    goalie: empty ? null : def.goalie, defendingGoalie: def.goalie, scoringGoalie: att.goalie,
    ice: {h: [...ice.h], a: [...ice.a]}, x, y, xg, score: {...s.score}});
  if (s.phase === 'ot' && !s.playoff && empty && def.pulledReason !== 'delayed-penalty') s.forfeitPoint = o;
  const minorReleased = strength === 'PP' && activePenalties(s, o).some(p => !p.major);
  releaseOnGoal(s, k);
  settleDelayedPenalty(s, {goal: true, minorReleased});
  setStoppage(s, 'goal');
  if (s.live) push(s, {t: 'goal', side: k, att: k, scorer: shooter, assists: [...assists], strength, empty, beat: call?.beat || null, ...tag, x: zoneX(s, k, 89), y: 42.5,
    text: `GOAL! ${nameOf(att, shooter)} scores on a ${shotType}${call?.beat ? `, beating ${call.name} ${call.how}` : call?.matchup ? `, ${call.matchup}` : ''}${assists.length ? ' (' + assists.map(id => lastName(att, id)).join(', ') + ')' : ' (unassisted)'}${empty ? ' — empty net' : strength === 'PP' ? ' — power play' : strength === 'SH' ? ' — shorthanded' : ''}. ${s.h.abbr} ${s.score.h}, ${s.a.abbr} ${s.score.a}`});
  if (s.phase === 'ot') endGame(s, k);
}

function periodEnd(s) {
  if (s.phase === 'reg' && s.period < 3) {
    s.period++; s.clock = PERIOD;
  } else if (s.score.h !== s.score.a) { endGame(s, s.score.h > s.score.a ? 'h' : 'a'); return; }
  else if (s.playoff || s.phase === 'reg') {
    s.phase = 'ot'; s.period++; s.clock = s.playoff ? PERIOD : REG_OT;
    for (const k of ['h', 'a']) { s[k].pulled = false; s[k].pulledReason = null; }
  } else { startShootout(s); return; }
  for (const k of ['h', 'a']) {
    for (const id of s[k].dressed) s[k].fatigue[id] = 0;
    s[k].fShift = 0; s[k].dShift = 0;
  }
  setStoppage(s, 'period');
  if (s.live) push(s, {t: 'period', text: `${periodLabel(s)} underway. ${s.h.abbr} ${s.score.h}, ${s.a.abbr} ${s.score.a}.`});
}

function shootoutOrder(side) {
  const auto = side.dressed.filter(id => !isGoalie(side.pl[id].pos))
    .sort((a, b) => side.comp[b].dek + side.comp[b].shoot - side.comp[a].dek - side.comp[a].shoot);
  // The coach's shootout order goes first (Lines > Situations), then the rest by skill.
  const set = (side.units?.SO || []).filter(id => auto.includes(id));
  return [...set, ...auto.filter(id => !set.includes(id))];
}
function startShootout(s) {
  s.phase = 'so';
  for (const k of ['h', 'a']) s[k].pulled = false;
  s.so = {round: 0, h: 0, a: 0, hShooters: shootoutOrder(s.h), aShooters: shootoutOrder(s.a), turn: 'a', taken: {h: 0, a: 0}, attempts: []};
  if (s.live) push(s, {t: 'period', text: 'Still tied after five minutes of overtime. Shootout!'});
}
function shootoutStep(s) {
  const so = s.so, k = so.turn, o = other(k);
  const cycle = Math.min(so.hShooters.length, so.aShooters.length);
  const shooter = so[k + 'Shooters'][so.taken[k] % cycle];
  const sc = s[k].comp[shooter], g = s[o].comp[s[o].goalie];
  const p = clamp(.32 * Math.exp(.022 * ((sc.dek + sc.shoot) / 2 - 82) - .027 * (((g?.goalie ?? 75) + (g?.brk ?? 75)) / 2 - 82)), .10, .65);
  const scored = chance(p); so.taken[k]++; if (scored) so[k]++;
  so.attempts ||= []; so.attempts.push({side: k, shooter, scored});
  if (s.live) push(s, {t: scored ? 'so-goal' : 'so-miss', side: k, pid: shooter, round: so.taken[k], x: zoneX(s, k, 89), y: 42.5,
    text: `${nameOf(s[k], shooter)} ${scored ? 'scores!' : 'is stopped by ' + lastName(s[o], s[o].goalie) + '.'} (${s.a.abbr} ${so.a} – ${s.h.abbr} ${so.h})`});
  so.turn = o;
  const {h, a} = so.taken;
  if (h <= 3 && a <= 3) {
    if (so.h + 3 - h < so.a || so.a + 3 - a < so.h || h === 3 && a === 3 && so.h !== so.a) finishShootout(s);
  } else if (h === a && so.h !== so.a) finishShootout(s);
}
function finishShootout(s) { const w = s.so.h > s.so.a ? 'h' : 'a'; s.score[w]++; endGame(s, w); }
function endGame(s, winner) {
  if (s.phase === 'final') return;
  const phase = s.phase; s.winner = winner; s.phase = 'final';
  s.endedIn = phase === 'so' ? 'SO' : phase === 'ot' ? s.playoff && s.period > 4 ? `${s.period - 3}OT` : 'OT' : '';
  if (s.live) push(s, {t: 'final', text: `Final${s.endedIn ? ' (' + s.endedIn + ')' : ''}: ${s.h.abbr} ${s.score.h}, ${s.a.abbr} ${s.score.a}.`});
}

function advanceGame(s) {
  if (s.phase === 'final') return;
  if (s.phase === 'so') { shootoutStep(s); return; }
  s.steps++;
  let remaining = STEP;
  while (remaining > 0 && s.phase !== 'final' && s.phase !== 'so') {
    for (const k of ['a', 'h']) coach(s, k);
    if (s.faceoffNext) faceoff(s);
    else { rotate(s, 'a', false); rotate(s, 'h', false); }
    const ice = {h: onIce(s, 'h'), a: onIce(s, 'a')};
    if (!ice.h.length || !ice.a.length) throw new Error('A game requires eligible skaters on both teams.');
    if (!ice[s.poss].includes(s.carrier)) touch(s, s.poss, weighted(ice[s.poss], id => s[s.poss].comp[id].ctrl));
    const R = {h: rate(s, 'h', ice.h), a: rate(s, 'a', ice.a)};
    const advantage = skaterCount(s, s.poss) - skaterCount(s, other(s.poss));
    const pace = s[s.poss].tactic === 'attack' ? 1.08 : s[s.poss].tactic === 'defend' ? .94 : 1;
    const specialTeams = advantage > 0 ? (s[s.poss].coaching?.pp || 1) / (s[other(s.poss)].coaching?.pk || 1) : 1;
    // In tied late regular-season games, conservative units hold possession
    // rather than force transitions that risk losing the standings point.
    const protectPoint = !s.playoff && s.phase==='reg' && s.period===3 && s.clock<=600 && s.score.h===s.score.a && s[s.poss].tactic==='defend' && advantage===0 ? .70 : 1;
    const eventRate = .113 * protectPoint * pace * specialTeams * (isOpenIce(s) ? 1.18 : 1) * (advantage > 0 ? 1.1 : advantage < 0 ? .9 : 1)
      * clamp(1 + (R[s.poss].off - R[other(s.poss)].def) * .002 + (s[s.poss].edge || 0) * EDGE.pace, .82, 1.18);
    const wait = Math.max(1, Math.ceil(-Math.log(Math.max(1e-12, rand())) / eventRate));
    const boundary = Math.min(remaining, s.clock, nextPenaltyBoundary(s));
    const dt = Math.min(wait, boundary);
    playingTime(s, dt, ice); remaining -= dt;
    if (s.clock === 0) { periodEnd(s); return; }
    // A penalty expiration at this instant changes who's eligible before the
    // next play; the just-finished interval belonged to the previous strength.
    if (wait <= boundary) {
      const now = {h: onIce(s, 'h'), a: onIce(s, 'a')};
      hockeyEvent(s, now, {h: rate(s, 'h', now.h), a: rate(s, 'a', now.a)});
    }
    if (s.live && s.phase !== 'final' && visual(s).chance(.08)) {
      push(s, {t: 'play', side: s.poss, text: s.poss ? `${s[s.poss].abbr} ${s.zone === 1 ? 'work the offensive zone' : s.zone === -1 ? 'look for an outlet' : 'move through neutral ice'}.` : 'The whistle stops play.', ...s.puck});
    }
  }
}
// A match owns its random stream. Browsing, autosaving and other matches cannot
// change its next outcome; the complete state can be resumed without a reroll.
export function stepGame(s) {
  if (!s.rng) s.rng = snapshotRng();
  const outer = snapshotRng(); restoreRng(s.rng);
  try { advanceGame(s); } finally { s.rng = snapshotRng(); restoreRng(outer); }
}
export function serializeGame(s) {
  return structuredClone({...s, presentationRng: visual(s)?.snapshot()});
}
export function restoreGame(league, data) {
  if (!data?.rng || !data.h || !data.a || !Number.isFinite(data.clock)) throw new Error('Invalid saved match.');
  const s = structuredClone(data);
  for (const k of ['h','a']) for (const id of s[k].dressed) {
    if (!league.players[id]) throw new Error('Saved match player is missing.');
    s[k].pl[id] = league.players[id];
  }
  const r = stream('restored-presentation'); if (data.presentationRng != null) r.restore(data.presentationRng);
  visualStreams.set(s,r); return s;
}
export function simToEnd(s) {
  let guard = 0;
  while (s.phase !== 'final' && guard++ < 20000) stepGame(s);
  if (s.phase !== 'final') throw new Error('Simulation could not finish within the step limit; no arbitrary winner was assigned.');
  return s;
}
function ordinal(n) { return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th'; }
export function periodLabel(s) {
  if (s.phase === 'so') return 'SO';
  if (s.phase === 'ot' || s.period > 3) return s.playoff ? `${s.period - 3}OT` : 'OT';
  return ordinal(s.period);
}
export function clockLabel(sec) { const t = Math.max(0, Math.floor(sec)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }

// Apply a finished game to the league: player/goalie stats, team records,
// injuries. Returns a compact result for the schedule/box score.
export function applyResult(league, s, { playoff = false } = {}) {
  if (s.phase !== 'final' || !s.winner) throw new Error('Only a completed game can be applied.');
  if (s.appliedResult) return s.appliedResult;
  playoff ||= s.playoff;
  const h = league.teams[s.h.tid];
  const a = league.teams[s.a.tid];
  const statKey = playoff ? "pstats" : "stats";
  if (!playoff) for(const k of ['h','a']) for(const id of s[k].unavailable || []) {
    const a=league.players[id]?.rolePromise;
    if(a?.tid===s[k].tid && a.year===league.year)a.unavailable=(a.unavailable||0)+1;
  }
  const winner = s.winner;
  const loser = other(winner);

  for (const id in s.box) {
    const p = league.players[id];
    if (!p || isGoalie(p.pos) || !(s.box[id].toi > 0 || s.box[id].pim > 0)) continue;
    const b = s.box[id];
    const st = p[statKey];
    st.gp++;
    for (const f in b) if (f !== "gp" && f in st) st[f] += b[f];
  }
  // Game-winning goal: the goal that put the winner one ahead of the loser's final total.
  const gw = s.endedIn === 'SO' ? null : s.goals.filter(g => g.side === winner)[s.score[loser]];
  if (s.endedIn !== "SO") {
    if (gw) {
      const p = league.players[gw.scorer];
      if (p) p[statKey].gwg++;
    }
  }
  for (const k of ["h", "a"]) {
    const side = s[k];
    const appearances = Object.keys(s.gbox).filter(id => side.pl[id] && s.gbox[id].toi > 0);
    const decisionGoalie = s.endedIn === 'SO' ? side.goalie
      : k === winner ? gw?.scoringGoalie || side.goalie : gw?.defendingGoalie || side.goalie;
    // Someone always gets the decision: the goalie in net for the deciding goal, else
    // whoever played the most, else the starter.
    const credited = (appearances.includes(decisionGoalie) ? decisionGoalie : appearances.sort((x, y) => s.gbox[y].toi - s.gbox[x].toi)[0]) || side.goalie || side.starter;
    for (const gid in s.gbox) {
      if (!side.pl[gid]) continue;
      const gb = s.gbox[gid];
      const p = league.players[gid];
      if (!p || gb.toi <= 0) continue;
      const st = p[statKey];
      st.gp++;
      if (gid === side.starter) { st.gs++; p.lastGoalieStart = {year: league.year, day: league.day}; }
      st.sa += gb.sa;
      st.ga += gb.ga;
      st.toi += gb.toi;
      if (appearances.length === 1 && s.goals.every(g => g.side !== other(k))) st.so++;
      if (gid === credited) {
        if (k === winner) st.w++;
        else if (s.endedIn && !playoff && s.forfeitPoint !== k) st.otl++;
        else st.l++;
      }
    }
  }
  if (!playoff) {
    updateRecord(h, s, "h");
    updateRecord(a, s, "a");
  }
  // Injuries (regular season and playoffs).
  for (const k of ["h", "a"]) {
    for (const id of s[k].dressed) {
      const p = league.players[id];
      const played = isGoalie(p?.pos) ? s.gbox[id]?.toi > 0 : s.box[id]?.toi > 0;
      if (league.settings?.injuries !== false && p && played && chance(chanceInjury(p)*(1-(league.teams[s[k].tid].arena?.medical || 0)*.05))) {
        p.injury = injuryLength();
        p.injuryEpisode = `${s.year}:${s.day}`;
        p.injuryNote = pick(["upper-body", "lower-body", "knee", "shoulder", "concussion", "ankle", "hand"]);
        if (p.tid === league.userTid) league.inbox?.push({ year: league.year, day: league.day, text: `${p.name} (${p.injuryNote}) is out about ${p.injury} game${p.injury > 1 ? "s" : ""}.` });
      }
    }
  }
  if (!playoff) { recordGame(league, s); recordRoles(league, s); recordGameUnits(league, s); }
  return s.appliedResult = {
    hs: s.score.h,
    as: s.score.a,
    ot: s.endedIn,
    shots: { ...s.shots },
    stars: threeStars(league, s),
    goals: s.goals.map((g) => ({ s: g.side, p: g.scorer, a: g.assists, per: g.period, t: g.time, ty: g.type })),
    g: { h: s.h.goalie, a: s.a.goalie },
    special: structuredClone(s.special),
    xg: {...s.xg},
  };
}

function updateRecord(team, s, k) {
  const r = team.rec;
  const won = s.winner === k;
  const gf = s.score[k];
  const ga = s.score[other(k)];
  r.gp++;
  r.gf += gf;
  r.ga += ga;
  const where = k === "h" ? r.home : r.away;
  let res;
  if (won) {
    r.w++;
    r.pts += 2;
    where.w++;
    if (!s.endedIn) r.rw++;
    if (s.endedIn !== "SO") r.row++;
    res = "W";
  } else if (s.endedIn && s.forfeitPoint !== k) {
    r.otl++;
    r.pts += 1;
    where.otl++;
    res = "O";
  } else {
    r.l++;
    where.l++;
    res = "L";
  }
  r.last10 = (r.last10 + res).slice(-10);
  const kind = res === "W" ? "W" : res === "L" ? "L" : "OT";
  if (r.streak && r.streak[0] === kind) r.streak = [kind, r.streak[1] + 1];
  else r.streak = [kind, 1];
}

export function blankRecord() {
  return { gp: 0, w: 0, l: 0, otl: 0, pts: 0, gf: 0, ga: 0, rw: 0, row: 0, home: { w: 0, l: 0, otl: 0 }, away: { w: 0, l: 0, otl: 0 }, last10: "", streak: null };
}

function threeStars(league, s) {
  const scores = [];
  for (const id in s.box) {
    const b = s.box[id];
    const p = league.players[id];
    if (!p || isGoalie(p.pos)) continue;
    const v = b.g * 3 + b.a * 1.8 + b.pm * 0.4 + b.sog * 0.15 + b.hit * 0.05 + b.blk * 0.1 + rand() * 0.3;
    if (v > 0.5) scores.push([id, v]);
  }
  for (const gid in s.gbox) {
    const gb = s.gbox[gid];
    if (gb.toi < 1800) continue;
    const saves = gb.sa - gb.ga;
    const side = s.h.pl[gid] ? "h" : "a";
    const v = saves * 0.13 - gb.ga * 0.6 + (s.winner === side ? 1.5 : 0) + (gb.ga === 0 ? 2 : 0);
    scores.push([gid, v]);
  }
  return scores.sort((x, y) => y[1] - x[1]).slice(0, 3).map((x) => x[0]);
}

// Convenience: build + sim + apply in one call.
export function playGame(league, home, away, opts = {}) {
  const s = createGame(league, home, away, opts);
  simToEnd(s);
  return { state: s, result: applyResult(league, s, opts) };
}

// ---------- Broadcast display helpers ----------
// Read-only views of a game in progress for the live screen: the situation line, momentum,
// live win probability, team stats and the callouts over the rink. None of them change the
// game or draw from its random stream.

// Game seconds played at a period and clock.
export function elapsedAt(s, period, clock) {
  if (period <= 3) return (period - 1) * PERIOD + (PERIOD - clock);
  return 3 * PERIOD + (s.playoff ? (period - 4) * PERIOD + (PERIOD - clock) : REG_OT - clock);
}

// Skaters each side has by rule, who has pulled the goalie for an extra attacker (not for a
// delayed penalty) and who is on the power play.
export function manpowerState(s) {
  const n = {h: skaterCount(s, 'h'), a: skaterCount(s, 'a')};
  const pulled = k => !!s[k].pulled && s[k].pulledReason !== 'delayed-penalty';
  return {phase: s.phase, n, pulled: {h: pulled('h'), a: pulled('a')}, pp: n.h > n.a ? 'h' : n.a > n.h ? 'a' : null};
}

// Seconds until the shorthanded side gets a skater back (the end of this power play's edge).
export function ppTimeLeft(s, k) {
  const times = activePenalties(s, other(k)).map(p => (!p.major && p.left > 120 ? p.left - 120 : p.left));
  return times.length ? Math.min(...times) : 0;
}

// One broadcast line for the moment: 'EDM power play · 5-on-4 · 1:12 left', 'Empty net · VAN 6-on-5',
// '3-on-3 overtime', 'Shootout · round 2'. side: the team the line is about (for its logo).
export function situationLine(s) {
  const A = k => s[k].abbr;
  const mk = (side, lead, parts = []) => ({side, lead, parts, text: [lead, ...parts].join(' · '), puck: puckLine(s)});
  if (s.phase === 'final') return {...mk(s.winner, 'Final', s.endedIn ? [s.endedIn] : []), puck: null};
  if (s.phase === 'so') {
    const t = s.so?.taken || {h: 0, a: 0};
    return {...mk(null, 'Shootout', [`round ${Math.min(t.h, t.a) + 1}`]), puck: null};
  }
  const m = manpowerState(s), n = m.n;
  const on = k => n[k] + (s[k].pulled ? 1 : 0);
  const vs = k => `${on(k)}-on-${on(other(k))}`;
  const ot = s.phase === 'ot';
  if (s.delayedPenalty) { const k = other(s.delayedPenalty.k); return mk(k, `Delayed penalty on ${A(s.delayedPenalty.k)}`, [`${A(k)} ${vs(k)}`]); }
  const pulled = ['h', 'a'].find(k => m.pulled[k]);
  if (pulled) return mk(pulled, 'Empty net', [`${A(pulled)} ${vs(pulled)}`]);
  if (m.pp) {
    const left = ppTimeLeft(s, m.pp);
    return mk(m.pp, `${A(m.pp)} power play`, [vs(m.pp), ...(left > 0 ? [`${clockLabel(left)} left`] : []), ...(ot ? ['overtime'] : [])]);
  }
  if (ot && !s.playoff) return mk(null, `${n.h}-on-${n.a} overtime`);
  if (ot) return mk(null, 'Playoff overtime', [`${n.h}-on-${n.a}`, 'next goal wins']);
  if (n.h < 5) return mk(null, `${n.h}-on-${n.a}`, ['even strength']);
  return mk(null, 'Even strength', ['5-on-5']);
}
function puckLine(s) {
  const k = s.poss;
  if (!k || s.faceoffNext) return s.stoppage?.reason === 'period' ? null : 'Faceoff coming up';
  const o = other(k);
  return s.zone === 1 ? `${s[k].abbr} in the ${s[o].abbr} zone` : s.zone === -1 ? `${s[k].abbr} breaking out` : `${s[k].abbr} through neutral ice`;
}

// How a club is rolling: its share of the last five minutes of shot attempts, with goals and
// shots on goal counting for more. 50 is even; Hot from 65, Cold at 35 and under.
export function momentumOf(s, k, windowSec = 300) {
  const now = s.elapsed || 0, W = {goal: 3, save: 1.5, miss: 1, block: .8};
  let us = 0, them = 0;
  const log = s.shotLog || [];
  for (let i = log.length - 1; i >= 0; i--) {
    const a = log[i];
    if (now - elapsedAt(s, a.period, a.clock) > windowSec) break;
    if (a.side === k) us += W[a.result] ?? 1; else them += W[a.result] ?? 1;
  }
  const value = Math.round(100 * (us + 2) / (us + them + 4));
  return {value, label: value >= 65 ? 'Hot' : value <= 35 ? 'Cold' : 'Even'};
}

// Live win probability for the home side. Goals come as Poisson streams for the time left:
// about three a team per sixty minutes, scaled by the clubs' pre-game edge (pre: the home
// win chance before puck drop), faster on the power play while it lasts. A tie after
// regulation goes to overtime (and the shootout in the regular season). Simple by design:
// a bigger lead, less time for the trailing team, a better club and an extra skater each
// move it the way you'd expect.
const WP = {base: 3 / 3600, pp1: 6.6 / 3600, pp2: 12 / 3600, sh: .8 / 3600, ot: -Math.log(.45) / REG_OT, max: 16};
function poisson(lam) {
  const p = [Math.exp(-lam)];
  for (let i = 1; i <= WP.max; i++) p.push(p[i - 1] * lam / i);
  return p;
}
function finishProb(diff, lh, la, tie) {
  const ph = poisson(lh), pa = poisson(la);
  let win = 0, draw = 0, mass = 0;
  for (let i = 0; i <= WP.max; i++) for (let j = 0; j <= WP.max; j++) {
    const p = ph[i] * pa[j], d = diff + i - j;
    mass += p; if (d > 0) win += p; else if (d === 0) draw += p;
  }
  return (win + draw * tie) / mass;
}
const soEdge = sh => .5 + (sh - .5) * .3;
function tieValue(mh, ma, playoff) {
  const sh = mh / (mh + ma);
  if (playoff) return sh;
  const noGoal = Math.exp(-WP.ot * REG_OT);
  return sh * (1 - noGoal) + noGoal * soEdge(sh);
}
function windowRates(mh, ma, pp, base) {
  if (!pp) return [mh * base, ma * base];
  const r = pp.adv >= 2 ? WP.pp2 : WP.pp1;
  return pp.side === 'h' ? [mh * r, ma * WP.sh] : [mh * WP.sh, ma * r];
}
function regulationProb(diff, T, mh, ma, pp, w, playoff) {
  w = pp ? Math.max(0, Math.min(w, T)) : 0;
  const [wh, wa] = windowRates(mh, ma, pp, WP.base);
  return finishProb(diff, mh * WP.base * (T - w) + wh * w, ma * WP.base * (T - w) + wa * w, tieValue(mh, ma, playoff));
}
const strengthCache = new Map();
function strengthFor(pre, playoff) {
  const key = `${Math.round(pre * 1000)}|${playoff ? 1 : 0}`;
  if (strengthCache.has(key)) return strengthCache.get(key);
  let lo = -1.5, hi = 1.5;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (regulationProb(0, 3 * PERIOD, Math.exp(mid), Math.exp(-mid), null, 0, playoff) < pre) lo = mid; else hi = mid;
  }
  const k = (lo + hi) / 2;
  if (strengthCache.size > 500) strengthCache.clear();
  strengthCache.set(key, k);
  return k;
}
export function liveWinProb({diff = 0, secsLeft = 3 * PERIOD, phase = 'reg', playoff = false, pp = null, ppSecs = 0, pre = .5, so = null, winner = null} = {}) {
  if (winner) return winner === 'h' ? 1 : 0;
  const k = strengthFor(clamp(pre, .05, .95), playoff), mh = Math.exp(k), ma = Math.exp(-k), sh = mh / (mh + ma);
  const T = Math.max(0, secsLeft);
  let p;
  if (phase === 'so') {
    p = soEdge(sh) + ((so?.h || 0) - (so?.a || 0)) * .22;
  } else if (phase === 'ot') {
    if (diff) return diff > 0 ? 1 : 0;
    // Sudden death: who scores first during any power play left, then at the overtime rate.
    const base = playoff ? WP.base : WP.ot / 2, w = pp ? Math.min(Math.max(0, ppSecs), T) : 0;
    let [rh, ra] = windowRates(mh, ma, pp, base);
    if (pp && !playoff) { rh = mh * base * (pp.side === 'h' ? 1.8 : .5); ra = ma * base * (pp.side === 'h' ? .5 : 1.8); }
    const inWindow = rh + ra > 0 ? rh / (rh + ra) * (1 - Math.exp(-(rh + ra) * w)) : 0;
    const after = playoff ? sh : sh * (1 - Math.exp(-WP.ot * (T - w))) + Math.exp(-WP.ot * (T - w)) * soEdge(sh);
    p = inWindow + Math.exp(-(rh + ra) * w) * after;
  } else {
    p = regulationProb(diff, T, mh, ma, pp, ppSecs, playoff);
  }
  return clamp(p, .01, .99);
}
function regulationLeft(s) {
  if (s.phase === 'reg') return (3 - s.period) * PERIOD + s.clock;
  return s.clock;
}
// The home side's chance right now.
export function winProbNow(s, pre = .5) {
  if (s.phase === 'final') return s.winner === 'h' ? 1 : 0;
  const m = manpowerState(s);
  const pp = m.pp ? {side: m.pp, adv: Math.abs(m.n.h - m.n.a)} : null;
  return liveWinProb({diff: s.score.h - s.score.a, secsLeft: regulationLeft(s), phase: s.phase, playoff: s.playoff,
    pp, ppSecs: pp ? ppTimeLeft(s, pp.side) : 0, pre, so: s.so});
}
// The line so far, one point every `step` seconds of game time: the score from the goals,
// the power plays from the shot log, then the live value now.
export function winProbSeries(s, pre = .5, step = 30) {
  const total = s.elapsed || 0;
  const goals = (s.goals || []).map(g => [g.elapsed, g.side]).sort((x, y) => x[0] - y[0]);
  const pp = new Map();
  for (const a of s.shotLog || []) {
    if (!a.strength || a.strength === 'EV') continue;
    pp.set(Math.floor(elapsedAt(s, a.period, a.clock) / step), a.strength === 'PP' ? a.side : other(a.side));
  }
  const out = [];
  for (let t = 0, gi = 0, d = 0; t < total; t += step) {
    while (gi < goals.length && goals[gi][0] <= t) { d += goals[gi][1] === 'h' ? 1 : -1; gi++; }
    const ot = t >= 3 * PERIOD, side = pp.get(Math.floor(t / step));
    const left = ot ? (s.playoff ? PERIOD - (t - 3 * PERIOD) % PERIOD : Math.max(0, REG_OT - (t - 3 * PERIOD))) : 3 * PERIOD - t;
    out.push({t, wp: liveWinProb({diff: ot ? 0 : d, secsLeft: left, phase: ot ? 'ot' : 'reg', playoff: s.playoff,
      pp: side ? {side, adv: 1} : null, ppSecs: side ? 60 : 0, pre})});
  }
  out.push({t: total, wp: winProbNow(s, pre)});
  return out;
}

// Team totals for the live box score.
export function liveTeamStats(s, k) {
  const sum = (side, f) => s[side].dressed.reduce((n, id) => n + (s.box[id]?.[f] || 0), 0);
  const fow = sum(k, 'fow'), oppFow = sum(other(k), 'fow');
  let saves = 0, against = 0;
  for (const id in s.gbox) if (s[k].pl[id]) { saves += s.gbox[id].sa - s.gbox[id].ga; against += s.gbox[id].sa; }
  return {goals: s.score[k], sog: s.shots[k], attempts: s.attempts?.[k] || 0, xg: s.xg?.[k] || 0,
    ppg: s.special[k].goals, ppo: s.special[k].opportunities, fow, foPct: fow + oppFow ? fow / (fow + oppFow) : null,
    hits: sum(k, 'hit'), blocks: sum(k, 'blk'), pim: sum(k, 'pim'), saves, shotsAgainst: against};
}

// The units on the ice for a play, as the broadcast header shows them:
// 'EDM L1 + Pair 2 vs VAN PK1 · 5v4' (the attacking club first).
export function unitsLine(e, s) {
  if (!e?.on) return null;
  const k = e.att || (e.side === 'h' || e.side === 'a' ? e.side : 'h'), o = other(k);
  return `${s[k].abbr} ${e.on[k]} vs ${s[o].abbr} ${e.on[o]} · ${e.str?.[k] ?? '?'}v${e.str?.[o] ?? '?'}`;
}

// The banner a single play earns over the rink, or null. kind picks the colour; block: the
// live game holds on it for a moment (a whistle), instead of playing on underneath.
const CALL_HOLD = {goal: 2600, hat: 2200, pen: 1500, pp: 1600, killed: 1400, fight: 1900, pull: 1500, goalie: 1500, timeout: 1200, 'so-goal': 1300, 'so-miss': 1100, period: 2200, final: 3200};
const mkCall = (kind, side, title, sub, extra = {}) => ({kind, side, title, sub, hold: CALL_HOLD[kind], block: !['killed', 'pull', 'goalie', 'timeout'].includes(kind), ...extra});
function goalTag(e) {
  if (e.empty || / — empty net/.test(e.text || '')) return 'EN';
  const st = e.strength || (/ — power play/.test(e.text || '') ? 'PP' : / — shorthanded/.test(e.text || '') ? 'SH' : 'EV');
  return st === 'PP' || st === 'SH' ? st : null;
}
export function eventCallout(e, s) {
  if (!e) return null;
  const k = e.side, team = k === 'h' || k === 'a' ? s[k] : null, A = side => s[side].abbr;
  const score = `${A('a')} ${s.score.a}, ${A('h')} ${s.score.h}`;
  const who = id => (team && id && team.pl[id]?.name) || null;
  switch (e.t) {
    case 'goal': {
      const tag = goalTag(e);
      const assists = e.assists ? (e.assists.length ? ` (${e.assists.map(id => lastName(team, id)).join(', ')})` : ' (unassisted)') : '';
      const sub = who(e.scorer) ? `${who(e.scorer)}${assists}` : String(e.text || '').replace(/^GOAL! /, '').split('. ')[0];
      return mkCall('goal', k, 'GOAL!', sub, {tag, tagText: {PP: 'Power-play goal', SH: 'Shorthanded goal', EN: 'Empty-net goal'}[tag] || null});
    }
    case 'pen': {
      const name = who(e.pid);
      return mkCall('pen', k, 'PENALTY', name ? `${A(k)} · ${name} · ${e.minutes} min, ${String(e.call || '').toLowerCase()}` : String(e.text || '').replace(/^Penalty: /, ''));
    }
    case 'fight': return mkCall('fight', null, 'FIGHT!', String(e.text || '').replace(/ — five each for fighting\.$/, '') + ' · five minutes each');
    case 'pull': return mkCall('pull', k, 'GOALIE PULLED', `${A(k)} add an extra attacker`);
    case 'goalie': return mkCall('goalie', k, 'GOALIE CHANGE', String(e.text || '').replace(/\.$/, ''));
    case 'timeout': return mkCall('timeout', k, 'TIMEOUT', `${A(k)} rest the unit`);
    case 'so-goal': return mkCall('so-goal', k, 'GOAL!', `${who(e.pid) || A(k)} scores${e.round ? ` · round ${e.round}` : ''}`, {tag: 'SO', tagText: 'Shootout'});
    case 'so-miss': return mkCall('so-miss', k, 'NO GOAL', `${who(e.pid) || A(k)} is stopped${e.round ? ` · round ${e.round}` : ''}`);
    case 'period': {
      if (e.phase === 'so') return mkCall('period', null, 'SHOOTOUT', 'Still tied after overtime');
      if (e.period <= 1) return null;
      if (e.phase === 'ot' && e.period === 4) return mkCall('period', null, 'END OF REGULATION', `Tied ${s.score.h}-${s.score.a} · overtime next`);
      if (e.phase === 'ot') return mkCall('period', null, `END OF ${e.period - 4 > 1 ? `${e.period - 4}OT` : 'OT'}`, `Still tied · ${e.period - 3}OT next`);
      return mkCall('period', null, `END OF THE ${ordinal(e.period - 1).toUpperCase()}`, `${score} · ${ordinal(e.period)} period next`);
    }
    case 'final': {
      const w = s.winner, l = w ? other(w) : null;
      return mkCall('final', w, `FINAL${s.endedIn ? `/${s.endedIn}` : ''}`, w ? `${A(w)} win ${s.score[w]}-${s.score[l]}` : score);
    }
    default: return null;
  }
}
// Every callout a step earns, in order: its plays, then what changed on the ice (a power play
// starting or killed off, a goalie pulled). before/after: manpowerState around the step.
export function liveCallouts(fresh, before, after, s) {
  const out = [];
  for (const e of fresh) {
    const c = eventCallout(e, s);
    if (!c || c.kind === 'pull') continue; // goalie pulls are read from the ice below, user pulls included
    out.push(c);
    if (e.t === 'goal' && e.scorer && s.goals.filter(g => g.scorer === e.scorer).length === 3 && s.goals.at(-1)?.scorer === e.scorer) {
      out.push(mkCall('hat', e.side, 'HAT TRICK!', `${s[e.side].pl[e.scorer]?.name || ''} · three goals`.trim()));
    }
  }
  if (!before || !after || after.phase === 'final' || after.phase === 'so') return out;
  for (const k of ['h', 'a']) {
    if (after.pulled[k] && !before.pulled[k]) out.push(mkCall('pull', k, 'GOALIE PULLED', `${s[k].abbr} go ${after.n[k] + 1}-on-${after.n[other(k)]}`));
  }
  const edge = m => Math.abs(m.n.h - m.n.a);
  if (after.pp && (after.pp !== before.pp || edge(after) > edge(before))) {
    const left = ppTimeLeft(s, after.pp);
    out.push(mkCall('pp', after.pp, 'POWER PLAY', `${s[after.pp].abbr} · ${after.n[after.pp]}-on-${after.n[other(after.pp)]}${left > 0 ? ` · ${clockLabel(left)}` : ''}`));
  } else if (before.pp && after.pp !== before.pp) {
    const scored = fresh.some(e => e.t === 'goal' && e.side === before.pp), called = fresh.some(e => e.t === 'pen' || e.t === 'fight');
    if (!scored && !called) out.push(mkCall('killed', other(before.pp), 'PP KILLED', `${s[other(before.pp)].abbr} kill off the ${s[before.pp].abbr} power play`));
  }
  return out;
}
