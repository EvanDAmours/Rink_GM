import { isGoalie } from "./constants.js";
import { HISTORICAL_RECORDS as H } from "../data/historicalRecords.js";
import { checkFranchiseLeaders } from "./legacy.js";

export const RECORD_LABELS={g:"Goals",a:"Assists",pts:"Points",w:"Goalie wins",so:"Shutouts",sa:"Goalie saves"};
export function ensureRecords(league) {
  league.recordBook ||= {game:{},season:{},career:{}};
  league.seasonArchive ||= [];
  // The real single-season marks your league can take (Gridiron 2.10). Only marks beaten in this
  // league are stored; everything else reads straight from the real NHL data.
  if(!league.recordBook.marks){league.recordBook.marks={nhl:{},franchise:{},history:[]};backfillMarks(league);}
  league.recordBook.marks.nhl ||= {};league.recordBook.marks.franchise ||= {};league.recordBook.marks.history ||= [];
}

// ---------- Single-season record marks: the NHL's and every club's ----------
// key: the mark; stat: player stat (or team: the club's record field); goalie: whose stat it is.
// The NHL's top single season; a shared record names everyone on it (Holtby and Brodeur, 48 wins).
const topRow=(rows=[])=>{const best=rows.filter((r)=>r.value===rows[0]?.value);return best.length<2?rows[0]:{...best[0],name:best.map((r)=>r.name).join(" & "),season:best.map((r)=>r.season).join(", "),team:best.map((r)=>r.team).join("/")};};
export const SEASON_MARKS=[
  {key:"g",label:"Goals",stat:"g",goalie:false,nhl:()=>topRow(H.league.seasonSkater.goals),club:(F)=>F.seasonSkater.goals},
  {key:"a",label:"Assists",stat:"a",goalie:false,nhl:()=>topRow(H.league.seasonSkater.assists),club:(F)=>F.seasonSkater.assists},
  {key:"pts",label:"Points",stat:"pts",goalie:false,nhl:()=>topRow(H.league.seasonSkater.points),club:(F)=>F.seasonSkater.points},
  {key:"w",label:"Goalie wins",stat:"w",goalie:true,nhl:()=>topRow(H.league.seasonGoalie.wins),club:(F)=>F.seasonGoalie.wins},
  {key:"so",label:"Shutouts",stat:"so",goalie:true,nhl:()=>topRow(H.league.seasonGoalie.shutouts),club:(F)=>F.seasonGoalie.shutouts},
  {key:"tw",label:"Team wins",team:"w",nhl:()=>H.league.teamSeason.wins,club:(F)=>({...F.team.wins,name:F.name})},
  {key:"tpts",label:"Team points",team:"pts",nhl:()=>H.league.teamSeason.points,club:(F)=>({...F.team.points,name:F.name})},
  {key:"tgf",label:"Team goals",team:"gf",nhl:()=>H.league.teamSeason.goalsFor,club:(F)=>({...F.team.goalsFor,name:F.name})},
];
const MARK=Object.fromEntries(SEASON_MARKS.map((d)=>[d.key,d]));
// "Wayne Gretzky's", "Edmonton Oilers'".
export const poss=(name)=>(/s$/i.test(String(name || ""))?`${name}'`:`${name}'s`);
export const seasonText=(y)=>(typeof y==="string"?y:y==null?"":`${y}-${String(y+1).slice(2)}`);
const realMark=(scope,key,abbr)=>{
  const d=MARK[key];if(!d)return null;
  const r=scope==="nhl"?d.nhl():H.franchises[abbr]?d.club(H.franchises[abbr]):null;
  return r && r.value>0?{value:r.value,name:r.name,season:r.season,team:r.team || (scope==="nhl"?null:abbr),real:true}:null;
};
// The mark that stands now: one set in your league, else the real one. scope: "nhl" | "franchise".
export function seasonMark(league,scope,key,abbr){
  const m=league.recordBook?.marks;
  const set=scope==="nhl"?m?.nhl?.[key]:m?.franchise?.[abbr]?.[key];
  return set || realMark(scope,key,abbr);
}
// What the book shows for a beaten mark: no nested history, just who held it and when.
const asPrev=(r)=>r && {value:r.value,name:r.name,season:r.season || seasonText(r.year),team:r.team || null,...(r.real?{real:true}:{}),...(r.pid!=null?{pid:r.pid}:{})};
// Leaders this season: the top player (or club) for a mark, among `players` / `teams`.
function leader(d,players,teams,statsOf){
  let top=null;
  if(d.team){for(const t of teams){const v=t.rec?.[d.team] || 0;if(v>0 && (!top || v>top.v))top={t,v};}}
  else for(const p of players){if(isGoalie(p.pos)!==d.goalie)continue;const v=statsOf(p)?.[d.stat] || 0;if(v>0 && (!top || v>top.v))top={p,v};}
  return top;
}
// Write a new holder into the book. Returns the history entry when a mark changes hands
// (a player adding to his own record this season just raises it).
function takeMark(league,scope,d,top,abbr,{year=league.year,day=league.day,quiet=false}={}){
  const cur=seasonMark(league,scope,d.key,abbr);
  if(!top || (cur && top.v<=cur.value))return null;
  const t=top.t || league.teams[top.p.tid] || null;
  const holder=top.t?{tid:t.id,name:`${t.city} ${t.name}`}:{pid:top.p.id ?? top.p.pid,name:top.p.name,pos:top.p.pos,tid:top.p.tid};
  const same=cur && !cur.real && cur.year===year && (top.t?cur.tid===holder.tid:String(cur.pid)===String(holder.pid));
  const entry={value:top.v,...holder,team:t?.abbr || null,year,day,prev:same?cur.prev:asPrev(cur)};
  const m=league.recordBook.marks;
  if(scope==="nhl")m.nhl[d.key]=entry;else (m.franchise[abbr] ||= {})[d.key]=entry;
  if(same)return null;
  const e={scope,key:d.key,label:d.label,club:scope==="franchise"?abbr:null,...entry};
  if(!quiet){m.history.push(e);if(m.history.length>200)m.history.splice(0,m.history.length-200);
    // A record falls: league news, and the inbox when it's one of yours (Gridiron 1.64 / 2.10).
    const where=scope==="nhl"?"NHL":`${t?.city || ""} ${t?.name || abbr}`.trim();
    const text=`Record: ${entry.name} sets the ${where} single-season ${d.label.toLowerCase()} mark (${top.v})${cur?`, passing ${poss(cur.name)} ${cur.value}${cur.season?` (${cur.season})`:""}`:""}.`;
    (league.news ||= []).unshift({year,day,type:"record",pid:entry.pid,text});
    if(t?.id===league.userTid)(league.inbox ||= []).push({year,day,text:`📕 ${text}`,open:{tab:"league",sub:"records",label:"Open the Record Book"}});
  }
  return e;
}
// After each regular-season day: who now holds the NHL's and each club's single-season marks.
// Regular-season stats only. Returns the marks that changed hands today, NHL first.
export function updateSeasonMarks(league){
  ensureRecords(league);
  if(league.phase!=="regular")return [];
  const players=Object.values(league.players).filter((p)=>p.tid>=0 && p.stats?.gp);
  const broken=[];
  for(const d of SEASON_MARKS){const e=takeMark(league,"nhl",d,leader(d,players,league.teams,(p)=>p.stats),null);if(e)broken.push(e);}
  for(const t of league.teams){
    if(!H.franchises[t.abbr])continue;
    const mine=players.filter((p)=>p.tid===t.id);
    for(const d of SEASON_MARKS){const e=takeMark(league,"franchise",d,leader(d,mine,[t],(p)=>p.stats),t.abbr);if(e)broken.push(e);}
  }
  return broken;
}
// Saves from before the book kept marks: seasons already finished in this league are written in
// quietly, so a record broken last year still stands with its new holder.
function backfillMarks(league){
  for(const s of [...(league.seasonArchive || [])].reverse()){
    const players=(s.leaders || []).map((x)=>({id:x.pid,name:x.name,pos:x.pos,tid:x.tid,stats:x.stats}));
    const teams=(s.teams || []).map((x)=>{const t=league.teams[x.tid];return t && {id:t.id,city:t.city,name:t.name,abbr:t.abbr,rec:x.rec};}).filter(Boolean);
    const opts={year:s.year,day:null,quiet:true};
    for(const d of SEASON_MARKS)takeMark(league,"nhl",d,leader(d,players,teams,(p)=>p.stats),null,opts);
    for(const t of teams){
      if(!H.franchises[t.abbr])continue;
      const mine=players.filter((p)=>p.tid===t.id);
      for(const d of SEASON_MARKS)takeMark(league,"franchise",d,leader(d,mine,[t],(p)=>p.stats),t.abbr,opts);
    }
  }
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
  try{checkFranchiseLeaders(league);}catch(e){console.error("Franchise leaders failed",e);}
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
