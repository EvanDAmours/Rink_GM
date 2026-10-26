// r11: a scout works several regions (senior major 3, second major 2, each minor 1 = 7 of 9).
import test from "node:test";
import assert from "node:assert/strict";
import { createLeague, serializeLeague, deserializeLeague } from "../src/engine/league.js";
import { REGIONS, REGION_SLOTS, assignScout, scoutAssignments, regionCoverage, migrateScoutRegions, regionOf } from "../src/engine/regions.js";
import { classPool, surveyWeek, coverage, reportsPerWeek, csRank } from "../src/engine/scouting.js";

test("a new franchise covers 7 of the 9 regions: 3, 2, 1 and 1", () => {
  const l = createLeague({ userAbbr: "EDM", seed: 41 });
  const a = scoutAssignments(l);
  for (const [k, n] of Object.entries(REGION_SLOTS)) assert.equal(a[k].length, n, k);
  const c = regionCoverage(l);
  assert.equal(c.n, 7);
  assert.equal(c.of, Object.keys(REGIONS).length);
});

test("slot caps hold: a full scout's oldest region makes room; every scout keeps one", () => {
  const l = createLeague({ userAbbr: "EDM", seed: 42 });
  const t = l.teams[l.userTid];
  t.scoutRegions = { major: ["OHL", "WHL", "QMJHL"], major2: ["Sweden", "Liiga"], minor: ["USA"], minor2: ["Europe"] };
  let r = assignScout(l, "major", "Russia");
  assert.ok(r.ok);
  assert.deepEqual(t.scoutRegions.major, ["WHL", "QMJHL", "Russia"], "OHL made room");
  assert.equal(r.freed, "OHL");
  // Dropping: a region comes off, but never the last one.
  assert.ok(assignScout(l, "major2", "Liiga").ok);
  assert.deepEqual(t.scoutRegions.major2, ["Sweden"]);
  assert.equal(assignScout(l, "minor", "USA").ok, false);
  // A region another scout works moves; a minor scout left with nothing takes the freed region (a swap).
  r = assignScout(l, "minor2", "USA");
  assert.ok(r.ok);
  assert.deepEqual(t.scoutRegions.minor2, ["USA"]);
  assert.deepEqual(t.scoutRegions.minor, ["Europe"], "swapped");
  for (const [k, n] of Object.entries(REGION_SLOTS)) assert.ok(t.scoutRegions[k].length >= 1 && t.scoutRegions[k].length <= n);
  const all = Object.values(t.scoutRegions).flat();
  assert.equal(new Set(all).size, all.length, "no region held twice through moves");
});

test("coverage: every region a scout works gives a read there", () => {
  const l = createLeague({ userAbbr: "EDM", seed: 43 });
  const a = scoutAssignments(l);
  for (const p of classPool(l).slice(0, 80)) {
    const covered = Object.values(a).some((list) => list.includes(regionOf(p)));
    assert.equal(coverage(l, p).role !== "office", covered, p.name);
  }
});

test("a week of reports: same total per scout as before, shared across his regions", () => {
  const l = createLeague({ userAbbr: "EDM", seed: 44 });
  const t = l.teams[l.userTid];
  const s = t.scouts;
  const expected = Object.values(s).filter(Boolean).reduce((n, sc) => n + reportsPerWeek(sc.eval) + (sc.trait === "workhorse" ? 1 : 0), 0);
  const { filed } = surveyWeek(l, 1);
  assert.ok(filed <= expected && filed >= expected - 2, `${filed} of ${expected}`);
  const regs = new Set(Object.values(t.scoutRegions).flat());
  assert.ok(classPool(l).filter((p) => p.scout?.lvl > 0).every((p) => regs.has(regionOf(p))));
});

test("old one-region saves keep their regions and fill the new slots once, first-rounders first", () => {
  const l = createLeague({ userAbbr: "EDM", seed: 45 });
  const t = l.teams[l.userTid];
  t.scoutRegions = { major: "OHL", major2: "Sweden", minor: "WHL", minor2: "USA" };
  delete t.scoutRegionsV;
  const pool = classPool(l);
  assert.ok(migrateScoutRegions(l, pool));
  assert.equal(t.scoutRegions.major[0], "OHL");
  assert.equal(t.scoutRegions.major2[0], "Sweden");
  assert.deepEqual(t.scoutRegions.minor, ["WHL"]);
  assert.deepEqual(t.scoutRegions.minor2, ["USA"]);
  assert.equal(t.scoutRegions.major.length, 3);
  assert.equal(t.scoutRegions.major2.length, 2);
  assert.equal(regionCoverage(l).n, 7);
  // The first filled slot is the uncovered region with the most first-rounders.
  const r1 = (k) => pool.filter((p) => regionOf(p) === k && csRank(p) <= 32).length;
  const open = Object.keys(REGIONS).filter((k) => !["OHL", "Sweden", "WHL", "USA"].includes(k));
  assert.equal(r1(t.scoutRegions.major[1]), Math.max(...open.map(r1)));
  // Gated: a second pass changes nothing.
  const snap = JSON.stringify(t.scoutRegions);
  assert.equal(migrateScoutRegions(l, pool), false);
  assert.equal(JSON.stringify(t.scoutRegions), snap);
  // And it survives a save round-trip.
  const back = deserializeLeague(serializeLeague(l));
  assert.deepEqual(back.teams[back.userTid].scoutRegions, t.scoutRegions);
});

test("an old save loads through the migration with the new slots filled", () => {
  const l = createLeague({ userAbbr: "EDM", seed: 46 });
  const t = l.teams[l.userTid];
  t.scoutRegions = { major: "QMJHL", major2: "Liiga", minor: "NCAA", minor2: "Russia" };
  delete t.scoutRegionsV;
  const back = deserializeLeague(serializeLeague(l));
  const a = back.teams[back.userTid].scoutRegions;
  assert.equal(a.major[0], "QMJHL");
  assert.equal(a.major.length, 3);
  assert.equal(a.major2.length, 2);
  assert.equal(regionCoverage(back).n, 7);
});
