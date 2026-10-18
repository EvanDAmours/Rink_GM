import {needFit} from './teamPlanning.js';
// Trades: asset valuation and AI acceptance. AI teams weigh players, prospects
// and picks differently depending on whether they're contending or rebuilding.
import {ensureUniforms} from "./uniforms.js";
import {pickLocked,protectionIssue,stampProtections} from "./draftExpansion.js";
import { moveRestriction, retentionIssue, retainSalary, buriedCap, contractCount, reserveCount } from "./hockeyRules.js";
import { tradeValue, prospectValue } from "./players.js";
import { DIFFICULTY, MAX_ROSTER, isGoalie, isDefense, capForYear } from "./constants.js";
import { capSpace, counts, logTx, queueForLines, capYear } from "./roster.js";
import { leagueTable, conferenceTable } from "./standings.js";
import { teamRatings } from "./lines.js";
import { pickLabel } from "./draft.js";

// Trading is open until the deadline passes (and again once the playoffs end).
export function tradingClosed(league) {
  if (league.phase === "playoffs") return true;
  if (league.phase !== "regular") return false;
  const dl = league.deadline;
  if (dl && dl.year === league.year) return !!dl.done;
  return league.day > league.deadlineDay;
}

// Buyers and sellers. Once the season is a quarter old a team contends if it's in a
// playoff spot or within 4 points of one (by conference); before that, and in the
// off-season, the top 8 rosters in each conference do. Cached per league and refreshed
// whenever the day, the free-agency day, games played or the transaction log change.
const contendCache = new WeakMap();
export function isContending(league, team) {
  const gp = league.teams.reduce((s, t) => s + t.rec.gp, 0);
  const key = `${league.year}|${league.phase}|${league.day}|${league.fa?.day ?? ""}|${gp}`;
  const tx = league.transactions?.[0];
  let c = contendCache.get(league);
  if (!c || c.key !== key || c.tx !== tx) {
    const set = new Set();
    const avgGp = gp / league.teams.length;
    for (const conf of ["East", "West"]) {
      const teams = league.teams.filter((t) => t.conf === conf);
      if (league.phase === "regular" && avgGp >= 20) {
        const table = conferenceTable(league, conf);
        const cut = table[7]?.rec.pts ?? 0;
        table.forEach((t, i) => (i < 8 || t.rec.pts >= cut - 4) && set.add(t.id));
      } else {
        const r = (t) => teamRatings(league, t).ovr + (t.rec.gp ? (t.rec.pts / (2 * t.rec.gp) - 0.5) * 20 : 0);
        teams.sort((a, b) => r(b) - r(a) || a.id - b.id).slice(0, 8).forEach((t) => set.add(t.id));
      }
    }
    c = { key, tx, set };
    contendCache.set(league, c);
  }
  return c.set.has(team.id);
}

export function projectedPickSlot(league, pk) {
  // Once lottery order is known, value this year's pick at its actual position.
  if (league.draft?.year === pk.year) {
    const slot = league.draft.slots.find((s) => s.orig === pk.orig && s.round === 1);
    if (slot) return slot.overall;
  }
  if (pk.year !== league.year + 1 || !league.teams[pk.orig].rec.gp) return 16;
  const table = leagueTable(league).reverse();
  return table.findIndex((t) => t.id === pk.orig) + 1;
}

export function pickValue(league, pk, { contending = false } = {}) {
  const slot = projectedPickSlot(league, pk);
  const base = { 1: 3 + 22 * Math.exp(-(slot - 1) / 9), 2: 2.0, 3: 1.2, 4: 0.8, 5: 0.45, 6: 0.35, 7: 0.25 }[pk.round] ?? 0.2;
  const yearsOut = Math.max(0, pk.year - (league.year + 1));
  return base * Math.pow(0.92, yearsOut) * (contending ? 0.85 : 1.15);
}

