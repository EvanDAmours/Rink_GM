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
import { endResign } from "../src/engine/offseason.js";
import { ensureMinimums, counts, capSpace } from "../src/engine/roster.js";
import { isFranchiseGoalie } from "../src/engine/trade.js";
import { blockCandidates } from "../src/engine/market.js";
import { minSalaryForYear, isGoalie } from "../src/engine/constants.js";
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

// Leave one healthy goalie, with nobody to call up from the farm.
function oneGoalie(lg, t) {
  const gs = t.roster.map((id) => lg.players[id]).filter((p) => isGoalie(p.pos));
  gs.slice(1).forEach((g) => { g.injury = 30; });
  gs[0].injury = 0;
  t.prospects = t.prospects.filter((id) => !isGoalie(lg.players[id].pos));
}
function starFA(lg, ovr = 80) {
  const p = generatePlayer("G", ovr, 28, lg.year);
  p.tid = -1; p.signed = true;
  lg.players[p.id] = p;
  lg.freeAgents.push(p.id);
  return p;
}

test("your club is never handed a free agent: farm call-ups first, then a league-minimum depth deal", () => {
  const lg = league();
  const t = lg.teams[lg.userTid];
  oneGoalie(lg, t);
  const fa = starFA(lg, 80);
  const inboxBefore = lg.inbox.length;
  ensureMinimums(lg, t, { notify: true });
  assert.equal(fa.tid, -1, "the best free agent is still on the market");
  assert.ok(counts(lg, t, { healthyOnly: true }).G >= 2, "the club can dress two goalies");
  const added = t.roster.map((id) => lg.players[id]).find((p) => isGoalie(p.pos) && p.emergencyCallUp === lg.year);
  assert.ok(added, "an emergency depth goalie joined");
  assert.equal(added.cap, minSalaryForYear(lg.year));
  assert.equal(added.yrs, 1);
  assert.ok(lg.inbox.slice(inboxBefore).some((m) => /Emergency depth signing/.test(m.text) && m.text.includes(added.name)), "you are told about it");

  // With a healthy goalie on the farm, he comes up instead.
  const lg2 = league();
  const t2 = lg2.teams[lg2.userTid];
  oneGoalie(lg2, t2);
  const farm = createPlayer({ name: "Farm Goalie", pos: "G", ovr: 70, age: 23, tid: t2.id, yrs: 2, cap: 0.85 }, lg2.year);
  farm.signed = true; lg2.players[farm.id] = farm; t2.prospects.push(farm.id);
  const fa2 = starFA(lg2, 80);
  ensureMinimums(lg2, t2, { notify: true });
  assert.ok(t2.roster.includes(farm.id), "the farm goalie is called up");
  assert.equal(fa2.tid, -1);
});

test("AI clubs still sign the best affordable free agent in an emergency", () => {
  const lg = league();
  const t = lg.teams.find((x) => x.id !== lg.userTid && capSpace(lg, x) > 3);
  assert.ok(t, "an AI club with cap room");
  oneGoalie(lg, t);
  starFA(lg, 76);
  const best = lg.freeAgents.map((id) => lg.players[id]).filter((p) => isGoalie(p.pos) && p.injury <= 0).sort((a, b) => b.ovr - a.ovr).find((p) => marketValue(p, lg.year) <= Math.max(1, capSpace(lg, t)));
  assert.ok(best);
  ensureMinimums(lg, t);
  assert.equal(best.tid, t.id, "the best affordable free-agent goalie signs");
  assert.ok(!t.roster.some((id) => lg.players[id].emergencyCallUp === lg.year && isGoalie(lg.players[id].pos)));
});

test("AI clubs build around a young starting goalie", () => {
  const lg = league();
  const t = lg.teams.find((x) => x.id !== lg.userTid);
  const goalies = t.roster.map((id) => lg.players[id]).filter((p) => isGoalie(p.pos)).sort((a, b) => b.ovr - a.ovr);
  const g = goalies[0];
  g.age = 24; g.ovr = Math.max(g.ovr, 82); g.wantsTrade = false;
  assert.equal(isFranchiseGoalie(lg, t, g), true);
  assert.equal(isFranchiseGoalie(lg, t, goalies[1]), false, "only the starter");
  // A cap crunch would otherwise put an 82-rated goalie on a $6M deal up for sale.
  g.cap = 6.5; g.yrs = 3;
  t.deadCap.push({ name: "test", amt: 40, yrs: 1 });
  assert.ok(!blockCandidates(lg, t, true).some((c) => c.p.id === g.id), "never shopped");
  g.wantsTrade = true;
  assert.ok(blockCandidates(lg, t, true).some((c) => c.p.id === g.id), "unless he asks out");
  g.wantsTrade = false;
  t.deadCap.pop();

  // His deal is up: the club keeps him whenever it can fit him (a UFA, so no qualifying-offer safety net).
  let kept = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const l = league("EDM", 100 + seed);
    const club = l.teams.find((x) => x.id !== l.userTid && x.abbr !== "EDM");
    const s = club.roster.map((id) => l.players[id]).filter((p) => isGoalie(p.pos)).sort((a, b) => b.ovr - a.ovr)[0];
    s.age = 26; s.ovr = Math.max(s.ovr, 84); s.service = { firstAge: 19, years: 8, priorGames: 300 };
    l.phase = "resign"; s.yrs = 0; s.prevCap = s.cap; s.cap = 0;
    club.deadCap = [];
    if (capSpace(l, club) < 12) continue;
    endResign(l);
    if (s.tid === club.id && s.yrs > 0) kept++;
    else assert.fail(`${club.abbr} let its young starter walk`);
  }
  assert.ok(kept >= 3, `kept in every case checked (${kept})`);
});

