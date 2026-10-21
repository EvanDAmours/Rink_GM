import test from "node:test";
import assert from "node:assert/strict";
import { createLeague } from "../src/engine/league.js";
import { createGame, simToEnd, applyResult } from "../src/engine/sim.js";
import { seed } from "../src/engine/rng.js";
import { gameLines, lineupIds } from "../src/engine/lines.js";
import { slotFit, slotRating, movePreview, movePosition, roleFit, slotRole, lineRoles, bestRoles } from "../src/engine/roles.js";
import { iceShares, setShare, shareFractions, gameUnits, setUnitSlot, matchLine, UNIT_KINDS } from "../src/engine/situations.js";
import { unitRates, specialTeamsTable, leagueUnitAverages } from "../src/engine/unitStats.js";
import { gamePlan } from "../src/engine/teamPlanning.js";
import { ES_SHARE, iceShare } from "../src/ui/linesView.js";

const base = createLeague({ userAbbr: "EDM", seed: 11 });
const fresh = () => structuredClone(base);
const skater = (over) => ({ id: "x", name: "Test Player", pos: "LW", shoots: "L", ovr: 80, attrs: Object.fromEntries(["spd", "acc", "agi", "wac", "wpw", "sac", "spw", "dek", "hey", "puc", "pas", "oaw", "daw", "stk", "blk", "bch", "str", "agr", "poi", "dsc", "fof", "fgt", "end"].map((k) => [k, 78])), ...over });

test("slot fit: natural spots are free, wing swaps follow the shot, F/D moves are costly", () => {
  const lw = skater({ pos: "LW", shoots: "L" });
  assert.equal(slotFit(lw, "LW"), 0);
  assert.equal(slotFit(lw, "RW"), -2, "a left shot on the right wing gives up two points");
  assert.equal(slotFit({ ...lw, shoots: "R" }, "RW"), 0, "a right shot moves to the right wing for free");
  assert.equal(slotFit(skater({ pos: "C" }), "LW"), -1);
  const goodDraws = skater({ pos: "LW", attrs: { ...lw.attrs, fof: 90 } }), badDraws = skater({ pos: "LW", attrs: { ...lw.attrs, fof: 50 } });
  assert.ok(slotFit(goodDraws, "C") > slotFit(badDraws, "C"), "faceoffs decide how much a winger loses at centre");
  const ld = skater({ pos: "LD", shoots: "L" });
  assert.equal(slotFit(ld, "RD"), -3);
  assert.equal(slotFit({ ...ld, shoots: "R" }, "RD"), 0);
  assert.ok(slotFit(lw, "LD") <= -6 && slotFit(ld, "C") <= -8, "playing out of the forward/defence group costs at least six");
  assert.equal(slotRating(lw, "LD"), lw.ovr + slotFit(lw, "LD"));
});

test("Move to re-rates a skater and moving him back restores his rating exactly", () => {
  const l = fresh(), t = l.teams[l.userTid];
  const p = t.roster.map((id) => l.players[id]).find((x) => x.pos === "LW");
  const ovr = p.ovr, off = p.ovrOffset || 0;
  const pv = movePreview(p, "LD");
  assert.ok(pv.ovr < ovr, "a winger on defence rates lower");
  assert.ok(movePosition(l, p.id, "LD").ok);
  assert.equal(p.pos, "LD"); assert.equal(p.ovr, pv.ovr); assert.equal(p.ovrOffset, off + pv.shift);
  assert.equal(movePreview(p, "LW").back, true);
  assert.ok(movePosition(l, p.id, "RD").ok, "a second move goes from where he came from");
  assert.ok(movePosition(l, p.id, "LW").ok);
  assert.equal(p.pos, "LW"); assert.equal(p.ovr, ovr); assert.equal(p.ovrOffset || 0, off); assert.equal(p.posFrom, undefined);
  const g = t.roster.map((id) => l.players[id]).find((x) => x.pos === "G");
  assert.equal(movePosition(l, g.id, "C").ok, false, "goalies don't move");
});

test("McDavid keeps his published 99 at centre", () => {
  const l = fresh();
  const mcd = Object.values(l.players).find((p) => p.name === "Connor McDavid");
  assert.equal(mcd.ovr, 99); assert.equal(slotRating(mcd, "C"), 99);
});

test("roles: every slot asks for a role and players rate higher in roles built for them", () => {
  const l = fresh(), t = l.teams[l.userTid];
  const R = lineRoles(t);
  assert.deepEqual(R.F, ["scoring", "twoway", "checking", "energy"]);
  assert.equal(slotRole(t, "F", 0, 0), "SNIPER"); assert.equal(slotRole(t, "D", 0, 0), "SHUTD");
  t.lineRoles = { F: ["checking", "scoring", "twoway", "energy"], D: R.D };
  assert.equal(slotRole(t, "F", 0, 1), "SHUTC");
  const shooter = skater({ attrs: { ...skater().attrs, wac: 95, wpw: 95, sac: 95, spw: 95, daw: 60, stk: 60 } });
  assert.ok(roleFit(shooter, "SNIPER") > roleFit(shooter, "CHECK"));
  assert.equal(bestRoles(shooter, 1)[0].role, "SNIPER");
});

