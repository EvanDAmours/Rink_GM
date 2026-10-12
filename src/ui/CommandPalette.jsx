import React,{useMemo,useState,useId} from 'react';
import {Modal,TeamBadge} from './common.jsx';
import Icon from './Icon.jsx';
const normalize=value=>String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export default function CommandPalette({league,nav,onNavigate,onPlayer,onTeam,onClose}){
 const listId=useId();
 const [query,setQuery]=useState(''),[selected,setSelected]=useState(0);
 const results=useMemo(()=>{
  const q=normalize(query.trim()),pages=nav.filter(n=>n.id && (!n.when || n.when(league))).filter(n=>!q || normalize(n.label).includes(q)).map(n=>({key:n.id,label:n.label,detail:'Go to screen',icon:n.id,run:()=>onNavigate(n.id)}));
  if(q.length<2)return pages;
  const teams=league.teams.filter(t=>normalize(`${t.city} ${t.name} ${t.abbr}`).includes(q)).map(t=>({key:'team-'+t.id,label:`${t.city} ${t.name}`,detail:`${t.conf}ern Conference · ${t.div}`,team:t,run:()=>onTeam(t.id)}));
  const players=Object.values(league.players).filter(p=>normalize(p.name).includes(q)).slice(0,16).map(p=>({key:p.id,label:p.name,detail:`${p.pos} · ${p.tid===-2?'Draft prospect':p.tid===-1?'Free agent':league.teams[p.tid]?.abbr || 'Unsigned'}`,team:league.teams[p.tid],icon:'roster',run:()=>onPlayer(p.id)}));
  return [...pages,...teams,...players].slice(0,25);
 },[query,league,nav,onNavigate,onPlayer,onTeam]);
 const run=r=>{onClose();r.run();};
 return <Modal title="Find your next move" onClose={onClose} head={<Icon name="search" size={24}/>}><div className="command-search"><Icon name="search"/><input data-autofocus role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls={listId} aria-activedescendant={results[selected]?`${listId}-${selected}`:undefined} aria-label="Search players, teams and screens" value={query} onChange={e=>{setQuery(e.target.value);setSelected(0);}} placeholder="Search a player, team or screen…" onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();setSelected(i=>Math.min(results.length-1,i+1));}if(e.key==='ArrowUp'){e.preventDefault();setSelected(i=>Math.max(0,i-1));}if(e.key==='Enter' && results[selected]){e.preventDefault();run(results[selected]);}}}/><kbd>ESC</kbd></div><div className="command-results" id={listId} role="listbox" aria-label="Search results">{results.map((r,i)=><button key={r.key} id={`${listId}-${i}`} role="option" aria-selected={i===selected} className={`command-result ${i===selected?'selected':''}`} onMouseEnter={()=>setSelected(i)} onClick={()=>run(r)}>{r.team?<TeamBadge team={r.team} size={35} decorative/>:<span className="command-icon"><Icon name={r.icon}/></span>}<span><b>{r.label}</b><small>{r.detail}</small></span><Icon name="chevron" size={16}/></button>)}{!results.length && <div className="command-empty">No matches. Try a surname, club or screen name.</div>}</div><div className="command-hint"><span>↑ ↓ to browse</span><span>Enter to open</span><span>Escape to close</span></div></Modal>;
}
