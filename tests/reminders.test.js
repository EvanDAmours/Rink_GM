// The Home reminder board (r12): blockers first, then a few calm reminders that disappear once done:
// the focus player, open scout jobs and regions, and one grouped line for the key contracts.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../src/engine/league.js";
import { needsAttention, runFix, reminders, keyContracts, contractReminder, scoutsWithoutRegions, CONTRACT_SNOOZE_DAYS } from "../src/engine/home.js";
import { setFocus, lockPlan, ensureDevPlan } from "../src/engine/developmentPlan.js";
import { capSpace } from "../src/engine/roster.js";

const league = (seed = 4242) => L.createLeague({ userAbbr: "EDM", seed });
const keys = (lg) => needsAttention(lg).map((x) => x.key);
const user = (lg) => lg.teams[lg.userTid];

test("focus player: reminded in the preseason until you pick one or lock the plan", () => {
  const lg = league();
  assert.equal(lg.phase, "preseason");
  const it = needsAttention(lg).find((x) => x.key === "rmFocus");
  assert.ok(it, "reminder shows");
  assert.equal(it.title, "Pick your focus player");
  assert.deepEqual(it.to, ["development", "plan"]);
  const plan = ensureDevPlan(lg);
  assert.ok(setFocus(lg, plan.focus).ok);
  assert.ok(!keys(lg).includes("rmFocus"), "gone once picked");
  const lg2 = league();
  lockPlan(lg2);
  assert.ok(!keys(lg2).includes("rmFocus"), "gone once the plan is locked");
  const lg3 = league();
  lg3.phase = "regular";
  assert.ok(!keys(lg3).includes("rmFocus"), "nothing to remind once the season runs");
});

test("scouts: an open seat asks for a hire; a scout without a region asks for assignments", () => {
  const lg = league();
  const t = user(lg);
  assert.ok(!keys(lg).some((k) => /^rmScout/.test(k)), "full staff, every scout placed");
  const gone = t.scouts.minor2;
  t.scouts.minor2 = null;
  const hire = needsAttention(lg).find((x) => x.key === "rmScoutHire");
  assert.equal(hire?.title, "Hire a scout");
  t.scouts.minor2 = gone;
  // unset in every shape: missing, empty string, empty list
  delete t.scoutRegions.major; t.scoutRegions.minor = ""; t.scoutRegions.major2 = [];
  assert.equal(scoutsWithoutRegions(lg), 3);
  const reg = needsAttention(lg).find((x) => x.key === "rmScoutRegions");
  assert.equal(reg?.title, "Set your scouts' regions");
  assert.deepEqual(reg.to, ["draft", "regions"]);
  // Every slot filled (major 3, second major 2, minors 1 each, per the region slots).
  t.scoutRegions.major = ["OHL", "WHL", "QMJHL"]; t.scoutRegions.minor = ["USA"]; t.scoutRegions.major2 = ["NCAA", "Sweden"];
  assert.ok(!keys(lg).includes("rmScoutRegions"), "gone once assigned");
  // an unhired seat isn't a missing region
  t.scoutRegions.minor2 = []; t.scouts.minor2 = null;
  assert.equal(scoutsWithoutRegions(lg), 0);
  // locked while the scouts are on the road
  t.scouts.minor2 = gone; lg.phase = "regular";
  assert.equal(scoutsWithoutRegions(lg), 1);
  assert.ok(!keys(lg).some((k) => /^rmScout/.test(k)), "no reminders once the window closes");
});

