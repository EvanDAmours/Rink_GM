import test from "node:test";
import assert from "node:assert/strict";
import { createLeague, startRegularSeason, simDay, seasonOver, endRegularSeason, finishPlayoffs } from "../src/engine/league.js";
import { deadlinePending, skipDeadline } from "../src/engine/market.js";
import { simPlayoffDay } from "../src/engine/playoffs.js";
import { teamGrades, userMoves, unseenPaper } from "../src/engine/papers.js";
import { careerTotals, careerMilestones, careerLeaders } from "../src/engine/records.js";
import { fireCoach, hireCoach } from "../src/engine/franchise.js";
import { snapshotForSummary, buildSummary } from "../src/engine/simSummary.js";
import { allStarRosters } from "../src/engine/allstar.js";

function fullSeason(seed = 11) {
  const l = createLeague({ userAbbr: "TOR", seed });
  startRegularSeason(l);
  let guard = 0;
  while (l.phase === "regular" && !seasonOver(l) && guard++ < 400) { if (deadlinePending(l)) skipDeadline(l); simDay(l); }
  return l;
}

test("sim summary reports the span, standings movement and top performers", () => {
  const l = createLeague({ userAbbr: "TOR", seed: 2 });
  startRegularSeason(l);
  const snap = snapshotForSummary(l);
  for (let i = 0; i < 10; i++) simDay(l);
  const s = buildSummary(l, snap);
  assert.ok(s && s.span.gp >= 2, "games were played in the span");
  assert.equal(s.span.w + s.span.l + s.span.otl, s.span.gp);
  assert.equal(s.games.length, s.span.gp);
  assert.ok(s.now.div >= 1 && s.now.div <= 8);
  assert.ok(s.topSkaters.length > 0 && s.topSkaters[0].pts >= s.topSkaters.at(-1).pts);
});

test("All-Star weekend, the deadline extra and the season-in-review paper all print once", () => {
  const l = fullSeason(11);
  assert.equal(l.allStar?.year, l.year, "All-Star weekend ran");
  assert.equal(l.allStar.skills.length, 5);
  assert.ok(l.allStar.rosters.every((r) => r.players.length === 11), "11 players per division");
  assert.ok(l.allStar.rosters.every((r) => new Set(r.players.map((p) => p.tid)).size >= 7), "every division roster spreads across clubs");
  const kinds = (l.papers || []).map((p) => p.kind);
  assert.deepEqual(kinds.filter((k) => k !== "scouting"), ["allstar", "deadline"]);
  assert.ok(kinds.filter((k) => k === "scouting").length >= 2, "scouting checkpoints print every eight weeks");
  assert.ok(unseenPaper(l), "papers wait to be read");
  endRegularSeason(l);
  let guard = 0; while (l.playoffs.champion == null && guard++ < 200) simPlayoffDay(l);
  finishPlayoffs(l);
  const review = l.papers.find((p) => p.kind === "review");
  assert.ok(review, "season in review printed");
  assert.equal(l.papers.filter((p) => p.kind === "review").length, 1);
  assert.match(review.headline, /CHAMPIONS/);
  assert.equal(review.side.find((s) => s.h === "Report Card").rows.length, 32, "every club is graded");
  const grades = teamGrades(l);
  const champ = grades.find((g) => g.tid === l.playoffs.champion);
  assert.ok(/^A/.test(champ.grade), `champion grade ${champ.grade}`);
  assert.ok(grades.every((g) => /^[A-F]/.test(g.grade)));
  const moves = userMoves(l);
  assert.ok(moves.count >= 0 && (moves.count === 0 || moves.best));
});

test("career totals, milestones and all-time leaders", () => {
  const l = fullSeason(12);
  const p = Object.values(l.players).filter((x) => x.tid >= 0 && x.stats.gp > 0 && x.pos !== "G").sort((a, b) => b.stats.pts - a.stats.pts)[0];
  const t = careerTotals(p);
  assert.equal(t.pts, p.stats.pts, "first season totals match the season line");
  assert.equal(t.g + t.a, t.pts);
  const miles = careerMilestones(p);
  assert.ok(miles.every((m) => m.mark <= t[m.key]));
  const leaders = careerLeaders(l);
  assert.equal(leaders.pts[0].value, Math.max(...Object.values(l.players).filter((x) => x.pos !== "G" && x.tid !== -2).map((x) => careerTotals(x).pts)));
  assert.ok(leaders.w.length > 0 && leaders.w[0].pos === "G");
});

test("you can dismiss your coach in season and hire an interim replacement; AI clubs change coaches under pressure", () => {
  const l = createLeague({ userAbbr: "TOR", seed: 4 });
  startRegularSeason(l);
  const t = l.teams[l.userTid], old = t.coach.name, trust = t.owner.trust;
  assert.equal(hireCoach(l, l.coachMarket[0].id).ok, false, "no in-season hire with a coach in place");
  const r = fireCoach(l);
  assert.equal(r.ok, true);
  assert.equal(t.coach.interim, true);
  assert.ok(t.owner.trust < trust);
  assert.ok(l.coachMarket.some((c) => c.name === old), "the dismissed coach is on the market");
  assert.equal(fireCoach(l).ok, false, "an interim coach cannot be dismissed");
  const h = hireCoach(l, l.coachMarket.find((c) => c.name !== old).id);
  assert.equal(h.ok, true);
  assert.ok(!t.coach.interim);
  const full = fullSeason(13);
  const changes = (full.news || []).filter((n) => n.type === "coach");
  assert.ok(changes.length <= 3, "at most three AI changes a season");
});

test("All-Star rosters are 6 forwards, 3 defencemen and 2 goalies per division, healthy only", () => {
  const l = createLeague({ userAbbr: "TOR", seed: 9 });
  startRegularSeason(l);
  for (let i = 0; i < 20; i++) simDay(l);
  for (const r of allStarRosters(l)) {
    const grp = (pos) => (pos === "G" ? "G" : ["LD", "RD"].includes(pos) ? "D" : "F");
    assert.deepEqual([6, 3, 2], ["F", "D", "G"].map((g) => r.players.filter((p) => grp(p.pos) === g).length));
    assert.ok(r.players.every((p) => !l.players[p.pid].injury));
    assert.equal(r.players.filter((p) => p.captain).length, 1);
  }
});
