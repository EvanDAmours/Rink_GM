// The draft clock and the draft-day phone (Gridiron 1.12, 1.9994, 2.6, 2.19, 3.4, 3.39).
//
// The clock: every pick gets two minutes and AI clubs use 45-75 seconds of it. Round 1 always
// ticks in real seconds, whatever the speed (time to work the phones for a top pick); after it,
// Slow stays real time, Normal is quicker and Fast flies. Sim this pick and Sim to my pick skip
// ahead. The clock lives on the draft (league.draft.clock: { overall, owner, remaining, speed,
// paused }), so it survives leaving the draft floor, a reload and an exported save. Every draft
// starts at Normal: a new draft has a new clock.
//
// The phone: while you're on the clock, clubs behind you call to move up (trade down); you can
// call any club picking before your next pick to move up (trade up), or shop any of your later
// picks. Deals are priced on a hockey draft chart (slotValue) and go through the trade engine,
// so the pick and the draft slot always move together.
import { stream } from "./rng.js";
import { makePick, aiChoose, currentSlot, draftDone, simDraftToUser } from "./draft.js";
import { csRank, myList } from "./scouting.js";
import { evaluateTrade, executeTrade } from "./trade.js";
import { pickLocked } from "./draftExpansion.js";
import { teamNeeds } from "./teamPlanning.js";
import { queueStageMoment } from "./momentsDraft.js";
import { stampDraftTruth } from "./draftRecap.js";

export const DRAFT_CLOCK = 120;
export const DRAFT_SPEEDS = ["Slow", "Normal", "Fast"];
// Milliseconds per clock second: round 1 always real time.
export const clockTick = (speed, round) => (round === 1 ? 1000 : ({ Slow: 1000, Normal: round <= 3 ? 250 : 100, Fast: 40 })[speed] || 250);
const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
// How many clock seconds an AI club takes on a pick: 45 to 75, fixed per pick.
export const aiPickAt = (key) => 45 + (hash(key) % 31);
const slotKey = (d, s) => `${d.year}-${s.overall}`;

// A draft is running: the floor is open (not the Combine) and picks are left.
export function draftLive(league) {
  return league?.phase === "draft" && !!league.draft && Array.isArray(league.draft.slots) && league.draft.stage !== "combine" && !draftDone(league);
}

// The clock for the pick on the clock, with defaults for old saves. A new pick (or a pick that
// changed hands) gets a fresh two minutes; speed and pause carry over.
export function draftClock(league) {
  const d = league.draft;
  if (!d) return null;
  if (!d.clock || typeof d.clock !== "object") d.clock = {};
  const c = d.clock;
  if (!DRAFT_SPEEDS.includes(c.speed)) c.speed = "Normal";
  c.paused = !!c.paused;
  const s = currentSlot(league);
  if (s && (c.overall !== s.overall || (c.owner != null && c.owner !== s.owner))) {
    c.overall = s.overall;
    c.remaining = DRAFT_CLOCK;
  }
  if (s) c.owner = s.owner;
  c.remaining = Number.isFinite(c.remaining) ? Math.max(0, Math.min(DRAFT_CLOCK, Math.round(c.remaining))) : DRAFT_CLOCK;
  return c;
}

export const clockText = (secs) => `${Math.floor(Math.max(0, secs) / 60)}:${String(Math.max(0, secs) % 60).padStart(2, "0")}`;

export function setDraftSpeed(league, speed) {
  const c = draftClock(league);
  if (c && DRAFT_SPEEDS.includes(speed)) c.speed = speed;
  return c?.speed;
}
export function cycleDraftSpeed(league) {
  const c = draftClock(league);
  if (!c) return null;
  return setDraftSpeed(league, DRAFT_SPEEDS[(DRAFT_SPEEDS.indexOf(c.speed) + 1) % DRAFT_SPEEDS.length]);
}
export function setDraftPaused(league, paused) {
  const c = draftClock(league);
  if (c) c.paused = !!paused;
  return !!c?.paused;
}

