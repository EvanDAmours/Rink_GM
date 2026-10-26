import test from "node:test";
import assert from "node:assert/strict";
import { createLeague } from "../src/engine/league.js";
import { exitAge, retiring, extMax, coachOffseason, extendCoach, coachRetirementNotice } from "../src/engine/coachContracts.js";

const fresh = () => createLeague({ userAbbr: "EDM", seed: 151 });
// One off-season tick (what careerReview does after the Cup), then the new season starts.
function offseason(lg) { lg.playoffs = { champion: 0 }; coachOffseason(lg); lg.year++; lg.playoffs = null; }

test("exit age is keyed on the name, 64-72, with real veterans set by hand", () => {
  assert.equal(exitAge({ name: "Some Coach" }), exitAge({ name: "Some Coach", id: "other" }));
  for (const n of ["A B", "Pat Roy", "Mikko Larsson", "Rob Wilson"]) { const x = exitAge({ name: n }); assert.ok(x >= 64 && x <= 72); }
  assert.equal(exitAge({ name: "Rick Bowness" }), 71);
});

test("a head coach retires exactly when his contract ends, announced once", () => {
  const lg = fresh();
  const t = lg.teams.find((x) => x.id !== lg.userTid);
  const c = t.coach;
  c.name = "Test Veteran"; c.age = exitAge(c) - 2; c.yrs = 3; delete c.announced; delete c.tickYear; c.real = false;
  assert.equal(retiring(lg, c), lg.year + 2);
  offseason(lg); // 2 years left, announced
  assert.equal(t.coach.name, "Test Veteran");
  const said = () => lg.news.filter((n) => /Test Veteran will retire/.test(n.text)).length;
  assert.equal(said(), 1);
  offseason(lg);
  assert.equal(t.coach.name, "Test Veteran");
  assert.equal(said(), 1);
  offseason(lg); // contract over at his exit age
  assert.notEqual(t.coach.name, "Test Veteran");
  assert.ok(lg.news.some((n) => /Test Veteran retires/.test(n.text)));
});

test("renewals and extensions stop short of the exit age; no mid-deal retirement", () => {
  const lg = fresh();
  const t = lg.teams[lg.userTid];
  const c = t.coach;
  c.name = "Young Coach"; c.age = 50; c.yrs = 1; delete c.announced; c.real = false;
  const x = exitAge(c);
  for (let i = 0; i < 30 && t.coach.name === "Young Coach"; i++) {
    assert.ok(t.coach.age + t.coach.yrs - 1 <= x, "never signed past his exit age");
    offseason(lg);
  }
  assert.notEqual(t.coach.name, "Young Coach");
  assert.ok(t.coach.interim, "your club gets an interim coach when yours retires");
  // extensions
  const lg2 = fresh();
  const c2 = lg2.teams[lg2.userTid].coach;
  c2.age = 55; c2.yrs = 2; c2.name = "Ext Coach"; c2.real = false;
  const max = extMax(lg2, c2);
  assert.equal(max, exitAge(c2) - 1 - 56);
  assert.ok(extendCoach(lg2, 99).ok);
  assert.equal(c2.age + c2.yrs - 1, exitAge(c2) - 1);
  assert.equal(extMax(lg2, c2), 0);
  assert.equal(extendCoach(lg2, 1).ok, false);
});

test("Home notice in his last two seasons, dismissible", () => {
  const lg = fresh();
  const c = lg.teams[lg.userTid].coach;
  c.name = "Old Coach"; c.real = false; c.age = exitAge(c) - 1; c.yrs = 2;
  assert.ok(coachRetirementNotice(lg));
  lg.hcNoteDismissed = coachRetirementNotice(lg).key;
  assert.equal(coachRetirementNotice(lg), null);
  c.age = exitAge(c) - 4; c.yrs = 5;
  lg.hcNoteDismissed = null;
  assert.equal(coachRetirementNotice(lg), null);
});
