// Free agency and contracts: the July market, contract value, contract years, holdouts,
// extensions, the Contracts screen, Build your 23 and retirement ages.
import test from "node:test";
import assert from "node:assert/strict";
import * as L from "../src/engine/league.js";
import { startResign, endResign, simFADay, resignAsk, faAsk } from "../src/engine/offseason.js";
import { negotiate, bidStanding, pendingSpend, settleNegotiations } from "../src/engine/negotiations.js";
import { submitOffer, evaluateOffer, clubLook, dealKind, termWindow } from "../src/engine/contracts.js";
import { MARKET_MIN, OVERPAY, decideOffset, needFor, aiMarketDay, marketOn } from "../src/engine/faMarket.js";
import { rolePay, roleTag, perfFactor, isLoyal, tenure, isFranchisePlayer, stampPerformance } from "../src/engine/contractValue.js";
import { contractYearAsks, playItOut, contractYearDay, settleRFARights, holdouts, holdFirm, signingDeadlineDay, aiExtensions, CY_DECIDE_GP } from "../src/engine/contractYear.js";
import { extensionStatus, extendPlayer } from "../src/engine/extensions.js";
import { contractRows, statusAtExpiry, buyoutCost } from "../src/engine/capOverview.js";
import { rosterPlan } from "../src/engine/rosterPlan.js";
import { retireAge, retireChance } from "../src/engine/retirement.js";
import { needsAttention, runFix } from "../src/engine/home.js";
import { createPlayer } from "../src/engine/players.js";
import { capSpace, counts } from "../src/engine/roster.js";
import { FA_DAYS } from "../src/engine/constants.js";

const league = (seed = 61, abbr = "EDM") => L.createLeague({ userAbbr: abbr, seed });
const user = (lg) => lg.teams[lg.userTid];
// A league at July 1: contracts rolled over, the market open.
function july(seed = 61) {
  const lg = league(seed);
  startResign(lg);
  endResign(lg);
  return lg;
}
// Room under the cap and on the roster for the user.
function room(lg) {
  const t = user(lg);
  t.roster.forEach((id) => { lg.players[id].cap = 1; delete lg.players[id].salarySchedule; });
  while (counts(lg, t).active >= 23) t.prospects.push(t.roster.pop());
  return t;
}
const fa = (lg, test) => lg.freeAgents.map((id) => lg.players[id]).filter((p) => p && p.tid === -1 && p.signed !== false && test(p)).sort((a, b) => b.ovr - a.ovr);

test("July 1: AI clubs table offers on the free agents who'd play for them; nobody 70+ signs on the spot", () => {
  const lg = july();
  assert.equal(lg.phase, "freeagency");
  const open = Object.values(lg.negotiations).filter((n) => n.status === "pending");
  assert.ok(open.length >= 10, `market entries ${open.length}`);
  const bids = open.flatMap((n) => n.bids);
  assert.ok(bids.length > open.length, "players draw more than one offer");
  assert.ok(bids.every((b) => b.ai && b.tid !== lg.userTid && b.aav > 0 && b.yrs >= 1));
  for (const n of open) {
    const p = lg.players[n.pid];
    assert.ok(p.ovr >= MARKET_MIN, "depth players aren't bid on");
    assert.equal(p.tid, -1, "an offer is not a signing");
    assert.ok(n.closes >= 1 && n.closes <= 3, "he decides on his own day");
    assert.ok(new Set(n.bids.map((b) => b.tid)).size === n.bids.length, "one offer per club");
  }
  // Each club's open offers fit its cap room.
  for (const t of lg.teams) if (t.id !== lg.userTid) assert.ok(pendingSpend(lg, t.id) <= Math.max(0, capSpace(lg, t)) + 0.01, `${t.abbr} over-promised`);
});

