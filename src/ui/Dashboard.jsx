import React, { useState } from "react";
import { useGame, TeamBadge, PlayerName, TeamName, money, ovrColor } from "./common.jsx";
import Select from "./Select.jsx";
import { divisionTable, conferenceTable } from "../engine/standings.js";
import { teamRatings, gameLines } from "../engine/lines.js";
import { capSpace, payroll, rosterIssues, counts, capYear } from "../engine/roster.js";
import { capForYear, isGoalie, isDefense } from "../engine/constants.js";
import { dayToDate } from "../engine/schedule.js";
import { userGameOnDay, seasonOver } from "../engine/league.js";
import { expiringPlayers, faAsk, resignAsk } from "../engine/offseason.js";
import { ROUND_NAMES } from "../engine/playoffs.js";
import { FA_DAYS } from "../engine/constants.js";
import { userSeries } from "../engine/playoffs.js";
import { currentSlot } from "../engine/draft.js";
import { ensurePulse, repTier, playoffOdds } from "../engine/clubPulse.js";
import { winProbability, teamStrength } from "../engine/matchup.js";
import { TRAINING, setTraining } from "../engine/franchise.js";
import { composites } from "../engine/ratings.js";
import { savePct } from "../engine/players.js";
import { atCombine } from "../engine/scouting.js";
import { prospectWatch } from "../engine/prospectWatch.js";
import { Sparkline } from "./ProspectWatch.jsx";
import { POS_COLOR } from "./TradePage.jsx";
import GamePlanPicker from "./GamePlanPicker.jsx";

// Home: the gameday front page. Season header with the stages, five status
// tiles, a "this week" rail, the next games as logo tiles, a matchup card with
// ratings, what's at stake and the matchup details, and stories, injuries and
// the development lab on the right.
const ORD = (n) => n + (["st", "nd", "rd"][((n + 90) % 100 - 10) % 10 - 1] || "th");
const PosBadge = ({ pos }) => <span className="gg-pos" style={{ background: POS_COLOR[pos] || "#64748b" }}>{pos}</span>;
const PHASES = { preseason: "Preseason", regular: "Regular season", playoffs: "Stanley Cup Playoffs", draft: "Entry Draft", resign: "Re-sign window", freeagency: "Free agency" };
const STAGES = [["preseason", "Preseason"], ["regular", "Season"], ["playoffs", "Playoffs"], ["combine", "Combine"], ["draft", "Draft"], ["resign", "Re-sign"], ["freeagency", "Free agency"]];
const ratingColor = (v) => (v >= 85 ? "#22c55e" : v >= 80 ? "#84cc16" : v >= 76 ? "#eab308" : "#94a3b8");

function lastResults(league, t, n = 5) {
  return league.schedule.filter((g) => g.played && (g.h === t.id || g.a === t.id)).slice(-n).map((g) => {
    const home = g.h === t.id, us = home ? g.hs : g.as, them = home ? g.as : g.hs;
    return us > them ? "W" : g.ot ? "O" : "L";
  });
}

