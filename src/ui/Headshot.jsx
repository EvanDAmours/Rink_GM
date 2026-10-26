import React,{useState} from 'react';
import HEADSHOTS from '../data/nhlHeadshots.json';

// Official NHL headshots for real roster players (assets.nhle.com), keyed by
// "Name|Pos" from the opening rosters. Generated players (draft picks, free
// agents created by the game) and any image that fails to load fall back to
// a neutral NHL-style silhouette (no generated sweater art), so the game still works fully offline.
const failed=new Set();
export function headshotId(p){
  if(!p?.name)return null;
  if(p.nhlId)return p.nhlId;
  return HEADSHOTS[`${p.name}|${p.pos}`] ?? HEADSHOTS[`${p.name}|${p.origPos || ''}`] ?? byName(p.name);
}
let nameIndex=null;
function byName(name){
  if(!nameIndex){nameIndex={};for(const k in HEADSHOTS){const n=k.split('|')[0];if(!(n in nameIndex))nameIndex[n]=HEADSHOTS[k];}}
  return nameIndex[name] ?? null;
}
export function headshotUrl(id){return `https://assets.nhle.com/mugs/nhl/latest/${id}.png`;}

export default function Headshot({p,team,size=100,decorative=false,className='',fallback='plate'}){
  const id=headshotId(p);
  const [broken,setBroken]=useState(()=>id?failed.has(id):true);
  if(!id || broken){
    if(fallback==='none')return null;
    return <Silhouette size={size} team={team} decorative={decorative} name={p?.name} className={className}/>;
  }
  const bg=team?.colors?.[0] || '#1e293b';
  return <span className={`gg-mug ${className}`} style={{width:size,height:size,'--mug-team':bg}}>
    <img src={headshotUrl(id)} width={size} height={size} alt={decorative?'':`${p.name} headshot`} loading="lazy" draggable="false" referrerPolicy="no-referrer" onError={()=>{failed.add(id);setBroken(true);}}/>
  </span>;
}

// The face we show when there's no headshot: the NHL's grey head-and-shoulders silhouette on a
// dark disc, faintly tinted with the club colour. Drawn inline so it works offline.
export function Silhouette({size=100,team,decorative=false,name,className=''}){
  const tint=team?.colors?.[0] || '#1e293b';
  return <span className={`gg-mug gg-silh ${className}`} style={{width:size,height:size,'--mug-team':tint}} role={decorative?undefined:'img'} aria-label={decorative?undefined:`${name || 'Player'}: no photo`}>
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <defs><radialGradient id="silhbg" cx="50%" cy="40%" r="65%"><stop offset="0%" stopColor={tint} stopOpacity=".55"/><stop offset="100%" stopColor="#0b1220"/></radialGradient></defs>
      <circle cx="50" cy="50" r="50" fill="url(#silhbg)"/>
      <path d="M50 20c-9 0-15 7-15 17 0 7 3 13 7 16v4c-11 2-21 7-26 15-2 4-3 9-3 13a50 50 0 0 0 74 0c0-4-1-9-3-13-5-8-15-13-26-15v-4c4-3 7-9 7-16 0-10-6-17-15-17z" fill="#9aa0a6"/>
      <path d="M38 62l12 9 12-9" fill="none" stroke="#c9ccd1" strokeWidth="2.5"/>
    </svg>
  </span>;
}