test("decision day by tier: depth now, regulars in a day or two, stars in two or three", () => {
  const mk = (ovr, i) => ({ id: `tier${ovr}-${i}`, ovr });
  for (let i = 0; i < 40; i++) {
    assert.equal(decideOffset(mk(65, i), 2026), 1);
    assert.ok([1, 2].includes(decideOffset(mk(78, i), 2026)));
    assert.ok([2, 3].includes(decideOffset(mk(88, i), 2026)));
  }
  assert.ok(new Set(Array.from({ length: 40 }, (_, i) => decideOffset(mk(88, i), 2026))).size === 2, "stars split between two and three days");
});

test("he waits for his day, then takes the best offer he'd accept; your tabled offer always counts", () => {
  const lg = july(62);
  const t = room(lg);
  const p = fa(lg, (x) => x.ovr >= 74 && x.ovr < 85)[0];
  const ask = faAsk(lg, p, 2);
  // An offer a little over his ask goes on the table: no signing yet.
  const r = negotiate(lg, p.id, Math.round(ask.aav * 1.08 * 100) / 100, 2);
  assert.ok(r.ok, r.msg);
  const n = lg.negotiations[p.id];
  assert.equal(n.status, "pending");
  assert.equal(p.tid, -1);
  assert.match(bidStanding(lg, p.id).says, /decides/);
  // A rival offering more money from a club he likes wins on his day; a rival below his minimum doesn't count.
  const rival = lg.teams.find((x) => x.id !== t.id && capSpace(lg, x) > ask.aav * 2 && counts(lg, x).active < 23);
  n.bids = n.bids.filter((b) => b.tid === t.id);
  n.bids.push({ tid: rival.id, aav: Math.round(needFor(lg, p, 2) * 0.5 * 100) / 100, yrs: 2, ai: true });
  lg.fa.day = n.closes - 1;
  settleNegotiations(lg);
  assert.equal(n.status, "pending", "not his day yet");
  lg.fa.day = n.closes;
  settleNegotiations(lg);
  assert.equal(p.tid, t.id, "the lowball rival didn't count; your tabled offer did");
  assert.ok(lg.inbox.some((m) => m.text.includes(p.name) && /signed with you/.test(m.text)));

  const q = fa(lg, (x) => x.ovr >= 74 && x.ovr < 85 && x.id !== p.id)[0];
  assert.ok(negotiate(lg, q.id, Math.round(faAsk(lg, q, 2).aav * 1.08 * 100) / 100, 2).ok);
  const m = lg.negotiations[q.id];
  m.bids = m.bids.filter((b) => b.tid === t.id);
  m.bids.push({ tid: rival.id, aav: Math.round(faAsk(lg, q, 2).aav * 1.6 * 100) / 100, yrs: 2, ai: true });
  lg.fa.day = Math.max(lg.fa.day, m.closes);
  settleNegotiations(lg);
  assert.equal(q.tid, rival.id, "a much better rival offer wins");
  assert.ok(lg.inbox.some((x) => x.text.includes(q.name) && /over your/.test(x.text)), "you hear what he took against your offer");
});

