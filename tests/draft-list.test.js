// r16 Draft Day ("Your list is the draft"): the list seeded by your scouts, the one rule for picks
// made for you, the scouts' three options, availability odds, one class grade, the believed (not
// true) ceiling on the pick card, and the one-time migration for saves already at the draft.
import test from "node:test";
import assert from "node:assert/strict";
import * as L from "../src/engine/league.js";
import { startDraft, currentSlot, simDraftToUser, makePick } from "../src/engine/draft.js";
import { runCombine, myList, myListIds, moveOnMyListTo, resetMyList, toggleMyList, scoutsPick, classPool, prospectRead, myBoard, myScore, csScore, UNSEEN_PENALTY, visitPlan, openDraftFloor, migrateScouting, teamDraftGrade } from "../src/engine/scouting.js";
import { autoPickId, simToMyPick, draftPlayer, tickDraftClock, scoutsPickRest, DRAFT_CLOCK } from "../src/engine/draftClock.js";
import { availabilityOdds, scoutOptions, nextPick, myClassRows, analystsGrade } from "../src/engine/draftDay.js";
import { stageMoment } from "../src/engine/momentsDraft.js";

// A league at the Combine (the draft order set, final rankings out, Your list filled in).
const combineLeague = (seed = 31) => {
  const lg = L.createLeague({ userAbbr: "EDM", seed });
  startDraft(lg);
  lg.phase = "draft";
  runCombine(lg);
  return lg;
};

test("at the Combine your scouts fill in Your list from their board; unseen players stay off it", () => {
  const lg = combineLeague();
  const l = myList(lg);
  assert.equal(l.seeded, true);
  assert.ok(l.ids.length > 20, `list has ${l.ids.length}`);
  const pool = classPool(lg);
  const seen = pool.filter((p) => prospectRead(lg, p).potV != null);
  assert.equal(l.ids.length, seen.length, "every prospect your scouts have seen, and only them");
  assert.ok(l.ids.every((id) => prospectRead(lg, lg.players[id]).potV != null));
  const ranks = myBoard(lg, pool);
  for (let i = 1; i < l.ids.length; i++) assert.ok(ranks.get(l.ids[i - 1]) < ranks.get(l.ids[i]), "in the scouts' board order");
  // E9: an unseen prospect carries a confidence penalty on the scouts' board.
  const unseen = pool.find((p) => prospectRead(lg, p).potV == null);
  if (unseen) assert.equal(myScore(lg, unseen), csScore(unseen) - UNSEEN_PENALTY);
});

test("drag puts a name where you drop him, edits survive a re-seed, Reset goes back to the scouts' order", () => {
  const lg = combineLeague();
  const ids0 = [...myListIds(lg)];
  const pid = ids0[9];
  assert.equal(moveOnMyListTo(lg, pid, 0), 0);
  assert.equal(myListIds(lg)[0], pid);
  assert.deepEqual(myListIds(lg).slice(1, 10), ids0.slice(0, 9));
  assert.equal(moveOnMyListTo(lg, pid, 999), ids0.length - 1, "clamped to the end");
  moveOnMyListTo(lg, pid, 3);
  assert.equal(myList(lg).edited, true);
  // A re-seed (after the Combine visits) keeps your order.
  openDraftFloor(lg);
  assert.equal(myListIds(lg)[3], pid);
  resetMyList(lg);
  assert.equal(myList(lg).edited, false);
  assert.notEqual(myListIds(lg)[3], pid);
});

