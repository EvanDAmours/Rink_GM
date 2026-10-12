import {refreshLeagueSchedule} from "../engine/scheduleRefresh.js";
import React, { useState } from "react";
import { useGame, TeamBadge, TeamName } from "./common.jsx";
import { dayToDate, lastDay, importSeasonSchedule } from "../engine/schedule.js";

export default function SchedulePage() {
  const { league, openBox, commit, toast } = useGame();
  const [importText,setImportText]=useState("");
  const [importOpen,setImportOpen]=useState(false);
  const [loading,setLoading]=useState(false);
  const [view, setView] = useState("mine");
  const [day, setDay] = useState(Math.min(league.day, lastDay(league.schedule)));
  const user = league.teams[league.userTid];
  const mine = league.schedule.filter((g) => g.h === user.id || g.a === user.id);
  const dayGames = league.schedule.filter((g) => g.day === day);
  const days = [...new Set(league.schedule.map((g) => g.day))];

  const result = (g) => {
    if (!g.played) return <span className="dim">—</span>;
    const home = g.h === user.id;
    const us = home ? g.hs : g.as;
    const them = home ? g.as : g.hs;
    const cls = us > them ? "good" : g.ot ? "warn" : "bad";
    return <span className={`link ${cls}`} onClick={() => openBox(g)}>{us > them ? "W" : g.ot ? "OTL" : "L"} {us}-{them}{g.ot ? ` (${g.ot})` : ""}</span>;
  };

  let w = 0, l = 0, o = 0;
  const running = mine.map((g) => {
    if (g.played) {
      const home = g.h === user.id;
      const us = home ? g.hs : g.as;
      const them = home ? g.as : g.hs;
      if (us > them) w++; else if (g.ot) o++; else l++;
    }
    return `${w}-${l}-${o}`;
  });

  const importSchedule = () => {
    try { const r=importSeasonSchedule(league,JSON.parse(importText));toast(r.msg,5000);if(r.ok){commit();setDay(0);setImportOpen(false);} } catch(e) {toast(e.message,5000);}
  };
  const refreshOfficial = async () => {
    setLoading(true);
    try {
      const r=await refreshLeagueSchedule(league);toast(r.msg,7000);
      if(r.ok){commit();setDay(0);}
    }catch{toast("Could not refresh. Your existing calendar is unchanged.",6000);}
    finally{setLoading(false);}
  };
  return (
    <div className="stack">
      <div className="pagehead">
        <h2>Schedule</h2>
        <div className="tabs" style={{ margin: 0 }}>
          <button className={view === "mine" ? "on" : ""} onClick={() => setView("mine")}>{user.abbr} games</button>
          <button className={view === "day" ? "on" : ""} onClick={() => setView("day")}>Scoreboard</button>
        </div>
        <span className="muted small">Trade deadline: {dayToDate(league.year, league.deadlineDay, league.scheduleStart)}</span>
      </div>

      <div className="panel"><div className="row"><b>{league.scheduleInfo?.label || "Franchise schedule"}</b><span className="muted small">{mine.length} games · {mine.filter(g=>g.h===user.id).length} home</span>{league.phase==="preseason" && <><button className="small" disabled={loading} onClick={refreshOfficial}>{loading?"Refreshing…":"Refresh from NHL"}</button><button className="small" onClick={()=>setImportOpen(!importOpen)}>Import schedule</button></>}</div>{league.scheduleInfo?.kind==="snapshot" && <p className="muted small">Bundled calendar snapshot sourced from an NHL API community calendar; refresh or import to apply later schedule changes.</p>}{importOpen && <div className="stack" style={{marginTop:12}}><p className="muted small">Paste a league-wide NHL API games array or JSON with games. All 32 teams must have 84 games and 42 home games. No played schedule can be replaced.</p><textarea aria-label="Schedule JSON" rows={6} value={importText} onChange={e=>setImportText(e.target.value)} /><button onClick={importSchedule}>Validate and import</button></div>}</div>
      {view === "mine" && (
        <div className="tablewrap">
          <table className="t">
            <thead>
              <tr><th>#</th><th>Date</th><th>Opponent</th><th>Result</th><th>Record</th><th className="num">Shots</th></tr>
            </thead>
            <tbody>
              {mine.map((g, i) => {
                const home = g.h === user.id;
                const opp = home ? g.a : g.h;
                return (
                  <tr key={g.id} className={g.day === league.day && !g.played && league.phase === "regular" ? "me" : ""}>
                    <td className="dim">{i + 1}</td>
                    <td className="nowrap">{dayToDate(league.year, g.day, league.scheduleStart)}</td>
                    <td><span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>{home ? "vs" : "@"} <TeamBadge team={league.teams[opp]} size={20} /> <TeamName tid={opp} /></span></td>
                    <td>{result(g)}</td>
                    <td className="mono small">{g.played ? running[i] : ""}</td>
                    <td className="num small">{g.played ? `${home ? g.shots.h : g.shots.a}-${home ? g.shots.a : g.shots.h}` : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {view === "day" && (
        <>
          <div className="row">
            <button className="small" disabled={days.indexOf(day) <= 0} onClick={() => setDay(days[days.indexOf(day) - 1])}>◀</button>
            <select value={day} onChange={(e) => setDay(Number(e.target.value))}>
              {days.map((d) => <option key={d} value={d}>{dayToDate(league.year, d, league.scheduleStart)}</option>)}
            </select>
            <button className="small" disabled={days.indexOf(day) >= days.length - 1} onClick={() => setDay(days[days.indexOf(day) + 1])}>▶</button>
            <span className="muted small">{dayGames.length} games</span>
          </div>
          <div className="grid g3">
            {dayGames.map((g) => (
              <div key={g.id} className="panel" style={{ padding: 10, cursor: g.played ? "pointer" : "default" }} onClick={() => g.played && openBox(g)}>
                {[["a", g.a, g.as], ["h", g.h, g.hs]].map(([k, tid, sc]) => (
                  <div className="row" key={k} style={{ fontWeight: g.played && ((k === "h" && g.hs > g.as) || (k === "a" && g.as > g.hs)) ? 800 : 500 }}>
                    <TeamBadge team={league.teams[tid]} size={22} />
                    <span>{league.teams[tid].city} {league.teams[tid].name}</span>
                    <span style={{ marginLeft: "auto" }} className="mono">{g.played ? sc : ""}</span>
                  </div>
                ))}
                <div className="small dim" style={{ marginTop: 4 }}>{g.played ? `Final${g.ot ? " / " + g.ot : ""}` : "Scheduled"}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