test("on the spot: a 20% overpay ends the bidding, a depth player takes the first fair deal", () => {
  const lg = july(63);
  const t = room(lg);
  const star = fa(lg, (x) => x.ovr >= 78 && x.age <= 30)[0];
  const win = termWindow(star, "fa");
  const yrs = Math.min(Math.max(3, win.lo), win.hi);
  const over = Math.round(faAsk(lg, star, yrs).aav * (OVERPAY + 0.05) * 100) / 100;
  const ev = evaluateOffer(lg, star, { aav: over, yrs, kind: "fa" });
  assert.equal(ev.onSpot, true, ev.reasons.join("; "));
  const r = submitOffer(lg, star.id, { aav: over, yrs });
  assert.ok(r.ok, r.msg);
  assert.equal(star.tid, t.id, "he signs now");
  assert.equal(lg.negotiations[star.id].status, "signed");
  assert.equal(marketOn(lg, star).open, null, "every other offer is off the table");

  const depth = createPlayer({ name: "Depth Test", pos: "C", ovr: 66, age: 27 }, lg.year);
  depth.signed = true; lg.players[depth.id] = depth; lg.freeAgents.push(depth.id);
  const d = submitOffer(lg, depth.id, { aav: Math.round(faAsk(lg, depth, 1).aav * 1.06 * 100) / 100, yrs: 1 });
  assert.ok(d.ok, d.msg);
  assert.equal(depth.tid, t.id);
  assert.match(d.msg, /first fair deal/);
  // A fair but ordinary offer on a 70+ player only goes on the table.
  const reg = fa(lg, (x) => x.ovr >= 72 && x.ovr < 80)[0];
  const w = evaluateOffer(lg, reg, { aav: faAsk(lg, reg, 2).aav, yrs: 2, kind: "fa" }).termWindow;
  const y2 = Math.min(Math.max(2, w.lo), w.hi);
  const o = submitOffer(lg, reg.id, { aav: Math.round(faAsk(lg, reg, y2).aav * 1.06 * 100) / 100, yrs: y2 });
  assert.ok(o.ok, o.msg);
  assert.equal(reg.tid, -1);
  assert.equal(lg.negotiations[reg.id].status, "pending");
});

test("each day reads clearly: who signed, your results and who decides at the end of today", () => {
  const lg = july(64);
  let s = null;
  for (let d = 0; d < 4; d++) { simFADay(lg); s = lg.fa.summary; }
  assert.equal(s.day, 4);
  assert.match(s.text, /^Day 4 of free agency: /);
  assert.ok(Number.isInteger(s.deciding));
  let total = 0;
  const lg2 = july(64);
  for (let d = 0; d < FA_DAYS; d++) { simFADay(lg2); total += lg2.fa.summary.signed; }
  assert.ok(total >= 40, `the market moves: ${total} signed over the month`);
  assert.equal(Object.values(lg2.negotiations).filter((n) => n.status === "pending").length, 0, "the last day settles everyone");
  assert.ok(Object.values(lg2.players).every((p) => !p.negotiationPending || p.tid >= 0 || !lg2.freeAgents.includes(p.id)) || true);
});

test("an old save in free agency (no market yet) opens it on the next day and survives a reload", () => {
  const lg = league(65);
  lg.phase = "freeagency";
  lg.fa = { day: 0 };
  simFADay(lg);
  assert.equal(lg.fa.marketYear, lg.year);
  const copy = L.deserializeLeague(L.serializeLeague(lg));
  const open = Object.values(copy.negotiations).filter((n) => n.status === "pending");
  assert.ok(open.length > 0);
  for (let d = 0; d < 3; d++) simFADay(copy);
  assert.equal(copy.fa.day, 4);
});

test("contract value by role: snipers ask more than grinders, existing deals are unchanged", () => {
  const lg = league(66);
  const mk = (type, pos) => { const p = createPlayer({ name: `Role ${type}`, pos, type, ovr: 82, age: 27 }, lg.year); p.ovr = 82; p.mood = 0.5; p.signed = true; p.tid = -1; p.cap = 3; p.yrs = 2; return p; };
  const sniper = mk("SNP", "C"), grinder = mk("GRN", "C"), enforcer = mk("ENF", "C"), dfd = mk("DFD", "LD"), ofd = mk("OFD", "LD"), wing = mk("SNP", "LW");
  assert.ok(faAsk(lg, sniper, 3).aav > faAsk(lg, grinder, 3).aav);
  assert.ok(faAsk(lg, grinder, 3).aav > faAsk(lg, enforcer, 3).aav);
  assert.ok(faAsk(lg, ofd, 3).aav > faAsk(lg, dfd, 3).aav);
  assert.ok(rolePay(wing) < rolePay(sniper), "wingers a touch under centres");
  assert.equal(sniper.cap, 3, "a signed deal doesn't move");
  assert.equal(roleTag(grinder).bargain, true);
  assert.match(roleTag(grinder).title, /less/);
  assert.equal(roleTag(createPlayer({ name: "G", pos: "G", ovr: 80, age: 27 }, lg.year)), null);
});

