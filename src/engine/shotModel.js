import {clamp} from './rng.js';

// Transparent, hand-calibrated expected-goal model. These coefficients are
// assumptions, not a fitted or proprietary NHL tracking-data model.
export function shotGeometry(depth, lateral) {
  const distance = Math.hypot(89 - depth, lateral);
  const angle = Math.atan2(Math.abs(lateral), Math.max(1, 89 - depth));
  return {distance, angle};
}

// `quality` is an extra log-odds term for the team matchup (sim.js EDGE).
export function expectedGoal({distance, angle, finishing = 82, goalie = 82, quality = 0, rebound = false, rush = false, lateral = false, screen = false, advantage = 0, openIce = false}) {
  const logit = -1.39 - .034 * distance - .72 * angle + quality
    + .022 * (finishing - 82) - .018 * (goalie - 82)
    + (rebound ? .65 : 0) + (rush ? .19 : 0) + (lateral ? .34 : 0)
    + (screen ? .14 : 0) + Math.max(-1, Math.min(2, advantage)) * .52
    + (openIce ? .75 : 0);
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
