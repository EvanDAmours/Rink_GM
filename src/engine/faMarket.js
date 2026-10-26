// The free-agent market (Gridiron GM 3.47 and 3.66, translated to the NHL's July 1). Free agency
// runs through July. Every day AI clubs put offers on the free agents who would play for them, and
// so can you; nobody signs just because an offer came first. Each player weighs every offer on the
// table the same way (the money, plus the role, the winning or the term his agent cares about) and
// decides on his own day: depth players take the first fair deal, regulars take a day or two, and
// stars shop around for two or three. Only a big overpay (20% over his ask) signs him on the spot.
// An offer you tabled always counts on his day; a rival's counts once it meets his minimum.
//
// Offers live in league.negotiations[pid] (status "pending", bids [{ tid, aav, yrs, ai }]), the
// same store the agent talks use, so a market on a player and your talks with his agent are one.
import { faAsk } from "./offseason.js";
import { agentPreferences, bidScore, pendingSpend } from "./negotiations.js";
import { capSpace, counts, payroll, hasRoomFor, canSendDown, sendDown, releasePlayer, signPlayer, capYear, logTx } from "./roster.js";
import { contractCount, reserveCount } from "./hockeyRules.js";
import { capForYear, capFloorForYear, minSalaryForYear, maxSalaryForYear, isGoalie, isDefense } from "./constants.js";
import { stream, clamp } from "./rng.js";
import { termWindow } from "./contracts.js";
import { projectedRole } from "./teamPlanning.js";
import { promiseRole } from "./playerCommitments.js";
import { depthValue, veteranTerm } from "./contractValue.js";
import { queueMoment } from "./moments.js";
import { isContending } from "./trade.js";
import { teamRatings } from "./lines.js";
import { signingMoment } from "./momentsSeason.js";

// Below this the market doesn't bid: the first fair offer signs him.
export const MARKET_MIN = 70;
// An offer this far over his ask, he signs on the spot.
export const OVERPAY = 1.2;
// The spots a club dresses: twelve forwards, six defencemen, two goalies. A free agent "would play
// for them" when he beats the last of those by two points.
const LINEUP = { F: 12, D: 6, G: 2 };
// Bodies a club carries into camp.
const TARGET = { F: 13, D: 7, G: 2 };
const groupOf = (p) => (isGoalie(p.pos) ? "G" : isDefense(p.pos) ? "D" : "F");
const r2 = (x) => Math.round(x * 100) / 100;
const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };
const signingDay = (lg, p, t, deal) => { try { queueMoment(lg, signingMoment(lg, p, t, deal)); } catch (e) { console.error("Signing moment failed", e); } };

export const marketDay = (lg) => lg.fa?.day || 0;
export const marketOpen = (lg) => lg.phase === "freeagency" && !!lg.fa;

// How many days after the market opens on him he makes up his mind (fixed per player and season):
// depth the same day, regulars one or two, stars (85+) two or three.
export function decideOffset(p, year) {
  if (p.ovr < MARKET_MIN) return 1;
  const h = hash(`${p.id}:${year}:day`);
  return p.ovr >= 85 ? (h < 0.5 ? 2 : 3) : h < 0.5 ? 1 : 2;
}
// The free-agency day his decision is made on: he decides when the league moves to that day (the
// end of the day before). A player still waiting for a good enough offer decides again each day.
export function decisionDay(lg, p) {
  const day = marketDay(lg);
  const since = p.faSince?.year === lg.year ? p.faSince.day : day;
  return Math.max(day + 1, since + decideOffset(p, lg.year));
}
// "decides today" (at the end of today) or "decides day 4".
export function decidesText(lg, closes) {
  const end = (closes ?? marketDay(lg) + 1) - 1;
  return end <= marketDay(lg) ? "decides today" : `decides on day ${end}`;
}

// How many clubs end up chasing one player: a star draws a handful, a solid regular a few.
export const maxSuitors = (p) => (p.ovr >= 85 ? 6 : p.ovr >= 78 ? 4 : 3);
// The least he'd take per year from a rival club (his hidden minimum, 86-96% of his ask).
export const needFor = (lg, p, yrs) => r2(faAsk(lg, p, yrs).aav * (0.86 + hash(`${p.id}:${lg.year}:min`) * 0.1));
// So far over his ask that he signs on the spot?
export const isOverpay = (lg, p, aav, yrs) => aav + 1e-6 >= faAsk(lg, p, yrs).aav * OVERPAY;
const gut = (p, tid) => 1 + hash(`${p.id}:${tid}:gut`) * 0.03;
// What an offer is worth to him: bidScore (money plus what his agent cares about), and a little gut feel.
export const offerValue = (lg, n, p, b) => bidScore(lg, n, p, b) * gut(p, b.tid);

