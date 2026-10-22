// Free Agent Frenzy: July 1, the market opens at noon ET and runs on a live clock to midnight,
// the sibling of Trade Deadline Day (market.js). AI clubs keep tabling offers through the day,
// the best players decide within hours (bidding wars first), the feed reports signings and
// rumours, and your phone rings: agents telling you you've been outbid (match or raise before he
// signs) and clubs calling about trades. Later days of July run day by day (faMarket.js).
//
// league.frenzy = { year, minute, done, feed: [{ min, kind, text, tids, pid }], calls: [], signed }
import { faAsk } from "./offseason.js";
import { aiMarketDay, decideOne, acceptableBids, offerValue, canSign, MARKET_MIN, maxSuitors, clubPlan } from "./faMarket.js";
import { capSpace, capYear } from "./roster.js";
import { maxSalaryForYear } from "./constants.js";
import { pitchUser, fmtClock } from "./market.js";
import { stream } from "./rng.js";

export const FRENZY_START = 12 * 60; // noon ET
export const FRENZY_END = 24 * 60; // midnight
export const FRENZY_TICK = 10;
// Players this good decide on July 1 itself; the rest decide on their day (faMarket.js).
export const FRENZY_MIN = 78;
const FEED_MAX = 120;
const r2 = (x) => Math.round(x * 100) / 100;
const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };
const abbr = (lg, tid) => lg.teams[tid]?.abbr || "?";
const full = (t) => (t ? `${t.city} ${t.name}` : "?");
const deal = (b) => `$${b.aav.toFixed(2)}M × ${b.yrs}`;

export function frenzyFor(lg) {
  const f = lg.frenzy;
  return f && f.year === lg.year ? f : null;
}
// The market just opened and today's frenzy hasn't been played yet.
export function frenzyPending(lg) {
  return lg.phase === "freeagency" && (lg.fa?.day || 0) === 0 && !frenzyFor(lg)?.done;
}
export function frenzyActive(lg) {
  const f = frenzyFor(lg);
  return lg.phase === "freeagency" && !!f && !f.done;
}

function feed(lg, item) {
  const f = lg.frenzy;
  f.feed.unshift({ min: f.minute, ...item });
  if (f.feed.length > FEED_MAX) f.feed.length = FEED_MAX;
}

// When a player tops the board he decides on July 1 itself: stars (85+) one to five hours in,
// the next tier (78-84) three to ten hours in. Fixed per player and season.
export function decideMinute(p, year) {
  const h = hash(`${p.id}:${year}:hour`);
  return FRENZY_START + (p.ovr >= 85 ? 60 + Math.round(h * 24) * 10 : 180 + Math.round(h * 42) * 10);
}

const pending = (lg) => Object.values(lg.negotiations || {}).filter((n) => n.status === "pending" && n.year === lg.year);

export function startFrenzy(lg) {
  if (frenzyFor(lg)) return lg.frenzy;
  lg.frenzy = { year: lg.year, minute: FRENZY_START, done: false, feed: [], calls: [], signed: 0, raises: 0 };
  const top = lg.freeAgents.map((id) => lg.players[id]).filter((p) => p && p.tid === -1 && p.signed !== false).sort((a, b) => b.ovr - a.ovr).slice(0, 3);
  feed(lg, { kind: "info", text: `It's July 1: free agency is open! ${pending(lg).length} players already have offers.${top.length ? ` Top names: ${top.map((p) => `${p.name} (${p.pos} ${p.ovr})`).join(", ")}.` : ""}` });
  tagDecisions(lg);
  return lg.frenzy;
}

function tagDecisions(lg) {
  for (const n of pending(lg)) {
    const p = lg.players[n.pid];
    if (p && p.ovr >= FRENZY_MIN && n.decideMin == null && !n.frenzyDone) n.decideMin = Math.max(lg.frenzy.minute + 30, decideMinute(p, lg.year));
  }
}

