import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../src/engine/league.js";
import { evaluateTrade, isContending, assetValue, pickValue, projectedPickSlot } from "../src/engine/trade.js";
import { isGoalie, isDefense } from "../src/engine/constants.js";

// The trade market, calibrated to real NHL deals (deadline and in-season, 2023-2025).
// Each deal is rebuilt in a league: the traded player gets his rating, age, contract and
// rental status from the time of the deal, the buyer is a contender, the seller is in the
// same state as the real one, picks come from the buyer by round, and prospects are
// approximated by age and potential. The real price must go through; a clearly smaller
// offer (the key piece taken out) must not. Ratings use the game's scale (a 72 is
// replacement level). Conditional picks are treated as the pick itself.
//
// Sources (returns checked against NHL.com / TSN / Daily Faceoff trade reports):
//  Rantanen  (Jan 2025, COL->CAR): Martin Necas, Jack Drury, 2025 2nd, 2026 4th.
//  B. Nelson (Mar 2025, NYI->COL): Calum Ritchie, William Dufour, 2026 1st, 2027 3rd.
//  Carlo     (Mar 2025, BOS->TOR): Fraser Minten, 2025 1st.
//  Guentzel  (Mar 2024, PIT->CAR): Michael Bunting, Ville Koivunen, Vasily Ponomarev, Cruz Lucas, 2024 1st, 2024 5th.
//  Lindholm  (Jan 2024, CGY->VAN): Andrei Kuzmenko, Hunter Brzustewicz, Joni Jurmo, 2024 1st, 2024 4th.
//  Hanifin   (Mar 2024, CGY->VGK): Daniil Miromanov, 2025 1st, 2026 3rd.
//  Tanev     (Feb 2024, CGY->DAL): Artem Grushnikov, 2024 2nd, 2026 3rd.
//  Tarasenko (Feb 2023, STL->NYR, 50% retained): Sammy Blais, Hunter Skinner, 2023 1st, 2024 4th.
//  Meier     (Feb 2023, SJ->NJ): Fabian Zetterlund, Shakir Mukhamadullin, Andreas Johnsson, Nikita Okhotiuk, Santeri Hatakka, 2023 1st, 2024 2nd.
//  Kane      (Feb 2023, CHI->NYR, 50% retained): 2023 2nd, 2025 4th.

const F = "F", D = "D";
const DEALS = [
  { name: "Mikko Rantanen", days: 45, seller: "contending", pos: F, ovr: 94, age: 28, yrs: 1, cap: 9.25,
    back: [{ pos: F, ovr: 90, age: 25, yrs: 2, cap: 6.5 }, { pos: F, ovr: 76, age: 24, yrs: 2, cap: 1.7 }], picks: [2, "next", 4],
    smaller: { drop: "player0" } },
  { name: "Brock Nelson", days: 1, seller: "seller", pos: F, ovr: 87, age: 33, yrs: 1, cap: 6,
    back: [{ prospect: true, pos: F, ovr: 69, pot: 80, age: 20 }, { prospect: true, pos: F, ovr: 68, pot: 74, age: 22 }], picks: ["next", 1, 3],
    smaller: { drop: "pick1" } },
  { name: "Brandon Carlo", days: 1, seller: "seller", pos: D, ovr: 81, age: 28, yrs: 3, cap: 4.1,
    back: [{ pos: F, ovr: 72, pot: 80, age: 20, yrs: 3, cap: 0.95 }], picks: [1],
    smaller: { drop: "pick1" } },
  { name: "Jake Guentzel", days: 1, seller: "seller", pos: F, ovr: 89, age: 29, yrs: 1, cap: 6,
    back: [{ pos: F, ovr: 79, age: 28, yrs: 3, cap: 4.5 }, { prospect: true, pos: F, ovr: 68, pot: 80, age: 20 }, { prospect: true, pos: F, ovr: 66, pot: 76, age: 21 }, { prospect: true, pos: F, ovr: 60, pot: 72, age: 19 }], picks: [1, 5],
    smaller: { drop: "pick1" } },
  { name: "Elias Lindholm", days: 35, seller: "seller", pos: F, ovr: 86, age: 29, yrs: 1, cap: 4.85,
    back: [{ pos: F, ovr: 79, age: 27, yrs: 1, cap: 5.5 }, { prospect: true, pos: D, ovr: 64, pot: 78, age: 19 }, { prospect: true, pos: D, ovr: 66, pot: 75, age: 21 }], picks: [1, 4],
    smaller: { drop: "pick1" } },
  { name: "Noah Hanifin", days: 1, seller: "seller", pos: D, ovr: 86, age: 27, yrs: 1, cap: 4.95,
    back: [{ pos: D, ovr: 73, age: 26, yrs: 1, cap: 0.76 }], picks: ["next", 1, 3],
    smaller: { drop: "pick1" } },
  { name: "Chris Tanev", days: 8, seller: "seller", pos: D, ovr: 84, age: 34, yrs: 1, cap: 4.5,
    back: [{ prospect: true, pos: D, ovr: 64, pot: 74, age: 21 }], picks: [2, "next", 3],
    smaller: { drop: "pick2" } },
  { name: "Vladimir Tarasenko", days: 6, seller: "seller", pos: F, ovr: 87, age: 31, yrs: 1, cap: 7.5, retain: 0.5,
    back: [{ pos: F, ovr: 74, age: 26, yrs: 1, cap: 1.5 }, { prospect: true, pos: D, ovr: 62, pot: 72, age: 21 }], picks: [1, 4],
    smaller: { drop: "pick1" } },
  { name: "Timo Meier", days: 1, seller: "seller", pos: F, ovr: 88, age: 26, yrs: 1, cap: 6, rfa: true,
    back: [{ pos: F, ovr: 76, age: 23, yrs: 1, cap: 0.75 }, { prospect: true, pos: D, ovr: 68, pot: 79, age: 20 }, { pos: F, ovr: 75, age: 28, yrs: 1, cap: 3.4 },
      { prospect: true, pos: D, ovr: 66, pot: 73, age: 22 }, { prospect: true, pos: D, ovr: 65, pot: 72, age: 25 }], picks: [1, "next", 2],
    smaller: { drop: "pick1" } },
  { name: "Patrick Kane", days: 2, seller: "seller", pos: F, ovr: 82, age: 34, yrs: 1, cap: 10.5, retain: 0.5,
    back: [], picks: [2, "next", 4],
    smaller: { drop: "pick2" } },
];