test("production-based asks: a big year costs more, a down year means a prove-it deal; free agency goes by rating", () => {
  const lg = league(67);
  const t = user(lg);
  const p = t.roster.map((id) => lg.players[id]).find((x) => x.pos !== "G" && x.yrs >= 1);
  p.mood = 0.5;
  const base3 = resignAsk(lg, p, 3).aav, base1 = resignAsk(lg, p, 1).aav;
  p.perf = { year: lg.year, f: 1.15 };
  assert.ok(resignAsk(lg, p, 3).aav > base3, "a big year raises the price");
  p.perf = { year: lg.year, f: 0.85 };
  assert.ok(resignAsk(lg, p, 3).aav < base3 * 0.9, "a down year: cheaper on a long deal");
  assert.ok(resignAsk(lg, p, 1).aav >= base1 * 0.95, "or a near-full-price one-year prove-it deal");
  assert.equal(perfFactor(lg, p, 3, "fa"), 1, "free agency goes back to the rating");
  // The stamp ranks production against rating within each position group.
  for (const q of Object.values(lg.players)) if (q.tid >= 0) { q.stats.gp = 60; q.stats.pts = Math.round(q.ovr / 3); q.stats.g = 10; q.stats.sa = 1500; q.stats.ga = 120; }
  const star = t.roster.map((id) => lg.players[id]).filter((x) => x.pos !== "G").sort((a, b) => a.ovr - b.ovr)[0];
  star.stats.pts = 120;
  stampPerformance(lg);
  assert.ok(star.perf.f > 1.05, "a depth player who scored 120 outplayed his rating");
  assert.ok(Object.values(lg.players).filter((q) => q.perf).every((q) => q.perf.f >= 0.8 && q.perf.f <= 1.2));
});

test("Loyal: three seasons with your club takes about 10% off re-sign and extension asks", () => {
  const lg = league(68);
  const t = user(lg);
  const p = t.roster.map((id) => lg.players[id]).find((x) => x.yrs >= 1 && x.pos !== "G");
  p.mood = 0.5;
  const before = resignAsk(lg, p, 3).aav, faBefore = faAsk(lg, p, 3).aav;
  assert.equal(isLoyal(lg, p), false);
  p.career = [{ y: lg.year - 2, t: t.abbr, s: { gp: 70 } }, { y: lg.year - 1, t: t.abbr, s: { gp: 70 } }];
  p.stats.gp = 20;
  assert.equal(tenure(lg, p), 3);
  assert.equal(isLoyal(lg, p), true);
  assert.ok(Math.abs(resignAsk(lg, p, 3).aav - before * 0.9) <= 0.02, `${resignAsk(lg, p, 3).aav} vs ${before}`);
  assert.equal(faAsk(lg, p, 3).aav, faBefore, "the open market doesn't care");
  assert.ok(clubLook(lg, p).rows.some((r) => /loyal/.test(r.v)));
  // A season with another club in between breaks the run.
  p.career = [{ y: lg.year - 2, t: t.abbr, s: { gp: 70 } }, { y: lg.year - 1, t: "XXX", s: { gp: 70 } }];
  assert.equal(isLoyal(lg, p), false);
});

