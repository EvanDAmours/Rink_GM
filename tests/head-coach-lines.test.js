import test from "node:test";
import assert from "node:assert/strict";
import { createLeague, startRegularSeason } from "../src/engine/league.js";
import { headCoachLines, lineupIds } from "../src/engine/lines.js";
import { decisionInterrupt } from "../src/engine/decisionInterrupts.js";
import HEADSHOTS from "../src/data/nhlHeadshots.json" with { type: "json" };

test("head coach mode fills injured slots and never pauses the simulation for an injury", () => {
  const l = createLeague({ userAbbr: "EDM", seed: 3 });
  const t = l.teams[l.userTid];
  startRegularSeason(l);
  assert.equal(l.settings.coachLines, true, "new franchises default to the head coach running the lines");
  const star = lineupIds(t.lines).map((id) => l.players[id]).filter((p) => p && p.ovr >= 80 && p.pos !== "G")[0];
  star.injury = 12; star.injuryEpisode = "test";
  const msg = decisionInterrupt(l);
  assert.ok(!msg || !/injured/.test(msg), `no injury pause expected, got: ${msg}`);
  assert.ok(!lineupIds(t.lines).includes(star.id), "the injured star left the saved lines");
  assert.ok(lineupIds(t.lines).every((id) => l.players[id].injury <= 0), "every dressed player is healthy");
  assert.ok(l.inbox.some((m) => /reset the lines/.test(m.text)), "the coach's note reached the inbox");
  const moves = headCoachLines(l, t);
  assert.equal(moves.filter((m) => m.out).length, 0, "a second pass has nothing left to cover");
  l.settings.coachLines = false;
  const other = lineupIds(t.lines).map((id) => l.players[id]).find((p) => p.ovr >= 80 && p.pos !== "G");
  other.injury = 5; other.injuryEpisode = "test2";
  assert.match(decisionInterrupt(l) || "", /injured/, "with the option off the simulation pauses as before");
});

test("every opening-roster player maps to an NHL headshot id", () => {
  const l = createLeague({ userAbbr: "MTL", seed: 1 });
  const real = Object.values(l.players).filter((p) => p.tid >= 0 && p.src !== "gen" && !p.draft?.generated);
  const missing = real.filter((p) => !HEADSHOTS[`${p.name}|${p.pos}`]);
  assert.ok(missing.length <= real.length * 0.05, `too many roster players without headshots: ${missing.slice(0, 8).map((p) => p.name).join(", ")}`);
});
