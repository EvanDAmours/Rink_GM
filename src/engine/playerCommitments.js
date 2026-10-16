import {isGoalie,isDefense} from './constants.js';
import {projectedRole,ROLE_MINUTES,ROLE_LABELS} from './teamPlanning.js';
export function promiseRole(lg,p,tid,role){
 if(!p||!ROLE_MINUTES[role]||isGoalie(p.pos)!==['starter','backup'].includes(role)||['topPair','topFour'].includes(role)&&!isDefense(p.pos)||['topLine','topSix'].includes(role)&&isDefense(p.pos))return false;
 const future=['resign','freeagency'].includes(lg.phase);
 p.rolePromise={tid,role,year:lg.year+(future?1:0),nextReview:lg.phase==='regular'?lg.day+28:28,gp:future?0:isGoalie(p.pos)?p.stats.gs:p.stats.gp,toi:future?0:p.stats.toi,teamGp:future?0:lg.teams[tid].rec.gp,unavailable:0,misses:0,status:'pending',trust:p.relationship?.trust??70};return true;
}
export function roleUtility(lg,t,p,role){
 const expected=ROLE_MINUTES[projectedRole(lg,t,p)],offered=ROLE_MINUTES[role]||expected;
 return Math.max(-1,Math.min(1,(offered-expected)/(isGoalie(p.pos)?.3:8)));
}
export function commitmentWeek(lg){
 for(const p of Object.values(lg.players)){
  const a=p.rolePromise;if(!a||a.tid!==p.tid||a.year>lg.year)continue;
  const t=lg.teams[p.tid];if(!t)continue;
  if(a.year!==lg.year){a.year=lg.year;a.gp=0;a.toi=0;a.teamGp=0;a.unavailable=0;a.nextReview=28;}
  if(lg.day<(a.nextReview??28))continue;
  const gp=(isGoalie(p.pos)?p.stats.gs:p.stats.gp)-a.gp,teamGp=t.rec.gp-a.teamGp,eligible=Math.max(0,teamGp-(a.unavailable||0));
  if(eligible<6)continue; // injury absences do not count as missed playing-time promises
  const actual=isGoalie(p.pos)?gp/eligible:(p.stats.toi-a.toi)/Math.max(1,gp,eligible*.85)/60;
  const fulfilled=actual>=ROLE_MINUTES[a.role]*.85;
  a.trust=Math.max(0,Math.min(100,a.trust+(fulfilled?4:-12)));a.misses=fulfilled?0:a.misses+1;
  a.status=fulfilled?'fulfilled':'unhappy';a.actual=actual;a.nextReview=lg.day+28;a.gp=isGoalie(p.pos)?p.stats.gs:p.stats.gp;a.toi=p.stats.toi;a.teamGp=t.rec.gp;a.unavailable=0;
  p.relationship={trust:a.trust,reason:fulfilled?'Agreed role delivered':'Playing time below the agreed role'};
  if(a.misses>=3&&a.trust<40)p.wantsTrade=true;
  if(t.id===lg.userTid&&!fulfilled)lg.inbox.push({year:lg.year,day:lg.day,text:`${p.name}: promised ${ROLE_LABELS[a.role]}, receiving ${isGoalie(p.pos)?(actual*100).toFixed(0)+'% of available starts':actual.toFixed(1)+' minutes per available game'}. Trust ${a.trust}/100.${p.wantsTrade?' Requests a trade.':''}`});
 }
}
