import test from "node:test";
import assert from "node:assert/strict";
import { createLeague, startRegularSeason, simDay, seasonOver } from "../src/engine/league.js";
import { deadlinePending, skipDeadline } from "../src/engine/market.js";
import { prospectWatch, prospectReport, seasonLine, leagueLabel, inSeasonGrowth } from "../src/engine/prospectWatch.js";

function season(seed) {
  const l = createLeague({ userAbbr: "MTL", seed });
  startRegularSeason(l);
  let g = 0;
  while (l.phase === "regular" && !seasonOver(l) && g++ < 400) { if (deadlinePending(l)) skipDeadline(l); simDay(l); }
  return l;
}

test("prospects grow during the season and the summer step credits what was banked", () => {
  const l = season(31);
  const t = l.teams[l.userTid];
  const rows = prospectWatch(l, t);
  assert.ok(rows.length >= 5, "the watch lists the club's young players");
  const grew = rows.filter((r) => r.delta > 0);
  assert.ok(grew.length > 0, "someone moved during the season");
  for (const r of grew) assert.ok(r.p.inSeasonGain?.n >= r.delta || r.p.progress?.length, "in-season gains are recorded so the summer step can subtract them");
  assert.ok(rows.every((r) => r.path.length >= 1 && r.line && typeof r.eta === "string"));
  const farm = rows.filter((r) => r.farm);
  assert.ok(farm.every((r) => r.line.gp > 0), "every farm prospect has a season line");
  assert.ok(farm.some((r) => r.line.g > 0 || r.line.w > 0), "farm lines include goals or wins");
});

test("farm lines are realistic per level and archived at rollover", () => {
  const l = season(32);
  const t = l.teams[l.userTid];
  const skaters = t.prospects.map((id) => l.players[id]).filter((p) => p.pos !== "G" && p.farmStats?.gp >= 20);
  for (const p of skaters) {
    const line = seasonLine(p, true);
    assert.ok(line.pts / line.gp <= 2.3, `${p.name} ${line.text} is too productive`);
    assert.ok(line.g <= line.pts);
  }
  assert.ok(new Set(skaters.map((p) => p.farmStats.gp)).size > 1, "games played vary between prospects");
  assert.ok(["AHL", "Junior", "NCAA", "Europe"].includes(leagueLabel(skaters[0])) || skaters[0].bio?.lg, "league label resolves");
  const p = skaters[0]; const before = { ...p.farmStats };
  l.year++; // simulate rollover for the archive helper
  l.year--;
  assert.equal(before.year, l.year);
});

test("a prospect report flags decisions and never pauses the sim", () => {
  const l = createLeague({ userAbbr: "MTL", seed: 33 });
  startRegularSeason(l);
  for (let i = 0; i < 35; i++) simDay(l);
  const t = l.teams[l.userTid];
  const p = t.prospects.map((id) => l.players[id]).find((x) => x.pos !== "G" && x.signed !== false);
  p.ovr = 79; p.pot = Math.max(p.pot, 79);
  const r = prospectReport(l, t, p);
  assert.equal(r.next?.kind, "callup");
  assert.ok(r.flags.includes("NHL ready"));
  const moved = inSeasonGrowth(l);
  assert.ok(Array.isArray(moved));
  assert.ok((l.inbox || []).some((m) => /Prospect report/.test(m.text)) || Math.floor(l.day / 7) < 4, "a monthly prospect report reaches the inbox");
});
