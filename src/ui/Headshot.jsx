import React,{useState} from 'react';
import Jersey from './Jersey.jsx';
import HEADSHOTS from '../data/nhlHeadshots.json';

// Official NHL headshots for real roster players (assets.nhle.com), keyed by
// "Name|Pos" from the opening rosters. Generated players (draft picks, free
// agents created by the game) and any image that fails to load fall back to
// the club sweater illustration, so the game still works fully offline.
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
    return team?<Jersey team={team} player={p} size={size} decorative={decorative}/>:<span className="player-number" style={{width:size*.8,height:size}}>{p?.pos}</span>;
  }
  const bg=team?.colors?.[0] || '#1e293b';
  return <span className={`gg-mug ${className}`} style={{width:size,height:size,'--mug-team':bg}}>
    <img src={headshotUrl(id)} width={size} height={size} alt={decorative?'':`${p.name} headshot`} loading="lazy" draggable="false" referrerPolicy="no-referrer" onError={()=>{failed.add(id);setBroken(true);}}/>
  </span>;
}
