import {ROLE_MINUTES,projectedRole} from './teamPlanning.js';
import {roleUtility,promiseRole} from './playerCommitments.js';
import { faAsk, resignAsk } from "./offseason.js";
import { capSpace, signPlayer, counts, logTx } from "./roster.js";
import { contractCount, reserveCount } from "./hockeyRules.js";
import { minSalaryForYear, maxSalaryForYear, capForYear } from "./constants.js";
import { stream } from "./rng.js";
import { teamRatings, syncLines } from "./lines.js";

export function agentPreferences(p) {
  const r=stream(`${p.id}|preferences`);
  return {priority:r.pick(["winning","role","security","loyalty"]),preferredTerm:p.age<=25?4:p.age<=30?5:2,personality:r.pick(["Patient","Businesslike","Ambitious","Loyal"])};
}
export function pendingSpend(lg,tid) {return Object.values(lg.negotiations || {}).filter(n=>n.status==="pending").reduce((s,n)=>s+(n.bids.find(b=>b.tid===tid)?.aav || 0),0)+(lg.offerSheets || []).filter(s=>!s.done && s.to===tid).reduce((n,s)=>n+s.aav,0);}
export function negotiate(lg,pid,aav,yrs,clause="",role="") {
  const p=lg.players[pid],t=lg.teams[lg.userTid];
  if(!p || !(p.tid===-1 || p.tid===t.id && p.yrs===0) || !["freeagency","resign","preseason"].includes(lg.phase))return {ok:false,msg:"Negotiate with free agents or your unsigned players."};
  if(!["","NTC","NMC"].includes(clause))return {ok:false,msg:"Choose a recognized contract clause."};
  if(role && (!ROLE_MINUTES[role] || (p.pos==='G')!==['starter','backup'].includes(role) || ['topPair','topFour'].includes(role) && !['LD','RD'].includes(p.pos) || ['topLine','topSix'].includes(role) && ['LD','RD'].includes(p.pos))) return {ok:false,msg:'Choose a role appropriate to this position.'};
  const max=p.tid===t.id?7:6,year=["freeagency","resign"].includes(lg.phase)?lg.year+1:lg.year;
  if(!Number.isFinite(aav) || aav<minSalaryForYear(year) || aav>maxSalaryForYear(year) || !Number.isInteger(yrs) || yrs<1 || yrs>max)return {ok:false,msg:`Enter a legal AAV and 1–${max} year term.`};
  if(p.offerSheetPending)return {ok:false,msg:"Resolve the player's offer sheet first."};
  const old=lg.negotiations[pid],other=pendingSpend(lg,t.id)-(old?.status==="pending"?(old.bids.find(b=>b.tid===t.id)?.aav || 0):0);
  if(aav+other>capSpace(lg,t) || contractCount(lg,t)>=50)return {ok:false,msg:"Existing offers consume projected cap room or contract slots."};
  const prefs=agentPreferences(p),ask=p.tid===t.id?resignAsk(lg,p,yrs):faAsk(lg,p,yrs);
  const promised=role || projectedRole(lg,t,p);
  const continuity=Math.min(6,(p.career || []).filter(c=>c.t===t.abbr).length),trust=p.relationship?.trust??50;
  const modifier=prefs.priority==="winning"?(teamRatings(lg,t).ovr>=85?.97:1.05):prefs.priority==="role"?1-roleUtility(lg,t,p,promised)*.05:prefs.priority==="security"?1+Math.max(-.04,Math.min(.06,(prefs.preferredTerm-yrs)*.015)):prefs.priority==="loyalty" && p.tid===t.id?1-Math.max(0,Math.min(.06,continuity*.005+(trust-50)*.0004)):1;
  const counter=Math.round(Math.max(ask.aav*modifier,p.qualified?.aav || 0)*100)/100;
  const rounds=(old?.year===lg.year?old.rounds || 0:0)+1;
  if(aav<counter){lg.negotiations[pid]={pid,year:lg.year,rounds,status:rounds>=4?"walked":"counter",counter,term:yrs,preferences:prefs};return {ok:false,msg:rounds>=4?`${p.name}'s agent ended this discussion.`:`Counteroffer: $${counter.toFixed(2)}M × ${yrs} years. Priority: ${prefs.priority}.`};}
  if(old?.status==="walked")return {ok:false,msg:"The agent will reopen talks next season."};
  if(p.tid===t.id || lg.phase!=="freeagency") {
    if(counts(lg,t).active>=23 && !t.roster.includes(p.id))return {ok:false,msg:"Make an NHL roster spot before signing."};
    const ok=signPlayer(lg,t,p,aav,yrs);if(!ok)return {ok:false,msg:"No contract slot available."};
    promiseRole(lg,p,t.id,promised);
    if(clause && p.age>=27)p.clause={type:clause,blocked:clause==="NTC"?lg.teams.filter(q=>q.conf!==t.conf).map(q=>q.id):[]};
    lg.negotiations[pid]={pid,year:lg.year,rounds,status:"signed",aav,yrs,preferences:prefs};return {ok:true,msg:`${p.name} agreed to your terms.`};
  }
  if(counts(lg,t).active>=23)return {ok:false,msg:"Make an NHL roster spot before bidding."};
  const bids=[{tid:t.id,aav,yrs,clause,role:promised}];
  for(const ai of lg.teams.filter(q=>q.id!==t.id && capSpace(lg,q)>ask.aav && counts(lg,q).active<23 && contractCount(lg,q)<50).sort((a,b)=>teamRatings(lg,b).ovr-teamRatings(lg,a).ovr).slice(0,3)){
    const r=stream(`${p.id}|bid|${ai.id}|${lg.year}`);if(r.next()<.65)bids.push({tid:ai.id,aav:Math.round(ask.aav*(.97+r.next()*.1)*100)/100,yrs:ask.yrs});
  }
  lg.negotiations[pid]={pid,year:lg.year,rounds,status:"pending",closes:(lg.fa?.day || 0)+2,bids,preferences:prefs};p.negotiationPending=true;
  return {ok:true,msg:`Offer submitted. ${p.name}'s agent reviews competing bids in two free-agency days.`};
}
export function withdrawBid(lg,pid) {
  const n=lg.negotiations[pid];if(!n || n.status!=="pending")return {ok:false,msg:"No pending bid."};
  n.bids=n.bids.filter(b=>b.tid!==lg.userTid);if(!n.bids.length){n.status="withdrawn";delete lg.players[pid]?.negotiationPending;}
  return {ok:true,msg:"Your bid was withdrawn."};
}
export function settleNegotiations(lg) {
  for(const n of Object.values(lg.negotiations || {}).filter(n=>n.status==="pending" && n.closes<=(lg.fa?.day || 0))){
    const p=lg.players[n.pid];if(!p || p.tid!==-1){n.status="unavailable";if(p)delete p.negotiationPending;continue;}
    const prefs=n.preferences,score=b=>b.aav+(prefs.priority==="role"?roleUtility(lg,lg.teams[b.tid],p,b.role || projectedRole(lg,lg.teams[b.tid],p))*.5:0)+(prefs.priority==="security"?b.yrs*.18:0)+(prefs.priority==="winning"?(teamRatings(lg,lg.teams[b.tid]).ovr-80)*.06:0);
    const eligible=n.bids.filter(b=>capSpace(lg,lg.teams[b.tid])>=b.aav && counts(lg,lg.teams[b.tid]).active<23 && contractCount(lg,lg.teams[b.tid])<50).sort((a,b)=>score(b)-score(a) || a.tid-b.tid);
    const b=eligible[0];delete p.negotiationPending;
    if(!b){n.status="failed";continue;}
    if(!signPlayer(lg,lg.teams[b.tid],p,b.aav,b.yrs)){n.status="failed";continue;}
    promiseRole(lg,p,b.tid,b.role || projectedRole(lg,lg.teams[b.tid],p));
    if(b.clause && p.age>=27)p.clause={type:b.clause,blocked:[]};n.status="signed";n.winner=b.tid;
    lg.inbox.push({year:lg.year,day:lg.day,text:`Agent update: ${p.name} chose ${lg.teams[b.tid].abbr} at $${b.aav.toFixed(2)}M × ${b.yrs}.`});
  }
}

