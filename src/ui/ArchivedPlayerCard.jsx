import React from 'react';
import {Modal,Table,useGame} from './common.jsx';
import PlayerCard from './PlayerCard.jsx';
export default function ArchivedPlayerCard({pid,onClose}){
 const {league:lg}=useGame(),r=lg.retirementArchive?.find(r=>r.pid===pid),p=r?.player;
 // Retired players keep the full styled card (Gridiron 2.82 / 3.67); summary-only entries from older saves use the plain view.
 if(p)return <PlayerCard p={p} retired={r}/>;
 return <Modal title={r?.name || 'Player unavailable'} onClose={onClose}>
 {r&&<div className="stack"><p>{r.pos} · #{r.number} · Retired {r.year} · Peak rating {r.peak} · {r.gp} simulated NHL games</p>
 {p?<><section><h3>Season history</h3>{['s','ps'].map(key=><div key={key}><h4>{key==='s'?'Regular season':'Playoffs'}</h4><Table rows={p.career.filter(c=>c[key]).map(c=>({year:c.y,team:c.t,ovr:c.o,...c[key]}))} columns={[{key:'year',label:'Year'},{key:'team',label:'Team'},{key:'ovr',label:'OVR'},{key:'gp',label:'GP'},...(p.pos==='G'?[{key:'w',label:'W'},{key:'sa',label:'SA'},{key:'ga',label:'GA'}]:[{key:'g',label:'G'},{key:'a',label:'A'},{key:'pts',label:'P'}])]} /></div>)}</section>
 <section><h3>Ratings & attributes</h3><p>Final overall {p.ovr} · Peak {r.peak}</p><div className="grid g3">{Object.entries(p.attrs).map(([key,value])=><span key={key}>{key.toUpperCase()}: <b>{value}</b></span>)}</div><details><summary>Annual rating history</summary>{(p.ratingHistory||[]).map(h=><p key={h.year}>{h.year} · OVR {h.ovr} · {Object.entries(h.attrs).map(([k,v])=>`${k.toUpperCase()} ${v}`).join(' · ')}</p>)}</details></section>
 <section><h3>Draft & awards</h3><p>{p.draft?`${p.draft.year} · Round ${p.draft.round} · Pick ${p.draft.pick} · ${lg.teams[p.draft.tid]?.abbr || 'Unknown club'}`:'Draft history unavailable for this imported player.'}</p>{(p.honours||[]).map((a,i)=><p key={i}>{a.year} · {a.kind}</p>)}</section>
 <section><h3>Movement history</h3>{(p.moveHistory||[]).length?(p.moveHistory||[]).map((m,i)=><p key={i}>{m.year} day {m.day} · {m.kind} · {lg.teams[m.from]?.abbr || 'UFA'} → {lg.teams[m.to]?.abbr || 'UFA'}</p>):<p>No movements recorded after this update.</p>}</section>
 </>:<p>Detailed career cards are preserved for retirements after this update. This older archive contains summary totals.</p>}</div>}
 </Modal>;
}
