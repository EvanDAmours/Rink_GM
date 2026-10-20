import React, { useMemo, useState } from "react";
import Select from "./Select.jsx";
import { useGame, PlayerName, TeamName, TeamBadge } from "./common.jsx";
import { HISTORICAL_RECORDS as H } from "../data/historicalRecords.js";
import { careerLeaders, seasonMark, SEASON_MARKS, poss } from "../engine/records.js";
import { isGoalie } from "../engine/constants.js";

// Record Book: the real NHL marks for every franchise and the league, with your
// league's players measured against them. Beat one and it's yours.
const fmt = (n) => (n == null ? "—" : n.toLocaleString("en-US"));
const seasonLabel = (y) => (typeof y === "string" ? y : `${y}–${String(y + 1).slice(2)}`);

// One single-season mark. `mark` is the standing record from the book (engine/records.js): the
// real one, or one set in your league, which goes gold as Gridiron's do ("★ YOURS", whose mark it broke).
// showTeam: name the holder's club (the NHL view). thisSeason: { name, value } of this season's leader.
function RecordCard({ label, value, holder, when, thisSeason, tone = "light", mark, showTeam = false }) {
  const { league } = useGame();
  const set = !!mark && !mark.real;
  const v = mark ? mark.value : value;
  // Set this season: the leader is the holder (NEW RECORD) unless someone has passed him since.
  const fresh = set && mark.year === league.year && league.phase === "regular";
  const pct = v ? Math.min(100, Math.round(((thisSeason?.value || 0) / v) * 100)) : 0;
  const pl = set && mark.pid != null ? league.players[mark.pid] : null;
  const who = mark ? (pl ? <PlayerName p={pl} showInj={false} /> : mark.name) : holder;
  const club = showTeam && mark?.team ? ` (${mark.team})` : "";
  const whenText = mark ? mark.season || seasonLabel(mark.year) : when;
  return (
    <div className={`gg-rec ${tone}${fresh ? " beaten" : ""}${set ? " yours" : ""}`}>
      <div className="gg-rec-top"><small>{label}</small>{set && <span className="gg-rec-tag" title="Set in your league">★ YOURS</span>}</div>
      <b>{fmt(v)}</b>
      <span className="gg-rec-holder">{who}{club}{whenText ? ` · ${whenText}` : ""}</span>
      {set && mark.prev && <span className="gg-rec-broke">Broke {poss(mark.prev.name)} {fmt(mark.prev.value)}{mark.prev.season ? ` (${mark.prev.season})` : ""}</span>}
      {thisSeason && <><div className="gg-rec-bar"><i style={{ width: `${pct}%` }} /></div><span className="gg-rec-now">This season: {thisSeason.name}, {fmt(thisSeason.value)}{fresh && thisSeason.value >= v ? " · NEW RECORD" : ""}</span></>}
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
  // The standing marks: real history, or the new holder once one falls in your league.
  const fm = (key) => seasonMark(league, "franchise", key, team.abbr);
  const nm = (key) => seasonMark(league, "nhl", key);
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
  const inSeason = league.phase === "regular" || league.phase === "playoffs";
  const clubNow = (k) => (inSeason && team.rec?.gp ? { name: team.name, value: team.rec[k] || 0 } : null);

  return (
    <div className="stack gg-records">
      <div className="gg-pagehead">
        <div><h2>Record Book</h2><div className="gg-status">Real NHL records for every franchise and the league, through {H.generated.slice(0, 4)}. They stand until someone in your league beats them.</div></div>
        <div className="gg-chips"><button className={view === "franchise" ? "on" : ""} onClick={() => setView("franchise")}>Franchise</button><button className={view === "league" ? "on" : ""} onClick={() => setView("league")}>NHL records</button><button className={view === "mine" ? "on" : ""} onClick={() => setView("mine")}>Your league</button><button className={view === "careers" ? "on" : ""} onClick={() => setView("careers")}>Career leaders</button></div>
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
            <RecordCard label="GOALS" mark={fm("g")} thisSeason={now(best("g"), "g")} />
            <RecordCard label="ASSISTS" mark={fm("a")} thisSeason={now(best("a"), "a")} />
            <RecordCard label="POINTS" mark={fm("pts")} thisSeason={now(best("pts"), "pts")} />
            <RecordCard label="GOALIE WINS" mark={fm("w")} thisSeason={now(bestG("w"), "w")} />
            <RecordCard label="SHUTOUTS" mark={fm("so")} thisSeason={now(bestG("so"), "so")} />
            <RecordCard label="TEAM WINS" mark={fm("tw")} thisSeason={clubNow("w")} />
            <RecordCard label="TEAM POINTS" mark={fm("tpts")} thisSeason={clubNow("pts")} />
            <RecordCard label="GOALS FOR" mark={fm("tgf")} thisSeason={clubNow("gf")} />
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
            {[["GOALS", "g", false], ["ASSISTS", "a", false], ["POINTS", "pts", false], ["GOALIE WINS", "w", true], ["SHUTOUTS", "so", true]].map(([label, key, goalie]) => { const p = Object.values(league.players).filter((x) => x.tid >= 0 && isGoalie(x.pos) === goalie && x.stats.gp).sort((a, b) => b.stats[key] - a.stats[key])[0]; return <RecordCard key={label} label={label} mark={nm(key)} showTeam thisSeason={p ? { name: p.name, value: p.stats[key] } : null} />; })}
            {[["TEAM WINS", "tw", "w"], ["TEAM POINTS", "tpts", "pts"], ["TEAM GOALS FOR", "tgf", "gf"]].map(([label, key, k]) => { const t = inSeason ? [...league.teams].sort((a, b) => (b.rec?.[k] || 0) - (a.rec?.[k] || 0))[0] : null; return <RecordCard key={label} label={label} mark={nm(key)} thisSeason={t?.rec?.gp ? { name: t.name, value: t.rec[k] || 0 } : null} />; })}
            <RecordCard label="FEWEST GOALS AGAINST" value={L.teamSeason.fewestGoalsAgainst.value} holder={L.teamSeason.fewestGoalsAgainst.name} when={L.teamSeason.fewestGoalsAgainst.season} />
          </div>
          <div className="gg-rec-sec"><h3>NHL CAREER LEADERS</h3></div>
          <div className="gg-rec-grid">
            {[["GOALS", L.careerSkater.goals], ["ASSISTS", L.careerSkater.assists], ["POINTS", L.careerSkater.points], ["GOALIE WINS", L.careerGoalie.wins], ["SHUTOUTS", L.careerGoalie.shutouts]].map(([label, rows]) => <LeaderCard key={label} label={label} rows={rows} />)}
          </div>
        </>
      )}

      {view === "careers" && <CareerLeaders league={league} />}
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
          <div className="gg-rec-sec"><h3>RECORDS BROKEN OR TIED IN YOUR LEAGUE</h3><span className="dim small">NHL and club single-season marks taken in your league, newest first. They stay in the book with the new holder.</span></div>
          <div className="gg-card gg-rec-log">{(() => {
            const rows = [];
            // Ties this season (a share of the mark, not the record itself).
            if (inSeason) for (const t of league.teams) { const ps = Object.values(league.players).filter((p) => p.tid === t.id && p.stats.gp); for (const d of SEASON_MARKS.filter((x) => !x.team)) { const rec = seasonMark(league, "franchise", d.key, t.abbr); const p = ps.filter((x) => isGoalie(x.pos) === d.goalie).sort((a, b) => b.stats[d.stat] - a.stats[d.stat])[0]; if (rec && p && p.stats[d.stat] === rec.value && String(rec.pid) !== String(p.id)) rows.push({ k: `tie-${t.abbr}-${d.key}`, mine: t.id === league.userTid, text: `🤝 ${p.name} tied the ${t.name} single-season ${d.label.toLowerCase()} record (${rec.name}, ${fmt(rec.value)}).` }); } }
            for (const e of [...(league.recordBook?.marks?.history || [])].reverse()) {
              const club = e.club ? league.teams.find((t) => t.abbr === e.club) : null;
              const where = e.scope === "nhl" ? "NHL" : `${club?.name || e.club}`;
              const cur = seasonMark(league, e.scope, e.key, e.club);
              const holds = cur && !cur.real && cur.year === e.year && String(cur.pid ?? cur.tid) === String(e.pid ?? e.tid) && cur.value > e.value ? ` (now ${fmt(cur.value)})` : "";
              const mine = e.pid != null ? league.players[e.pid]?.tid === league.userTid : e.tid === league.userTid;
              rows.push({ k: `${e.scope}-${e.club}-${e.key}-${e.year}-${e.day}-${e.pid ?? e.tid}`, mine, text: `${e.scope === "nhl" ? "🏆" : "🏅"} ${seasonLabel(e.year)}: ${e.name} set the ${where} single-season ${e.label.toLowerCase()} record with ${fmt(e.value)}${holds}${e.prev ? `, passing ${poss(e.prev.name)} ${fmt(e.prev.value)}${e.prev.season ? ` (${e.prev.season})` : ""}` : ""}.` });
            }
            return rows.length ? rows.slice(0, 60).map((r) => <div key={r.k} className={`small${r.mine ? " mine" : ""}`}>{r.text}</div>) : <div className="dim">No records have fallen yet. When one does, it's written here.</div>;
          })()}</div>
        </>
      )}
    </div>
  );
}

