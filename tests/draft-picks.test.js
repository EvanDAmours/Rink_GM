import test from "node:test";
import assert from "node:assert/strict";
import { createLeague, startRegularSeason, simDay } from "../src/engine/league.js";
import { pickLabel, pickSlot, projectedDraftOrder, startDraft, makePick, aiChoose, currentSlot } from "../src/engine/draft.js";
import { deadlinePending, skipDeadline } from "../src/engine/market.js";

const pickOf = (l, year, round, orig) => l.draftPicks.find((p) => p.year === year && p.round === round && p.orig === orig);

test("pick labels add the projected slot once games are played, and only for the coming draft", () => {
  const l = createLeague({ userAbbr: "EDM", seed: 515 });
  const me = l.userTid, next = l.year + 1;
  const own = pickOf(l, next, 2, me);
  // Before a game is played there is no order to project from.
  assert.equal(projectedDraftOrder(l), null);
  assert.equal(pickLabel(l, own), `${next} R2`);
  assert.equal(pickSlot(l, own), null);

  startRegularSeason(l);
  for (let i = 0; i < 20; i++) { if (deadlinePending(l)) skipDeadline(l); simDay(l); }
  const order = projectedDraftOrder(l);
  assert.equal(order.length, l.teams.length);
  assert.equal(new Set(order).size, l.teams.length);
  // Lowest points percentage first, highest last.
  const pct = (id) => l.teams[id].rec.pts / Math.max(1, l.teams[id].rec.gp);
  for (let i = 1; i < order.length; i++) assert.ok(pct(order[i - 1]) <= pct(order[i]), "worst first");

  const slot = pickSlot(l, own);
  assert.equal(slot.projected, true);
  assert.equal(slot.overall, 32 + order.indexOf(me) + 1);
  assert.equal(pickLabel(l, own), `${next} R2 (#${slot.overall})`);

  // A pick from another club names the club and its slot.
  const other = l.teams.find((t) => t.id !== me);
  const theirs = pickOf(l, next, 1, other.id);
  theirs.owner = me;
  assert.equal(pickLabel(l, theirs), `${next} R1 (${other.abbr} #${order.indexOf(other.id) + 1})`);
  // Later drafts have no slot yet.
  const later = pickOf(l, next + 1, 3, me);
  later.owner = other.id;
  assert.equal(pickLabel(l, later), `${next + 1} R3 (${l.teams[me].abbr})`);
  assert.equal(pickLabel(l, null), "");
});

test("during the draft a pick's label uses its real slot", () => {
  const l = createLeague({ userAbbr: "TOR", seed: 516 });
  startRegularSeason(l);
  for (let i = 0; i < 10; i++) { if (deadlinePending(l)) skipDeadline(l); simDay(l); }
  startDraft(l);
  const year = l.draft.year;
  const s = l.draft.slots.find((x) => x.round === 3 && x.orig === l.userTid);
  const pk = pickOf(l, year, 3, l.userTid);
  assert.deepEqual(pickSlot(l, pk), { overall: s.overall, projected: false });
  assert.equal(pickLabel(l, pk), `${year} R3 (#${s.overall})`);
  // The projected order is the draft's first round once it is set.
  assert.deepEqual(projectedDraftOrder(l), l.draft.slots.filter((x) => x.round === 1).map((x) => x.orig));
  // Making picks doesn't disturb the labels of later picks.
  for (let i = 0; i < 5; i++) makePick(l, aiChoose(l, currentSlot(l).owner));
  assert.equal(pickLabel(l, pk), `${year} R3 (#${s.overall})`);
});
