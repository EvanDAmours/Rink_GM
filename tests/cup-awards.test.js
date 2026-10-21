import test from "node:test";
import assert from "node:assert/strict";
import { createLeague, startRegularSeason, simDay, seasonOver, endRegularSeason, finishPlayoffs, completeDraft, goToFreeAgency, beginNextSeason, serializeLeague, deserializeLeague } from "../src/engine/league.js";
import { deadlinePending, skipDeadline } from "../src/engine/market.js";
import { simPlayoffDay } from "../src/engine/playoffs.js";
import { simDraftToUser } from "../src/engine/draft.js";
import { simFADay } from "../src/engine/offseason.js";
import { FA_DAYS, isDefense, isGoalie } from "../src/engine/constants.js";
import { allStarGain, applyAllStarGains, ALL_STAR_SLOTS } from "../src/engine/awards.js";
import { queueMoment, closeMoment } from "../src/engine/moments.js";
import { cupWinMoment, awardsNightMoment, ringNightMoment, openingNight, titleMeaning } from "../src/engine/momentsCup.js";

// One season played through the Final, with your club put in the Final so the Cup can be yours.
// Shared by the tests below (a season takes ~20 s).
const lg = createLeague({ userAbbr: "EDM", seed: 5 });
startRegularSeason(lg);
let guard = 0;
while (lg.phase === "regular" && !seasonOver(lg) && guard++ < 400) { if (deadlinePending(lg)) skipDeadline(lg); simDay(lg); }
endRegularSeason(lg);
const allNHL = structuredClone(lg.allNHL);
guard = 0;
while (lg.playoffs.round < 3 && guard++ < 200) simPlayoffDay(lg);
const finalSeries = lg.playoffs.rounds[3][0];
lg.userTid = finalSeries.top;
guard = 0;
while (lg.playoffs.champion == null && guard++ < 20) simPlayoffDay(lg);
const champ = lg.playoffs.champion, runnerUp = champ === finalSeries.top ? finalSeries.bot : finalSeries.top;
const cupQueued = lg.moments.filter((m) => m.kind === "cupWin");

const ok = (p, f) => p && (p.stats.gp || 0) >= f;
const SLOTS = ["C", "LW", "RW", "D", "D", "G"];
const fits = (slot, pos) => (slot === "D" ? isDefense(pos) : slot === "G" ? isGoalie(pos) : slot === pos);

test("All-Star teams: a C, LW, RW, two D and a G each, every player at his position and nobody twice", () => {
  assert.equal(allNHL.year, lg.year);
  const gp = Math.max(...lg.teams.map((t) => t.rec.gp));
  for (const team of ["first", "second"]) {
    assert.deepEqual(allNHL[team].map((e) => e.slot), SLOTS, `${team} team has every slot in order`);
    for (const e of allNHL[team]) {
      const p = lg.players[e.pid];
      assert.ok(fits(e.slot, p.pos), `${e.name} (${p.pos}) fits ${e.slot}`);
      assert.ok(ok(p, gp * (isGoalie(p.pos) ? 0.4 : 0.5)), `${e.name} played enough`);
      assert.equal(e.tid, p.tid);
      assert.ok(e.line && e.abbr);
    }
  }
  const both = [...allNHL.first, ...allNHL.second].map((e) => e.pid);
  assert.equal(new Set(both).size, 12, "first and second teams never share a player");
  assert.ok(allNHL.rookie.length >= 4, "an All-Rookie Team is named");
  assert.equal(new Set(allNHL.rookie.map((e) => e.pid)).size, allNHL.rookie.length);
  for (const e of allNHL.rookie) assert.ok(lg.players[e.pid].rookie && fits(e.slot, lg.players[e.pid].pos), `${e.name} is a rookie at ${e.slot}`);
  // The voters agree with the trophies: the Norris and Vezina winners make the First Team.
  if (lg.awards.vezina) assert.equal(allNHL.first.find((e) => e.slot === "G").pid, lg.awards.vezina.pid);
  if (lg.awards.norris) assert.ok(allNHL.first.some((e) => e.slot === "D" && e.pid === lg.awards.norris.pid));
  assert.equal(ALL_STAR_SLOTS.reduce((n, s) => n + s.n, 0), 6);
});

test("All-Star gains: +2 First Team, +1 Second Team, tapering for the elite, applied once", () => {
  assert.equal(allStarGain("first", 88), 2);
  assert.equal(allStarGain("second", 88), 1);
  assert.equal(allStarGain("first", 93), 1);
  assert.equal(allStarGain("first", 95), 0);
  assert.equal(allStarGain("first", 99), 0);
  assert.equal(allStarGain("rookie", 75), 0);
  const copy = deserializeLeague(serializeLeague(lg));
  const rec = structuredClone(allNHL);
  const before = Object.fromEntries([...rec.first, ...rec.second].map((e) => [e.pid, copy.players[e.pid].ovr]));
  const out = applyAllStarGains(copy, rec);
  for (const x of out.filter((o) => o.team !== "rookie")) assert.equal(copy.players[x.pid].ovr - before[x.pid], allStarGain(x.team, before[x.pid]), `${x.name} gains exactly his boost`);
  assert.equal(rec.applied, true);
  assert.deepEqual(applyAllStarGains(copy, rec), [], "a second call does nothing");
});

