// Player creation, contracts, progression, aging and valuation.
import { uid, gauss, clamp, rand, randInt, chance, pick, stream } from "./rng.js";
import { generateAttributes, defaultArchetype, progressAttributes, computeOvr } from "./ratings.js";
import { isGoalie, isDefense, capForYear, minSalaryForYear, maxSalaryForYear } from "./constants.js";
import { randomName } from "./names.js";
import { rankValue, marketTerm } from "./marketPay.js";

export const blankSkaterStats = () => ({ gp: 0, g: 0, a: 0, pts: 0, pm: 0, pim: 0, sog: 0, hit: 0, blk: 0, toi: 0, ppg: 0, ppp: 0, shg: 0, gwg: 0, fow: 0, fol: 0 });
export const blankGoalieStats = () => ({ gp: 0, gs: 0, w: 0, l: 0, otl: 0, sa: 0, ga: 0, so: 0, toi: 0 });
export const blankStats = (pos) => (isGoalie(pos) ? blankGoalieStats() : blankSkaterStats());

export function estimatePotential(ovr, age) {
  let bump = 0;
  if (age <= 19) bump = 9;
  else if (age <= 20) bump = 7;
  else if (age <= 21) bump = 5.5;
  else if (age <= 22) bump = 4;
  else if (age <= 23) bump = 2.5;
  else if (age <= 24) bump = 1.5;
  else if (age <= 25) bump = 0.7;
  return clamp(Math.round(ovr + bump + gauss(0, bump * 0.3)), ovr, 99);
}

// Development traits: how quickly a young player grows into (or past) his ceiling, and how
// long he lasts. Generational (Gridiron 1.5) is the once-a-decade tier above Superstar.
export const DEV_TRAITS = {
  generational: { name: "Generational", desc: "A once-in-a-generation talent: grows the fastest, keeps raising his ceiling and ages the slowest." },
  superstar: { name: "Superstar", desc: "Develops very fast and often blows past his projected ceiling. Stays in his prime longer." },
  star: { name: "Star", desc: "Develops faster than most and tends to beat his projection." },
  normal: { name: "Normal", desc: "Develops on a typical curve." },
  late: { name: "Late bloomer", desc: "Slow as a teenager, then catches up fast in his early twenties." },
};
// Best first, for sorting and comparing traits.
export const DEV_RANK = { generational: 4, superstar: 3, star: 2, normal: 1, late: 0 };
export const DEV_GROWTH = { generational: 1.4, superstar: 0.9, star: 0.45, normal: 0, late: 0 };
const DEV_POT_DRIFT = { generational: 0.9, superstar: 0.55, star: 0.25, normal: 0, late: 0.1 };

// Draft projections (Gridiron 1.997): a ceiling of 96 or more is a Generational talent.
export const GENERATIONAL_POT = 96;
export const isGenerationalPot = (pot) => Number(pot) >= GENERATIONAL_POT;
export const potTier = (pot) => (isGenerationalPot(pot) ? "Generational talent" : null);

// A player's trait is fixed by who he is (his id), not by the main random stream. A Generational
// talent turns up only at the very top of a class (ceilings of 93 and up): about one draft in five.
export function rollDev(id, pot = 80) {
  const x = stream(`${id}|dev`).next();
  const q = clamp((pot - 92) / 5, 0, 1), gen = 0.35 * q ** 2.3;
  if (x < gen) return "generational";
  // The rest follow the ceiling, as real classes do (Gridiron's odds): a 90-ceiling prospect is a
  // Superstar about 1 time in 50 and a Star about 1 in 5; a 75 about 1 in 500 and 1 in 10 (tightened so
  // the league's Superstar count holds steady: about one new Superstar per draft class).
  const y = (x - gen) / (1 - gen);
  const r = clamp((pot - 65) / 25, 0, 1);
  const sup = 0.0005 + 0.02 * r ** 4, star = sup + 0.05 + 0.17 * r;
  if (y < sup) return "superstar";
  if (y < star) return "star";
  if (y < star + 0.18) return "late";
  return "normal";
}

