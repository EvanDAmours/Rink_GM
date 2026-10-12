// Fetch current NHL CDN artwork. Downloaded SVGs are bundled for offline play.
import {writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {TEAMS} from '../src/engine/teams.js';
const dir=new URL('../src/assets/team-logos/',import.meta.url);await mkdir(dir,{recursive:true});
const rows=[];
for(let start=0;start<TEAMS.length;start+=8){
 const batch=await Promise.allSettled(TEAMS.slice(start,start+8).map(async t=>{
  const url=`https://assets.nhle.com/logos/nhl/svg/${t.abbr}_dark.svg`;
  const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(`${t.abbr}: HTTP ${r.status}`);
  const svg=await r.text();if(!svg.includes('<svg') || /<script|<foreignObject|(?:href|src)=["'](?:https?:|javascript:)/i.test(svg))throw Error(`${t.abbr}: invalid or externally linked SVG`);
  return {svg,metadata:{abbr:t.abbr,source:url,downloadedAt:new Date().toISOString(),bytes:Buffer.byteLength(svg),sha256:createHash('sha256').update(svg).digest('hex')}};
 }));
 for(const r of batch){if(r.status==='rejected')throw r.reason;rows.push(r.value);console.log(r.value.metadata.abbr,r.value.metadata.bytes+' bytes');}
}
for(const row of rows)await writeFile(new URL(`${row.metadata.abbr}.svg`,dir),row.svg);
await writeFile(new URL('manifest.json',dir),JSON.stringify({provider:'NHL official asset CDN',attribution:'NHL and respective team marks remain their owners’ property. Rink GM is an independent fan-made game.',logos:rows.map(row=>row.metadata)},null,2)+'\n');