// When your clock runs out: the first player still on Your list, then Central Scouting's best.
export function autoPickId(league) {
  const listed = (myList(league).ids || []).find((id) => league.players[id]?.tid === -2);
  if (listed) return listed;
  const pool = (league.draftClass || []).map((id) => league.players[id]).filter((p) => p?.tid === -2);
  return pool.sort((a, b) => csRank(a) - csRank(b))[0]?.id || null;
}

// Make the pick on the clock. Your own picks walk up on stage (the draft-night moment).
// Returns { slot, pid, how } or null.
export function pickNow(league, pid, how = "pick") {
  const s = currentSlot(league);
  if (!s || !pid || !makePick(league, pid)) return null;
  stampDraftTruth(league);
  if (s.owner === league.userTid) queueStageMoment(league, s);
  if (!draftDone(league)) draftClock(league);
  return { slot: s, pid, how };
}

// One second off the clock. An AI club picks once its time is up; your pick is made for you at 0:00.
// Returns the pick made this second (see pickNow), or null.
export function tickDraftClock(league) {
  if (!draftLive(league)) return null;
  const c = draftClock(league);
  if (c.paused) return null;
  const s = currentSlot(league);
  c.remaining = Math.max(0, c.remaining - 1);
  if (s.owner !== league.userTid) {
    if (DRAFT_CLOCK - c.remaining >= aiPickAt(slotKey(league.draft, s))) return pickNow(league, aiChoose(league, s.owner), "ai");
    return null;
  }
  return c.remaining <= 0 ? pickNow(league, autoPickId(league), "auto") : null;
}

// Sim this pick: the club on the clock picks now (never yours).
export function simThisPick(league) {
  if (!draftLive(league)) return null;
  const s = currentSlot(league);
  if (s.owner === league.userTid) return null;
  return pickNow(league, aiChoose(league, s.owner), "sim");
}

// Sim to my pick: AI clubs pick until you're on the clock (or the draft ends).
export function simToMyPick(league) {
  if (!draftLive(league)) return 0;
  const before = league.draft.idx;
  simDraftToUser(league);
  stampDraftTruth(league);
  if (!draftDone(league)) draftClock(league);
  return league.draft.idx - before;
}

// Draft a player with your pick (the board's Draft button).
export function draftPlayer(league, pid) {
  const s = currentSlot(league);
  if (!draftLive(league) || s.owner !== league.userTid) return null;
  return pickNow(league, pid, "user");
}

// Your next pick from the one on the clock: { slot, away } (away 0 = you're on the clock).
export function nextUserSlot(league) {
  const d = league.draft;
  if (!d?.slots) return null;
  const cur = currentSlot(league);
  const s = d.slots.slice(d.idx).find((x) => x.owner === league.userTid);
  return s && cur ? { slot: s, away: s.overall - cur.overall } : null;
}

// The positions a club is short at, most urgent first (Medium need or more, at most four).
export function clubNeeds(league, tid, n = 4) {
  const t = league.teams[tid];
  if (!t) return [];
  return teamNeeds(league, t).filter((x) => x.score >= 25).slice(0, n).map((x) => x.pos);
}

// ---------- The draft chart ----------

// What a pick in this draft is worth, by overall slot: the trade engine's first-round curve, then
// easing down through the later rounds (32 clubs, 7 rounds).
const R1 = (o) => 3 + 22 * Math.exp(-(o - 1) / 9);
const ANCHORS = [[32, R1(32)], [48.5, 2.0], [80.5, 1.2], [112.5, 0.8], [144.5, 0.45], [176.5, 0.35], [208.5, 0.25], [224, 0.2]];
export function slotValue(overall) {
  if (!(overall > 0)) return 0;
  if (overall <= 32) return R1(overall);
  for (let i = 1; i < ANCHORS.length; i++) {
    const [x0, y0] = ANCHORS[i - 1], [x1, y1] = ANCHORS[i];
    if (overall <= x1) return y0 + ((overall - x0) / (x1 - x0)) * (y1 - y0);
  }
  return 0.2;
}
// Chart points as shown ("you give 410 for 520").
export const chartPts = (v) => Math.round(v * 100);