// ---------- Aging (Gridiron 2.80) ----------
// Goalies peak about three years later than forwards, defensemen about one.
export const ageShift = (p) => (isGoalie(p.pos) ? 3 : isDefense(p.pos) ? 1 : 0);
// The great ones last: a Generational talent keeps his prime three years longer and declines at
// half the usual pace; a Superstar two years longer, at 85%. Both play on longer before retiring.
export const PRIME_BONUS = { generational: 3, superstar: 2 };
export const DECLINE_PACE = { generational: 0.5, superstar: 0.85 };
export const LONGEVITY = { generational: 4, superstar: 2 };
// The wall: from 33 (34 for defensemen, 36 for goalies) most players lose an extra point or two
// a year, two or three from two years later. Generational talents and elite goalies (88+) escape
// it; a Superstar meets a softer one a year later.
export const WALL_AGE = 33;
const spared = (p, trait) => trait === "generational" || (isGoalie(p.pos) && (p.ovr || 0) >= 88);
export const hitsTheWall = (p, trait = p.dev) => !spared(p, trait) && trait !== "superstar";
// The wall's toll this summer. p.age: the age he plays next season.
export function wallToll(p, trait = p.dev, r = rand) {
  const eff = p.age - ageShift(p);
  if (hitsTheWall(p, trait) && eff >= WALL_AGE) return eff >= WALL_AGE + 2 ? 1 + Math.floor(r() * 3) : 1 + Math.floor(r() * 2);
  if (trait === "superstar" && !spared(p, trait) && eff >= WALL_AGE + 1) return Math.floor(r() * 2);
  return 0;
}
// The average toll, for projections.
export const expectedWall = (p, trait = p.dev) => {
  const eff = p.age - ageShift(p);
  return hitsTheWall(p, trait) && eff >= WALL_AGE ? (eff >= WALL_AGE + 2 ? 2 : 1.5) : trait === "superstar" && !spared(p, trait) && eff >= WALL_AGE + 1 ? 0.5 : 0;
};
// The last age of his prime (the age he can still hold his level), for the card.
export const primeEnd = (p, trait = p.dev) => 27 + ageShift(p) + (PRIME_BONUS[trait] || 0);

// Mean OVR change from age and trait this summer (p.age: the age he plays next season), before
// usage, training, the wall and the league anchors. developmentPlan.js reads the same curve.
export function ageCurve(p) {
  const trait = p.dev;
  let age = p.age - ageShift(p);
  // A longer prime: the decline starts later.
  if (age >= 26) age = Math.max(26, age - (PRIME_BONUS[trait] || 0));
  let mean = age <= 19 ? 3 : age <= 21 ? 2.2 : age <= 23 ? 1.4 : age <= 25 ? 0.6 : age <= 27 ? 0 : age <= 29 ? -0.6 : age <= 31 ? -1.3 : age <= 33 ? -2 : -2.6;
  if (p.age <= 25) {
    const gap = p.pot - p.ovr;
    mean += gap > 0 ? Math.min(1.5, gap * 0.12) : gap * 0.3;
    mean += DEV_GROWTH[trait] || 0;
    // Late bloomers trade teenage growth for a surge at 22-25.
    if (trait === "late") mean += age <= 21 ? -0.7 : 0.8;
  }
  if (mean < 0 && DECLINE_PACE[trait]) mean *= DECLINE_PACE[trait];
  // The air is thin at the top: elite ratings are hard to climb further.
  if (p.ovr >= 88 && mean > 0) mean = Math.max(0, mean - (p.ovr - 86) * 0.3);
  return mean;
}
function ageSpread(p) {
  const age = p.age - ageShift(p);
  return age <= 19 ? 2.2 : age <= 21 ? 2 : age <= 23 ? 1.8 : age <= 25 ? 1.5 : age <= 29 ? 1.3 : age <= 31 ? 1.5 : age <= 33 ? 1.7 : 2;
}

