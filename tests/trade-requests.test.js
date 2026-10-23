import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../src/engine/league.js";
import { tradeRequests, talkDown, shopPlayer, shoppedOffers, playerTrust, TALK_COST } from "../src/engine/tradeRequests.js";
import { userOffers, acceptOffer, onBlock } from "../src/engine/market.js";
import { evaluateTrade } from "../src/engine/trade.js";
import { isGoalie } from "../src/engine/constants.js";
import { staffGaps, staffGapText, fireCoach } from "../src/engine/franchise.js";

const league = () => L.createLeague({ userAbbr: "EDM", seed: 77 });
// A good forward who isn't the captain: the kind of player a club calls about.
const requester = (lg) => {
  const t = lg.teams[lg.userTid];
  return t.roster.map((id) => lg.players[id]).filter((p) => !isGoalie(p.pos) && p.ovr < 90).sort((a, b) => b.ovr - a.ovr)[2];
};

test("a trade request shows his trust; talking him down is free and settles it", () => {
  const lg = league(), t = lg.teams[lg.userTid], p = requester(lg);
  p.wantsTrade = true;
  p.relationship = { trust: 31, reason: "Playing time below the agreed role" };
  lg.block.push({ pid: p.id, tid: t.id, reason: "Requested a trade", day: 0, year: lg.year });
  const list = tradeRequests(lg);
  assert.equal(list.length, 1);
  assert.equal(list[0].p.id, p.id);
  assert.equal(list[0].trust, 31);
  // Scouting points are gone (batch x2): a talk costs nothing.
  assert.equal(TALK_COST, 0);
  const r = talkDown(lg, p.id);
  assert.ok(r.ok, r.msg);
  assert.equal(playerTrust(p), 51);
  assert.equal(p.wantsTrade, false);
  assert.equal(onBlock(lg, p.id), false, "off the block he only joined to ask out");
  assert.equal(tradeRequests(lg).length, 0);
  assert.equal(talkDown(lg, p.id).ok, false, "nothing left to settle");
  // A role promise's trust moves with it, so the weekly review doesn't undo the talk.
  const q = requester(lg);
  q.wantsTrade = true;
  q.rolePromise = { tid: t.id, role: "topSix", trust: 90, misses: 0, status: "unhappy" };
  talkDown(lg, q.id);
  assert.equal(q.rolePromise.trust, 100);
});

test("shopping a player brings back a real offer the trade AI would make", () => {
  const lg = league(), t = lg.teams[lg.userTid], p = requester(lg);
  p.wantsTrade = true;
  const r = shopPlayer(lg, p.id);
  assert.ok(r.ok, r.msg);
  const o = r.offer;
  assert.deepEqual(o.give, [p.id]);
  assert.ok(o.get.length + o.getPicks.length > 0, "something comes back");
  assert.ok(userOffers(lg).some((x) => x.id === o.id), "the offer waits on the Trade Block");
  assert.deepEqual(shoppedOffers(lg).map((x) => x.id), [o.id]);
  assert.ok(evaluateTrade(lg, { from: t.id, to: o.tid, give: o.give, givePicks: [], get: o.get, getPicks: o.getPicks }).accept, "the club would accept its own offer");
  assert.equal(p.wantsTrade, false, "shopping him settles the request");
  assert.ok(onBlock(lg, p.id));
  assert.ok(lg.inbox.at(-1).text.includes(p.name) && lg.inbox.at(-1).open?.tab === "block");
  // Asking again returns the same open offer instead of a second one.
  const again = shopPlayer(lg, p.id);
  assert.equal(again.offer.id, o.id);
  assert.equal(userOffers(lg).filter((x) => x.give.includes(p.id)).length, 1);
  // The deal goes through.
  const done = acceptOffer(lg, o.id);
  assert.ok(done.ok, done.msg);
  assert.equal(lg.players[p.id].tid, o.tid);
  assert.ok(o.get.every((id) => lg.players[id].tid === t.id));
});

test("no shopping while trading is closed", () => {
  const lg = league(), p = requester(lg);
  p.wantsTrade = true;
  lg.phase = "playoffs";
  const r = shopPlayer(lg, p.id);
  assert.equal(r.ok, false);
  assert.match(r.msg, /playoffs/);
  assert.equal(p.wantsTrade, true, "the request still stands");
});

test("an interim head coach is a staff gap until you hire", () => {
  const lg = league(), t = lg.teams[lg.userTid];
  assert.deepEqual(staffGaps(t), []);
  assert.equal(staffGapText(t), null);
  assert.ok(fireCoach(lg).ok);
  assert.deepEqual(staffGaps(t), ["head coach"]);
  assert.match(staffGapText(t).head, /head coach/);
  assert.match(staffGapText(t).text, /interim/);
  delete t.staff.goalie;
  assert.deepEqual(staffGaps(t), ["head coach", "goalie coach"]);
});
