import {REAL_COACHES,COACH_SOURCE} from "../data/realCoaches.js";
import {ensureDevelopment} from "./development.js";
import { stream, clamp } from "./rng.js";
import { teamRatings } from "./lines.js";
import { isGoalie, isDefense } from "./constants.js";
import { computeOvr } from "./ratings.js";
import { logTx } from "./roster.js";

export const COACH_STYLES = {
  balanced: { name: "Balanced", desc: "A measured five-man game.", tactic: "balanced" },
  attack: { name: "Up-tempo", desc: "Push the pace and create offense; accept more risk.", tactic: "attack" },
  defend: { name: "Defensive structure", desc: "Protect the middle and limit chances; sacrifice some offense.", tactic: "defend" },
};
export const TRAINING = {
  skating: { name: "Skating", keys: ["spd", "acc", "agi", "end"] },
  shooting: { name: "Shooting", keys: ["wac", "wpw", "sac", "spw"] },
  playmaking: { name: "Playmaking", keys: ["pas", "puc", "dek", "oaw"] },
  defense: { name: "Defense", keys: ["daw", "stk", "blk", "fof"] },
  physical: { name: "Strength & contact", keys: ["str", "bch", "bal"] },
  goaltending: { name: "Goaltending", keys: ["glh", "gll", "sth", "stl", "reb", "pos"] },
};
const FIRST=["Alex","Marc","Daniel","Ryan","Chris","Pat","Mike","Scott","André","Johan","Mikko","Rob"];
const LAST=["Mercer","Larsson","Bennett","Moreau","Sullivan","Anderson","Campbell","Gauthier","Wilson","Lehtinen","Roy","Peterson"];
function coach(key) {
  const r=stream(key);return {id:key,name:`${r.pick(FIRST)} ${r.pick(LAST)}`,style:r.pick(Object.keys(COACH_STYLES)),development:r.int(58,94),specialTeams:r.int(58,94),leadership:r.int(58,94),age:r.int(39,65)};
}
export function ensureFranchise(league) {
  ensureDevelopment(league);
  for (const t of league.teams) {
    if(!t.coach){t.coach=coach(`${league.startYear || league.year}|coach|${t.id}`);if(league.mode==="real" && league.year===2026){t.coach.name=REAL_COACHES[t.abbr];t.coach.real=true;t.coach.source=COACH_SOURCE;}t.coach.hiredYear=league.year;}
    t.training ||= {assignments:{},earned:{},paid:0,campYear:null};
    t.owner ||= {trust:65,fanSupport:60,reviews:[]};
    if (!t.owner.goal || t.owner.goal.year!==league.year) {
      const ovr=teamRatings(league,t).ovr;
      const goal=ovr>=85?"contend":ovr>=82?"playoffs":"develop";
      t.owner.goal={year:league.year,kind:goal,label:goal==="contend"?"Win a playoff series":goal==="playoffs"?"Reach the Stanley Cup Playoffs":"Develop three young players",startOvrs:Object.fromEntries([...t.roster,...t.prospects].map(id=>[id,league.players[id]?.ovr || 0]))};
    }
  }
  league.coachMarket ||= Array.from({length:8},(_,i)=>coach(`${league.year}|market|${i}`));
  league.news ||= [];
  league.achievements ||= [];
}
export function hireCoach(league, id) {
  if (!["preseason","resign","freeagency"].includes(league.phase)) return {ok:false,msg:"Change your head coach during the offseason or preseason."};
  const c=league.coachMarket.find(c=>c.id===id);if(!c)return {ok:false,msg:"That coach is no longer available."};
  const t=league.teams[league.userTid],old=t.coach;
  t.coach={...c,hiredYear:league.year};league.coachMarket=league.coachMarket.filter(x=>x.id!==id);if(old)league.coachMarket.push(old);
  logTx(league,`${t.abbr} hire ${c.name} as head coach`,[t.id]);return {ok:true,msg:`${c.name} is your new head coach.`};
}
export function setTraining(league, pid, focus) {
  const t=league.teams[league.userTid],p=league.players[pid];
  if (!p || p.tid!==t.id || ![...t.roster,...t.prospects].includes(pid)) return {ok:false,msg:"Choose one of your players."};
  if (focus && (!TRAINING[focus] || (isGoalie(p.pos)!==(focus==="goaltending")))) return {ok:false,msg:"Choose a position-appropriate training focus."};
  const a=t.training.assignments;
  if (focus && !a[pid] && Object.keys(a).filter(id=>league.players[id]?.tid===t.id).length>=3) return {ok:false,msg:"Your staff can give three players individual attention."};
  if(focus)a[pid]=focus;else delete a[pid];return {ok:true,msg:focus?`${p.name}: ${TRAINING[focus].name}.`:`Individual focus cleared for ${p.name}.`};
}
export function franchiseWeek(league) {
  ensureFranchise(league);
  const week=Math.floor(league.day/7);
  for(const t of league.teams) {
    const tr=t.training;
    if(week>tr.paid) {
      const n=week-tr.paid;
      for(const [id,focus] of Object.entries(tr.assignments)) {
        const p=league.players[id];if(!p || p.tid!==t.id){delete tr.assignments[id];continue;}
        if(p.injury>0)continue;
        const e=tr.earned[id] ||= {};e[focus]=(e[focus] || 0)+n*(p.age<=25?1:0.35)*(0.6+(t.coach.development+t.staff[isGoalie(p.pos)?"goalie":"assistant"].development)/200);
      }
      tr.paid=week;
    }
    if(t.rec.gp) t.owner.fanSupport=clamp(Math.round(40+50*t.rec.pts/(2*t.rec.gp)+(t.rec.gf-t.rec.ga)*0.1+(t.arena?.fan || 0)*2),15,95);
  }
  if (league.newsWeek===week) return;
  league.newsWeek=week;
  const sk=Object.values(league.players).filter(p=>p.tid>=0 && !isGoalie(p.pos) && p.stats.gp>0).sort((a,b)=>b.stats.pts-a.stats.pts);
  const lead=sk[0];
  if(lead)league.news.unshift({year:league.year,day:league.day,type:"scoring",pid:lead.id,text:`Art Ross watch: ${lead.name} leads with ${lead.stats.pts} points in ${lead.stats.gp} games.`});
  const hurt=league.teams[league.userTid].roster.map(id=>league.players[id]).find(p=>p?.injury>0 && p.ovr>=83);
  if(hurt)league.news.unshift({year:league.year,day:league.day,type:"injury",pid:hurt.id,text:`${hurt.name} remains out for ${hurt.injury} game${hurt.injury===1?'':'s'}. ${league.settings?.coachLines?`${league.teams[league.userTid].coach?.name || 'The head coach'} has covered the slot.`:'Review your lines and call-up options.'}`});
  const user=league.teams[league.userTid];
  const rivalGame=league.schedule.filter(g=>g.played && g.day>=league.day-7 && (g.h===user.id && user.rivals?.includes(g.a) || g.a===user.id && user.rivals?.includes(g.h))).at(-1);
  if(rivalGame){const rival=league.teams[rivalGame.h===user.id?rivalGame.a:rivalGame.h],won=(rivalGame.h===user.id?rivalGame.hs:rivalGame.as)>(rivalGame.h===user.id?rivalGame.as:rivalGame.hs);league.news.unshift({year:league.year,day:league.day,type:"rivalry",text:`Rivalry report: ${user.abbr} ${won?"take bragging rights against":"fall to"} ${rival.abbr}, ${rivalGame.hs}–${rivalGame.as}.`});}
  const old=league.mediaSnapshot || {},skater=sk.filter(p=>p.stats.pts-(old[p.id]?.pts || 0)>=7)[0];
  if(skater)league.news.unshift({year:league.year,day:league.day,type:"hot",pid:skater.id,text:`Player of the week watch: ${skater.name} added ${skater.stats.pts-(old[skater.id]?.pts || 0)} points since the last report.`});
  if(user.owner.trust<40)league.news.unshift({year:league.year,day:league.day,type:"pressure",text:`The owner wants a response in ${user.city}. Trust is ${user.owner.trust}/100; the season goal is ${user.owner.goal.label.toLowerCase()}.`});
  league.mediaSnapshot=Object.fromEntries(sk.map(p=>[p.id,{pts:p.stats.pts}]));
  if(league.news.length>200)league.news.length=200;
}
function trainAttributes(p,focus,amount) {
  const keys=TRAINING[focus]?.keys.filter(k=>Number.isFinite(p.attrs[k])) || [];
  for(const k of keys)p.attrs[k]=clamp(p.attrs[k]+amount,40,99);
  p.ovr=Math.min(99,Math.max(40,computeOvr(p.attrs,p.type)+(p.ovrOffset || 0)));p.pot=Math.max(p.pot,p.ovr);
}
export function trainingCamp(league) {
  const t=league.teams[league.userTid];
  if(league.phase!=="preseason")return {ok:false,msg:"Training camp runs during the preseason."};
  if(t.training.campYear===league.year)return {ok:false,msg:"Training camp is complete for this season."};
  if (!Object.keys(t.training.assignments).length) return {ok:false,msg:"Select an individual focus before running camp."};
  const notes=[];
  for(const [id,focus] of Object.entries(t.training.assignments)) {
    const p=league.players[id];if(!p || p.tid!==t.id || p.injury>0)continue;
    const before=p.ovr;trainAttributes(p,focus,0.75+t.coach.development/100);
    notes.push({pid:id,name:p.name,focus,before,after:p.ovr});
  }
  t.training.campYear=league.year;t.training.campReport=notes;
  logTx(league,`${t.abbr} complete training camp`,[t.id]);return {ok:true,msg:"Training camp complete. Individual development reports are below."};
}
export function applyTrainingYear(league,p) {
  const t=league.teams[p.tid];if(!t)return;
  for(const [focus,work] of Object.entries(t.training?.earned[p.id] || {}))trainAttributes(p,focus,Math.min(2.5,work/18));
}
export function reviewOwner(league) {
  ensureFranchise(league);
  for(const t of league.teams) {
    if(t.owner.reviews.some(r=>r.year===league.year))continue;
    const g=t.owner.goal;
    const developed=[...t.roster,...t.prospects].map(id=>league.players[id]).filter(p=>p && p.age<=25 && (p.stats.gp>=25 || Object.values(t.training.earned[p.id] || {}).reduce((n,w)=>n+w,0)>=12 || g.startOvrs[p.id]!=null && p.ovr>=g.startOvrs[p.id]+1)).length;
    const wonSeries=league.playoffs?.rounds[0].some(s=>s.winner===t.id);
    const reached=league.playoffs?.rounds[0].some(s=>s.top===t.id || s.bot===t.id);
    const met=g.kind==="contend"?wonSeries:g.kind==="playoffs"?reached:developed>=3;
    t.owner.trust=clamp(t.owner.trust+(met?12:-10)+(league.playoffs?.champion===t.id?15:0),0,100);
    t.owner.reviews.unshift({year:league.year,goal:g.label,met,trust:t.owner.trust,rec:{...t.rec}});
    if(t.id===league.userTid)league.inbox.push({year:league.year,day:league.day,text:`Owner review: ${met?"goal achieved":"goal missed"} — ${g.label}. Job security ${t.owner.trust}/100.`});
  }
  const t=league.teams[league.userTid],yr=league.year;
  const award=(key,name)=>{if(!league.achievements.some(a=>a.key===key))league.achievements.push({key,name,year:yr});};
  if(t.rec.w>=50)award("fifty","50-win season");
  if(league.playoffs?.rounds[0].some(s=>s.top===t.id || s.bot===t.id))award("playoffs","First playoff appearance");
  if(league.playoffs?.champion===t.id)award("cup","Stanley Cup champion");
  if(Object.values(league.awards || {}).some(a=>a?.tid===t.id && a.pid))award("award","Individual NHL award winner");
  if(league.history.filter(h=>h.champion===t.id).length>=3)award("dynasty","Three Stanley Cups");
}
export function resetFranchiseYear(league) {
  for(const t of league.teams){t.training.earned={};t.training.paid=0;}
  league.coachMarket=Array.from({length:8},(_,i)=>coach(`${league.year}|market|${i}`));
  league.newsWeek=-1;league.mediaSnapshot={};for(const t of league.teams)if(t.arena)t.arena.paid=0;ensureFranchise(league);
}
