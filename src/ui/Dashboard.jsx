import React, { useRef, useState } from "react";
import { useGame, TeamBadge, PlayerName, money, Sheet } from "./common.jsx";
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
import { savePct, gaa } from "../engine/players.js";
import { usePhone } from "./mobile.js";
import { prospectWatch } from "../engine/prospectWatch.js";
import { myOffers } from "../engine/negotiations.js";
import { needsAttention, runFix, topPlayer, kickoffText, primeTime, offseasonBoard, signedForNextSeason, NEED_NAME } from "../engine/home.js";
import { BuildYour23, faStart } from "./ContractBits.jsx";
import { Sparkline } from "./ProspectWatch.jsx";
import { POS_COLOR } from "./TradePage.jsx";
import GamePlanPicker from "./GamePlanPicker.jsx";
import GamePrep from "./GamePrep.jsx";
import "./home.css";
import "./broadcast.css";

// Home, laid out like the football game's: the franchise tiles on top, then one panel with
// three columns. On the left, this week's main job and the Needs Attention list; in the middle,
// the matchup (the week strip, both clubs' star players and logos, the team ratings, what's at
// stake) or, with no game to play, your logo, the phase and the off-season board; on the right,
// top stories, the injury report and prospects, with the development focus underneath.
const ORD = (n) => n + (["st", "nd", "rd"][((n + 90) % 100 - 10) % 10 - 1] || "th");
const PosBadge = ({ pos }) => <span className="gg-pos" style={{ background: POS_COLOR[pos] || "#64748b" }}>{pos}</span>;
const rec = (x) => `${x.w}-${x.l}-${x.otl}`;
const TONE_C = { urgent: "#ef4444", action: "#eab308", info: "#38bdf8" };
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
  const phone = usePhone();
  const [inboxOpen, setInboxOpen] = useState(false);
  const [labOpen, setLabOpen] = useState(false);
  const [prepOpen, setPrepOpen] = useState(false);
  const [labPick, setLabPick] = useState("");
  const [labSort, setLabSort] = useState("pos"); // "pos": grouped by position; "growth": one list, fastest growers first
  const offseason = ["draft", "resign", "freeagency"].includes(lg.phase);

  // ---- Needs Attention (engine/home.js): urgent first, each with a way in and its one-tap fixes ----
  // After the list closes (and gives focus back), so the scroll isn't undone.
  const toLab = () => { setInboxOpen(false); setLabOpen(true); };
  const attention = needsAttention(lg).map((it) => ({
    ...it,
    onOpen: () => { const to = it.to; setInboxOpen(false); if (Array.isArray(to)) go(to[0], to[1]); else if (to?.player) openPlayer?.(to.player); else if (to?.paper) openPaper?.(to.paper); else if (to?.lab) toLab(); },
    actions: (it.fixes || []).map((f) => ({ label: f.label, onClick: () => { const r = runFix(lg, f.fix); if (r?.msg) toast(r.msg, 5000); commit(); } })),
    onDismiss: it.dismiss ? () => { runFix(lg, it.dismiss); commit(); } : null,
  }));
  const urgentN = attention.filter((x) => x.tone === "urgent").length;

  // ---- This week: the phase's main job first, then the to-do list ----
  const first = lg.phase === "preseason" ? { label: "Training Camp", sub: "Camp work and mini games to improve your roster before the season", onClick: () => go("roster") }
    : lg.phase === "regular" ? { label: "Standings", sub: "The playoff picture: who'd be in if the season ended today, and the bracket it would make", onClick: () => go("standings") }
    : lg.phase === "playoffs" ? { label: "Playoff Bracket", sub: "The road to the Stanley Cup", onClick: () => go("playoffs") }
    : lg.phase === "draft" ? (atCombine(lg) ? { label: "Scouting Combine", sub: "Combine results, interviews and your big board", onClick: () => go("draft") } : { label: "Entry Draft", sub: draftDone(lg) ? "Your class and the draft recap" : "Make your picks", onClick: () => go("draft") })
    : lg.phase === "resign" ? { label: "Re-sign Players", sub: "Only you can talk to your expiring players this week", onClick: () => go("freeagency") }
    : { label: "Free Agency", sub: "Negotiate with the players on the market", onClick: () => go("freeagency") };
  const deadline = lg.phase === "regular" && deadlinePending(lg);

  // ---- The matchup: the selected upcoming game, or the next game of your playoff series ----
  const sel = series ? null : upcoming[0];
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
  if (lg.phase === "regular" && seasonOver(lg) && act.startPlayoffs) primary.push({ label: "Start the playoffs", onClick: act.startPlayoffs });
  if (lg.phase === "playoffs") {
    if (champ != null) { if (act.toDraft) primary.push({ label: "Go to the Draft →", onClick: act.toDraft }); primary.push({ label: "Bracket", onClick: () => go("playoffs") }); }
    else if (series) { if (act.playPlayoffLive) primary.push({ label: `▶ Play Game ${series.games.length + 1}`, onClick: act.playPlayoffLive }); if (act.simPlayoffDay) primary.push({ label: "Sim Day", onClick: act.simPlayoffDay }); if (act.simPlayoffRound) primary.push({ label: "Sim Round", onClick: act.simPlayoffRound }); }
    else { primary.push({ label: "Bracket", onClick: () => go("playoffs") }); if (act.simPlayoffsAll) primary.push({ label: "Sim to the Final", onClick: act.simPlayoffsAll }); }
  }
  if (lg.phase === "draft") {
    if (atCombine(lg)) { primary.push({ label: "Go to the Combine", onClick: () => go("draft") }); if (act.startDraft) primary.push({ label: "Start the Draft →", onClick: act.startDraft }); }
    else if (draftDone(lg)) { if (act.toResign) primary.push({ label: "Continue to Re-signing →", onClick: act.toResign }); primary.push({ label: "Draft recap", onClick: () => go("draft") }); }
    else primary.push({ label: slot ? `Go to the draft · pick #${slot.overall}` : "Go to the draft", onClick: () => go("draft") });
  }
  if (lg.phase === "resign") { primary.push({ label: "Re-sign your players", onClick: () => go("freeagency") }); if (act.toFA) primary.push({ label: "Finish → Free Agency", onClick: act.toFA }); }
  if (lg.phase === "freeagency") {
    primary.push({ label: "Go to Free Agency", onClick: () => go("freeagency") });
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
  const lab = (
    <section className="gg-lab rk-lab" id="dev-focus" data-tour="devfocus">
      <div className="rk-dsub">Your staff gives three players individual attention. Each week a focused player banks training work in his weakest skill group; it pays off at season rollover.</div>
      {focused.length ? focused.map((id) => { const p = lg.players[id]; return <div key={id} className="gg-inj lab"><PosBadge pos={p.pos} /><b><PlayerName p={p} /></b><span className="dim">{TRAINING[t.training.assignments[id]]?.name}</span><button className="tiny ghost" onClick={() => labRemove(id)} aria-label={`Remove ${p.name} from the lab`}>✕</button></div>; }) : <div className="gg-lab-empty">Nobody in focus yet. Pick a player below.</div>}
      {focused.length < FOCUS_SLOTS && (<>
        <div className="rk-lab-pick"><span>{FOCUS_SLOTS - focused.length} slot{FOCUS_SLOTS - focused.length === 1 ? "" : "s"} open</span><span className="rk-sort"><small>Sort</small>{[["pos", "Position"], ["growth", "Growth"]].map(([k, l]) => <button key={k} className={labSort === k ? "on" : ""} aria-pressed={labSort === k} onClick={() => setLabSort(k)}>{l}</button>)}</span></div>
        <Select value={labPick} onChange={(e) => labAdd(e.target.value)} aria-label="Add a development focus player" placeholder="Choose a player" style={{ width: "100%" }}>
          <option value="">Choose a player</option>
          {labSort === "growth"
            ? roster.filter((p) => !focused.includes(p.id)).sort((a, b) => (growth.get(b.id) ?? -99) - (growth.get(a.id) ?? -99) || b.ovr - a.ovr).map(labOption)
            : ["C", "LW", "RW", "LD", "RD", "G"].map((pos) => <optgroup key={pos} label={pos}>{roster.filter((p) => p.pos === pos && !focused.includes(p.id)).sort((a, b) => (growth.get(b.id) ?? -99) - (growth.get(a.id) ?? -99) || b.ovr - a.ovr).map(labOption)}</optgroup>)}
        </Select>
      </>)}
    </section>
  );

  // Roster health: a short roster in the off-season counts against you before injuries do.
  const short = (lg.phase === "resign" || lg.phase === "freeagency") && signedNext < MAX_ROSTER;

  // ---- The game's buttons, on the broadcast card (the same act functions as the top bar's) ----
  const gameBtns = [];
  if (hasGame) {
    if (series) { if (act.playPlayoffLive) gameBtns.push({ label: `Play game ${series.games.length + 1}`, onClick: act.playPlayoffLive, go: 1 }); if (act.simPlayoffDay) gameBtns.push({ label: "Sim day", onClick: act.simPlayoffDay }); }
    else if (lg.phase === "preseason") { if (act.startSeason) gameBtns.push({ label: "Start season", onClick: act.startSeason, go: 1 }); }
    else if (deadline) gameBtns.push({ label: "Open deadline day", onClick: () => go("deadline"), go: 1 });
    else if (today) { if (act.playLive) gameBtns.push({ label: "Play", onClick: act.playLive, go: 1 }); if (act.simDay) gameBtns.push({ label: "Sim game", onClick: act.simDay }); }
    else if (act.simDay) gameBtns.push({ label: "Sim to game day", onClick: act.simDay, go: 1 });
  }
  const line = prob == null ? null : Math.abs(prob - 0.5) < 0.03 ? "Pick 'em" : `${prob >= 0.5 ? t.abbr : opp.abbr} ${Math.round(Math.max(prob, 1 - prob) * 100)}%`;
  const eyebrow = hasGame ? [cardLabel.replace(/^REGULAR SEASON · /, ""), prime, opp.div === t.div && !series ? "Division" : null, rival ? "Rivalry" : null, kickoff].filter(Boolean) : [];
  const storyTeam = stories[0] ? teamOfStory(stories[0]) : null;
  const top = stories[0] ? { team: storyTeam, head: stripEmoji((stories[0].text || stories[0].title || "").split(". ")[0]) } : null;
  const todo = [...(deadline ? [{ key: "dl", tone: "urgent", title: "Trade deadline day", sub: "Make your moves before 3:00 PM ET.", onOpen: () => go("deadline"), actions: [] }] : []), ...attention];
  const L1 = (() => { try { const gl = gameLines(lg, t); return { f: gl.F[0].map((id) => lg.players[id]).filter(Boolean), d: gl.D[0].map((id) => lg.players[id]).filter(Boolean), g: lg.players[gl.G[0]] }; } catch { return null; } })();
  const plan = t.autoPlan !== false ? null : t.gamePlan;
  const injN = lg.settings?.injuries === false ? 0 : injured.length;

  const todoCard = (n = 3) => (
    <section className="rk-bc-card">
      <div className="rk-bc-h">To do {todo.length > 0 && <span className="rk-bc-n">{todo.length}</span>}</div>
      {todo.length ? todo.slice(0, n).map((it) => (
        <button key={it.key} className="rk-b rk-bc-todo" onClick={it.onOpen}><i style={{ background: TONE_C[it.tone] }} /><span><b>{stripEmoji(it.title)}</b>{phone && it.sub && <small>{it.sub}</small>}</span><Icon name="chevron" size={16} /></button>
      )) : <div className="rk-hm-quiet good">All set: nothing needs you.</div>}
      <div className="rk-bc-links">{todo.length > n && <button className="rk-b rk-link" onClick={() => setInboxOpen(true)}>See all {todo.length}</button>}<button className="rk-b rk-link" onClick={() => setLabOpen(true)}>Development focus</button></div>
    </section>
  );
  const planCard = (
    <section className="rk-bc-card">
      <div className="rk-bc-h">Game plan</div>
      <div className="rk-bc-plan">
        <span>{plan ? `${plan.forecheck || "balanced"} forecheck · ${plan.neutral === "trap" ? "trap" : "balanced neutral zone"} · ${plan.attack || "balanced"} attack` : "Your coaches adapt the system to each opponent."}</span>
        {L1 && <><small>TOP LINE</small><b>{L1.f.map((p) => p.name.split(" ").at(-1)).join(" – ") || "—"}</b><small>TOP PAIR · STARTER</small><b>{L1.d.map((p) => p.name.split(" ").at(-1)).join(" – ") || "—"}{L1.g ? ` · ${L1.g.name.split(" ").at(-1)}` : ""}</b></>}
      </div>
      <div className="rk-bc-links"><button className="rk-b rk-link" onClick={() => go("lines", "lines")}>Lines</button>{hasGame && <button className="rk-b rk-link" onClick={() => setPrepOpen(true)}>Game prep</button>}<button className="rk-b rk-link" onClick={() => go("coaching", "plan")}>System</button></div>
    </section>
  );
  const storyCard = (
    <section className="rk-bc-card">
      <div className="rk-bc-h">Top story</div>
      {top ? <button className="rk-b rk-bc-story" onClick={() => go("activity")}>{top.team && <TeamBadge team={top.team} size={40} decorative />}<b>{top.head}</b></button> : <div className="rk-hm-quiet">Quiet around the league so far. Stories arrive after every game day.</div>}
      {top && <div className="rk-bc-links"><button className="rk-b rk-link" onClick={() => go("activity")}>All news</button></div>}
    </section>
  );
  const needsCard = <NeedsCard lg={lg} t={t} go={go} openPlayer={openPlayer} />;
  const statLine = [["RECORD", rec(t.rec)], ["CAP SPACE", money(room)], [offseason ? "SIGNED" : "ROSTER", `${signedNext}/${MAX_ROSTER}`]];
  const phaseHero = !hasGame && (
    <section className="rk-ph" style={{ "--c1": t.colors[0], "--c2": t.colors[1] || "#111827" }}>
      <TeamBadge team={t} size={phone ? 64 : 120} decorative className="rk-ph-mark" />
      <div className="rk-ph-txt">
        <small>{t.city.toUpperCase()} {t.name.toUpperCase()} · {lg.year}-{String(lg.year + 1).slice(2)}</small>
        <div className="rk-ph-title">{heroTitle(lg, t)}</div>
        <div className="rk-ph-stats">{statLine.map(([k, v]) => <div key={k}><b>{v}</b><small>{k}</small></div>)}</div>
        {!phone && primary.length > 0 && <div className="rk-ph-btns">{primary.map((b, i) => <button key={b.label} className={`rk-b rk-bc-btn${i === 0 ? " go" : ""}`} onClick={b.onClick}>{stripEmoji(b.label)}</button>)}</div>}
      </div>
    </section>
  );

  const dialogs = (
    <>
      {inboxOpen && <NeedsAttention items={todo} onClose={() => setInboxOpen(false)} />}
      {prepOpen && <GamePrep onClose={() => setPrepOpen(false)} onPlay={lg.phase === "playoffs" ? act.playPlayoffLive : act.playLive} onSim={lg.phase === "playoffs" ? act.simPlayoffDay : act.simDay} />}
      {labOpen && <Sheet title="Development focus" onClose={() => setLabOpen(false)}>{lab}</Sheet>}
    </>
  );

  if (phone) {
    return (
      <div className="rk-ph-home">
        {hasGame ? (
          <section className="rk-pbc" style={{ "--a": awayT.colors[0], "--h": homeT.colors[0] }}>
            <div className="rk-pbc-eye">{eyebrow.slice(0, 2).join(" · ")}</div>
            <div className="rk-pbc-row">
              {[awayT, null, homeT].map((x, i) => x ? <div key={i} className="rk-pbc-team"><TeamBadge team={x} size={64} decorative /><b>{x.name}</b><span>{rec(x.rec)}</span></div>
                : <div key={i} className="rk-pbc-mid"><span>{series ? "" : kickoff.split(" · ")[0]}</span><b>{series ? kickoff : kickoff.split(" · ")[1] || "@"}</b>{line && <em>{line}</em>}</div>)}
            </div>
            <div className="rk-pbc-stars">{[awayT, homeT].map((x) => { const p = topPlayer(lg, x); return p ? <button key={x.id} className="rk-b" onClick={() => openPlayer?.(p.id)}><b>{p.name}</b><span>{p.pos} · {p.ovr} OVR · {seasonLine(p)}</span></button> : null; })}</div>
          </section>
        ) : phaseHero}
        {todoCard(3)}
        <div className="rk-tiles">
          <button className="rk-b rk-tile2" onClick={() => go("roster", "injured")}><Icon name="operations" /><b>Injuries</b><span style={{ color: injN ? "#f97316" : undefined }}>{lg.settings?.injuries === false ? "Turned off" : injN ? `${injN} out${starters.length ? ` · ${starters.length} key` : ""}` : "All healthy"}</span></button>
          <button className="rk-b rk-tile2" onClick={() => setLabOpen(true)}><Icon name="stats" /><b>Development</b><span>{focused.length ? `${focused.length} of ${FOCUS_SLOTS} in focus` : "Not set"}</span></button>
          <button className="rk-b rk-tile2 wide" onClick={() => go("standings")}><Icon name="standings" /><b>Standings</b><span>{ORD(divRank)} in the {t.div}{odds != null ? ` · ${Math.round(odds * 100)}% playoff odds` : ""}</span><Icon name="chevron" size={16} /></button>
          <button className="rk-b rk-tile2 wide" onClick={() => go("frontoffice", "contracts")}><Icon name="frontoffice" /><b>Cap space {money(room)}</b><span>{expiring ? `${expiring} expiring` : "No deals expiring"}</span><Icon name="chevron" size={16} /></button>
        </div>
        {!hasGame && needsCard}
        {!hasGame && <BuildYour23 foot={false} onPick={(pos) => { faStart.pos = pos; go("freeagency"); }} />}
        {storyCard}
        {dialogs}
      </div>
    );
  }

  return (
    <div className="rk-bc-home">
      {hasGame ? (
        <section className={`rk-bc${prime ? " prime" : ""}`} style={{ "--a": awayT.colors[0], "--h": homeT.colors[0] }} aria-label={`${awayT.city} ${awayT.name} at ${homeT.city} ${homeT.name}`}>
          <div className="rk-bc-eye">{eyebrow.join(" · ").toUpperCase()}</div>
          <BcSide lg={lg} team={awayT} road onPlayer={openPlayer} />
          <BcSide lg={lg} team={homeT} onPlayer={openPlayer} right />
          <div className="rk-bc-foot">
            {venue && <span className="rk-bc-tag">{venue}</span>}
            {line && <span className="rk-bc-tag">{line}</span>}
            {gameBtns.map((b) => <button key={b.label} className={`rk-b rk-bc-btn${b.go ? " go" : ""}`} onClick={b.onClick}>{b.label}</button>)}
          </div>
        </section>
      ) : phaseHero}
      {hasGame ? <div className="rk-bc-cards">{todoCard(3)}{planCard}{storyCard}</div>
        : <><div className="rk-bc-cards">{needsCard}{todoCard(4)}{PhaseCard({ lg, t, go, slot, series }) || storyCard}</div>
          <BuildYour23 onPick={(pos) => { faStart.pos = pos; go("freeagency"); }} /></>}
      {dialogs}
    </div>
  );
}

