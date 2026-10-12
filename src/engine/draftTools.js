import { csRank, prospectRead, pickGrade } from "./scouting.js";
import { currentSlot } from "./draft.js";
import { evaluateTrade, executeTrade, pickValue } from "./trade.js";
import { stream } from "./rng.js";

export function mockDraft(league) {
  const pool = league.draftClass.map(id => league.players[id]).filter(p => p?.tid === -2).sort((a,b) => csRank(a)-csRank(b));
  const slots = league.draft?.slots.filter(s => s.round === 1 && !s.pid) || [...league.teams].sort((a,b) => a.rec.pts-b.rec.pts).map((t,i) => ({owner:t.id,orig:t.id,overall:i+1,round:1}));
  return slots.map((slot) => {
    const t = league.teams[slot.owner];
    const roster = [...t.roster,...t.prospects].map(id=>league.players[id]).filter(Boolean);
    const groups = {G:roster.filter(p=>p.pos === "G"),D:roster.filter(p=>p.pos.endsWith("D")),F:roster.filter(p=>["C","LW","RW"].includes(p.pos))};
    const mean = ps => ps.reduce((s,p)=>s+p.ovr,0)/Math.max(1,ps.length);
    const need = Object.keys(groups).sort((a,b)=>mean(groups[a])-mean(groups[b]))[0];
    const candidates = pool.slice(0,5);
    const r = stream(`${league.year}|mock|${slot.overall}`);
    // Only public ranks and positional needs: never use hidden POT/OVR for a mock.
    const p = candidates.map(p=>({p,score:-csRank(p)+(groups[need].includes(p)?0:((p.pos === "G" ? "G" : p.pos.endsWith("D") ? "D" : "F") === need ? 3:0))+r.next()})).sort((a,b)=>b.score-a.score)[0]?.p;
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
