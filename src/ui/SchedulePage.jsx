import { refreshLeagueSchedule } from "../engine/scheduleRefresh.js";
import React, { useMemo, useState } from "react";
import { useGame, TeamBadge, TeamName } from "./common.jsx";
import { dayToDate, lastDay, importSeasonSchedule } from "../engine/schedule.js";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dateOf = (league, day) => new Date(Date.parse((league.scheduleStart || `${league.year}-09-29`) + "T12:00:00Z") + day * 86400000);

export default function SchedulePage() {
  const { league, openBox, commit, toast } = useGame();
  const [importText, setImportText] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("calendar");
  const [day, setDay] = useState(Math.min(league.day, lastDay(league.schedule)));
  const user = league.teams[league.userTid];
  const mine = league.schedule.filter((g) => g.h === user.id || g.a === user.id);
  const dayGames = league.schedule.filter((g) => g.day === day);
  const days = [...new Set(league.schedule.map((g) => g.day))];

  // Months covered by the regular season, each with its calendar grid of days.
  const months = useMemo(() => {
    const first = dateOf(league, 0), last = dateOf(league, lastDay(league.schedule));
    const out = [];
    for (let y = first.getUTCFullYear(), m = first.getUTCMonth(); y < last.getUTCFullYear() || (y === last.getUTCFullYear() && m <= last.getUTCMonth()); m++) {
      if (m > 11) { m = 0; y++; }
      out.push({ key: `${y}-${m}`, y, m, label: `${MONTH_NAMES[m]} ${y}` });
    }
    return out;
  }, [league.scheduleStart, league.year, league.schedule.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const todayDate = dateOf(league, Math.min(league.day, lastDay(league.schedule)));
  const [month, setMonth] = useState(() => months.findIndex((x) => x.y === todayDate.getUTCFullYear() && x.m === todayDate.getUTCMonth()));
  const mi = Math.max(0, Math.min(months.length - 1, month));
  const cur = months[mi];
  const byDate = useMemo(() => {
    const map = new Map();
    for (const g of mine) { const d = dateOf(league, g.day); map.set(`${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`, g); }
    return map;
  }, [mine, league.scheduleStart]); // eslint-disable-line react-hooks/exhaustive-deps

  let w = 0, l = 0, o = 0;
  const running = new Map();
  for (const g of mine) {
    if (!g.played) continue;
    const home = g.h === user.id, us = home ? g.hs : g.as, them = home ? g.as : g.hs;
    if (us > them) w++; else if (g.ot) o++; else l++;
    running.set(g.id, `${w}-${l}-${o}`);
  }
  const outcome = (g) => {
    if (!g.played) return null;
    const home = g.h === user.id, us = home ? g.hs : g.as, them = home ? g.as : g.hs;
    return { us, them, kind: us > them ? "W" : g.ot ? "OTL" : "L", ot: g.ot };
  };
  const monthRecord = () => {
    let mw = 0, ml = 0, mo = 0;
    for (const g of mine) { const d = dateOf(league, g.day); if (d.getUTCFullYear() !== cur.y || d.getUTCMonth() !== cur.m) continue; const r = outcome(g); if (!r) continue; if (r.kind === "W") mw++; else if (r.kind === "OTL") mo++; else ml++; }
    return `${mw}-${ml}-${mo}`;
  };

  const importSchedule = () => {
    try { const r = importSeasonSchedule(league, JSON.parse(importText)); toast(r.msg, 5000); if (r.ok) { commit(); setDay(0); setImportOpen(false); } } catch (e) { toast(e.message, 5000); }
  };
  const refreshOfficial = async () => {
    setLoading(true);
    try { const r = await refreshLeagueSchedule(league); toast(r.msg, 7000); if (r.ok) { commit(); setDay(0); } }
    catch { toast("Could not refresh. Your existing calendar is unchanged.", 6000); }
    finally { setLoading(false); }
  };

  // Calendar cells for the current month (leading blanks for the weekday offset).
  const firstDow = new Date(Date.UTC(cur.y, cur.m, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(cur.y, cur.m + 1, 0)).getUTCDate();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const todayKey = `${todayDate.getUTCFullYear()}-${todayDate.getUTCMonth()}-${todayDate.getUTCDate()}`;
  const monthGames = mine.filter((g) => { const d = dateOf(league, g.day); return d.getUTCFullYear() === cur.y && d.getUTCMonth() === cur.m; });

  return (
    <div className="stack gg-sched">
      <div className="gg-pagehead">
        <div><h2>Schedule</h2><div className="gg-status">{league.scheduleInfo?.label || "Franchise schedule"} · {mine.length} games · {mine.filter((g) => g.h === user.id).length} home · trade deadline {dayToDate(league.year, league.deadlineDay, league.scheduleStart)}</div></div>
        <div className="gg-chips">
          <button className={view === "calendar" ? "on" : ""} onClick={() => setView("calendar")}>📅 Calendar</button>
          <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>List</button>
          <button className={view === "day" ? "on" : ""} onClick={() => setView("day")}>League scoreboard</button>
          {league.phase === "preseason" && <><button disabled={loading} onClick={refreshOfficial}>{loading ? "Refreshing…" : "Refresh from NHL"}</button><button onClick={() => setImportOpen(!importOpen)}>Import</button></>}
        </div>
      </div>
      {importOpen && <div className="gg-card stack"><p className="muted small">Paste a league-wide NHL API games array or JSON with games. All 32 teams must have 84 games and 42 home games. No played schedule can be replaced.</p><textarea aria-label="Schedule JSON" rows={6} value={importText} onChange={(e) => setImportText(e.target.value)} /><div className="row"><button className="primary" onClick={importSchedule}>Validate and import</button></div></div>}

      {view === "calendar" && (
        <div className="gg-cal">
          <div className="gg-cal-h">
            <button className="gg-cal-nav" disabled={mi === 0} onClick={() => setMonth(mi - 1)} aria-label="Previous month">◀</button>
            <div className="gg-cal-title"><b>{cur.label}</b><span className="dim small">{monthGames.length} games · {monthGames.filter((g) => g.h === user.id).length} home · month record {monthRecord()}</span></div>
            <button className="gg-cal-nav" disabled={mi === months.length - 1} onClick={() => setMonth(mi + 1)} aria-label="Next month">▶</button>
          </div>
          <div className="gg-cal-months">{months.map((x, i) => <button key={x.key} className={i === mi ? "on" : ""} onClick={() => setMonth(i)}>{x.label.slice(0, 3)}</button>)}</div>
          <div className="gg-cal-grid">
            {DOW.map((d) => <div key={d} className="gg-cal-dow">{d}</div>)}
            {cells.map((dnum, i) => {
              if (!dnum) return <div key={`b${i}`} className="gg-cal-cell blank" />;
              const key = `${cur.y}-${cur.m}-${dnum}`;
              const g = byDate.get(key);
              const home = g && g.h === user.id;
              const opp = g && league.teams[home ? g.a : g.h];
              const r = g && outcome(g);
              const isToday = key === todayKey;
              return (
                <div key={key} className={`gg-cal-cell${g ? " game" : ""}${isToday ? " today" : ""}${r ? ` ${r.kind.toLowerCase()}` : ""}${g && !r && g.day === league.day ? " next" : ""}`} onClick={() => r && openBox(g)} role={r ? "button" : undefined} tabIndex={r ? 0 : undefined} title={g ? `${home ? "vs" : "@"} ${opp.city} ${opp.name}${r ? ` · ${r.kind} ${r.us}-${r.them}` : ""}` : undefined}>
                  <span className="gg-cal-day">{dnum}</span>
                  {g && (
                    <div className="gg-cal-game">
                      <TeamBadge team={opp} size={44} decorative />
                      <span className="gg-cal-opp"><small>{home ? "VS" : "@"}</small>{opp.abbr}</span>
                      {r ? <span className={`gg-cal-res ${r.kind.toLowerCase()}`}>{r.kind} {r.us}-{r.them}{r.ot ? ` ${r.ot}` : ""}</span> : <span className="gg-cal-res tbd">{isToday || g.day === league.day ? "NEXT" : dayToDate(league.year, g.day, league.scheduleStart).split(" ")[0] === "" ? "" : "7:00 PM"}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="gg-cal-legend"><span><i className="w" /> Win</span><span><i className="l" /> Loss</span><span><i className="otl" /> OT/SO loss</span><span><i className="next" /> Next game</span><span className="dim">Click a played game for the box score.</span></div>
        </div>
      )}

      {view === "list" && (
        <div className="gg-card" style={{ padding: 0 }}>
          <div className="gg-glist">
            {mine.map((g, i) => {
              const home = g.h === user.id, opp = league.teams[home ? g.a : g.h], r = outcome(g);
              return (
                <div key={g.id} className={`gg-grow${r ? ` ${r.kind.toLowerCase()}` : ""}${g.day === league.day && !g.played ? " next" : ""}`} onClick={() => r && openBox(g)}>
                  <span className="gg-gnum">{i + 1}</span>
                  <span className="gg-gdate">{dayToDate(league.year, g.day, league.scheduleStart)}</span>
                  <TeamBadge team={opp} size={30} decorative />
                  <span className="gg-gopp"><small>{home ? "vs" : "@"}</small> <TeamName tid={opp.id} /></span>
                  <span className={`gg-gres${r ? ` ${r.kind.toLowerCase()}` : ""}`}>{r ? `${r.kind} ${r.us}-${r.them}${r.ot ? ` (${r.ot})` : ""}` : "—"}</span>
                  <span className="gg-grec mono dim">{r ? running.get(g.id) : ""}</span>
                  <span className="gg-gshots mono dim">{r ? `SOG ${home ? g.shots.h : g.shots.a}-${home ? g.shots.a : g.shots.h}` : ""}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "day" && (
        <>
          <div className="row" style={{ gap: 8 }}>
            <button className="small" disabled={days.indexOf(day) <= 0} onClick={() => setDay(days[days.indexOf(day) - 1])}>◀</button>
            <b>{dayToDate(league.year, day, league.scheduleStart)}</b>
            <button className="small" disabled={days.indexOf(day) >= days.length - 1} onClick={() => setDay(days[days.indexOf(day) + 1])}>▶</button>
            <span className="muted small">{dayGames.length} games</span>
            <button className="small ghost" onClick={() => setDay(Math.min(league.day, lastDay(league.schedule)))}>Today</button>
          </div>
          <div className="gg-scores">
            {dayGames.map((g) => (
              <div key={g.id} className={`gg-score${g.played ? " done" : ""}${g.h === user.id || g.a === user.id ? " me" : ""}`} onClick={() => g.played && openBox(g)}>
                {[["a", g.a, g.as], ["h", g.h, g.hs]].map(([k, tid, sc]) => {
                  const won = g.played && ((k === "h" && g.hs > g.as) || (k === "a" && g.as > g.hs));
                  return (
                    <div className={`gg-score-row${won ? " won" : ""}`} key={k}>
                      <TeamBadge team={league.teams[tid]} size={34} decorative />
                      <span className="gg-score-name"><b>{league.teams[tid].abbr}</b><small>{league.teams[tid].rec.w}-{league.teams[tid].rec.l}-{league.teams[tid].rec.otl}</small></span>
                      <span className="gg-score-n">{g.played ? sc : ""}</span>
                    </div>
                  );
                })}
                <div className="gg-score-foot">{g.played ? `Final${g.ot ? " / " + g.ot : ""}` : "7:00 PM"}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
