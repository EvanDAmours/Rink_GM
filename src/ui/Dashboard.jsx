import React, { useRef, useState } from "react";
import { useGame, TeamBadge, PlayerName, money } from "./common.jsx";
import Select from "./Select.jsx";
import Headshot from "./Headshot.jsx";
import { divisionTable, conferenceTable } from "../engine/standings.js";
import { teamRatings, gameLines } from "../engine/lines.js";
import { capSpace, counts } from "../engine/roster.js";
import { isGoalie, isDefense, FA_DAYS, MAX_ROSTER } from "../engine/constants.js";
import { dayToDate } from "../engine/schedule.js";
import { userGameOnDay, seasonOver } from "../engine/league.js";
import { faAsk, resignAsk, expiringPlayers } from "../engine/offseason.js";
import { ROUND_NAMES, userSeries, nextGame } from "../engine/playoffs.js";
import { currentSlot, draftDone } from "../engine/draft.js";
import { teamDraftGrade, atCombine } from "../engine/scouting.js";
import { ensurePulse, repTier, playoffOdds } from "../engine/clubPulse.js";
import { winProbability, teamStrength } from "../engine/matchup.js";
import { TRAINING, setTraining } from "../engine/franchise.js";
import { focusCandidates, FOCUS_SLOTS } from "../engine/developmentPlan.js";
import { deadlinePending } from "../engine/market.js";
import { useDialogFocus } from "./accessibility.js";
import Icon from "./Icon.jsx";
import { composites } from "../engine/ratings.js";
import { savePct } from "../engine/players.js";
import { prospectWatch } from "../engine/prospectWatch.js";
import { myOffers } from "../engine/negotiations.js";
import { needsAttention, runFix, topPlayer, kickoffText, primeTime, offseasonBoard, signedForNextSeason } from "../engine/home.js";
import { Sparkline } from "./ProspectWatch.jsx";
import { POS_COLOR } from "./TradePage.jsx";
import GamePlanPicker from "./GamePlanPicker.jsx";
import GamePrep from "./GamePrep.jsx";
import InjuryReportCard from "./InjuryReportCard.jsx";
import "./home.css";

// Home, laid out like the football game's: the franchise tiles on top, then one panel with
// three columns. On the left, this week's main job and the Needs Attention list; in the middle,
// the matchup (the week strip, both clubs' star players and logos, the team ratings, what's at
// stake) or, with no game to play, your logo, the phase and the off-season board; on the right,
// top stories, the injury report and prospects, with the development focus underneath.
const ORD = (n) => n + (["st", "nd", "rd"][((n + 90) % 100 - 10) % 10 - 1] || "th");
const PosBadge = ({ pos }) => <span className="gg-pos" style={{ background: POS_COLOR[pos] || "#64748b" }}>{pos}</span>;
const rec = (x) => `${x.w}-${x.l}-${x.otl}`;
const TONE_C = { urgent: "#ef4444", action: "#eab308", info: "#38bdf8" };
const SHOW_KEY = "rinkgm_matchup_details";
const readShow = () => { try { return localStorage.getItem(SHOW_KEY) === "1"; } catch { return false; } };
const ROUND_UP = (r) => (ROUND_NAMES[r] || "Playoffs").toUpperCase();

function lastResults(league, t, n = 5) {
  return league.schedule.filter((g) => g.played && (g.h === t.id || g.a === t.id)).slice(-n).map((g) => {
    const home = g.h === t.id, us = home ? g.hs : g.as, them = home ? g.as : g.hs;
    return us > them ? "W" : g.ot ? "O" : "L";
  });
}
// The arena a club plays in, from its fixtures (the bundled calendar names it).
const arenaOf = (lg, tid) => lg.schedule.find((g) => g.h === tid && g.venue)?.venue || null;

