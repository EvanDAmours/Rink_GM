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

// Career totals: simulated seasons plus the current one, plus any real NHL games
// a player brought in with him (service.priorGames). Goals and points before the
// franchise started are not tracked, so milestone counts are Rink GM totals.
const sum=(p,key)=>(p.career || []).reduce((s,c)=>s+(c.s?.[key] ?? (key==="pts"?(c.s?.g || 0)+(c.s?.a || 0):0)),0)+(p.stats?.[key] ?? (key==="pts"?(p.stats?.g || 0)+(p.stats?.a || 0):0));
export function careerTotals(p){
  const g=isGoalie(p.pos);
  const t={gp:sum(p,"gp"),seasons:(p.career?.length || 0)+(p.stats?.gp?1:0),priorGames:p.service?.priorGames || 0};
  if(g){t.w=sum(p,"w");t.l=sum(p,"l");t.otl=sum(p,"otl");t.so=sum(p,"so");t.sa=sum(p,"sa");t.ga=sum(p,"ga");t.svpct=t.sa?(t.sa-t.ga)/t.sa:0;}
  else{t.g=sum(p,"g");t.a=sum(p,"a");t.pts=t.g+t.a;t.pm=sum(p,"pm");t.pim=sum(p,"pim");t.pgp=(p.career || []).reduce((s,c)=>s+(c.ps?.gp || 0),0)+(p.pstats?.gp || 0);t.ppts=(p.career || []).reduce((s,c)=>s+(c.ps?.pts ?? ((c.ps?.g || 0)+(c.ps?.a || 0))),0)+(p.pstats?.pts || 0);}
  t.nhlGp=t.gp+t.priorGames;
  return t;
}
export const MILESTONES={gp:[500,1000,1500],g:[100,250,500,700],a:[250,500,1000],pts:[250,500,1000,1500],w:[100,200,300,400,500],so:[25,50,75]};
const MILESTONE_LABEL={gp:"games",g:"goals",a:"assists",pts:"points",w:"wins",so:"shutouts"};
export function careerMilestones(p){
  const t=careerTotals(p),out=[];
  for(const [key,marks] of Object.entries(MILESTONES)){
    if(isGoalie(p.pos)?!["gp","w","so"].includes(key):!["gp","g","a","pts"].includes(key))continue;
    const v=t[key];for(const m of marks)if(v>=m)out.push({key,mark:m,label:`${m.toLocaleString("en-US")} ${MILESTONE_LABEL[key]}`});
  }
  return out;
}
// Weekly: a player who just crossed a career mark makes the news (every team), and
// the inbox when he is yours. league.milestones remembers what has been reported.
export function checkMilestones(league){
  league.milestones ||= {};
  const user=league.userTid;let posted=0;
  for(const t of league.teams)for(const id of t.roster){
    const p=league.players[id];if(!p || !p.stats?.gp)continue;
    for(const m of careerMilestones(p)){
      const k=`${id}:${m.key}:${m.mark}`;if(league.milestones[k])continue;
      league.milestones[k]=league.year;
      if(!p.stats.gp || posted>6)continue;
      const career=careerTotals(p);
      const big=m.mark>=500 || m.key==="w"&&m.mark>=200 || m.key==="so"&&m.mark>=50;
      if(big || t.id===user){
        league.news ||= [];league.news.unshift({year:league.year,day:league.day,type:"milestone",pid:id,text:`Milestone: ${p.name} reached ${m.label} in this franchise (${t.abbr}), ${career.seasons} season${career.seasons===1?"":"s"} in.`});posted++;
      }
      if(t.id===user)league.inbox?.push({year:league.year,day:league.day,text:`🏅 ${p.name} hit ${m.label}. The milestone is marked on his card.`});
    }
  }
}
// All-time leaders across everyone who has played in this league, retired players included.
export function careerLeaders(league,{limit=10}={}){
  const rows={g:[],a:[],pts:[],gp:[],w:[],so:[]};
  const add=(p,active,tid)=>{const t=careerTotals(p);const base={pid:p.id,name:p.name,pos:p.pos,tid,active,seasons:t.seasons};
    if(isGoalie(p.pos)){rows.w.push({...base,value:t.w});rows.so.push({...base,value:t.so});}else{rows.g.push({...base,value:t.g});rows.a.push({...base,value:t.a});rows.pts.push({...base,value:t.pts});}
    rows.gp.push({...base,value:t.gp});};
  for(const p of Object.values(league.players))if(p.tid!==-2 && (p.career?.length || p.stats?.gp))add(p,true,p.tid);
  for(const r of league.retirementArchive || [])if(r.player)add(r.player,false,r.tid);
  for(const k in rows)rows[k]=rows[k].filter(r=>r.value>0).sort((a,b)=>b.value-a.value).slice(0,limit);
  return rows;
}
