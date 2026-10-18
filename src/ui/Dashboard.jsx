import React, { useState } from "react";
import { useGame, TeamBadge, PlayerName, TeamName, money, recordStr, ovrColor } from "./common.jsx";
import Jersey from "./Jersey.jsx";
import { divisionTable, conferenceTable } from "../engine/standings.js";
import { teamRatings, gameLines } from "../engine/lines.js";
import { capSpace, payroll, rosterIssues, counts, capYear } from "../engine/roster.js";
import { capForYear, isGoalie, isDefense } from "../engine/constants.js";
import { dayToDate } from "../engine/schedule.js";
import { userGameOnDay } from "../engine/league.js";
import { userSeries } from "../engine/playoffs.js";
import { currentSlot } from "../engine/draft.js";
import { ensurePulse, repTier, playoffOdds } from "../engine/clubPulse.js";
import { winProbability, teamStrength, leagueStrength } from "../engine/matchup.js";
import { matchupPlan } from "../engine/teamPlanning.js";
import { composites } from "../engine/ratings.js";
import { savePct } from "../engine/players.js";
import { POS_COLOR } from "./TradePage.jsx";

// Home: the NFL-style gameday front page, kept tight. Status strip, "this week"
// rail, a gameday hero for the next game with form, line, injuries, key
// matchups and the game plan, and a stories/injury rail on the right.
const ORD = (n) => n + (["st", "nd", "rd"][((n + 90) % 100 - 10) % 10 - 1] || "th");
const PosBadge = ({ pos }) => <span className="gg-pos" style={{ background: POS_COLOR[pos] || "#64748b" }}>{pos}</span>;

