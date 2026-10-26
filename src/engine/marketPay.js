// Contracts on the real NHL market (Gridiron GM's "real market" pricing, translated).
// A player's asking price follows his LEAGUE RANK at his position group (C, W = LW+RW, D, G):
// the game's opening 2026 ratings at ranks 1, 3, 5, 10, 20, 32, 50, 64, 96, 128, 160, 192 are
// paired with real 2025-26 cap hits at the same ranks, stored as SHARES of the 2025-26 cap
// ($95.5M) so prices scale with any future cap. Sources and method: docs/CONTRACT_MARKET.md.
import { isGoalie, isDefense, capForYear, minSalaryForYear, maxSalaryForYear } from "./constants.js";

export const MARKET_CAP_2025 = 95.5;
export const MARKET_RANKS = [1, 3, 5, 10, 20, 32, 50, 64, 96, 128, 160, 192];
// ovr: the game's opening (2026) NHL-roster ratings at those ranks; pay: real 2025-26 cap hits ($M).
export const MARKET_TABLE = {
  C: { ovr: [99, 96, 95, 93, 89, 87, 86, 85, 81, 78, 77, 75], pay: [14.0, 12.6, 11.6, 9.5, 8.25, 7.25, 5.75, 4.75, 3.25, 2.0, 1.35, 0.95] },
  W: { ovr: [97, 94, 93, 91, 89, 88, 86, 85, 81, 79, 78, 76], pay: [12.0, 11.64, 11.25, 9.5, 8.5, 7.5, 6.25, 5.25, 4.0, 2.75, 1.85, 1.15] },
  D: { ovr: [95, 95, 93, 91, 88, 87, 86, 86, 85, 80, 78, 77], pay: [11.5, 11.0, 9.58, 9.25, 8.25, 7.0, 5.5, 4.5, 3.25, 2.25, 1.5, 1.0] },
  G: { ovr: [94, 92, 90, 87, 85, 84, 80, 79], pay: [11.5, 9.5, 8.25, 6.0, 4.5, 3.25, 1.8, 1.1] },
};
export const marketGroup = (pos) => (isGoalie(pos) ? "G" : isDefense(pos) ? "D" : pos === "C" ? "C" : "W");

// Anchors as [ovr, share] pairs, strictly descending in rating: ties are averaged (95 twice for
// D), and the two lists are trimmed to the same length (a pay list one longer than its ratings
// list made NaN prices in the football game).
const ANCHORS = Object.fromEntries(Object.entries(MARKET_TABLE).map(([k, { ovr, pay }]) => {
  const n = Math.min(ovr.length, pay.length), out = [];
  for (let i = 0; i < n; i++) {
    const last = out[out.length - 1];
    const share = pay[i] / MARKET_CAP_2025;
    if (last && last.o === ovr[i]) { last.sum += share; last.n++; } else out.push({ o: ovr[i], sum: share, n: 1 });
  }
  return [k, out.map((a) => [a.o, a.sum / a.n])];
}));
export const MIN_SHARE = 0.85 / 104; // the 2026-27 league minimum as a share of that cap
export const MAX_SHARE = 0.2;        // CBA maximum: 20% of the cap

