// Free Agent Frenzy: July 1 on a live clock (noon to midnight ET), AI bidding by plan, your
// chance to beat a rival offer, and an audit of the market across three leagues.
import test from "node:test";
import assert from "node:assert/strict";
import * as L from "../src/engine/league.js";
import { startResign, endResign, simFADay, faAsk } from "../src/engine/offseason.js";
import { startFrenzy, frenzyTick, runFrenzy, frenzyPending, openCalls, answerCall, beatPrice, frenzyBoard, frenzyBuyers, FRENZY_START, FRENZY_END } from "../src/engine/frenzy.js";
import { negotiate } from "../src/engine/negotiations.js";
import { clubPlan } from "../src/engine/faMarket.js";
import { capSpace, counts } from "../src/engine/roster.js";
import { contractCount } from "../src/engine/hockeyRules.js";
import { FA_DAYS } from "../src/engine/constants.js";

function july(seed) {
  const lg = L.createLeague({ userAbbr: "EDM", seed });
  startResign(lg); endResign(lg);
  return lg;
}

test("the frenzy opens at noon, runs to midnight, and the feed reports signings and rumours", () => {
  const lg = july(81);
  assert.ok(frenzyPending(lg));
  startFrenzy(lg);
  assert.equal(lg.frenzy.minute, FRENZY_START);
  frenzyTick(lg, 60);
  assert.equal(lg.frenzy.minute, FRENZY_START + 60);
  runFrenzy(lg);
  const f = lg.frenzy;
  assert.equal(f.done, true);
  assert.equal(f.minute, FRENZY_END);
  assert.ok(f.deals.length >= 15, `signings ${f.deals.length}`);
  assert.ok(f.feed.some((x) => x.kind === "sign") && f.feed.some((x) => x.kind === "rumor"));
  assert.match(f.feed[0].text, /^Midnight/);
  assert.equal(frenzyPending(lg), false);
  // Next day carries on from day 1 without replaying July 1.
  const n = f.deals.length;
  simFADay(lg);
  assert.equal(lg.fa.day, 1);
  assert.equal(lg.frenzy.deals.length, n);
  // The frenzy survives a save and reload.
  const copy = L.deserializeLeague(L.serializeLeague(lg));
  assert.equal(copy.frenzy.done, true);
});

test("a rival tops your offer: his agent calls, and beating it wins him", () => {
  const lg = july(82);
  const t = lg.teams[lg.userTid];
  t.roster.forEach((id) => { lg.players[id].cap = 1; delete lg.players[id].salarySchedule; });
  while (counts(lg, t).active >= 21) t.prospects.push(t.roster.pop());
  startFrenzy(lg);
  const n = Object.values(lg.negotiations).find((x) => x.status === "pending" && x.decideMin && x.bids.length && lg.players[x.pid].ovr >= 80);
  const p = lg.players[n.pid];
  const ask = faAsk(lg, p, n.bids[0].yrs);
  const r0 = negotiate(lg, p.id, Math.round(ask.aav * 1.07 * 100) / 100, n.bids[0].yrs); assert.ok(r0.ok, r0.msg);
  // A rival well above us.
  const rival = n.bids.find((b) => b.ai);
  rival.aav = Math.round(ask.aav * 1.18 * 100) / 100;
  while (!openCalls(lg).some((c) => c.pid === p.id) && p.tid === -1 && !lg.frenzy.done) frenzyTick(lg, 10);
  const call = openCalls(lg).find((c) => c.pid === p.id);
  assert.ok(call, "his agent calls before he signs");
  const price = beatPrice(lg, p.id);
  assert.ok(price.aav >= rival.aav * 0.9);
  assert.ok(answerCall(lg, call.id, "beat").ok);
  // Rivals may come back over the top: each time, his agent calls again and you beat it again.
  while (p.tid === -1 && !lg.frenzy.done) {
    frenzyTick(lg, 10);
    for (const c of openCalls(lg).filter((x) => x.pid === p.id)) answerCall(lg, c.id, "beat");
  }
  assert.equal(p.tid, lg.userTid, "beating the offer signs him with you");
});

test("board and buyers: ask, interest, suitors; clubs labelled by plan", () => {
  const lg = july(83);
  startFrenzy(lg);
  const rows = frenzyBoard(lg);
  assert.ok(rows.length > 20);
  assert.ok(rows.every((r) => r.ask.aav > 0 && ["High", "Medium", "Low"].includes(r.interest)));
  assert.ok(rows.some((r) => r.suitors.length >= 2));
  const plans = new Set(lg.teams.map((t) => clubPlan(lg, t)));
  assert.deepEqual([...plans].sort(), ["contend", "middle", "rebuild"]);
  assert.equal(frenzyBuyers(lg).length, 10);
});

test("audit, three leagues: stars sign on July 1 at market prices; contenders go short on vets, rebuilders long on youth; no cap or contract violations", () => {
  for (const seed of [71, 72, 73]) {
    const lg = july(seed);
    const top = lg.freeAgents.map((id) => lg.players[id]).filter((p) => p && p.tid === -1).sort((a, b) => b.ovr - a.ovr).slice(0, 20);
    const asks = Object.fromEntries(top.map((p) => [p.id, faAsk(lg, p).aav]));
    simFADay(lg);
    const day1 = top.filter((p) => p.tid >= 0).length;
    assert.ok(day1 >= 14, `seed ${seed}: ${day1}/20 of the top 20 signed on July 1`);
    for (let d = 1; d < FA_DAYS; d++) simFADay(lg);
    for (const p of top.filter((x) => x.tid >= 0)) {
      const r = p.cap / asks[p.id];
      assert.ok(r >= 0.85 && r <= 1.35, `seed ${seed}: ${p.name} at ${r.toFixed(2)} of his ask`);
    }
    for (const t of lg.teams) {
      assert.ok(capSpace(lg, t) >= -0.01, `${t.abbr} over the cap`);
      assert.ok(contractCount(lg, t) <= 50, `${t.abbr} over 50 contracts`);
    }
    const deals = lg.frenzy.deals.filter((d) => d.tid !== lg.userTid);
    const yrs = (f) => { const x = deals.filter(f); return x.reduce((s, d) => s + d.yrs, 0) / Math.max(1, x.length); };
    const oldC = yrs((d) => d.age >= 30 && clubPlan(lg, lg.teams[d.tid]) === "contend");
    const youngR = yrs((d) => d.age <= 27 && clubPlan(lg, lg.teams[d.tid]) === "rebuild");
    if (deals.some((d) => d.age <= 27 && clubPlan(lg, lg.teams[d.tid]) === "rebuild")) assert.ok(youngR >= oldC, `seed ${seed}: rebuilders' young term ${youngR} vs contenders' vets ${oldC}`);
  }
});
