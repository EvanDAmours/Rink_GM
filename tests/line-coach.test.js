import test from "node:test";
import assert from "node:assert/strict";
import { createLeague } from "../src/engine/league.js";
import { syncLines, lineupIds } from "../src/engine/lines.js";
import { chemistry } from "../src/engine/chemistry.js";
import { coachIdeas, applyIdea, phrase } from "../src/engine/lineCoach.js";

const setup = () => { const lg = createLeague({ userAbbr: "EDM", seed: 7 }); const t = lg.teams[lg.userTid]; if (!t.lines) syncLines(lg, t); return { lg, t }; };

test("the coach's ideas are real improvements, best first, and making one works", () => {
  const { lg, t } = setup();
  const ideas = coachIdeas(lg, t, "es");
  assert.ok(ideas.length > 0, "a fresh lineup has something to improve");
  for (let k = 1; k < ideas.length; k++) assert.ok(ideas[k - 1].gain >= ideas[k].gain, "sorted best first");
  for (const i of ideas) {
    assert.ok(i.gain > 0 && i.title && i.why.endsWith("."), i.title);
    for (const u of i.units) assert.equal(u.after.score, chemistry(lg, t, u.ids, u.g).score, "after numbers are the engine's");
  }
  const best = ideas[0];
  const before = JSON.stringify([t.lines.F, t.lines.D]);
  applyIdea(lg, t, best);
  assert.notEqual(JSON.stringify([t.lines.F, t.lines.D]), before, "the lines changed");
  assert.ok(lineupIds(t.lines).includes(best.ids[1]), "the incoming player is dressed");
  assert.equal(new Set(lineupIds(t.lines)).size, lineupIds(t.lines).length, "nobody is in two spots");
  // Following the coach converges: eventually the lines are set.
  let n = 0; while (n < 40) { const i = coachIdeas(lg, t, "es")[0]; if (!i) break; applyIdea(lg, t, i); n++; }
  assert.ok(n < 40, "no endless loop of ideas");
  assert.equal(coachIdeas(lg, t, "es").length, 0);
});

test("special-teams ideas keep units' shape and skip injured players", () => {
  const { lg, t } = setup();
  const injured = t.lines.F[0][1]; lg.players[injured].injury = 5;
  for (const mode of ["pp", "pk", "st"]) for (const i of coachIdeas(lg, t, mode)) {
    assert.ok(["PP", "PK"].includes(i.a.g), mode);
    assert.ok(!i.ids.includes(injured), "an injured player is never moved");
  }
  for (const i of coachIdeas(lg, t, "es")) assert.ok(!i.ids.includes(injured));
  assert.equal(phrase("Three of the same type (2WY)"), "three two-way forwards");
  assert.equal(phrase("Mix of left and right shots"), "a mix of left and right shots");
});

test("the closed coach summary counts the coach's greedy run and its total value", async () => {
  const { lineupGap, gapSummary } = await import("../src/engine/lineCoach.js");
  for (const mode of ["es", "pp", "pk", "st"]) {
    const { lg, t } = setup();
    const before = JSON.stringify(t.lines);
    const gap = lineupGap(lg, t, mode);
    assert.equal(JSON.stringify(t.lines), before, "working out the gap leaves the lines alone");
    // Do it for real: tap "Make the swap" on the best idea until the coach runs out.
    let n = 0, gain = 0, chem = 0;
    while (n < 40) { const i = coachIdeas(lg, t, mode)[0]; if (!i) break; gain += i.gain; chem += i.chem; applyIdea(lg, t, i); n++; }
    assert.equal(gap.moves, n, `${mode}: change count matches the greedy run`);
    assert.ok(Math.abs(gap.gain - gain) < 0.02, `${mode}: value gap matches (${gap.gain} vs ${gain})`);
    assert.equal(gap.points, Math.round(gap.gain));
    assert.equal(gap.chem, chem);
    assert.equal(JSON.stringify([t.lines.F, t.lines.D, t.lines.PP, t.lines.PK]), JSON.stringify([gap.best.F, gap.best.D, gap.best.PP, gap.best.PK]), `${mode}: same end lineup`);
    assert.equal(lineupGap(lg, t, mode).moves, 0, "after the run nothing is left");
    assert.equal(gapSummary(lineupGap(lg, t, mode)), "Your lineup is set");
  }
  assert.equal(gapSummary({ moves: 4, points: 6 }), "4 changes could improve your lineup · 6 points short of your best");
  assert.equal(gapSummary({ moves: 1, points: 0 }, "power play"), "1 change could improve your power play · less than a point short of your best");
  assert.equal(gapSummary({ moves: 0 }, "special teams"), "Your special teams are set");
});
