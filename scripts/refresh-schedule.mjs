// Run locally where the public NHL API is reachable. No update is written until
// all teams' fixtures pass the same validator used by the game.
import {writeFileSync,renameSync} from "node:fs";
import {TEAMS} from "../src/engine/teams.js";
import {normalizeSchedule} from "../src/engine/schedule.js";
const year=Number(process.argv[2] || 2026);
if(year!==2026)throw new Error("This bundled-data refresh targets 2026–27. Use in-game schedule import for later seasons.");
const games=new Map();
for(let i=0;i<TEAMS.length;i+=4){
 const batches=await Promise.all(TEAMS.slice(i,i+4).map(async t=>{
  const response=await fetch(`https://api-web.nhle.com/v1/club-schedule-season/${t.abbr}/${year}${year+1}`,{signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error(`${t.abbr}: NHL API returned ${response.status}`);
  return response.json();
 }));
 for(const d of batches)for(const g of d.games || [])if(g.gameType===2)games.set(g.id,g);
}
const rows=[...games.values()];normalizeSchedule({games:rows},TEAMS.map((t,id)=>({...t,id})),year);
const data={season:year,kind:"official",source:"https://api-web.nhle.com/",retrieved:new Date().toISOString().slice(0,10),description:"Regular-season fixtures downloaded directly from the NHL API; full 84/42 validation passed.",games:rows};
const dest=new URL("../src/data/schedule2026.json",import.meta.url),temp=new URL("../src/data/schedule2026.json.tmp",import.meta.url);
writeFileSync(temp,JSON.stringify(data,null,2)+"\n");renameSync(temp,dest);
console.log(`Updated ${rows.length} NHL fixtures for ${year}–${year+1}.`);