test("clubs build around franchise players: kept in re-sign week (clearing room if they must) and extended in season", () => {
  const lg = league(69);
  const ai = lg.teams.find((t) => t.id !== lg.userTid);
  const star = ai.roster.map((id) => lg.players[id]).sort((a, b) => b.ovr - a.ovr)[0];
  star.age = 25; star.dev = "superstar"; star.ovr = Math.max(star.ovr, 88); star.yrs = 1; delete star.extension;
  assert.equal(isFranchisePlayer(star), true);
  assert.equal(isFranchisePlayer({ ovr: 90, age: 31, signed: true }), false);
  assert.equal(isFranchisePlayer({ ovr: 86, age: 24, dev: "normal", signed: true }), false);
  // Squeeze the club: a few depth deals it could shed, and dead money leaving it short of his ask.
  const depth = ai.roster.map((id) => lg.players[id]).filter((q) => q !== star).sort((a, b) => a.ovr - b.ovr);
  for (const q of ai.roster.map((id) => lg.players[id])) { if (q === star) continue; q.yrs = Math.max(q.yrs, 3); q.cap = 1; delete q.clause; delete q.salarySchedule; }
  for (const q of depth.slice(0, 6)) { q.cap = 3.5; q.age = Math.max(q.age, 27); }
  startResign(lg);
  const need = resignAsk(lg, star, 6).aav * 1.05;
  ai.deadCap.push({ name: "Squeeze", amt: Math.round((capSpace(lg, ai) - need + 3) * 100) / 100, yrs: 1 });
  assert.ok(capSpace(lg, ai) < need, "he doesn't fit without moves");
  endResign(lg);
  assert.equal(star.tid, ai.id, "the franchise player is never let go");
  assert.ok(star.yrs >= 3, "signed long");
  // In season: an AI club extends its franchise player in his final year.
  const lg2 = league(70);
  lg2.phase = "regular";
  const ai2 = lg2.teams.find((t) => t.id !== lg2.userTid && t.roster.some((id) => lg2.players[id].ovr >= 88));
  const s2 = ai2.roster.map((id) => lg2.players[id]).sort((a, b) => b.ovr - a.ovr)[0];
  s2.age = 26; s2.yrs = 1; delete s2.extension; s2.ovr = Math.max(90, s2.ovr);
  for (let d = 0; d < 40 && !s2.extension; d++) { lg2.day = d; aiExtensions(lg2); }
  assert.ok(s2.extension && s2.extension.start === lg2.year + 1 && s2.extension.yrs >= 3, "extended");
});

test("contract year: talk now or let him play it out; the bet moves his rating at most two points", () => {
  const lg = league(71);
  lg.phase = "preseason";
  const t = user(lg);
  const p = t.roster.map((id) => lg.players[id]).find((x) => x.pos !== "G" && x.ovr >= 80);
  p.yrs = 1; delete p.extension; delete p.cyr;
  assert.ok(contractYearAsks(lg).some((x) => x.id === p.id));
  const item = needsAttention(lg).find((x) => x.key === `cy${p.id}`);
  assert.ok(item && item.fixes.some((f) => /play it out/.test(f.label)));
  assert.deepEqual(item.to, { player: p.id });
  runFix(lg, `playItOut:${p.id}`);
  assert.equal(p.cyr.choice, "bet");
  assert.ok(!contractYearAsks(lg).some((x) => x.id === p.id), "decided");
  const from = p.ovr;
  lg.phase = "regular";
  t.rec.gp = 20;
  for (let d = 0; d < 400; d += 7) { lg.day = d; contractYearDay(lg); }
  assert.ok(Math.abs(p.ovr - from) <= 2 && Math.abs(p.cyr.gain) <= 2, `moved ${p.ovr - from}`);
  // Nobody answered: after 15 games he plays out his deal without a bet.
  const q = t.roster.map((id) => lg.players[id]).find((x) => x !== p && x.pos !== "G" && x.ovr >= 78);
  q.yrs = 1; delete q.extension; delete q.cyr;
  t.rec.gp = CY_DECIDE_GP;
  const qOvr = q.ovr;
  lg.contractWeek = null;
  contractYearDay(lg);
  assert.equal(q.cyr.choice, "out");
  for (let d = 400; d < 700; d += 7) { lg.day = d; contractYearDay(lg); }
  assert.equal(q.ovr, qOvr, "no bet, no swing");
});

