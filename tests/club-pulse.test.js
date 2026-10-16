import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../src/engine/league.js";
import { simPlayoffDay } from "../src/engine/playoffs.js";
import { ensurePulse, runAction, answerPresser, giveSpeech, powerRankings, playoffOdds, rosterGrades, repTier, ACHIEVEMENTS, MORALE_NEUTRAL, CHEM_NEUTRAL } from "../src/engine/clubPulse.js";

test("club pulse: Season Points, morale, chemistry, rankings and prompts follow a season", () => {
  const lg = L.createLeague({ userAbbr: "EDM", seed: 12 });
  const u = lg.teams[lg.userTid];
  const gm = ensurePulse(lg);
  assert.equal(gm.sp, 10);
  assert.ok(lg.teams.every((t) => t.morale === MORALE_NEUTRAL && t.chemistry === CHEM_NEUTRAL));
  L.startRegularSeason(lg);
  for (let i = 0; i < 70; i++) L.simDay(lg);
  // Weekly income, and every club's mood moved with its results (bounded, never pinned).
  assert.ok(gm.sp >= 10 + 2 * 8, `SP ${gm.sp}`);
  const ms = lg.teams.map((t) => t.morale);
  assert.ok(Math.max(...ms) < 100 && Math.min(...ms) > 0 && new Set(ms).size > 10);
  const ranks = powerRankings(lg).map((r) => r.rank);
  assert.deepEqual([...ranks].sort((a, b) => a - b), Array.from({ length: 32 }, (_, i) => i + 1));
  const odds = Object.values(playoffOdds(lg));
  assert.ok(odds.every((o) => o >= 0 && o <= 1));
  const g = rosterGrades(lg, u.id);
  assert.ok(g.F && g.D && g.G && g.OVR);
  // Spending SP changes the room; answering prompts applies their effects once.
  const before = u.morale;
  assert.ok(runAction(lg, "meeting").ok);
  assert.ok(u.morale > before);
  gm.presser = { key: "t", res: "W", day: lg.day, q: "Q", a: [{ t: "A", fx: { morale: 3 } }] };
  assert.ok(answerPresser(lg, 0).ok);
  assert.equal(gm.presser, null);
  assert.equal(answerPresser(lg, 0).ok, false);
  gm.speech = { key: "t", res: "L", day: lg.day };
  assert.ok(giveSpeech(lg, "calm").ok);
  assert.equal(gm.speech, null);
  // Through the playoffs and into a new season; saves keep the pulse.
  L.simRestOfSeason(lg);
  L.endRegularSeason(lg);
  while (lg.playoffs.champion == null) simPlayoffDay(lg);
  assert.ok(lg.achievements.some((a) => a.key === "firstWin"));
  assert.ok(ACHIEVEMENTS.length >= 10);
  const back = L.deserializeLeague(L.serializeLeague(lg));
  assert.equal(back.gm.sp, gm.sp);
  assert.equal(back.teams[back.userTid].morale, u.morale);
  assert.equal(repTier(95).label, "LEGEND");
  assert.equal(repTier(10).label, "ROOKIE");
});

test("club pulse: old saves gain pulse state without back-paid points", () => {
  const lg = L.createLeague({ userAbbr: "TOR", seed: 4 });
  L.startRegularSeason(lg);
  for (let i = 0; i < 40; i++) L.simDay(lg);
  const old = JSON.parse(JSON.stringify(lg));
  delete old.gm;
  for (const t of old.teams) { delete t.morale; delete t.chemistry; delete t.pulseRoster; }
  const back = L.restoreLeague(old);
  assert.equal(back.gm.sp, 10);
  assert.ok(back.teams.every((t) => t.morale === MORALE_NEUTRAL));
  L.simDay(back);
  assert.ok(back.gm.sp <= 12, `no lump of back-dated weekly income (${back.gm.sp})`);
});
