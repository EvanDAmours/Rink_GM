import React, { useMemo, useState } from "react";
import Select from "./Select.jsx";
import { useGame, PlayerName, TeamName, TeamBadge } from "./common.jsx";
import { HISTORICAL_RECORDS as H } from "../data/historicalRecords.js";
import { franchiseRecords } from "../engine/records.js";
import { isGoalie } from "../engine/constants.js";

// Record Book: the real NHL marks for every franchise and the league, with your
// league's players measured against them. Beat one and it's yours.
const fmt = (n) => (n == null ? "—" : n.toLocaleString("en-US"));
const seasonLabel = (y) => (typeof y === "string" ? y : `${y}–${String(y + 1).slice(2)}`);

function RecordCard({ label, value, holder, when, thisSeason, tone = "light", beaten }) {
  const p = value ? Math.min(100, Math.round(((thisSeason?.value || 0) / value) * 100)) : 0;
  return (
    <div className={`gg-rec ${tone}${beaten ? " beaten" : ""}`}>
      <small>{label}</small>
      <b>{fmt(value)}</b>
      <span className="gg-rec-holder">{holder}{when ? ` · ${when}` : ""}</span>
      {thisSeason && <><div className="gg-rec-bar"><i style={{ width: `${p}%` }} /></div><span className="gg-rec-now">This season: {thisSeason.name}, {fmt(thisSeason.value)}{beaten ? " · NEW RECORD" : ""}</span></>}
    </div>
  );
}
function LeaderCard({ label, rows, active, unit }) {
  const top = rows[0];
  return (
    <div className="gg-rec gold">
      <small>{label}</small>
      <b>{fmt(top?.value)}</b>
      <span className="gg-rec-holder">{top?.name}{top?.years ? ` · ${top.years}` : ""}</span>
      <ol className="gg-rec-list">{rows.slice(1, 5).map((r, i) => <li key={i}><span>{i + 2}.</span><span className={r.active ? "active" : ""}>{r.name}{r.active ? " ●" : ""}</span><b>{fmt(r.value)}</b></li>)}</ol>
      {active && <div className="gg-rec-now strong">{active.name}: {fmt(active.value)}{top ? ` · ${fmt(Math.max(0, (rows[4]?.value ?? top.value) - active.value))} from the top ${Math.min(5, rows.length)}` : ""}</div>}
    </div>
  );
}