const posOk = (p, pos) => !isGoalie(p.pos) && (pos === D ? isDefense(p.pos) : !isDefense(p.pos));
const shape = (p, s) => {
  Object.assign(p, { ovr: s.ovr, pot: s.pot ?? s.ovr, age: s.age, injury: 0, wantsTrade: false, signed: true });
  if (s.yrs != null) Object.assign(p, { yrs: s.yrs, cap: s.cap, salary: s.cap });
  delete p.clause; delete p.ltir; delete p.waiverPending;
  if (p.ratingData) p.ratingData = { ...p.ratingData, abilities: [] };
};

function rebuild(deal, seed = 1) {
  const lg = L.createLeague({ userAbbr: "EDM", seed });
  L.startRegularSeason(lg);
  lg.day = lg.deadlineDay - deal.days;
  const user = lg.teams[lg.userTid];
  // A contending buyer with room under the cap to take the salary.
  // (EDM: a playoff roster; its picks project in the back half of the round.)
  const want = deal.seller === "contending";
  const seller = lg.teams.find((t) => t.id !== user.id && isContending(lg, t) === want);
  // The player: an existing roster player at his position, reshaped to the real one.
  const p = seller.roster.map((id) => lg.players[id]).filter((q) => posOk(q, deal.pos)).sort((a, b) => a.ovr - b.ovr)[2];
  shape(p, deal);
  // The return: buyer roster players and prospects reshaped to the real pieces.
  const used = new Set();
  const give = deal.back.map((s) => {
    const pool = (s.prospect ? user.prospects : user.roster).map((id) => lg.players[id]).filter((q) => q && !used.has(q.id) && posOk(q, s.pos));
    const q = pool.sort((a, b) => a.ovr - b.ovr)[0];
    assert.ok(q, `no ${s.prospect ? "prospect" : "player"} to shape for ${deal.name}`);
    used.add(q.id);
    shape(q, { yrs: s.prospect ? 3 : s.yrs, cap: s.prospect ? 0.9 : s.cap, ...s });
    return q.id;
  });
  const picks = [];
  let year = lg.year + 1;
  for (const r of deal.picks) {
    if (r === "next") { year = lg.year + 2; continue; }
    const pk = lg.draftPicks.find((x) => x.owner === user.id && x.round === r && x.year === year && !picks.includes(x.id));
    assert.ok(pk, `pick round ${r}`);
    picks.push(pk.id);
  }
  // Leave the buyer room for the incoming cap hit, as the real buyers made.
  const filler = user.roster.map((id) => lg.players[id]).filter((q) => !used.has(q.id) && !isGoalie(q.pos)).sort((a, b) => b.cap - a.cap);
  for (const q of filler.slice(0, 3)) q.cap = Math.min(q.cap, 2);
  const offer = { from: user.id, to: seller.id, give, get: [p.id], givePicks: picks, getPicks: [], getRetention: deal.retain ? { [p.id]: deal.retain } : {} };
  return { lg, offer, picks, give };
}

for (const deal of DEALS) {
  test(`real deal: ${deal.name} goes through at his real price, not for less`, () => {
    const { lg, offer } = rebuild(deal);
    const ev = evaluateTrade(lg, offer);
    if (process.env.TRADE_DEBUG) {
      const ai = lg.teams[offer.to], c = isContending(lg, ai);
      console.log(deal.name, "out", assetValue(lg, offer.get[0], ai).toFixed(2), "in", offer.give.map((id) => `${lg.players[id].ovr}/${lg.players[id].age}:${assetValue(lg, id, ai).toFixed(2)}`).join(" "),
        offer.givePicks.map((id) => { const pk = lg.draftPicks.find((x) => x.id === id); return `R${pk.round}@${projectedPickSlot(lg, pk)}:${pickValue(lg, pk, { contending: c }).toFixed(2)}`; }).join(" "), "ratio", ev.ratio.toFixed(2));
    }
    assert.deepEqual(ev.problems, []);
    assert.ok(ev.accept, `${deal.name} real price refused: ratio ${ev.ratio.toFixed(2)} (in ${ev.valIn.toFixed(2)} out ${ev.valOut.toFixed(2)})`);
    // Not a steal either: the real price is about the price.
    assert.ok(ev.ratio <= 2.2, `${deal.name} real price far too high: ratio ${ev.ratio.toFixed(2)}`);
    const less = { ...offer, give: [...offer.give], givePicks: [...offer.givePicks] };
    const d = deal.smaller.drop;
    if (d.startsWith("player")) less.give.splice(+d.slice(6), 1);
    else {
      const round = +d.slice(4);
      const i = less.givePicks.findIndex((id) => lg.draftPicks.find((x) => x.id === id).round === round);
      less.givePicks.splice(i, 1);
    }
    const ev2 = evaluateTrade(lg, less);
    assert.equal(ev2.accept, false, `${deal.name} went for less: ratio ${ev2.ratio.toFixed(2)}`);
  });
}
