import {ROLE_MINUTES,projectedRole} from './teamPlanning.js';
import {roleUtility,promiseRole} from './playerCommitments.js';
import { faAsk, resignAsk } from "./offseason.js";
import { capSpace, signPlayer, counts, logTx } from "./roster.js";
import { contractCount, reserveCount } from "./hockeyRules.js";
import { minSalaryForYear, maxSalaryForYear, capForYear } from "./constants.js";
import { stream } from "./rng.js";
import { teamRatings, syncLines } from "./lines.js";
import { queueMoment } from "./moments.js";
import { signingMoment } from "./momentsSeason.js";

// Signing Day (Gridiron 3.0 / 3.49): a moment must never stop a signing.
const signingDay = (lg, p, t, deal) => { try { queueMoment(lg, signingMoment(lg, p, t, deal)); } catch (e) { console.error("Signing moment failed", e); } };

export function agentPreferences(p) {
  const r=stream(`${p.id}|preferences`);
  return {priority:r.pick(["winning","role","security","loyalty"]),preferredTerm:p.age<=25?4:p.age<=30?5:2,personality:r.pick(["Patient","Businesslike","Ambitious","Loyal"])};
}
export function pendingSpend(lg,tid) {return Object.values(lg.negotiations || {}).filter(n=>n.status==="pending").reduce((s,n)=>s+(n.bids.find(b=>b.tid===tid)?.aav || 0),0)+(lg.offerSheets || []).filter(s=>!s.done && s.to===tid).reduce((n,s)=>n+s.aav,0);}
export function negotiate(lg,pid,aav,yrs,clause="",role="",{floor=null,bonusCash=0}={}) {
  const p=lg.players[pid],t=lg.teams[lg.userTid];
  if(!p || !(p.tid===-1 || p.tid===t.id && p.yrs===0) || !["freeagency","resign","preseason"].includes(lg.phase))return {ok:false,msg:"Negotiate with free agents or your unsigned players."};
  if(!["","NTC","NMC"].includes(clause))return {ok:false,msg:"Choose a recognized contract clause."};
  if(role && (!ROLE_MINUTES[role] || (p.pos==='G')!==['starter','backup'].includes(role) || ['topPair','topFour'].includes(role) && !['LD','RD'].includes(p.pos) || ['topLine','topSix'].includes(role) && ['LD','RD'].includes(p.pos))) return {ok:false,msg:'Choose a role appropriate to this position.'};
  const max=p.tid===t.id?7:6,year=["freeagency","resign"].includes(lg.phase)?lg.year+1:lg.year;
  if(!Number.isFinite(aav) || aav<minSalaryForYear(year) || aav>maxSalaryForYear(year) || !Number.isInteger(yrs) || yrs<1 || yrs>max)return {ok:false,msg:`Enter a legal AAV and 1–${max} year term.`};
  if(p.offerSheetPending)return {ok:false,msg:"Resolve the player's offer sheet first."};
  const old=lg.negotiations[pid],other=pendingSpend(lg,t.id)-(old?.status==="pending"?(old.bids.find(b=>b.tid===t.id)?.aav || 0):0);
  const bidding=p.tid!==t.id && lg.phase==="freeagency";
  // An immediate signing must fit beside every offer already out. On the open market you
  // may talk to as many agents as you like; each offer only needs to fit on its own, and
  // any that no longer fit when the agents decide fall through (see settleNegotiations).
  if(contractCount(lg,t)>=50)return {ok:false,msg:"You are at the 50-contract limit."};
  if(bidding?aav>capSpace(lg,t):aav+other>capSpace(lg,t))return {ok:false,msg:bidding?"That offer alone would put you over the cap.":"Existing offers consume projected cap room or contract slots."};
  const prefs=agentPreferences(p),ask=p.tid===t.id?resignAsk(lg,p,yrs):faAsk(lg,p,yrs);
  const promised=role || projectedRole(lg,t,p);
  const continuity=Math.min(6,(p.career || []).filter(c=>c.t===t.abbr).length),trust=p.relationship?.trust??50;
  const modifier=prefs.priority==="winning"?(teamRatings(lg,t).ovr>=85?.97:1.05):prefs.priority==="role"?1-roleUtility(lg,t,p,promised)*.05:prefs.priority==="security"?1+Math.max(-.04,Math.min(.06,(prefs.preferredTerm-yrs)*.015)):prefs.priority==="loyalty" && p.tid===t.id?1-Math.max(0,Math.min(.06,continuity*.005+(trust-50)*.0004)):1;
  const counter=floor!=null?floor:Math.round(Math.max(ask.aav*modifier,p.qualified?.aav || 0)*100)/100;
  // An offer already on the table stays there: a raise is free (it never counts toward the
  // agent's patience), and a short offer while it is pending just gets his number back.
  const myBid=old?.status==="pending" && old.year===lg.year ? old.bids?.find(b=>b.tid===t.id) : null;
  const rounds=(old?.year===lg.year?old.rounds || 0:0)+(myBid?0:1);
  if(aav<counter){
    if(myBid)return keepPendingOnShortOffer(lg,pid,{aav:counter,yrs});
    lg.negotiations[pid]={pid,year:lg.year,rounds,status:rounds>=4?"walked":"counter",counter,term:yrs,preferences:prefs};return {ok:false,msg:rounds>=4?`${p.name}'s agent ended this discussion.`:`Counteroffer: $${counter.toFixed(2)}M × ${yrs} years. Priority: ${prefs.priority}.`};
  }
  if(old?.status==="walked")return {ok:false,msg:"The agent will reopen talks next season."};
  if(p.tid===t.id || lg.phase!=="freeagency") {
    if(lg.phase==="preseason" && counts(lg,t).active>=23 && !t.roster.includes(p.id))return {ok:false,msg:"Make an NHL roster spot before signing."};
    const wasFA=p.tid===-1;
    const ok=signPlayer(lg,t,p,aav,yrs);if(!ok)return {ok:false,msg:"No contract slot available."};
    if(wasFA)signingDay(lg,p,t,{aav,yrs});
    promiseRole(lg,p,t.id,promised);
    if(clause && p.age>=27)p.clause={type:clause,blocked:clause==="NTC"?lg.teams.filter(q=>q.conf!==t.conf).map(q=>q.id):[]};
    lg.negotiations[pid]={pid,year:lg.year,rounds,status:"signed",aav,yrs,preferences:prefs};return {ok:true,msg:`${p.name} agreed to your terms.`};
  }
  if(reserveCount(lg,t)>=90)return {ok:false,msg:"Your reserve list is full (90)."};
  const mine={tid:t.id,aav,yrs,clause,role:promised,bonusCash};
  const raising=old?.status==="pending" && old.year===lg.year;
  const bids=raising?[mine,...old.bids.filter(b=>b.tid!==t.id)]:[mine];
  if(!raising)for(const ai of lg.teams.filter(q=>q.id!==t.id && capSpace(lg,q)>ask.aav && counts(lg,q).active<23 && contractCount(lg,q)<50).sort((a,b)=>teamRatings(lg,b).ovr-teamRatings(lg,a).ovr).slice(0,3)){
    const r=stream(`${p.id}|bid|${ai.id}|${lg.year}`);if(r.next()<.65)bids.push({tid:ai.id,aav:Math.round(ask.aav*(.97+r.next()*.1)*100)/100,yrs:ask.yrs});
  }
  lg.negotiations[pid]={pid,year:lg.year,rounds,status:"pending",closes:raising?old.closes:(lg.fa?.day || 0)+2,bids,preferences:prefs,mineAav:aav,mineYrs:yrs};p.negotiationPending=true;
  const st=bidStanding(lg,pid);
  return {ok:true,msg:st?st.toast:`Offer submitted. ${p.name}'s agent reviews competing bids in two free-agency days.`,standing:st};
}
// A short offer while yours is already on the table leaves the table alone: you hear his number
// and your earlier offer still stands. Returns the reply, or null when you have no pending bid.
// (Any offer screen should check this before recording a counter.)
export function keepPendingOnShortOffer(lg,pid,counter){
  const n=lg.negotiations?.[pid];
  const mine=n?.status==="pending" && n.year===lg.year ? n.bids?.find(b=>b.tid===lg.userTid) : null;
  if(!mine)return null;
  const aav=Number(counter?.aav ?? counter),yrs=counter?.yrs ?? mine.yrs;
  return {ok:false,keptBid:true,countered:true,counter:{aav,yrs},msg:`His agent wants $${aav.toFixed(2)}M × ${yrs} for that. Your offer of $${mine.aav.toFixed(2)}M × ${mine.yrs} stays on the table.`};
}
export function withdrawBid(lg,pid) {
  const n=lg.negotiations[pid];if(!n || n.status!=="pending")return {ok:false,msg:"No pending bid."};
  n.bids=n.bids.filter(b=>b.tid!==lg.userTid);if(!n.bids.length){n.status="withdrawn";delete lg.players[pid]?.negotiationPending;}
  return {ok:true,msg:"Your bid was withdrawn."};
}
// How an agent weighs a bid: money first, then whatever his client cares about most.
export function bidScore(lg,n,p,b){
  const prefs=n.preferences || agentPreferences(p);
  return b.aav+(prefs.priority==="role"?roleUtility(lg,lg.teams[b.tid],p,b.role || projectedRole(lg,lg.teams[b.tid],p))*.5:0)+(prefs.priority==="security"?b.yrs*.18:0)+(prefs.priority==="winning"?(teamRatings(lg,lg.teams[b.tid]).ovr-80)*.06:0);
}
const eligibleBids=(lg,n)=>n.bids.filter(b=>capSpace(lg,lg.teams[b.tid])>=b.aav && (b.tid===lg.userTid?reserveCount(lg,lg.teams[b.tid])<90:counts(lg,lg.teams[b.tid]).active<23) && contractCount(lg,lg.teams[b.tid])<50);
// Where your offer stands right now, in the agent's words. Rival bids are never shown in
// full; you learn whether you lead, what he cares about, and roughly what it would take.
export function bidStanding(lg,pid){
  const n=lg.negotiations?.[pid];const p=lg.players[pid];if(!n || !p || n.year!==lg.year)return null;
  const me=lg.userTid,mine=n.bids?.find(b=>b.tid===me);
  const daysLeft=Math.max(0,(n.closes ?? 0)-(lg.fa?.day || 0));
  const prefs=n.preferences || agentPreferences(p);
  const cares={winning:"a contender",role:"a real role",security:"term and security",loyalty:"familiar faces"}[prefs.priority];
  if(n.status==="signed"){const won=n.winner===me;return {status:won?"won":"lost",won,winner:n.winner,aav:n.aav ?? n.bids?.find(b=>b.tid===n.winner)?.aav,yrs:n.yrs ?? n.bids?.find(b=>b.tid===n.winner)?.yrs,label:won?"Signed":`Signed with ${lg.teams[n.winner]?.abbr || "another club"}`,says:won?`${p.name} is yours.`:`He took ${lg.teams[n.winner]?.abbr || "another"}'s offer${prefs.priority==="winning"?"; he wanted a contender":prefs.priority==="security"?"; they gave him more term":prefs.priority==="role"?"; they promised him a bigger role":""}.`,toast:won?`${p.name} signed with you.`:`${p.name} signed elsewhere.`};}
  if(n.status==="failed")return {status:"failed",label:"Fell through",says:"No club could fit him; he stays on the market.",toast:"The deal fell through."};
  if(n.status==="withdrawn")return {status:"withdrawn",label:"Withdrawn",says:"You pulled your offer.",toast:"Offer withdrawn."};
  if(n.status==="counter")return {status:"counter",label:"Countered",counter:n.counter,term:n.term,says:`His agent wants $${Number(n.counter).toFixed(2)}M × ${n.term}.`,toast:`Counter: $${Number(n.counter).toFixed(2)}M × ${n.term}.`};
  if(n.status==="walked")return {status:"walked",label:"Talks over",says:"His agent ended talks for this season.",toast:"His agent walked away."};
  if(n.status!=="pending" || !mine)return null;
  const ranked=eligibleBids(lg,n).sort((a,b)=>bidScore(lg,n,p,b)-bidScore(lg,n,p,a) || a.tid-b.tid);
  const rank=ranked.findIndex(b=>b.tid===me)+1,leader=ranked[0],rivals=n.bids.filter(b=>b.tid!==me).length;
  const myScore=bidScore(lg,n,p,mine),top=leader?bidScore(lg,n,p,leader):myScore;
  const gap=rank===1?0:Math.max(.05,Math.round((top-myScore+.03)*100)/100);
  const standing=rank===1?(rivals && ranked.length>1 && top-bidScore(lg,n,p,ranked[1])<.3?"edge":"lead"):rank===0?"blocked":rank===2?"close":"behind";
  const label={lead:"Frontrunner",edge:"Slight edge",close:"Close behind",behind:"Behind",blocked:"Can't fit"}[standing];
  const says=standing==="blocked"?"Your cap or reserve list can't take him right now.":rivals===0?`No other club is in. He signs with you in ${daysLeft} day${daysLeft===1?"":"s"} unless someone jumps in.`:standing==="lead"?`You're his first choice. ${rivals} other club${rivals===1?" is":"s are"} in; he cares most about ${cares}.`:standing==="edge"?`You lead by a hair over ${rivals} other club${rivals===1?"":"s"}. He cares most about ${cares}; a little more would lock it.`:`Another club is ahead. He cares most about ${cares}; about $${gap.toFixed(2)}M more per year${prefs.priority==="security"&&mine.yrs<prefs.preferredTerm?" or another year of term":""} would put you in front.`;
  return {status:"pending",standing,label,rank,rivals,daysLeft,gap,mine,cares,says,toast:`Offer in: $${mine.aav.toFixed(2)}M × ${mine.yrs}. ${label}${rivals?` with ${rivals+1} clubs bidding`:", nobody else bidding"}; he decides in ${daysLeft} day${daysLeft===1?"":"s"}.`};
}
export function myOffers(lg){
  return Object.values(lg.negotiations || {}).filter(n=>n.year===lg.year && lg.players[n.pid] && (n.bids?.some(b=>b.tid===lg.userTid) || n.status==="counter" || n.status==="walked")).map(n=>({n,p:lg.players[n.pid],standing:bidStanding(lg,n.pid)})).filter(x=>x.standing).sort((a,b)=>(a.standing.status==="pending"?0:1)-(b.standing.status==="pending"?0:1) || b.p.ovr-a.p.ovr);
}
export function settleNegotiations(lg) {
  for(const n of Object.values(lg.negotiations || {}).filter(n=>n.status==="pending" && n.closes<=(lg.fa?.day || 0))){
    const p=lg.players[n.pid];if(!p || p.tid!==-1){n.status="unavailable";if(p)delete p.negotiationPending;continue;}
    const eligible=eligibleBids(lg,n).sort((a,b)=>bidScore(lg,n,p,b)-bidScore(lg,n,p,a) || a.tid-b.tid);
    const b=eligible[0];delete p.negotiationPending;
    const mine=n.bids.find(x=>x.tid===lg.userTid),mineOut=mine && !eligible.some(x=>x.tid===lg.userTid);
    if(mine?.bonusCash && (!b || b.tid!==lg.userTid)){const ut=lg.teams[lg.userTid];ut.arena.cash=Math.round((ut.arena.cash+mine.bonusCash)*100)/100;}
    if(!b){n.status="failed";if(mineOut)lg.inbox.push({year:lg.year,day:lg.day,text:`❌ ${p.name}: your earlier signings left no cap or roster room for your $${mine.aav.toFixed(2)}M × ${mine.yrs} offer. He stays on the market.`});continue;}
    if(!signPlayer(lg,lg.teams[b.tid],p,b.aav,b.yrs)){n.status="failed";continue;}
    promiseRole(lg,p,b.tid,b.role || projectedRole(lg,lg.teams[b.tid],p));
    if(b.clause && p.age>=27)p.clause={type:b.clause,blocked:[]};n.status="signed";n.winner=b.tid;n.aav=b.aav;n.yrs=b.yrs;
    if(mine){const won=b.tid===lg.userTid;(lg.faResults ||= []).unshift({year:lg.year,day:lg.fa?.day || 0,pid:p.id,name:p.name,won,winner:b.tid,aav:b.aav,yrs:b.yrs});
      if(won)signingDay(lg,p,lg.teams[b.tid],{aav:b.aav,yrs:b.yrs,market:true,rivals:n.bids.filter(x=>x.tid!==b.tid).length});
      lg.inbox.push({year:lg.year,day:lg.day,text:won?`✅ ${p.name} signed with you: $${b.aav.toFixed(2)}M × ${b.yrs}.`:mineOut?`❌ ${p.name} signed with ${lg.teams[b.tid].abbr}: your earlier signings left no cap or roster room for your $${mine.aav.toFixed(2)}M × ${mine.yrs} offer.`:`❌ ${p.name} chose ${lg.teams[b.tid].abbr} ($${b.aav.toFixed(2)}M × ${b.yrs}) over your $${mine.aav.toFixed(2)}M × ${mine.yrs}.`});}
    else lg.inbox.push({year:lg.year,day:lg.day,text:`Agent update: ${p.name} chose ${lg.teams[b.tid].abbr} at $${b.aav.toFixed(2)}M × ${b.yrs}.`});
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
  if(!match)signingDay(lg,p,t,{aav:s.aav,yrs:s.yrs,sheetFrom:old.id});
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
      const r=submitOfferSheet(lg,p.id,aav,3,t.id);if(r.ok){lg.inbox.push({year:lg.year,day:lg.day,text:`${t.abbr} signed ${p.name} to an offer sheet. You have seven FA days to match under Front Office → Operations.`});break;}
    }
  }
}