export function assetValue(league, id, viewer) {
  const p = league.players[id];
  if (!p) return 0;
  const contending = isContending(league, viewer);
  const owner = league.teams[p.tid];
  const inMinors = owner && owner.prospects.includes(id);
  const v = inMinors && p.age <= 23 ? Math.max(prospectValue(p, { contending }), tradeValue(p, league.year, { contending })) : tradeValue(p, league.year, { contending });
  return v * needFit(league,viewer,p);
}

// Franchise cornerstones cost extra to pry loose.
function cornerstonePremium(league, team, id) {
  const top = team.roster.map((x) => league.players[x]).filter(Boolean).sort((a, b) => b.ovr - a.ovr).slice(0, 2).map((p) => p.id);
  // A player who has asked out comes at a discount.
  if (league.players[id]?.wantsTrade) return 0.85;
  return top.includes(id) ? 1.3 : 1;
}

export function evaluateTrade(league, offer) {
  const user = league.teams[offer.from];
  const ai = league.teams[offer.to];
  const margin = offer.margin ?? (DIFFICULTY[league.settings.difficulty] || DIFFICULTY.normal).tradeMargin;
  const contending = isContending(league, ai);

  const incoming = offer.give.map((id) => assetValue(league, id, ai));
  const outgoing = offer.get.map((id) => assetValue(league, id, ai) * cornerstonePremium(league, ai, id));
  // Consolidation tax: extra roster bodies are worth less to the receiver.
  const extra = Math.max(0, offer.give.length - offer.get.length);
  let valIn = incoming.reduce((a, b) => a + b, 0) - extra * 0.8;
  let valOut = outgoing.reduce((a, b) => a + b, 0);
  const pickIn = offer.givePicks.map((pid) => league.draftPicks.find((p) => p.id === pid)).filter(Boolean);
  const pickOut = offer.getPicks.map((pid) => league.draftPicks.find((p) => p.id === pid)).filter(Boolean);
  valIn += pickIn.reduce((a, pk) => a + pickValue(league, pk, { contending }), 0);
  valOut += pickOut.reduce((a, pk) => a + pickValue(league, pk, { contending }), 0);

  const problems = [];
  if ([...offer.givePicks,...offer.getPicks].some(id=>pickLocked(league,id))) problems.push("A pick is reserved for offer-sheet compensation or conditional protection.");
  const protection=protectionIssue(league,offer);if(protection)problems.push(protection);
  if (tradingClosed(league)) problems.push(league.phase === "playoffs" ? "Trading is closed during the playoffs." : "The trade deadline has passed.");
  if (!offer.give.length && !offer.get.length && !pickIn.length && !pickOut.length) problems.push("Add something to the deal.");

  // Cap & roster checks for both sides (roster players only; prospects don't count).
  const giveRetention=offer.giveRetention || {}, getRetention=offer.getRetention || {};
  const capHit = (ids, team, retention, outgoing) => ids.reduce((sum,id)=>{
    const p=league.players[id], pct=retention[id] || 0;
    if(!p)return sum;
    const charged=team.roster.includes(id)?p.cap:buriedCap(p,capYear(league));
    return sum+(outgoing?charged-p.cap*pct:team.roster.includes(id)?p.cap*(1-pct):buriedCap({...p,cap:p.cap*(1-pct)},capYear(league)));
  },0);
  for(const [t,ids,retain,to] of [[user,offer.give,giveRetention,ai.id],[ai,offer.get,getRetention,user.id]]) {
    for(const id of ids){const p=league.players[id];if(!p || p.tid!==t.id || ![...t.roster,...t.prospects].includes(id)){problems.push("Trade includes an unavailable player.");continue;}const restriction=moveRestriction(p,to);if(restriction)problems.push(restriction);const issue=retentionIssue(league,t,p,retain[id] || 0);if(issue)problems.push(issue);}
    const retained=ids.filter(id=>retain[id]>0);
    if(t.retained.length+retained.length>3)problems.push("Too many retained contracts.");
    if(t.retained.reduce((n,r)=>n+r.amt,0)+retained.reduce((n,id)=>n+league.players[id].cap*retain[id],0)>capForYear(league.year)*.15)problems.push("Retained salary exceeds the club limit.");
  }
  const signedDelta=(inn,out)=>inn.filter(id=>league.players[id]?.signed!==false && league.players[id]?.yrs>0).length-out.filter(id=>league.players[id]?.signed!==false && league.players[id]?.yrs>0).length;
  if(contractCount(league,user)+signedDelta(offer.get,offer.give)>50 || contractCount(league,ai)+signedDelta(offer.give,offer.get)>50)problems.push("The deal exceeds the 50-contract limit.");
  if(reserveCount(league,user)+offer.get.length-offer.give.length>90 || reserveCount(league,ai)+offer.give.length-offer.get.length>90)problems.push("The deal exceeds the reserve list limit.");
  if(new Set(offer.give).size!==offer.give.length || new Set(offer.get).size!==offer.get.length)problems.push("Duplicate player in trade.");
  if(pickIn.some(p=>p.owner!==user.id) || pickOut.some(p=>p.owner!==ai.id) || pickIn.length!==offer.givePicks.length || pickOut.length!==offer.getPicks.length)problems.push("Draft-pick ownership changed.");
  const rosterCount = (ids, team) => ids.filter((id) => team.roster.includes(id)).length;
  const userAfter = capSpace(league, user) + capHit(offer.give, user,giveRetention,true) - capHit(offer.get, ai,getRetention,false);
  const aiAfter = capSpace(league, ai) + capHit(offer.get, ai,getRetention,true) - capHit(offer.give, user,giveRetention,false);
  if (aiAfter < 0) problems.push(`${ai.abbr} can't fit the incoming salary under the cap.`);
  if (userAfter < 0) problems.push("You'd be over the salary cap after this deal.");
  const aiRosterAfter = counts(league, ai).active - rosterCount(offer.get, ai) + rosterCount(offer.give, user);
  if (aiRosterAfter > MAX_ROSTER + 1) problems.push(`${ai.abbr} don't have roster room for that many players.`);
  const posLeft = (team, out, inn, test) =>
    team.roster.filter((id) => !out.includes(id) && test(league.players[id])).length +
    inn.filter((id) => test(league.players[id]) && (user.roster.includes(id) || ai.roster.includes(id))).length;
  // A healthy goalie in the minors can be called up, so he counts toward the two.
  const minorG = ai.prospects.some((id) => {
    const q = league.players[id];
    return q && isGoalie(q.pos) && q.injury <= 0 && q.ovr >= 60 && !offer.get.includes(id);
  });
  if (posLeft(ai, offer.get, offer.give, (p) => isGoalie(p.pos)) + (minorG ? 1 : 0) < 2) problems.push(`${ai.abbr} need two goalies.`);
  if (posLeft(ai, offer.get, offer.give, (p) => isDefense(p.pos)) < 6) problems.push(`${ai.abbr} would be too thin on defense.`);
  // Your own club must still be able to dress a lineup (counting healthy minor-leaguers).
  const userLeft = (test) => [...user.roster, ...user.prospects].filter((id) => !offer.give.includes(id) && test(league.players[id])).length + offer.get.filter((id) => test(league.players[id])).length;
  if (userLeft((p) => p && isGoalie(p.pos)) < 2) problems.push("You need to keep two goalies in the organization.");
  if (userLeft((p) => p && isDefense(p.pos)) < 6) problems.push("You'd be left with fewer than six defensemen.");
  if (userLeft((p) => p && !isGoalie(p.pos) && !isDefense(p.pos)) < 12) problems.push("You'd be left with fewer than twelve forwards.");

  const ratio = valOut > 0 ? valIn / (valOut * margin) : valIn > 0 ? 9 : 0;
  const accept = problems.length === 0 && valIn >= valOut * margin && valIn > 0;
  let mood;
  if (ratio >= 1) mood = "We have a deal.";
  else if (ratio >= 0.85) mood = "Close — sweeten it a little.";
  else if (ratio >= 0.6) mood = "Not enough coming back.";
  else mood = "Not even close.";
  return { accept, ratio: Math.min(ratio, 2), valIn, valOut, problems, mood, contending };
}

