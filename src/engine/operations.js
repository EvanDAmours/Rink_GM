import { ensureHockeyRules, contractCount, reserveCount, waiverStatus, rawPayroll, ltirRelief, qualifyingAmount, ownedIds, elcSalary, elcTerm } from "./hockeyRules.js";
import { capForYear, isGoalie, minSalaryForYear } from "./constants.js";
import { capSpace, counts, sendDown, callUp, signPlayer, logTx } from "./roster.js";
import { syncLines } from "./lines.js";
import { isRFA, marketValue } from "./players.js";
import { stream } from "./rng.js";

export function placeWaivers(lg,pid) {
  ensureHockeyRules(lg);const p=lg.players[pid],t=lg.teams[lg.userTid];
  if(!p || p.tid!==t.id || !t.roster.includes(pid))return {ok:false,msg:"Choose one of your NHL roster players."};
  if(p.clause?.type==="NMC")return {ok:false,msg:"A no-movement clause prevents a waiver assignment."};
  if(p.ltir || p.injury>0 || p.waiverPending)return {ok:false,msg:"Injured, LTIR and pending players cannot be waived."};
  if(waiverStatus(p).exempt){return {ok:sendDown(lg,t,pid),msg:"Waiver-exempt player assigned to the AHL."};}
  const stamp=lg.phase==="freeagency"?lg.fa.day:lg.day;
  lg.waivers.push({id:`${pid}|${lg.year}|${stamp}`,pid,from:t.id,phase:lg.phase,expires:stamp+1,claims:[],done:false});p.waiverPending=true;
  logTx(lg,`${t.abbr} place ${p.name} on waivers`,[t.id]);return {ok:true,msg:"Waivers opened. The player stays on your roster until claims resolve."};
}
export function claimWaiver(lg,id,tid=lg.userTid) {
  const w=lg.waivers.find(w=>w.id===id && !w.done),t=lg.teams[tid],p=lg.players[w?.pid];
  if(!w || !p || tid===w.from || w.claims.includes(tid))return {ok:false,msg:"That waiver claim is unavailable."};
  if(!t || capSpace(lg,t)<p.cap || counts(lg,t).active>=23 || contractCount(lg,t)>=50 || reserveCount(lg,t)>=90)return {ok:false,msg:"You need cap space, roster room and a contract slot."};
  w.claims.push(tid);return {ok:true,msg:`Claim filed for ${p.name}. Lowest standings priority among eligible claimants wins.`};
}
export function processWaivers(lg,{resolveIds=[]}={}) {
  ensureHockeyRules(lg);const stamp=lg.phase==="freeagency"?lg.fa?.day || 0:lg.day;
  for(const p of Object.values(lg.players))if(p.waiverClear && (p.waiverClear.until<lg.day || (p.stats.gp-p.waiverClear.gp)>=10))delete p.waiverClear;
  for(const w of lg.waivers.filter(w=>!w.done && (w.phase!==lg.phase || w.expires<=stamp || resolveIds.includes(w.id)))) {
    const p=lg.players[w.pid],from=lg.teams[w.from];w.done=true;
    if(!p || p.tid!==from.id){w.result="No longer available";continue;}
    delete p.waiverPending;
    // AI claims a useful upgrade, never a player it cannot afford or dress.
    for(const t of lg.teams.filter(t=>t.id!==lg.userTid && t.id!==from.id)) {
      const same=t.roster.map(id=>lg.players[id]).filter(q=>q && isGoalie(q.pos)===isGoalie(p.pos));
      if(same.length && p.ovr>Math.min(...same.map(q=>q.ovr))+3 && stream(`${w.id}|claim|${t.id}`).next()<.2)w.claims.push(t.id);
    }
    // Claim validation is repeated at settlement, including human claims.
    const eligible=w.claims.map(id=>lg.teams[id]).filter(t=>t && capSpace(lg,t)>=p.cap && counts(lg,t).active<23 && contractCount(lg,t)<50 && reserveCount(lg,t)<90);
    const standings=lg.seasonArchive?.[0]?.teams || [];
    const priority=t=>lg.day<30 && standings.length?(standings.find(s=>s.tid===t.id)?.rec.pts || 0):(t.rec.gp?t.rec.pts/(2*t.rec.gp):0);
    eligible.sort((a,b)=>priority(a)-priority(b) || a.id-b.id);
    const winner=eligible[0];
    if(winner){from.roster=from.roster.filter(id=>id!==p.id);from.prospects=from.prospects.filter(id=>id!==p.id);p.tid=winner.id;p.assignment="nhl";winner.roster.push(p.id);syncLines(lg,from);syncLines(lg,winner);w.result=`Claimed by ${winner.abbr}`;logTx(lg,`${winner.abbr} claim ${p.name} from ${from.abbr}`,[winner.id,from.id]);}
    else {p.waiverClear={until:lg.day+30,gp:p.stats.gp};sendDown(lg,from,p.id);w.result="Cleared and assigned to AHL";logTx(lg,`${p.name} clears waivers`,[from.id]);}
  }
  if(lg.waivers.length>100)lg.waivers=lg.waivers.filter(w=>!w.done).concat(lg.waivers.filter(w=>w.done).slice(-60));
}
export function designateLTIR(lg,pid) {
  const p=lg.players[pid],t=lg.teams[lg.userTid];
  if(!p || p.tid!==t.id || !t.roster.includes(pid) || p.injury<10 || p.ltir)return {ok:false,msg:"LTIR needs a rostered player estimated to miss at least 10 games and 24 days."};
  if(lg.phase!=="regular" && lg.phase!=="preseason")return {ok:false,msg:"Use LTIR during preseason or the regular season."};
  if(!t.roster.some(id=>lg.players[id]?.ltir))t.ltirUnused=Math.max(0,capForYear(lg.year)-rawPayroll(lg,t));
  p.ltir={day:lg.day,gp:t.rec.gp};syncLines(lg,t);return {ok:true,msg:"LTIR designated. Relief is reduced by unused cap space; minimum absence is 24 calendar days and 10 team games."};
}
export function activateLTIR(lg,pid,tid=lg.userTid) {
  const p=lg.players[pid],t=lg.teams[tid];
  if(!p?.ltir || p.tid!==tid || p.injury>0 || lg.day-p.ltir.day<24 || t.rec.gp-p.ltir.gp<10)return {ok:false,msg:"The player must recover and meet both minimum absence requirements."};
  const old=p.ltir;delete p.ltir;
  if(capSpace(lg,t)<0 || counts(lg,t).active>23){p.ltir=old;return {ok:false,msg:"Free cap space and a roster spot before activation."};}
  syncLines(lg,t);return {ok:true,msg:`${p.name} activated from LTIR.`};
}
export function qualifyRFA(lg,pid) {
  const p=lg.players[pid],t=lg.teams[lg.userTid];
  if(lg.phase!=="resign" || !p || p.tid!==t.id || p.yrs!==0 || !isRFA(p))return {ok:false,msg:"Qualify your expiring restricted free agents during re-signing."};
  p.qualified={year:lg.year+1,aav:qualifyingAmount(p,lg.year+1)};
  return {ok:true,msg:`Qualifying offer tendered: $${p.qualified.aav.toFixed(2)}M. His rights stay with your club.`};
}
export function holdQualifiedRFA(lg,p) {
  const t=lg.teams[p.tid];t.roster=t.roster.filter(id=>id!==p.id);t.prospects=t.prospects.filter(id=>id!==p.id);
  if(!t.rfaRights.includes(p.id))t.rfaRights.push(p.id);p.cap=0;p.yrs=0;syncLines(lg,t);
}
export function acceptQualifying(lg,pid) {
  const p=lg.players[pid],t=lg.teams[lg.userTid];
  if(p?.offerSheetPending)return {ok:false,msg:"Resolve the pending offer sheet first."};
  if(!p?.qualified || p.tid!==t.id || p.yrs>0 || !["resign","freeagency"].includes(lg.phase))return {ok:false,msg:"No qualifying offer to accept."};
  if(capSpace(lg,t)<p.qualified.aav || contractCount(lg,t)>=50 || !t.roster.includes(p.id) && counts(lg,t).active>=23)return {ok:false,msg:"Insufficient cap space or contract room."};
  const ok=signPlayer(lg,t,p,p.qualified.aav,1);if(ok)delete p.qualified;
  return {ok,msg:ok?`${p.name} signed his one-year qualifying offer.`:"Signing failed."};
}
export function arbitrateRFA(lg,pid,years=1) {
  const p=lg.players[pid],t=lg.teams[lg.userTid];
  if(!p || p.tid!==t.id || !isRFA(p) || p.age<22 || p.yrs>0 || ![1,2].includes(years) || !["resign","freeagency"].includes(lg.phase))return {ok:false,msg:"Arbitration requires an eligible unsigned RFA and a 1–2 year term."};
  if(p.offerSheetPending)return {ok:false,msg:"Resolve the pending offer sheet first."};
  const aav=Math.round(Math.max(qualifyingAmount(p,lg.year+1),marketValue(p,lg.year+1)*(.9+stream(`${p.id}|arb|${lg.year}`).next()*.12))*100)/100;
  if(aav>capSpace(lg,t) || contractCount(lg,t)>=50 || !t.roster.includes(p.id) && counts(lg,t).active>=23)return {ok:false,msg:`Projected arbitration award is $${aav}M; you need more cap space or contract room.`};
  const ok=signPlayer(lg,t,p,aav,years);if(ok){delete p.qualified;p.arbitration={year:lg.year,aav,years};}
  return {ok,msg:ok?`Arbitration award: ${years} year(s), $${aav.toFixed(2)}M AAV.`:"Arbitration could not settle."};
}
export function assignProspect(lg,pid,where) {
  const t=lg.teams[lg.userTid],p=lg.players[pid];
  if(!p || !t.prospects.includes(pid) || !["ahl","junior","college","europe"].includes(where))return {ok:false,msg:"Choose one of your prospects and a development assignment."};
  if(where==="ahl" && p.age<20 && ["OHL","WHL","QMJHL"].includes(p.bio?.lg))return {ok:false,msg:"This CHL prospect must return to juniors until 20 in this gameplay model."};
  if(where==="college" && p.signed!==false)return {ok:false,msg:"A signed professional cannot be assigned to NCAA hockey."};
  if(where==="ahl" && p.signed===false){if(contractCount(lg,t)>=50)return {ok:false,msg:"No available NHL contract slot."};p.cap=elcSalary(lg.year);p.yrs=elcTerm(p.age);p.signed=true;p.elc={signedAge:p.age,year:lg.year};}
  p.assignment=where;return {ok:true,msg:`${p.name} assigned to ${where.toUpperCase()}.`};
}
