import { isGoalie } from "./constants.js";

export const RECORD_LABELS={g:"Goals",a:"Assists",pts:"Points",w:"Goalie wins",so:"Shutouts",sa:"Goalie saves"};
export function ensureRecords(league) {
  league.recordBook ||= {game:{},season:{},career:{}};
  league.seasonArchive ||= [];
}
function consider(book,key,value,p,league,extra={}) {
  if(!Number.isFinite(value) || value<=0 || value<=(book[key]?.value || 0))return;
  book[key]={pid:p.id,name:p.name,pos:p.pos,tid:p.tid,value,year:league.year,...extra};
}
export function recordGame(league,result) {
  ensureRecords(league);
  for(const [pid,s] of Object.entries(result.box || {})) {
    const p=league.players[pid];if(!p)continue;
    for(const k of isGoalie(p.pos)?["so"]:["g","a","pts"])consider(league.recordBook.game,k,s[k],p,league,{day:league.day});
  }
  for(const [pid,g] of Object.entries(result.gbox || {})) {
    const p=league.players[pid];if(p)consider(league.recordBook.game,"sa",Math.max(0,g.sa-g.ga),p,league,{day:league.day});
  }
}
export function updateRecords(league) {
  ensureRecords(league);
  for(const p of Object.values(league.players)) {
    if(p.tid===-2)continue;
    for(const key of isGoalie(p.pos)?["w","so","sa"]:["g","a","pts"]) {
      consider(league.recordBook.season,key,key==="sa"?(p.stats.sa-p.stats.ga):p.stats[key],p,league);
      const total=p.career.reduce((s,c)=>s+(key==="sa"?((c.s?.sa || 0)-(c.s?.ga || 0)):(c.s?.[key] || (key==="pts"?(c.s?.g || 0)+(c.s?.a || 0):0))),0)+(key==="sa"?(p.stats.sa-p.stats.ga):(p.stats[key] || 0));
      consider(league.recordBook.career,key,total,p,league);
    }
  }
}
export function archiveSeason(league) {
  ensureRecords(league);updateRecords(league);
  if(league.seasonArchive.some(s=>s.year===league.year))return;
  league.seasonArchive.unshift({year:league.year,teams:league.teams.map(t=>({tid:t.id,rec:{...t.rec},playoff:t.playoffResult})),leaders:Object.values(league.players).filter(p=>p.stats.gp && p.tid!==-2).map(p=>({pid:p.id,name:p.name,tid:p.tid,pos:p.pos,stats:{...p.stats}}))});
}

export function franchiseRecords(league,tid){
  const best={season:{},team:{}};
  for(const year of league.seasonArchive || []){
    const club=year.teams.find(t=>t.tid===tid);if(club)for(const [key,value] of Object.entries(club.rec))if(['w','pts','gf'].includes(key) && value>(best.team[key]?.value || 0))best.team[key]={value,year:year.year};
    for(const p of year.leaders.filter(p=>p.tid===tid))for(const key of isGoalie(p.pos)?['w','so']:['g','a','pts'])if(p.stats[key]>(best.season[key]?.value || 0))best.season[key]={pid:p.pid,name:p.name,year:year.year,value:p.stats[key]};
  }
  return best;
}