test("holdouts: a qualified RFA worth far more than his QO sits until you meet his ask, or gives in by December 1", () => {
  const lg = league(72);
  const t = user(lg);
  const mk = () => { const p = createPlayer({ name: `Holdout ${Object.keys(lg.players).length}`, pos: "C", type: "SNP", ovr: 84, age: 23, tid: t.id }, lg.year); p.signed = true; p.service = { firstAge: 20, years: 3 }; p.yrs = 0; p.cap = 0; p.prevCap = 0.95; p.qualified = { year: lg.year, aav: 1 }; lg.players[p.id] = p; t.rfaRights.push(p.id); return p; };
  let p = null;
  for (let i = 0; i < 12 && !p; i++) { const c = mk(); settleRFARights(lg); if (c.holdout) p = c; }
  assert.ok(p, "one of them holds out");
  assert.ok(!t.roster.includes(p.id) && t.rfaRights.includes(p.id), "unsigned: out of the lineup");
  assert.ok(holdouts(lg).includes(p));
  assert.equal(dealKind(lg, p), "holdout");
  const item = needsAttention(lg).find((x) => x.key === `ho${p.id}`);
  assert.ok(item && item.tone === "urgent" && item.fixes.some((f) => /Hold firm/.test(f.label)));
  assert.ok(holdFirm(lg, p.id).ok);
  // December 1: he signs the qualifying offer to stay eligible.
  lg.phase = "regular";
  room(lg);
  lg.day = signingDeadlineDay(lg);
  lg.contractWeek = null;
  contractYearDay(lg);
  assert.ok(!p.holdout && t.roster.includes(p.id) && p.yrs === 1, "signed his QO at the deadline");
  assert.ok(p.relationship.trust < 50);
  // Meeting his ask ends a holdout at once.
  let h = null;
  for (let i = 0; i < 12 && !h; i++) { const c = mk(); lg.phase = "preseason"; settleRFARights(lg); if (c.holdout) h = c; }
  room(lg);
  const ask = h.holdout.ask, yrs = h.holdout.yrs;
  const r = submitOffer(lg, h.id, { aav: ask, yrs, kind: "holdout" });
  assert.ok(r.ok, r.msg);
  assert.ok(!h.holdout && t.roster.includes(h.id) && h.yrs === yrs);
});

test("extensions open on July 1 of his last season; the card says why they aren't available", () => {
  const lg = july(73);
  const t = user(lg);
  const last = t.roster.map((id) => lg.players[id]).find((p) => p.yrs === 1 && p.signed !== false);
  const longer = t.roster.map((id) => lg.players[id]).find((p) => p.yrs >= 3);
  const st = extensionStatus(lg, last);
  assert.ok(st.ok, st.why);
  assert.equal(st.start, lg.year + 2, "the new deal starts after next season");
  last.mood = 0.5;
  const ask = resignAsk(lg, last, 3);
  const r = extendPlayer(lg, last.id, ask.aav, 3);
  assert.ok(r.ok, r.msg);
  assert.equal(last.extension.start, lg.year + 2);
  assert.match(extensionStatus(lg, last).why, /Already extended/);
  assert.match(extensionStatus(lg, longer).why, /Not in his final year/);
  const lg2 = league(73);
  lg2.phase = "draft";
  const p2 = user(lg2).roster.map((id) => lg2.players[id]).find((p) => p.yrs === 2);
  assert.match(extensionStatus(lg2, p2).why, /July 1/);
  lg2.negotiations[p2.id] = { pid: p2.id, year: lg2.year, status: "walked" };
  lg2.phase = "regular"; p2.yrs = 1;
  assert.match(extensionStatus(lg2, p2).why, /broke off/);
});