export default function Dashboard({ act = {} }) {
  const { league: lg, go, openBox, commit, toast } = useGame();
  const t = lg.teams[lg.userTid];
  const gm = ensurePulse(lg);
  const rep = repTier(gm.rep);
  const ratings = teamRatings(lg, t);
  const div = divisionTable(lg, t.div);
  const divRank = div.findIndex((d) => d.id === t.id) + 1;
  const conf = conferenceTable(lg, t.conf);
  const confRank = conf.findIndex((d) => d.id === t.id) + 1;
  const room = capSpace(lg, t), cap = capForYear(capYear(lg)), used = payroll(lg, t);
  const roster = t.roster.map((id) => lg.players[id]).filter(Boolean);
  const injured = roster.filter((p) => p.injury > 0).sort((a, b) => b.ovr - a.ovr);
  const starters = injured.filter((p) => p.ovr >= 80);
  const expiring = roster.filter((p) => p.yrs <= 1).length;
  const issues = rosterIssues(lg, t);
  const games = lg.schedule.filter((g) => g.h === t.id || g.a === t.id);
  const today = userGameOnDay(lg);
  const upcoming = games.filter((g) => !g.played).slice(0, 5);
  const recent = games.filter((g) => g.played).slice(-3).reverse();
  const series = lg.phase === "playoffs" ? userSeries(lg) : null;
  const slot = currentSlot(lg);
  const odds = lg.phase === "regular" ? playoffOdds(lg)[t.id] : null;
  const fans = t.owner?.fanSupport ?? 60, trust = t.owner?.trust ?? 65;
  const pending = lg.offerSheets?.filter((s) => !s.done && s.from === t.id).length || 0;
  const focused = Object.keys(t.training?.assignments || {}).filter((id) => lg.players[id]?.tid === t.id);
  const campDone = t.camp?.year === lg.year && t.camp.games.length >= 4;
  const [pick, setPick] = useState(0);
  const [allAttention, setAllAttention] = useState(false);
  const [more, setMore] = useState(false);
  const [rightTab, setRightTab] = useState("stories");
  const [labPick, setLabPick] = useState("");

  const attention = [];
  if (room < 0) attention.push(["bad", `Over the cap by ${money(-room)}`, "roster"]);
  // Roster limits and depth only matter once camp opens; over the summer the list is noise.
  if (["preseason", "regular", "playoffs"].includes(lg.phase)) issues.forEach((i) => attention.push(["bad", i, "roster"]));
  if (lg.phase === "preseason" && !campDone) attention.push(["bad", "🏕️ Training camp isn't finished", "roster"]);
  starters.forEach((p) => attention.push([lg.settings?.coachLines ? "info" : "warn", `🚑 ${p.name} (${p.pos} ${p.ovr}) out ${p.injury} game${p.injury === 1 ? "" : "s"}${lg.settings?.coachLines ? " · coach covered" : ""}`, "lines"]));
  if (!focused.length) attention.push(["warn", "🧪 No development focus players set", null]);
  if (t.autoPlan !== false && lg.phase === "preseason") attention.push(["warn", "📋 Set your systems and game plan", "analysis"]);
  roster.filter((p) => p.yrs === 1 && p.ovr >= 80 && !p.extension).slice(0, 3).forEach((p) => attention.push(["warn", `✍️ Contract year: ${p.name} (${p.pos} ${p.ovr}) wants to talk`, "frontoffice"]));
  if (pending) attention.push(["warn", `${pending} offer sheet${pending > 1 ? "s" : ""} awaiting a decision`, "operations"]);
  if (["resign", "freeagency"].includes(lg.phase) && expiring) attention.push(["warn", `${expiring} expiring contracts: re-sign window open`, "freeagency"]);
  if (expiring >= 6) attention.push(["warn", `⌛ ${expiring} players in the last year of their deals`, "frontoffice"]);
  if (trust < 35) attention.push(["bad", `Owner trust ${trust}/100: hot seat`, "frontoffice"]);

  // ---- Matchup card for the selected upcoming game (or the live series) ----
  const sel = series ? null : upcoming[Math.min(pick, upcoming.length - 1)];
  const opp = series ? lg.teams[series.top === t.id ? series.bot : series.top] : sel ? lg.teams[sel.h === t.id ? sel.a : sel.h] : null;
  const home = series ? true : sel ? sel.h === t.id : true;
  const prob = opp ? winProbability(lg, t, opp, { home: !!home }) : null;
  const mine = teamStrength(lg, t), theirs = opp ? teamStrength(lg, opp) : null;
  const oppRatings = opp ? teamRatings(lg, opp) : null;
  const formUs = lastResults(lg, t), formThem = opp ? lastResults(lg, opp) : [];
  const starOf = (team, test, key) => team.roster.map((id) => lg.players[id]).filter((p) => p && p.injury <= 0 && test(p)).sort((a, b) => key(b) - key(a))[0];
  const myScorer = starOf(t, (p) => !isGoalie(p.pos) && !isDefense(p.pos), (p) => composites(p).off);
  const theirD = opp && starOf(opp, (p) => isDefense(p.pos), (p) => composites(p).def);
  const theirScorer = opp && starOf(opp, (p) => !isGoalie(p.pos) && !isDefense(p.pos), (p) => composites(p).off);
  const myD = starOf(t, (p) => isDefense(p.pos), (p) => composites(p).def);
  const myG = lg.players[gameLines(lg, t).G[0]], theirG = opp && lg.players[gameLines(lg, opp).G[0]];
  const edge = (a, b) => { const d = a - b; return d >= 3 ? ["EDGE: YOU", "#22c55e"] : d <= -3 ? ["EDGE: THEM", "#ef4444"] : ["EVEN", "#eab308"]; };
  const rec = (x) => `${x.w}-${x.l}-${x.otl}`;
  const left = home ? t : opp, right = home ? opp : t, leftR = home ? ratings : oppRatings, rightR = home ? oppRatings : ratings;
  const stake = (() => {
    if (!opp) return null;
    if (series) return [`${["First round", "Second round", "Conference Final", "Stanley Cup Final"][series.round]}: series ${series.top === t.id ? `${series.wTop}-${series.wBot}` : `${series.wBot}-${series.wTop}`}.`, series.round === 3 ? "Four wins from the Stanley Cup." : "Best of seven."];
    const divGame = opp.div === t.div, confGame = opp.conf === t.conf;
    const cut = conf[7];
    const pos = confRank <= 8 ? `Inside the playoff picture: ${ORD(confRank)} in the ${t.conf}.` : `Outside the playoff picture, ${Math.max(0, (cut?.rec.pts || 0) - t.rec.pts)} points behind the 8th seed.`;
    return [divGame ? `Division game: a four-point swing in the ${t.div}.` : confGame ? "Conference game: it counts in the playoff race." : "Cross-conference game.", t.rec.gp ? pos : "Opening night: every point counts."];
  })();

  const primary = (() => {
    if (lg.phase === "preseason") return <button className="primary big" onClick={act.startSeason}>Start Season</button>;
    if (lg.phase === "regular" && today) return <><button className="primary big" onClick={act.playLive}>▶ Play Live</button><button className="big" onClick={act.simDay}>Sim Game</button>{act.simDays && <button className="big" onClick={() => act.simDays(7, "Simulating a week")}>Sim Week</button>}{act.simToDeadline && lg.day < lg.deadlineDay && <button className="big" onClick={act.simToDeadline}>Sim to Deadline</button>}</>;
    if (lg.phase === "regular") return <><button className="primary big" onClick={act.simDay}>Sim Day</button>{act.simDays && <button className="big" onClick={() => act.simDays(7, "Simulating a week")}>Sim Week</button>}</>;
    if (series && series.winner == null) return <><button className="primary big" onClick={act.playPlayoffLive}>▶ Play Game Live</button><button className="big" onClick={act.simPlayoffDay}>Sim Day</button></>;
    if (lg.phase === "playoffs") return <><button className="primary big" onClick={() => go("playoffs")}>Bracket</button>{lg.playoffs?.champion == null && <button className="big" onClick={act.simPlayoffDay}>Sim Day</button>}</>;
    if (lg.phase === "draft") return <button className="primary big" onClick={() => go("draft")}>{slot ? `Draft room · pick #${slot.overall}` : "Draft room"}</button>;
    return <button className="primary big" onClick={() => go("freeagency")}>{lg.phase === "resign" ? "Re-sign players" : "Free agency"}</button>;
  })();

  const stage = lg.phase === "draft" ? (atCombine(lg) ? "combine" : "draft") : lg.phase;
  const stageIdx = STAGES.findIndex(([k]) => k === stage);
  const stories = (() => { const seen = new Set(); return (lg.news?.length ? lg.news : lg.inbox.slice().reverse()).filter((n) => { const k = (n.title || n.text || "").replace(/\d+/g, "#").slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 7); })();
  const leaders = [["PTS", (p) => p.stats.pts], ["G", (p) => p.stats.g], ["A", (p) => p.stats.a]].map(([k, f]) => [k, roster.filter((x) => !isGoalie(x.pos)).sort((a, b) => f(b) - f(a) || b.ovr - a.ovr)[0], f]);
  const labAdd = (pid) => { const p = lg.players[pid]; if (!p) return; const groups = Object.entries(TRAINING).filter(([k]) => isGoalie(p.pos) === (k === "goaltending")); const [k] = groups.sort((a, b) => a[1].keys.reduce((s, x) => s + (p.attrs[x] || 0), 0) / a[1].keys.length - b[1].keys.reduce((s, x) => s + (p.attrs[x] || 0), 0) / b[1].keys.length)[0]; const r = setTraining(lg, pid, k); toast(r.msg); commit(); setLabPick(""); };
  const labRemove = (pid) => { const r = setTraining(lg, pid, ""); toast(r.msg); commit(); };
  const RatingTiles = ({ r }) => r ? <div className="gg-rtiles"><div style={{ "--c": ratingColor(r.ovr) }}><b>{r.ovr}</b><small>OVR</small></div><div style={{ "--c": ratingColor(r.fwd) }}><b>{r.fwd}</b><small>OFF</small></div><div style={{ "--c": ratingColor(r.def) }}><b>{r.def}</b><small>DEF</small></div><div style={{ "--c": ratingColor(r.g) }}><b>{r.g}</b><small>G</small></div></div> : null;

  return (
    <div className="gg-home stack">
      <div className="gg-home-head">
        <div className="gg-season"><b>{lg.year}</b><span><small>SEASON</small>{PHASES[lg.phase] || lg.phase}{lg.phase === "regular" ? ` · ${dayToDate(lg.year, lg.day, lg.scheduleStart)}` : ""}</span></div>
        <div className="gg-stages">{STAGES.map(([k, l], i) => <React.Fragment key={k}><span className={`gg-stagechip${i < stageIdx ? " done" : i === stageIdx ? " now" : ""}`}>{i < stageIdx ? "✓ " : ""}{k === "regular" ? `${lg.year} season${t.rec.gp ? ` · ${rec(t.rec)}` : ""}` : l}</span>{i < STAGES.length - 1 && <i>›</i>}</React.Fragment>)}</div>
        <div className="gg-home-actions">{primary}</div>
      </div>

      <div className="gg-status-row">
        <section className={`gg-stat ${attention.length ? "alert" : "ok"}`} onClick={() => attention[0]?.[2] && go(attention[0][2])}><small>NEEDS ATTENTION</small><div className="gg-stat-line"><b>{attention.length ? `${attention.length} item${attention.length > 1 ? "s" : ""}` : "All clear"}</b><span>{attention[0]?.[1].replace(/^\S+\s/, (m) => (/[a-zA-Z0-9]/.test(m) ? m : "")) || "No urgent issues"}</span></div></section>
        <section className="gg-stat" onClick={() => go("standings")}><small>RECORD</small><div className="gg-stat-line"><b>{rec(t.rec)}</b><span>{t.rec.gp ? `${ORD(divRank)} in the ${t.div}${odds != null ? ` · ${Math.round(odds * 100)}% playoff odds` : ""}` : `${ORD(divRank)} in the ${t.div}`}</span></div></section>
        <section className="gg-stat" onClick={() => go("roster")}><small>CAP SPACE</small><div className="gg-stat-line"><b style={{ color: room < 0 ? "#ef4444" : "#22c55e" }}>{money(room)}</b><span>{expiring} expiring deals</span></div></section>
        <section className={`gg-stat ${starters.length ? "warn" : ""}`} onClick={() => go("lines")}><small>ROSTER HEALTH</small><div className="gg-stat-line"><b style={{ color: injured.length ? "#ef4444" : "#22c55e" }}>{injured.length ? `${injured.length} injured` : "Healthy"}</b><span>{starters.length ? `${starters.length} starter-level out` : `${counts(lg, t).active} on the roster`}</span></div></section>
        <section className="gg-stat" onClick={() => go("frontoffice")}><small>OWNER & LOCKER ROOM</small><div className="gg-stat-line"><b style={{ color: trust >= 60 ? "#22c55e" : trust >= 40 ? "#eab308" : "#ef4444" }}>{trust >= 60 ? "Secure" : trust >= 40 ? "Watchful" : "Hot seat"}</b><span>Morale {Math.round(t.morale)} · Fans {fans}% · Rep {rep.label}</span></div></section>
      </div>

      <div className="gg-home-grid">
        <aside className="gg-home-left">
          <h3 className="gg-side-title">This week</h3>
          <div className="gg-rail">
            {lg.phase === "preseason" ? <div className="gg-rail-card primary" onClick={() => go("roster")}><b>Training Camp</b><span>Camp work and mini games to improve your roster before the season</span></div> : <div className="gg-rail-card primary" onClick={() => go("schedule")}><b>Schedule</b><span>Your games, this week's game plan and the playoff picture</span></div>}
            {attention.slice(0, allAttention ? attention.length : 5).map(([kind, text, tab], i) => <div key={i} className={`gg-rail-item ${kind}`} onClick={() => tab && go(tab)}>{text}</div>)}
            {attention.length > 5 && <button className="gg-rail-item info" onClick={() => setAllAttention((v) => !v)}>{allAttention ? "Show fewer" : `See all ${attention.length} items`}</button>}
            {recent.length > 0 && <div className="gg-k" style={{ marginTop: 8 }}>LAST RESULTS</div>}
            {recent.map((g) => { const o = lg.teams[g.h === t.id ? g.a : g.h], h = g.h === t.id, us = h ? g.hs : g.as, them = h ? g.as : g.hs; return <div key={g.id} className="gg-rail-game click" onClick={() => openBox(g)}><span className="dim">{dayToDate(lg.year, g.day, lg.scheduleStart)}</span><b style={{ color: us > them ? "#22c55e" : g.ot ? "#eab308" : "#ef4444" }}>{us > them ? "W" : g.ot ? "OTL" : "L"} {us}-{them}</b><TeamBadge team={o} size={20} decorative /><span className="gg-rail-name">{o.abbr}</span></div>; })}
          </div>
        </aside>

        <main className="gg-home-main">
          <div className="gg-main-title"><h3>{lg.year} {PHASES[lg.phase] || lg.phase}{lg.phase === "regular" && today ? " · Gameday" : ""}</h3></div>
          {!series && upcoming.length > 0 && (
            <div className="gg-weektiles">
              {upcoming.map((g, i) => { const o = lg.teams[g.h === t.id ? g.a : g.h]; return <button key={g.id} className={`gg-weektile${i === pick ? " on" : ""}`} style={{ "--c1": o.colors[0] }} onClick={() => setPick(i)}><TeamBadge team={o} size={40} decorative /><small>{g.h === t.id ? "vs" : "@"} {dayToDate(lg.year, g.day, lg.scheduleStart)}</small></button>; })}
            </div>
          )}
          {opp ? (
            <>
              <div className="gg-match" style={{ "--c1": left.colors[0], "--c2": right.colors[0] }}>
                <div className="gg-hero-k">{lg.phase === "playoffs" ? `STANLEY CUP PLAYOFFS · ${["FIRST ROUND", "SECOND ROUND", "CONFERENCE FINAL", "STANLEY CUP FINAL"][series.round]}` : lg.phase === "preseason" ? "PRESEASON · OPENING NIGHT" : "REGULAR SEASON"}{sel ? ` · ${dayToDate(lg.year, sel.day, lg.scheduleStart).toUpperCase()}` : ""}</div>
                <div className="gg-hero-row logos">
                  <div className="gg-hero-club"><TeamBadge team={left} size={140} decorative /></div>
                  <span className="gg-hero-at">{home ? "VS" : "AT"}</span>
                  <div className="gg-hero-club"><TeamBadge team={right} size={140} decorative /></div>
                </div>
                <div className="gg-match-when"><b>{sel ? dayToDate(lg.year, sel.day, lg.scheduleStart) : series ? `Game ${series.games.length + 1}` : ""} · 7:00 PM local</b><small>{(home ? t : opp).city} · {home ? "home ice" : "on the road"}</small></div>
                <div className="gg-match-teams">
                  <div><small>{left.city}</small><b>{left.name.toUpperCase()}</b><span className="dim">{rec(left.rec)}</span><RatingTiles r={leftR} /></div>
                  <div><small>{right.city}</small><b>{right.name.toUpperCase()}</b><span className="dim">{rec(right.rec)}</span><RatingTiles r={rightR} /></div>
                </div>
              </div>
              {stake && <div className="gg-stake"><small>WHAT'S AT STAKE</small><b>{stake[0]}</b><span>{stake[1]}</span></div>}
              <button className="gg-more" onClick={() => setMore(!more)}>{more ? "▲ Less on this matchup" : "▼ More on this matchup: form, the line, injuries, key matchups, game plan"}</button>
              {more && (
                <>
                  <div className="gg-mu-row">
                    <section className="gg-mu"><small>FORM · LAST 5</small>
                      <div className="gg-form"><TeamBadge team={t} size={18} decorative /><b>{t.abbr}</b>{formUs.length ? formUs.map((r, i) => <i key={i} className={r}>{r === "O" ? "OT" : r}</i>) : <span className="dim">—</span>}</div>
                      <div className="gg-form"><TeamBadge team={opp} size={18} decorative /><b>{opp.abbr}</b>{formThem.length ? formThem.map((r, i) => <i key={i} className={r}>{r === "O" ? "OT" : r}</i>) : <span className="dim">—</span>}</div>
                    </section>
                    <section className="gg-mu"><small>THE LINE</small><b className="gg-line">{prob >= .5 ? t.abbr : opp.abbr} {Math.round(Math.max(prob, 1 - prob) * 100)}%</b><span>{prob >= .55 ? "You're the favourite." : prob <= .45 ? "You're the underdog." : "A coin flip."} Offence {mine.off > theirs.off + 1 ? "edge you" : theirs.off > mine.off + 1 ? "edge them" : "even"} · goaltending {mine.goalie > theirs.goalie + 1 ? "edge you" : theirs.goalie > mine.goalie + 1 ? "edge them" : "even"}.</span></section>
                    <section className="gg-mu"><small>INJURIES</small>
                      <div><b>{opp.abbr}</b> {opp.roster.map((id) => lg.players[id]).filter((p) => p && p.injury > 0 && p.ovr >= 78).slice(0, 3).map((p) => `${p.name.split(" ").at(-1)} (${p.pos}, OUT)`).join(", ") || <span className="dim">no key players out</span>}</div>
                      <div><b>{t.abbr}</b> {starters.slice(0, 3).map((p) => `${p.name.split(" ").at(-1)} (${p.pos}, OUT)`).join(", ") || <span className="dim">no key players out</span>}</div>
                    </section>
                  </div>
                  <section className="gg-card"><div className="gg-k">KEY MATCHUPS</div>
                    {myScorer && theirD && (() => { const [l, c] = edge(composites(myScorer).off, composites(theirD).def); return <div className="gg-km"><span className="dim">Your top scorer vs their best defender</span><div><b>{myScorer.name}</b> <span className="dim">{myScorer.pos} {myScorer.ovr}</span> <i>vs</i> <b>{theirD.name}</b> <span className="dim">{theirD.pos} {theirD.ovr}</span><em style={{ color: c }}>{l}</em></div></div>; })()}
                    {myD && theirScorer && (() => { const [l, c] = edge(composites(myD).def, composites(theirScorer).off); return <div className="gg-km"><span className="dim">Your best defender vs their top scorer</span><div><b>{myD.name}</b> <span className="dim">{myD.pos} {myD.ovr}</span> <i>vs</i> <b>{theirScorer.name}</b> <span className="dim">{theirScorer.pos} {theirScorer.ovr}</span><em style={{ color: c }}>{l}</em></div></div>; })()}
                    {myG && theirG && (() => { const [l, c] = edge(myG.ovr, theirG.ovr); return <div className="gg-km"><span className="dim">Goaltending</span><div><b>{myG.name}</b> <span className="dim">{myG.stats.gp ? `${savePct(myG.stats).toFixed(3).slice(1)} SV%` : `${myG.ovr} OVR`}</span> <i>vs</i> <b>{theirG.name}</b> <span className="dim">{theirG.stats.gp ? `${savePct(theirG.stats).toFixed(3).slice(1)} SV%` : `${theirG.ovr} OVR`}</span><em style={{ color: c }}>{l}</em></div></div>; })()}
                  </section>
                  <GamePlanPicker opp={opp} compact />
                </>
              )}
            </>
          ) : (
            <OffseasonCard lg={lg} t={t} go={go} act={act} series={series} slot={slot} />
          )}
        </main>

        <aside className="gg-home-right">
          <div className="gg-tabs2">{[["stories", "Top Stories"], ["injuries", "Injury Report"]].map(([k, l]) => <button key={k} className={rightTab === k ? "on" : ""} onClick={() => setRightTab(k)}>{l}</button>)}</div>
          {rightTab === "stories" ? (
            <div className="gg-stories">{stories.length ? stories.map((n, i) => <div key={i} className="gg-story"><b>{n.type === "injury" ? "🚑" : n.type === "scoring" ? "📈" : n.type === "hot" ? "🔥" : n.type === "pressure" ? "👔" : n.type === "milestone" ? "🏅" : n.type === "coach" ? "🪑" : n.type === "allstar" ? "⭐" : n.type === "cup" ? "🏆" : n.type === "award" ? "🎖️" : "📰"} {n.text.split(". ")[0]}</b>{n.text.includes(". ") && <span>{n.text.split(". ").slice(1).join(". ")}</span>}</div>) : <div className="dim small">Quiet around the league so far. Stories arrive after every week.</div>}<div className="gg-link" onClick={() => go("activity")}>Full log →</div></div>
          ) : (
            <div className="gg-stories">{injured.map((p) => <div key={p.id} className="gg-inj"><PosBadge pos={p.pos} /><b><PlayerName p={p} /></b><span className="bad">{p.injury} g</span></div>)}{!injured.length && <div className="dim small">Everyone is healthy.</div>}</div>
          )}
          <section className="gg-lab">
            <div className="gg-k">DEVELOPMENT FOCUS</div>
            <div className="dim small">Your staff gives three players individual attention. Each week a focused player banks training work in his weakest skill group; it pays off at season rollover.</div>
            {focused.length ? focused.map((id) => { const p = lg.players[id]; return <div key={id} className="gg-inj lab"><PosBadge pos={p.pos} /><b><PlayerName p={p} /></b><span className="dim">{TRAINING[t.training.assignments[id]]?.name}</span><button className="tiny ghost" onClick={() => labRemove(id)} aria-label={`Remove ${p.name} from the lab`}>✕</button></div>; }) : <div className="gg-lab-empty">Nobody in the lab. Pick a player below.</div>}
            {focused.length < 3 && (
              <Select value={labPick} onChange={(e) => labAdd(e.target.value)} aria-label="Add a development focus player" placeholder="— choose a player —" style={{ width: "100%" }}>
                <option value="">— choose a player —</option>
                {["C", "LW", "RW", "LD", "RD", "G"].map((pos) => <optgroup key={pos} label={pos}>{roster.filter((p) => p.pos === pos && !focused.includes(p.id)).sort((a, b) => b.pot - b.ovr - (a.pot - a.ovr)).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.pos}, {p.ovr} OVR, POT {p.pot}){p.age <= 24 ? " · ~fast" : p.age >= 31 ? " · slow" : ""}</option>)}</optgroup>)}
              </Select>
            )}
          </section>
          <section className="gg-lab gg-home-watch">
            <div className="gg-k">PROSPECT WATCH <button className="tiny ghost" style={{ marginLeft: "auto" }} onClick={() => go("development")}>All →</button></div>
            {prospectWatch(lg, t).filter((r) => r.farm || r.p.age <= 22).slice(0, 4).map((r) => <div key={r.p.id} className="gg-home-watch-row"><PosBadge pos={r.p.pos} /><div><b><PlayerName p={r.p} /></b><span className="dim small">{r.level} · {r.line.text}</span></div><Sparkline path={r.path} width={64} height={22} color={r.delta > 0 ? "#22c55e" : r.delta < 0 ? "#ef4444" : "#94a3b8"} /><b style={{ color: r.delta > 0 ? "#22c55e" : r.delta < 0 ? "#ef4444" : "#94a3b8" }}>{r.delta > 0 ? "+" : ""}{r.delta}</b></div>)}
            {!prospectWatch(lg, t).length && <div className="dim small">No young players to follow yet.</div>}
          </section>
          {t.rec.gp > 0 && <><div className="gg-k" style={{ marginTop: 10 }}>CLUB LEADERS</div><div className="gg-stories">{leaders.map(([k, p, f]) => p ? <div key={k} className="gg-inj"><span className="gg-pill">{k}</span><b><PlayerName p={p} /></b><span>{f(p)}</span></div> : null)}</div></>}
        </aside>
      </div>
    </div>
  );
}