export default function RecordBookPage() {
  const { league } = useGame();
  const [view, setView] = useState("franchise");
  const [tid, setTid] = useState(String(league.userTid));
  const team = league.teams[Number(tid)];
  const F = H.franchises[team.abbr], L = H.league;
  const club = franchiseRecords(league, team.id);
  const rb = league.recordBook || { season: {}, career: {}, game: {} };
  const players = useMemo(() => Object.values(league.players).filter((p) => p.tid === team.id && p.stats.gp), [league, team.id, league.day]); // eslint-disable-line react-hooks/exhaustive-deps
  const best = (key) => players.filter((p) => !isGoalie(p.pos)).sort((a, b) => b.stats[key] - a.stats[key])[0];
  const bestG = (key) => players.filter((p) => isGoalie(p.pos)).sort((a, b) => b.stats[key] - a.stats[key])[0];
  const now = (p, key) => (p ? { name: p.name, value: p.stats[key] } : null);
  // Career totals with this club (simulated seasons only), merged into the real top-5 lists.
  const careerWith = (p, key) => (p.career || []).filter((c) => c.t === team.abbr).reduce((s, c) => s + (c.s?.[key] ?? (key === "pts" ? (c.s?.g || 0) + (c.s?.a || 0) : 0)), 0) + (p.stats?.[key] ?? (key === "pts" ? p.stats.g + p.stats.a : 0));
  const merged = (list, key, goalie = false) => {
    const sim = Object.values(league.players).filter((p) => (p.tid === team.id || (p.career || []).some((c) => c.t === team.abbr)) && isGoalie(p.pos) === goalie).map((p) => ({ name: p.name, value: careerWith(p, key), active: p.tid === team.id, pid: p.id })).filter((r) => r.value > 0);
    const real = (list || []).map((r) => ({ ...r }));
    // A real player who is also in your league adds his simulated totals to his real count.
    for (const s of sim) { const hit = real.find((r) => r.name === s.name); if (hit) { hit.value += s.value; hit.active = s.active; } else real.push(s); }
    const rows = real.sort((a, b) => b.value - a.value);
    const activeBest = sim.filter((s) => s.active).sort((a, b) => b.value - a.value)[0];
    return { rows: rows.slice(0, 5), active: activeBest && !rows.slice(0, 5).some((r) => r.name === activeBest.name) ? activeBest : null };
  };
  const simSeasons = (league.seasonArchive || []).map((s) => ({ year: s.year, ...(s.teams.find((t) => t.tid === team.id)?.rec || {}) }));
  const teamBest = (k) => simSeasons.reduce((m, s) => Math.max(m, s[k] || 0), team.rec?.[k] || 0);

  return (
    <div className="stack gg-records">
      <div className="gg-pagehead">
        <div><h2>Record Book</h2><div className="gg-status">Real NHL records for every franchise and the league, through {H.generated.slice(0, 4)}. They stand until someone in your league beats them.</div></div>
        <div className="gg-chips"><button className={view === "franchise" ? "on" : ""} onClick={() => setView("franchise")}>Franchise</button><button className={view === "league" ? "on" : ""} onClick={() => setView("league")}>NHL records</button><button className={view === "mine" ? "on" : ""} onClick={() => setView("mine")}>Your league</button></div>
      </div>

      {view === "franchise" && F && (
        <>
          <div className="gg-rec-hero" style={{ "--c1": team.colors[0] }}>
            <TeamBadge team={team} size={64} decorative />
            <div><h3>{F.name}</h3><div className="dim small">Since {F.firstSeason} · {F.totals.w}-{F.totals.l}-{(F.totals.t || 0) + (F.totals.otl || 0)} all time · {F.totals.cups} Stanley Cups · {F.totals.playoffSeasons} playoff seasons</div></div>
            <Select aria-label="Record club" value={tid} onChange={(e) => setTid(e.target.value)} style={{ marginLeft: "auto", minWidth: 230 }}>{league.teams.map((t) => <option key={t.id} value={t.id}>{t.city} {t.name}</option>)}</Select>
          </div>
          <div className="gg-rec-sec"><h3>SINGLE-SEASON RECORDS</h3><span className="dim small">The club's best single seasons, real history plus your league. Beat one and it's yours.</span></div>
          <div className="gg-rec-grid">
            <RecordCard label="GOALS" value={F.seasonSkater.goals.value} holder={F.seasonSkater.goals.name} when={F.seasonSkater.goals.season} thisSeason={now(best("g"), "g")} beaten={best("g")?.stats.g > F.seasonSkater.goals.value} />
            <RecordCard label="ASSISTS" value={F.seasonSkater.assists.value} holder={F.seasonSkater.assists.name} when={F.seasonSkater.assists.season} thisSeason={now(best("a"), "a")} beaten={best("a")?.stats.a > F.seasonSkater.assists.value} />
            <RecordCard label="POINTS" value={F.seasonSkater.points.value} holder={F.seasonSkater.points.name} when={F.seasonSkater.points.season} thisSeason={now(best("pts"), "pts")} beaten={best("pts")?.stats.pts > F.seasonSkater.points.value} />
            <RecordCard label="GOALIE WINS" value={F.seasonGoalie.wins.value} holder={F.seasonGoalie.wins.name} when={F.seasonGoalie.wins.season} thisSeason={now(bestG("w"), "w")} beaten={bestG("w")?.stats.w > F.seasonGoalie.wins.value} />
            <RecordCard label="SHUTOUTS" value={F.seasonGoalie.shutouts.value} holder={F.seasonGoalie.shutouts.name} when={F.seasonGoalie.shutouts.season} thisSeason={now(bestG("so"), "so")} beaten={bestG("so")?.stats.so > F.seasonGoalie.shutouts.value} />
            <RecordCard label="TEAM WINS" value={F.team.wins.value} holder={F.name} when={F.team.wins.season} thisSeason={{ name: "so far", value: team.rec.w }} beaten={teamBest("w") > F.team.wins.value} />
            <RecordCard label="TEAM POINTS" value={F.team.points.value} holder={F.name} when={F.team.points.season} thisSeason={{ name: "so far", value: team.rec.pts }} beaten={teamBest("pts") > F.team.points.value} />
            <RecordCard label="GOALS FOR" value={F.team.goalsFor.value} holder={F.name} when={F.team.goalsFor.season} thisSeason={{ name: "so far", value: team.rec.gf }} beaten={teamBest("gf") > F.team.goalsFor.value} />
            <RecordCard label="FEWEST GOALS AGAINST" value={F.team.fewestGoalsAgainst.value} holder={F.name} when={F.team.fewestGoalsAgainst.season} />
          </div>
          <div className="gg-rec-sec"><h3>FRANCHISE CAREER LEADERS</h3><span className="dim small">All-time leaders with the club: its real history, plus everything done in your league. ● marks a current player.</span></div>
          <div className="gg-rec-grid">
            {[["GOALS", "goals", "g", false], ["ASSISTS", "assists", "a", false], ["POINTS", "points", "pts", false], ["GOALIE WINS", "wins", "w", true], ["SHUTOUTS", "shutouts", "so", true]].map(([label, real, key, goalie]) => { const m = merged(goalie ? F.careerGoalie[real] : F.careerSkater[real], key, goalie); return <LeaderCard key={label} label={label} rows={m.rows} active={m.active} />; })}
            <div className="gg-rec gold"><small>GAMES PLAYED</small><b>{fmt(F.careerSkater.games.value)}</b><span className="gg-rec-holder">{F.careerSkater.games.name} · {F.careerSkater.games.years}</span></div>
          </div>
          <div className="gg-rec-sec"><h3>SEASON BY SEASON</h3><span className="dim small">Real seasons in grey and blue (playoffs), gold for a Cup; your simulated seasons in green.</span></div>
          <div className="gg-rec-chart" role="img" aria-label="Season points history">
            {F.history.slice(-30).map((h) => <div key={h.y} title={`${String(h.y).slice(0, 4)}-${String(h.y).slice(6)}: ${h.w}-${h.l}-${(h.otl || 0) + (h.t || 0)}, ${h.pts} PTS${h.cup ? " · Stanley Cup" : ""}`} style={{ height: `${Math.max(4, (h.pts / 140) * 100)}%`, background: h.cup ? "#eab308" : h.po ? "#3b82f6" : "#334155" }} />)}
            {simSeasons.map((s) => <div key={s.year} title={`Your ${s.year}: ${s.w}-${s.l}-${s.otl}, ${s.pts} PTS`} style={{ height: `${Math.max(4, ((s.pts || 0) / 140) * 100)}%`, background: "#22c55e" }} />)}
          </div>
          <p className="muted small">Source: <a href="https://records.nhl.com" target="_blank" rel="noreferrer">records.nhl.com</a> and the NHL Stats API, regular season. Regenerate with <code>npm run refresh:records</code>.</p>
        </>
      )}

      {view === "league" && (
        <>
          <div className="gg-rec-sec"><h3>NHL SINGLE-SEASON RECORDS</h3><span className="dim small">The league's marks. Your league's best this season is shown underneath.</span></div>
          <div className="gg-rec-grid">
            {[["GOALS", L.seasonSkater.goals, "g", false], ["ASSISTS", L.seasonSkater.assists, "a", false], ["POINTS", L.seasonSkater.points, "pts", false], ["GOALIE WINS", L.seasonGoalie.wins, "w", true], ["SHUTOUTS", L.seasonGoalie.shutouts, "so", true]].map(([label, rows, key, goalie]) => { const top = rows[0]; const p = Object.values(league.players).filter((x) => x.tid >= 0 && isGoalie(x.pos) === goalie && x.stats.gp).sort((a, b) => b.stats[key] - a.stats[key])[0]; return <RecordCard key={label} label={label} value={top.value} holder={`${top.name} (${top.team})`} when={top.season} thisSeason={p ? { name: p.name, value: p.stats[key] } : null} beaten={p && p.stats[key] > top.value} />; })}
            {[["TEAM WINS", L.teamSeason.wins], ["TEAM POINTS", L.teamSeason.points], ["TEAM GOALS FOR", L.teamSeason.goalsFor], ["FEWEST GOALS AGAINST", L.teamSeason.fewestGoalsAgainst]].map(([label, r]) => <RecordCard key={label} label={label} value={r.value} holder={r.name} when={r.season} />)}
          </div>
          <div className="gg-rec-sec"><h3>NHL CAREER LEADERS</h3></div>
          <div className="gg-rec-grid">
            {[["GOALS", L.careerSkater.goals], ["ASSISTS", L.careerSkater.assists], ["POINTS", L.careerSkater.points], ["GOALIE WINS", L.careerGoalie.wins], ["SHUTOUTS", L.careerGoalie.shutouts]].map(([label, rows]) => <LeaderCard key={label} label={label} rows={rows} />)}
          </div>
        </>
      )}

      {view === "mine" && (
        <>
          <div className="gg-rec-sec"><h3>RECORDS SET IN YOUR LEAGUE</h3><span className="dim small">Single-game, single-season and career marks from simulated play only.</span></div>
          {["game", "season", "career"].map((scope) => (
            <div key={scope}>
              <div className="gg-k" style={{ margin: "8px 0 4px" }}>{scope === "game" ? "SINGLE GAME" : scope === "season" ? "SINGLE SEASON" : "CAREER"}</div>
              <div className="gg-rec-grid">
                {Object.entries({ g: "Goals", a: "Assists", pts: "Points", w: "Goalie wins", so: "Shutouts", sa: "Saves" }).filter(([k]) => scope !== "game" || !["w"].includes(k)).map(([k, label]) => { const r = rb[scope]?.[k]; return <div key={k} className="gg-rec light"><small>{label.toUpperCase()}</small><b>{r ? fmt(r.value) : "—"}</b><span className="gg-rec-holder">{r ? <>{league.players[r.pid] ? <PlayerName p={league.players[r.pid]} /> : r.name} · <TeamName tid={r.tid} short /> · {seasonLabel(r.year)}</> : "No record yet"}</span></div>; })}
              </div>
            </div>
          ))}
          <div className="gg-rec-sec"><h3>RECORDS BROKEN OR TIED IN YOUR LEAGUE</h3></div>
          <div className="gg-card">{(() => {
            const broken = [];
            for (const t of league.teams) { const f = H.franchises[t.abbr]; if (!f) continue; const ps = Object.values(league.players).filter((p) => p.tid === t.id && p.stats.gp); for (const [label, rec, key, goalie] of [["goals", f.seasonSkater.goals, "g", false], ["assists", f.seasonSkater.assists, "a", false], ["points", f.seasonSkater.points, "pts", false], ["goalie wins", f.seasonGoalie.wins, "w", true], ["shutouts", f.seasonGoalie.shutouts, "so", true]]) { const p = ps.filter((x) => isGoalie(x.pos) === goalie).sort((a, b) => b.stats[key] - a.stats[key])[0]; if (p && p.stats[key] >= rec.value && rec.value > 0) broken.push(`${p.name} ${p.stats[key] > rec.value ? "broke" : "tied"} the ${t.name} single-season ${label} record (${rec.name}, ${rec.value}) with ${p.stats[key]}.`); } }
            return broken.length ? broken.map((b, i) => <div key={i} className="small">🏅 {b}</div>) : <div className="dim">No records have fallen yet. When one does, it's written here.</div>;
          })()}</div>
        </>
      )}
    </div>
  );
}
