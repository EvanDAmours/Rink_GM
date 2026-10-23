import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../src/engine/league.js";
import { queueMoment, closeMoment, currentMoment, momentStopsSim } from "../src/engine/moments.js";

test("moments queue once per key, close in order and survive a save", () => {
  const lg = L.createLeague({ userAbbr: "EDM", seed: 9 });
  assert.equal(queueMoment(lg, { kind: "clinch", key: "clinch-2026-berth", tid: lg.userTid }), true);
  assert.equal(queueMoment(lg, { kind: "clinch", key: "clinch-2026-berth", tid: lg.userTid }), false, "same key twice");
  queueMoment(lg, { kind: "signing", key: "sign-1", tid: lg.userTid, stop: true });
  assert.equal(momentStopsSim(lg), false, "moments never stop a sim; they wait until it ends");
  const back = L.deserializeLeague(L.serializeLeague(lg));
  assert.equal(back.moments.length, 2);
  assert.equal(currentMoment(back).kind, "clinch");
  assert.equal(closeMoment(back).key, "clinch-2026-berth");
  assert.equal(queueMoment(back, { kind: "clinch", key: "clinch-2026-berth" }), false, "a seen moment never comes back");
  assert.equal(closeMoment(back).kind, "signing");
  assert.equal(currentMoment(back), null);
});

test("a simmed regular-season day runs the moment hooks without breaking the sim", () => {
  const lg = L.createLeague({ userAbbr: "TOR", seed: 12 });
  L.startRegularSeason(lg);
  for (let i = 0; i < 5; i++) L.simDay(lg);
  assert.ok(Array.isArray(lg.moments));
});
