// League-relative matchup inputs for the game simulator.
//
// Every skill term in sim.js/shotModel.js is expressed as a deviation from the
// CURRENT league's dressed-lineup mean, so an average offence against an
// average defence and goalie reproduces the calibrated league rates no matter
// how the absolute rating scale drifts through development, drafts and
// retirements. Only relative quality (team vs team, unit vs unit) moves results.
import {composites} from './ratings.js';
import {shotSkills} from './shotModel.js';
import {isGoalie, isDefense} from './constants.js';
import {clamp} from './rng.js';

// Fallback for restored mid-game saves created before norms existed: the
// 2026-27 published-roster means (scripts/simulation-audit / season audit).
export const DEFAULT_NORMS = Object.freeze({skate: 80.4, shoot: 79.2, hands: 79.3, pass: 80.7, def: 79.8, off: 79.9,
  ctrl: 80.1, phys: 78, blk: 79.4, dsc: 78.3, fin: 79.5, acc: 79.6, goalie: 86.3});
const KEYS = ['skate', 'shoot', 'hands', 'pass', 'def', 'off', 'ctrl', 'phys', 'blk', 'dsc'];
const cache = new WeakMap();
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;

function computeNorms(league) {
  const sum = Object.fromEntries(KEYS.map(k => [k, []]));
  const fin = [], acc = [], goalie = [];
  for (const team of league.teams || []) {
    const ps = (team.roster || []).map(id => league.players[id]).filter(p => p && !(p.injury > 0) && !p.ltir && p.attrs);
    const byOvr = (a, b) => b.ovr - a.ovr;
    const f = ps.filter(p => !isGoalie(p.pos) && !isDefense(p.pos)).sort(byOvr).slice(0, 12);
    const d = ps.filter(p => isDefense(p.pos)).sort(byOvr).slice(0, 6);
    const g = ps.filter(p => isGoalie(p.pos)).sort(byOvr)[0];
    for (const p of [...f, ...d]) {
      const c = composites(p);
      for (const k of KEYS) if (Number.isFinite(c[k])) sum[k].push(c[k]);
      const s = shotSkills(p, 'wrist shot'); fin.push(s.finishing); acc.push(s.accuracy);
    }
    if (g) {
      const a = g.attrs, save = mean([a.glh, a.gll, a.sth, a.stl, a.fiv].filter(Number.isFinite));
      goalie.push(composites(g).goalie * .7 + save * .3);
    }
  }
  const out = {};
  for (const k of KEYS) out[k] = Number.isFinite(mean(sum[k])) ? mean(sum[k]) : DEFAULT_NORMS[k];
  out.fin = Number.isFinite(mean(fin)) ? mean(fin) : DEFAULT_NORMS.fin;
  out.acc = Number.isFinite(mean(acc)) ? mean(acc) : DEFAULT_NORMS.acc;
  out.goalie = Number.isFinite(mean(goalie)) ? mean(goalie) : DEFAULT_NORMS.goalie;
  for (const k in out) out[k] = Math.round(out[k] * 100) / 100;
  return out;
}

// Norms are fixed for a season (recomputed when the league year changes), so
// in-season trades or injuries to one club cannot shift every other result.
export function leagueNorms(league) {
  if (!league || typeof league !== 'object') return {...DEFAULT_NORMS};
  const hit = cache.get(league);
  if (hit && hit.year === league.year) return hit.norms;
  const norms = computeNorms(league);
  cache.set(league, {year: league.year, norms});
  return norms;
}

// Club mood. Neutral morale is 50 and neutral chemistry 75 (clubPulse.js keeps
// both 0-100). Each has a small, symmetric, bounded effect on how efficiently a
// club creates offence; together they can never move rates more than +/-3%.
export const FORM_LIMIT = .03;
export function teamForm(team) {
  const morale = Number.isFinite(team?.morale) ? team.morale : 50;
  const chemistry = Number.isFinite(team?.chemistry) ? team.chemistry : 75;
  const m = clamp((morale - 50) / 40, -1, 1) * .02;
  const c = clamp((chemistry - 75) / 20, -1, 1) * .015;
  return clamp(m + c, -FORM_LIMIT, FORM_LIMIT);
}
