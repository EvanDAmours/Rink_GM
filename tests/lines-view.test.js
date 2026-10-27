import test from "node:test";
import assert from "node:assert/strict";
import { PP_SPLIT } from "../src/engine/sim.js";
import fs from "node:fs";
import { ES_SHARE, PP_SHARE, PK_SHARE, iceShare, goalieShare, lastName, firstName, listName, offPosition, planWords } from "../src/ui/linesView.js";

const sum = (a) => a.reduce((s, x) => s + x, 0);

test("ice-time shares match the bench rotation in the sim and add up", () => {
  const sim = fs.readFileSync(new URL("../src/engine/sim.js", import.meta.url), "utf8");
  const m = /const F_SHARE = \[([^\]]+)\], D_SHARE = \[([^\]]+)\]/.exec(sim);
  assert.ok(m, "sim.js still defines F_SHARE and D_SHARE");
  assert.deepEqual(m[1].split(",").map(Number), ES_SHARE.F);
  assert.deepEqual(m[2].split(",").map(Number), ES_SHARE.D);
  assert.match(sim, /ppTime\[k\] % PP_SPLIT\.cycle < PP_SPLIT\.first/, "sim.js still splits the power play by ppTime");
  assert.equal(PP_SHARE[0], PP_SPLIT.first / PP_SPLIT.cycle);
  assert.match(sim, /Math\.floor\(s\.ppTime\[other\(k\)\] \/ \d+\) % 2/, "the kill still alternates two units evenly");
  assert.deepEqual(PK_SHARE, [0.5, 0.5]);
  for (const k of ["F", "D", "PP", "PK"]) {
    const n = k === "F" ? 4 : k === "D" ? 3 : 2;
    const shares = Array.from({ length: n }, (_, i) => iceShare(k, i));
    assert.ok(Math.abs(sum(shares) - 100) <= 1, `${k} shares add to 100 (${shares})`);
    assert.ok(shares.every((x, i) => i === 0 || x <= shares[i - 1]), `${k}: the top unit plays the most`);
  }
  assert.equal(iceShare("F", 0), 32);
  assert.equal(iceShare("PP", 0), Math.round(100 * PP_SPLIT.first / PP_SPLIT.cycle));
  assert.equal(iceShare("F", 9), 0);
  assert.deepEqual(goalieShare(0.2), [80, 20]);
  assert.deepEqual(goalieShare(0), [100, 0]);
  assert.deepEqual(goalieShare(undefined), [100, 0]);
});

test("names: surname under a spot, full name (or initial) in the list", () => {
  assert.equal(lastName("Connor McDavid"), "McDavid");
  assert.equal(lastName("Martin St. Louis"), "St. Louis");
  assert.equal(lastName("Tim Stützle Jr."), "Stützle");
  assert.equal(lastName("Ryan Nugent-Hopkins"), "Nugent-Hopkins");
  assert.equal(lastName("Pele"), "Pele");
  assert.equal(lastName(""), "");
  assert.equal(firstName("Connor McDavid"), "Connor");
  assert.equal(firstName("Pele"), "");
  assert.equal(listName("Connor McDavid"), "Connor McDavid");
  assert.equal(listName("Alexander Mukhamadullin", 16), "A. Mukhamadullin");
});

// The Lineup screen: a strength menu, one Auto-set menu, a forwards grid and pair rows, the coach's
// best change, drag-and-drop or tap-to-swap, a picker Sheet for the selected spot, settings in a Sheet.
test("the lineup screen: strength menu, Auto-set, coach panel, drag or tap to swap, picker Sheet", () => {
  const src = fs.readFileSync(new URL("../src/ui/LinesPage.jsx", import.meta.url), "utf8");
  for (const t of ["Even strength", "Power play", "Penalty kill", "Situations"]) assert.ok(src.includes(`"${t}"`), t);
  for (const t of ["Auto lines by overall", "Auto lines by chemistry", "Reset to NHL lines", "Line settings"]) assert.ok(src.includes(t), t);
  assert.ok(src.includes("Best change right now") && src.includes("Make the swap") && src.includes("Next idea") && src.includes("Other ideas, best first"), "coach panel");
  assert.ok(src.includes("coachIdeas") && src.includes("applyIdea"), "coach ideas come from the engine");
  assert.ok(src.includes("draggable") && src.includes("onDrop"), "drag and drop");
  assert.ok(src.includes("<Sheet") && src.includes("Who plays"), "the picker Sheet for a selected spot");
  assert.ok(src.includes(">Scratched<") && src.includes(">Not on a unit<") && src.includes("lx-xt"), "scratches and special-teams bench as tiles");
  assert.ok(src.includes("lx-strip") && src.includes("lx-str d"), "goalies and bench in the bottom strip; PP/PK forwards over defence");
  assert.ok(!/RinkLines|esSpots|stSpots/.test(src), "no rink view");
  assert.ok(!fs.existsSync(new URL("../src/ui/RinkLines.jsx", import.meta.url)), "rink component removed");
});

test("off-position slots and the plan in a few words", () => {
  assert.equal(offPosition({ pos: "LW" }, "RW"), false, "wingers play either wing");
  assert.equal(offPosition({ pos: "LW" }, "C"), true);
  assert.equal(offPosition({ pos: "LD" }, "RD"), false);
  assert.equal(offPosition({ pos: "C" }, "LD"), true);
  assert.equal(offPosition({ pos: "C" }, "PP"), false);
  assert.equal(offPosition(null, "C"), false);
  assert.equal(planWords({ forecheck: "aggressive", neutral: "trap", attack: "cycle" }), "Aggressive forecheck · Trap · Cycle attack");
  assert.equal(planWords({ forecheck: "balanced", neutral: "balanced", attack: "balanced" }), "Balanced forecheck · Balanced neutral zone · Balanced attack");
  assert.equal(planWords(null), "");
});
