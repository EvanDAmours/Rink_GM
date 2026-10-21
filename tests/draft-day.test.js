// Draft day and draft night (Gridiron 1.12, 1.9994, 2.6, 2.19, 3.4, 3.39, 1.69): the draft clock,
// Sim this pick / Sim to my pick, the draft-day phone and the draft recap.
import test from "node:test";
import assert from "node:assert/strict";
import * as L from "../src/engine/league.js";
import { startDraft, currentSlot, draftDone, simDraftToUser } from "../src/engine/draft.js";
import { csRank } from "../src/engine/scouting.js";
import {
  DRAFT_CLOCK, clockTick, aiPickAt, draftClock, tickDraftClock, setDraftSpeed, cycleDraftSpeed, setDraftPaused, simThisPick, simToMyPick,
  draftPlayer, nextUserSlot, tradeDownCalls, quoteTradeUp, tradeUpCalls, acceptCall, askForMore, onClockOffers, incomingCall, hangUp, slotValue, pickOfSlot,
} from "../src/engine/draftClock.js";
import { draftRecap, recapYears, pickValueTag, stampDraftTruth, VERDICT } from "../src/engine/draftRecap.js";

const draftLeague = (seed = 123) => {
  const lg = L.createLeague({ userAbbr: "EDM", seed });
  startDraft(lg);
  lg.phase = "draft";
  lg.draft.stage = "live";
  return lg;
};

// Every unused slot in the draft belongs to the same club as its pick.
function ownershipConsistent(lg) {
  const d = lg.draft;
  for (const s of d.slots) {
    if (s.pid) continue;
    const pk = pickOfSlot(lg, s);
    if (pk && pk.owner !== s.owner) return `slot #${s.overall}: slot ${s.owner}, pick ${pk.owner}`;
  }
  return null;
}

test("the clock: real seconds in round 1 at any speed, quicker later on Normal and Fast; AI clubs take 45-75 seconds", () => {
  for (const sp of ["Slow", "Normal", "Fast"]) assert.equal(clockTick(sp, 1), 1000, `round 1 is real time on ${sp}`);
  assert.equal(clockTick("Slow", 5), 1000);
  assert.equal(clockTick("Normal", 2), 250);
  assert.equal(clockTick("Normal", 3), 250);
  assert.equal(clockTick("Normal", 4), 100);
  assert.equal(clockTick("Fast", 2), 40);
  for (let i = 0; i < 300; i++) { const t = aiPickAt(`2027-${i}`); assert.ok(t >= 45 && t <= 75, `ai time ${t}`); }
  assert.equal(aiPickAt("2027-5"), aiPickAt("2027-5"), "fixed per pick");

  const lg = draftLeague();
  const c = draftClock(lg);
  assert.equal(c.remaining, DRAFT_CLOCK);
  assert.equal(c.speed, "Normal", "every draft starts at Normal");
  assert.equal(c.paused, false);
  const s = currentSlot(lg);
  assert.notEqual(s.owner, lg.userTid, "a club other than the user is first in this league");
  const at = aiPickAt(`${lg.draft.year}-${s.overall}`);
  let ticks = 0, r = null;
  while (!r && ticks < 200) { r = tickDraftClock(lg); ticks++; }
  assert.equal(ticks, at, "the AI pick lands when its time on the clock is up");
  assert.equal(r.slot.overall, 1);
  assert.equal(r.how, "ai");
  assert.equal(lg.draft.idx, 1);
  assert.equal(draftClock(lg).remaining, DRAFT_CLOCK, "the next pick gets a fresh two minutes");

  // Paused: the clock doesn't move and nobody picks.
  setDraftPaused(lg, true);
  for (let i = 0; i < 200; i++) assert.equal(tickDraftClock(lg), null);
  assert.equal(draftClock(lg).remaining, DRAFT_CLOCK);
  assert.equal(lg.draft.idx, 1);
  setDraftPaused(lg, false);
  tickDraftClock(lg);
  assert.equal(draftClock(lg).remaining, DRAFT_CLOCK - 1);
});

