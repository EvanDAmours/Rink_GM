import { resignAsk } from "./offseason.js";
import { capForYear, minSalaryForYear, maxSalaryForYear } from "./constants.js";
import { logTx } from "./roster.js";
export function futurePayroll(league,team) {
  return [...team.roster,...team.prospects].reduce((s,id)=>{const p=league.players[id];return s+(p?.extension?.aav || (p?.signed!==false && p?.yrs>1?p.cap:0));},0)+(team.retained || []).filter(d=>d.yrs>1).reduce((s,d)=>s+d.amt,0)+team.deadCap.filter(d=>d.offset===1 || !d.offset && d.yrs>1).reduce((s,d)=>s+d.amt,0);
}
export function extendPlayer(league,pid,aav,years,{agreed=false}={}) {
  const p=league.players[pid],t=league.teams[league.userTid];
  if(!p || p.tid!==t.id || p.signed===false || p.yrs!==1 || p.extension)return {ok:false,msg:"Extensions are available in the final year of a signed contract."};
  if(!["regular","preseason","playoffs"].includes(league.phase))return {ok:false,msg:"Use re-signing for expired contracts during the offseason."};
  if(!Number.isInteger(years) || years<1 || years>7 || !Number.isFinite(aav) || aav<minSalaryForYear(league.year+1) || aav>maxSalaryForYear(league.year+1))return {ok:false,msg:"Enter a legal 1–7 year contract and a valid AAV."};
  const ask=resignAsk(league,p,years);
  if(!agreed && aav<ask.aav)return {ok:false,msg:`${p.name} asks for $${ask.aav.toFixed(2)}M AAV on that term.`};
  if(futurePayroll(league,t)+aav>capForYear(league.year+1))return {ok:false,msg:"That extension exceeds next season's projected cap."};
  p.extension={aav,yrs:years,start:league.year+1};
  logTx(league,`${t.abbr} extend ${p.name}: ${years} years at $${aav.toFixed(2)}M, starting next season`,[t.id]);
  return {ok:true,msg:`${p.name} extended. His current cap hit is unchanged until the deal begins.`};
}