// ---------- Work ethic and breakouts (Gridiron 2.77) ----------
// His work ethic, as a Combine interview grades it (the interview's own number when you have it).
const ETHIC_BASE = { generational: 94, superstar: 90, star: 85, normal: 77, late: 73 };
export function workEthic(p) {
  const g = p.scout?.intv?.grade;
  if (g) return g[0] === "A" ? 90 : g[0] === "B" ? 80 : 70;
  return (ETHIC_BASE[p.dev] ?? 77) + stream(`${p.id}|intv`).gauss(0, 3.5);
}
export const highWorkEthic = (p) => workEthic(p) >= 86;
// Breakout seasons are rare: 3% for a young Star or better (+3), 1.5% for a young Normal developer
// (+2), and 3% for a hard worker 28 or younger (+1). p.age: the age he plays next season.
export function breakoutRoll(p, r = rand) {
  if (p.age > 28) return 0;
  const d = p.dev;
  if (p.age <= 25) {
    const odds = d === "generational" || d === "superstar" || d === "star" ? 0.03 : d === "normal" ? 0.015 : 0;
    if (odds && r() < odds) return d === "normal" ? 2 : 3;
  }
  return highWorkEthic(p) && r() < 0.03 ? 1 : 0;
}

// Move a player's rating by exactly n OVR through his attributes (honours, milestones, breakouts):
// attribute noise is pulled back so the overall lands where it should. Returns the change.
export function growBy(p, n) {
  const before = p.ovr;
  const want = clamp(before + n, 40, 99);
  if (want === before) return 0;
  progressAttributes(p, want - before);
  const drift = p.ovr - want;
  if (Math.abs(drift) >= 1) progressAttributes(p, -drift);
  if ((p.pot || 0) < p.ovr) p.pot = p.ovr;
  p.peak = Math.max(p.peak || 0, p.ovr);
  return p.ovr - before;
}

export function createPlayer(opts, year) {
  const pos = opts.pos;
  const type = opts.type || defaultArchetype(pos);
  const ovrTarget = clamp(Math.round(opts.ovr), 40, 99);
  const age = opts.age ?? (opts.born ? year - opts.born : 25);
  const attrs = opts.attrs ? {...opts.attrs} : generateAttributes(ovrTarget, type, pos);
  const p = {
    id: opts.id || uid("p"),
    name: opts.name,
    nat: opts.nat || "",
    pos,
    type,
    age,
    shoots: opts.shoots || (pos === "RD" || pos === "RW" ? (chance(0.7) ? "R" : "L") : chance(0.75) ? "L" : "R"),
    attrs,
    ovr: computeOvr(attrs, type),
    pot: 0,
    cap: opts.cap ?? 0,
    yrs: opts.yrs ?? 0,
    src: opts.src || "gen",
    ...(Number.isInteger(opts.number)?{number:opts.number}:{}),
    tid: opts.tid ?? -1,
    injury: 0,
    stats: blankStats(pos),
    pstats: blankStats(pos),
    career: [],
    draft: opts.draft ? {...opts.draft} : null,
    rookie: opts.rookie ?? age <= 21,
  };
  p.pot = opts.pot ? Math.max(opts.pot, p.ovr) : estimatePotential(p.ovr, age);
  p.dev = opts.dev || rollDev(p.id, p.pot);
  return p;
}

// Fictional player at a given talent level (depth fill, random leagues, FA filler).
export function generatePlayer(pos, ovr, age, year, extra = {}) {
  const { name, nat } = randomName();
  return createPlayer({ name, nat, pos, ovr, age, src: "gen", ...extra }, year);
}