test("your clock runs out: you take the top name on Your list, and the pick walks up on stage", () => {
  const lg = draftLeague();
  simToMyPick(lg);
  const s = currentSlot(lg);
  assert.equal(s.owner, lg.userTid);
  assert.equal(draftClock(lg).remaining, DRAFT_CLOCK);
  const pool = lg.draftClass.map((id) => lg.players[id]).filter((p) => p.tid === -2).sort((a, b) => csRank(b) - csRank(a));
  const listed = pool[0]; // the lowest-ranked prospect left, so it can't be a coincidence
  lg.myList = { year: lg.draftClassYear, ids: [listed.id] };
  let r = null;
  for (let i = 0; i < DRAFT_CLOCK && !r; i++) r = tickDraftClock(lg);
  assert.ok(r, "picked at 0:00");
  assert.equal(r.how, "auto");
  assert.equal(r.pid, listed.id);
  assert.equal(lg.players[listed.id].tid, lg.userTid);
  const m = lg.moments.find((x) => x.kind === "draft-stage");
  assert.ok(m, "the stage moment is queued");
  assert.equal(m.pid, listed.id);
  assert.equal(m.overall, s.overall);
  assert.equal(m.green, s.round === 1);
  assert.equal(m.p.num, lg.players[listed.id].number, "his number is on the sweater");
  assert.ok(Number.isInteger(m.p.num));
  // AI picks never go on stage.
  const before = lg.moments.length;
  simThisPick(lg);
  assert.equal(lg.moments.length, before);
});

test("the speed is saved with the draft (also in an exported save), and a new draft starts at Normal", () => {
  const lg = draftLeague();
  assert.equal(setDraftSpeed(lg, "Fast"), "Fast");
  setDraftPaused(lg, true);
  tickDraftClock(lg); // paused: no change
  const back = L.deserializeLeague(L.serializeLeague(lg));
  assert.equal(draftClock(back).speed, "Fast");
  assert.equal(draftClock(back).paused, true);
  const exported = L.deserializeLeague(L.exportLeagueText(lg));
  assert.equal(draftClock(exported).speed, "Fast");
  assert.equal(cycleDraftSpeed(back), "Slow");
  assert.equal(cycleDraftSpeed(back), "Normal");
  // A clock saved before speeds existed ({ overall, remaining }) keeps its time and gets defaults.
  const old = draftLeague();
  old.draft.clock = { overall: 1, remaining: 42 };
  const c = draftClock(old);
  assert.equal(c.remaining, 42);
  assert.equal(c.speed, "Normal");
  assert.equal(c.paused, false);
  // The next draft is a new draft object: Normal again.
  const next = draftLeague(124);
  next.draft.clock = undefined;
  assert.equal(draftClock(next).speed, "Normal");
});

test("Sim this pick makes the club on the clock pick (never yours); Sim to my pick stops at yours", () => {
  const lg = draftLeague();
  const first = currentSlot(lg);
  const r = simThisPick(lg);
  assert.equal(r.slot.overall, first.overall);
  assert.equal(r.how, "sim");
  assert.ok(lg.draft.slots[0].pid);
  const nx = nextUserSlot(lg);
  assert.ok(nx.away > 0);
  const made = simToMyPick(lg);
  assert.equal(made, nx.away);
  assert.equal(currentSlot(lg).owner, lg.userTid);
  assert.equal(simThisPick(lg), null, "Sim this pick never makes your pick");
  assert.equal(nextUserSlot(lg).away, 0);
  // Every pick so far is stamped with his draft-day truth for the recap.
  assert.ok(lg.draft.slots.filter((s) => s.pid).every((s) => s.tv && Number.isFinite(s.tv.pot)));
  // Drafting with your pick.
  const p = lg.draftClass.map((id) => lg.players[id]).find((x) => x.tid === -2);
  assert.ok(draftPlayer(lg, p.id));
  assert.equal(p.tid, lg.userTid);
  assert.equal(draftPlayer(lg, lg.draftClass.find((id) => lg.players[id].tid === -2)), null, "not on the clock any more");
});

