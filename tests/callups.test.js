import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../src/engine/league.js";
import { counts, callUp, callUpBlock, sendDownOptions, swapCallUp } from "../src/engine/roster.js";
import { MAX_ROSTER } from "../src/engine/constants.js";

const best = (lg, t) => t.prospects.map((id) => lg.players[id]).filter((p) => p && p.signed !== false).sort((a, b) => b.ovr - a.ovr)[0];

// A regular-season club with a full 23 and one waiver-exempt youngster on the active roster.
function fullClub() {
  const lg = L.createLeague({ userAbbr: "EDM", seed: 5 });
  L.startRegularSeason(lg);
  const t = lg.teams[lg.userTid];
  const kid = t.roster.map((id) => lg.players[id]).find((p) => p && p.pos !== "G" && !p.injury && !p.clause && p.cap < 2);
  kid.service = { firstAge: 20, years: 0, priorGames: 0, estimated: false };
  kid.stats.gp = 0;
  return { lg, t, kid };
}

test("training camp can carry more than 23; the cut comes at the season start", () => {
  const lg = L.createLeague({ userAbbr: "EDM", seed: 5 });
  const t = lg.teams[lg.userTid];
  assert.equal(lg.phase, "preseason");
  const up = best(lg, t);
  assert.equal(callUpBlock(lg, t, up.id), null);
  assert.equal(callUp(lg, t, up.id), true);
  assert.equal(counts(lg, t).active, MAX_ROSTER + 1);
});

test("a full roster says so, and a swap sends one down and calls the other up", () => {
  const { lg, t, kid } = fullClub();
  const up = best(lg, t);
  if (counts(lg, t).active < MAX_ROSTER) for (const id of [...t.prospects]) { if (counts(lg, t).active >= MAX_ROSTER) break; if (id !== up.id) callUp(lg, t, id); }
  assert.equal(counts(lg, t).active, MAX_ROSTER);
  assert.equal(callUp(lg, t, up.id), false, "the engine still refuses a 24th active player");
  const block = callUpBlock(lg, t, up.id);
  assert.equal(block.code, "room");
  assert.match(block.msg, /full/);
  const opts = sendDownOptions(lg, t, up.id);
  assert.ok(opts.length > 0);
  const pick = opts.find((o) => o.p.id === kid.id);
  assert.ok(pick && pick.exempt && pick.works, "the exempt youngster can go down");
  const r = swapCallUp(lg, t, up.id, pick.p.id);
  assert.equal(r.ok, true, r.msg);
  assert.ok(t.roster.includes(up.id) && !t.prospects.includes(up.id));
  assert.ok(t.prospects.includes(pick.p.id) && !t.roster.includes(pick.p.id));
  assert.equal(counts(lg, t).active, MAX_ROSTER, "still a legal 23");
});

test("players who need waivers or have a no-movement clause can't be swapped straight down", () => {
  const { lg, t } = fullClub();
  const up = best(lg, t);
  const opts = sendDownOptions(lg, t, up.id);
  const waived = opts.find((o) => o.waivers);
  if (waived) assert.equal(swapCallUp(lg, t, up.id, waived.p.id).ok, false);
  const nmc = opts.find((o) => o.nmc);
  if (nmc) assert.equal(swapCallUp(lg, t, up.id, nmc.p.id).ok, false);
  assert.ok(t.prospects.includes(up.id), "nothing moved");
});

test("a just-sent-down player gets a clear recall message", () => {
  const { lg, t, kid } = fullClub();
  const up = best(lg, t);
  if (counts(lg, t).active < MAX_ROSTER) for (const id of [...t.prospects]) { if (counts(lg, t).active >= MAX_ROSTER) break; if (id !== up.id) callUp(lg, t, id); }
  assert.equal(swapCallUp(lg, t, up.id, kid.id).ok, true);
  const b = callUpBlock(lg, t, kid.id);
  assert.equal(b.code, "recall");
  assert.match(b.msg, /recalled in \d day/);
});
