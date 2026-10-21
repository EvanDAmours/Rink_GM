// When players hang them up (Gridiron GM 2.79, translated to hockey). Each position has the age an
// established NHL player typically retires at: forwards around 35, defencemen a year later, goalies
// at 37, enforcers and grinders earlier. The chance climbs in the three years before that age and
// keeps climbing after it. Stars play on longer; fringe veterans leave sooner, and unsigned ones
// far more readily: most careers end when nobody calls.
import { clamp } from "./rng.js";
import { isGoalie, isDefense } from "./constants.js";

export const RETIRE_AGE = { F: 35, D: 36, G: 37 };
// Archetypes whose careers end earlier.
const EARLY = { ENF: 2, END: 2, GRN: 1 };
// A superstar or star development trait means a body that lasts.
const LONGEVITY = { superstar: 2, star: 1 };
export function retireAge(p) {
  const base = isGoalie(p.pos) ? RETIRE_AGE.G : isDefense(p.pos) ? RETIRE_AGE.D : RETIRE_AGE.F;
  return base - (EARLY[p.type] || 0) + (LONGEVITY[p.dev] || 0);
}
// Chance by years from his position's retirement age: 3 before, 2 before, ... 4+ after.
const BY_YEAR = [0.04, 0.08, 0.15, 0.27, 0.4, 0.52, 0.62, 0.7];

// p.age: the age he will be next season. freeAgent: unsigned when the season ended.
export function retireChance(p, { freeAgent = p.tid < 0 } = {}) {
  if (p.age >= 45) return 0.95;
  const d = p.age - retireAge(p), o = p.ovr || 0;
  let ch = 0;
  if (d >= -3 && !(d < 0 && o >= 78)) ch = BY_YEAR[Math.min(BY_YEAR.length - 1, d + 3)] + Math.max(0, d - 4) * 0.05;
  // Fringe veterans move on to life after hockey sooner.
  if (o < 76 && p.age >= 31) ch += 0.12;
  if (freeAgent && p.age >= 30 && o < 76) ch += 0.35;
  if (o >= 88) ch *= 0.4;
  else if (o >= 82) ch *= 0.65;
  else if (o < 72) ch *= 1.4;
  return clamp(ch, 0, 0.95);
}