test("trade-down calls: accepting one moves the picks and their slots together, and restarts the clock", () => {
  const lg = draftLeague();
  simToMyPick(lg);
  const cur = currentSlot(lg);
  draftClock(lg).remaining = 37;
  const offers = tradeDownCalls(lg);
  assert.ok(offers.length > 0, "clubs behind you call");
  for (const o of offers) {
    assert.ok(o.theirOverall > cur.overall);
    assert.notEqual(o.team, lg.userTid);
    assert.ok(o.get >= o.give * 0.85, "priced on the chart");
  }
  const call = incomingCall(lg);
  assert.ok(call && onClockOffers(lg).some((o) => o.id === call.id), "the best offer rings");
  hangUp(lg, call);
  assert.notEqual(incomingCall(lg)?.id, call.id, "a call you hung up on doesn't ring again");
  assert.ok(onClockOffers(lg).some((o) => o.id === call.id), "but it stays on the list");

  const o = offers[0];
  const mine = lg.draftPicks.find((p) => p.id === o.mine);
  const res = acceptCall(lg, o);
  assert.ok(res.ok, res.msg);
  assert.equal(ownershipConsistent(lg), null);
  assert.equal(lg.draft.slots[lg.draft.idx].owner, o.team, "they're on the clock with your old pick");
  assert.equal(mine.owner, o.team);
  for (const id of [o.theirs, ...o.extras]) assert.equal(lg.draftPicks.find((p) => p.id === id).owner, lg.userTid);
  assert.equal(lg.draft.slots.find((s) => s.overall === o.theirOverall).owner, lg.userTid);
  assert.equal(draftClock(lg).remaining, DRAFT_CLOCK, "a pick that changes hands gets a fresh clock");
  assert.equal(acceptCall(lg, o).ok, false, "the same deal can't be made twice");
  // The draft carries on to the end with every slot and pick agreeing.
  simDraftToUser(lg, { all: true });
  assert.ok(draftDone(lg));
});

test("trade up for any pick before yours, and shop any of your later picks", () => {
  const lg = draftLeague();
  const nx = nextUserSlot(lg);
  const bank = tradeUpCalls(lg);
  for (const o of bank) assert.ok(o.theirOverall < nx.slot.overall && o.kind === "up");
  // A pick two spots ahead of the one on the clock (not just the one on the clock).
  let q = null, target = null;
  for (const s of lg.draft.slots.slice(lg.draft.idx + 1)) {
    if (s.overall >= nx.slot.overall) break;
    const r = quoteTradeUp(lg, s.overall);
    if (r.offer) { q = r.offer; target = s; break; }
  }
  if (!q) for (const s of lg.draft.slots.slice(lg.draft.idx, lg.draft.idx + 60)) { if (s.owner === lg.userTid) continue; const r = quoteTradeUp(lg, s.overall); if (r.offer) { q = r.offer; target = s; break; } }
  assert.ok(q, "some club will move down");
  assert.deepEqual(quoteTradeUp(lg, target.overall).offer, q, "the same answer every time you ask");
  assert.ok(q.give >= q.get, "moving up costs a premium on the chart");
  const res = acceptCall(lg, q);
  assert.ok(res.ok, res.msg);
  assert.equal(target.owner, lg.userTid);
  assert.equal(lg.draftPicks.find((p) => p.id === q.theirs).owner, lg.userTid);
  for (const id of [q.mine, ...q.extras]) assert.equal(lg.draftPicks.find((p) => p.id === id).owner, q.team);
  assert.equal(ownershipConsistent(lg), null);
  // Shop a later pick of yours: offers come from clubs behind it.
  const later = lg.draft.slots.find((s) => s.owner === lg.userTid && s.overall > lg.draft.slots[lg.draft.idx].overall + 3 && !s.pid);
  const shop = tradeDownCalls(lg, later.overall);
  for (const o of shop) assert.ok(o.theirOverall > later.overall && o.myOverall === later.overall);
  // Taken picks can't be quoted.
  simThisPick(lg);
  assert.equal(quoteTradeUp(lg, 1).no, "taken");
});