// A bidding war: on a star with two or more offers, a club that's behind raises (if it can pay,
// and never past 15% over his ask or the max salary). Your offer can be topped this way.
function biddingWars(lg, r) {
  const yr = capYear(lg);
  for (const n of pending(lg)) {
    const p = lg.players[n.pid];
    if (!p || p.ovr < 82 || n.bids.length < 2 || n.decideMin == null) continue;
    if (r.next() > 0.25) continue;
    const ranked = n.bids.map((b) => [b, offerValue(lg, n, p, b)]).sort((a, b) => b[1] - a[1]);
    const [lead, lv] = ranked[0];
    const chaser = ranked.slice(1).find(([b]) => b.ai);
    if (!chaser) continue;
    const [b, bv] = chaser;
    const t = lg.teams[b.tid];
    const cap = Math.min(maxSalaryForYear(yr), faAsk(lg, p, b.yrs).aav * 1.15);
    const aav = r2(Math.min(cap, b.aav + (lv - bv) + b.aav * (0.02 + r.next() * 0.04)));
    if (aav <= b.aav + 0.05 || aav > capSpace(lg, t)) continue;
    b.aav = aav;
    lg.frenzy.raises++;
    feed(lg, { kind: "rumor", pid: p.id, tids: [b.tid, lead.tid], text: `Bidding war on ${p.name}: ${full(t)} raise to ${deal(b)}${lead.tid === lg.userTid ? ", topping your offer" : `, topping ${abbr(lg, lead.tid)}`}.` });
    if (lead.tid === lg.userTid) outbidCall(lg, n, p, b, 60);
  }
}

// Your phone: his agent calls to say a rival is ahead and you have until `expMin` to beat it.
function outbidCall(lg, n, p, best, mins) {
  const f = lg.frenzy;
  if (f.calls.some((c) => c.pid === p.id && c.kind === "match" && !c.closed)) return;
  const expMin = Math.min(FRENZY_END, f.minute + mins);
  f.calls.unshift({ id: `fz${p.id}:${f.minute}`, kind: "match", pid: p.id, tid: best.tid, aav: best.aav, yrs: best.yrs, expMin, at: f.minute });
  n.decideMin = Math.max(n.decideMin ?? 0, expMin);
  feed(lg, { kind: "mine", pid: p.id, tids: [best.tid], text: `${p.name}'s agent: ${full(lg.teams[best.tid])} are at ${deal(best)}. He'll sign by ${fmtClock(expMin)} unless you beat it.` });
}

// What it takes to beat the leading offer on him, on the leader's term.
export function beatPrice(lg, pid) {
  const n = lg.negotiations?.[pid];
  const p = lg.players[pid];
  if (!n || !p || n.status !== "pending") return null;
  const mine = n.bids.find((b) => b.tid === lg.userTid);
  const others = n.bids.filter((b) => b.tid !== lg.userTid).map((b) => [b, offerValue(lg, n, p, b)]).sort((a, b) => b[1] - a[1]);
  if (!others.length) return null;
  const [best, bv] = others[0];
  const yrs = best.yrs;
  let aav = best.aav;
  for (let i = 0; i < 40; i++) {
    const v = offerValue(lg, n, p, { ...(mine || {}), tid: lg.userTid, aav, yrs, ai: false });
    if (v > bv + 0.02) break;
    aav = r2(aav + Math.max(0.05, best.aav * 0.01));
  }
  return { aav: Math.min(aav, maxSalaryForYear(capYear(lg))), yrs, rival: best.tid, rivalAav: best.aav };
}

// Beat the rival's offer: your offer on him becomes `beatPrice` (if it fits under the cap).
export function answerCall(lg, callId, how) {
  const f = frenzyFor(lg);
  const c = f?.calls.find((x) => x.id === callId);
  if (!c || c.closed) return { ok: false, msg: "That call has ended." };
  const n = lg.negotiations?.[c.pid];
  const p = lg.players[c.pid];
  c.closed = how;
  if (how === "pass") {
    feed(lg, { kind: "mine", pid: c.pid, text: `You told ${p?.name}'s agent you won't go higher.` });
    return { ok: true, msg: `You stay where you are on ${p?.name}.` };
  }
  const price = beatPrice(lg, c.pid);
  const mine = n?.bids.find((b) => b.tid === lg.userTid);
  if (!price || !mine) return { ok: false, msg: "There's nothing left to beat." };
  const team = lg.teams[lg.userTid];
  if (price.aav > capSpace(lg, team)) { c.closed = null; return { ok: false, msg: `Beating it takes $${price.aav.toFixed(2)}M: more than your cap room.` }; }
  mine.aav = price.aav;
  mine.yrs = price.yrs;
  n.mineAav = price.aav; n.mineYrs = price.yrs;
  feed(lg, { kind: "mine", pid: c.pid, text: `You raise to ${deal(mine)} for ${p.name}. His agent takes it to him.` });
  return { ok: true, msg: `Your offer to ${p.name} is now ${deal(mine)}: the best on the table.` };
}