// The market entry on a player, opened by the first offer of the summer. Your talks with his agent
// (a counter, or the agent walking away) carry over into it.
export function marketEntry(lg, p) {
  lg.negotiations ||= {};
  const old = lg.negotiations[p.id];
  if (old?.status === "pending" && old.year === lg.year) return old;
  const talk = old?.year === lg.year && (old.status === "counter" || old.status === "walked") ? old : null;
  const n = { pid: p.id, year: lg.year, rounds: talk?.rounds || 0, status: "pending", closes: decisionDay(lg, p), opened: marketDay(lg), bids: [], preferences: talk?.preferences || agentPreferences(p) };
  if (talk) { n.talk = talk.status; n.counter = talk.counter; n.term = talk.term; }
  p.negotiationPending = true;
  lg.negotiations[p.id] = n;
  return n;
}

// Room for one more body on an AI club: a spot now, or a waiver-exempt extra to send down, or a
// cheap extra to let go. Returns the player who would make way (or true when a spot is open).
function roomMove(lg, t, p) {
  if (hasRoomFor(lg, t)) return true;
  const roster = t.roster.map((id) => lg.players[id]).filter(Boolean);
  const same = roster.filter((x) => groupOf(x) === groupOf(p) && !x.ltir && !x.waiverPending && !x.offerSheetPending).sort((a, b) => depthValue(a) - depthValue(b));
  const worst = same[0];
  if (!worst || worst.ovr >= p.ovr) return null;
  if (canSendDown(worst)) return worst;
  return worst.cap <= 1.5 && !worst.clause ? worst : null;
}
function makeRoom(lg, t, p) {
  const out = roomMove(lg, t, p);
  if (out === true || !out) return !!out;
  if (canSendDown(out)) return sendDown(lg, t, out.id);
  releasePlayer(lg, t, out.id);
  return true;
}
// Can this club sign him on these terms right now?
export function canSign(lg, b, p) {
  const t = lg.teams[b.tid];
  if (!t || capSpace(lg, t) + 1e-6 < b.aav || contractCount(lg, t) >= 50) return false;
  if (b.tid === lg.userTid) return reserveCount(lg, t) < 90;
  return reserveCount(lg, t) < 90 && !!roomMove(lg, t, p);
}
// The offers he would take today, best for him first. An offer you tabled (no `ai` flag: he said
// yes at the table) always counts; a rival's counts once it meets his minimum.
export function acceptableBids(lg, n, p, { last = false } = {}) {
  return n.bids.map((b) => [b, canSign(lg, b, p) ? offerValue(lg, n, p, b) : -1])
    .filter(([b, v]) => v >= 0 && (!b.ai || v >= needFor(lg, p, b.yrs) * (last ? 0.9 : 1)))
    .sort((a, b) => b[1] - a[1] || a[0].tid - b[0].tid).map(([b]) => b);
}

// A club that filled the spot drops its other offers there, and offers it can no longer pay go too.
function pruneClubBids(lg, t) {
  const bar = lineupBar(lg, t);
  let room = capSpace(lg, t);
  for (const n of Object.values(lg.negotiations || {})) {
    if (n.status !== "pending" || n.year !== lg.year) continue;
    const b = n.bids.find((x) => x.tid === t.id && x.ai);
    if (!b) continue;
    const p = lg.players[n.pid];
    if (p && depthValue(p) - bar(groupOf(p)) >= 2 && b.aav <= room) { room -= b.aav; continue; }
    n.bids = n.bids.filter((x) => x !== b);
    if (!n.bids.length) closeEntry(n, p);
  }
}
// No offers left on him: the market entry closes (your talks with his agent stay on record).
function closeEntry(n, p) {
  if (p) delete p.negotiationPending;
  if (n.talk) { n.status = n.talk; delete n.talk; delete n.closes; n.bids = []; return; }
  n.status = "lapsed";
}
// The rating a free agent has to beat (by two) to play for a club: its 12th forward, 6th
// defenceman or backup goalie. A club short of bodies at a spot will take anyone there.
function lineupBar(lg, t) {
  const by = { F: [], D: [], G: [] };
  for (const id of t.roster) { const p = lg.players[id]; if (p) by[groupOf(p)].push(p.ovr); }
  for (const k of Object.keys(by)) by[k].sort((a, b) => b - a);
  return (g) => (by[g].length < TARGET[g] ? 0 : by[g][LINEUP[g] - 1] ?? 0);
}