test("the Cup moment is queued only when your club wins, with the Conn Smythe and what the title means", () => {
  if (champ === lg.userTid) {
    assert.equal(cupQueued.length, 1);
    const m = cupQueued[0];
    assert.equal(m.key, `cup-${lg.year}`);
    assert.equal(m.stop, true);
    assert.equal(m.tid, champ);
    assert.equal(m.opp, runnerUp);
    assert.equal(m.wins, 4);
    assert.ok(m.mvp && lg.players[m.mvp.pid].tid === champ && m.mvp.p.name);
    assert.ok(m.what.length > 10);
  } else assert.equal(cupQueued.length, 0, "no Cup moment when somebody else wins");
  // Directly: the champion's GM gets it, the runner-up's does not.
  const user = lg.userTid;
  lg.userTid = runnerUp;
  assert.equal(cupWinMoment(lg, finalSeries), null);
  lg.userTid = champ;
  assert.equal(cupWinMoment(lg, finalSeries).kind, "cupWin");
  lg.userTid = user;
  // The Final paper leads with the Conn Smythe winner.
  const paper = lg.playoffs.papers.find((p) => p.round === 3);
  assert.ok(paper.connSmythe && lg.players[paper.connSmythe.pid].tid === champ);
  assert.equal(paper.titles, titleMeaning(lg, champ, lg.year).titles);
});

test("awards night: queued from the Cup paper, data kept after finishPlayoffs, never twice", () => {
  // The Cup paper closes: awards night is queued (SeriesPaper does this) and watched.
  const night = awardsNightMoment(lg);
  assert.equal(night.envelopes[0].k, "connSmythe", "the Conn Smythe is opened first");
  assert.ok(night.envelopes.some((e) => e.k === "hart"));
  assert.ok(night.envelopes.every((e) => e.name && e.tid != null));
  assert.equal(night.allNHL.first.length, 6);
  assert.equal(night.champ, champ);
  for (const m of lg.moments.slice()) closeMoment(lg);
  assert.equal(queueMoment(lg, night), true);
  closeMoment(lg);
  const cupSeen = (lg.momentsSeen || []).includes(`cup-${lg.year}`);
  lg.userTid = champ; // the GM of the champions, for ring night next season
  finishPlayoffs(lg);
  const h = lg.history[0];
  assert.equal(h.year, lg.year);
  assert.equal(h.allNHL.first.length, 6, "the All-Star teams are kept in the history");
  assert.ok(h.cupFinal && h.cupFinal.wins === 4);
  // (cupWin is new to the champions' GM if another club won while he ran this one: that depends on the sim)
  assert.ok(!lg.moments.some((m) => m.kind === "awardsNight" || (cupSeen && m.kind === "cupWin")), "seen moments are not queued again");
  const p = lg.players[allNHL.first[0].pid];
  assert.ok(p.allNHL?.some((x) => x.year === lg.year && x.team === "first"), "the honour is on the player's record");
  // An old save that never saw them gets both from finishPlayoffs.
  const fresh = deserializeLeague(serializeLeague(lg));
  assert.ok(fresh.history[0].allNHL.second.length === 6);
});

test("ring night: once, at the next season's opener, and only for the champions", () => {
  assert.equal(ringNightMoment(lg), null, "not before the next season");
  simDraftToUser(lg, { all: true }); completeDraft(lg); goToFreeAgency(lg);
  while (lg.fa && lg.fa.day < FA_DAYS) simFADay(lg);
  beginNextSeason(lg);
  // The gains come with off-season development (as Gridiron's All-Pros do), once.
  assert.equal(lg.allNHL.applied, true, "last season's All-Star gains were applied in the off-season");
  assert.deepEqual(applyAllStarGains(lg), [], "and never twice");
  startRegularSeason(lg);
  const rings = lg.moments.filter((m) => m.kind === "ringNight");
  assert.equal(rings.length, 1);
  assert.equal(rings[0].key, `rings-${lg.year - 1}`);
  assert.equal(rings[0].tid, lg.userTid);
  assert.equal(rings[0].wins, 4);
  assert.ok(rings[0].names.length > 0 && rings[0].titles >= 1);
  openingNight(lg);
  assert.equal(lg.moments.filter((m) => m.kind === "ringNight").length, 1, "queued once");
  while (lg.moments.length) closeMoment(lg);
  openingNight(lg);
  assert.equal(lg.moments.filter((m) => m.kind === "ringNight").length, 0, "never again after it was seen");
  // Another club's GM gets no ring night.
  const user = lg.userTid;
  lg.userTid = (user + 1) % lg.teams.length;
  assert.equal(ringNightMoment(lg), null);
  lg.userTid = user;
});
