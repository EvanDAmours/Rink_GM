import React,{useState} from "react";
import Select from "./Select.jsx";
import {useGame,TeamName} from "./common.jsx";
import {HISTORICAL_RECORDS as H} from "../data/historicalRecords.js";
import {RECORD_LABELS,franchiseRecords} from "../engine/records.js";

const pct=(v,rec)=>rec?Math.max(0,Math.min(100,Math.round(100*v/rec))):0;
const lbl=y=>`${String(y).slice(0,4)}-${String(y).slice(6)}`;
function Meter({label,value,record,holder,note}){
  const p=pct(value,record),beat=value>record;
  return <div className="item small" style={{display:"block",padding:"8px 0"}}><div className="row" style={{justifyContent:"space-between"}}><span>{label}</span><span className="mono"><b>{value||0}</b> / {record}{beat&&" · NEW RECORD"}</span></div><div className="bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={record} aria-valuenow={value||0}><i style={{width:p+"%",background:beat?"#d7bd7b":"#4aa3d8"}}/></div>{holder&&<span className="muted small">{holder}{note?` · ${note}`:""}</span>}</div>;
}
function Leaders({title,rows,unit}){return <div className="panel"><h3>{title}</h3>{rows.map((r,i)=><div className="item small" key={i}><b>{i+1}. {r.name}</b><span className="muted">{r.season||r.years}{r.team?` · ${r.team.replace(/,/g,", ")}`:""}</span><span className="mono" style={{marginLeft:"auto"}}>{r.value}{unit}</span></div>)}</div>;}