// Where a club is headed this summer: "contend" (one of the best eight in its conference by
// rating and last season), "rebuild" (bottom five) or "middle".
export function clubPlan(lg, t) {
  if (isContending(lg, t)) return "contend";
  const conf = lg.teams.filter((x) => x.conf === t.conf && !isContending(lg, x));
  const rate = (x) => teamRatings(lg, x).ovr + (x.rec?.gp ? (x.rec.pts / (2 * x.rec.gp) - 0.5) * 20 : 0);
  conf.sort((a, b) => rate(a) - rate(b) || a.id - b.id);
  return conf.slice(0, 5).includes(t) ? "rebuild" : "middle";
}

// One day of AI offers: each club goes after the free agents who would improve it most (they'd
// crack its lineup, and by how much) that it can still pay after its open offers, up to `perTeam`
// new offers a day (one more for a club with lots of room or under the cap floor). Not every club
// chases every player, and a player only draws so many suitors. Returns the number of offers made.
// A club with a lot of cap room outbids the market: up to 15% over his ask, the way NHL clubs
// with space spend it on July 1 (real clubs spend 85-100% of the cap).
export const richBid = (room, cap) => 1 + clamp((room / cap - 0.08) * 1.25, 0, 0.15);
export function aiMarketDay(lg, { perTeam = 1, salt = "", only = null } = {}) {
  if (!marketOpen(lg)) return 0;
  const day = marketDay(lg), yr = lg.year, cy = capYear(lg);
  lg.fa.marketYear = yr;
  const pool = lg.freeAgents.map((id) => lg.players[id]).filter((p) => p && p.tid === -1 && p.signed !== false && p.ovr >= MARKET_MIN);
  for (const p of pool) if (p.faSince?.year !== yr) p.faSince = { year: yr, day };
  if (!pool.length) return 0;
  const r = stream(`${yr}|fa-market|${day}${salt}`);
  const order = lg.teams.filter((t) => t.id !== lg.userTid).map((t) => [t, r.next()]).sort((a, b) => a[1] - b[1]).map(([t]) => t);
  let made = 0;
  for (const t of order) {
    if (only && !only(t)) continue;
    if (contractCount(lg, t) >= 50 || reserveCount(lg, t) >= 90) continue;
    let room = capSpace(lg, t) - pendingSpend(lg, t.id);
    if (room < minSalaryForYear(cy)) continue;
    const bar = lineupBar(lg, t);
    const floorGap = capFloorForYear(cy) - payroll(lg, t);
    const flush = capSpace(lg, t) > capForYear(cy) * 0.12;
    const most = perTeam + (floorGap > 0 || flush ? 1 : 0);
    // Contenders chase proven veterans on short deals; rebuilding clubs chase young players and
    // give them term, and mostly pass on players past 31.
    const plan = clubPlan(lg, t);
    const wants = pool.filter((p) => p.tid === -1 && (plan !== "rebuild" || p.age <= 31 || p.ovr >= 86)).map((p) => [p, depthValue(p) - bar(groupOf(p))]).filter(([, g]) => g >= (flush ? 1 : 2))
      .map(([p, g]) => [p, g + (plan === "contend" ? (p.age >= 28 ? 1.5 : 0) : plan === "rebuild" ? (p.age <= 26 ? 2 : p.age >= 30 ? -2 : 0) : 0)]).sort((a, b) => b[1] - a[1]);
    let placed = 0;
    for (const [p] of wants) {
      if (placed >= most) break;
      const e = lg.negotiations?.[p.id];
      const open = e?.status === "pending" && e.year === yr ? e : null;
      if (open?.bids.some((b) => b.tid === t.id)) continue;
      if ((open?.bids.filter((b) => b.tid !== lg.userTid).length || 0) >= maxSuitors(p)) continue;
      if (r.next() < 0.4) continue;
      const win = termWindow(p, "fa");
      const pref = faAsk(lg, p).prefYrs;
      const lean = plan === "contend" && p.age >= 29 ? -1 : plan === "rebuild" && p.age <= 27 ? 1 : 0;
      const yrs = clamp(veteranTerm(p, pref + lean + (r.next() < 0.25 ? 1 : 0) - (r.next() < 0.25 ? 1 : 0)), win.lo, win.hi);
      const aav = r2(clamp(faAsk(lg, p, yrs).aav * (0.9 + r.next() * 0.22) * (floorGap > 0 ? 1.08 : richBid(room, capForYear(cy))), minSalaryForYear(cy), maxSalaryForYear(cy)));
      if (aav > room) continue;
      (open || marketEntry(lg, p)).bids.push({ tid: t.id, aav, yrs, ai: true, day, role: projectedRole(lg, t, p) });
      room -= aav; placed++; made++;
    }
  }
  return made;
}

