import test from "node:test";
import assert from "node:assert/strict";
import { createLeague, startRegularSeason, simDay, seasonOver, endRegularSeason, finishPlayoffs, completeDraft, goToFreeAgency, beginNextSeason } from "../src/engine/league.js";
import { deadlinePending, skipDeadline } from "../src/engine/market.js";
import { simPlayoffDay } from "../src/engine/playoffs.js";
import { simDraftToUser } from "../src/engine/draft.js";
import { simFADay } from "../src/engine/offseason.js";
import { FA_DAYS } from "../src/engine/constants.js";

function runYear(l) {
  startRegularSeason(l);
  let g = 0; while (l.phase === "regular" && !seasonOver(l) && g++ < 400) { if (deadlinePending(l)) skipDeadline(l); simDay(l); }
  endRegularSeason(l); g = 0; while (l.playoffs.champion == null && g++ < 400) simPlayoffDay(l); finishPlayoffs(l);
  simDraftToUser(l, { all: true }); completeDraft(l); goToFreeAgency(l); while (l.fa && l.fa.day < FA_DAYS) simFADay(l);
  beginNextSeason(l);
}

test("the league does not bloat: unsigned leftovers leave, stars stay near the opening count, every decision has a goalie", () => {
  const l = createLeague({ userAbbr: "TOR", seed: 41 });
  const elite0 = Object.values(l.players).filter((p) => p.tid >= 0 && p.ovr >= 90).length;
  runYear(l);
  const pool = l.freeAgents.map((id) => l.players[id]).filter(Boolean);
  assert.ok(pool.every((p) => p.tid === -1), "the free-agent pool only lists free agents");
  assert.ok(pool.filter((p) => p.signed === false && p.age >= 22).length === 0, "unsigned draft rights past 22 are gone");
  assert.ok(pool.length < 340, `free-agent pool is ${pool.length}`);
  assert.ok(Object.values(l.players).filter((p) => p.tid >= -1).length < 1350, "player count stays bounded after one summer");
  const elite1 = Object.values(l.players).filter((p) => p.tid >= 0 && p.ovr >= 90).length;
  assert.ok(Math.abs(elite1 - elite0) <= 12, `90+ players went ${elite0} → ${elite1}`);
  assert.ok((l.transactions || []).some((t) => /leave the league/.test(t.text)), "the pruning is logged");
  // Goalie decisions reconcile with team records over a season.
  startRegularSeason(l); let g = 0; while (l.phase === "regular" && !seasonOver(l) && g++ < 400) { if (deadlinePending(l)) skipDeadline(l); simDay(l); }
  const goalies = Object.values(l.players).filter((p) => p.pos === "G");
  assert.equal(goalies.reduce((s, p) => s + (p.stats.w || 0), 0), l.teams.reduce((s, t) => s + t.rec.w, 0));
});
