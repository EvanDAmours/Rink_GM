// Pulls real NHL franchise and league records from the NHL's public records/stats APIs
// and writes src/data/historicalRecords.js. Run: npm run refresh:records
import {writeFileSync} from "node:fs";
const REC="https://records.nhl.com/site/api",STATS="https://api.nhle.com/stats/rest/en";
async function get(url,params={}){
  const u=new URL(url);for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);
  for(let i=0;i<4;i++){try{const r=await fetch(u);if(r.ok)return (await r.json());}catch{}await new Promise(r=>setTimeout(r,800*(i+1)));}
  throw Error("Failed "+u);
}
const top=(rows,key,n=3)=>rows.filter(r=>r[key]>0).sort((a,b)=>b[key]-a[key]).slice(0,n);
const seasonLabel=id=>`${String(id).slice(0,4)}-${String(id).slice(6)}`;
const sk=(r,key)=>({name:r.skaterFullName||`${r.firstName} ${r.lastName}`,value:r[key],season:r.seasonId?seasonLabel(r.seasonId):undefined,years:r.firstSeasonForGameType?`${String(r.firstSeasonForGameType).slice(0,4)}-${String(r.lastSeasonForGameType).slice(4)}`:undefined,team:r.teamAbbrevs});
const gl=(r,key)=>({name:r.goalieFullName||`${r.firstName} ${r.lastName}`,value:r[key],season:r.seasonId?seasonLabel(r.seasonId):undefined,years:r.firstSeasonForGameType?`${String(r.firstSeasonForGameType).slice(0,4)}-${String(r.lastSeasonForGameType).slice(4)}`:undefined,team:r.teamAbbrevs});
const stats=async(kind,exp,sort)=>(await get(`${STATS}/${kind}/summary`,{isAggregate:"false",isGame:"false",limit:"-1",sort:JSON.stringify([{property:sort,direction:"DESC"}]),cayenneExp:exp})).data;

const franchises=(await get(`${REC}/franchise`)).data.filter(f=>f.lastSeasonId===null);
const totals=(await get(`${REC}/franchise-team-totals`,{limit:"-1"})).data.filter(t=>t.gameTypeId===2&&t.activeTeam);
const out={source:"NHL Records (records.nhl.com) and NHL Stats API (api.nhle.com), regular season",generated:new Date().toISOString().slice(0,10),franchises:{},league:{}};

for(const f of franchises){
  const id=f.id,abbr=f.teamAbbrev,fx=`franchiseId=${id} and gameTypeId=2`;
  const [seasons,careerSk,careerG,seasSk,seasG]=await Promise.all([
    get(`${REC}/franchise-season-results`,{cayenneExp:fx,limit:"-1"}).then(r=>r.data.filter(s=>s.seasonId<20262027)),
    get(`${REC}/skater-career-scoring-regular-season`,{cayenneExp:`franchiseId=${id}`,limit:"-1"}).then(r=>r.data),
    get(`${REC}/goalie-career-stats`,{cayenneExp:fx,limit:"-1"}).then(r=>r.data),
    stats("skater",`franchiseId=${id} and gameTypeId=2`,"points"),
    stats("goalie",`franchiseId=${id} and gameTypeId=2`,"wins"),
  ]);
  const tot=totals.find(t=>t.franchiseId===id)||{};
  const hist=seasons.filter(s=>s.seasonId).sort((a,b)=>a.seasonId-b.seasonId).map(s=>({y:s.seasonId,gp:s.gamesPlayed,w:s.wins,l:s.losses,t:s.ties||0,otl:s.overtimeLosses||0,pts:s.points,gf:s.goals,ga:s.goalsAgainst,po:s.inPlayoffs?1:0,rd:s.finalPlayoffRound||0,cup:s.finalPlayoffRound&&s.decision==="W"&&/final/i.test(s.seriesTitle||"")?1:0}));
  const sorted=(k,dir=-1)=>hist.filter(h=>h.gp>=40).sort((a,b)=>dir*(a[k]-b[k]))[0];
  const best=(k)=>{const r=sorted(k);return r&&{value:r[k],season:seasonLabel(r.y)};};
  out.franchises[abbr]={
    id,name:f.fullName,firstSeason:seasonLabel(f.firstSeasonId),
    totals:{gp:tot.gamesPlayed,w:tot.wins,l:tot.losses,t:tot.ties,otl:tot.overtimeLosses,pts:tot.points,gf:tot.goalsFor,ga:tot.goalsAgainst,cups:tot.cups,playoffSeasons:tot.playoffSeasons,seriesWins:tot.seriesWins,seriesPlayed:tot.seriesPlayed,pointPct:tot.pointPctg},
    team:{wins:best("w"),points:best("pts"),goalsFor:best("gf"),fewestGoalsAgainst:(()=>{const r=sorted("ga",1);return r&&{value:r.ga,season:seasonLabel(r.y)};})(),worstPoints:(()=>{const r=sorted("pts",1);return r&&{value:r.pts,season:seasonLabel(r.y)};})()},
    seasonSkater:{goals:sk(top(seasSk,"goals",1)[0]||{},"goals"),assists:sk(top(seasSk,"assists",1)[0]||{},"assists"),points:sk(top(seasSk,"points",1)[0]||{},"points")},
    seasonGoalie:{wins:gl(top(seasG,"wins",1)[0]||{},"wins"),shutouts:gl(top(seasG,"shutouts",1)[0]||{},"shutouts")},
    careerSkater:{games:top(careerSk,"gamesPlayed",1).map(r=>sk(r,"gamesPlayed"))[0],goals:top(careerSk,"goals",3).map(r=>sk(r,"goals")),assists:top(careerSk,"assists",3).map(r=>sk(r,"assists")),points:top(careerSk,"points",3).map(r=>sk(r,"points"))},
    careerGoalie:{wins:top(careerG,"wins",3).map(r=>gl(r,"wins")),shutouts:top(careerG,"shutouts",3).map(r=>gl(r,"shutouts"))},
    history:hist,
  };
  console.log("done",abbr,hist.length,"seasons");
}