// Depth players (under 70) aren't bid on: a club short of bodies signs one at his ask, the first
// fair deal. Near-ties go to young players with upside.
export function aiDepthDay(lg) {
  if (!marketOpen(lg)) return [];
  const r = stream(`${lg.year}|fa-depth|${marketDay(lg)}`);
  const signed = [];
  for (const t of lg.teams.filter((x) => x.id !== lg.userTid)) {
    const c = counts(lg, t);
    const need = c.G < TARGET.G ? "G" : c.D < TARGET.D ? "D" : c.F < TARGET.F ? "F" : null;
    if (!need || r.next() > 0.55 || contractCount(lg, t) >= 50) continue;
    const space = capSpace(lg, t) - pendingSpend(lg, t.id);
    const p = lg.freeAgents.map((id) => lg.players[id]).filter((x) => x && x.tid === -1 && x.signed !== false && x.ovr < MARKET_MIN && !x.negotiationPending && groupOf(x) === need)
      .sort((a, b) => depthValue(b) - depthValue(a)).find((x) => faAsk(lg, x).aav <= space - 0.5);
    if (!p) continue;
    const ask = faAsk(lg, p);
    if (signPlayer(lg, t, p, ask.aav, veteranTerm(p, ask.yrs))) signed.push(p.id);
  }
  return signed;
}

// The end of a free-agency day: everyone due to decide looks at his offers and takes the best one
// he'd accept. Nothing good enough yet: he waits a day for more. On the last day everyone still
// deciding chooses (taking the best rival offer within 10% of his minimum) or stays unsigned.
// Best players decide first. Returns { signed, won, lost, fell } for the day's summary.
export function settleMarket(lg, { last = false } = {}) {
  const day = marketDay(lg), out = { signed: [], won: [], lost: [], fell: [] };
  const due = Object.values(lg.negotiations || {}).filter((n) => n.status === "pending" && (last || (n.closes ?? 0) <= day))
    .map((n) => [n, lg.players[n.pid]]).sort((a, b) => (b[1]?.ovr || 0) - (a[1]?.ovr || 0));
  for (const [n, p] of due) decideOne(lg, n, p, { last, out, day });
  return out;
}

