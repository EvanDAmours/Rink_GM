import {clamp} from './rng.js';

// Transparent, hand-calibrated expected-goal model. These coefficients are
// assumptions, not a fitted or proprietary NHL tracking-data model.
export function shotGeometry(depth, lateral) {
  const distance = Math.hypot(89 - depth, lateral);
  const angle = Math.atan2(Math.abs(lateral), Math.max(1, 89 - depth));
  return {distance, angle};
}

// Skill terms are deviations from reference levels. The simulator passes the
// current league norms (matchup.js), so an average shooter facing an average
// goalie converts at the league rate; 82 is only the standalone default.
// `quality` is an additional log-odds term for the on-ice matchup.
export const XG = Object.freeze({base: -1.715, distance: .034, angle: .72, finishing: .026, goalie: .027,
  rebound: .65, rush: .19, lateral: .34, screen: .14, advantage: .64, openIce: .75});
export function expectedGoal({distance, angle, finishing = 82, goalie = 82, finishingRef = 82, goalieRef = 82, quality = 0, rebound = false, rush = false, lateral = false, screen = false, advantage = 0, openIce = false}) {
  const logit = XG.base - XG.distance * distance - XG.angle * angle
    + XG.finishing * (finishing - finishingRef) - XG.goalie * (goalie - goalieRef)
    + (rebound ? XG.rebound : 0) + (rush ? XG.rush : 0) + (lateral ? XG.lateral : 0)
    + (screen ? XG.screen : 0) + Math.max(-1, Math.min(2, advantage)) * XG.advantage
    + (openIce ? XG.openIce : 0) + quality;
  return clamp(1 / (1 + Math.exp(-logit)), .005, .65);
}

export function shotSkills(player, type) {
  const a = player.attrs;
  let accuracy = a.wac, power = a.wpw;
  if (type === 'slap shot') { accuracy = a.sac; power = a.spw; }
  else if (type === 'one-timer') { accuracy = (a.sac + a.hey) / 2; power = a.spw * .65 + a.wpw * .35; }
  else if (type === 'tip-in' || type === 'rebound') { accuracy = a.hey * .6 + a.wac * .4; power = a.wpw * .6 + a.str * .4; }
  else if (type === 'backhand' || type === 'wraparound') { accuracy = a.wac * .65 + a.puc * .35; power = a.wpw * .7 + a.dek * .3; }
  return {accuracy, power, finishing: accuracy * .55 + power * .35 + a.oaw * .10};
}

export function shiftEfficiency(endurance = 80, seconds = 0) {
  return 1 - clamp(Math.max(0, seconds - 25) / 60 * (100 - endurance) / 100, 0, .12);
}
