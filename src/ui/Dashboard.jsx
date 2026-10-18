import React from "react";
import { useGame, TeamBadge, PlayerName, TeamName, money, recordStr } from "./common.jsx";
import { divisionTable } from "../engine/standings.js";
import { teamRatings } from "../engine/lines.js";
import { capSpace, payroll, rosterIssues, counts, capYear } from "../engine/roster.js";
import { capForYear, isGoalie } from "../engine/constants.js";
import { dayToDate } from "../engine/schedule.js";
import { userGameOnDay } from "../engine/league.js";
import { userSeries } from "../engine/playoffs.js";
import { currentSlot } from "../engine/draft.js";
import { contractCount } from "../engine/hockeyRules.js";
import { ensurePulse, repTier, tierColor, playoffOdds, powerRankings, rosterGrades, gradeColor } from "../engine/clubPulse.js";

// GM Dashboard, laid out like Gridiron GM's HOME tab: a grid of dense status cards.
const Bar = ({ v, color, h = 8 }) => (
  <div className="gg-bar" style={{ height: h }}><i style={{ width: `${Math.max(0, Math.min(100, v))}%`, background: color }} /></div>
);
const Meter = ({ label, v, color, suffix = "" }) => (
  <div className="gg-meter">
    <span>{label}</span>
    <Bar v={v} color={color} h={5} />
    <b style={{ color }}>{Math.round(v)}{suffix}</b>
  </div>
);
const POS_GROUPS = [["C", ["C"]], ["LW", ["LW"]], ["RW", ["RW"]], ["LD", ["LD"]], ["RD", ["RD"]], ["G", ["G"]]];

