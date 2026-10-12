import {TEAMS} from '../src/engine/teams.js';
import {normalizeSchedule} from '../src/engine/schedule.js';
const cache=new Map();
export async function getNhlSchedule(year,{fetcher=globalThis.fetch}={}){
  if(!Number.isInteger(year) || year<2026 || year>2040)throw Error('Invalid season');
  const cached=cache.get(year);if(cached && Date.now()-cached.at<3600000)return cached.data;
  const games=new Map();
  for(let i=0;i<TEAMS.length;i+=4){
    const chunks=await Promise.all(TEAMS.slice(i,i+4).map(async t=>{
      const r=await fetcher(`https://api-web.nhle.com/v1/club-schedule-season/${t.abbr}/${year}${year+1}`,{signal:AbortSignal.timeout(8000),headers:{Accept:'application/json'}});
      if(!r.ok)throw Error('NHL upstream unavailable');return r.json();
    }));
    for(const d of chunks)for(const g of d.games || [])if(Number(g.gameType)===2)games.set(g.id,g);
  }
  const data={season:year,source:'https://api-web.nhle.com/',games:[...games.values()]};
  normalizeSchedule(data,TEAMS.map((t,id)=>({...t,id})),year);cache.set(year,{at:Date.now(),data});return data;
}
