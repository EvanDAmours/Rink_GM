import test from "node:test";
import assert from "node:assert/strict";
import { compareTeams, projectedFirstRound, conferenceSeeds } from "../src/engine/standings.js";
import { DIVISIONS } from "../src/engine/teams.js";

const rec = (pts, gp, rw, row, w) => ({ pts, gp, rw, row, w, l: 0, otl: 0, gf: 0, ga: 0 });
function fakeLeague() {
  const teams = [];
  let id = 0;
  for (const [conf, divs] of Object.entries(DIVISIONS)) for (const div of divs) for (let i = 0; i < 8; i++) teams.push({ id: id++, conf, div, rec: rec(100 - i * 4 - (div === divs[1] ? 1 : 0), 82, 30, 35, 45) });
  return { teams };
}

test("tiebreakers: points, then points %, then RW, ROW, wins", () => {
  const a = { id: 1, rec: rec(90, 80, 30, 35, 40) }, b = { id: 2, rec: rec(90, 82, 40, 40, 44) };
  assert.ok(compareTeams(a, b) < 0, "fewer games played wins on points %");
  const c = { id: 3, rec: rec(90, 82, 31, 33, 40) }, d = { id: 4, rec: rec(90, 82, 30, 40, 44) };
  assert.ok(compareTeams(c, d) < 0, "regulation wins before ROW");
  const e = { id: 5, rec: rec(90, 82, 30, 36, 40) };
  assert.ok(compareTeams(e, d) > 0 && compareTeams({ id: 6, rec: rec(90, 82, 30, 41, 40) }, d) < 0, "ROW next");
});

test("projected first round: div winner v wild card, 2 v 3, eight series", () => {
  const lg = fakeLeague();
  const r1 = projectedFirstRound(lg);
  assert.equal(r1.length, 8);
  const { seeds, hunt } = conferenceSeeds(lg, "East");
  assert.deepEqual(seeds.map((s) => s.tag), ["A1", "A2", "A3", "M1", "M2", "M3", "WC1", "WC2"]);
  const id = (tag) => seeds.find((s) => s.tag === tag).t.id;
  const east = r1.filter((s) => s.conf === "East").map((s) => [s.top, s.bot]);
  // Atlantic winner is the better winner (one point up), so it draws WC2.
  assert.deepEqual(east, [[id("A1"), id("WC2")], [id("A2"), id("A3")], [id("M1"), id("WC1")], [id("M2"), id("M3")]]);
  assert.equal(hunt[0].back, seeds[7].t.rec.pts - hunt[0].t.rec.pts);
});
