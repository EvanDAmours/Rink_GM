// Real league business: AHL veterans retire, first-season rookies are the real Calder class,
// your club is never handed a free agent, AI clubs keep a young starting goalie, EA abilities
// count a little in trades, and free-agent bidding keeps your offer on the table.
import test from "node:test";
import assert from "node:assert/strict";
import * as L from "../src/engine/league.js";
import { createPlayer, generatePlayer, marketValue } from "../src/engine/players.js";
import { announceRetirements, MINORS_RETIRE_AGE } from "../src/engine/offseason.js";
import { calderEligible } from "../src/engine/offseason.js";
import { CALDER_ROOKIES_2026 } from "../src/data/calderRookies2026.js";
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

test("first-season rookies are the real 2026-27 Calder class", () => {
  const lg = league();
  for (const name of ["Macklin Celebrini", "Matthew Schaefer", "Beckett Sennecke", "Ivan Demidov", "Ben Kindel", "Connor Bedard"]) {
    const p = byName(lg, name);
    assert.ok(p, name);
    assert.equal(p.rookie, false, `${name} already used his rookie season`);
    assert.equal(p.calderIneligible, true);
  }
  for (const name of ["Gavin McKenna", "Porter Martone", "Ivar Stenberg", "Cole Hutson", "Brad Lambert", "Joel Blomqvist", "Michael Hage"]) {
    assert.equal(byName(lg, name)?.rookie, true, `${name} is Calder-eligible`);
  }
  const real = Object.values(lg.players).filter((p) => ["ea27", "est"].includes(p.src));
  assert.equal(real.filter((p) => p.rookie).length, CALDER_ROOKIES_2026.length, "every listed rookie is on a roster, nobody else is flagged");
});

test("the Calder rule carries into later seasons", () => {
  const p = { age: 22, career: [] };
  assert.equal(calderEligible(p), true);
  assert.equal(calderEligible({ ...p, career: [{ s: { gp: 25 } }] }), true, "25 games is still a rookie");
  assert.equal(calderEligible({ ...p, career: [{ s: { gp: 26 } }] }), false);
  assert.equal(calderEligible({ ...p, career: [{ s: { gp: 6 } }, { s: { gp: 7 } }] }), false, "six or more in two seasons");
  assert.equal(calderEligible({ ...p, career: [{ s: { gp: 5 } }, { s: { gp: 12 } }] }), true);
  assert.equal(calderEligible({ ...p, age: 26 }), false, "26 is too old");
  assert.equal(calderEligible({ ...p, calderIneligible: true }), false, "an established real player stays a veteran");
});

test("old first-season saves get the real rookie flags; later seasons are left alone", () => {
  const lg = league();
  // An old save: rookies were everyone 20 or younger, with no Calder list.
  delete lg.calderVersion;
  for (const p of Object.values(lg.players)) if (["ea27", "est"].includes(p.src)) { p.rookie = p.age <= 20; delete p.calderIneligible; }
  const restored = L.deserializeLeague(L.serializeLeague(lg));
  assert.equal(byName(restored, "Macklin Celebrini").rookie, false);
  assert.equal(byName(restored, "Matthew Schaefer").rookie, false);
  assert.equal(byName(restored, "Porter Martone").rookie, true);
  assert.equal(byName(restored, "Brad Lambert").rookie, true, "older true rookies are picked up");
  assert.equal(restored.calderVersion, 1);

  const later = league();
  later.year = later.startYear + 1;
  delete later.calderVersion;
  const celebrini = byName(later, "Macklin Celebrini");
  celebrini.rookie = true; delete celebrini.calderIneligible;
  const again = L.deserializeLeague(L.serializeLeague(later));
  assert.equal(byName(again, "Macklin Celebrini").rookie, true, "a later season is not touched");
});