test("one rule for picks made for you: Your list first, then your scouts' board (clock expiry, sims, Scouts pick the rest)", () => {
  const lg = combineLeague();
  openDraftFloor(lg);
  simToMyPick(lg);
  assert.equal(currentSlot(lg).owner, lg.userTid);
  // Put the lowest-ranked name on the list at the top: the clock running out takes him.
  const ids = myListIds(lg).filter((id) => lg.players[id].tid === -2);
  const last = ids.at(-1);
  moveOnMyListTo(lg, last, 0);
  assert.equal(autoPickId(lg), last);
  let r = null;
  for (let i = 0; i <= DRAFT_CLOCK && !r; i++) r = tickDraftClock(lg);
  assert.equal(r.how, "auto");
  assert.equal(r.pid, last);
  assert.equal(r.slot.how, "list");
  // With the list empty, the scouts' board (not Central Scouting) decides.
  lg.myList.ids = [];
  const board = myBoard(lg);
  const pick = scoutsPick(lg);
  const top = [...board.entries()].sort((a, b) => a[1] - b[1]).slice(0, 6).map(([id]) => id);
  assert.ok(top.includes(pick), "the scouts' top names (needs only break near ties)");
  // Scouts pick the rest: every pick made, yours by the same rule, each marked how it was made.
  const n = scoutsPickRest(lg);
  assert.ok(n > 0);
  assert.ok(lg.draft.slots.filter((s) => s.owner === lg.userTid).every((s) => s.pid && ["list", "scouts", "user"].includes(s.how)));
});

test("your scouts' options: three different players still on the board, each with a reason; odds for a pick to come", () => {
  const lg = combineLeague();
  const np = nextPick(lg);
  const pre = scoutOptions(lg, np.overall);
  assert.equal(pre.length, 3);
  assert.equal(new Set(pre.map((o) => o.pid)).size, 3, "three distinct players");
  for (const o of pre) {
    assert.equal(lg.players[o.pid].tid, -2);
    assert.ok(o.why.length > 20 && /\.$/.test(o.why), o.why);
    assert.ok(o.odds >= 0 && o.odds <= 1);
    assert.ok(o.label);
  }
  openDraftFloor(lg);
  simToMyPick(lg);
  const now = scoutOptions(lg);
  assert.equal(now.length, 3);
  assert.equal(new Set(now.map((o) => o.pid)).size, 3);
  assert.ok(now.every((o) => o.odds == null && lg.players[o.pid].tid === -2), "on the clock: no odds, all available");
  assert.ok(draftPlayer(lg, now[0].pid));
  // A later pick (e.g. round 2): options with the chance each is still there.
  const later = scoutOptions(lg, nextPick(lg).overall);
  assert.equal(new Set(later.map((o) => o.pid)).size, 3);
  assert.ok(later.every((o) => o.odds > 0));
});

test("availability odds: between 0 and 1, never rising with distance, fixed between calls, the league untouched", () => {
  const lg = combineLeague();
  openDraftFloor(lg);
  const before = JSON.stringify(lg.draft) + lg.draftClass.map((id) => lg.players[id].tid).join();
  const ids = classPool(lg).sort((a, b) => (a.cs.final ?? 999) - (b.cs.final ?? 999)).slice(0, 25).map((p) => p.id);
  const at = (o) => availabilityOdds(lg, ids, o);
  const a = at(5), b = at(20), c = at(45);
  for (const id of ids) {
    for (const v of [a[id], b[id], c[id]]) assert.ok(v >= 0 && v <= 1);
    assert.ok(a[id] + 0.08 >= b[id] && b[id] + 0.08 >= c[id], `odds fall with distance (${a[id]}, ${b[id]}, ${c[id]})`);
  }
  const sum5 = ids.reduce((s, id) => s + a[id], 0), sum45 = ids.reduce((s, id) => s + c[id], 0);
  assert.ok(sum5 > sum45 + 5, "far fewer of the top names last to #45");
  assert.ok(ids.slice(0, 3).every((id) => c[id] < 0.05), "the top of the board is gone by #45");
  assert.deepEqual(at(20), b, "the same numbers every time (fixed seed, cached)");
  assert.deepEqual(availabilityOdds(lg, ids, 1), Object.fromEntries(ids.map((id) => [id, 1])), "everyone is there for the first pick");
  assert.equal(JSON.stringify(lg.draft) + lg.draftClass.map((id) => lg.players[id].tid).join(), before, "read-only");
});