// What the main panel shows when there is no game to preview: the playoff run, the draft,
// re-signing or free agency, each with the one or two numbers that matter and a way in.
function OffseasonCard({ lg, t, go, act, series, slot }) {
  const conf = lg.teams.filter((x) => x.conf === t.conf).sort((a, b) => b.rec.pts - a.rec.pts || b.rec.rw - a.rec.rw);
  const rank = conf.findIndex((x) => x.id === t.id) + 1;
  const ord = (n) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;
  const row = (k, v) => <div className="gg-off-row"><small>{k}</small><b>{v}</b></div>;
  if (lg.phase === "regular" && seasonOver(lg)) return (
    <div className="gg-card gg-off"><div className="gg-k">REGULAR SEASON COMPLETE</div>
      <div className="gg-off-rows">{row("Record", `${t.rec.w}-${t.rec.l}-${t.rec.otl} · ${t.rec.pts} pts`)}{row("Finish", `${ord(rank)} in the ${t.conf}`)}{row("Playoffs", rank <= 8 ? "Qualified" : "Missed")}</div>
      <div className="dim small">{rank <= 8 ? "The bracket is set. Start the playoffs from the top bar." : "Your season is over; follow the bracket from the League tab."}</div></div>);
  if (lg.phase === "playoffs") {
    const po = lg.playoffs; const champ = po?.champion != null ? lg.teams[po.champion] : null;
    const mine = (po?.rounds || []).flatMap((r, i) => r.filter((x) => x.top === t.id || x.bot === t.id).map((x) => ({ ...x, round: i })));
    const last = mine.at(-1);
    const out = last && last.winner != null && last.winner !== t.id;
    return (
      <div className="gg-card gg-off"><div className="gg-k">STANLEY CUP PLAYOFFS · {champ ? "COMPLETE" : ROUND_NAMES[po.round]}</div>
        {series && series.winner == null && <div className="gg-off-rows">{row("Your series", `${ROUND_NAMES[series.round]} vs ${lg.teams[series.top === t.id ? series.bot : series.top].abbr}`)}{row("Score", `${series.top === t.id ? series.wTop : series.wBot}-${series.top === t.id ? series.wBot : series.wTop}`)}</div>}
        {out && <div className="gg-off-rows">{row("Your run", `Eliminated in the ${ROUND_NAMES[last.round]} by ${lg.teams[last.winner].abbr}`)}{row("Series", `${last.top === t.id ? last.wTop : last.wBot}-${last.top === t.id ? last.wBot : last.wTop}`)}</div>}
        {!mine.length && <div className="dim small">Your club missed the playoffs.</div>}
        {champ && <div className="gg-off-rows">{row("Champions", `${champ.city} ${champ.name}`)}{lg.awards?.connSmythe && row("Conn Smythe", lg.awards.connSmythe.name)}{lg.awards?.hart && row("Hart", lg.awards.hart.name)}</div>}
        <div className="row" style={{ gap: 6 }}><button className="small" onClick={() => go("playoffs")}>Bracket</button>{champ && <button className="small" onClick={() => go("legacy")}>Awards</button>}</div></div>);
  }
  if (lg.phase === "draft") {
    const myPicks = (lg.draftPicks || []).filter((p) => p.owner === t.id && p.year === lg.draft?.year).length;
    return (
      <div className="gg-card gg-off"><div className="gg-k">{lg.draft?.year} ENTRY DRAFT</div>
        <div className="gg-off-rows">{row("Your next pick", slot ? `#${slot.overall} overall (round ${slot.round})` : lg.draft?.done ? "Draft complete" : "No picks left")}{row("Picks this year", myPicks)}{row("Scouting points", t.scoutPts ?? 0)}</div>
        <div className="row" style={{ gap: 6 }}><button className="small primary" onClick={() => go("draft")}>Draft room</button></div></div>);
  }
  if (lg.phase === "resign") {
    const exp = expiringPlayers(lg, t).sort((a, b) => b.ovr - a.ovr);
    return (
      <div className="gg-card gg-off"><div className="gg-k">RE-SIGN WINDOW · {exp.length} EXPIRING</div>
        <div className="gg-off-rows">{row("Cap space next year", money(capSpace(lg, t)))}{exp.slice(0, 3).map((p) => row(`${p.name} (${p.pos} ${p.ovr})`, p.willing === false ? "testing the market" : `asks ${money(resignAsk(lg, p).aav)}`))}</div>
        <div className="row" style={{ gap: 6 }}><button className="small primary" onClick={() => go("freeagency")}>Negotiate</button></div></div>);
  }
  if (lg.phase === "freeagency") {
    const best = (lg.freeAgents || []).map((id) => lg.players[id]).filter(Boolean).sort((a, b) => b.ovr - a.ovr).slice(0, 3);
    return (
      <div className="gg-card gg-off"><div className="gg-k">FREE AGENCY · DAY {lg.fa?.day ?? 0} OF {FA_DAYS}</div>
        <div className="gg-off-rows">{row("Cap space", money(capSpace(lg, t)))}{row("Roster", `${counts(lg, t).active} signed`)}{best.map((p) => row(`${p.name} (${p.pos} ${p.ovr})`, `asks ${money(faAsk(lg, p).aav)}`))}</div>
        <div className="row" style={{ gap: 6 }}><button className="small primary" onClick={() => go("freeagency")}>Open the market</button></div></div>);
  }
  return <div className="gg-card gg-off"><div className="gg-k">OFF-SEASON</div><div>Build the roster for next season.</div></div>;
}