const stripEmoji = (s) => String(s || "").replace(/^[\s\p{Extended_Pictographic}️‍]+/u, "").trim();
const seasonLine = (p) => (isGoalie(p.pos) ? (p.stats?.gp ? `${gaa(p.stats).toFixed(2)} GAA · ${savePct(p.stats).toFixed(3).slice(1)}` : "no starts yet") : p.stats?.gp ? `${p.stats.g}-${p.stats.a}-${p.stats.pts}` : "no games yet");

// One club on the broadcast card: its name and record, and its star in the club's sweater.
function BcSide({ lg, team, road, right, onPlayer }) {
  const p = topPlayer(lg, team);
  const kit = { ...team, uniform: { ...(team.uniform || {}), home: !road } };
  return (
    <div className={`rk-bc-side${right ? " r" : ""}`}>
      <div className="rk-bc-club">
        <TeamBadge team={team} size={72} decorative />
        <small>{team.city.toUpperCase()}</small>
        <div className="rk-bc-name">{team.name.toUpperCase()}</div>
        <span>{rec(team.rec)}</span>
        {p && <button className="rk-b rk-bc-star" onClick={() => onPlayer?.(p.id)}><b>{p.name.toUpperCase()}</b><span>{p.pos} · {p.ovr} OVR</span><em>{seasonLine(p)}</em></button>}
      </div>
      <div className="rk-bc-art">{p ? <Headshot p={p} team={kit} size={190} decorative /> : null}</div>
    </div>
  );
}