// League-wide records
const [allSeasonSk,allSeasonG,allCareerSk,allCareerG,allTeamSeasons]=await Promise.all([
  stats("skater","gameTypeId=2","points"),stats("goalie","gameTypeId=2","wins"),
  get(`${REC}/skater-career-scoring-regular-season`,{limit:"-1"}).then(r=>r.data),
  get(`${REC}/goalie-career-stats`,{cayenneExp:"gameTypeId=2",limit:"-1"}).then(r=>r.data),
  get(`${REC}/franchise-season-results`,{cayenneExp:"gameTypeId=2",limit:"-1"}).then(r=>r.data.filter(s=>s.seasonId<20262027)),
]);
// Career rows are per franchise; merge to a player's total across franchises.
const merge=(rows,keys)=>{const m=new Map();for(const r of rows){const c=m.get(r.playerId)||{...r,...Object.fromEntries(keys.map(k=>[k,0]))};for(const k of keys)c[k]+=r[k]||0;c.firstSeasonForGameType=Math.min(c.firstSeasonForGameType,r.firstSeasonForGameType);c.lastSeasonForGameType=Math.max(c.lastSeasonForGameType,r.lastSeasonForGameType);m.set(r.playerId,c);}return [...m.values()];};
const cs=merge(allCareerSk,["goals","assists","points","gamesPlayed"]),cg=merge(allCareerG,["wins","shutouts","gamesPlayed"]);
const ts=allTeamSeasons.filter(s=>s.gamesPlayed>=40),tm=(k,dir=-1)=>ts.slice().sort((a,b)=>dir*(a[k]-b[k]))[0];
const tr=(r,k)=>({name:r.teamName,value:r[k],season:seasonLabel(r.seasonId)});
out.league={
  careerSkater:{goals:top(cs,"goals",5).map(r=>sk(r,"goals")),assists:top(cs,"assists",5).map(r=>sk(r,"assists")),points:top(cs,"points",5).map(r=>sk(r,"points")),games:top(cs,"gamesPlayed",5).map(r=>sk(r,"gamesPlayed"))},
  careerGoalie:{wins:top(cg,"wins",5).map(r=>gl(r,"wins")),shutouts:top(cg,"shutouts",5).map(r=>gl(r,"shutouts"))},
  seasonSkater:{goals:top(allSeasonSk,"goals",5).map(r=>sk(r,"goals")),assists:top(allSeasonSk,"assists",5).map(r=>sk(r,"assists")),points:top(allSeasonSk,"points",5).map(r=>sk(r,"points"))},
  seasonGoalie:{wins:top(allSeasonG,"wins",5).map(r=>gl(r,"wins")),shutouts:top(allSeasonG,"shutouts",5).map(r=>gl(r,"shutouts"))},
  teamSeason:{wins:tr(tm("wins"),"wins"),points:tr(tm("points"),"points"),goalsFor:tr(tm("goals"),"goals"),fewestGoalsAgainst:tr(tm("goalsAgainst",1),"goalsAgainst")},
  leagueAverage:(()=>{const rec=ts.filter(s=>s.seasonId>=20052006);return {points:Math.round(rec.reduce((a,s)=>a+s.points,0)/rec.length),goalsFor:Math.round(rec.reduce((a,s)=>a+s.goals,0)/rec.length)};})(),
};
writeFileSync(new URL("../src/data/historicalRecords.js",import.meta.url),`// Generated by scripts/refresh-historical-records.mjs — do not edit by hand.\n// ${out.source}. Pulled ${out.generated}.\nexport const HISTORICAL_RECORDS=${JSON.stringify(out)};\n`);
console.log("wrote",Object.keys(out.franchises).length,"franchises");
