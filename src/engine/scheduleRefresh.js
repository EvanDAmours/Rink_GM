import snapshot from '../data/schedule2026.json' with {type:'json'};
import {importSeasonSchedule,normalizeSchedule} from './schedule.js';

export async function refreshLeagueSchedule(league,{fetcher=globalThis.fetch,protocol=globalThis.location?.protocol,apiUrl='/api/nhl/schedule'}={}){
  if(league.phase!=='preseason' || league.schedule.some(g=>g.played))return {ok:false,msg:'Replace a schedule before the season starts.'};
  let data;
  try{
    // Hosted/dev server route avoids NHL browser CORS restrictions.
    if(protocol==='http:' || protocol==='https:'){
      try{const r=await fetcher(`${apiUrl}?season=${league.year}`,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Schedule service unavailable');data=await r.json();normalizeSchedule(data,league.teams,league.year);}catch{data=null;}
    }
    if(!data){
      const chunks=[];
      for(let i=0;i<league.teams.length;i+=4){
        const batch=await Promise.all(league.teams.slice(i,i+4).map(async t=>{const r=await fetcher(`https://api-web.nhle.com/v1/club-schedule-season/${t.abbr}/${league.year}${league.year+1}`,{signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('NHL API unavailable');return r.json();}));chunks.push(...batch);
      }
      data={games:[...new Map(chunks.flatMap(d=>d.games || []).filter(g=>g.gameType===2).map(g=>[g.id,g])).values()],source:'https://api-web.nhle.com/'};
      normalizeSchedule(data,league.teams,league.year);
    }
    const r=importSeasonSchedule(league,data);if(!r.ok)return r;
    league.scheduleInfo={kind:'official',label:'NHL API regular-season schedule',source:'https://api-web.nhle.com/',retrieved:new Date().toISOString().slice(0,10)};
    return {ok:true,live:true,msg:'Updated from NHL. All 32 clubs have 84 games and 42 home games.'};
  }catch{
    if(league.year!==snapshot.season)return {ok:false,msg:'Live NHL access is unavailable for this season. Your schedule is unchanged; you can import a schedule file.'};
    // A fallback must remain visibly distinct from a successful live refresh.
    if(['imported','official'].includes(league.scheduleInfo?.kind))return {ok:true,live:false,msg:'Live NHL access is unavailable. Your existing imported/verified calendar has been kept.'};
    const r=importSeasonSchedule(league,snapshot);if(!r.ok)return r;
    league.scheduleInfo={kind:snapshot.kind || 'snapshot',label:'2026–27 NHL fixtures · bundled calendar',source:snapshot.source,retrieved:snapshot.retrieved};
    return {ok:true,live:false,msg:'Live NHL access is unavailable here. Using the bundled 2026–27 calendar; this is not a live update.'};
  }
}