export default function Dashboard({ act = {} }) {
  const game = useGame();
  const { league: lg, go, openBox, commit, toast, openPlayer, openPaper } = game;
  const t = lg.teams[lg.userTid];
  const gm = ensurePulse(lg);
  const rep = repTier(gm.rep);
  const ratings = teamRatings(lg, t);
  const div = divisionTable(lg, t.div);
  const divRank = div.findIndex((d) => d.id === t.id) + 1;
  const conf = conferenceTable(lg, t.conf);
  const confRank = conf.findIndex((d) => d.id === t.id) + 1;
  const room = capSpace(lg, t);
  const roster = t.roster.map((id) => lg.players[id]).filter(Boolean);
  const injured = roster.filter((p) => p.injury > 0).sort((a, b) => b.ovr - a.ovr);
  const starters = injured.filter((p) => p.ovr >= 80);
  const expiring = roster.filter((p) => p.yrs <= 1).length;
  const signed = counts(lg, t).active;
  const signedNext = ["resign", "freeagency"].includes(lg.phase) ? signedForNextSeason(lg, t) : signed;
  const games = lg.schedule.filter((g) => g.h === t.id || g.a === t.id);
  const today = userGameOnDay(lg);
  const upcoming = games.filter((g) => !g.played).slice(0, 5);
  const played = games.filter((g) => g.played);
  const series = lg.phase === "playoffs" ? userSeries(lg) : null;
  const slot = currentSlot(lg);
  const odds = lg.phase === "regular" ? playoffOdds(lg)[t.id] : null;
  const fans = t.owner?.fanSupport ?? 60, trust = t.owner?.trust ?? 65;
  const focused = Object.keys(t.training?.assignments || {}).filter((id) => lg.players[id]?.tid === t.id);
  const [pick, setPick] = useState(0);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [prepOpen, setPrepOpen] = useState(false);
  const [more, setMore] = useState(readShow);
  const [rightTab, setRightTab] = useState("stories");
  const [labPick, setLabPick] = useState("");
  const [labSort, setLabSort] = useState("pos"); // "pos": grouped by position; "growth": one list, fastest growers first
  const [labFlash, setLabFlash] = useState(false);
  const labRef = useRef(null);
  const toggleMore = () => setMore((m) => { try { localStorage.setItem(SHOW_KEY, m ? "0" : "1"); } catch { /* private mode */ } return !m; });
  const offseason = ["draft", "resign", "freeagency"].includes(lg.phase);

  // ---- Needs Attention (engine/home.js): urgent first, each with a way in and its one-tap fixes ----
  // After the list closes (and gives focus back), so the scroll isn't undone.
  const toLab = () => { setInboxOpen(false); setTimeout(() => { labRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" }); setLabFlash(true); setTimeout(() => setLabFlash(false), 1600); }, 80); };
  const attention = needsAttention(lg).map((it) => ({
    ...it,
    onOpen: () => { const to = it.to; setInboxOpen(false); if (Array.isArray(to)) go(to[0], to[1]); else if (to?.player) openPlayer?.(to.player); else if (to?.paper) openPaper?.(to.paper); else if (to?.lab) toLab(); },
    actions: (it.fixes || []).map((f) => ({ label: f.label, onClick: () => { const r = runFix(lg, f.fix); if (r?.msg) toast(r.msg, 5000); commit(); } })),
    onDismiss: it.dismiss ? () => { runFix(lg, it.dismiss); commit(); } : null,
  }));
  const urgentN = attention.filter((x) => x.tone === "urgent").length;

  // ---- This week: the phase's main job first, then the to-do list ----
  const first = lg.phase === "preseason" ? { label: "Training Camp", sub: "Camp work and mini games to improve your roster before the season", onClick: () => go("roster") }
    : lg.phase === "regular" ? { label: "Schedule", sub: "Your games, this week's game plan and the playoff picture", onClick: () => go("schedule") }
    : lg.phase === "playoffs" ? { label: "Playoff Bracket", sub: "The road to the Stanley Cup", onClick: () => go("playoffs") }
    : lg.phase === "draft" ? (atCombine(lg) ? { label: "Scouting Combine", sub: "Combine results, interviews and your big board", onClick: () => go("draft") } : { label: "Entry Draft", sub: draftDone(lg) ? "Your class and the draft recap" : "Make your picks", onClick: () => go("draft") })
    : lg.phase === "resign" ? { label: "Re-sign Players", sub: "Only you can talk to your expiring players this week", onClick: () => go("freeagency") }
    : { label: "Free Agency", sub: "Negotiate with the players on the market", onClick: () => go("freeagency") };
  const deadline = lg.phase === "regular" && deadlinePending(lg);

  // ---- The matchup: the selected upcoming game, or the next game of your playoff series ----
  const sel = series ? null : upcoming[Math.min(pick, upcoming.length - 1)];
  const pGame = series ? nextGame(lg, series) : null;
  const homeT = series ? lg.teams[pGame.home] : sel ? lg.teams[sel.h] : null;
  const awayT = series ? lg.teams[pGame.away] : sel ? lg.teams[sel.a] : null;
  const opp = homeT && awayT ? (homeT.id === t.id ? awayT : homeT) : null;
  const atHome = homeT?.id === t.id;
  const hasGame = !!opp && (lg.phase === "preseason" || lg.phase === "regular" || !!series);
  const prob = opp ? winProbability(lg, t, opp, { home: atHome }) : null;
  const mine = teamStrength(lg, t), theirs = opp ? teamStrength(lg, opp) : null;
  const rateOf = (team) => (team.id === t.id ? ratings : teamRatings(lg, team));
  const formUs = lastResults(lg, t), formThem = opp ? lastResults(lg, opp) : [];
  const starOf = (team, test, key) => team.roster.map((id) => lg.players[id]).filter((p) => p && p.injury <= 0 && test(p)).sort((a, b) => key(b) - key(a))[0];
  const myScorer = starOf(t, (p) => !isGoalie(p.pos) && !isDefense(p.pos), (p) => composites(p).off);
  const theirD = opp && starOf(opp, (p) => isDefense(p.pos), (p) => composites(p).def);
  const theirScorer = opp && starOf(opp, (p) => !isGoalie(p.pos) && !isDefense(p.pos), (p) => composites(p).off);
  const myD = starOf(t, (p) => isDefense(p.pos), (p) => composites(p).def);
  const myG = lg.players[gameLines(lg, t).G[0]], theirG = opp && lg.players[gameLines(lg, opp).G[0]];
  const edge = (a, b) => { const d = a - b; return d >= 3 ? ["EDGE: YOU", "#22c55e"] : d <= -3 ? [`EDGE: ${opp.abbr}`, "#ef4444"] : ["EVEN", "#eab308"]; };
  const stake = (() => {
    if (!opp) return null;
    if (series) { const us = series.top === t.id ? series.wTop : series.wBot, them = series.top === t.id ? series.wBot : series.wTop; return [us === 3 && them === 3 ? "Game 7: win or go home." : us === 3 ? "One win from taking the series." : them === 3 ? "Facing elimination: lose and the season is over." : `${ROUND_NAMES[series.round]}: ${us === them ? `series tied ${us}-${them}` : us > them ? `you lead ${us}-${them}` : `you trail ${us}-${them}`}.`, series.round === 3 ? "Four wins from the Stanley Cup." : "Best of seven."]; }
    const divGame = opp.div === t.div, confGame = opp.conf === t.conf;
    const cut = conf[7];
    const pos = confRank <= 8 ? `Inside the playoff picture: ${ORD(confRank)} in the ${t.conf}.` : (() => { const gap = Math.max(0, (cut?.rec.pts || 0) - t.rec.pts); return gap ? `Outside the playoff picture, ${gap} point${gap === 1 ? "" : "s"} behind the 8th seed.` : "Outside the playoff picture, level on points with the 8th seed."; })();
    return [divGame ? `Division game: a four-point swing in the ${t.div}.` : confGame ? "Conference game: it counts in the playoff race." : "Cross-conference game.", t.rec.gp ? pos : upcoming.indexOf(sel) <= 0 ? "Opening night: every point counts." : "Points in October count as much as points in April."];
  })();
  const gameNo = played.length + 1 + (series ? 0 : Math.max(0, upcoming.indexOf(sel)));
  const cardLabel = series ? `${lg.year} PLAYOFFS · ${ROUND_UP(series.round)} · GAME ${series.games.length + 1}` : lg.phase === "preseason" && gameNo === 1 ? "PRESEASON · OPENING NIGHT" : `REGULAR SEASON · GAME ${gameNo}`;
  const kickoff = series ? (() => { const us = series.top === t.id ? series.wTop : series.wBot, them = series.top === t.id ? series.wBot : series.wTop; return us === them ? `Series tied ${us}-${them}` : `${us > them ? t.abbr : opp.abbr} leads the series ${Math.max(us, them)}-${Math.min(us, them)}`; })() : sel ? kickoffText(lg, sel) : "";
  const arena = homeT ? sel?.venue || arenaOf(lg, homeT.id) : null;
  const venue = homeT ? (arena ? `${arena}, ${homeT.city}` : homeT.city) : "";
  const prime = sel ? primeTime(lg, sel) : null;
  const rival = !!opp && (t.rivals || []).includes(opp.id);

  // ---- The main heading and, off-season and in the playoffs, the buttons beside it ----
  const champ = lg.playoffs?.champion;
  const label = lg.phase === "preseason" ? `${lg.year} Preseason`
    : lg.phase === "regular" ? (seasonOver(lg) ? `${lg.year} Regular Season Complete` : `${lg.year} Regular Season: ${today ? "Gameday" : "Off Day"}`)
    : lg.phase === "playoffs" ? (champ != null ? `${lg.year} Season Complete` : `${lg.year} Playoffs: ${ROUND_NAMES[lg.playoffs?.round] || ""}`)
    : lg.phase === "draft" ? (atCombine(lg) ? "Off-season: Scouting Combine" : "Off-season: Entry Draft")
    : lg.phase === "resign" ? "Off-season: Re-sign Window" : "Off-season: Free Agency";
  const primary = [];
  if (lg.phase === "regular" && seasonOver(lg) && act.startPlayoffs) primary.push({ label: "Start Playoffs 🏆", onClick: act.startPlayoffs });
  if (lg.phase === "playoffs") {
    if (champ != null) { if (act.toDraft) primary.push({ label: "Go to the Draft →", onClick: act.toDraft }); primary.push({ label: "Bracket", onClick: () => go("playoffs") }); }
    else if (series) { if (act.playPlayoffLive) primary.push({ label: `▶ Play Game ${series.games.length + 1}`, onClick: act.playPlayoffLive }); if (act.simPlayoffDay) primary.push({ label: "Sim Day", onClick: act.simPlayoffDay }); if (act.simPlayoffRound) primary.push({ label: "Sim Round", onClick: act.simPlayoffRound }); }
    else { primary.push({ label: "Bracket", onClick: () => go("playoffs") }); if (act.simPlayoffsAll) primary.push({ label: "Sim to the Final", onClick: act.simPlayoffsAll }); }
  }
  if (lg.phase === "draft") {
    if (atCombine(lg)) { primary.push({ label: "🔍 Go to the Combine", onClick: () => go("draft") }); if (act.startDraft) primary.push({ label: "Start the Draft →", onClick: act.startDraft }); }
    else if (draftDone(lg)) { if (act.toResign) primary.push({ label: "Continue to Re-signing →", onClick: act.toResign }); primary.push({ label: "Draft recap", onClick: () => go("draft") }); }
    else primary.push({ label: slot ? `Go to the draft · pick #${slot.overall}` : "Go to the draft", onClick: () => go("draft") });
  }
  if (lg.phase === "resign") { primary.push({ label: "✍️ Re-sign your players", onClick: () => go("freeagency") }); if (act.toFA) primary.push({ label: "Finish → Free Agency", onClick: act.toFA }); }
  if (lg.phase === "freeagency") {
    primary.push({ label: "💼 Go to Free Agency", onClick: () => go("freeagency") });
    if ((lg.fa?.day ?? 0) < FA_DAYS && act.faDay) primary.push({ label: "Next day", onClick: act.faDay });
    if (act.nextSeason) primary.push({ label: `Start ${lg.year + 1}-${String(lg.year + 2).slice(2)} →`, onClick: act.nextSeason });
  }

  // ---- Right column ----
  const teamOfStory = (n) => { const p = n.pid != null ? lg.players[n.pid] : null; if (p && p.tid >= 0) return lg.teams[p.tid]; return lg.teams.find((x) => (n.text || "").includes(x.name)) || null; };
  const stories = (() => { const seen = new Set(); return (lg.news?.length ? lg.news : lg.inbox.slice().reverse()).filter((n) => { const k = (n.title || n.text || "").replace(/\d+/g, "#").slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 7); })();
  const leaders = [["PTS", (p) => p.stats.pts], ["G", (p) => p.stats.g], ["A", (p) => p.stats.a]].map(([k, f]) => [k, roster.filter((x) => !isGoalie(x.pos)).sort((a, b) => f(b) - f(a) || b.ovr - a.ovr)[0], f]);
  const labAdd = (pid) => { const p = lg.players[pid]; if (!p) return; for (const id of Object.keys(t.training?.assignments || {})) if (lg.players[id]?.tid !== t.id) delete t.training.assignments[id]; const groups = Object.entries(TRAINING).filter(([k]) => isGoalie(p.pos) === (k === "goaltending")); const [k] = groups.sort((a, b) => a[1].keys.reduce((s, x) => s + (p.attrs[x] || 0), 0) / a[1].keys.length - b[1].keys.reduce((s, x) => s + (p.attrs[x] || 0), 0) / b[1].keys.length)[0]; const r = setTraining(lg, pid, k); toast(r.msg); commit(); setLabPick(""); };
  const labRemove = (pid) => { const r = setTraining(lg, pid, ""); toast(r.msg); commit(); };
  // Growth ranking for the focus picker: the development desk's own score (young, room to grow, trait).
  const growth = new Map(focusCandidates(lg, t).map(({ p, score }) => [p.id, score]));
  const labOption = (p) => <option key={p.id} value={p.id}>{p.name} ({p.pos}, {p.ovr} OVR, POT {p.pot}){p.injury > 0 ? " · injured" : p.age <= 24 ? " · ~fast" : p.age >= 31 ? " · slow" : ""}</option>;
  const watch = prospectWatch(lg, t);

  const thisWeek = (
    <div className="rk-hm-list">
      <button className="rk-b rk-wk-first" onClick={first.onClick}><b>{first.label}</b><span>{first.sub}</span></button>
      {deadline && <button className="rk-b rk-wk-item" style={{ "--tone": TONE_C.urgent }} onClick={() => go("deadline")}><b>⏰ Trade Deadline Day</b><span>Make your moves before 3:00 PM ET.</span></button>}
      {attention.slice(0, 7).map((it) => (
        <div key={it.key} className="rk-wk-item rk-wk-row" style={{ "--tone": TONE_C[it.tone] }}>
          <button className="rk-b rk-wk-open" onClick={it.onOpen} title={it.sub}><b>{it.icon} {it.title}</b>{it.sub && <span>{it.sub}</span>}</button>
          {it.actions.length > 0 && <div className="rk-wk-fixes">{it.actions.map((a) => <button key={a.label} className="rk-b rk-fix" onClick={a.onClick}>{a.label}</button>)}</div>}
        </div>
      ))}
      {attention.length > 7 && <button className="rk-b rk-wk-item" style={{ "--tone": TONE_C.info }} onClick={() => setInboxOpen(true)}><b>+{attention.length - 7} more in Needs Attention</b></button>}
      {!attention.length && !deadline && <div className="rk-hm-quiet">Nothing else needs you this week.</div>}
    </div>
  );

  // Roster health: a short roster in the off-season counts against you before injuries do.
  const short = (lg.phase === "resign" || lg.phase === "freeagency") && signedNext < MAX_ROSTER;

  return (
    <div className="gg-home rk-home">
      <div className="gg-status-row">
        <section className={`gg-stat rk-attn ${urgentN ? "alert" : attention.length ? "warn" : "ok"}`} onClick={() => setInboxOpen(true)} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setInboxOpen(true))} aria-label={`Needs attention: ${attention.length} items`}><small>NEEDS ATTENTION</small><div className="gg-stat-line"><b>{attention.length ? `${attention.length} item${attention.length > 1 ? "s" : ""}` : "All clear"}</b><span>{attention[0]?.title || "No urgent issues"}</span></div></section>
        <section className="gg-stat" onClick={() => go("standings")}><small>RECORD</small><div className="gg-stat-line"><b>{rec(t.rec)}</b><span>{t.rec.gp ? `${ORD(divRank)} in the ${t.div}${odds != null ? ` · ${Math.round(odds * 100)}% playoff odds` : ""}` : `${ORD(divRank)} in the ${t.div}`}</span></div></section>
        <section className="gg-stat" onClick={() => go("frontoffice", "contracts")}><small>CAP SPACE</small><div className="gg-stat-line"><b style={{ color: room < 0 ? "#ef4444" : room < 3 ? "#eab308" : "#22c55e" }}>{money(room)}</b><span>{expiring ? `${expiring} expiring deal${expiring === 1 ? "" : "s"}` : "No deals expiring"}</span></div></section>
        <section className={`gg-stat ${starters.length || short ? "warn" : ""}`} onClick={() => (short ? go("freeagency") : go("roster"))}><small>ROSTER HEALTH</small><div className="gg-stat-line"><b style={{ color: short ? "#eab308" : starters.length ? "#ef4444" : injured.length ? "#eab308" : "#22c55e" }}>{short ? `${signedNext}/${MAX_ROSTER}` : injured.length ? `${injured.length} injured` : "Healthy"}</b><span>{short ? `${MAX_ROSTER - signedNext} spot${MAX_ROSTER - signedNext === 1 ? "" : "s"} to fill` : starters.length ? `${starters.length} starter-level out` : `${signed} on the roster`}</span></div></section>
        <section className="gg-stat" onClick={() => go("frontoffice", "owner")}><small>OWNER & LOCKER ROOM</small><div className="gg-stat-line"><b style={{ color: trust >= 60 ? "#22c55e" : trust >= 40 ? "#eab308" : "#ef4444" }}>{trust >= 60 ? "Secure" : trust >= 40 ? "Watchful" : "Hot seat"}</b><span>Morale {Math.round(t.morale)} · Fans {fans}% · Rep {rep.label}</span></div></section>
      </div>

      <div className="rk-hm" style={{ "--hm-team": t.colors[0] }}>
        <aside className="rk-hm-menu gg-home-left">
          <div className="rk-hm-h">This week</div>
          <div className="rk-hm-scroll"><div className="rk-hm-scroll-in">{thisWeek}</div></div>
          <InjuryReportCard />
        </aside>

        <section className="rk-hm-main gg-home-main">
          <div className="rk-hm-top">
            <h3 className="rk-hm-label">{label}</h3>
            {primary.length > 0 && <div className="rk-hm-primary">{primary.map((b, i) => <button key={b.label} className={`rk-b rk-pbtn${i === 0 ? " go" : ""}`} onClick={b.onClick}>{b.label}</button>)}</div>}
            {!series && (lg.phase === "preseason" || lg.phase === "regular") && games.length > 0 && <WeekStrip lg={lg} t={t} played={played.slice(-2)} upcoming={upcoming.slice(0, Math.max(3, 5 - Math.min(2, played.length)))} pick={pick} onPick={setPick} onBox={openBox} />}
          </div>

          {hasGame ? (
            <>
              <MatchupCard lg={lg} away={awayT} home={homeT} label={cardLabel} kickoff={kickoff} venue={venue} prime={prime} rival={rival}
                ratingAway={rateOf(awayT)} ratingHome={rateOf(homeT)} onPrep={() => setPrepOpen(true)} />
              <div className={`rk-stakes${stake ? "" : " bare"}`}>
                {stake && <div className="rk-stakes-txt"><small>{series ? "THE SERIES" : "WHAT'S AT STAKE"}</small><b>{stake[0]}</b><span>{stake[1]}</span></div>}
                <button className="rk-b rk-more" onClick={toggleMore} aria-expanded={more} title="Form, the line, injuries, key matchups and the game plan">{more ? "▲ Less on this matchup" : "▼ More on this matchup"}</button>
              </div>
              {more && (
                <div className="rk-details">
                  <div className="rk-details-row">
                    <section className="rk-box"><div className="rk-box-h">FORM · LAST 5</div>
                      {[[awayT, awayT.id === t.id ? formUs : formThem], [homeT, homeT.id === t.id ? formUs : formThem]].map(([team, f]) => <div key={team.id} className="rk-form"><TeamBadge team={team} size={20} decorative /><b>{team.abbr}</b>{f.length ? f.map((r, i) => <i key={i} className={`rk-pill ${r}`}>{r === "O" ? "OT" : r}</i>) : <span className="dim">No games yet</span>}</div>)}
                    </section>
                    <section className="rk-box"><div className="rk-box-h">THE LINE</div><div className="rk-line">{Math.abs(prob - 0.5) < 0.03 ? "PICK 'EM" : `${prob >= 0.5 ? t.abbr : opp.abbr} ${Math.round(Math.max(prob, 1 - prob) * 100)}%`}</div><span className="rk-box-sub">{prob >= 0.55 ? "You're the favourite." : prob <= 0.45 ? "You're the underdog." : "A coin flip."} Offence {mine.off > theirs.off + 1 ? "edge you" : theirs.off > mine.off + 1 ? `edge ${opp.abbr}` : "even"} · goaltending {mine.goalie > theirs.goalie + 1 ? "edge you" : theirs.goalie > mine.goalie + 1 ? `edge ${opp.abbr}` : "even"}.</span></section>
                    <section className="rk-box"><div className="rk-box-h">INJURIES</div>
                      {[opp, t].map((team) => { const out = team.roster.map((id) => lg.players[id]).filter((p) => p && p.injury > 0 && p.ovr >= 78).sort((a, b) => b.ovr - a.ovr).slice(0, 3); return <div key={team.id} className="rk-box-sub"><b>{team.abbr}</b> {out.length ? out.map((p) => `${p.name.split(" ").at(-1)} (${p.pos}, ${p.ltir ? "LTIR" : "OUT"})`).join(", ") : <span className="dim">no key players out</span>}</div>; })}
                    </section>
                  </div>
                  <section className="rk-box"><div className="rk-box-h">KEY MATCHUPS</div>
                    {[[myScorer, theirD, "Your top scorer vs their best defender", (a, b) => edge(composites(a).off, composites(b).def)], [myD, theirScorer, "Your best defender vs their top scorer", (a, b) => edge(composites(a).def, composites(b).off)], [myG, theirG, "Goaltending", (a, b) => edge(a.ovr, b.ovr)]].filter(([a, b]) => a && b).map(([a, b, l, f]) => { const [txt, c] = f(a, b); const gl = (p) => (isGoalie(p.pos) && p.stats.gp ? `${savePct(p.stats).toFixed(3).slice(1)} SV%` : `${p.pos} ${p.ovr}`); return <div key={l} className="rk-km"><span>{l}</span><b><PlayerName p={a} showInj={false} /></b><em>{gl(a)}</em><i>vs</i><b><PlayerName p={b} showInj={false} /></b><em>{gl(b)}</em><strong style={{ color: c }}>{txt}</strong></div>; })}
                  </section>
                  <GamePlanPicker opp={opp} compact />
                </div>
              )}
            </>
          ) : (
            <>
              <div className="rk-hero">
                <TeamBadge team={t} size={88} decorative className="rk-hero-logo" />
                <div>
                  <div className="rk-hero-title">{heroTitle(lg, t)}</div>
                  <div className="rk-hero-sub">{t.city} {t.name} · {rec(t.rec)}{t.playoffResult && (lg.phase === "playoffs" || offseason) ? ` · ${t.playoffResult}` : ""}</div>
                </div>
              </div>
              <OffseasonBoard lg={lg} go={go} openPlayer={openPlayer} />
              <PhaseCard lg={lg} t={t} go={go} slot={slot} series={series} />
            </>
          )}
        </section>

        <aside className="rk-hm-side gg-home-right">
          <div className="rk-tabs" role="tablist">{[["stories", "Top Stories"], ["injuries", "Injury Report"], ["prospects", "Prospects"]].map(([k, l]) => <button key={k} role="tab" aria-selected={rightTab === k} className={`rk-b rk-tab${rightTab === k ? " on" : ""}`} onClick={() => setRightTab(k)}>{l}</button>)}</div>
          <div className="rk-side-scroll"><div className="rk-side-scroll-in">
            {rightTab === "stories" && <Stories stories={stories} teamOf={teamOfStory} userTid={t.id} onAll={() => go("activity")} />}
            {rightTab === "injuries" && <InjuryList lg={lg} t={t} onRoster={() => go("roster", "injured")} />}
            {rightTab === "prospects" && (
              <>
                <div className="rk-box-h rk-side-h">PROSPECT WATCH <button className="rk-b rk-link" onClick={() => go("development")}>All →</button></div>
                {watch.filter((r) => r.farm || r.p.age <= 22).slice(0, 6).map((r) => <div key={r.p.id} className="gg-home-watch-row"><PosBadge pos={r.p.pos} /><div><b><PlayerName p={r.p} /></b><span className="dim small">{r.level} · {r.line.text}</span></div><Sparkline path={r.path} width={64} height={22} color={r.delta > 0 ? "#22c55e" : r.delta < 0 ? "#ef4444" : "#94a3b8"} /><b style={{ color: r.delta > 0 ? "#22c55e" : r.delta < 0 ? "#ef4444" : "#94a3b8" }}>{r.delta > 0 ? "+" : ""}{r.delta}</b></div>)}
                {!watch.length && <div className="rk-hm-quiet">No young players to follow yet.</div>}
                {t.rec.gp > 0 && <><div className="rk-box-h rk-side-h" style={{ marginTop: 12 }}>CLUB LEADERS</div>{leaders.map(([k, p, f]) => p ? <div key={k} className="rk-inj-row"><span className="gg-pill">{k}</span><b><PlayerName p={p} /></b><span className="rk-inj-n">{f(p)}</span></div> : null)}</>}
              </>
            )}
          </div></div>
          <section className={`gg-lab rk-lab${labFlash ? " rk-flash" : ""}`} id="dev-focus" data-tour="devfocus" ref={labRef}>
            <div className="rk-box-h" title="Your staff gives three players individual attention. Each week a focused player banks training work in his weakest skill group; it pays off at season rollover.">DEVELOPMENT FOCUS <span className="rk-info" aria-hidden="true">ⓘ</span></div>
            {focused.length ? focused.map((id) => { const p = lg.players[id]; return <div key={id} className="gg-inj lab"><PosBadge pos={p.pos} /><b><PlayerName p={p} /></b><span className="dim">{TRAINING[t.training.assignments[id]]?.name}</span><button className="tiny ghost" onClick={() => labRemove(id)} aria-label={`Remove ${p.name} from the lab`}>✕</button></div>; }) : <div className="gg-lab-empty">Nobody in the lab. Pick a player below.</div>}
            {focused.length < FOCUS_SLOTS && (<>
              <div className="rk-lab-pick"><span>{FOCUS_SLOTS - focused.length} SLOT{FOCUS_SLOTS - focused.length === 1 ? "" : "S"} OPEN</span><span className="rk-sort"><small>Sort</small>{[["pos", "Position"], ["growth", "Growth"]].map(([k, l]) => <button key={k} className={labSort === k ? "on" : ""} aria-pressed={labSort === k} onClick={() => setLabSort(k)}>{l}</button>)}</span></div>
              <Select value={labPick} onChange={(e) => labAdd(e.target.value)} aria-label="Add a development focus player" placeholder="— choose a player —" style={{ width: "100%" }}>
                <option value="">— choose a player —</option>
                {labSort === "growth"
                  ? roster.filter((p) => !focused.includes(p.id)).sort((a, b) => (growth.get(b.id) ?? -99) - (growth.get(a.id) ?? -99) || b.ovr - a.ovr).map(labOption)
                  : ["C", "LW", "RW", "LD", "RD", "G"].map((pos) => <optgroup key={pos} label={pos}>{roster.filter((p) => p.pos === pos && !focused.includes(p.id)).sort((a, b) => (growth.get(b.id) ?? -99) - (growth.get(a.id) ?? -99) || b.ovr - a.ovr).map(labOption)}</optgroup>)}
              </Select>
            </>)}
          </section>
        </aside>
      </div>
      {inboxOpen && <NeedsAttention items={attention} onClose={() => setInboxOpen(false)} />}
      {prepOpen && <GamePrep onClose={() => setPrepOpen(false)} />}
    </div>
  );
}

function heroTitle(lg, t) {
  if (lg.phase === "regular") return "Regular season complete";
  if (lg.phase === "playoffs") return lg.playoffs?.champion != null ? (lg.playoffs.champion === t.id ? "Stanley Cup champions" : "Season complete") : t.playoffResult ? "Season over" : "Playoffs";
  if (lg.phase === "draft") return atCombine(lg) ? "Scouting Combine" : draftDone(lg) ? "Draft complete" : "Entry Draft";
  if (lg.phase === "resign") return "Re-sign window";
  if (lg.phase === "freeagency") return "Free agency";
  return "Off-season";
}

// Last results and the next games, one small tile each: tap a result for its box score, an
// upcoming game to preview it below.
function WeekStrip({ lg, t, played, upcoming, pick, onPick, onBox }) {
  const tiles = [...played.map((g) => ({ g, done: true })), ...upcoming.map((g, i) => ({ g, i }))].slice(0, 5);
  return (
    <div className="rk-strip" aria-label="Recent and upcoming games">
      {tiles.map(({ g, done, i }) => {
        const home = g.h === t.id, o = lg.teams[home ? g.a : g.h];
        const us = home ? g.hs : g.as, them = home ? g.as : g.hs;
        const r = done ? (us > them ? "W" : g.ot ? "OTL" : "L") : null;
        const cur = !done && i === pick;
        return (
          <button key={g.id} className={`rk-b rk-tile${cur ? " on" : ""}${done ? " done" : ""}`} style={cur ? { "--c1": t.colors[0] } : undefined}
            onClick={() => (done ? onBox(g) : onPick(i))} title={`${home ? "vs" : "at"} ${o.city} ${o.name} · ${dayToDate(lg.year, g.day, lg.scheduleStart)}${done ? ` · ${r} ${us}-${them}` : ""}`}>
            <span className="rk-tile-box"><TeamBadge team={o} size={22} decorative /></span>
            <span className={`rk-tile-k${r ? ` r-${r}` : ""}`}>{done ? `${r === "OTL" ? "OT" : r} ${us}-${them}` : `${home ? "" : "@ "}${dayToDate(lg.year, g.day, lg.scheduleStart).toUpperCase()}`}</span>
          </button>
        );
      })}
    </div>
  );
}

// The gameday card (the football game's matchup portraits): both clubs' best players in their
// home or road sweaters either side of the logos, puck drop and arena, then each club's record
// and team ratings, the higher of each pair in green.
function Portrait({ p, team, road }) {
  const kit = { ...team, uniform: { ...(team.uniform || {}), home: !road } };
  return (
    <figure className="rk-mx-player" style={{ "--c1": team.colors[0], "--c2": team.colors[1] || "#ffffff" }}>
      <div className="rk-mx-face">{p ? <Headshot p={p} team={kit} size={128} decorative /> : <TeamBadge team={team} size={96} decorative />}</div>
      <figcaption>
        <strong>{p ? <PlayerName p={p} showInj={false} /> : `${team.abbr} skaters`}</strong>
        {p && <span>{p.pos} • {p.ovr} OVR</span>}
      </figcaption>
    </figure>
  );
}
function TeamSummary({ team, rating, other }) {
  const long = team.name.length >= 11;
  return (
    <section className="rk-mx-team" aria-label={`${team.city} ${team.name} team ratings`}>
      <span className="rk-mx-city">{team.city}</span>
      <h3 className={long ? "long" : ""} title={`${team.city} ${team.name}`}><span>{team.name}</span></h3>
      <p className="rk-mx-rec">{rec(team.rec)}</p>
      <div className="rk-mx-ratings">
        {[["ovr", "OVR"], ["fwd", "OFF"], ["def", "DEF"], ["g", "G"]].map(([k, l]) => <div key={k} className={`rk-mx-rating${(rating?.[k] ?? 0) >= (other?.[k] ?? 0) ? " ahead" : ""}`}><strong>{rating?.[k] ?? "—"}</strong><span>{l}</span></div>)}
      </div>
    </section>
  );
}
function MatchupCard({ lg, away, home, label, kickoff, venue, prime, rival, ratingAway, ratingHome, onPrep }) {
  return (
    <article className={`rk-mx${prime ? " prime" : ""}${rival ? " rival" : ""}`} style={{ "--mx-a": away.colors[0], "--mx-h": home.colors[0] }} aria-label={`${away.city} ${away.name} at ${home.city} ${home.name}`}>
      <header className="rk-mx-label">
        <span>{label}</span>
        <span className="rk-mx-badges">
          {rival && <span className="rk-mx-badge rival">RIVALRY</span>}
          {prime && <span className="rk-mx-badge prime">★ {prime.toUpperCase()}</span>}
          <button className="rk-b rk-prep" onClick={onPrep} title="Opponent report, game plan and a ready check">🎯 Game prep</button>
        </span>
      </header>
      <div className="rk-mx-field">
        <div className="rk-mx-matchup">
          <Portrait p={topPlayer(lg, away)} team={away} road />
          <div className="rk-mx-logos" aria-hidden="true"><TeamBadge team={away} size={96} decorative /><b>AT</b><TeamBadge team={home} size={96} decorative /></div>
          <Portrait p={topPlayer(lg, home)} team={home} />
        </div>
      </div>
      <div className="rk-mx-kickoff">{kickoff && <strong>{kickoff}</strong>}{venue && <span>{venue}</span>}</div>
      <div className="rk-mx-teams">
        <TeamSummary team={away} rating={ratingAway} other={ratingHome} />
        <TeamSummary team={home} rating={ratingHome} other={ratingAway} />
      </div>
    </article>
  );
}

// Top stories: the newest first, as a feature with the club's colours; the rest as cards.
function Stories({ stories, teamOf, userTid, onAll }) {
  const icon = (n) => ({ injury: "🚑", scoring: "📈", hot: "🔥", pressure: "👔", milestone: "🏅", coach: "🪑", allstar: "⭐", cup: "🏆", award: "🎖️", prospect: "🌱", draft: "🎯" }[n.type] || "📰");
  if (!stories.length) return <div className="rk-hm-quiet">Quiet around the league so far. Stories arrive after every week.</div>;
  return (
    <>
      {stories.map((n, i) => {
        const team = teamOf(n), head = (n.text || "").split(". ")[0], rest = (n.text || "").split(". ").slice(1).join(". ");
        return (
          <div key={i} className={`rk-story${i === 0 ? " lead" : ""}${team?.id === userTid ? " mine" : ""}`} style={i === 0 && team ? { "--c1": team.colors[0] } : undefined}>
            {(team || i === 0) && <div className="rk-story-top">{team && <TeamBadge team={team} size={i === 0 ? 36 : 22} decorative />}{team?.id === userTid && <span className="rk-story-mine">YOUR TEAM</span>}</div>}
            <b>{icon(n)} {head}</b>
            {rest && <span>{rest}</span>}
          </div>
        );
      })}
      <button className="rk-b rk-link" onClick={onAll}>Full log →</button>
    </>
  );
}

// Your injured players, then the biggest names out around the league.
function InjuryList({ lg, t, onRoster }) {
  const tag = (p) => (p.ltir ? ["LTIR", "#a855f7"] : p.injury >= 4 ? ["IR", "#ef4444"] : ["OUT", "#f97316"]);
  const row = (p, team) => { const [k, c] = tag(p); return (
    <div key={p.id} className="rk-inj-row">
      {team && <TeamBadge team={team} size={22} decorative />}
      <div className="rk-inj-who"><b><PlayerName p={p} showInj={false} /> <em>{p.pos} {p.ovr}</em></b><span><i style={{ "--c": c }}>{k}</i>{p.injuryNote ? ` ${p.injuryNote}` : ""} · {p.injury} game{p.injury === 1 ? "" : "s"}</span></div>
    </div>
  ); };
  const mine = t.roster.map((id) => lg.players[id]).filter((p) => p && p.injury > 0).sort((a, b) => b.ovr - a.ovr);
  const league = lg.teams.filter((x) => x.id !== t.id).flatMap((x) => x.roster.map((id) => lg.players[id]).filter((p) => p && p.injury > 0 && p.ovr >= 78).map((p) => [p, x])).sort((a, b) => b[0].ovr - a[0].ovr).slice(0, 8);
  if (lg.settings?.injuries === false) return <div className="rk-hm-quiet">Injuries are turned off in Settings.</div>;
  return (
    <>
      <div className="rk-box-h rk-side-h">YOUR TEAM · {mine.length}</div>
      {mine.length ? mine.map((p) => row(p, null)) : <div className="rk-hm-quiet good">Fully healthy.</div>}
      <div className="rk-box-h rk-side-h" style={{ marginTop: 14 }}>AROUND THE LEAGUE</div>
      {league.length ? league.map(([p, x]) => row(p, x)) : <div className="rk-hm-quiet">No big names out.</div>}
      {mine.length > 0 && <button className="rk-b rk-link" onClick={onRoster}>Manage roster →</button>}
    </>
  );
}

// The off-season board: your biggest needs (and why) beside the deals ending, or the young core
// once free agency opens. Each row opens the screen where you'd act on it.
function OffseasonBoard({ lg, go, openPlayer }) {
  const b = offseasonBoard(lg);
  const nav = (to) => (Array.isArray(to) ? go(to[0], to[1]) : to?.player != null && openPlayer?.(to.player));
  return (
    <div className="rk-board">
      <div className="rk-box">
        <div className="rk-box-h">BIGGEST NEEDS</div>
        {b.needs.length ? b.needs.map((n) => (
          <button key={n.pos} className="rk-b rk-board-row" onClick={() => nav(n.to)} title={`${n.name}: ${n.have} healthy of ${n.target}`}>
            <PosBadge pos={n.pos} /><b>{n.name}</b><span className="rk-board-why">{n.why}</span>
          </button>
        )) : <div className="rk-hm-quiet">No glaring holes. Build depth and stay young.</div>}
      </div>
      <div className="rk-box">
        <div className="rk-box-h">{b.title}</div>
        {b.list.map(({ p, note, to }) => (
          <button key={p.id} className="rk-b rk-board-row" onClick={() => nav(to)} title={note}>
            <PosBadge pos={p.pos} /><span className="rk-board-name">{p.name}</span><span className="rk-board-age">{p.age}</span><b className="rk-board-ovr" style={{ color: p.ovr >= 85 ? "#22c55e" : p.ovr >= 79 ? "#84cc16" : p.ovr >= 73 ? "#eab308" : "#f97316" }}>{p.ovr}</b>
          </button>
        ))}
        {!b.list.length && <div className="rk-hm-quiet">Nobody yet.</div>}
      </div>
    </div>
  );
}

// The phase in numbers: the playoff run, the draft, re-signing or free agency.
function PhaseCard({ lg, t, go, slot, series }) {
  const row = (k, v) => <div key={k} className="rk-phase-row"><small>{k}</small><b>{v}</b></div>;
  let head = null, rows = [], links = [];
  if (lg.phase === "regular" && seasonOver(lg)) {
    const conf = lg.teams.filter((x) => x.conf === t.conf).sort((a, b) => b.rec.pts - a.rec.pts || b.rec.rw - a.rec.rw), rank = conf.findIndex((x) => x.id === t.id) + 1;
    head = "REGULAR SEASON COMPLETE"; rows = [row("Points", `${t.rec.pts} pts`), row("Finish", `${ORD(rank)} in the ${t.conf}`), row("Playoffs", rank <= 8 ? "Qualified" : "Missed")];
  } else if (lg.phase === "playoffs") {
    const po = lg.playoffs, champ = po?.champion != null ? lg.teams[po.champion] : null;
    const mine = (po?.rounds || []).flatMap((r, i) => r.filter((x) => x.top === t.id || x.bot === t.id).map((x) => ({ ...x, round: i })));
    const last = mine.at(-1), out = last && last.winner != null && last.winner !== t.id;
    head = `STANLEY CUP PLAYOFFS · ${champ ? "COMPLETE" : ROUND_UP(po.round)}`;
    if (series && series.winner == null) rows.push(row("Your series", `${ROUND_NAMES[series.round]} vs ${lg.teams[series.top === t.id ? series.bot : series.top].abbr}`));
    if (out) rows.push(row("Your run", `Out in the ${ROUND_NAMES[last.round]} to ${lg.teams[last.winner].abbr}, ${last.top === t.id ? last.wTop : last.wBot}-${last.top === t.id ? last.wBot : last.wTop}`));
    if (!mine.length) rows.push(row("Your run", "Missed the playoffs"));
    if (champ) { rows.push(row("Champions", `${champ.city} ${champ.name}`)); if (lg.awards?.connSmythe) rows.push(row("Conn Smythe", lg.awards.connSmythe.name)); }
    links = [["Bracket", () => go("playoffs")], ...(champ ? [["Awards", () => go("legacy")]] : [])];
  } else if (lg.phase === "draft") {
    const done = draftDone(lg);
    const taken = Object.values(lg.players).filter((p) => p.draft?.year === lg.draft?.year && p.draft.tid === t.id).sort((a, b) => a.draft.pick - b.draft.pick);
    const picks = (lg.draftPicks || []).filter((p) => p.owner === t.id && p.year === lg.draft?.year).length;
    const grade = done ? teamDraftGrade(lg, t.id) : null;
    head = `${lg.draft?.year} ENTRY DRAFT${done ? " · COMPLETE" : atCombine(lg) ? " · COMBINE" : ""}`;
    rows = done ? [row("Your class", `${taken.length} player${taken.length === 1 ? "" : "s"}${grade ? ` · analysts say ${grade}` : ""}`), ...(taken[0] ? [row("First pick", `${taken[0].name} (#${taken[0].draft.pick})`)] : [])]
      : [row("Your next pick", slot ? `#${slot.overall} overall (round ${slot.round})` : "No picks left"), row("Picks this year", picks)];
    rows.push(row("Scouting points", t.scoutPts ?? 0));
  } else if (lg.phase === "resign") {
    const exp = expiringPlayers(lg, t).sort((a, b) => b.ovr - a.ovr);
    head = `RE-SIGN WINDOW · ${exp.length} EXPIRING`;
    rows = [row("Cap space next year", money(capSpace(lg, t))), ...exp.slice(0, 3).map((p) => row(`${p.name} (${p.pos} ${p.ovr})`, p.willing === false ? "testing the market" : `asks ${money(resignAsk(lg, p).aav)}`))];
  } else if (lg.phase === "freeagency") {
    const best = (lg.freeAgents || []).map((id) => lg.players[id]).filter(Boolean).sort((a, b) => b.ovr - a.ovr).slice(0, 2);
    head = `FREE AGENCY · DAY ${lg.fa?.day ?? 0} OF ${FA_DAYS}`;
    rows = [row("Cap space", money(capSpace(lg, t))), ...myOffers(lg).slice(0, 4).map(({ p, standing: st }) => row(`Your offer: ${p.name}`, <span className={`gg-bid ${st.standing || st.status}`}>{st.label}{st.status === "pending" ? ` · ${st.daysLeft}d` : ""}</span>)), ...best.map((p) => row(`${p.name} (${p.pos} ${p.ovr})`, `asks ${money(faAsk(lg, p).aav)}`))];
  }
  if (!head) return null;
  return (
    <div className="rk-box rk-phase">
      <div className="rk-box-h">{head}{links.map(([l, f]) => <button key={l} className="rk-b rk-link" onClick={f}>{l} →</button>)}</div>
      <div className="rk-phase-rows">{rows}</div>
    </div>
  );
}

// The full Needs Attention list (the football game's inbox): every item with its way in,
// and the decisions you can make right there.
function NeedsAttention({ items, onClose }) {
  const ref = useRef(null);
  useDialogFocus(ref, onClose);
  const urgent = items.filter((i) => i.tone === "urgent").length;
  return (
    <div className="rk-inbox-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="rk-inbox" role="dialog" aria-modal="true" aria-label="Needs attention" tabIndex={-1}>
        <div className="rk-inbox-head">
          <b>📥 Needs Attention</b>
          <span>{items.length ? `${items.length} item${items.length === 1 ? "" : "s"}${urgent ? ` · ${urgent} urgent` : ""}` : "All caught up"}</span>
          <button className="ghost rk-inbox-x" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </div>
        {!items.length && <div className="rk-inbox-empty">Nothing needs your attention right now.</div>}
        <div className="rk-inbox-list">
          {items.map((it) => (
            <div key={it.key} className={`rk-inbox-item t-${it.tone}`}>
              <span className="rk-inbox-icon" aria-hidden="true">{it.icon}</span>
              <div className="rk-inbox-body">
                <b>{it.title}</b>
                {it.sub && <span title={it.sub}>{it.sub}</span>}
                {it.actions?.length > 0 && <div className="rk-acts">{it.actions.map((a) => <button key={a.label} onClick={a.onClick}>{a.label}</button>)}</div>}
              </div>
              <div className="rk-inbox-side">
                {it.onOpen && <button className={`rk-cta t-${it.tone}`} onClick={it.onOpen}>{it.cta || "Open"}</button>}
                {it.onDismiss && <button className="rk-dismiss" onClick={it.onDismiss}>Dismiss</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