export default function Dashboard({ act = {} }) {
  const { league: lg, go, openBox } = useGame();
  const t = lg.teams[lg.userTid];
  const gm = ensurePulse(lg);
  const rep = repTier(gm.rep);
  const ratings = teamRatings(lg, t);
  const grades = rosterGrades(lg, t.id);
  const div = divisionTable(lg, t.div);
  const divRank = div.findIndex((d) => d.id === t.id) + 1;
  const room = capSpace(lg, t);
  const cap = capForYear(capYear(lg));
  const used = payroll(lg, t);
  const roster = t.roster.map((id) => lg.players[id]).filter(Boolean);
  const injured = roster.filter((p) => p.injury > 0);
  const expiring = roster.filter((p) => p.yrs <= 1).length;
  const issues = rosterIssues(lg, t);
  const games = lg.schedule.filter((g) => g.h === t.id || g.a === t.id);
  const today = userGameOnDay(lg);
  const upcoming = games.filter((g) => !g.played).slice(0, 4);
  const recent = games.filter((g) => g.played).slice(-5).reverse();
  const series = lg.phase === "playoffs" ? userSeries(lg) : null;
  const slot = currentSlot(lg);
  const odds = lg.phase === "regular" ? playoffOdds(lg)[t.id] : null;
  const power = lg.phase === "regular" && t.rec.gp ? powerRankings(lg).find((r) => r.t.id === t.id) : null;
  const streak = Array.isArray(t.rec.streak) ? `${t.rec.streak[0] === "O" ? "OTL" : t.rec.streak[0]}${t.rec.streak[1]}` : null;
  const fans = t.owner?.fanSupport ?? 60;
  const trust = t.owner?.trust ?? 65;
  const pending = lg.offerSheets?.filter((s) => !s.done && s.from === t.id).length || 0;
  const stars = injured.filter((p) => p.ovr >= 83);

  const alerts = [];
  if (room < 0) alerts.push(["bad", `Over the cap by ${money(-room)}. Clear space before the next game.`]);
  issues.forEach((i) => alerts.push(["bad", i]));
  stars.forEach((p) => alerts.push(["warn", `${p.name} (${p.pos}, ${p.ovr}) is out ${p.injury} game${p.injury === 1 ? "" : "s"}.`]));
  if (pending) alerts.push(["warn", `${pending} offer sheet${pending > 1 ? "s" : ""} waiting for a matching decision.`]);
  if (["resign", "freeagency"].includes(lg.phase) && expiring) alerts.push(["warn", `${expiring} expiring contract${expiring > 1 ? "s" : ""}: re-sign window open.`]);
  if (trust < 35) alerts.push(["bad", `Owner trust is ${trust}/100. You are on the hot seat.`]);
  if (fans < 35) alerts.push(["warn", `Fan support is low (${fans}/100).`]);
  if (gm.presser) alerts.push(["info", "🎙️ The media is waiting for you at the podium."]);
  if (gm.speech) alerts.push(["info", "🏒 The locker room is waiting for a word from you."]);

  const res = (g) => {
    const home = g.h === t.id, us = home ? g.hs : g.as, them = home ? g.as : g.hs, win = us > them;
    return <b style={{ color: win ? "#22c55e" : g.ot ? "#eab308" : "#ef4444" }}>{win ? "W" : g.ot ? "OTL" : "L"} {us}-{them}{g.ot ? " (OT)" : ""}</b>;
  };

  const primary = (() => {
    if (lg.phase === "preseason") return <button className="primary" onClick={act.startSeason}>Start Season</button>;
    if (lg.phase === "regular" && today) return <><button className="primary" onClick={act.playLive}>▶ Play Live</button><button onClick={act.simDay}>Sim Game</button></>;
    if (lg.phase === "regular") return <button className="primary" onClick={act.simDay}>Advance one day</button>;
    if (series && series.winner == null) return <button className="primary" onClick={act.playPlayoffLive}>▶ Play Next Game Live</button>;
    if (lg.phase === "playoffs") return <button className="primary" onClick={() => go("playoffs")}>Playoff bracket</button>;
    if (lg.phase === "draft") return <button className="primary" onClick={() => go("draft")}>{slot ? `Draft room · pick #${slot.overall}` : "Draft room"}</button>;
    return <button className="primary" onClick={() => go("freeagency")}>{lg.phase === "resign" ? "Re-sign players" : "Free agency"}</button>;
  })();

  return (
    <div className="gg-dash stack">
      <div className="gg-pagehead"><h2>GM Dashboard</h2><span className="dim small">{dayToDate(lg.year, lg.day, lg.scheduleStart)}</span></div>
      <div className="gg-cards">
        <section className="gg-card">
          <div className="gg-k">TEAM STATUS</div>
          <div className="row" style={{ gap: 10 }}>
            <TeamBadge team={t} size={40} />
            <div>
              <div className="gg-card-title">{t.city} {t.name}</div>
              <div className="dim small">{lg.year}-{String(lg.year + 1).slice(2)} {lg.phase === "regular" ? "Regular season" : lg.phase === "preseason" ? "Preseason" : lg.phase === "playoffs" ? "Playoffs" : "Off-season"}</div>
            </div>
          </div>
          <div className="gg-record"><span className="good">{t.rec.w}W</span> <span className="bad">{t.rec.l}L</span> <span className="warn">{t.rec.otl}OTL</span> <span className="dim">· {t.rec.pts} PTS</span>{streak && <span className="gg-pill">{streak}</span>}</div>
          <div className="dim small">{t.div} Division — <b className="good">{divRank}{["st", "nd", "rd"][divRank - 1] || "th"}</b> · {t.conf}ern Conference</div>
          {(power || odds != null) && <div className="small" style={{ marginTop: 4 }}>{power && <>Power rank <b>#{power.rank}</b>{power.move ? <span className={power.move > 0 ? "good" : "bad"}> {power.move > 0 ? "▲" : "▽"}{Math.abs(power.move)}</span> : null}</>}{odds != null && <> · Playoff odds <b style={{ color: tierColor(odds * 100, 70, 35) }}>{Math.round(odds * 100)}%</b></>}</div>}
        </section>

        <section className="gg-card">
          <div className="gg-k">SALARY CAP</div>
          <div className="gg-split"><span className="gg-big" style={{ color: room < 0 ? "#ef4444" : "#22c55e" }}>{money(room)}</span><span className="dim small">of {money(cap)}</span></div>
          <Bar v={(used / cap) * 100} color={room < 2 ? "#ef4444" : room < 8 ? "#eab308" : "#22c55e"} />
          <div className="gg-split small"><span>Used: <b className="gold">{money(used)}</b></span><span>{contractCount(lg, t)}/50 contracts</span></div>
          <div className="small warn">{expiring} expiring contract{expiring === 1 ? "" : "s"}</div>
          <div className="gg-link" onClick={() => go("roster")}>View Roster →</div>
        </section>

        <section className="gg-card">
          <div className="gg-k">ROSTER HEALTH</div>
          <div><b className="good">{roster.length - injured.length} healthy</b> <b className="bad">{injured.length} injured</b> <span className="dim small">Active {counts(lg, t).active}/23 · Prospects {t.prospects.length}</span></div>
          <div className="gg-dots">
            {POS_GROUPS.map(([lab, ps]) => {
              const at = roster.filter((p) => ps.includes(p.pos));
              const hurt = at.filter((p) => p.injury > 0).length;
              return <div key={lab}><i style={{ background: hurt >= 2 ? "#ef4444" : hurt ? "#f59e0b" : "#22c55e" }} title={`${at.length} at ${lab}, ${hurt} injured`} /><small>{lab}</small></div>;
            })}
          </div>
          <div className="gg-grades">
            {[["F", grades.F], ["D", grades.D], ["G", grades.G]].map(([k, g]) => <span key={k}>{k} <b style={{ color: gradeColor(g) }}>{g}</b></span>)}
            <span className="dim">OVR {ratings.ovr}</span>
          </div>
          <div className="gg-link" onClick={() => go("lines")}>Set Lines →</div>
        </section>

        <section className="gg-card">
          <div className="gg-k">TEAM INTEL</div>
          <Meter label="Morale" v={t.morale} color={tierColor(t.morale)} />
          <Meter label="Chemistry" v={t.chemistry} color={tierColor(t.chemistry, 80, 65)} />
          <div className="gg-meter"><span>GM Rep</span><span /><b style={{ color: rep.color }}>{rep.label} ({Math.round(gm.rep)})</b></div>
          <Meter label="Fan Support" v={fans} color={tierColor(fans)} suffix="%" />
          <Meter label="Owner Trust" v={trust} color={tierColor(trust)} />
          <div className="gg-meter"><span>Season Pts</span><span /><b style={{ color: "#3b82f6", fontSize: 15 }}>{gm.sp} SP</b></div>
        </section>

        <section className="gg-card">
          <div className="gg-k">{series ? "PLAYOFF SERIES" : "UPCOMING GAMES"}</div>
          {series ? (
            <div className="gg-series">
              <TeamBadge team={lg.teams[series.top]} size={30} /><b>{series.wTop} – {series.wBot}</b><TeamBadge team={lg.teams[series.bot]} size={30} />
              <span className="dim small">{series.winner == null ? "Best of seven" : "Series complete"}</span>
            </div>
          ) : upcoming.length ? upcoming.map((g) => {
            const opp = lg.teams[g.h === t.id ? g.a : g.h];
            return (
              <div key={g.id} className="gg-game">
                <span className="dim small">{dayToDate(lg.year, g.day, lg.scheduleStart)}</span>
                <b className={g.h === t.id ? "good" : "warn"}>{g.h === t.id ? "vs" : "@"}</b>
                <TeamBadge team={opp} size={18} />
                <TeamName tid={opp.id} />
                <span className="dim small">{recordStr(opp.rec)}</span>
              </div>
            );
          }) : <div className="dim small">No games scheduled.</div>}
          <div className="gg-link" onClick={() => go("schedule")}>Full Schedule →</div>
        </section>

        <section className="gg-card">
          <div className="gg-k">ALERTS</div>
          {alerts.length ? alerts.slice(0, 7).map(([kind, text], i) => <div key={i} className={`small ${kind === "bad" ? "bad" : kind === "warn" ? "warn" : "info"}`}>{text}</div>) : <div className="small good">All clear — no urgent issues</div>}
        </section>

        <section className="gg-card">
          <div className="gg-k">RECENT RESULTS</div>
          {recent.length ? recent.map((g) => {
            const opp = lg.teams[g.h === t.id ? g.a : g.h];
            return (
              <div key={g.id} className="gg-game clickable" onClick={() => openBox(g)}>
                <span className="dim small">{dayToDate(lg.year, g.day, lg.scheduleStart)}</span>
                <span>{g.h === t.id ? "vs" : "@"} {opp.abbr}</span>
                {res(g)}
                <span className="gg-link small">📊 Box</span>
              </div>
            );
          }) : <div className="dim small">No games played yet.</div>}
        </section>

        <section className="gg-card">
          <div className="gg-k">RECENT ACTIVITY</div>
          {(lg.news?.length ? lg.news.slice(0, 6) : lg.inbox.slice(-6).reverse()).map((n, i) => <div key={i} className="small gg-news">{n.text}</div>)}
          {!lg.news?.length && !lg.inbox.length && <div className="dim small">The next chapter starts when the puck drops.</div>}
          <div className="gg-link" onClick={() => go("activity")}>Full Log →</div>
        </section>

        <section className="gg-card">
          <div className="gg-k">CLUB LEADERS</div>
          {[["PTS", (p) => p.stats.pts], ["G", (p) => p.stats.g], ["A", (p) => p.stats.a]].map(([k, f]) => {
            const p = roster.filter((x) => !isGoalie(x.pos)).sort((a, b) => f(b) - f(a) || b.ovr - a.ovr)[0];
            return p ? <div key={k} className="gg-game"><span className="gg-pill">{k}</span><PlayerName p={p} /><b>{t.rec.gp ? f(p) : "—"}</b></div> : null;
          })}
          <div className="gg-link" onClick={() => go("stats")}>Season Leaders →</div>
        </section>
      </div>
      <div className="gg-quick">{primary}<button onClick={() => go("lines")}>Lines</button><button onClick={() => go("analysis")} aria-label="Open planning & reports">Game Plan</button><button onClick={() => go("standings")}>Standings</button></div>
    </div>
  );
}
