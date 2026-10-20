// Game results and records (Gridiron 1.9 / 1.95 / 3.40 / 2.10): the postgame result card and the
// record ceremonies, queued through the big-moments system.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../src/engine/league.js";
import { createGame, simToEnd } from "../src/engine/sim.js";
import { resultDayMoments, resultCardMode } from "../src/engine/momentsResults.js";
import { afterGameDay } from "../src/engine/moments.js";
import { seasonMark, ensureRecords } from "../src/engine/records.js";
import { isGoalie } from "../src/engine/constants.js";

const results = (lg) => (lg.moments || []).filter((m) => m.kind === "result");
const userGameOn = (lg, day) => lg.schedule.find((g) => g.day === day && (g.h === lg.userTid || g.a === lg.userTid));
const season = (abbr, seed) => { const lg = L.createLeague({ userAbbr: abbr, seed }); L.startRegularSeason(lg); return lg; };

test("the result card is queued once per user game day with the right W/L/OTL and score", () => {
  const lg = season("EDM", 31);
  let checked = 0;
  for (let i = 0; i < 8 && checked < 3; i++) {
    const day = lg.day;
    const g = userGameOn(lg, day);
    L.simDay(lg);
    if (!g) continue;
    const cards = results(lg);
    assert.equal(cards.length, 1, "one card for the day");
    const m = cards[0];
    const home = g.h === lg.userTid;
    const us = home ? g.hs : g.as, them = home ? g.as : g.hs;
    assert.equal(m.gid, g.id);
    assert.equal(m.key, `result-${lg.year}-${g.id}`);
    assert.deepEqual([m.us, m.them, m.home, m.ot], [us, them, home, g.ot || null]);
    assert.equal(m.outcome, us > them ? "W" : g.ot ? "OTL" : "L");
    const rec = lg.teams[lg.userTid].rec;
    assert.deepEqual(m.rec, { w: rec.w, l: rec.l, otl: rec.otl, pts: rec.pts });
    assert.match(m.place, /^\d+(st|nd|rd|th) in the /);
    assert.ok(m.stars.length >= 1 && m.stars.every((s) => s.name), "stars named");
    assert.ok(m.others.every((x) => x.h !== lg.userTid && x.a !== lg.userTid), "around the league leaves your game out");
    // Running the day's hook again doesn't stack a second card.
    afterGameDay(lg, new Set(), lg.schedule.filter((x) => x.day === day && x.played));
    assert.equal(results(lg).length, 1);
    checked++;
  }
  assert.ok(checked >= 2, "saw at least two of your games");
});

test("only the latest result card remains after a multi-day sim; days without your game add none", () => {
  const lg = season("TOR", 12);
  let last = null;
  for (let i = 0; i < 10; i++) {
    const g = userGameOn(lg, lg.day);
    const before = results(lg).map((m) => m.key);
    L.simDay(lg);
    if (g) last = g;
    else assert.deepEqual(results(lg).map((m) => m.key), before, "an AI-only day queues no card");
  }
  const cards = results(lg);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].gid, last.id);
});

test("AI-only results don't queue cards", () => {
  const lg = season("BOS", 4);
  const day = lg.day;
  L.simDay(lg);
  const ai = lg.schedule.filter((g) => g.day === day && g.played && g.h !== lg.userTid && g.a !== lg.userTid);
  assert.ok(ai.length > 0);
  lg.moments = [];
  const out = resultDayMoments(lg, new Set(ai.flatMap((g) => [g.h, g.a])), ai);
  assert.equal(out.filter((m) => m.kind === "result").length, 0);
});

test("the card follows the setting, and a game played live gets none", () => {
  const lg = season("CGY", 8);
  assert.equal(resultCardMode(lg), "compact");
  lg.settings.postgame = false;
  assert.equal(resultCardMode(lg), "off", "the old 'no postgame box' choice carries over");
  lg.settings.resultCard = "full";
  assert.equal(resultCardMode(lg), "full");
  lg.settings.resultCard = "off";
  while (!L.userGameOnDay(lg)) L.simDay(lg);
  L.simDay(lg);
  assert.equal(results(lg).length, 0, "off: no card");
  lg.settings.resultCard = "compact";
  // Live: the other games sim, yours is played on the live screen, then the day finishes.
  while (!L.userGameOnDay(lg)) L.simDay(lg);
  const g = L.userGameOnDay(lg);
  L.simDay(lg, { holdUserGame: true });
  lg.activeGame = { version: 1, spec: { kind: "regular", gid: g.id, home: g.h, away: g.a } };
  const s = createGame(lg, lg.teams[g.h], lg.teams[g.a], { live: true, userTid: lg.userTid });
  simToEnd(s);
  L.playScheduledGame(lg, g, s);
  L.finishDay(lg);
  delete lg.activeGame;
  assert.ok(g.played);
  assert.equal(results(lg).length, 0, "the live screen showed the final");
});

