// Stateful CBA gameplay model. Missing historical service and salary data is estimated.
import { capForYear, minSalaryForYear, isGoalie } from "./constants.js";
import { clamp } from "./rng.js";

export const ownedIds = (t) => [...new Set([...t.roster, ...t.prospects, ...(t.rfaRights || [])])];
export const nhlGames = (p) => (p.service?.priorGames || 0) + (p.stats?.gp || 0) + (p.career || []).reduce((n,c)=>n+(c.s?.gp || 0),0);
export function ensureHockeyRules(lg) {
  lg.waivers ||= []; lg.offerSheets ||= []; lg.negotiations ||= {}; lg.conditions ||= [];
  for (const t of lg.teams) { t.rfaRights ||= []; t.retained ||= []; }
  for (const p of Object.values(lg.players)) {
    p.service ||= { firstAge: p.age > 23 ? 20 : p.age, years: p.src === "draft" ? 0 : Math.max(0,p.age-20), priorGames: p.src === "draft" ? 0 : Math.max(0,p.age-20)*55, estimated: p.src !== "draft" };
    if (!p.assignment) p.assignment = p.tid >= 0 && lg.teams[p.tid].prospects.includes(p.id) ? (p.signed === false ? (p.bio?.lg === "NCAA" ? "college" : ["OHL","WHL","QMJHL"].includes(p.bio?.lg) ? "junior" : "europe") : "ahl") : "nhl";
    if (p.draft && !p.rightsUntil) p.rightsUntil = p.draft.year + (p.bio?.lg === "NCAA" ? 4 : ["OHL","WHL","QMJHL"].includes(p.bio?.lg) ? 2 : 4);
  }
}
export function contractCount(lg,t) {
  return ownedIds(t).filter(id=>{const p=lg.players[id];return p?.signed !== false && p?.yrs>0 && !(p.elc && p.age<=19 && p.assignment==="junior" && (p.stats?.gp || 0)<11);}).length;
}
export const reserveCount = (lg,t) => ownedIds(t).filter(id=>lg.players[id]).length;
export const elcTerm = (age) => age <= 21 ? 3 : age <= 23 ? 2 : 1;
export const elcSalary = (year) => year <= 2026 ? 1 : Math.round((minSalaryForYear(year)+.175)*1000)/1000;
export function waiverStatus(p) {
  if (p.signed === false) return { exempt:true,reason:"Unsigned draft rights" };
  const age = clamp(p.service?.firstAge ?? Math.min(p.age,20),18,25);
  const table = isGoalie(p.pos) ? {18:[6,80],19:[5,80],20:[4,80],21:[4,60],22:[4,60],23:[3,60],24:[2,60],25:[1,Infinity]} : {18:[5,160],19:[4,160],20:[3,160],21:[3,80],22:[3,70],23:[3,60],24:[2,60],25:[1,Infinity]};
  const [years,games]=table[age];
  const elapsed=p.service?.years ?? Math.max(0,p.age-age);
  // The under-20 NHL participation exception shortens the remaining exemption.
  const youthPlayed = age<=19 && nhlGames(p)>=11;
  const yearsLimit=youthPlayed?Math.min(years,isGoalie(p.pos)?4:3):years;
  const exempt=elapsed<yearsLimit && nhlGames(p)<games;
  return {exempt,reason:exempt?"Waiver exempt":"Waivers required",estimated:p.service?.estimated ?? true};
}
export const buriedCap = (p,year) => p?.signed !== false && p?.yrs>0 ? Math.max(0,p.cap-minSalaryForYear(year)-.375) : 0;
export function rawPayroll(lg,t,year=lg.year) {
  let total=t.roster.reduce((n,id)=>n+(lg.players[id]?.yrs>0?lg.players[id].cap:0),0);
  total+=t.prospects.reduce((n,id)=>n+buriedCap(lg.players[id],year),0);
  total+=(t.deadCap || []).filter(d=>!(d.offset>0)).reduce((n,d)=>n+d.amt,0)+(t.retained || []).reduce((n,d)=>n+d.amt,0);
  if(t.bonusCarry?.year===year)total+=t.bonusCarry.amount;
  return Math.round(total*100)/100;
}
export function ltirRelief(lg,t) {
  const entries=t.roster.map(id=>lg.players[id]).filter(p=>p?.ltir);
  if (!entries.length || lg.phase==="playoffs") return 0;
  return Math.max(0,entries.reduce((n,p)=>n+p.cap,0)-(t.ltirUnused || 0));
}
export function qualifyingAmount(p,year) {
  const salary=p.prevCap || p.cap || minSalaryForYear(year);
  return Math.round(Math.max(minSalaryForYear(year),(salary<=1.25?salary*1.1:salary<1.75?Math.min(1.75,salary*1.05):salary))*100)/100;
}
export function moveRestriction(p,toTid) {
  if (p.ltir || p.waiverPending) return "Player is on LTIR or pending waivers.";
  if (!p.clause || p.clause.waivedTo?.includes(toTid)) return null;
  if (p.clause.type==="NMC" || p.clause.blocked?.includes(toTid)) return `${p.name} has not waived his ${p.clause.type}.`;
  return null;
}
export function retentionIssue(lg,t,p,pct) {
  if(!Number.isFinite(pct) || pct<0 || pct>.5)return "Salary retention must be between 0% and 50%.";
  if(!pct)return null;
  if(p.yrs<=0 || p.signed===false)return "Only signed contracts can have salary retained.";
  if((p.retentionCount || 0)>=2)return "This contract already has two retaining clubs.";
  if(t.retained.length>=3)return "A club may retain on at most three contracts.";
  if(t.retained.reduce((n,r)=>n+r.amt,0)+p.cap*pct>capForYear(lg.year)*.15)return "Retention exceeds 15% of the cap.";
  return null;
}
export function retainSalary(lg,t,p,pct) {
  if(!pct)return;
  const amt=Math.round(p.cap*pct*100)/100;
  t.retained.push({pid:p.id,name:p.name,amt,yrs:p.yrs});p.cap=Math.round((p.cap-amt)*100)/100;p.retentionCount=(p.retentionCount || 0)+1;
}