export function openCalls(lg) {
  const f = frenzyFor(lg);
  if (!f) return [];
  return f.calls.filter((c) => !c.closed && lg.players[c.pid]?.tid === -1 && lg.negotiations?.[c.pid]?.status === "pending");
}

// One player's moment on July 1: you're behind and haven't been asked yet → his agent calls;
// otherwise he signs (or waits two hours for more offers).
function decideNow(lg, n, p) {
  const f = lg.frenzy;
  const ranked = acceptableBids(lg, n, p);
  const mine = n.bids.find((b) => b.tid === lg.userTid);
  if (ranked[0] && mine && ranked[0].tid !== lg.userTid && !n.matchAsked && canSign(lg, mine, p)) {
    n.matchAsked = true;
    outbidCall(lg, n, p, ranked[0], 60);
    return;
  }
  if (!ranked[0]) {
    n.decideMin = f.minute + 120;
    if (n.decideMin >= FRENZY_END) { delete n.decideMin; n.frenzyDone = true; }
    return;
  }
  const out = decideOne(lg, n, p, { day: lg.fa?.day || 0 });
  delete n.decideMin;
  n.frenzyDone = true;
  if (n.status !== "signed") return;
  f.signed++;
  const t = lg.teams[n.winner];
  const rivals = n.rivals || 0;
  const big = p.ovr >= 85;
  (f.deals ||= []).push({ pid: p.id, name: p.name, pos: p.pos, ovr: p.ovr, age: p.age, tid: n.winner, aav: n.aav, yrs: n.yrs, min: f.minute, rivals });
  feed(lg, { kind: "sign", big, pid: p.id, tids: [n.winner], a: n.winner, text: `${p.name} (${p.pos}, ${p.ovr}) signs with ${full(t)}: ${deal(n)}${rivals ? `, over ${rivals} other offer${rivals === 1 ? "" : "s"}` : ""}.`, short: `${p.name} → ${t.abbr} ${deal(n)}` });
  for (const w of out.won) feed(lg, { kind: "mine", pid: w.pid, text: `✅ ${w.name} picked you: ${deal(w)}.` });
  for (const x of out.lost) feed(lg, { kind: "mine", pid: x.pid, text: `❌ ${x.name} chose ${x.abbr} (${deal(x)}) over your $${x.mineAav.toFixed(2)}M × ${x.mineYrs}.` });
}

// "X closing in on Y": an hour before a player decides, the club ahead leaks.
function rumours(lg, r) {
  const f = lg.frenzy;
  for (const n of pending(lg)) {
    if (n.decideMin == null || n.rumoured || n.decideMin - f.minute > 60 || n.decideMin - f.minute < 10) continue;
    const p = lg.players[n.pid];
    const lead = p && acceptableBids(lg, n, p)[0];
    if (!lead) continue;
    n.rumoured = true;
    if (r.next() < 0.3) continue;
    const others = n.bids.filter((b) => b.tid !== lead.tid).map((b) => abbr(lg, b.tid));
    const lines = [
      `${full(lg.teams[lead.tid])} closing in on ${p.name}, per sources.`,
      `Hearing ${p.name} is down to ${[abbr(lg, lead.tid), ...others.slice(0, 1)].join(" and ")}.`,
      `${p.name} (${p.pos}, ${p.ovr}) expected to choose soon. ${abbr(lg, lead.tid)} the favourite${others.length ? `; ${others.slice(0, 2).join(", ")} still in` : ""}.`,
    ];
    feed(lg, { kind: "rumor", pid: p.id, tids: [lead.tid], text: lines[Math.floor(r.next() * lines.length)] });
  }
}

export function frenzyTick(lg, minutes = FRENZY_TICK) {
  const f = frenzyFor(lg);
  if (!f || f.done) return f;
  for (let m = 0; m < minutes && !f.done; m += FRENZY_TICK) {
    f.minute += FRENZY_TICK;
    const r = stream(`${lg.year}|frenzy|${f.minute}`);
    // Every hour, more clubs get to the phones: heavy in the first afternoon, quieter at night.
    if (f.minute % 60 === 0) {
      const hour = (f.minute - FRENZY_START) / 60;
      const share = hour < 4 ? 0.6 : hour < 8 ? 0.35 : 0.2;
      aiMarketDay(lg, { perTeam: 1, salt: `|${f.minute}`, only: (t) => hash(`${t.id}:${lg.year}:${f.minute}`) < share });
      tagDecisions(lg);
    }
    if (f.minute % 30 === 0) biddingWars(lg, r);
    rumours(lg, r);
    const due = pending(lg).filter((n) => n.decideMin != null && n.decideMin <= f.minute).map((n) => [n, lg.players[n.pid]]).sort((a, b) => (b[1]?.ovr || 0) - (a[1]?.ovr || 0));
    for (const [n, p] of due) if (p) decideNow(lg, n, p);
    // Trade calls: clubs with new signings (or new room) ring about your veterans.
    if (f.minute % 30 === 0 && r.next() < 0.12) {
      const o = pitchUser(lg, { offseason: true });
      if (o) feed(lg, { kind: "mine", tids: [o.tid], text: `📞 ${full(lg.teams[o.tid])} call with a trade offer.`, offer: o.id });
    }
    if (f.minute >= FRENZY_END) finishFrenzy(lg);
  }
  return f;
}