test("ice-time sliders keep every group at 100% and feed the sim", () => {
  const l = fresh(), t = l.teams[l.userTid];
  assert.deepEqual(ES_SHARE.F, [0.32, 0.28, 0.23, 0.17], "the default rotation matches sim.js");
  assert.deepEqual(iceShares(t).F, [32, 28, 23, 17]);
  setShare(t, "F", 0, 40);
  const F = iceShares(t).F;
  assert.equal(F[0], 40); assert.equal(F.reduce((a, b) => a + b, 0), 100);
  assert.ok(F[1] > F[2] && F[2] > F[3], "the other lines keep their order");
  assert.equal(iceShare("F", 0, t), 40);
  t.identity = "skill"; delete t.iceShares;
  assert.equal(iceShares(t).F[0], 35, "an identity sets the defaults");
  setShare(t, "F", 0, 45);
  seed(5);
  const s = createGame(l, t, l.teams[(t.id + 1) % l.teams.length]);
  assert.deepEqual(s.h.shares.F, shareFractions(t, "F"));
  simToEnd(s);
  const toi = s.h.fToi, total = toi.reduce((a, b) => a + b, 0);
  assert.ok(toi[0] / total > 0.36, `line 1 played ${(toi[0] / total).toFixed(2)} of even strength`);
});

test("situational units: staff picks fill every spot, your picks stay, the sim uses them", () => {
  const l = fresh(), t = l.teams[l.userTid];
  const g = gameLines(l, t), dressed = [...g.F.flat(), ...g.D.flat()];
  const U = gameUnits(l, t, dressed);
  for (const [k, K] of Object.entries(UNIT_KINDS)) {
    assert.equal(U[k].length, K.size, k);
    assert.equal(new Set(U[k]).size, K.size, `${k} has no duplicates`);
    assert.ok(U[k].every((id) => dressed.includes(id)), `${k} is drawn from the dressed skaters`);
  }
  assert.ok(l.players[U.OT[2]].pos.endsWith("D"), "the overtime trio has a defenceman");
  const last = dressed.map((id) => l.players[id]).filter((p) => !p.pos.endsWith("D")).sort((a, b) => a.ovr - b.ovr)[0];
  setUnitSlot(t, "SO", 0, last.id);
  assert.equal(gameUnits(l, t, dressed).SO[0], last.id, "your first shooter goes first");
  seed(9);
  const s = createGame(l, t, l.teams[(t.id + 3) % l.teams.length]);
  assert.equal(s.h.units.SO[0], last.id);
  simToEnd(s);
  if (s.so) assert.equal(s.so.hShooters[0], last.id, "the shootout follows your order");
});

test("line matching is off by default, on for a Defensive identity, and points at the checking line", () => {
  const l = fresh(), t = l.teams[l.userTid];
  assert.equal(matchLine(t), -1);
  t.identity = "defensive"; assert.equal(matchLine(t), 2);
  t.lineMatch = false; assert.equal(matchLine(t), -1);
  t.lineMatch = true; t.lineRoles = { F: ["scoring", "checking", "twoway", "energy"] }; assert.equal(matchLine(t), 1);
  t.identity = "heavy"; t.autoPlan = true;
  const plan = gamePlan(l, t, l.teams[(t.id + 1) % l.teams.length]);
  assert.equal(plan.forecheck, "aggressive"); assert.equal(plan.attack, "shoot");
});

test("season unit stats, PP/PK tables and the plan usage report build from applied games", () => {
  const l = fresh();
  l.settings.injuries = false;
  const t = l.teams[l.userTid];
  for (let i = 0; i < 6; i++) {
    seed(100 + i);
    const s = createGame(l, l.teams[i], l.teams[i + 6]);
    simToEnd(s); applyResult(l, s);
  }
  seed(200);
  const s = createGame(l, t, l.teams[(t.id + 7) % l.teams.length]);
  simToEnd(s); applyResult(l, s);
  const S = t.unitSeason;
  assert.equal(S.year, l.year); assert.equal(S.gp, 1);
  const secs = Object.values(S.units).reduce((n, u) => n + u.sec, 0);
  assert.ok(secs >= 3500, "every second of the game is in some unit");
  assert.ok(unitRates(S.units["Line 1"]).min > 5);
  const goals = Object.entries(S.units).reduce((n, [, u]) => n + u.gf, 0);
  assert.ok(goals <= s.score[s.h.tid === t.id ? "h" : "a"], "unit goals never exceed the club's goals");
  const row = specialTeamsTable(l).find((r) => r.tid === t.id);
  assert.equal(row.ppOpp, s.special[s.h.tid === t.id ? "h" : "a"].opportunities);
  assert.ok(leagueUnitAverages(l).units["Line 1"]);
  assert.ok(t.tacticLog && t.tacticLog.opp != null, "the plan card has last game's usage");
  assert.ok(t.tacticLog.dumpIns >= 0 && t.tacticLog.dumpIns <= 100);
  assert.ok(Object.values(t.tacticLog.units).some((v) => v > 0) || !s.endedIn, "overtime puts the OT trio on");
});

test("old saves without the new fields still play", () => {
  const l = fresh(), t = l.teams[l.userTid];
  for (const k of ["iceShares", "units", "lineMatch", "identity", "lineRoles", "unitSeason", "tacticLog"]) delete t[k];
  seed(3);
  const s = createGame(l, t, l.teams[(t.id + 2) % l.teams.length]);
  simToEnd(s);
  assert.equal(s.phase, "final");
  assert.ok(lineupIds(t.lines).length >= 20);
});