export default function HistoricalRecords(){
  const {league}=useGame();const [tid,setTid]=useState(String(league.userTid));
  const team=league.teams.find(t=>t.id===Number(tid)),F=H.franchises[team.abbr],L=H.league;
  const mine=Number(tid)===league.userTid;
  // Simulated seasons for this club: archived years plus the current one in progress.
  const sims=[...(league.seasonArchive||[]).slice().reverse().map(s=>{const c=s.teams.find(t=>t.tid===team.id);return c&&{year:s.year,...c.rec,playoff:c.playoff};}).filter(Boolean)];
  if(team.rec?.gp)sims.push({year:league.year,...team.rec,current:true});
  const bestSim=k=>sims.reduce((m,s)=>Math.max(m,s[k]||0),0);
  const club=franchiseRecords(league,team.id);
  const rb=league.recordBook||{season:{},career:{}};
  if(!F)return <section className="panel"><p className="muted">No historical data for this club.</p></section>;
  const recent=F.history.slice(-30),maxPts=Math.max(...recent.map(h=>h.pts),...sims.map(s=>s.pts||0),100);
  const avg5=Math.round(F.history.slice(-5).reduce((a,h)=>a+h.pts,0)/Math.max(1,F.history.slice(-5).length));
  const tot=F.totals;
  return <div className="stack">
    <div className="row"><h3 style={{margin:0}}>{F.name} · real NHL history</h3><Select aria-label="Historical record club" value={tid} onChange={e=>setTid(e.target.value)}>{league.teams.map(t=><option key={t.id} value={t.id}>{t.city} {t.name}</option>)}</Select></div>
    <p className="muted small">Real NHL regular-season records through 2025-26 from the NHL's public records service (pulled {H.generated}). Compare your simulated seasons against what this franchise has actually done. {F.id===40&&"Utah's franchise record begins in 2024-25 in the NHL's records."}</p>
    <div className="executive-stats ops-summary"><span>Franchise since<b>{F.firstSeason}</b></span><span>Stanley Cups<b>{tot.cups}</b></span><span>All-time record<b>{tot.w}-{tot.l}-{(tot.t||0)+(tot.otl||0)}</b></span><span>Points %<b>{tot.pointPct?(tot.pointPct*100).toFixed(1)+"%":"—"}</b></span><span>Playoff seasons<b>{tot.playoffSeasons}</b></span><span>Last 5 seasons avg<b>{avg5} PTS</b></span></div>
    {mine&&<section className="panel"><h3>Is your franchise progressing?</h3>
      <p className="muted small">{sims.length?"Your simulated seasons against this franchise's real records.":"Play a season to measure your club against its history."}</p>
      <Meter label="Single-season points" value={bestSim("pts")} record={F.team.points.value} holder={`Franchise record · ${F.team.points.season}`}/>
      <Meter label="Single-season wins" value={bestSim("w")} record={F.team.wins.value} holder={`Franchise record · ${F.team.wins.season}`}/>
      <Meter label="Single-season goals for" value={bestSim("gf")} record={F.team.goalsFor.value} holder={`Franchise record · ${F.team.goalsFor.season}`}/>
      <Meter label="Skater goals in a season" value={rb.season.g?.tid===team.id?rb.season.g.value:club.season.g?.value||0} record={F.seasonSkater.goals.value} holder={`${F.seasonSkater.goals.name} · ${F.seasonSkater.goals.season}`}/>
      <Meter label="Skater points in a season" value={rb.season.pts?.tid===team.id?rb.season.pts.value:club.season.pts?.value||0} record={F.seasonSkater.points.value} holder={`${F.seasonSkater.points.name} · ${F.seasonSkater.points.season}`}/>
      <Meter label="Goalie wins in a season" value={club.season.w?.value||0} record={F.seasonGoalie.wins.value} holder={`${F.seasonGoalie.wins.name} · ${F.seasonGoalie.wins.season}`}/>
      <div className="row small" style={{marginTop:8}}><span>Compared with the franchise's last 5 real seasons ({avg5} PTS avg):</span><b>{sims.length?(bestSim("pts")>=avg5?"your best season is ahead of that pace":"your best season is still below that pace"):"—"}</b></div>
    </section>}
    <section className="panel"><h3>Points by season · last {recent.length} real seasons{sims.length?" and yours":""}</h3>
      <div role="img" aria-label="Season points history" style={{display:"flex",alignItems:"flex-end",gap:2,height:110,overflowX:"auto"}}>
        {recent.map(h=><div key={h.y} title={`${lbl(h.y)}: ${h.w}-${h.l}-${(h.otl||0)+(h.t||0)}, ${h.pts} PTS${h.cup?" · Stanley Cup":""}`} style={{flex:"1 0 14px",height:Math.max(3,h.pts/maxPts*100)+"%",background:h.cup?"#d7bd7b":h.po?"#4aa3d8":"#3a4a5e",borderRadius:"2px 2px 0 0"}}/>)}
        {sims.length>0&&<div style={{width:10,flex:"0 0 10px"}}/>}
        {sims.map(s=><div key={s.year} title={`Your ${s.year}-${String(s.year+1).slice(2)}: ${s.w}-${s.l}-${s.otl}, ${s.pts} PTS`} style={{flex:"1 0 14px",height:Math.max(3,(s.pts||0)/maxPts*100)+"%",background:"#7bd88f",borderRadius:"2px 2px 0 0",opacity:s.current?.55:1}}/>)}
      </div>
      <p className="muted small"><span style={{color:"#d7bd7b"}}>■</span> Stanley Cup <span style={{color:"#4aa3d8"}}>■</span> playoffs <span style={{color:"#3a4a5e"}}>■</span> missed <span style={{color:"#7bd88f"}}>■</span> your simulated seasons</p>
    </section>
    <div className="grid g2">
      <section className="panel"><h3>Franchise team records</h3>
        <div className="item small"><span>Most wins</span><b className="mono" style={{marginLeft:"auto"}}>{F.team.wins.value} · {F.team.wins.season}</b></div>
        <div className="item small"><span>Most points</span><b className="mono" style={{marginLeft:"auto"}}>{F.team.points.value} · {F.team.points.season}</b></div>
        <div className="item small"><span>Most goals for</span><b className="mono" style={{marginLeft:"auto"}}>{F.team.goalsFor.value} · {F.team.goalsFor.season}</b></div>
        <div className="item small"><span>Fewest goals against</span><b className="mono" style={{marginLeft:"auto"}}>{F.team.fewestGoalsAgainst.value} · {F.team.fewestGoalsAgainst.season}</b></div>
        <div className="item small"><span>Fewest points</span><b className="mono" style={{marginLeft:"auto"}}>{F.team.worstPoints.value} · {F.team.worstPoints.season}</b></div>
      </section>
      <section className="panel"><h3>Franchise single-season records</h3>
        {[["Goals",F.seasonSkater.goals],["Assists",F.seasonSkater.assists],["Points",F.seasonSkater.points],["Goalie wins",F.seasonGoalie.wins],["Shutouts",F.seasonGoalie.shutouts]].map(([k,r])=><div className="item small" key={k}><span>{k}</span><b>{r.name}</b><span className="mono" style={{marginLeft:"auto"}}>{r.value} · {r.season}</span></div>)}
      </section>
    </div>
    <div className="grid g3">
      <Leaders title="Career goals · franchise" rows={F.careerSkater.goals}/>
      <Leaders title="Career assists · franchise" rows={F.careerSkater.assists}/>
      <Leaders title="Career points · franchise" rows={F.careerSkater.points}/>
      <Leaders title="Career goalie wins · franchise" rows={F.careerGoalie.wins}/>
      <Leaders title="Career shutouts · franchise" rows={F.careerGoalie.shutouts}/>
    </div>
    <h3 style={{marginBottom:0}}>All-time NHL league records</h3>
    <div className="grid g3">
      <div className="panel"><h3>Best team seasons ever</h3>{[["Most wins",L.teamSeason.wins],["Most points",L.teamSeason.points],["Most goals for",L.teamSeason.goalsFor],["Fewest goals against",L.teamSeason.fewestGoalsAgainst]].map(([k,r])=><div className="item small" key={k}><span>{k}</span><span className="mono" style={{marginLeft:"auto"}}>{r.value} · {r.name} · {r.season}</span></div>)}<p className="muted small">Cap-era average club: {L.leagueAverage.points} PTS, {L.leagueAverage.goalsFor} GF.</p></div>
      <Leaders title="Career goals · NHL" rows={L.careerSkater.goals}/>
      <Leaders title="Career assists · NHL" rows={L.careerSkater.assists}/>
      <Leaders title="Career points · NHL" rows={L.careerSkater.points}/>
      <Leaders title="Season goals · NHL" rows={L.seasonSkater.goals}/>
      <Leaders title="Season points · NHL" rows={L.seasonSkater.points}/>
      <Leaders title="Career goalie wins · NHL" rows={L.careerGoalie.wins}/>
      <Leaders title="Season goalie wins · NHL" rows={L.seasonGoalie.wins}/>
      <Leaders title="Career shutouts · NHL" rows={L.careerGoalie.shutouts}/>
    </div>
    {mine&&<section className="panel"><h3>Your simulated league vs all-time NHL records</h3>
      <Meter label="Season goals" value={rb.season.g?.value||0} record={L.seasonSkater.goals[0].value} holder={`${L.seasonSkater.goals[0].name} · ${L.seasonSkater.goals[0].season}`}/>
      <Meter label="Season points" value={rb.season.pts?.value||0} record={L.seasonSkater.points[0].value} holder={`${L.seasonSkater.points[0].name} · ${L.seasonSkater.points[0].season}`}/>
      <Meter label="Season goalie wins" value={rb.season.w?.value||0} record={L.seasonGoalie.wins[0].value} holder={`${L.seasonGoalie.wins[0].name} · ${L.seasonGoalie.wins[0].season}`}/>
      <Meter label="Career goals" value={rb.career.g?.value||0} record={L.careerSkater.goals[0].value} holder={`${L.careerSkater.goals[0].name}`}/>
      <Meter label="Career points" value={rb.career.pts?.value||0} record={L.careerSkater.points[0].value} holder={`${L.careerSkater.points[0].name}`}/>
    </section>}
    <p className="muted small">Source: <a href="https://records.nhl.com" target="_blank" rel="noreferrer">records.nhl.com</a>. Regenerate with <code>npm run refresh:records</code>. Original Ottawa Senators and other defunct clubs are separate franchises in the NHL's records.</p>
  </div>;
}