test("an NHL single-season record break queues exactly one ceremony and stays in the book", () => {
  const lg = season("EDM", 21);
  const user = lg.teams[lg.userTid];
  const p = user.roster.map((id) => lg.players[id]).filter((x) => x && !isGoalie(x.pos)).sort((a, b) => b.ovr - a.ovr)[0];
  // Ninety-five goals before the day: past Gretzky's 92, the NHL's and the Oilers' record.
  Object.assign(p.stats, { gp: 60, g: 95 });
  L.simDay(lg);
  const nhl = lg.moments.filter((m) => m.kind === "nhlRecord");
  assert.equal(nhl.length, 1, "one ceremony");
  assert.equal(lg.moments.filter((m) => m.kind === "franchiseRecord").length, 0, "the club record rides on the same moment");
  const m = nhl[0];
  assert.equal(String(m.pid), String(p.id));
  assert.equal(m.stat, "g");
  assert.ok(m.value >= 95);
  assert.equal(m.prev.name, "Wayne Gretzky");
  assert.equal(m.prev.value, 92);
  assert.equal(m.stop, true, "the sim stops for it");
  assert.ok(m.also.some(([k]) => k === "CLUB GOALS"), "the Oilers record is listed on it");
  // The book keeps the new holder, through a save.
  const back = L.deserializeLeague(L.serializeLeague(lg));
  const mark = seasonMark(back, "nhl", "g");
  assert.equal(String(mark.pid), String(p.id));
  assert.ok(!mark.real && mark.prev.name === "Wayne Gretzky");
  assert.equal(String(seasonMark(back, "franchise", "g", "EDM").pid), String(p.id));
  // Adding to his own record isn't a new ceremony.
  p.stats.g += 3;
  L.simDay(lg);
  assert.equal(lg.moments.filter((m2) => m2.kind === "nhlRecord").length, 1);
  assert.equal(seasonMark(lg, "nhl", "g").value, p.stats.g);
});

test("another club's record goes in the book quietly; your club record gets its own card", () => {
  const lg = season("SEA", 5);
  const other = lg.teams.find((t) => t.id !== lg.userTid && t.abbr === "MTL");
  const op = other.roster.map((id) => lg.players[id]).find((x) => x && !isGoalie(x.pos));
  Object.assign(op.stats, { gp: 50, a: 170 }); // past Gretzky's 163 assists
  const mine = lg.teams[lg.userTid].roster.map((id) => lg.players[id]).find((x) => x && isGoalie(x.pos));
  const clubRecord = seasonMark(lg, "franchise", "w", "SEA");
  Object.assign(mine.stats, { gp: 50, w: clubRecord.value + 1 });
  L.simDay(lg);
  assert.equal(lg.moments.filter((m) => m.kind === "nhlRecord").length, 0, "not your player");
  assert.equal(String(seasonMark(lg, "nhl", "a").pid), String(op.id), "the NHL book has him");
  const fr = lg.moments.filter((m) => m.kind === "franchiseRecord");
  assert.equal(fr.length, 1);
  assert.equal(fr[0].stat, "w");
  assert.equal(fr[0].prev.name, clubRecord.name);
  assert.ok(lg.recordBook.marks.history.some((e) => e.scope === "nhl" && e.key === "a"));
});

test("old saves: marks broken in seasons already played are written into the book", () => {
  const lg = L.createLeague({ userAbbr: "VAN", seed: 3 });
  const p = lg.players[lg.teams[lg.userTid].roster.find((id) => !isGoalie(lg.players[id].pos))];
  lg.seasonArchive = [{ year: 2025, teams: lg.teams.map((t) => ({ tid: t.id, rec: { w: 40, pts: 90, gf: 250 } })), leaders: [{ pid: p.id, name: p.name, tid: p.tid, pos: p.pos, stats: { gp: 82, g: 99, a: 10, pts: 109 } }] }];
  delete lg.recordBook.marks;
  ensureRecords(lg);
  const mark = seasonMark(lg, "nhl", "g");
  assert.equal(mark.value, 99);
  assert.equal(mark.year, 2025);
  assert.equal(seasonMark(lg, "franchise", "g", "VAN").value, 99);
  assert.equal(lg.recordBook.marks.history.length, 0, "written in quietly");
});
