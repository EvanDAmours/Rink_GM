// One roster assessment shared by recruitment, the front office, your scouts, the draft room and
// the AI clubs' drafts (Gridiron 2.69: one needs model). teamNeeds is the positional answer;
// orgDepth adds the prospect pipeline for the draft; roleNeeds says which roles (sniper, net-front,
// shutdown D, power-play quarterback...) your lineup is thin at.
import {isGoalie,isDefense} from './constants.js';
import {IDENTITIES} from './roles.js';
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
  let score=Math.max(0,Math.min(100,depth*24+quality*3+aging*5+expiring*5-ready*6));
  const reasons=[];if(depth)reasons.push(`${depth} healthy depth slot${depth===1?'':'s'} short`);if(quality>3)reasons.push(pos==='G'?'starter upgrade':'top-unit upgrade');if(aging)reasons.push('aging depth');if(expiring)reasons.push('expiring contracts');if(ready)reasons.push(`${ready} developing replacement${ready===1?'':'s'}`);
  // The goalie of the future: a starter at 33 or older with nobody coming through the system.
  if(pos==='G'&&ps[0]&&ps[0].age>=33&&!pipeline.some(p=>isGoalie(p.pos)&&p.age<=25&&p.pot>=80)){score=Math.max(score,45);reasons.push('no goalie of the future');}
  return {pos,score,have:healthy.length,target:targets[pos],ready,reasons,role:pos==='G'?'starter / backup':pos==='C'?'top-six center':isDefense(pos)?'top-four defense':'scoring wing'};
 }).sort((a,b)=>b.score-a.score);
}

// Organizational depth by position for the draft: the NHL roster plus the prospect pipeline.
// { [pos]: { nhl: good NHL players, young: good players 25 and under, pipeline: prospects who
// project as NHL regulars, starter: the best NHL player there, locked: a young starting goalie
// (and a goalie prospect) in place, so the club doesn't spend an early pick on another one } }.
export function orgDepth(lg,t){
 const roster=t.roster.map(id=>lg.players[id]).filter(Boolean),pipeline=t.prospects.map(id=>lg.players[id]).filter(Boolean),out={};
 for(const pos of positions){
  const ps=roster.filter(p=>p.pos===pos).sort((a,b)=>b.ovr-a.ovr),pipe=pipeline.filter(p=>p.pos===pos);
  const nhl=ps.filter(p=>p.ovr>=(pos==='G'?80:78)).length,young=ps.filter(p=>p.age<=25&&p.ovr>=76).length,pipelineN=pipe.filter(p=>p.pot>=(pos==='G'?80:78)).length;
  const starter=ps[0]||null;
  const locked=pos==='G'&&!!starter&&starter.age<=28&&starter.ovr>=83&&pipe.some(p=>p.pot>=78);
  out[pos]={nhl,young,pipeline:pipelineN,starter:starter?{ovr:starter.ovr,age:starter.age}:null,locked};
 }
 return out;
}

// ---------- Roles (Gridiron 3.23: built for the role) ----------
// A player's natural role is his EA player type. Goalies have no role tag.
export const ROLE_TAGS={
 SNP:{tag:'SNIPER',name:'Sniper',group:'F'},PLY:{tag:'PLAYMAKER',name:'Playmaker',group:'F'},PWF:{tag:'NET-FRONT',name:'Net-front power forward',group:'F'},
 TWF:{tag:'TWO-WAY',name:'Two-way forward',group:'F'},GRN:{tag:'CHECKER',name:'Checking-line grinder',group:'F'},ENF:{tag:'ENFORCER',name:'Enforcer',group:'F'},
 OFD:{tag:'PP QB',name:'Power-play quarterback',group:'D'},DFD:{tag:'SHUTDOWN',name:'Shutdown defenseman',group:'D'},TWD:{tag:'TWO-WAY D',name:'Two-way defenseman',group:'D'},END:{tag:'PHYSICAL D',name:'Physical defenseman',group:'D'},
};
export const roleOf=p=>(p&&ROLE_TAGS[p.type]&&!isGoalie(p.pos)?p.type:null);
// Where a lineup wants each role and the level it wants it at: a top-six sniper and playmaker, a
// net-front presence, a two-way forward and a checker for the bottom six and the penalty kill, a
// power-play quarterback and a shutdown man in the top four. Enforcers are never a need.
const ROLE_BAR={SNP:[84,1],PLY:[84,1],PWF:[81,0.9],TWF:[79,0.8],GRN:[75,0.6],ENF:[0,0],OFD:[82,1],DFD:[81,1],TWD:[79,0.8],END:[0,0]};
// { [type]: 0..1 } how thin the healthy NHL lineup is at each role (1: nobody near the bar).
export function roleNeeds(lg,t){
 const healthy=t.roster.map(id=>lg.players[id]).filter(p=>p&&!p.injury&&!p.ltir),out={};
 for(const [k,[bar,w]] of Object.entries(ROLE_BAR)){
  if(!bar){out[k]=0;continue;}
  const best=healthy.filter(p=>p.type===k&&!isGoalie(p.pos)).reduce((m,p)=>Math.max(m,p.ovr),60);
  out[k]=+(w*Math.max(0,Math.min(1,(bar-best)/16))).toFixed(3);
 }
 return out;
}
export const roleFit=(p,needs)=>{const k=roleOf(p);return k&&needs?needs[k]||0:0;};
// Filter values for player lists: [value, label].
export const ROLE_FILTERS=Object.entries(ROLE_TAGS).map(([k,r])=>[`R:${k}`,`${r.group==='D'?'D':'F'} · ${r.name}`]);
export const roleFilterMatch=(p,v)=>!String(v).startsWith('R:')||roleOf(p)===String(v).slice(2);
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
// The coaches' pick follows the opponent, leaning toward the club's identity (roles.js IDENTITIES:
// Heavy forechecks and shoots, Speed rushes, Skill cycles, Defensive traps). Unset: no lean.
export function gamePlan(lg,t,opponent){
 if(t.autoPlan===false)return {forecheck:'balanced',neutral:'balanced',attack:'balanced',...t.gamePlan};
 const plan=matchupPlan(lg,t,opponent),lean=IDENTITIES[t.identity]?.plan;
 return lean?{...plan,...lean,reason:`${plan.reason} ${IDENTITIES[t.identity].name} identity.`}:plan;
}
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