export function executeTrade(league, offer, { record = true } = {}) {
  const user = league.teams[offer.from];
  const ai = league.teams[offer.to];
  if (evaluateTrade(league,offer).problems.length) return null;
  offer.give.forEach(id=>retainSalary(league,user,league.players[id],offer.giveRetention?.[id] || 0));
  offer.get.forEach(id=>retainSalary(league,ai,league.players[id],offer.getRetention?.[id] || 0));
  const move = (id, fromT, toT) => {
    const p = league.players[id];
    const wasProspect = fromT.prospects.includes(id);
    fromT.roster = fromT.roster.filter((x) => x !== id);
    fromT.prospects = fromT.prospects.filter((x) => x !== id);
    (p.moveHistory ||= []).push({year:league.year,day:league.day,from:fromT.id,to:toT.id,kind:'trade'});
    delete p.rolePromise;
    p.tid = toT.id;
    p.clause && delete p.clause.waivedTo;
    if (wasProspect) toT.prospects.push(id);
    else toT.roster.push(id);
  };
  offer.give.forEach((id) => move(id, user, ai));
  offer.get.forEach((id) => move(id, ai, user));
  const movePick = (pid, owner) => {
    const pk = league.draftPicks.find((p) => p.id === pid);
    if (!pk) return;
    pk.owner = owner;
    // Mid-draft trades of this year's picks also move the draft slot.
    const slot = league.draft?.year === pk.year && league.draft.slots.find((s) => s.round === pk.round && s.orig === pk.orig && s.pid == null);
    if (slot) slot.owner = owner;
  };
  stampProtections(league,offer);
  offer.givePicks.forEach((pid) => movePick(pid, ai.id));
  offer.getPicks.forEach((pid) => movePick(pid, user.id));
  ensureUniforms(league,user);ensureUniforms(league,ai);
  queueForLines(league, user, offer.get);
  queueForLines(league, ai, offer.give);
  const names = (ids) => ids.map((id) => league.players[id].name);
  const picks = (ids) => ids.map((pid) => pickLabel(league, league.draftPicks.find((p) => p.id === pid)));
  const userSends = [...names(offer.give), ...picks(offer.givePicks)].join(", ") || "nothing";
  const aiSends = [...names(offer.get), ...picks(offer.getPicks)].join(", ") || "nothing";
  logTx(league, `TRADE: ${user.abbr} send ${userSends} to ${ai.abbr} for ${aiSends}`, [user.id, ai.id]);
  league.block = (league.block || []).filter((b) => !offer.give.includes(b.pid) && !offer.get.includes(b.pid));
  for (const id of [...offer.give, ...offer.get]) if (league.players[id]) league.players[id].wantsTrade = false;
  if (!record) return { aSends: userSends, bSends: aiSends };
  league.tradeHistory = league.tradeHistory || [];
  league.tradeHistory.unshift({ year: league.year, day: league.day, a: user.id, b: ai.id, aSends: userSends, bSends: aiSends });
  return { aSends: userSends, bSends: aiSends };
}

// Ask the AI what it would want added from the user's side to balance a deal.
export function suggestBalance(league, offer) {
  const user = league.teams[offer.from];
  const ai = league.teams[offer.to];
  const ev = evaluateTrade(league, offer);
  if (ev.accept) return null;
  const margin = (DIFFICULTY[league.settings.difficulty] || DIFFICULTY.normal).tradeMargin;
  let need = ev.valOut * margin - ev.valIn;
  const candidates = [...user.roster, ...user.prospects]
    .filter((id) => !offer.give.includes(id))
    .map((id) => ({ id, v: assetValue(league, id, ai) }))
    .filter((x) => x.v > 0.5)
    .sort((a, b) => a.v - b.v);
  const pick = candidates.find((x) => x.v >= need) || candidates[candidates.length - 1];
  if (!pick) return null;
  return { ...offer, give: [...offer.give, pick.id] };
}

export function capAfterTradeLabel(league, team) {
  return capForYear(league.year) - capSpace(league, team);
}