const CAREER_KEYS = [["pts", "Points"], ["g", "Goals"], ["a", "Assists"], ["gp", "Games played"], ["w", "Goalie wins"], ["so", "Shutouts"]];
function CareerLeaders({ league }) {
  const rows = useMemo(() => careerLeaders(league, { limit: 10 }), [league, league.day, league.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const user = league.userTid;
  return (
    <>
      <div className="gg-rec-sec"><h3>ALL-TIME LEADERS · YOUR LEAGUE</h3><span className="dim small">Every season simulated in this franchise, active and retired players alike. Milestones (500 goals, 1,000 games, 1,000 points) are marked on player cards.</span></div>
      <div className="gg-rec-grid">
        {CAREER_KEYS.map(([k, label]) => <div key={k} className="gg-rec gold gg-rec-career"><small>{label}</small><b>{fmt(rows[k][0]?.value)}</b><span className="gg-rec-holder">{rows[k][0] ? `${rows[k][0].name}${rows[k][0].active ? "" : " (retired)"}` : "No games played yet"}</span>
          <ol className="gg-rec-list">{rows[k].slice(1).map((r, i) => <li key={r.pid + i}><span>{i + 2}.</span><span className={r.active ? "active" : ""}>{league.players[r.pid] ? <PlayerName p={league.players[r.pid]} showInj={false} /> : r.name}{r.tid === user ? " ★" : ""}{r.active ? "" : " (ret.)"}</span><b>{fmt(r.value)}</b></li>)}</ol></div>)}
      </div>
    </>
  );
}