// One player makes up his mind (end of his day, or his hour on July 1): the best offer he'd take,
// or he waits (or, on the last day, stays unsigned). Fills `out` like settleMarket.
export function decideOne(lg, n, p, { last = false, out = { signed: [], won: [], lost: [], fell: [] }, day = marketDay(lg), wait = 1 } = {}) {
  {
    if (n.status !== "pending") return out;
    if (!p || p.tid !== -1) { n.status = "unavailable"; if (p) delete p.negotiationPending; return out; }
    const mine = n.bids.find((x) => x.tid === lg.userTid);
    const mineOut = !!mine && !canSign(lg, mine, p);
    const ranked = acceptableBids(lg, n, p, { last });
    const b = ranked[0];
    const user = lg.teams[lg.userTid];
    // Your signing bonus comes back when he goes elsewhere (or your offer falls through).
    if (mine?.bonusCash && (!b || b.tid !== lg.userTid) && user?.arena) user.arena.cash = r2(user.arena.cash + mine.bonusCash);
    if (!b) {
      if (mineOut) {
        n.bids = n.bids.filter((x) => x !== mine);
        out.fell.push({ pid: p.id, name: p.name, aav: mine.aav, yrs: mine.yrs });
        lg.inbox.push({ year: lg.year, day: lg.day, pid: p.id, text: `❌ ${p.name}: your earlier signings left no cap or roster room for your $${mine.aav.toFixed(2)}M × ${mine.yrs} offer. He stays on the market.` });
      }
      if (n.bids.length && !last) { n.closes = day + wait; return out; }
      closeEntry(n, p);
      if (mineOut && n.status === "lapsed") n.status = "failed";
      return out;
    }
    const t = lg.teams[b.tid];
    if (b.tid !== lg.userTid && !hasRoomFor(lg, t)) makeRoom(lg, t, p);
    delete p.negotiationPending;
    if (!signPlayer(lg, t, p, b.aav, b.yrs)) { n.status = "failed"; return out; }
    promiseRole(lg, p, b.tid, b.role || projectedRole(lg, t, p));
    if (b.clause && p.age >= 27) p.clause = { type: b.clause, blocked: [] };
    n.status = "signed"; n.winner = b.tid; n.aav = b.aav; n.yrs = b.yrs; n.rivals = n.bids.filter((x) => x.tid !== b.tid).length;
    out.signed.push(p.id);
    if (mine) {
      const won = b.tid === lg.userTid;
      (lg.faResults ||= []).unshift({ year: lg.year, day, pid: p.id, name: p.name, won, winner: b.tid, aav: b.aav, yrs: b.yrs, mineAav: mine.aav, mineYrs: mine.yrs });
      if (lg.faResults.length > 60) lg.faResults.length = 60;
      if (won) {
        out.won.push({ pid: p.id, name: p.name, aav: b.aav, yrs: b.yrs, rivals: n.rivals });
        signingDay(lg, p, t, { aav: b.aav, yrs: b.yrs, market: true, rivals: n.rivals });
      } else out.lost.push({ pid: p.id, name: p.name, abbr: t.abbr, aav: b.aav, yrs: b.yrs, mineAav: mine.aav, mineYrs: mine.yrs, out: mineOut });
      lg.inbox.push({ year: lg.year, day: lg.day, pid: p.id, text: won ? `✅ ${p.name} signed with you: $${b.aav.toFixed(2)}M × ${b.yrs}${n.rivals ? `, over ${n.rivals} other offer${n.rivals === 1 ? "" : "s"}` : ""}.` : mineOut ? `❌ ${p.name} signed with ${t.abbr}: your earlier signings left no cap or roster room for your $${mine.aav.toFixed(2)}M × ${mine.yrs} offer.` : `❌ ${p.name} chose ${t.abbr} ($${b.aav.toFixed(2)}M × ${b.yrs}) over your $${mine.aav.toFixed(2)}M × ${mine.yrs}.` });
    } else if (n.talk || n.rounds) lg.inbox.push({ year: lg.year, day: lg.day, pid: p.id, text: `Agent update: ${p.name} chose ${t.abbr} at $${b.aav.toFixed(2)}M × ${b.yrs}.` });
    if (b.tid !== lg.userTid) pruneClubBids(lg, t);
  }
  return out;
}

// Your offer on the spot (a depth player's first fair deal, or a 20% overpay): he signs now and
// every other offer on him is off the table.
export function signOnSpot(lg, p, t, { aav, yrs, clause = "", role = "" }) {
  const n = lg.negotiations?.[p.id];
  const rivals = n?.status === "pending" && n.year === lg.year ? n.bids.filter((b) => b.tid !== t.id).length : 0;
  if (!signPlayer(lg, t, p, aav, yrs)) return false;
  delete p.negotiationPending;
  signingDay(lg, p, t, { aav, yrs, market: true, rivals });
  promiseRole(lg, p, t.id, role || projectedRole(lg, t, p));
  if (clause && p.age >= 27) p.clause = { type: clause, blocked: clause === "NTC" ? lg.teams.filter((q) => q.conf !== t.conf).map((q) => q.id) : [] };
  if (p.ovr >= MARKET_MIN) logTx(lg, `${p.name} signs on the spot with ${t.abbr}${rivals ? `, ending ${rivals} rival offer${rivals === 1 ? "" : "s"}` : ""}`, [t.id]);
  return { rivals };
}

// Where the market on a player stands, for the lists: offers in, yours, and when he decides.
export function marketOn(lg, p) {
  const n = lg.negotiations?.[p.id];
  const open = n?.status === "pending" && n.year === lg.year ? n : null;
  const bids = open?.bids || [];
  const mine = bids.find((b) => b.tid === lg.userTid) || null;
  return { open, offers: bids.length, others: bids.length - (mine ? 1 : 0), mine, closes: open?.closes ?? null, when: open ? decidesText(lg, open.closes) : p.ovr < MARKET_MIN ? "takes the first fair deal" : null };
}

// Who decides at the end of today, and how many of them you have offers on.
export function decidingToday(lg) {
  const day = marketDay(lg);
  const list = Object.values(lg.negotiations || {}).filter((n) => n.status === "pending" && n.year === lg.year && (n.closes ?? 0) <= day + 1);
  return { count: list.length, mine: list.filter((n) => n.bids.some((b) => b.tid === lg.userTid)).length };
}
