// One roster assessment shared by recruitment and the front office.
import {isGoalie,isDefense} from './constants.js';
const avg=a=>a.length?a.reduce((n,x)=>n+x,0)/a.length:0;
const positions=['C','LW','RW','LD','RD','G'];
const targets={C:4,LW:4,RW:4,LD:3,RD:3,G:2};
export function teamNeeds(lg,t){
 const roster=t.roster.map(id=>lg.players[id]).filter(Boolean),pipeline=t.prospects.map(id=>lg.players[id]).filter(Boolean);
 return positions.map(pos=>{
  const ps=roster.filter(p=>p.pos===pos).sort((a,b)=>b.ovr-a.ovr),healthy=ps.filter(p=>!p.injury&&!p.ltir);
  const key=pos==='G'?ps[0]:ps[pos==='C'?1:pos==='LD'||pos==='RD'?1:1];
  const ready=pipeline.filter(p=>p.pos===pos&&p.age<=25&&p.ovr>=74).length;
  const depth=Math.max(0,targets[pos]-healthy.length),quality=Math.max(0,82-(key?.ovr||62));
  const aging=ps.filter(p=>p.age>=32).length,expiring=ps.filter(p=>p.yrs===1&&!p.extension).length;
  const score=Math.max(0,Math.min(100,depth*24+quality*3+aging*5+expiring*5-ready*6));
  const reasons=[];if(depth)reasons.push(`${depth} healthy depth slot${depth===1?'':'s'} short`);if(quality>3)reasons.push(pos==='G'?'starter upgrade':'top-unit upgrade');if(aging)reasons.push('aging depth');if(expiring)reasons.push('expiring contracts');if(ready)reasons.push(`${ready} developing replacement${ready===1?'':'s'}`);
  return {pos,score,have:healthy.length,target:targets[pos],ready,reasons,role:pos==='G'?'starter / backup':pos==='C'?'top-six center':isDefense(pos)?'top-four defense':'scoring wing'};
 }).sort((a,b)=>b.score-a.score);
}
export function needFit(lg,t,p){const n=teamNeeds(lg,t).find(n=>n.pos===p.pos);return 1+Math.max(0,n?.score||0)*.0015;}
export function projectedRole(lg,t,p){
 const pool=t.roster.map(id=>lg.players[id]).filter(q=>q&&q.id!==p.id&&(isGoalie(q.pos)===isGoalie(p.pos))&&(isGoalie(p.pos)||isDefense(q.pos)===isDefense(p.pos)));
 const rank=pool.filter(q=>q.ovr>p.ovr).length;
 if(isGoalie(p.pos))return rank===0?'starter':'backup';
 if(isDefense(p.pos))return rank<2?'topPair':rank<4?'topFour':'depth';
 return rank<3?'topLine':rank<6?'topSix':'depth';
}
export const ROLE_LABELS={topLine:'First line',topSix:'Top six',topPair:'First pair',topFour:'Top four',depth:'Depth',starter:'Starting goalie',backup:'Backup goalie'};
export const ROLE_MINUTES={topLine:18,topSix:15,topPair:22,topFour:19,depth:9,starter:.55,backup:.15};
export function matchupPlan(lg,t,opponent){
 const ps=opponent.roster.map(id=>lg.players[id]).filter(p=>p&&!p.injury),f=ps.filter(p=>!isGoalie(p.pos)&&!isDefense(p.pos)),d=ps.filter(p=>isDefense(p.pos));
 const speed=avg(f.map(p=>p.attrs.spd)),defSpeed=avg(d.map(p=>p.attrs.spd)),goalie=ps.filter(p=>isGoalie(p.pos)).sort((a,b)=>b.ovr-a.ovr)[0];
 return {forecheck:defSpeed<80?'aggressive':'balanced',neutral:speed>85?'trap':'balanced',attack:(goalie?.ovr||80)<81?'shoot':'cycle',reason:`${opponent.abbr}: forward speed ${speed.toFixed(0)}, defense speed ${defSpeed.toFixed(0)}, starting-goalie rating ${goalie?.ovr||'—'}.`,opponent:opponent.id};
}
export function gamePlan(lg,t,opponent){return t.autoPlan===false?{forecheck:'balanced',neutral:'balanced',attack:'balanced',...t.gamePlan}:matchupPlan(lg,t,opponent);}
export function prospectReport(lg,t,p){
 const role=p.farmRole||'middle',st=p.farmStats||{},minutes=st.gp?st.toi/st.gp/60:0;
 const nhlRole=projectedRole(lg,t,p),better=t.roster.map(id=>lg.players[id]).filter(q=>q&&q.pos===p.pos).sort((a,b)=>b.ovr-a.ovr);
 const replacement=better.at(-1)?.ovr||74,ready=p.ovr>=Math.max(76,replacement-1)&&p.age>=19;
 const tooEasy=p.assignment!=='ahl'&&p.ovr>=76;
 const recommendation=ready?'Ready to compete for an NHL role':tooEasy?'Seek tougher competition in the AHL':role==='depth'?'Find a larger development role':'Continue this assignment with regular minutes';
 return {pid:p.id,ready,confidence:st.gp>=30?'High':st.gp>=12?'Moderate':'Early sample',minutes,points60:st.toi?((st.g||0)+(st.a||0))*3600/st.toi:0,recommendation,nhlRole,history:p.developmentHistory||[]};
}

// Sorting a candidate pool uses one immutable assessment of the current roster.
export function recruitmentOrder(lg,t){
 const weights=Object.fromEntries(teamNeeds(lg,t).map(n=>[n.pos,1+n.score*.0015]));
 return (a,b)=>b.ovr*(weights[b.pos]||1)-a.ovr*(weights[a.pos]||1);
}