// Cap share for a rating at a position group. Above the #1 rating a small premium (up to 6%),
// below the last anchor a straight decline to the league minimum over 6 points.
function baseShare(a, ovr) {
  const [o0, s0] = a[0];
  if (ovr >= o0) return Math.min(MAX_SHARE, s0 * Math.min(1.06, 1 + 0.015 * (ovr - o0)));
  for (let i = 1; i < a.length; i++) {
    const [o1, s1] = a[i];
    if (ovr >= o1) { const [oh, sh] = a[i - 1]; return s1 + ((ovr - o1) / (oh - o1)) * (sh - s1); }
  }
  const [ol, sl] = a[a.length - 1];
  return Math.max(MIN_SHARE, sl - ((ol - ovr) / 6) * (sl - MIN_SHARE));
}
export function marketShare(group, ovr) {
  const a = ANCHORS[group] || ANCHORS.W;
  if (!Number.isFinite(ovr)) return MIN_SHARE;
  const o0 = a[0][0];
  if (ovr >= o0) return baseShare(a, ovr);
  // The middle of the market is lifted (MARKET_LIFT): real payrolls carry veterans on deals signed
  // before they aged and fewer discounted RFAs, so pricing the game's rosters at the bare rank
  // table left AI clubs at the cap floor. The lift never prices a player above one up to 3 points
  // better (less near the top), so the stars stay at real prices and value never falls with rating.
  // Below the last anchor (fourth-liners and call-ups) no lift: they slide to the minimum.
  if (ovr < a[a.length - 1][0]) return baseShare(a, ovr);
  const d = 3 * Math.min(1, (o0 - ovr) / 8);
  return Math.min(MARKET_LIFT * baseShare(a, ovr), baseShare(a, ovr + d));
}
export const MARKET_LIFT = 1.25;

// NHL aging: about x0.85 at 31-32, x0.7 at 33-34, x0.5 at 35-36. Goalies age two years later.
const AGE_PAY = { 30: 0.96, 31: 0.9, 32: 0.82, 33: 0.74, 34: 0.64, 35: 0.55, 36: 0.5 };
export const careerAge = (p) => (p?.age ?? 27) - (isGoalie(p?.pos) ? 2 : 0);
export function agePay(p) {
  const a = careerAge(p);
  if (a < 30) return 1;
  return AGE_PAY[a] ?? 0.45;
}

// Rating-rank market value ($M) before role, mood and RFA adjustments.
export function rankValue(p, year) {
  let v = marketShare(marketGroup(p.pos), p.ovr) * capForYear(year) * agePay(p);
  // Young players with upside cost a little more (unchanged from the old table).
  if (p.age <= 22 && p.pot > p.ovr) v *= 1 + Math.min(0.25, (p.pot - p.ovr) * 0.03);
  return Math.max(minSalaryForYear(year), Math.min(maxSalaryForYear(year), v));
}

// Term: young stars long (6-8), prime 3-6, 30+ shorter, 35+ one year. Goalies age two years
// later. h: a deterministic 0..1 number per player so the ask doesn't change every render.
export function marketTerm(p, h) {
  const a = careerAge(p), ovr = p.ovr;
  const pick = (lo, hi) => lo + Math.min(hi - lo, Math.floor(h * (hi - lo + 1)));
  if ((p.age ?? 0) >= 35) return 1;
  if (ovr < 76) return pick(1, 2);
  if (a <= 25) return ovr >= 88 ? pick(6, 8) : ovr >= 82 ? pick(4, 7) : pick(2, 4);
  if (a <= 29) return ovr >= 85 ? pick(4, 6) : ovr >= 80 ? pick(3, 5) : pick(2, 4);
  if (a <= 31) return ovr >= 85 ? pick(2, 4) : pick(1, 3);
  if (a <= 34) return pick(1, 2);
  return 1;
}
// CBA term limits: 8 years re-signing with your own club, 7 on the open market.
export const MAX_TERM_RESIGN = 8;
export const MAX_TERM_UFA = 7;

// Entry-level contracts: a 3-year deal for signings at 18-21, 2 at 22-23, 1 at 24+ (hockeyRules
// elcTerm). Salary: the ELC maximum for top-10 picks, sliding toward the minimum by pick 160;
// undrafted signings start near the minimum.
export function elcAmount(year, max, pick) {
  const min = minSalaryForYear(year);
  if (!(pick > 0)) return Math.round((min + (max - min) * 0.15) * 1000) / 1000;
  const f = pick <= 10 ? 1 : Math.max(0, 1 - (pick - 10) / 150);
  return Math.round((min + (max - min) * f) * 1000) / 1000;
}
