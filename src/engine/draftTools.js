import { csRank, prospectRead, pickGrade } from "./scouting.js";
import { currentSlot, projectedDraftOrder } from "./draft.js";
import { teamNeeds } from "./teamPlanning.js";
import { evaluateTrade, executeTrade, pickValue } from "./trade.js";
import { stream } from "./rng.js";

// The experts' mock draft: walk the first round in the one projected draft order (the live order
// once it's set) and give each club the prospect the analysts expect: the best on Central
// Scouting's list, nudged toward what the club needs (teamPlanning.teamNeeds). Only public
// information: never hidden POT/OVR, gems or red flags. `need` is the club's top need position.
export function mockDraft(league) {
  const pool = league.draftClass.map(id => league.players[id]).filter(p => p?.tid === -2).sort((a,b) => csRank(a)-csRank(b));
  const order = projectedDraftOrder(league);
  const slots = league.draft?.slots.filter(s => s.round === 1 && !s.pid) || (order || [...league.teams].sort((a,b) => a.rec.pts-b.rec.pts || a.id-b.id).map(t => t.id)).map((tid,i) => {
    const pk = league.draftPicks.find(x => x.year === league.year + 1 && x.round === 1 && x.orig === tid);
    return {owner:pk ? pk.owner : tid,orig:tid,overall:i+1,round:1};
  });
  return slots.map((slot) => {
    const t = league.teams[slot.owner];
    const needs = Object.fromEntries(teamNeeds(league, t).map(n => [n.pos, n.score]));
    const need = Object.entries(needs).sort((a,b) => b[1]-a[1])[0]?.[0];
    const candidates = pool.slice(0,6);
    const r = stream(`${league.year}|mock|${slot.overall}`);
    // A club reaches a few spots for a need (goalies only when it badly needs one).
    const bonus = (p) => { const n = needs[p.pos] || 0; return p.pos === "G" ? (n >= 45 ? 2 : -3) : n / 100 * 4; };
    const p = candidates.map(p=>({p,score:-csRank(p)+bonus(p)+r.next()})).sort((a,b)=>b.score-a.score)[0]?.p;
    if (p) pool.splice(pool.indexOf(p),1);
    return {...slot,pid:p?.id,need};
  });
}

export function tradeDownOffers(league) {
  const slot = currentSlot(league);
  if (!slot || slot.owner !== league.userTid || league.draft.stage === "combine") return [];
  const outgoing = league.draftPicks.find(p=>p.year===league.draft.year && p.round===slot.round && p.orig===slot.orig && p.owner===league.userTid);
  if (!outgoing) return [];
  const offers=[];
  for (const later of league.draft.slots.filter(s=>!s.pid && s.overall>slot.overall && s.overall<=slot.overall+24 && s.owner!==league.userTid)) {
    const main=league.draftPicks.find(p=>p.year===league.draft.year && p.round===later.round && p.orig===later.orig && p.owner===later.owner);
    if (!main) continue;
    const extras=league.draftPicks.filter(p=>p.owner===later.owner && p.id!==main.id && (p.year>league.draft.year || !league.draft.slots.find(s=>s.round===p.round && s.orig===p.orig)?.pid)).sort((a,b)=>pickValue(league,a)-pickValue(league,b));
    const offer={from:league.userTid,to:later.owner,give:[],get:[],givePicks:[outgoing.id],getPicks:[main.id]};
    const target=pickValue(league,outgoing)*0.86;
    while (offer.getPicks.length<3 && extras.length && offer.getPicks.reduce((sum,id)=>sum+pickValue(league,league.draftPicks.find(p=>p.id===id)),0)<target) offer.getPicks.push(extras.shift().id);
    const result=evaluateTrade(league,offer);
    const incoming=offer.getPicks.reduce((sum,id)=>sum+pickValue(league,league.draftPicks.find(p=>p.id===id)),0);
    if (result.accept && incoming >= target) offers.push({...offer,overall:later.overall});
    if (offers.length>=3) break;
  }
  return offers;
}
export function acceptDraftTrade(league, offer) {
  const slot=currentSlot(league);
  if (!slot || slot.owner!==league.userTid || !tradeDownOffers(league).some(o=>JSON.stringify(o.givePicks)===JSON.stringify(offer.givePicks) && JSON.stringify(o.getPicks)===JSON.stringify(offer.getPicks))) return {ok:false,msg:"That draft offer is no longer available."};
  if (!evaluateTrade(league,offer).accept) return {ok:false,msg:"That club has withdrawn its offer."};
  executeTrade(league,offer);return {ok:true,msg:`Traded down to pick #${offer.overall}.`};
}
export function archiveDraft(league) {
  if (!league.draft || league.draft.idx < league.draft.slots.length) return;
  league.draftHistory ||= [];
  if (league.draftHistory.some(d=>d.year===league.draft.year)) return;
  league.draftHistory.unshift({year:league.draft.year,picks:league.draft.slots.map(s=> {
    const p=league.players[s.pid];const r=p?prospectRead(league,p):null;
    return {...s,name:p?.name || "Unknown",pos:p?.pos,bio:p?.bio,grade:s.grade || pickGrade(s.overall,s.csr),report:r?{ovr:r.ovr,pot:r.pot}:null};
  })});
}
