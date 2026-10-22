import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../src/engine/league.js";
import * as M from "../src/engine/market.js";
import { counts, capSpace } from "../src/engine/roster.js";
import { MAX_ROSTER } from "../src/engine/constants.js";
import { tradingClosed } from "../src/engine/trade.js";

// One league simmed to the deadline, shared by the checks below (it's the slow part).
const lg = L.createLeague({ userAbbr: "TOR", seed: 9 });
L.startRegularSeason(lg);
let preCalls = 0;
while (!M.deadlinePending(lg)) {
  L.simDay(lg);
  preCalls = Math.max(preCalls, (lg.offers || []).filter((o) => o.unsolicited).length);
}
const seasonOffers = (lg.wire || []).filter((w) => w.kind === "offer").length;
M.startDeadline(lg);
const seen = new Map();
while (!lg.deadline.done) {
  M.deadlineTick(lg, 60);
  for (const o of M.userOffers(lg)) seen.set(o.id, o);
}
const deals = lg.deadline.deals || [];

test("deadline day runs 9:00 AM to 3:00 PM ET with an NHL-like number of trades", () => {
  assert.equal(M.DEADLINE_START, 9 * 60);
  assert.equal(lg.deadline.minute, M.DEADLINE_END);
  assert.ok(lg.deadline.trades >= 12 && lg.deadline.trades <= 32, `deadline trades: ${lg.deadline.trades}`);
  assert.equal(deals.length, lg.deadline.trades, "every deal is recorded");
  assert.ok(tradingClosed(lg));
});

test("AI deals stay within cap and roster limits and are never lopsided", () => {
  for (const t of lg.teams) {
    if (t.id === lg.userTid) continue;
    assert.ok(counts(lg, t).active <= MAX_ROSTER, `${t.abbr} roster ${counts(lg, t).active}`);
    assert.ok(capSpace(lg, t) >= -0.01, `${t.abbr} cap ${capSpace(lg, t)}`);
  }
  for (const d of deals) assert.ok(d.ratio >= 0.8 && d.ratio <= 1.45, `${d.name}: value ratio ${d.ratio}`);
  // Contenders buy rentals: most deadline deals move a veteran on an expiring deal.
  assert.ok(deals.filter((d) => d.rental).length >= deals.length / 2, "mostly rentals");
});

test("AI clubs phone the user with fair-ish, expiring offers", () => {
  const offers = [...seen.values()];
  assert.ok(offers.length >= 2, `offers received: ${offers.length}`);
  assert.ok(seasonOffers >= 1 || preCalls >= 1, "clubs also call during the season");
  for (const o of offers) {
    assert.ok(o.expMin != null ? o.expMin <= M.DEADLINE_END : o.expDay != null, "offers expire");
    assert.ok(o.fair >= 0.6 && o.fair <= 1.8, `fairness ${o.fair}`);
    assert.ok(M.fairLabel(o.fair));
  }
  assert.ok(lg.deadline.feed.some((f) => f.kind === "mine" || f.kind === "offer"), "phone events reach the feed");
});

test("accepting a seller's call is legal and moves the player to you", () => {
  const l2 = L.createLeague({ userAbbr: "EDM", seed: 3 });
  L.startRegularSeason(l2);
  while (!M.deadlinePending(l2)) L.simDay(l2);
  M.startDeadline(l2);
  let o = null;
  for (let i = 0; i < 40 && !o; i++) o = M.pitchUser(l2, { expMin: l2.deadline.minute + 60 });
  assert.ok(o, "a club called");
  const r = M.acceptOffer(l2, o.id);
  assert.ok(r.ok, r.msg);
  for (const id of o.get) assert.equal(l2.players[id].tid, l2.userTid);
  const ai = l2.teams[o.tid];
  assert.ok(capSpace(l2, ai) >= -0.01 && counts(l2, ai).active <= MAX_ROSTER);
  // The trade block shows seller context and an asking price.
  const board = M.deadlineBoard(l2);
  assert.ok(board.length > 10);
  assert.ok(board.every((b) => /^asking /.test(b.asking) && b.why));
});
