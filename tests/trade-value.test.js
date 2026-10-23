import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../src/engine/league.js";
import { evaluateTrade, assetValue, isContending } from "../src/engine/trade.js";
import { isGoalie } from "../src/engine/constants.js";

// The user's reported trades, rebuilt at the trade deadline (when sellers discount rentals).
const atDeadline = () => {
  const lg = L.createLeague({ userAbbr: "EDM", seed: 1 });
  lg.phase = "regular";
  lg.day = lg.deadlineDay - 3;
  return lg;
};
const byName = (lg, n) => Object.values(lg.players).find((p) => p.name === n);
// Hand a player to the user's club so he can be offered.
const toUser = (lg, p) => {
  const from = lg.teams[p.tid], u = lg.teams[lg.userTid];
  from.roster = from.roster.filter((x) => x !== p.id);
  from.prospects = from.prospects.filter((x) => x !== p.id);
  u.roster.push(p.id);
  p.tid = u.id;
  return p.id;
};
const offer = (lg, to, give, get, givePicks = []) => ({ from: lg.userTid, to, give, get, givePicks, getPicks: [] });
// RFA depth players rated 70-72, like the two the user sent for Karlsson.
const rfa71 = (lg, n, test = () => true) =>
  Object.values(lg.players).filter((p) => p.tid >= 0 && p.tid !== lg.userTid && p.ovr >= 70 && p.ovr <= 72 && p.age <= 25 && p.yrs <= 2 && lg.teams[p.tid].roster.includes(p.id) && test(p)).slice(0, n);

test("Erik Karlsson can't be had for two 71-rated RFAs", () => {
  const lg = atDeadline(), k = byName(lg, "Erik Karlsson");
  const give = rfa71(lg, 2, (p) => p.tid !== k.tid).map((p) => toUser(lg, p));
  assert.equal(give.length, 2);
  const ev = evaluateTrade(lg, offer(lg, k.tid, give, [k.id]));
  assert.equal(ev.accept, false);
  assert.ok(ev.ratio < 0.3, `ratio ${ev.ratio}`);
});

test("Ryan O'Reilly can't be had for Alexandre Carrier and a 71-rated youngster", () => {
  const lg = atDeadline(), r = byName(lg, "Ryan O'Reilly");
  const give = [toUser(lg, byName(lg, "Alexandre Carrier")), toUser(lg, byName(lg, "Dawson Lockhart"))];
  const ev = evaluateTrade(lg, offer(lg, r.tid, give, [r.id]));
  assert.equal(ev.accept, false);
  assert.ok(ev.ratio < 0.85, `ratio ${ev.ratio}`);
});

test("three depth players don't add up to a star", () => {
  const lg = atDeadline();
  const star = Object.values(lg.players).filter((p) => p.tid >= 0 && p.tid !== lg.userTid && !isGoalie(p.pos) && p.ovr >= 88 && p.age <= 30).sort((a, b) => b.ovr - a.ovr)[0];
  const depth = Object.values(lg.players).filter((p) => p.tid >= 0 && p.tid !== star.tid && !isGoalie(p.pos) && p.ovr >= 75 && p.ovr <= 77 && p.age >= 25 && p.age <= 29).slice(0, 3).map((p) => toUser(lg, p));
  const ev = evaluateTrade(lg, offer(lg, star.tid, depth, [star.id]));
  assert.equal(ev.accept, false);
  assert.ok(ev.ratio < 0.6, `ratio ${ev.ratio}`);
  // One star is worth far more than the three of them added up.
  const ai = lg.teams[star.tid];
  assert.ok(assetValue(lg, star.id, ai) > 2 * depth.reduce((s, id) => s + assetValue(lg, id, ai), 0));
});

test("players at replacement level carry no trade value", () => {
  const lg = atDeadline(), t = lg.teams[0];
  for (const p of rfa71(lg, 6, (p) => p.ovr <= 71)) assert.ok(assetValue(lg, p.id, t) <= 0.1, `${p.name} ${assetValue(lg, p.id, t)}`);
});

test("a seller takes a fair star trade: a good young player, a first and a prospect", () => {
  const lg = atDeadline();
  const sellers = lg.teams.filter((t) => t.id !== lg.userTid && !isContending(lg, t));
  const star = Object.values(lg.players).filter((p) => sellers.some((t) => t.id === p.tid) && lg.teams[p.tid].roster.includes(p.id) && !isGoalie(p.pos) && p.ovr >= 85 && p.ovr <= 87 && p.age >= 28 && p.age <= 31).sort((a, b) => a.ovr - b.ovr)[0];
  assert.ok(star);
  const young = Object.values(lg.players).filter((p) => p.tid >= 0 && p.tid !== star.tid && lg.teams[p.tid].roster.includes(p.id) && p.pos === star.pos && p.age <= 24 && p.ovr >= 78 && p.ovr <= 81 && p.pot <= 85).sort((a, b) => b.ovr - a.ovr)[0];
  const prospect = Object.values(lg.players).filter((p) => p.tid >= 0 && p.tid !== star.tid && lg.teams[p.tid].prospects.includes(p.id) && p.age <= 20 && p.pot >= 79 && p.pot <= 82)[0];
  const give = [toUser(lg, young), toUser(lg, prospect)];
  const first = lg.draftPicks.find((pk) => pk.owner === lg.userTid && pk.round === 1 && pk.year === lg.year + 1);
  const ev = evaluateTrade(lg, offer(lg, star.tid, give, [star.id], [first.id]));
  assert.ok(ev.ratio >= 1, `ratio ${ev.ratio} in ${ev.valIn} out ${ev.valOut}`);
  // Without the first and the prospect, the young player alone doesn't do it.
  const alone = evaluateTrade(lg, offer(lg, star.tid, [give[0]], [star.id]));
  assert.equal(alone.accept, false);
});