function finishFrenzy(lg) {
  const f = lg.frenzy;
  f.done = true;
  for (const c of f.calls) if (!c.closed) c.closed = "expired";
  for (const n of pending(lg)) delete n.decideMin;
  const deals = f.deals || [];
  const top = [...deals].sort((a, b) => b.ovr - a.ovr)[0];
  const spent = deals.reduce((s, d) => s + d.aav * d.yrs, 0);
  const most = Object.entries(deals.reduce((o, d) => ((o[d.tid] = (o[d.tid] || 0) + 1), o), {})).sort((a, b) => b[1] - a[1])[0];
  const bits = [`Midnight: day one of free agency is in the books. ${deals.length} signing${deals.length === 1 ? "" : "s"}, $${Math.round(spent)}M in total.`];
  if (top) bits.push(`Biggest name: ${top.name} to ${abbr(lg, top.tid)} (${deal(top)}).`);
  if (most && most[1] > 1) bits.push(`Busiest club: ${full(lg.teams[most[0]])} (${most[1]}).`);
  bits.push("The rest of the market decides over the coming days.");
  feed(lg, { kind: "done", text: bits.join(" ") });
}

export function runFrenzy(lg) {
  if (lg.phase !== "freeagency") return null;
  startFrenzy(lg);
  while (!lg.frenzy.done) frenzyTick(lg, 60);
  return lg.frenzy;
}

// The board: the best free agents still out there, their ask, how they see your club, and who's after them.
export function frenzyBoard(lg, { limit = 60 } = {}) {
  const user = lg.teams[lg.userTid];
  return lg.freeAgents.map((id) => lg.players[id]).filter((p) => p && p.tid === -1 && p.signed !== false).sort((a, b) => b.ovr - a.ovr).slice(0, limit).map((p) => {
    const ask = faAsk(lg, p);
    const n = lg.negotiations?.[p.id];
    const open = n?.status === "pending" && n.year === lg.year ? n : null;
    const suitors = (open?.bids || []).filter((b) => b.tid !== lg.userTid).map((b) => b.tid);
    const mine = open?.bids.find((b) => b.tid === lg.userTid) || null;
    // How he sees your club: your offer at his ask, against the same offer from an average club.
    const base = { pid: p.id, preferences: open?.preferences || n?.preferences };
    let interest = "Medium";
    try {
      const me = offerValue(lg, open || { ...base, bids: [] }, p, { tid: user.id, aav: ask.aav, yrs: ask.yrs });
      const avg = lg.teams.filter((t) => t.id !== user.id).slice(0, 8).reduce((s, t) => s + offerValue(lg, open || { ...base, bids: [] }, p, { tid: t.id, aav: ask.aav, yrs: ask.yrs }), 0) / 8;
      interest = me >= avg * 1.03 ? "High" : me >= avg * 0.985 ? "Medium" : "Low";
    } catch { /* agent prefs missing on a very old save */ }
    let leader = null;
    if (open?.bids.length) { const lb = acceptableBids(lg, open, p)[0]; leader = lb ? lb.tid : null; }
    return { p, ask, suitors, mine, leader, interest, decideMin: open?.decideMin ?? null, market: p.ovr >= MARKET_MIN, hot: suitors.length >= Math.min(3, maxSuitors(p)) };
  });
}

// Buyers: the clubs with the most room this summer, and which way they're headed.
export function frenzyBuyers(lg, { limit = 10 } = {}) {
  return lg.teams.filter((t) => t.id !== lg.userTid).map((t) => ({ t, cap: capSpace(lg, t), plan: clubPlan(lg, t) })).sort((a, b) => b.cap - a.cap).slice(0, limit);
}
