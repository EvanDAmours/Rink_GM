// Real league business: AHL veterans retire, first-season rookies are the real Calder class,
// your club is never handed a free agent, AI clubs keep a young starting goalie, EA abilities
// count a little in trades, and free-agent bidding keeps your offer on the table.
import test from "node:test";
import assert from "node:assert/strict";
import * as L from "../src/engine/league.js";
import { createPlayer, generatePlayer, marketValue } from "../src/engine/players.js";
import { announceRetirements, MINORS_RETIRE_AGE } from "../src/engine/offseason.js";
const league = (abbr = "EDM", seed = 77) => L.createLeague({ userAbbr: abbr, seed });
const byName = (lg, name) => Object.values(lg.players).find((p) => p.name === name);
function farmPlayer(lg, t, opts = {}) {
  const p = createPlayer({ name: `Farm Vet ${Object.keys(lg.players).length}`, pos: "RW", ovr: 66, age: 34, tid: t.id, yrs: 1, cap: 0.8, ...opts }, lg.year);
  p.signed = true;
  lg.players[p.id] = p;
  t.prospects.push(p.id);
  return p;
}

test("AHL veterans retire on the same age-based odds; young farmhands never do", () => {
  const lg = league("TOR", 31);
  const t = lg.teams[3];
  const vets = Array.from({ length: 12 }, () => farmPlayer(lg, t, { age: 44 }));
  const kids = Array.from({ length: 6 }, () => farmPlayer(lg, t, { age: MINORS_RETIRE_AGE - 3, ovr: 60 }));
  // A veteran whose rights the club holds goes the same way and leaves no dangling rights.
  const rights = farmPlayer(lg, t, { age: 44, yrs: 0 });
  t.prospects = t.prospects.filter((id) => id !== rights.id);
  t.rfaRights.push(rights.id);
  announceRetirements(lg);
  const gone = vets.filter((p) => !lg.players[p.id]);
  assert.ok(gone.length >= 9, `most 45-year-old AHL veterans retire (${gone.length} of 12)`);
  assert.ok(kids.every((p) => lg.players[p.id] && t.prospects.includes(p.id)), "developing players stay");
  for (const tm of lg.teams) for (const id of [...tm.roster, ...tm.prospects, ...tm.rfaRights]) assert.ok(lg.players[id], `${tm.abbr} holds no retired ids`);
  assert.ok(!lg.freeAgents.some((id) => !lg.players[id]), "the free-agent pool holds no retired ids");
});

