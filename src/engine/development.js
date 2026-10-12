import {stream,clamp} from "./rng.js";
import {isGoalie,isDefense} from "./constants.js";
import {defaultArchetype,computeOvr} from "./ratings.js";
import {syncLines,autoLines} from "./lines.js";
import {callUp,sendDown,canSendDown,capSpace,counts,logTx} from "./roster.js";

export function createAssistant(key,role) {
  const r=stream(key);return {id:key,role,name:`${r.pick(["Pat","Chris","Alex","Daniel","Johan","Mikko"])} ${r.pick(["Mercer","Wilson","Larsson","Roy","Campbell","Lehtinen"])}`,development:r.int(62,92),specialTeams:r.int(62,92),goaltending:r.int(62,92)};
}
export function ensureDevelopment(lg) {
  lg.assistantMarket ||= ["assistant","goalie"].flatMap(role=>Array.from({length:4},(_,i)=>createAssistant(`${lg.year}|${role}|${i}`,role)));
  for(const t of lg.teams){t.staff ||= {assistant:createAssistant(`${t.id}|assistant|initial`,"assistant"),goalie:createAssistant(`${t.id}|goalie|initial`,"goalie")};t.lineExperience ||= {};}
}
export function hireAssistant(lg,id) {
  if(!["preseason","resign","freeagency"].includes(lg.phase))return {ok:false,msg:"Staff hiring opens in preseason and the offseason."};
  const c=lg.assistantMarket.find(c=>c.id===id),t=lg.teams[lg.userTid];if(!c)return {ok:false,msg:"That coach is unavailable."};
  const old=t.staff[c.role];t.staff[c.role]=c;lg.assistantMarket=lg.assistantMarket.filter(x=>x.id!==id);if(old)lg.assistantMarket.push(old);
  return {ok:true,msg:`${c.name} hired as ${c.role} coach.`};
}
export function schemeFit(p,t) {
  const style=t.strategy || t.coach?.style || "balanced";
  const preferred=style==="attack"?["SNP","PLY","OFD"]:style==="defend"?["TWF","DFD","TWD","GRN"]:["PWF","TWF","TWD"];
  return preferred.includes(p.type)?.7:0;
}
export function lineChemistry(lg,t,ids) {
  const players=ids.map(id=>lg.players[id]).filter(Boolean),types=new Set(players.map(p=>p.type));
  const complementary=types.has("PLY") && types.has("SNP")?1:types.size>=3?.4:0;
  const experience=t.lineExperience[ids.join("|")] || 0;
  return Math.min(2,complementary+experience/26);
}
export function coachingEffects(lg,t) {
  ensureDevelopment(lg);return {pp:1+((t.staff.assistant.specialTeams+(t.coach?.specialTeams ?? 78))/2-78)*.002,pk:1+(t.staff.assistant.specialTeams-78)*.0018,goalie:(t.staff.goalie.goaltending-78)*.03};
}
export function developmentWeek(lg) {
  ensureDevelopment(lg);const week=Math.floor(lg.day/7);
  for(const t of lg.teams){
    if((t.farmWeek || 0)>=week)continue;
    const elapsed=week-(t.farmWeek || 0);t.farmWeek=week;
    for(const line of t.lines?.F || []){const key=line.join("|");t.lineExperience[key]=Math.min(26,(t.lineExperience[key] || 0)+elapsed);}
    for(const id of [...t.roster,...t.prospects]){
      const p=lg.players[id];if(!p)continue;
      if(p.positionTraining && !p.injury){p.positionTraining.weeks+=elapsed;if(p.positionTraining.weeks>=8){
        const to=p.positionTraining.to;p.naturalPos ||= p.pos;p.pos=to;p.type=defaultArchetype(to);delete p.ovrOffset;p.ovr=Math.min(99,Math.max(40,computeOvr(p.attrs,p.type)+(p.ovrOffset || 0)));p.pot=Math.max(p.pot,p.ovr);delete p.positionTraining;
        if(t.lines){t.lines.F=t.lines.F.map(line=>line.map(x=>x===id?null:x));t.lines.D=t.lines.D.map(line=>line.map(x=>x===id?null:x));syncLines(lg,t);}
        logTx(lg,`${p.name} completes position training at ${to}`,[t.id]);
      }}
      if(!t.prospects.includes(id) || p.injury>0)continue;
      const st=p.farmStats ||= {gp:0,g:0,a:0,w:0,sa:0,ga:0,year:lg.year};
      const role=p.farmRole || "middle",usage=role==="top"?1.15:role==="depth"?.7:1;
      const games=elapsed*(p.assignment==="college"?1:2);const r=stream(`${id}|farm|${lg.year}|${week}`);
      st.gp+=games;
      if(isGoalie(p.pos)){st.w+=Math.round(games*.55);st.sa+=games*28;st.ga+=Math.round(games*(3.5-(p.ovr-65)*.06));}
      else {const pts=Math.round(games*Math.max(.15,(p.ovr-45)/30)*usage*(isDefense(p.pos)?.6:1)*(0.85+r.next()*.3));const goals=Math.round(pts*.4);st.g+=goals;st.a+=pts-goals;}
      p.farmWork=(p.farmWork || 0)+elapsed*usage*(.6+(t.coach.development+t.staff[isGoalie(p.pos)?"goalie":"assistant"].development)/300+(t.arena?.training || 0)*.05);
    }
  }
}
export function usageGrowth(lg,p) {
  if(p.age>26)return 0;
  const t=lg.teams[p.tid];if(!t)return 0;
  if(t.prospects.includes(p.id))return Math.min(.7,(p.farmWork || 0)/50);
  const s=p.stats;
  const share=isGoalie(p.pos)?s.gp/45:s.gp?Math.min(1,s.toi/s.gp/(isDefense(p.pos)?1200:900)):0;
  return clamp((share-.45)*.65,-.25,.45);
}
export function requestPosition(lg,pid,to) {
  const p=lg.players[pid];if(!p || p.tid!==lg.userTid || p.pos==="G" || !["C","LW","RW","LD","RD"].includes(to) || to===p.pos)return {ok:false,msg:"Choose another skater position."};
  if(p.positionTraining)return {ok:false,msg:"A position course is already in progress."};
  p.positionTraining={to,weeks:0};return {ok:true,msg:`Eight healthy scouting weeks of training started at ${to}.`};
}
export function runCampBattles(lg) {
  const t=lg.teams[lg.userTid];if(lg.phase!=="preseason" || t.battlesYear===lg.year)return {ok:false,msg:"Camp battles run once each preseason."};
  const reports=[];
  for(const pos of ["C","LW","RW","LD","RD","G"]){
    const candidates=[...t.roster,...t.prospects].map(id=>lg.players[id]).filter(p=>p && p.pos===pos && !p.injury && !p.ltir).sort((a,b)=>b.ovr-a.ovr);
    const pair=candidates.filter(p=>p.age<=25).slice(0,2);if(pair.length<2 || Math.abs(pair[0].ovr-pair[1].ovr)>5)continue;
    const scores=pair.map(p=>({p,score:p.ovr+stream(`${p.id}|battle|${lg.year}`).next()*5})).sort((a,b)=>b.score-a.score);
    const winner=scores[0].p;reports.push({pos,winner:winner.id,name:winner.name,other:scores[1].p.name});
    if(t.prospects.includes(winner.id) && counts(lg,t).active<23 && capSpace(lg,t)>=winner.cap)callUp(lg,t,winner.id);
  }
  t.battlesYear=lg.year;t.battleReport=reports;return {ok:true,msg:`Camp resolved ${reports.length} position battles. Promotions respect cap, roster and waiver constraints.`};
}
export function resetDevelopment(lg){for(const t of lg.teams)t.farmWeek=0;for(const p of Object.values(lg.players)){if(p.farmStats){(p.farmHistory ||= []).push(p.farmStats);delete p.farmStats;}p.farmWork=0;}ensureDevelopment(lg);}