// Biggest needs: every row says why; with no real hole, the weakest spots by their best player.
function NeedsCard({ lg, t, go, openPlayer }) {
  const b = offseasonBoard(lg);
  const nav = (to) => (Array.isArray(to) ? go(to[0], to[1]) : to?.player != null && openPlayer?.(to.player));
  let rows = b.needs.map((n) => ({ k: n.pos, pos: n.pos, name: n.name, why: n.why || `${n.have} healthy of ${n.target}`, to: n.to }));
  if (!rows.length) {
    const ps = t.roster.map((id) => lg.players[id]).filter(Boolean);
    rows = ["C", "LW", "RW", "LD", "RD", "G"].map((pos) => [pos, ps.filter((p) => p.pos === pos).sort((a, b2) => b2.ovr - a.ovr)[0]]).filter(([, p]) => p).sort((a, b2) => a[1].ovr - b2[1].ovr).slice(0, 3)
      .map(([pos, p]) => ({ k: pos, pos, name: NEED_NAME[pos], why: `${p.name} rated ${p.ovr}`, to: { player: p.id } }));
  }
  return (
    <section className="rk-bc-card">
      <div className="rk-bc-h">Biggest needs</div>
      {rows.map((n) => <button key={n.k} className="rk-b rk-bc-need" onClick={() => nav(n.to)}><PosBadge pos={n.pos} /><b>{n.name}</b><span>{n.why}</span></button>)}
    </section>
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

// The phase in numbers: the playoff run, the draft, re-signing or free agency.
function PhaseCard({ lg, t, go, slot, series }) {
  const row = (k, v) => <div key={k} className="rk-phase-row"><small>{k}</small><b>{v}</b></div>;
  let head = null, rows = [], links = [];
  if (lg.phase === "regular" && seasonOver(lg)) {
    const conf = lg.teams.filter((x) => x.conf === t.conf).sort((a, b) => b.rec.pts - a.rec.pts || b.rec.rw - a.rec.rw), rank = conf.findIndex((x) => x.id === t.id) + 1;
    head = "Regular season complete"; rows = [row("Points", `${t.rec.pts} pts`), row("Finish", `${ORD(rank)} in the ${t.conf}`), row("Playoffs", rank <= 8 ? "Qualified" : "Missed")];
  } else if (lg.phase === "playoffs") {
    const po = lg.playoffs, champ = po?.champion != null ? lg.teams[po.champion] : null;
    const mine = (po?.rounds || []).flatMap((r, i) => r.filter((x) => x.top === t.id || x.bot === t.id).map((x) => ({ ...x, round: i })));
    const last = mine.at(-1), out = last && last.winner != null && last.winner !== t.id;
    head = `Stanley Cup playoffs · ${champ ? "complete" : ROUND_NAMES[po.round] || ""}`;
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
    head = `${lg.draft?.year} Entry Draft${done ? " · complete" : atCombine(lg) ? " · combine" : ""}`;
    rows = done ? [row("Your class", `${taken.length} player${taken.length === 1 ? "" : "s"}${grade ? ` · analysts say ${grade}` : ""}`), ...(taken[0] ? [row("First pick", `${taken[0].name} (#${taken[0].draft.pick})`)] : [])]
      : [row("Your next pick", slot ? `#${slot.overall} overall (round ${slot.round})` : "No picks left"), row("Picks this year", picks)];
  } else if (lg.phase === "resign") {
    const exp = expiringPlayers(lg, t).sort((a, b) => b.ovr - a.ovr);
    head = `Re-sign window · ${exp.length} expiring`;
    rows = [row("Cap space next year", money(capSpace(lg, t))), ...exp.slice(0, 3).map((p) => row(`${p.name} (${p.pos} ${p.ovr})`, p.willing === false ? "testing the market" : `asks ${money(resignAsk(lg, p).aav)}`))];
  } else if (lg.phase === "freeagency") {
    const best = (lg.freeAgents || []).map((id) => lg.players[id]).filter(Boolean).sort((a, b) => b.ovr - a.ovr).slice(0, 2);
    head = `Free agency · day ${lg.fa?.day ?? 0} of ${FA_DAYS}`;
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
  const urgent = items.filter((i) => i.tone === "urgent").length;
  return (
    <Sheet title="Needs attention" wide onClose={onClose} className="rk-inbox-sheet">
        <div className="rk-dsub">{items.length ? `${items.length} item${items.length === 1 ? "" : "s"}${urgent ? ` · ${urgent} urgent` : ""}` : "All caught up"}</div>
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
    </Sheet>
  );
}