// Market AAV ($M) for a player of a given OVR at age, scaled to the cap.
// What a player earns on the open market under a $104M cap (2026-27), by overall.
// Anchors: 99s and 97s get $15-17M (Kaprizov $17M, Draisaitl $14M, Matthews $13.25M),
// 92-94 first-liners $12-13M, 88 top-line or top-pair players about $8.6M, middle-six
// forwards and second-pair D (80-86) $3.3-7.4M, depth near the league minimum. A full
// roster priced this way comes to roughly the cap, as NHL payrolls do.
// Priced by league rank at his position, matched to real NHL cap hits at the same rank
// (marketPay.js), with NHL aging (goalies two years later).
export function marketValue(p, year) {
  return round2(clamp(rankValue(p, year), minSalaryForYear(year), maxSalaryForYear(year)));
}

export const round2 = (x) => Math.round(x * 100) / 100;

export function isRFA(p) {
  return p.signed !== false && p.age < 27 && (p.service?.years ?? Math.max(0,p.age-20)) < 7;
}

// What a player asks for in a new deal. `mood` 0..1 (higher = happier = cheaper).
export function contractAsk(p, year, { mood = 0.5, mult = 1 } = {}) {
  let aav = marketValue(p, year) * mult;
  if (isRFA(p)) aav *= 0.85;
  aav *= 1.08 - 0.16 * mood;
  aav = round2(clamp(aav, minSalaryForYear(year), maxSalaryForYear(year)));
  const yrs = marketTerm(p, (randIntSeeded(p, 0, 999) + 0.5) / 1000);
  return { aav, yrs };
}

// Deterministic per-player "random" so the ask doesn't change every render.
function randIntSeeded(p, a, b) {
  let h = 0;
  for (let i = 0; i < p.id.length; i++) h = (h * 31 + p.id.charCodeAt(i)) >>> 0;
  h = (h + p.age * 7919) >>> 0;
  return a + (h % (b - a + 1));
}

// Yearly development (p.age: the age he plays next season). Returns the OVR change; the wall's
// toll this summer is left on p.wallToll for the off-season report.
export function developPlayer(p, bonus = 0) {
  const before = p.ovr;
  const mean = ageCurve(p) + bonus;
  let delta = gauss(mean, ageSpread(p));
  // Past the wall nobody improves, and the toll comes on top.
  const toll = wallToll(p);
  if (toll) delta = Math.min(delta, 0) - toll;
  p.wallToll = toll || undefined;
  // Ceilings (Gridiron 1.75): a young player at his ceiling only creeps past it now and then.
  // Superstars and Generational talents outgrow theirs; honours and big seasons (applied after
  // this) are the other way through.
  if (p.age <= 25 && delta > 0 && p.dev !== "generational" && p.dev !== "superstar") {
    const room = Math.max(0, (p.pot || before) - before);
    if (delta > room) delta = room + (rand() < (p.dev === "star" ? 0.4 : 0.25) ? Math.min(1, delta - room) : 0);
  }
  if (before + delta > 99) delta = 99 - before;
  progressAttributes(p, delta);
  // Attribute noise can drift OVR; pull it back toward the intended change.
  const drift = p.ovr - (before + delta);
  if (Math.abs(drift) >= 1) progressAttributes(p, -drift);
  if (p.age <= 25) p.pot = clamp(Math.round(Math.max(p.ovr, p.pot + gauss(-0.3 + (DEV_POT_DRIFT[p.dev] || 0), 1.2))), p.ovr, 99);
  else p.pot = p.ovr;
  p.peak = Math.max(p.peak || 0, p.ovr);
  return p.ovr - before;
}

// p.age: the age he would play next season. Generational talents and Superstars retire later.
export function retirementChance(p) {
  if (p.age >= 45) return 0.95;
  const age = p.age - (LONGEVITY[p.dev] || 0);
  let c = 0;
  if (age >= 34) c = 0.1 + 0.12 * (age - 34);
  if (p.ovr < 78 && age >= 32) c += 0.2;
  if (p.tid < 0 && p.age >= 30 && p.ovr < 76) c += 0.35;
  if (p.ovr >= 85) c *= 0.35;
  else if (p.ovr >= 80) c *= 0.65;
  if (isGoalie(p.pos)) c *= 0.8;
  return clamp(c, 0, 0.95);
}

