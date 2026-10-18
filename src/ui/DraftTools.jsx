import React, { useEffect, useState } from "react";
import Select from "./Select.jsx";
import { useGame, TeamName, PlayerName } from "./common.jsx";
import {tradeUpOffers,acceptTradeUp} from "../engine/draftExpansion.js";
import { currentSlot } from "../engine/draft.js";
import { mockDraft, tradeDownOffers, acceptDraftTrade } from "../engine/draftTools.js";
import { pickLabel } from "../engine/draft.js";

export default function DraftTools({ onDraft, canDraft }) {
  const {league,commit,toast} = useGame();
  const slot=currentSlot(league);
  const [clock,setClock]=useState(league.draft?.clock?.overall===slot?.overall?league.draft.clock.remaining:120), [running,setRunning]=useState(false);
  useEffect(()=>{const saved=league.draft?.clock;setClock(saved?.overall===slot?.overall?saved.remaining:120);setRunning(false);},[slot?.overall,slot?.owner]);
  useEffect(()=>{if(league.draft)league.draft.clock={overall:slot?.overall,remaining:clock};},[clock,slot?.overall]);
  useEffect(()=>{
    if (!running || !canDraft || clock<=0) return;
    const t=setTimeout(()=>setClock(n=>n-1),1000); return ()=>clearTimeout(t);
  },[running,canDraft,clock]);
  useEffect(()=>{
    if (!running || clock>0 || !canDraft) return;
    setRunning(false);
    const pool=league.draftClass.map(id=>league.players[id]).filter(p=>p?.tid===-2);
    const queued=(league.myList?.ids || []).map(id=>league.players[id]).find(p=>p?.tid===-2);
    const best=queued || [...pool].sort((a,b)=>(a.cs?.final ?? a.cs?.mid)-(b.cs?.final ?? b.cs?.mid))[0];
    if (best) onDraft(best);
  },[clock,running,canDraft]);
  const last=league.draft?.slots.filter(s=>s.pid).at(-1);
  const offers=canDraft?tradeDownOffers(league):[];
  const up=canDraft?[]:tradeUpOffers(league);
  return <div className="panel">{last && <div className="pick-reveal" key={last.overall} aria-live="polite"><span className="eyebrow">WITH PICK #{last.overall}</span><b>{league.teams[last.owner].abbr} SELECT {league.players[last.pid]?.name}</b><span>{league.players[last.pid]?.pos} · {league.players[last.pid]?.bio?.lg} · Analyst grade {last.grade}</span></div>}<div className="pagehead"><h3>War room</h3>{canDraft && <><b className="mono">{Math.floor(clock/60)}:{String(clock%60).padStart(2,"0")}</b><button className="small" onClick={()=>setRunning(!running)}>{running?"Pause clock":"Start clock"}</button><span className="muted small">At zero: first available player from Your list, then Central Scouting.</span></>}</div>
    {canDraft && <div className="grid g3">{offers.map((o,i)=><div className="panel" key={i}><b><TeamName tid={o.to} /> wants your pick</b><p className="muted small">Receive {o.getPicks.map(id=>pickLabel(league,league.draftPicks.find(p=>p.id===id))).join(" + ")}</p><button onClick={()=>{const r=acceptDraftTrade(league,o);toast(r.msg);commit();}}>Trade down to #{o.overall}</button></div>)}</div>}
    {up.map((o,i)=><div key={i} className="panel"><b>Trade up to #{o.overall}</b><p className="muted small">Send {o.givePicks.map(id=>pickLabel(league,league.draftPicks.find(p=>p.id===id))).join(" + ")}</p><button onClick={()=>{const r=acceptTradeUp(league,o);toast(r.msg);commit();}}>Acquire the current pick</button></div>)}
    {!offers.length && canDraft && <p className="muted small">No acceptable trade-down offers right now. You can build a trade in the Trade tab.</p>}
  </div>;
}

export function DraftRecap() {
  const {league}=useGame();
  const [view,setView]=useState("recap");const [team,setTeam]=useState(String(league.userTid));
  const history=league.draftHistory || [];
  const current=league.draft?.slots.some(s=>s.pid)?{year:league.draft.year,picks:league.draft.slots.filter(s=>s.pid).map(s=>({...s,name:league.players[s.pid]?.name,pos:league.players[s.pid]?.pos}))}:null;
  const drafts=current && !history.some(d=>d.year===current.year)?[current,...history]:history;
  const [year,setYear]=useState(drafts[0]?.year || league.year+1);
  const draft=drafts.find(d=>d.year===Number(year)) || drafts[0];
  return <div className="stack"><div className="tabs"><button className={view==="recap"?"on":""} onClick={()=>setView("recap")}>Draft history</button><button className={view==="mock"?"on":""} onClick={()=>setView("mock")}>First-round mock</button></div>
    {view==="mock"?<div className="panel"><h3>Public consensus mock draft</h3><p className="muted small">Projection from public ranks and team needs. Picks and prospects are unchanged.</p><div className="list">{mockDraft(league).map(s=><div className="item" key={s.overall}><b>#{s.overall}</b><TeamName tid={s.owner} /><span style={{marginLeft:"auto"}}>{league.players[s.pid]?<PlayerName p={league.players[s.pid]} />:"—"}</span></div>)}</div></div>:<>
      <div className="row"><Select aria-label="Draft year" value={draft?.year || year} onChange={e=>setYear(Number(e.target.value))}>{drafts.map(d=><option key={d.year} value={d.year}>{d.year} draft</option>)}</Select><Select aria-label="Draft team" value={team} onChange={e=>setTeam(e.target.value)}><option value="all">All teams</option>{league.teams.map(t=><option value={t.id} key={t.id}>{t.abbr}</option>)}</Select></div>
      <div className="panel"><div className="list">{draft?.picks.filter(s=>team==="all" || s.owner===Number(team)).map(s=><div className="item" key={s.overall}><b>#{s.overall}</b><span className="muted">R{s.round}</span><TeamName tid={s.owner} />{league.players[s.pid]?<PlayerName p={league.players[s.pid]} />:<b>{s.name}</b>}<span className="dim">{s.pos}</span><span className="pill" style={{marginLeft:"auto"}}>{s.grade}</span></div>)}{!draft && <p className="muted">Draft selections will be preserved here, including players who later leave or retire.</p>}</div></div>
    </>}
  </div>;
}