function lastResults(league, t, n = 5) {
  return league.schedule.filter((g) => g.played && (g.h === t.id || g.a === t.id)).slice(-n).map((g) => {
    const home = g.h === t.id, us = home ? g.hs : g.as, them = home ? g.as : g.hs;
    return us > them ? "W" : g.ot ? "O" : "L";
  });
}
const PHASES = { preseason: "Preseason", regular: "Regular season", playoffs: "Stanley Cup Playoffs", draft: "Entry Draft", resign: "Re-sign window", freeagency: "Free agency" };

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
  const next = today || games.find((g) => !g.played);
  const upcoming = games.filter((g) => !g.played).slice(0, 5);
  const recent = games.filter((g) => g.played).slice(-3).reverse();
  const series = lg.phase === "playoffs" ? userSeries(lg) : null;
  const slot = currentSlot(lg);
  const odds = lg.phase === "regular" ? playoffOdds(lg)[t.id] : null;
  const fans = t.owner?.fanSupport ?? 60, trust = t.owner?.trust ?? 65;
  const pending = lg.offerSheets?.filter((s) => !s.done && s.from === t.id).length || 0;
  const noFocus = t.training && !Object.keys(t.training.assignments || {}).length;
  const [more, setMore] = useState(true);

  const attention = [];
  if (room < 0) attention.push(["bad", `Over the cap by ${money(-room)}`, "roster"]);
  issues.forEach((i) => attention.push(["bad", i, "roster"]));
  starters.forEach((p) => attention.push(["warn", `${p.name} (${p.pos} ${p.ovr}) out ${p.injury} game${p.injury === 1 ? "" : "s"}`, "lines"]));
  if (pending) attention.push(["warn", `${pending} offer sheet${pending > 1 ? "s" : ""} awaiting a decision`, "operations"]);
  if (["resign", "freeagency"].includes(lg.phase) && expiring) attention.push(["warn", `${expiring} expiring contracts: re-sign window open`, "freeagency"]);
  if (lg.phase === "regular" && expiring >= 6) attention.push(["warn", `${expiring} players in the last year of their deals`, "frontoffice"]);
  if (noFocus && lg.phase !== "preseason") attention.push(["warn", "No development focus players set", "frontoffice"]);
  if (trust < 35) attention.push(["bad", `Owner trust ${trust}/100: hot seat`, "frontoffice"]);
  if (gm.presser) attention.push(["info", "🎙️ The media is waiting at the podium", null]);
  if (gm.speech) attention.push(["info", "🏒 The room is waiting for a word from you", null]);

  // ---- Gameday preview ----
  const opp = series ? lg.teams[series.top === t.id ? series.bot : series.top] : next ? lg.teams[next.h === t.id ? next.a : next.h] : null;
  const home = series ? null : next ? next.h === t.id : true;
  const prob = opp ? winProbability(lg, t, opp, { home: !!home }) : null;
  const mu = leagueStrength(lg), mine = teamStrength(lg, t), theirs = opp ? teamStrength(lg, opp) : null;
  const formUs = lastResults(lg, t), formThem = opp ? lastResults(lg, opp) : [];
  const starOf = (team, test, key) => team.roster.map((id) => lg.players[id]).filter((p) => p && p.injury <= 0 && test(p)).sort((a, b) => key(b) - key(a))[0];
  const myScorer = starOf(t, (p) => !isGoalie(p.pos) && !isDefense(p.pos), (p) => composites(p).off);
  const theirD = opp && starOf(opp, (p) => isDefense(p.pos), (p) => composites(p).def);
  const theirScorer = opp && starOf(opp, (p) => !isGoalie(p.pos) && !isDefense(p.pos), (p) => composites(p).off);
  const myD = starOf(t, (p) => isDefense(p.pos), (p) => composites(p).def);
  const myG = lg.players[gameLines(lg, t).G[0]], theirG = opp && lg.players[gameLines(lg, opp).G[0]];
  const edge = (a, b, scale = 1) => { const d = (a - b) * scale; return d >= 3 ? ["EDGE: YOU", "#22c55e"] : d <= -3 ? ["EDGE: THEM", "#ef4444"] : ["EVEN", "#eab308"]; };
  const faceCard = (p, team) => p ? <div className="gg-face"><Jersey team={team} player={p} size={92} decorative /><b>{p.name}</b><small>{p.pos} · <span style={{ color: ovrColor(p.ovr) }}>{p.ovr} OVR</span></small></div> : null;
  const rec = (x) => `${x.w}-${x.l}-${x.otl}`;
  const stake = (() => {
    if (!opp) return null;
    if (series) return [`${["First round", "Second round", "Conference Final", "Stanley Cup Final"][series.round]} · series ${series.wTop === series.wBot ? "tied" : ""} ${series.top === t.id ? `${series.wTop}-${series.wBot}` : `${series.wBot}-${series.wTop}`}`, series.round === 3 ? "Four wins from the Stanley Cup." : "Best of seven."];
    const divGame = opp.div === t.div, confGame = opp.conf === t.conf;
    const cut = conf[7];
    const pos = confRank <= 8 ? `Inside the playoff picture: ${ORD(confRank)} in the ${t.conf}.` : `Outside the playoff picture, ${Math.max(0, (cut?.rec.pts || 0) - t.rec.pts)} points behind the 8th seed.`;
    return [divGame ? `Division game: a four-point swing in the ${t.div}.` : confGame ? "Conference game: it counts in the playoff race." : "Cross-conference game.", t.rec.gp ? pos : "Opening night: every point counts."];
  })();
  const plan = matchupPlan(lg, t, opp || t);
  const current = t.autoPlan === false ? { forecheck: "balanced", neutral: "balanced", attack: "balanced", ...t.gamePlan } : plan;
  const setPlan = (key, value) => { t.autoPlan = false; t.gamePlan = { ...current, [key]: value }; commit(); toast(`Game plan: ${value} ${key}.`); };
  const grade = (key, value) => value === plan[key] ? ["best", "#22c55e"] : value === "balanced" ? ["B", "#60a5fa"] : ["C", "#eab308"];

  const primary = (() => {
    if (lg.phase === "preseason") return <button className="primary big" onClick={act.startSeason}>▶ Start Season</button>;
    if (lg.phase === "regular" && today) return <><button className="primary big" onClick={act.playLive}>▶ Play Live</button><button className="big" onClick={act.simDay}>Sim Game</button>{act.simDays && <button className="big" onClick={() => act.simDays(7, "Simulating a week")}>Sim Week</button>}{act.simToDeadline && lg.day < lg.deadlineDay && <button className="big" onClick={act.simToDeadline}>Sim to Deadline</button>}</>;
    if (lg.phase === "regular") return <><button className="primary big" onClick={act.simDay}>Advance one day</button>{act.simDays && <button className="big" onClick={() => act.simDays(7, "Simulating a week")}>Sim Week</button>}</>;
    if (series && series.winner == null) return <><button className="primary big" onClick={act.playPlayoffLive}>▶ Play Game Live</button><button className="big" onClick={act.simPlayoffDay}>Sim Day</button></>;
    if (lg.phase === "playoffs") return <><button className="primary big" onClick={() => go("playoffs")}>Bracket</button>{lg.playoffs?.champion == null && <button className="big" onClick={act.simPlayoffDay}>Sim Day</button>}</>;
    if (lg.phase === "draft") return <button className="primary big" onClick={() => go("draft")}>{slot ? `Draft room · pick #${slot.overall}` : "Draft room"}</button>;
    return <button className="primary big" onClick={() => go("freeagency")}>{lg.phase === "resign" ? "Re-sign players" : "Free agency"}</button>;
  })();

  const stories = (lg.news?.length ? lg.news : lg.inbox.slice().reverse()).slice(0, 6);
  const leaders = [["PTS", (p) => p.stats.pts], ["G", (p) => p.stats.g], ["A", (p) => p.stats.a]].map(([k, f]) => [k, roster.filter((x) => !isGoalie(x.pos)).sort((a, b) => f(b) - f(a) || b.ovr - a.ovr)[0], f]);

  return (
    <div className="gg-home stack">
      <div className="gg-home-head">
        <div className="gg-season"><b>{lg.year}</b><span><small>SEASON</small>{PHASES[lg.phase] || lg.phase}{lg.phase === "regular" ? ` · ${dayToDate(lg.year, lg.day, lg.scheduleStart)}` : ""}</span></div>
        <div className="gg-home-actions">{primary}</div>
      </div>

      <div className="gg-status-row">
        <section className={`gg-stat ${attention.length ? "alert" : "ok"}`} onClick={() => attention[0]?.[2] && go(attention[0][2])}>
          <small>NEEDS ATTENTION</small><b>{attention.length ? `${attention.length} item${attention.length > 1 ? "s" : ""}` : "All clear"}</b><span>{attention[0]?.[1] || "No urgent issues"}</span>
        </section>
        <section className="gg-stat" onClick={() => go("standings")}>
          <small>RECORD</small><b>{rec(t.rec)}</b><span>{t.rec.gp ? `${ORD(divRank)} in the ${t.div} · ${ORD(confRank)} in the ${t.conf}${odds != null ? ` · ${Math.round(odds * 100)}% playoff odds` : ""}` : `${t.div} Division`}</span>
        </section>
        <section className="gg-stat" onClick={() => go("roster")}>
          <small>CAP SPACE</small><b style={{ color: room < 0 ? "#ef4444" : "#22c55e" }}>{money(room)}</b><span>{money(used)} of {money(cap)} · {expiring} expiring</span>
        </section>
        <section className={`gg-stat ${injured.length ? "warn" : ""}`} onClick={() => go("lines")}>
          <small>ROSTER HEALTH</small><b style={{ color: injured.length ? "#ef4444" : "#22c55e" }}>{injured.length ? `${injured.length} injured` : "Healthy"}</b><span>{starters.length ? `${starters.length} starter-level out` : `OVR ${ratings.ovr} · F ${ratings.fwd} D ${ratings.def} G ${ratings.g}`}</span>
        </section>
        <section className="gg-stat" onClick={() => go("frontoffice")}>
          <small>OWNER & LOCKER ROOM</small><b style={{ color: trust >= 60 ? "#22c55e" : trust >= 40 ? "#eab308" : "#ef4444" }}>{trust >= 60 ? "Secure" : trust >= 40 ? "Watchful" : "Hot seat"}</b><span>Morale {Math.round(t.morale)} · Fans {fans}% · Rep {rep.label} · {gm.sp} SP</span>
        </section>
      </div>

      <div className="gg-home-grid">
        <aside className="gg-home-left">
          <div className="gg-k">THIS WEEK</div>
          <div className="gg-rail">
            <div className="gg-rail-card primary" onClick={() => go("schedule")}><b>Schedule</b><span>{upcoming.length ? `${upcoming.length} upcoming · ` : ""}your games, the calendar and the playoff picture</span></div>
            {upcoming.slice(0, 4).map((g) => { const o = lg.teams[g.h === t.id ? g.a : g.h]; return <div key={g.id} className="gg-rail-game"><span className="dim">{dayToDate(lg.year, g.day, lg.scheduleStart)}</span><b className={g.h === t.id ? "good" : "warn"}>{g.h === t.id ? "vs" : "@"}</b><TeamBadge team={o} size={22} decorative /><span className="gg-rail-name">{o.name}</span><span className="dim small">{recordStr(o.rec)}</span></div>; })}
            {attention.map(([kind, text, tab], i) => <div key={i} className={`gg-rail-item ${kind}`} onClick={() => tab && go(tab)}>{text}</div>)}
            {recent.length > 0 && <div className="gg-k" style={{ marginTop: 8 }}>LAST RESULTS</div>}
            {recent.map((g) => { const o = lg.teams[g.h === t.id ? g.a : g.h], h = g.h === t.id, us = h ? g.hs : g.as, them = h ? g.as : g.hs; return <div key={g.id} className="gg-rail-game click" onClick={() => openBox(g)}><span className="dim">{dayToDate(lg.year, g.day, lg.scheduleStart)}</span><b style={{ color: us > them ? "#22c55e" : g.ot ? "#eab308" : "#ef4444" }}>{us > them ? "W" : g.ot ? "OTL" : "L"} {us}-{them}</b><TeamBadge team={o} size={20} decorative /><span className="gg-rail-name">{o.abbr}</span></div>; })}
          </div>
        </aside>

        <main className="gg-home-main">
          {opp ? (
            <>
              <div className="gg-gameday-h"><b>{series ? `${["First Round", "Second Round", "Conference Final", "Stanley Cup Final"][series.round]} · Game ${series.games.length + 1}` : today ? "Gameday" : "Next game"}</b>{next && !series && <span className="dim">{dayToDate(lg.year, next.day, lg.scheduleStart)} · 7:00 PM local</span>}</div>
              <div className="gg-hero" style={{ "--c1": t.colors[0], "--c2": opp.colors[0] }}>
                <div className="gg-hero-k">{lg.phase === "playoffs" ? "STANLEY CUP PLAYOFFS" : "REGULAR SEASON"} · {home ? "HOME" : "ROAD"}</div>
                <div className="gg-hero-row">
                  {faceCard(home ? myScorer : theirScorer, home ? t : opp)}
                  <div className="gg-hero-mid"><TeamBadge team={home ? t : opp} size={72} decorative /><span className="gg-hero-at">{home ? "VS" : "AT"}</span><TeamBadge team={home ? opp : t} size={72} decorative /></div>
                  {faceCard(home ? theirScorer : myScorer, home ? opp : t)}
                </div>
                <div className="gg-hero-names"><div><small>{(home ? t : opp).city}</small><b>{(home ? t : opp).name.toUpperCase()}</b><span className="dim">{rec((home ? t : opp).rec)}</span></div><div className="right"><small>{(home ? opp : t).city}</small><b>{(home ? opp : t).name.toUpperCase()}</b><span className="dim">{rec((home ? opp : t).rec)}</span></div></div>
              </div>
              {stake && <div className="gg-stake"><small>WHAT'S AT STAKE</small><b>{stake[0]}</b><span>{stake[1]}</span></div>}
              <button className="gg-more" onClick={() => setMore(!more)}>{more ? "▲ Less on this matchup" : "▼ More on this matchup"}</button>
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
                  <section className="gg-card gg-plan"><div className="gg-k">🎯 GAME PLAN vs {opp.abbr} <span className="dim" style={{ letterSpacing: 0, textTransform: "none" }}>{t.autoPlan === false ? "your call" : "your coaches' pick (best fit)"}</span>{t.autoPlan === false && <button className="small ghost" style={{ marginLeft: "auto" }} onClick={() => { t.autoPlan = true; commit(); }}>Let the coaches pick</button>}</div>
                    {[["forecheck", "FORECHECK", ["balanced", "aggressive"]], ["neutral", "NEUTRAL ZONE", ["balanced", "trap"]], ["attack", "ATTACK", ["balanced", "rush", "shoot", "cycle"]]].map(([key, label, values]) => (
                      <div key={key} className="gg-plan-row"><small>{label}</small><div className="gg-plan-opts">{values.map((v) => { const [g, c] = grade(key, v); return <button key={v} className={current[key] === v ? "on" : ""} onClick={() => setPlan(key, v)}><b>{v}</b><span style={{ color: c }}>{g === "best" ? "best fit" : g}</span></button>; })}</div></div>
                    ))}
                    <div className="dim small">{plan.reason}</div>
                  </section>
                </>
              )}
            </>
          ) : (
            <div className="gg-card"><div className="gg-k">{lg.phase === "playoffs" ? "PLAYOFFS" : "OFF-SEASON"}</div><div>{lg.phase === "playoffs" ? (lg.playoffs?.champion != null ? `The ${lg.teams[lg.playoffs.champion].name} won the Stanley Cup.` : "Your season is over. Follow the bracket.") : "Build the roster for next season."}</div></div>
          )}
        </main>

        <aside className="gg-home-right">
          <div className="gg-tabs2">{["Top Stories", "Injury Report"].map((k, i) => <button key={k} className={(more ? 0 : 0) === i && i === 0 ? "on" : ""} disabled>{k}</button>)}</div>
          <div className="gg-stories">
            {stories.length ? stories.map((n, i) => <div key={i} className="gg-story"><b>{n.type === "injury" ? "🚑" : n.type === "scoring" ? "📈" : n.type === "hot" ? "🔥" : n.type === "pressure" ? "👔" : "📰"} {n.text.split(". ")[0]}</b>{n.text.includes(". ") && <span>{n.text.split(". ").slice(1).join(". ")}</span>}</div>) : <div className="dim small">The next chapter starts when the puck drops.</div>}
            <div className="gg-link" onClick={() => go("activity")}>Full log →</div>
          </div>
          <div className="gg-k" style={{ marginTop: 10 }}>INJURY REPORT · {injured.length} OUT</div>
          <div className="gg-stories">{injured.slice(0, 6).map((p) => <div key={p.id} className="gg-inj"><PosBadge pos={p.pos} /><b><PlayerName p={p} /></b><span className="bad">{p.injury} g</span></div>)}{!injured.length && <div className="dim small">Everyone is healthy.</div>}</div>
          <div className="gg-k" style={{ marginTop: 10 }}>CLUB LEADERS</div>
          <div className="gg-stories">{leaders.map(([k, p, f]) => p ? <div key={k} className="gg-inj"><span className="gg-pill">{k}</span><b><PlayerName p={p} /></b><span>{t.rec.gp ? f(p) : "—"}</span></div> : null)}</div>
        </aside>
      </div>
    </div>
  );
}