// Asset value for trade logic (roughly exponential in OVR).
// Trade value is value above replacement. A 72 OVR skater is what any club can find on
// waivers or in the AHL, so he (and anyone below) is worth nothing in a trade, and a body
// that takes a roster spot costs a little. Above that the curve is steep: one 88 is worth
// far more than three 76s. Young players are valued partly on what they'll become.
export const REPLACEMENT_OVR = 72;
const valueCurve = (o) => Math.exp((o - 70) / 6.2);
const POT_WEIGHT = (age) => (age <= 19 ? 0.55 : age <= 21 ? 0.5 : age === 22 ? 0.4 : age === 23 ? 0.3 : age === 24 ? 0.2 : age === 25 ? 0.1 : 0);
export function tradeValue(p, year, { contending = false, rental = 0 } = {}) {
  const eff = p.ovr + Math.max(0, (p.pot ?? p.ovr) - p.ovr) * POT_WEIGHT(p.age);
  let v = valueCurve(eff) - valueCurve(REPLACEMENT_OVR);
  // At or below replacement level: a small negative for the roster spot.
  if (v <= 0) return Math.max(-0.4, v * 0.5);
  if (p.age >= 35) v *= 0.55;
  else if (p.age >= 34) v *= 0.65;
  else if (p.age >= 32) v *= 0.75;
  else if (p.age >= 29) v *= 0.9;
  // A player in the last year of his deal is a rental once the season is under way: the
  // buyer gets what is left of it, not a contract. At the deadline that is about 0.64.
  // Young expiring players are RFAs: the rights come with them, so no rental discount.
  if (rental > 0 && p.yrs <= 1 && p.age >= 24) v *= 1 - 0.45 * rental;
  if (p.yrs > 0) {
    // Contract: cap hit against what he'd earn, stretched by the years left on it.
    const surplus = marketValue(p, year) - p.cap;
    const term = Math.min(Math.max(0, p.yrs - 1), 4);
    v *= clamp(1 + surplus * 0.05 * (1 + term * 0.15), 0.55, 1.45);
  }
  if (isGoalie(p.pos)) v *= 0.9;
  // Contenders want help now; rebuilders want youth and pass on veterans.
  if (contending && p.age >= 28) v *= 1.15;
  if (!contending && p.age <= 23) v *= 1.15;
  if (!contending && p.age >= 30) v *= 0.85;
  if (p.injury > 20) v *= 0.7;
  return v;
}

export function prospectValue(p, { contending = false } = {}) {
  let v = Math.exp((p.pot - 74) / 6.5) * 0.9 + Math.exp((p.ovr - 70) / 6.2) * 0.3;
  if (!contending) v *= 1.15;
  return v;
}

export function fmtMoney(m) {
  if (m == null) return "-";
  if (m >= 1) return "$" + m.toFixed(m >= 10 ? 1 : 2) + "M";
  return "$" + Math.round(m * 1000) + "K";
}

export const fullPosName = (pos) => ({ C: "Center", LW: "Left Wing", RW: "Right Wing", LD: "Left Defense", RD: "Right Defense", G: "Goalie" })[pos] || pos;

export function seasonLine(p, year, abbr) {
  return { year, team: abbr, ...p.stats };
}

export function pointsShare(p) {
  return p.stats.gp ? (p.stats.pts / p.stats.gp).toFixed(2) : "0.00";
}

export function savePct(s) {
  return s.sa ? (1 - s.ga / s.sa) : 0;
}
export function gaa(s) {
  return s.toi ? (s.ga * 3600) / s.toi : 0;
}

export function randomAgeForDepth() {
  return pick([22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]);
}

export function chanceInjury(p) {
  const dur = p.attrs.dur ?? 80;
  return 0.0055 * (1 + (85 - dur) / 40);
}

export function injuryLength() {
  const r = rand();
  if (r < 0.55) return randInt(1, 4);
  if (r < 0.85) return randInt(5, 15);
  if (r < 0.97) return randInt(16, 35);
  return randInt(36, 70);
}

export { isDefense };
