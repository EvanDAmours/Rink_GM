import test from "node:test";
import assert from "node:assert/strict";
import { createLeague } from "../src/engine/league.js";
import { announceRetirements } from "../src/engine/offseason.js";
import { repairLeague } from "../src/engine/repair.js";

// A player who retires leaves the trade block with him, so the load-time repair has nothing to
// drop and a save stays the same after reload + Continue.
test("retired players leave the trade block", () => {
  const lg = createLeague({ userAbbr: "EDM", seed: 7 });
  const vets = Object.values(lg.players).filter((p) => p.tid >= 0 && p.age >= 34).slice(0, 40);
  assert.ok(vets.length > 5);
  lg.block = vets.map((p) => ({ pid: p.id, tid: p.tid, reason: "Rebuilding", day: lg.day, year: lg.year, interest: [] }));
  for (const p of vets) p.age = 44;
  announceRetirements(lg);
  const gone = vets.filter((p) => !lg.players[p.id]);
  assert.ok(gone.length > 0, "some veterans retired");
  assert.ok(lg.block.every((b) => lg.players[b.pid]), "no block entry points at a retired player");
  const before = JSON.stringify(lg.block);
  repairLeague(lg);
  assert.equal(JSON.stringify(lg.block), before);
});