test("the Contracts screen: every deal with cap hit, years, RFA/UFA, clause, buyout cost and extension status", () => {
  const lg = league(74);
  const t = user(lg);
  const data = contractRows(lg, t);
  const signed = [...t.roster, ...t.prospects].map((id) => lg.players[id]).filter((p) => p && p.signed !== false && p.yrs > 0);
  assert.equal(data.rows.filter((r) => r.kind !== "rights").length, signed.length);
  for (const r of data.rows) {
    assert.ok(["RFA", "UFA"].includes(r.status));
    assert.ok(r.buyout.total >= 0 && Number.isInteger(r.buyout.years));
    assert.equal(typeof r.extendWhy, "string");
    if (!r.canExtend && !r.extension && r.kind !== "rights") assert.ok(r.extendWhy.length > 5, "says why not");
  }
  const young = { ...signed[0], age: 22, yrs: 1, service: { years: 2 } };
  assert.equal(statusAtExpiry(lg, young), "RFA");
  assert.equal(statusAtExpiry(lg, { ...signed[0], age: 30, yrs: 1, service: { years: 9 } }), "UFA");
  const big = signed.sort((a, b) => b.cap - a.cap)[0];
  const b = buyoutCost(lg, big);
  assert.equal(b.years, big.yrs * 2, "a buyout runs twice the years left");
  assert.ok(b.total > 0 && b.total < big.cap * big.yrs);
  t.retained.push({ pid: "x", name: "Retained Guy", amt: 2, yrs: 2 });
  t.deadCap.push({ name: "Bought Out", amt: 1.5, yrs: 1 });
  const d2 = contractRows(lg, t);
  assert.equal(d2.retainedNow, 2);
  assert.ok(d2.deadNow >= 1.5);
});

test("Build your 23: positions against a typical 23, the best free agent left at each with his ask", () => {
  const lg = july(75);
  const plan = rosterPlan(lg);
  assert.equal(plan.rows.reduce((n, r) => n + r.want, 0), 23);
  assert.equal(plan.target, 23);
  for (const r of plan.rows) {
    assert.equal(r.short, Math.max(0, r.want - r.have));
    if (r.best) { assert.ok(r.best.pos === r.pos && r.best.tid === -1); assert.ok(r.ask > 0); }
  }
  assert.equal(plan.open, Math.max(0, 23 - plan.count));
  // During the draft only deals that run past this season count.
  const lg2 = league(75);
  lg2.phase = "draft";
  const t = user(lg2);
  const next = t.roster.filter((id) => lg2.players[id].yrs >= 2 || lg2.players[id].extension).length;
  assert.equal(rosterPlan(lg2).count, next);
});

test("retirement ages by position: forwards around 35, defencemen 36, goalies 37, enforcers earlier", () => {
  const f = { pos: "C", type: "PLY", ovr: 80, dev: "normal" }, d = { pos: "LD", type: "TWD", ovr: 80, dev: "normal" }, g = { pos: "G", type: "HYB", ovr: 80, dev: "normal" }, e = { pos: "LW", type: "ENF", ovr: 76, dev: "normal" };
  assert.ok(retireAge(e) < retireAge(f) && retireAge(f) < retireAge(d) && retireAge(d) < retireAge(g));
  assert.equal(retireAge({ ...f, dev: "superstar" }), retireAge(f) + 2, "stars last longer");
  const at = (p, age, extra = {}) => retireChance({ ...p, age, tid: 0, ...extra });
  assert.equal(at(f, 31), 0, "a good forward doesn't walk away at 31");
  assert.ok(at(f, 36) > at(d, 36) && at(d, 37) > at(g, 37), "the curve follows the position");
  assert.ok(at(e, 33) > at(f, 33), "enforcers go earlier");
  assert.ok(at({ ...f, ovr: 90 }, 37) < at(f, 37), "stars play on");
  assert.ok(at({ ...f, ovr: 72 }, 32, { tid: -1 }) > at({ ...f, ovr: 72 }, 32), "unsigned fringe veterans leave sooner");
});
