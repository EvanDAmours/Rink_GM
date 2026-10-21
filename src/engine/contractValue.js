// What a player's next contract is worth, beyond his rating: the role he plays (the market pays
// snipers more than grinders), the season he just had (a big year costs more, a down year means a
// prove-it deal), and the years he has given your club (a loyal player takes less to stay). Also
// who counts as a franchise player, the kind AI clubs never let walk.
// Gridiron GM 1.85, 2.87, 3.32 and 1.54, translated to hockey.
import { clamp } from "./rng.js";
import { isGoalie, isDefense, ARCHETYPES } from "./constants.js";

const r2 = (x) => Math.round(x * 100) / 100;

// ---------- Contract value by role (3.32) ----------
// At equal rating the market pays less for defensive and depth roles and a little more for the
// players who drive offence. Wingers earn a touch less than centres. Existing deals are unchanged;
// this only moves asks (free agency, re-signings, extensions).
export const ROLE_PAY = { SNP: 1.05, PLY: 1.04, PWF: 1, TWF: 0.93, GRN: 0.84, ENF: 0.76, OFD: 1.04, TWD: 0.97, DFD: 0.9, END: 0.8 };
export function rolePay(p) {
  if (!p || isGoalie(p.pos)) return 1;
  const base = ROLE_PAY[p.type] ?? 1;
  return r2(base * (p.pos === "LW" || p.pos === "RW" ? 0.97 : 1));
}
// The archetype tag's hover text and whether it is a bargain role (a $ on the tag).
export function roleTag(p) {
  if (!p || isGoalie(p.pos)) return null;
  const name = ARCHETYPES[p.type]?.name || p.type;
  const f = ROLE_PAY[p.type] ?? 1;
  const pct = Math.round(Math.abs(1 - f) * 100);
  return {
    name,
    bargain: f < 0.95,
    premium: f > 1.02,
    title: f < 0.99 ? `${name}: the market pays this role about ${pct}% less than a scorer of the same rating.` : f > 1.01 ? `${name}: the market pays this role about ${pct}% more.` : `${name}: paid at the going rate for his rating.`,
  };
}

// ---------- Production against rating (1.85) ----------
// Stamped when re-sign week opens, from the season just played: where his production ranks among
// players at his spot against where his rating ranks. f above 1: he outplayed his rating; below 1:
// a down year. Players with too few games keep f = 1.
const groupOf = (p) => (isGoalie(p.pos) ? "G" : isDefense(p.pos) ? "D" : "F");
function production(p) {
  const s = p.stats || {};
  if (isGoalie(p.pos)) return s.sa ? 1 - s.ga / s.sa : 0;
  const gp = Math.max(1, s.gp || 0);
  if (isDefense(p.pos)) return ((s.pts || 0) + 0.1 * (s.blk || 0) + 0.05 * (s.hit || 0)) / gp;
  return ((s.pts || 0) + 0.25 * (s.g || 0)) / gp;
}
const enough = (p) => (isGoalie(p.pos) ? (p.stats?.gp || 0) >= 15 : (p.stats?.gp || 0) >= 20);
export const PERF_RANGE = [0.8, 1.2];
export function stampPerformance(league) {
  const field = { F: [], D: [], G: [] };
  for (const t of league.teams) for (const id of [...t.roster, ...t.prospects]) {
    const p = league.players[id];
    if (p && p.signed !== false && enough(p)) field[groupOf(p)].push(p);
  }
  for (const list of Object.values(field)) {
    if (list.length < 6) continue;
    const rank = (key) => { const sorted = [...list].sort((a, b) => key(a) - key(b)); const at = new Map(sorted.map((p, i) => [p.id, i / (sorted.length - 1)])); return (p) => at.get(p.id); };
    const prod = rank(production), rate = rank((p) => p.ovr);
    for (const p of list) p.perf = { year: league.year, f: r2(clamp(1 + (prod(p) - rate(p)) * 0.5, PERF_RANGE[0], PERF_RANGE[1])) };
  }
}
// His last season counts when his own club negotiates (re-sign or extension): this off-season's
// stamp, or last season's during the year. A down year makes a 1-year prove-it deal nearly full price.
export function perfFactor(league, p, yrs, kind) {
  if (kind === "fa" || !p?.perf) return 1;
  const fresh = p.perf.year === league.year || p.perf.year === league.year - 1;
  const f = fresh ? p.perf.f : 1;
  return f < 1 && yrs === 1 ? r2(1 - (1 - f) * 0.25) : f;
}
// Plain words for the negotiation table and the card.
export function perfNote(league, p, kind) {
  const f = perfFactor(league, p, 2, kind);
  if (Math.abs(f - 1) < 0.05) return null;
  return f > 1
    ? { tone: "up", text: `Coming off a big season: he's asking about ${Math.round((f - 1) * 100)}% more than his rating alone would get.` }
    : { tone: "down", text: `Coming off a down season: he'd take about ${Math.round((1 - f) * 100)}% less on a multi-year deal, or bet on himself with a 1-year prove-it deal near full price.` };
}

// ---------- Loyal (2.87) ----------
// Seasons in a row with his current club, counting this one once he has played in it.
export function tenure(league, p) {
  const t = league.teams[p?.tid];
  if (!t) return 0;
  let n = (p.stats?.gp || 0) > 0 ? 1 : 0;
  for (let i = (p.career || []).length - 1; i >= 0; i--) {
    const c = p.career[i];
    if (c.t !== t.abbr) break;
    // A season already archived for this year isn't counted twice.
    if (c.y === league.year && n) continue;
    n++;
  }
  return n;
}
export const LOYAL_SEASONS = 3;
export const LOYAL_DISCOUNT = 0.9;
export const isLoyal = (league, p) => !!p && p.tid === league.userTid && p.signed !== false && tenure(league, p) >= LOYAL_SEASONS;
export const loyalDiscount = (league, p, kind) => (kind !== "fa" && isLoyal(league, p) ? LOYAL_DISCOUNT : 1);

// ---------- Franchise players (1.54) ----------
// A superstar in or before his prime: 90+ at 29 or younger, or 85+ at 25 or younger with a star
// or superstar development trait. AI clubs build around these players: they extend them during
// the season, clear cap room to re-sign them, and never let one walk while they can fit him.
export function isFranchisePlayer(p) {
  if (!p || p.signed === false) return false;
  if (p.ovr >= 90 && p.age <= 29) return true;
  return p.ovr >= 85 && p.age <= 25 && (p.dev === "star" || p.dev === "superstar");
}

// ---------- Age and term (2.79) ----------
// Veterans 32 and older get one- or two-year deals from AI clubs.
export const veteranTerm = (p, yrs) => (p.age >= 32 ? Math.min(yrs, 2) : yrs);
// Near-ties in AI depth decisions go to young players with upside, not end-of-career veterans.
export function depthValue(p) {
  if (!p) return 0;
  const upside = p.age <= 24 ? Math.min(1.5, Math.max(0, (p.pot || p.ovr) - p.ovr) * 0.25) : 0;
  return p.ovr + upside - (p.age >= 32 ? 0.75 : 0);
}
