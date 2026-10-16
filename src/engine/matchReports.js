// These are conditional-on-shot model probabilities, not a public fitted xG model.
export function matchReport(s,id){
 const units={h:[],a:[]},notes=[];
 for(const k of ['h','a']){
  const shots=(s.shotLog || []).filter(a=>a.side===k);
  for(const [unit,u] of Object.entries(s.unitStats?.[k] || {})){
   const attempts=shots.filter(a=>a.unit===unit),on=attempts.filter(a=>['save','goal'].includes(a.result));
   const against=(s.shotLog || []).filter(a=>a.side!==k && a.defendingUnit===unit);
   units[k].push({unit,minutes:u.seconds/60,attempts:attempts.length,shots:on.length,shotsAgainst:against.filter(a=>['save','goal'].includes(a.result)).length,goals:attempts.filter(a=>a.result==='goal').length,goalsAgainst:against.filter(a=>a.result==='goal').length,chance:on.reduce((n,a)=>n+(a.chance||0),0)});
  }
  const sp=s.special[k];if(sp.opportunities)notes.push(`${s[k].abbr}: ${sp.goals}/${sp.opportunities} on the power play (${(sp.seconds/60).toFixed(1)} minutes).`);
  const controlled=s.decisions[k]['controlled-entry']||0,dumps=s.decisions[k]['dump-and-chase']||0;
  if(controlled+dumps)notes.push(`${s[k].abbr}: ${controlled} controlled entries, ${dumps} dump-ins.`);
 }
 const goalies=Object.entries(s.gbox).map(([pid,b])=>({pid,name:s.h.pl[pid]?.name || s.a.pl[pid]?.name,sa:b.sa,ga:b.ga,savePct:b.sa?(b.sa-b.ga)/b.sa:null,modelGoals:(s.shotLog || []).filter(a=>a.goalie===pid&&a.chance!=null).reduce((n,a)=>n+a.chance,0)}));
 return {id,year:s.year,day:s.day,home:s.h.tid,away:s.a.tid,score:{...s.score},endedIn:s.endedIn,shots:{...s.shots},special:structuredClone(s.special),units,goalies,notes,shotLog:structuredClone(s.shotLog || []),plans:{h:s.h.plan,a:s.a.plan},players:Object.entries(s.box).filter(([,b])=>b.toi>0).map(([pid,b])=>({pid,name:s.h.pl[pid]?.name || s.a.pl[pid]?.name,...b,points60:b.toi?b.pts*3600/b.toi:0}))};
}
export function recordReport(lg,s,id){
 const reports=lg.gameReports ||= [];if(reports.some(r=>r.id===id))return;
 reports.push(matchReport(s,id));if(reports.length>20)reports.shift();
}
