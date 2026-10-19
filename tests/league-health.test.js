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

test('retirements are announced when re-sign week opens, not on the first day of the new league year', async () => {
  const { announceRetirements } = await import('../src/engine/offseason.js');
  const lg = createLeague({ userAbbr: 'TOR', seed: 21 });
  const before = Object.values(lg.players).filter((p) => p.tid >= 0 && !lg.teams[p.tid].prospects.includes(p.id));
  for (const p of before) { p.age = 50; p.stats.gp = 40; p.stats.g = 5; }
  announceRetirements(lg);
  const left = before.filter((p) => lg.players[p.id]);
  assert.ok(left.length < before.length * 0.2, `most 50-year-olds retire (${left.length} of ${before.length} stayed)`);
  assert.ok(lg.retirementArchive.some((r) => r.player?.career?.at(-1)?.y === lg.year && r.player.career.at(-1).s.gp === 40), 'the final season is archived to the card');
  const count = Object.keys(lg.players).length;
  announceRetirements(lg);
  assert.equal(Object.keys(lg.players).length, count, 'a second call in the same year is a no-op');
  for (const t of lg.teams) for (const id of [...t.roster, ...t.prospects]) assert.ok(lg.players[id], 'rosters hold no retired ids');
});

test('the owner review after the Final queues a card for the user with patience before and after', () => {
  const lg = createLeague({ userAbbr: 'TOR', seed: 9 });
  startRegularSeason(lg);
  let d = 0; while (lg.phase === 'regular' && !seasonOver(lg) && d++ < 400) { if (deadlinePending(lg)) skipDeadline(lg); simDay(lg); }
  endRegularSeason(lg); let g = 0; while (lg.playoffs.champion == null && g++ < 400) simPlayoffDay(lg); finishPlayoffs(lg);
  assert.equal(lg.ownerReviewPending, lg.year);
  const r = lg.teams[lg.userTid].owner.reviews.find((x) => x.year === lg.year);
  assert.ok(r && Number.isFinite(r.before) && Number.isFinite(r.trust) && typeof r.met === 'boolean');
  assert.ok((lg.papers || []).filter((p) => p.kind === 'scouting').length >= 2, 'two scouting checkpoints in a season');
});
