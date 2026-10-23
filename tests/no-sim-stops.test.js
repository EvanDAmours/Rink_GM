import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../src/engine/league.js";
import { queueMoment, momentStopsSim } from "../src/engine/moments.js";
import { decisionInterrupt } from "../src/engine/decisionInterrupts.js";
import { deadlinePending, skipDeadline } from "../src/engine/market.js";

// Mirrors the app's chunked sim loop: a step continues unless a genuine blocker fires.
test("a full regular season sims to the end with moments queued, and they wait for afterwards", () => {
  const lg = L.createLeague({ userAbbr: "EDM", seed: 11 });
  L.startRegularSeason(lg);
  queueMoment(lg, { kind: "nhlRecord", key: "rec-test", tid: lg.userTid, stop: true });
  let stops = 0, guard = 0;
  while (lg.phase === "regular" && !L.seasonOver(lg) && guard++ < 400) {
    if (deadlinePending(lg)) { skipDeadline(lg); continue; }
    L.simDay(lg);
    if (momentStopsSim(lg)) stops++;
    const n = decisionInterrupt(lg);
    if (n && !/roster|lineup|goalie|cap|injur/i.test(n)) stops++;
  }
  assert.ok(L.seasonOver(lg), "reached the end of the regular season");
  assert.equal(stops, 0, "no moment or offer stopped the sim");
  assert.ok(lg.moments.length >= 1, "moments are still queued to show afterwards");
});