test("the pick card and Your class show what your scouts believed, not the hidden truth", () => {
  const lg = combineLeague();
  openDraftFloor(lg);
  simToMyPick(lg);
  // A prospect your scouts read wrong (a rough read, not exact).
  const p = classPool(lg).map((x) => [x, prospectRead(lg, x)]).find(([x, r]) => r.potV != null && !r.exact && Math.round(r.potV) !== x.pot)?.[0];
  assert.ok(p, "someone your scouts misread");
  const read = prospectRead(lg, p);
  assert.ok(draftPlayer(lg, p.id));
  const m = lg.moments.find((x) => x.kind === "draft-stage" && x.pid === p.id);
  assert.ok(m);
  assert.equal(m.p.pot, Math.round(read.potV), "the card's ceiling is the scouts' read");
  assert.notEqual(m.p.pot, p.pot, "not the truth");
  assert.equal(m.p.potEst, true);
  assert.equal(m.p.dev, read.dev || null, "only the trait the scouts saw");
  const s = lg.draft.slots.find((x) => x.pid === p.id);
  assert.equal(stageMoment(lg, s).p.pot, m.p.pot);
  const row = myClassRows(lg, lg.draft.year).find((x) => x.pid === p.id);
  assert.equal(row.ceiling, m.p.pot);
  assert.equal(row.est, true);
  assert.equal(row.how, "user");
});

test("one class grade: the analysts' instant grade, the same on the Draft screen and in Your class", () => {
  const lg = combineLeague();
  openDraftFloor(lg);
  simDraftToUser(lg, { all: true });
  const g = analystsGrade(lg);
  assert.ok(g);
  assert.equal(g, teamDraftGrade(lg, lg.userTid));
  const year = lg.draft.year;
  L.completeDraft(lg);
  assert.equal(analystsGrade(lg, lg.userTid, year), g, "the archived class keeps the same grade");
  assert.equal(myClassRows(lg, year).length, 7);
});

test("migration: a save already at the Combine gets its list filled in once (names you starred stay on top)", () => {
  const lg = combineLeague();
  const starred = classPool(lg).at(-1).id; // the bottom of the class, so it can't be a coincidence
  lg.myList = { year: lg.draftClassYear, ids: [starred] }; // an old save: a hand-built list, no flag
  migrateScouting(lg);
  assert.equal(lg.myList.seeded, true);
  assert.equal(myListIds(lg)[0], starred);
  assert.ok(myListIds(lg).length > 20);
  const n = myListIds(lg).length;
  migrateScouting(lg);
  assert.equal(myListIds(lg).length, n, "only once");
  // Loads through serialize/deserialize too.
  const back = L.deserializeLeague(L.serializeLeague(lg));
  assert.deepEqual(myListIds(back), myListIds(lg));
  // Before the Combine nothing is stored: the list follows the scouts' board as it stands.
  const fresh = L.createLeague({ userAbbr: "EDM", seed: 32 });
  assert.ok(!fresh.myList?.seeded);
  toggleMyList(fresh, classPool(fresh)[0].id);
  assert.equal(fresh.myList.seeded, true, "an edit stores the list");
});

test("the Combine visits are planned from the visit list and spent when the draft starts", () => {
  const lg = combineLeague();
  const plan = visitPlan(lg);
  assert.ok(plan.interview.length + plan.workout.length > 0);
  assert.ok(plan.interview.length <= lg.draft.interviewsLeft && plan.workout.length <= lg.draft.workoutsLeft);
  const iv = plan.interview[0];
  openDraftFloor(lg);
  assert.equal(lg.draft.stage, "live");
  if (iv) assert.ok(lg.players[iv].scout.intv, "interviewed");
  assert.ok(plan.workout.every((id) => lg.players[id].scout.lvl >= 2), "worked out");
  // The AI's picks never see your visits.
  assert.ok(makePick(lg, currentSlot(lg).owner === lg.userTid ? scoutsPick(lg) : classPool(lg)[0].id));
});
