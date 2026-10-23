// Trade requests from your own players: who wants out, how much he still trusts you, and
// the two ways to settle it, as in the football game. Talk him down (a scouting point, +20
// trust, he stays) or shop him (a club that wants him comes back with a real offer, which
// waits on your Trade Block like any other). Nothing here touches how offers are valued:
// packages are built from the trade AI's own values and must pass its acceptance check.
import { interestedTeams, onBlock, tradeLabels, userOffers, place } from "./market.js";
import { assetValue, pickValue, evaluateTrade, isContending, tradingClosed } from "./trade.js";
import { isGoalie, isDefense } from "./constants.js";
import { stream } from "./rng.js";

export const TALK_COST = 0; // scouting points are gone (batch x2): a talk is free
const TRUST_GAIN = 20;
const WIRE_MAX = 80;
const groupOf = (p) => (isGoalie(p.pos) ? "G" : isDefense(p.pos) ? "D" : "F");

// The trust a player has in you: his role promise when he has one, then his relationship.
export function playerTrust(p) {
  return Math.round(p?.rolePromise?.trust ?? p?.relationship?.trust ?? 50);
}

// Your players who have asked out, best first, with their trust.
export function tradeRequests(league) {
  const t = league.teams[league.userTid];
  return (t?.roster || []).map((id) => league.players[id]).filter((p) => p && p.wantsTrade && p.tid === t.id)
    .sort((a, b) => b.ovr - a.ovr).map((p) => ({ p, trust: playerTrust(p) }));
}

// Offers that came back from shopping a player, still open.
export function shoppedOffers(league) {
  return userOffers(league).filter((o) => o.shopped);
}

export function talkDown(league, pid) {
  const t = league.teams[league.userTid], p = league.players[pid];
  if (!p || p.tid !== t.id || !p.wantsTrade) return { ok: false, msg: "He no longer wants a trade." };
  const trust = Math.min(100, playerTrust(p) + TRUST_GAIN);
  p.relationship = { trust, reason: "Talked out of his trade request" };
  if (p.rolePromise) p.rolePromise.trust = trust;
  p.wantsTrade = false;
  // He was only on your block because he asked out.
  league.block = (league.block || []).filter((b) => !(b.pid === pid && b.tid === t.id && b.reason === "Requested a trade"));
  league.inbox.push({ year: league.year, day: league.day, pid, text: `💬 ${p.name} withdrew his trade request after a talk. Trust ${trust}/100.` });
  return { ok: true, msg: `${p.name} stays. His trust is up to ${trust}/100.` };
}

// What `buyer` would send for the player: its prospects, depth players and future picks,
// valued by the buyer, as much as it can without going over what he's worth to it.
function buildPackage(league, buyer, seller, p, target) {
  const core = new Set(buyer.roster.map((id) => league.players[id]).filter(Boolean).sort((a, b) => b.ovr - a.ovr).slice(0, 5).map((x) => x.id));
  if (buyer.lines?.G) buyer.lines.G.forEach((id) => id && core.add(id));
  const sellerContending = isContending(league, seller), buyerContending = isContending(league, buyer);
  const assets = [];
  for (const id of buyer.prospects || []) {
    const v = assetValue(league, id, buyer);
    if (v > 0.25) assets.push({ kind: "p", id, v });
  }
  for (const id of buyer.roster) {
    const q = league.players[id];
    if (!q || core.has(id) || (!sellerContending && q.age >= 28)) continue;
    const v = assetValue(league, id, buyer) * (groupOf(q) === groupOf(p) ? 1 : 0.9);
    if (v > 0.4) assets.push({ kind: "p", id, v });
  }
  for (const pk of league.draftPicks || []) {
    if (pk.owner !== buyer.id || pk.year <= league.year) continue;
    assets.push({ kind: "pick", id: pk.id, v: pickValue(league, pk, { contending: buyerContending }) });
  }
  const chosen = [];
  let total = 0;
  for (const a of assets.sort((x, y) => y.v - x.v)) {
    if (chosen.length >= 3) break;
    if (total + a.v <= target) { chosen.push(a); total += a.v; }
  }
  if (!chosen.length || total < target * 0.55) return null;
  return { ids: chosen.filter((a) => a.kind === "p").map((a) => a.id), picks: chosen.filter((a) => a.kind === "pick").map((a) => a.id) };
}

