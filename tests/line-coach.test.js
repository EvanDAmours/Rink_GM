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