test("ask for more: they sweeten it or hang up for good", () => {
  const lg = draftLeague();
  simToMyPick(lg);
  const offers = tradeDownCalls(lg);
  assert.ok(offers.length);
  let sweetened = false, gone = false;
  for (const o of offers) {
    const before = o.get;
    const r = askForMore(lg, o);
    const now = tradeDownCalls(lg).find((x) => x.id === o.id);
    if (r.ok) { sweetened = true; assert.ok(!now || now.get >= before, "a sweetened offer is never worse"); }
    else { gone = true; assert.equal(now, undefined, "a club that hung up is off the list"); }
  }
  assert.ok(sweetened || gone);
  assert.ok(slotValue(1) > slotValue(32) && slotValue(32) > slotValue(33) && slotValue(64) > slotValue(224), "the chart falls pick by pick");
});

test("the recap: draft-day truth per pick, verdicts, and a 1-32 ranking of every club's class", () => {
  const lg = draftLeague();
  simToMyPick(lg);
  const p = lg.draftClass.map((id) => lg.players[id]).find((x) => x.tid === -2);
  draftPlayer(lg, p.id);
  simDraftToUser(lg, { all: true }); // the top bar's Auto-Draft Rest: the draft floor stamps these when it shows them
  assert.ok(lg.draft.slots.some((s) => s.pid && !s.tv));
  stampDraftTruth(lg);
  assert.ok(draftDone(lg));
  const year = lg.draft.year;
  assert.deepEqual(recapYears(lg), [year]);
  const rec = draftRecap(lg, year);
  assert.equal(rec.rows.length, lg.draft.slots.length);
  for (const r of rec.rows) {
    assert.ok(VERDICT[r.verdict], r.verdict);
    assert.ok(Number.isFinite(r.ovr) && Number.isFinite(r.pot));
    assert.equal(r.pot, lg.players[r.pid].pot, "true POT revealed");
    assert.equal(r.dev, lg.players[r.pid].dev || "normal");
  }
  const ranks = rec.grades.map((g) => g.rank).sort((a, b) => a - b);
  assert.deepEqual(ranks, Array.from({ length: 32 }, (_, i) => i + 1), "32 clubs ranked 1-32");
  assert.equal(rec.grades.length, 32);
  const byRank = [...rec.grades].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) assert.ok(byRank[i - 1].rating >= byRank[i].rating, "ranked by the class rating");
  assert.equal(byRank[0].grade, "A");
  assert.ok(["C", "D"].includes(byRank.at(-1).grade));
  assert.equal(rec.grades[lg.userTid].picks.length, lg.draft.slots.filter((s) => s.owner === lg.userTid).length);

  // Archived with the draft-day truth: after the off-season he can develop, the recap still shows draft day.
  const truth = rec.rows.find((r) => r.owner === lg.userTid);
  L.completeDraft(lg);
  assert.ok(lg.draftHistory[0].picks.filter((s) => s.pid).every((s) => s.tv), "the archive keeps the draft-day truth");
  lg.players[truth.pid].pot = 99;
  lg.draft = null; // a later season: only the archive is left
  assert.deepEqual(recapYears(lg), [year]);
  const after = draftRecap(lg, year);
  assert.equal(after.rows.length, rec.rows.length);
  assert.equal(after.rows.find((r) => r.pid === truth.pid).pot, truth.pot);
  assert.equal(after.rows.find((r) => r.pid === truth.pid).verdict, truth.verdict);
});

test("steals and reaches against Central Scouting", () => {
  assert.deepEqual(pickValueTag(20, 8), { kind: "steal", d: 12 });
  assert.equal(pickValueTag(20, 17), null);
  assert.deepEqual(pickValueTag(30, 60), { kind: "reach", d: -30 });
  assert.equal(pickValueTag(30, 999), null);
  assert.equal(pickValueTag(5, null), null);
});
