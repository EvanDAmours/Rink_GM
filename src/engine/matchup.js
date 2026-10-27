// Team-versus-team quality for the game simulator.
//
// Results come from how good a club is relative to the rest of the league,
// not from a flat roster average: elite players carry a line the way they do
// in the NHL, so a club with two superstars and ordinary depth is an elite
// offence, while a deep club of 80s is merely good. Every term is expressed
// relative to the current league's mean, so the calibrated league averages
// (goals, shots, save percentage) do not move when the rating scale drifts
// through development, drafts and retirements; only relative quality moves
// results. Nothing here rewrites a player's attributes.
import {composites} from './ratings.js';
import {gameLines} from './lines.js';
import {clamp} from './rng.js';

// Ice-time shares by line/pair, matching the simulator's deployment.
const F_SHARE = [.36, .30, .21, .13], D_SHARE = [.42, .34, .24];
// Convexity of star power: a rating `STAR` points above the reference is worth
// e times an average player when a line's offence is pooled.
export const STAR = 7, REF = 80;
const avg = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

// Effective offence, defence and goaltending ratings for a club's dressed
// lineup. Offence pools each line's players convexly (stars dominate) and
// weights lines by ice time; defence is the ice-time weighted average of the
// defence corps and the forwards' defensive play; goaltending blends the
// starter with the backup by his usual share of starts.
export function teamStrength(league, team) {
  const lines = gameLines(league, team);
  const get = id => league.players[id];
  const comp = new Map();
  const c = p => { if (!comp.has(p.id)) comp.set(p.id, composites(p)); return comp.get(p.id); };
  const rows = (ids, w, f) => {
    let total = 0, weight = 0;
    ids.forEach((row, i) => { const ps = row.map(get).filter(p => p && p.attrs); if (ps.length) { total += f(ps) * w[i]; weight += w[i]; } });
    return weight ? total / weight : REF;
  };
  // Pool offence across the whole lineup before taking the log, so one elite
  // line raises the club's offence instead of being averaged away by depth.
  const pool = (ids, w) => rows(ids, w, ps => avg(ps.map(p => Math.exp((c(p).off - REF) / STAR))));
  const off = REF + STAR * Math.log(pool(lines.F, F_SHARE) * .8 + pool(lines.D, D_SHARE) * .2 || 1);
  const def = rows(lines.D, D_SHARE, ps => avg(ps.map(p => c(p).def))) * .7 + rows(lines.F, F_SHARE, ps => avg(ps.map(p => c(p).def))) * .3;
  const g1 = get(lines.G[0]), g2 = get(lines.G[1]);
  const gRating = p => p && p.attrs ? c(p).goalie : REF;
  const goalie = g1 ? gRating(g1) * .8 + gRating(g2 || g1) * .2 : REF;
  return {off, def, goalie, net: off - REF + (def - REF) + (goalie - REF) * .6};
}

// League means, fixed for a season so that one club's injuries or trades
// cannot shift every other club's results mid-season.
// The means are stored on the league itself so a loaded save plays exactly
// like the live session: a cache held outside the save would be recomputed
// from mid-season rosters and injuries and quietly change every result.
export const DEFAULT_MEANS = Object.freeze({off: 83.2, def: 81.6, goalie: 85.5});
export function leagueStrength(league) {
  if (!league?.teams?.length) return DEFAULT_MEANS;
  const hit = league.strengthMeans;
  if (hit && hit.year === league.year && hit.means) return hit.means;
  const all = league.teams.map(t => teamStrength(league, t));
  const means = {off: avg(all.map(s => s.off)), def: avg(all.map(s => s.def)), goalie: avg(all.map(s => s.goalie))};
  league.strengthMeans = {year: league.year, means};
  return means;
}

// A club's rating-point edge in a given game: its offence against the
// opponent's defence, both relative to the league. Zero means an average
// matchup; positive favours the club. Goaltending is handled shot by shot.
export function matchupEdge(league, team, opponent) {
  const mu = leagueStrength(league), us = teamStrength(league, team), them = teamStrength(league, opponent);
  return clamp((us.off - mu.off) - (them.def - mu.def), -8, 8);
}

// The system a bench plays when the GM has not chosen one. A coach's preferred
// style is kept unless the personnel plainly call for something else: a club
// built on elite offence with ordinary goaltending plays to its strength, and
// a club carried by its goalie and defence tightens up.
export function defaultStyle(league, team) {
  if (team.strategy) return team.strategy;
  const style = team.coach?.style || 'balanced';
  if (!league?.teams?.length) return style;
  const mu = leagueStrength(league), s = teamStrength(league, team);
  const attack = (s.off - mu.off) - ((s.def - mu.def) + (s.goalie - mu.goalie) * .6) / 2;
  if (attack >= 2 && style === 'defend') return 'balanced';
  if (attack >= 3.5) return 'attack';
  if (attack <= -2 && style === 'attack') return 'balanced';
  if (attack <= -3.5) return 'defend';
  return style;
}

// Pre-game win probability from the two clubs' strength (offence, defence and
// goaltending) plus home ice. Used by previews and odds; never by the simulator.
// HOME_EDGE is the log-odds the simulator's home ice is actually worth (sim.js HOME: last change,
// shot quality, zone entries, calls), measured over seeded seasons: home clubs win ~54.6%.
export const HOME_EDGE = .19;
export function winProbability(league, team, opponent, { home = true } = {}) {
  const a = teamStrength(league, team), b = teamStrength(league, opponent);
  const net = (a.off - b.off) + (a.def - b.def) + (a.goalie - b.goalie) * .6;
  return clamp(1 / (1 + Math.exp(-(net * .11 + (home ? HOME_EDGE : -HOME_EDGE)))), .12, .88);
}