// Clubs to call: those already linked to him first, then the ones thinnest at his position.
function callList(league, p) {
  const linked = interestedTeams(league, p.id, { limit: 4 });
  const thin = league.teams.filter((t) => t.id !== league.userTid && !linked.includes(t.id))
    .map((t) => ({ t, n: t.roster.map((id) => league.players[id]).filter((x) => x && groupOf(x) === groupOf(p) && x.ovr >= p.ovr - 2).length }))
    .sort((a, b) => a.n - b.n || a.t.id - b.t.id).slice(0, 6).map((x) => x.t.id);
  return [...linked, ...thin];
}

export function shopPlayer(league, pid) {
  const user = league.teams[league.userTid], p = league.players[pid];
  if (!p || p.tid !== user.id) return { ok: false, msg: "He's no longer on your club." };
  if (tradingClosed(league)) return { ok: false, msg: league.phase === "playoffs" ? "Trading is closed during the playoffs. Shop him once they're over." : "The trade deadline has passed. Shop him once the playoffs are over." };
  const open = userOffers(league).find((o) => o.give.length === 1 && o.give[0] === pid);
  if (open) return { ok: true, offer: open, msg: `${league.teams[open.tid].city} already have an offer in for ${p.name}. It's on your Trade Block.` };
  league.block ||= [];
  if (!onBlock(league, pid)) league.block.push({ pid, tid: user.id, reason: "Requested a trade", day: league.day, year: league.year, interest: interestedTeams(league, pid) });
  const r = stream(`${league.year}|${league.phase}|${league.day}|${league.fa?.day ?? ""}|shop|${pid}`);
  for (const bid of callList(league, p)) {
    const buyer = league.teams[bid];
    // A club opens a little under what he's worth to it, as AI offers always do.
    const target = (assetValue(league, pid, buyer) / 1.05) * (0.84 + r.next() * 0.12);
    const pkg = buildPackage(league, buyer, user, p, target);
    if (!pkg) continue;
    const deal = { from: user.id, to: buyer.id, give: [pid], givePicks: [], get: pkg.ids, getPicks: pkg.picks };
    if (!evaluateTrade(league, deal).accept) continue;
    const o = {
      id: `o${league.year}${league.day}s${Math.floor(r.next() * 1e9).toString(36)}`,
      tid: buyer.id,
      ...deal,
      day: league.day,
      expDay: league.phase === "regular" ? league.day + 5 : null,
      expFa: league.phase === "freeagency" ? (league.fa?.day ?? 0) + 7 : null,
      expMin: null,
      unsolicited: false,
      shopped: true,
      phase: league.phase,
    };
    league.offers ||= [];
    league.offers.push(o);
    const got = tradeLabels(league, o).bGets.join(", ");
    league.wire ||= [];
    league.wire.unshift({ year: league.year, day: league.day, phase: league.phase, kind: "offer", text: `${place(league, buyer)} offer ${got} for your ${p.name}.`, tids: [buyer.id, user.id], offerId: o.id });
    if (league.wire.length > WIRE_MAX) league.wire.length = WIRE_MAX;
    // Shopping him settles the request: he knows you're listening to offers.
    p.wantsTrade = false;
    league.inbox.push({ year: league.year, day: league.day, pid, open: { tab: "block" }, text: `📨 ${buyer.city} ${buyer.name} offer ${got} for ${p.name}. The offer is on your Trade Block.` });
    return { ok: true, offer: o, msg: `📨 ${buyer.city} came back with an offer for ${p.name}: ${got}.` };
  }
  return { ok: false, msg: `No club made an offer for ${p.name} yet. He's on your Trade Block, so teams may still call.` };
}