// 2026 offer-sheet bands; future amounts are gameplay projections indexed to the cap.
const BANDS=[[1.575969,[]],[2.387832,[3]],[4.775666,[2]],[7.163498,[1,3]],[9.551332,[1,2,3]],[11.939166,[1,1,2,3]],[Infinity,[1,1,1,1]]];
export function offerSheetComp(lg,aav,yrs,tid=lg.userTid) {
  const amount=aav*yrs/Math.min(yrs,5),scale=capForYear(lg.year+1)/104;
  const rounds=BANDS.find(([max])=>amount<=max*scale)[1],used=new Map(),picks=[];
  const nextYear=lg.draft?.year && ["resign","freeagency"].includes(lg.phase)?lg.draft.year+1:lg.year+1;
  for(const round of rounds){const offset=used.get(round) || 0;const p=lg.draftPicks.find(p=>p.owner===tid && p.orig===tid && p.round===round && p.year===nextYear+offset && !(lg.offerSheets || []).some(s=>!s.done && s.picks.includes(p.id)) && !(lg.conditions || []).some(c=>!c.done && (c.pickId===p.id || c.deferId===p.id)));if(!p)return {rounds,picks:[],available:false};used.set(round,offset+1);picks.push(p.id);}
  return {rounds,picks,available:true};
}
export function submitOfferSheet(lg,pid,aav,yrs,tid=lg.userTid) {
  const p=lg.players[pid],t=lg.teams[tid];
  if(lg.phase!=="freeagency" || !p?.qualified || p.yrs>0 || p.tid<0 || p.tid===t.id || p.offerSheetPending)return {ok:false,msg:"Offer sheets target another club's qualified, unsigned RFA during free agency."};
  if(!Number.isFinite(aav) || aav<minSalaryForYear(lg.year+1) || aav>maxSalaryForYear(lg.year+1) || !Number.isInteger(yrs) || yrs<1 || yrs>6)return {ok:false,msg:"Invalid offer-sheet terms."};
  const comp=offerSheetComp(lg,aav,yrs,t.id);
  if(!comp.available || capSpace(lg,t)-pendingSpend(lg,t.id)<aav || counts(lg,t).active>=23 || contractCount(lg,t)>=50)return {ok:false,msg:"Offer sheet requires original compensation picks, cap room, roster room and a contract slot."};
  if(aav<Math.max(p.qualified.aav,resignAsk(lg,p,yrs).aav))return {ok:false,msg:"The player's agent rejected the offer-sheet salary."};
  const id=`${pid}|${lg.year}|${lg.fa.day}`;lg.offerSheets.push({id,pid,from:p.tid,to:t.id,aav,yrs,picks:comp.picks,expires:lg.fa.day+7,done:false});p.offerSheetPending=id;
  return {ok:true,msg:"Offer sheet signed by the player. His club has seven free-agency days to match."};
}
export function resolveOfferSheet(lg,id,match) {
  const s=lg.offerSheets.find(s=>s.id===id && !s.done),p=lg.players[s?.pid];
  if(!s || !p || p.tid!==s.from || p.yrs>0)return {ok:false,msg:"Offer sheet is no longer available."};
  const t=lg.teams[match?s.from:s.to];
  if(capSpace(lg,t)<s.aav || counts(lg,t).active>=23 || contractCount(lg,t)>=50 || t.id!==s.from && reserveCount(lg,t)>=90)return {ok:false,msg:"The chosen club cannot fit this contract."};
  if(!match && s.picks.some(id=>!lg.draftPicks.some(p=>p.id===id && p.owner===s.to)))return {ok:false,msg:"Compensation picks are no longer available."};
  const old=lg.teams[s.from];old.rfaRights=old.rfaRights.filter(id=>id!==p.id);old.roster=old.roster.filter(id=>id!==p.id);old.prospects=old.prospects.filter(id=>id!==p.id);
  if(!signPlayer(lg,t,p,s.aav,s.yrs))return {ok:false,msg:"Signing failed."};
  if(!match)s.picks.forEach(id=>{lg.draftPicks.find(p=>p.id===id).owner=s.from;});
  s.done=true;s.matched=match;delete p.offerSheetPending;syncLines(lg,old);
  logTx(lg,`${old.abbr} ${match?"match":"decline"} offer sheet on ${p.name}${match?"":`; player joins ${t.abbr}`}`,[old.id,t.id]);return {ok:true,msg:match?"Offer sheet matched.":"Player acquired and compensation picks transferred."};
}
export function processOfferSheets(lg) {
  for(const s of lg.offerSheets.filter(s=>!s.done && s.expires<=lg.fa.day)){
    const p=lg.players[s.pid],t=lg.teams[s.from];
    const match=t.id!==lg.userTid && capSpace(lg,t)>=s.aav && counts(lg,t).active<23 && contractCount(lg,t)<50;
    const r=resolveOfferSheet(lg,s.id,match);
    if(!r.ok){s.done=true;s.cancelled=true;if(p)delete p.offerSheetPending;}
  }
}

export function aiOfferSheets(lg){
  if(lg.fa.day!==3 || lg.aiSheetYear===lg.year)return;
  lg.aiSheetYear=lg.year;
  const targets=Object.values(lg.players).filter(p=>p.tid===lg.userTid && p.qualified && p.yrs===0 && p.ovr>=80 && !p.offerSheetPending).sort((a,b)=>b.ovr-a.ovr);
  for(const p of targets.slice(0,2)){
    const aav=Math.round(Math.max(p.qualified.aav,resignAsk(lg,p,3).aav)*1.05*100)/100;
    for(const t of lg.teams.filter(t=>t.id!==lg.userTid).sort((a,b)=>capSpace(lg,b)-capSpace(lg,a))){
      if(stream(`${lg.year}|sheet|${p.id}|${t.id}`).next()>.35)continue;
      const r=submitOfferSheet(lg,p.id,aav,3,t.id);if(r.ok){lg.inbox.push({year:lg.year,day:lg.day,text:`${t.abbr} signed ${p.name} to an offer sheet. You have seven FA days to match in Hockey Operations.`});break;}
    }
  }
}