test("contracts: one grouped row with names, from the second half on, never early", () => {
  const lg = league();
  const t = user(lg);
  lg.phase = "regular";
  t.rec.gp = 10; lg.day = 20;
  assert.equal(contractReminder(lg), null, "too early in the season");
  t.rec.gp = 41;
  const it = needsAttention(lg).find((x) => x.key === "rmContracts");
  assert.ok(it, "shows from mid-season");
  const ps = keyContracts(lg);
  assert.ok(ps.length >= 2);
  assert.equal(needsAttention(lg).filter((x) => x.key === "rmContracts").length, 1, "one row, not one per player");
  assert.match(it.title, new RegExp(`^${ps.length} key players need new deals$`));
  assert.ok(it.sub.split(", ").length <= 3, "a short subline: three names at most");
  assert.ok(it.sub.includes(ps[0].name.split(" ").slice(1).join(" ")));
  assert.deepEqual(it.to, ["frontoffice", "contracts"]);
  // every name is ending and key: 85+, a top-6 F / top-4 D / starting G, or off an entry-level deal
  for (const p of ps) assert.equal(p.yrs, 1);
  // a depth player in his last year is not a key player
  const depth = t.roster.map((id) => lg.players[id]).filter((p) => p.yrs === 1 && p.ovr < 76 && !ps.includes(p));
  for (const p of depth) assert.ok(!ps.includes(p));
  // extending a player takes him off the list
  ps[0].extension = { aav: 5, yrs: 3 };
  assert.ok(!keyContracts(lg).includes(ps[0]));
  // the trade deadline also opens it
  t.rec.gp = 30; lg.day = lg.deadlineDay;
  assert.ok(contractReminder(lg));
});

test("contracts: a star in his last year counts; so does a kid coming off his entry-level deal", () => {
  const lg = league();
  const t = user(lg);
  lg.phase = "regular"; t.rec.gp = 50;
  for (const id of t.roster) { const p = lg.players[id]; if (p.yrs === 1) p.yrs = 3; }
  assert.equal(contractReminder(lg), null, "nobody ending, nothing shown");
  const kid = t.roster.map((id) => lg.players[id]).filter((p) => p.ovr < 80 && p.pos !== "G").sort((a, b) => a.ovr - b.ovr)[0];
  kid.yrs = 1; kid.elc = { signedAge: 19, year: 2024 }; kid.pot = 88; kid.age = 21;
  assert.deepEqual(keyContracts(lg).map((p) => p.id), [kid.id]);
  assert.match(contractReminder(lg).title, /needs a new deal$/);
});

test("contracts: Not now hides it for 30 days or until the next phase; re-sign week always shows it", () => {
  const lg = league();
  const t = user(lg);
  lg.phase = "regular"; t.rec.gp = 45; lg.day = 120;
  const it = needsAttention(lg).find((x) => x.key === "rmContracts");
  assert.equal(it.dismiss, "contractsLater");
  assert.equal(it.dismissLabel, "Not now");
  runFix(lg, it.dismiss);
  assert.ok(!keys(lg).includes("rmContracts"), "hidden");
  lg.day = 120 + CONTRACT_SNOOZE_DAYS - 1;
  assert.ok(!keys(lg).includes("rmContracts"), "still hidden inside the month");
  lg.day = 120 + CONTRACT_SNOOZE_DAYS;
  assert.ok(keys(lg).includes("rmContracts"), "back after a month");
  runFix(lg, "contractsLater");
  lg.phase = "playoffs";
  assert.ok(keys(lg).includes("rmContracts"), "back in the next phase");
  // re-sign week: the deals have run out; the row points at the re-sign screen and replaces the generic one
  lg.phase = "resign";
  for (const id of t.roster) { const p = lg.players[id]; if (p.yrs === 1) p.yrs = 0; else if (p.yrs > 1) p.yrs -= 1; }
  const rs = needsAttention(lg).find((x) => x.key === "rmContracts");
  assert.ok(rs, "always in re-sign week");
  assert.deepEqual(rs.to, ["freeagency"]);
  assert.ok(!keys(lg).includes("resign"), "no duplicate re-sign row");
});

test("reminder board: blockers stay on top, reminders after them", () => {
  const lg = league();
  const t = user(lg);
  const star = t.roster.map((id) => lg.players[id]).sort((a, b) => b.cap - a.cap)[0];
  delete star.salarySchedule;
  for (let i = 0; i < 5 && capSpace(lg, t) >= 0; i++) star.cap += 15;
  const ks = keys(lg);
  assert.equal(ks[0], "cap");
  assert.ok(ks.indexOf("rmFocus") > 0);
  assert.ok(reminders(lg).every((r) => /^rm/.test(r.key)));
});