const slotOfPick = (d, pk) => d.slots.find((s) => s.round === pk.round && s.orig === pk.orig);
export const pickOfSlot = (league, s) => league.draftPicks.find((p) => p.year === league.draft.year && p.round === s.round && p.orig === s.orig);

// A pick's chart value: this draft by its slot; a later draft's as a late pick in its round, less 8% a year.
export function pickChart(league, pk) {
  const d = league.draft;
  if (!pk || !d) return 0;
  if (pk.year === d.year) { const s = slotOfPick(d, pk); return s && !s.pid ? slotValue(s.overall) : 0; }
  return slotValue((pk.round - 1) * 32 + 24) * Math.pow(0.92, Math.max(1, pk.year - d.year));
}

// "R2 #40" for this draft, "2028 R1" for a later one.
export function shortPick(league, pk) {
  if (!pk) return "";
  const d = league.draft;
  const s = d && pk.year === d.year ? slotOfPick(d, pk) : null;
  return s ? `R${pk.round} #${s.overall}` : `${pk.year} R${pk.round}`;
}

// What a club can add on top of its pick: its later picks in this draft and next year's
// rounds 1-4 that it still owns (none tied up in offer sheets or protections).
function assets(league, tid, afterOverall, exclude = []) {
  const d = league.draft;
  const now = d.slots.filter((s) => !s.pid && s.owner === tid && s.overall > afterOverall).map((s) => pickOfSlot(league, s)).filter((pk) => pk && pk.owner === tid);
  const next = league.draftPicks.filter((pk) => pk.year === d.year + 1 && pk.owner === tid && pk.round <= 4);
  return [...now, ...next].filter((pk) => !exclude.includes(pk.id) && !pickLocked(league, pk.id)).map((pk) => ({ pk, v: pickChart(league, pk) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
}

// The asset closest to what's still owed each time (a little over is fine; far over isn't offered).
function fill(pool, need) {
  pool = [...pool];
  const extras = [];
  let got = 0;
  while (got < need * 0.97 && extras.length < 3 && pool.length) {
    const left = need - got;
    const fit = pool.filter((x) => x.v <= left * 1.35);
    const one = (fit.length ? fit : pool.slice(-1))[0];
    if (!fit.length && one.v > left * 2.5) break;
    extras.push(one.pk);
    got += one.v;
    pool.splice(pool.indexOf(one), 1);
  }
  return { extras, got };
}

// ---------- The phone ----------

// Calls already answered this draft: seen (the incoming call was dealt with), gone (the club
// hung up or was dismissed), bump (extra premium per club after you asked for more), done.
export function phoneLog(league) {
  const d = league.draft;
  if (!d) return { seen: {}, gone: {}, bump: {}, tries: {} };
  d.phone ||= {};
  for (const k of ["seen", "gone", "bump", "tries"]) if (!d.phone[k] || typeof d.phone[k] !== "object") d.phone[k] = {};
  return d.phone;
}

// The prospect a club would come up for: one of the top four left on Central Scouting's board.
function targetFor(league, tid) {
  const board = (league.draftClass || []).map((id) => league.players[id]).filter((p) => p?.tid === -2).sort((a, b) => csRank(a) - csRank(b));
  return board.length ? board[(tid * 7 + league.draft.idx) % Math.min(4, board.length)].id : null;
}

const offerId = (kind, d, mine, theirs, team) => `${kind}-${d.year}-${mine}-${theirs}-${team}`;

// Trade-down calls for one of your picks (the one on the clock by default): clubs picking a few
// spots later want to move up, and send their pick plus enough extra picks to cover the chart
// gap, usually with a small premium. A short move, a medium one and a big one; up to three.
export function tradeDownCalls(league, overall) {
  const d = league.draft;
  if (!draftLive(league)) return [];
  const me = league.userTid;
  const mineSlot = overall ? d.slots.find((s) => s.overall === overall) : currentSlot(league);
  if (!mineSlot || mineSlot.pid || mineSlot.owner !== me || mineSlot.overall < currentSlot(league).overall) return [];
  const myPk = pickOfSlot(league, mineSlot);
  if (!myPk || myPk.owner !== me || pickLocked(league, myPk.id)) return [];
  const phone = phoneLog(league);
  const r = stream(`${d.year}|calls|${mineSlot.overall}|${me}`);
  const window = mineSlot.round === 1 ? 14 : 20;
  const i0 = d.slots.indexOf(mineSlot);
  const seen = new Set(), callers = [];
  for (const s of d.slots.slice(i0 + 2, i0 + 2 + window)) {
    if (s.pid || s.owner === me || seen.has(s.owner)) continue;
    seen.add(s.owner);
    if (r.next() < 0.55) callers.push(s); // not every club wants to move up
  }
  const chosen = callers.length <= 3 ? callers : [callers[0], callers[Math.floor(callers.length / 2)], callers[callers.length - 1]];
  const mine = slotValue(mineSlot.overall);
  const offers = [];
  for (const s of chosen) {
    const team = s.owner;
    const theirPk = pickOfSlot(league, s);
    if (!theirPk || theirPk.owner !== team || pickLocked(league, theirPk.id)) continue;
    const premium = 1.02 + r.next() * 0.12 + (phone.bump[`${mineSlot.overall}:${team}`] || 0);
    const need = (mine - slotValue(s.overall)) * premium;
    const { extras, got } = fill(assets(league, team, mineSlot.overall, [theirPk.id]), need);
    if (got < need * 0.85) continue; // they can't afford it
    const get = slotValue(s.overall) + got;
    const o = { id: offerId("down", d, mineSlot.overall, s.overall, team), kind: "down", team, mine: myPk.id, myOverall: mineSlot.overall, theirs: theirPk.id, theirOverall: s.overall, extras: extras.map((pk) => pk.id), give: chartPts(mine), get: chartPts(get), pct: Math.round((get / mine - 1) * 100), target: targetFor(league, team), move: s.overall - mineSlot.overall };
    if (!phone.gone[o.id] && dealOk(league, o)) offers.push(o);
  }
  return offers.sort((a, b) => a.theirOverall - b.theirOverall);
}

// A star sliding: the best prospect left had been ranked 6+ spots above the pick you're on the
// clock with. The club behind you that needs his position most calls to jump you for him, and pays
// 15-35% over the chart for your pick (more the farther he's fallen).
export function fallerCall(league) {
  const d = league.draft;
  if (!draftLive(league)) return null;
  const me = league.userTid;
  const cur = currentSlot(league);
  if (cur.owner !== me) return null;
  const myPk = pickOfSlot(league, cur);
  if (!myPk || myPk.owner !== me || pickLocked(league, myPk.id)) return null;
  const p = (league.draftClass || []).map((id) => league.players[id]).filter((x) => x?.tid === -2).sort((a, b) => csRank(a) - csRank(b))[0];
  const fell = p ? cur.overall - csRank(p) : 0;
  if (!p || fell < 6) return null;
  const window = cur.round === 1 ? 14 : 20;
  const seen = new Set();
  let best = null;
  for (const s of d.slots.slice(d.idx + 1, d.idx + 1 + window)) {
    if (s.pid || s.owner === me || seen.has(s.owner)) continue;
    seen.add(s.owner);
    const n = (teamNeeds(league, league.teams[s.owner]).find((x) => x.pos === p.pos)?.score || 0) / 100;
    if (n >= 0.3 && (!best || n > best.n)) best = { s, n };
  }
  if (!best) return null;
  const team = best.s.owner;
  const theirPk = pickOfSlot(league, best.s);
  if (!theirPk || theirPk.owner !== team || pickLocked(league, theirPk.id)) return null;
  const phone = phoneLog(league);
  const r = stream(`${d.year}|faller|${cur.overall}|${p.id}`);
  const mine = slotValue(cur.overall);
  const premium = 1.15 + r.next() * 0.1 + Math.min(0.1, fell * 0.008) + (phone.bump[`${cur.overall}:${team}`] || 0);
  const need = mine * premium - slotValue(best.s.overall);
  const { extras, got } = fill(assets(league, team, cur.overall, [theirPk.id]), need);
  if (got < need * 0.85) return null;
  const get = slotValue(best.s.overall) + got;
  const o = { id: offerId("faller", d, cur.overall, best.s.overall, team), kind: "faller", team, mine: myPk.id, myOverall: cur.overall, theirs: theirPk.id, theirOverall: best.s.overall, extras: extras.map((pk) => pk.id), give: chartPts(mine), get: chartPts(get), pct: Math.round((get / mine - 1) * 100), target: p.id, fell, move: best.s.overall - cur.overall };
  return phone.gone[o.id] || !dealOk(league, o) ? null : o;
}

// Every offer for the pick you're on the clock with: the sliding-star call first, then the rest.
export function onClockOffers(league) {
  const f = fallerCall(league);
  return [...(f ? [f] : []), ...tradeDownCalls(league).filter((o) => o.team !== f?.team)];
}

// The call that rings: the best offer you haven't answered yet (a sliding star first).
export function incomingCall(league) {
  const seen = phoneLog(league).seen;
  return onClockOffers(league).filter((o) => !seen[o.id]).sort((a, b) => (b.kind === "faller") - (a.kind === "faller") || b.pct - a.pct)[0] || null;
}

// What it takes to move up to one pick (any club's, before one of your later picks): your next
// pick after it plus extras (your later picks this draft, next year's rounds 1-4) to cover the
// chart gap and a premium, since moving up costs more than moving down earns. The answer is the
// same every time you ask. Returns { offer } or { no: "keep" | "cost" | "none" | "taken" }.
export function quoteTradeUp(league, overall) {
  const d = league.draft;
  if (!draftLive(league)) return { no: "none" };
  const me = league.userTid;
  const theirSlot = d.slots.find((s) => s.overall === overall);
  if (!theirSlot || theirSlot.pid || theirSlot.overall < currentSlot(league).overall) return { no: "taken" };
  if (theirSlot.owner === me) return { no: "none" };
  const mySlot = d.slots.find((s) => s.overall > overall && !s.pid && s.owner === me && pickOfSlot(league, s)?.owner === me && !pickLocked(league, pickOfSlot(league, s).id));
  if (!mySlot) return { no: "none" };
  const theirPk = pickOfSlot(league, theirSlot), myPk = pickOfSlot(league, mySlot);
  if (!theirPk || theirPk.owner !== theirSlot.owner || pickLocked(league, theirPk.id)) return { no: "keep" };
  const r = stream(`${d.year}|up|${mySlot.overall}|${theirSlot.overall}|${theirSlot.owner}`);
  if (r.next() < 0.3) return { no: "keep" }; // some clubs love their spot
  const premium = 1.08 + r.next() * 0.14;
  const mine = slotValue(mySlot.overall), theirs = slotValue(theirSlot.overall);
  const need = (theirs - mine) * premium;
  const { extras, got } = fill(assets(league, me, mySlot.overall, [myPk.id]), need);
  if (got < need * 0.9) return { no: "cost" };
  const o = { id: offerId("up", d, mySlot.overall, theirSlot.overall, theirSlot.owner), kind: "up", team: theirSlot.owner, mine: myPk.id, myOverall: mySlot.overall, theirs: theirPk.id, theirOverall: theirSlot.overall, extras: extras.map((pk) => pk.id), give: chartPts(mine + got), get: chartPts(theirs), up: mySlot.overall - theirSlot.overall };
  return dealOk(league, o) ? { offer: o } : { no: "keep" };
}

// The trade-up phone bank: every club picking between now and your next pick, nearest first.
export function tradeUpCalls(league, max = 4) {
  if (!draftLive(league)) return [];
  const d = league.draft, me = league.userTid;
  const nx = nextUserSlot(league);
  if (!nx || nx.away === 0) return [];
  const gone = phoneLog(league).gone;
  const seen = new Set(), out = [];
  for (const s of d.slots.slice(d.idx)) {
    if (s.overall >= nx.slot.overall || out.length >= max) break;
    if (s.owner === me || seen.has(s.owner)) continue;
    seen.add(s.owner);
    const q = quoteTradeUp(league, s.overall);
    if (q.offer && !gone[q.offer.id]) out.push(q.offer);
  }
  return out;
}

// The trade an offer stands for, as the trade engine takes it (you are always `from`).
export function offerTrade(league, o) {
  const me = league.userTid;
  return o.kind === "up"
    ? { from: me, to: o.team, give: [], get: [], givePicks: [o.mine, ...o.extras], getPicks: [o.theirs] }
    : { from: me, to: o.team, give: [], get: [], givePicks: [o.mine], getPicks: [o.theirs, ...o.extras] };
}

// Every pick still where the offer says and still unused, and nothing in the rulebook against it.
function dealOk(league, o) {
  const d = league.draft, me = league.userTid;
  const t = offerTrade(league, o);
  const owns = (ids, owner) => ids.every((id) => { const pk = league.draftPicks.find((p) => p.id === id); if (!pk || pk.owner !== owner) return false; if (pk.year !== d.year) return true; const s = slotOfPick(d, pk); return !!s && !s.pid && s.owner === owner; });
  if (!owns(t.givePicks, me) || !owns(t.getPicks, o.team)) return false;
  return evaluateTrade(league, t).problems.length === 0;
}

// Make the deal. The picks and their draft slots move together; the clock restarts if the pick
// on the clock changed hands. Returns { ok, msg }.
export function acceptCall(league, o) {
  if (!o || !draftLive(league) || !dealOk(league, o)) return { ok: false, msg: "That deal is off the table now." };
  const phone = phoneLog(league);
  const done = executeTrade(league, offerTrade(league, o));
  if (!done) return { ok: false, msg: "That deal is off the table now." };
  phone.seen[o.id] = true;
  phone.gone[o.id] = true;
  draftClock(league);
  const t = league.teams[o.team];
  const label = (id) => shortPick(league, league.draftPicks.find((p) => p.id === id));
  if (o.kind === "up") return { ok: true, msg: `Moved up to #${o.theirOverall} with the ${t.name}. They get ${[o.mine, ...o.extras].map(label).join(", ")}.` };
  return { ok: true, msg: `Traded #${o.myOverall} to the ${t.name} for ${[o.theirs, ...o.extras].map(label).join(", ")}.` };
}

// Ask for more: about half the time they sweeten it (a bigger premium); otherwise they hang up.
export function askForMore(league, o) {
  const phone = phoneLog(league);
  const tries = (phone.tries[o.id] || 0) + 1;
  phone.tries[o.id] = tries;
  phone.seen[o.id] = true;
  const yes = (league.draft.idx * 31 + o.team * 17 + tries * 7) % 10 < 5;
  const t = league.teams[o.team];
  if (yes) {
    const k = `${o.myOverall}:${o.team}`;
    phone.bump[k] = (phone.bump[k] || 0) + 0.12;
    return { ok: true, msg: `The ${t.name} sweeten the offer.` };
  }
  phone.gone[o.id] = true;
  return { ok: false, msg: `The ${t.name} hang up. They'll look elsewhere.` };
}

// Hang up on the incoming call (the offer stays on the list), or turn it down for good.
export function hangUp(league, o) { phoneLog(league).seen[o.id] = true; }
export function dismissCall(league, o) { const ph = phoneLog(league); ph.seen[o.id] = true; ph.gone[o.id] = true; }
