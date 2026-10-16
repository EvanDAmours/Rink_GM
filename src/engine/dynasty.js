import {stream,clamp} from "./rng.js";
import {createAssistant} from "./development.js";
import {logTx} from "./roster.js";

export const ARENA_UPGRADES={training:{name:"Training complex",cost:8,effect:"Improves prospect development"},fan:{name:"Fan experience",cost:6,effect:"Improves attendance and fan support"},medical:{name:"Medical facilities",cost:7,effect:"Reduces simulated injury risk"}};
export function ensureDynasty(lg){
  lg.career ||= {jobs:[{tid:lg.userTid,start:lg.year}],fired:false,offers:[]};
  lg.settings.firing ??= false;lg.hallOfFame ||= [];lg.numberRetirements ||= [];lg.celebrations ||= [];
  for(const t of lg.teams){t.arena ||= {cash:20,training:0,fan:0,medical:0,paid:0};t.owner.personality ||= stream(`${t.id}|owner`).pick(["Patient builder","Demanding contender","Development focused"]);t.rivals ||= lg.teams.filter(o=>o.id!==t.id && o.div===t.div).slice(0,2).map(o=>o.id);t.coach.tenure ||= [];}
}
export function arenaWeek(lg){
  ensureDynasty(lg);const week=Math.floor(lg.day/7);
  for(const t of lg.teams){if(week<=t.arena.paid)continue;const n=week-t.arena.paid;t.arena.paid=week;t.arena.cash=Math.round((t.arena.cash+n*(.3+t.owner.fanSupport/100*.7+t.arena.fan*.08))*100)/100;}
}
export function upgradeArena(lg,key){
  const t=lg.teams[lg.userTid],u=ARENA_UPGRADES[key];if(!u)return {ok:false,msg:"Choose a facility."};
  const cost=u.cost*(1+t.arena[key]*.5);if(t.arena[key]>=3 || t.arena.cash<cost)return {ok:false,msg:"Facility is at maximum level or the arena budget is insufficient."};
  t.arena.cash=Math.round((t.arena.cash-cost)*100)/100;t.arena[key]++;return {ok:true,msg:`${u.name} upgraded. Arena finances are separate from the player salary cap.`};
}
export function careerReview(lg){
  ensureDynasty(lg);
  for(const t of lg.teams){
    if(t.coach.tenure.some(s=>s.year===lg.year))continue;
    t.coach.tenure.push({year:lg.year,tid:t.id,w:t.rec.w,pts:t.rec.pts,cup:lg.playoffs?.champion===t.id});
    if(t.id!==lg.userTid && t.owner.trust<35 && stream(`${lg.year}|carousel|${t.id}`).next()<.4){
      const next=lg.coachMarket.find(c=>!lg.teams.some(o=>o.coach.id===c.id));if(next){lg.coachMarket=lg.coachMarket.filter(c=>c.id!==next.id);lg.coachMarket.push(t.coach);t.coach={...next,hiredYear:lg.year+1,tenure:[]};logTx(lg,`${t.abbr} change head coach to ${next.name}`,[t.id]);}
    }
  }
  const t=lg.teams[lg.userTid];
  if(lg.settings.firing && t.owner.trust<=25){lg.career.fired=true;lg.career.offers=lg.teams.filter(o=>o.id!==t.id).sort((a,b)=>a.owner.trust-b.owner.trust || a.rec.pts-b.rec.pts).slice(0,5).map(o=>({tid:o.id,year:lg.year+1,goal:o.owner.goal.label}));lg.inbox.push({year:lg.year,day:lg.day,text:`You were dismissed by ${t.abbr}. Select your next GM job in Hockey Operations.`});}
  const champ=lg.playoffs?.champion;if(champ!=null && !lg.celebrations.some(c=>c.year===lg.year)){
    const h=lg.history.find(h=>h.year===lg.year);lg.celebrations.unshift({year:lg.year,tid:champ,runnerUp:h?.runnerUp,headline:`${lg.teams[champ].name.toUpperCase()} LIFT THE STANLEY CUP`,mvp:lg.awards.connSmythe?.name,rec:{...lg.teams[champ].rec},roster:lg.teams[champ].roster.map(id=>({pid:id,name:lg.players[id]?.name,number:lg.players[id]?.number}))});
  }
}
export function takeJob(lg,tid){
  if(!["draft","resign","freeagency","preseason"].includes(lg.phase) || !lg.teams[tid] || tid===lg.userTid)return {ok:false,msg:"GM jobs can change between seasons."};
  if(lg.career.fired && !lg.career.offers.some(o=>o.tid===tid))return {ok:false,msg:"That club has not offered a position."};
  const old=lg.userTid;const last=lg.career.jobs.at(-1);if(last)last.end=lg.year;
  lg.userTid=tid;lg.career.jobs.push({tid,start:lg.year+1});lg.career.fired=false;lg.career.offers=[];
  lg.teams[tid].scouts ||= structuredClone(lg.teams[old].scouts);lg.myList={year:lg.draftClassYear,ids:[]};lg.teams[tid].scoutPts ||= 6;lg.teams[tid].owner.trust=Math.max(55,lg.teams[tid].owner.trust);
  logTx(lg,`GM accepts the ${lg.teams[tid].abbr} job`,[old,tid]);return {ok:true,msg:`You now manage the ${lg.teams[tid].name}. The league's history carries on.`};
}
export function archiveRetirement(lg,p,tot){
  const entry={pid:p.id,name:p.name,pos:p.pos,year:lg.year,tid:p.tid>=0?p.tid:lg.teams.find(t=>t.abbr===p.career.at(-1)?.t)?.id,number:p.number,player:structuredClone(p),...tot,peak:p.peak || p.ovr,awards:p.honours || []};
  (lg.retirementArchive ||= []).push(entry);
}
export function inductHall(lg){
  ensureDynasty(lg);
  for(const r of lg.retirementArchive || [])if(lg.year-r.year>=3 && !lg.hallOfFame.some(h=>h.pid===r.pid)){
    const eligible=r.pos==="G"?r.w>=250 || r.w>=100 && r.awards.length>=2:r.g+r.a>=700 || r.gp>=400 && r.awards.length>=2;
    if(eligible)lg.hallOfFame.push({...r,inducted:lg.year});
  }
}
export function retireNumber(lg,pid){
  const r=(lg.retirementArchive || []).find(r=>r.pid===pid),t=lg.teams[lg.userTid];
  if(!r || r.tid!==t.id || r.number==null || lg.numberRetirements.some(x=>x.tid===t.id && x.number===r.number))return {ok:false,msg:"Choose a retired player whose last team was your club and whose number is available."};
  if(r.gp<300 && r.awards.length<2)return {ok:false,msg:"Franchise honours need 300 simulated games or two awards."};
  if(t.roster.some(id=>lg.players[id]?.number===r.number))return {ok:false,msg:"Reassign that number on the active roster first."};
  lg.numberRetirements.push({pid,tid:t.id,name:r.name,number:r.number,year:lg.year});return {ok:true,msg:`Number ${r.number} retired for ${r.name}.`};
}
export function stampHonours(lg){
  for(const [kind,a] of Object.entries(lg.awards || {}))if(a?.pid)for(const id of a.pids || [a.pid]){const p=lg.players[id];if(p){p.honours ||= [];if(!p.honours.some(h=>h.year===lg.year && h.kind===kind))p.honours.push({year:lg.year,kind,tid:a.tid});}}
}
