import {decisionInterrupt} from './engine/decisionInterrupts.js';
import SeriesPaper from "./ui/SeriesPaper.jsx";
import { ensurePulse, repTier, moraleLabel, tierColor } from "./engine/clubPulse.js";
import { capForYear } from "./engine/constants.js";
import { capYear } from "./engine/roster.js";
import { lastDay } from "./engine/schedule.js";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameCtx, TeamBadge, recordStr, money } from "./ui/common.jsx";
import StanleyCup3D from "./ui/StanleyCup3D.jsx";
import ActivityPage from "./ui/ActivityPage.jsx";
import CommandPalette from "./ui/CommandPalette.jsx";
import TitleScreen from "./ui/TitleScreen.jsx";
import Dashboard from "./ui/Dashboard.jsx";
import RosterPage from "./ui/RosterPage.jsx";
import LinesPage from "./ui/LinesPage.jsx";
import SchedulePage from "./ui/SchedulePage.jsx";
import StandingsPage from "./ui/StandingsPage.jsx";
import StatsPage from "./ui/StatsPage.jsx";
import PlayoffsPage from "./ui/PlayoffsPage.jsx";
import TradePage from "./ui/TradePage.jsx";
import FreeAgencyPage from "./ui/FreeAgencyPage.jsx";
import DraftPage from "./ui/DraftPage.jsx";
import TradeBlockPage from "./ui/TradeBlockPage.jsx";
import DeadlinePage, { DeadlineTicker } from "./ui/DeadlinePage.jsx";
import { deadlinePending, deadlineActive, startDeadline, userOffers } from "./engine/market.js";
import GamePlanPage from "./ui/GamePlanPage.jsx";
import HockeyOperationsPage from "./ui/HockeyOperationsPage.jsx";
import FrontOfficePage from "./ui/FrontOfficePage.jsx";
import TrophyRoom from "./ui/TrophyRoom.jsx";
import RecordBookPage from "./ui/RecordBookPage.jsx";
import ErrorBoundary from "./ui/ErrorBoundary.jsx";
import LeaguePage from "./ui/LeaguePage.jsx";
import SettingsPage from "./ui/SettingsPage.jsx";
import LiveGame from "./ui/LiveGame.jsx";
import PlayerModal from "./ui/PlayerModal.jsx";
import TeamModal from "./ui/TeamModal.jsx";
import BoxScoreModal from "./ui/BoxScoreModal.jsx";
import * as L from "./engine/league.js";
import { PHASES, FA_DAYS } from "./engine/constants.js";
import { dayToDate } from "./engine/schedule.js";
import { capSpace, rosterIssues } from "./engine/roster.js";
import { automaticallyHandleRoster } from "./engine/autoRoster.js";
import { simPlayoffDay, userSeries, nextGame } from "./engine/playoffs.js";
import { simDraftToUser, draftDone, currentSlot } from "./engine/draft.js";
import { atCombine, openDraftFloor } from "./engine/scouting.js";
import { simFADay } from "./engine/offseason.js";
import { cloudSave } from "./platform.js";
import ConfirmModal from "./ui/ConfirmModal.jsx";
import { LinesHub, CoachingHub, FrontOfficeHub, TradeHub, LeagueHub } from "./ui/hubs.jsx";

const NAV = [
  {id:"dashboard",label:"Home",short:"Home"},{id:"lines",label:"Lines & Roster",short:"Lines"},{id:"schedule",label:"Schedule",short:"Schedule"},
  {id:"stats",label:"Stats",short:"Stats"},{id:"draft",label:"Draft & Scouting",short:"Draft"},{id:"coaching",label:"Coaching",short:"Coaching"},
  {id:"frontoffice",label:"Front Office",short:"Front Office"},{id:"trade",label:"Trade & Market",short:"Trade"},
  {id:"legacy",label:"Legacy Hall",short:"Legacy Hall"},{id:"records",label:"Record Book",short:"Records"},{id:"league",label:"League",short:"League"},
];
// Old screen ids (used by the home screen, search and saved links) map onto the new hubs.
const ALIAS = { roster:["lines","roster"], standings:["league","standings"], playoffs:["league","playoffs"], analysis:["coaching","plan"],
  operations:["frontoffice","ops"], block:["trade","block"], freeagency:["trade","fa"], deadline:["trade","deadline"], trophies:["legacy"], trade:["trade","trade"] };

const CLOUD_EVERY_MS = 60000;

export default function App({ resume = false }) {
  const leagueRef = useRef(null);
  if (resume && !leagueRef.current) leagueRef.current = L.loadLeague();
  const [, setRev] = useState(0);
  const [screen, setScreen] = useState(leagueRef.current ? "game" : "title");
  const [confirmReq, setConfirmReq] = useState(null);
  const cloudRef = useRef({ last: 0, timer: null, phase: null, busy: false });
  const [tab, setTab] = useState("dashboard");
  const [sub, setSubState] = useState({});
  const setSub = useCallback((t, k) => setSubState((prev) => (prev[t] === k ? prev : { ...prev, [t]: k })), []);
  // go("roster") opens the Lines hub on its Roster section, go("league","tx") the League hub on transactions, and so on.
  const go = useCallback((id, k) => { const [t, kk] = ALIAS[id] || [id, k]; setTab(t); if (kk || k) setSub(t, kk || k); }, [setSub]);
  const [searchOpen,setSearchOpen]=useState(false);
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);
  const [live, setLive] = useState(leagueRef.current?.activeGame?.spec || null);
  const [tradeSeed, setTradeSeed] = useState(null);
  const saveTimer = useRef(null);
  const cancelRef = useRef(false);
  const league = leagueRef.current;

  const showToast = useCallback((msg, ms = 3200) => {
    setToast(msg);
    clearTimeout(showToast.t);
    showToast.t = setTimeout(() => setToast(null), ms);
  }, []);

  // Cloud backup (claude.ai only): at most once a minute, plus at every phase change.
  const syncCloud = useCallback((force = false) => {
    const c = cloudRef.current;
    const lg = leagueRef.current;
    if (!lg) return;
    const phaseChanged = c.phase !== null && c.phase !== lg.phase;
    c.phase = lg.phase;
    const wait = force || phaseChanged ? 0 : Math.max(0, CLOUD_EVERY_MS - (Date.now() - c.last));
    if (c.timer && wait > 0) return;
    clearTimeout(c.timer);
    c.timer = setTimeout(async () => {
      c.timer = null;
      if (c.busy || !leagueRef.current) return;
      c.busy = true;
      c.last = Date.now();
      await cloudSave(leagueRef.current);
      c.busy = false;
    }, wait);
  }, []);

  const flushSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = null;
    if (!leagueRef.current) return;
    const ok = L.saveLeague(leagueRef.current);
    if (!ok && !cloudRef.current.last) showToast("⚠️ This browser didn't keep your save. Use Settings → Export league to keep a copy.", 6000);
    syncCloud();
  }, [showToast, syncCloud]);

  // Throttled autosave: at most one write per 400ms, never more than 400ms behind.
  // Callers that change the league many times a second (the deadline clock) pass a longer
  // delay and call save() when they stop; leaving the page still flushes a pending save.
  const commit = useCallback((ms = 400) => {
    setRev((r) => r + 1);
    if (!saveTimer.current) saveTimer.current = setTimeout(flushSave, ms);
  }, [flushSave]);

  useEffect(() => {
    window.__rinkgm = { flush: () => (saveTimer.current ? flushSave() : null), inGame: () => !!leagueRef.current };
    const flush = () => {
      if (saveTimer.current) flushSave();
      if (leagueRef.current && Date.now() - cloudRef.current.last > 5000) syncCloud(true);
    };
    const onHide = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [flushSave, syncCloud]);

  const startLeague = (lg) => {
    leagueRef.current = lg;
    setLive(lg.activeGame?.spec || null);
    cloudRef.current.phase = lg.phase;
    setScreen("game");
    setTab("dashboard");
    commit();
    syncCloud(true);
  };

  // In-page confirmation (the claude.ai viewer doesn't show window.confirm).
  const ask = useCallback((opts) => new Promise((resolve) => setConfirmReq({ ...opts, resolve })), []);

  // Run a long simulation in small chunks so the page stays responsive.
  const runChunked = useCallback((label, step, done) => {
    cancelRef.current = false;
    setBusy({ label: label() });
    const tick = () => {
      const t0 = performance.now();
      let more = true;
      try {
        while (more && performance.now() - t0 < 45) { more = step(); const notice=more && decisionInterrupt(leagueRef.current); if(notice){showToast(notice,7000);more=false;} }
      } catch (e) {
        console.error("Simulation step failed", e);
        showToast("The simulation stopped because of an error. Your league is saved; try again or reload.", 7000);
        more = false;
      }
      setBusy({ label: label(), cancel: true });
      if (more && !cancelRef.current) setTimeout(tick, 0);
      else {
        setBusy(null);
        done?.();
        commit();
      }
    };
    setTimeout(tick, 20);
  }, [commit, showToast]);

  useEffect(()=>{const key=e=>{if((e.metaKey || e.ctrlKey) && e.key.toLowerCase()==="k" && screen==="game" && !live){e.preventDefault();setSearchOpen(v=>!v);}};window.addEventListener("keydown",key);return ()=>window.removeEventListener("keydown",key);},[screen,live]);
  // A new screen starts at the top (matters most on phones).
  useEffect(() => {
    try {
      window.scrollTo(0, 0);
    } catch {
      /* no window */
    }
  }, [tab, live, screen]);

  useEffect(() => {
    document.documentElement.style.setProperty("--team", league ? league.teams[league.userTid].colors[0] : "#4ea1ff");
  });

  const ctx = useMemo(
    () => ({
      league: leagueRef.current,
      commit,
      toast: showToast,
      go,
      openPlayer: (id) => setModal({ type: "player", id }),
      openTeam: (tid) => setModal({ type: "team", tid }),
      openBox: (game) => setModal({ type: "box", game }),
      closeModal: () => setModal(null),
      proposeTradeFor: (pid, tid) => {
        setTradeSeed({ pid, tid, n: Date.now() });
        setModal(null);
        go("trade");
      },
      // Open an AI offer in the Trade Center so the user can change it.
      counterOffer: (o) => {
        setTradeSeed({ tid: o.tid, give: o.give, get: o.get, givePicks: o.givePicks, getPicks: o.getPicks, n: Date.now() });
        setModal(null);
        go("trade");
      },
      clearTradeSeed: () => setTradeSeed(null),
      save: () => saveTimer.current && flushSave(),
      ask,
      replaceLeague: (lg) => startLeague(lg),
      newGame: () => {
        if (saveTimer.current) flushSave();
        leagueRef.current = null;
        setScreen("title");
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leagueRef.current, commit, showToast, ask, flushSave]
  );

  const confirmEl = confirmReq && (
    <ConfirmModal
      req={confirmReq}
      onAnswer={(ok) => {
        confirmReq.resolve(ok);
        setConfirmReq(null);
      }}
    />
  );

  if (screen === "title" || !league) {
    return (
      <>
        <TitleScreen onStart={startLeague} ask={ask} />
        {confirmEl}
      </>
    );
  }

  const user = league.teams[league.userTid];

  // ---------- Phase actions ----------
  const openDeadline = () => {
    startDeadline(league);
    go("deadline");
    commit();
  };
  const blockers = () => {
    if(league.career?.fired){showToast("Accept your next GM job in Hockey Operations before continuing.",5000);go("operations");return true;}
    if (deadlinePending(league)) {
      const first = !deadlineActive(league);
      openDeadline();
      if (first) showToast("It's Trade Deadline Day! Make your moves before 3:00 PM ET.", 5000);
      return true;
    }
    let issues = rosterIssues(league, user).filter((x) => !x.startsWith("Need"));
    if (issues.length && league.settings?.autoRoster !== false) {
      const r = automaticallyHandleRoster(league, user, { allowWaivers: true });
      if (r.moved.length || r.claimed.length) showToast(`🤖 ${r.msg}`, 8000);
      issues = rosterIssues(league, user).filter((x) => !x.startsWith("Need"));
      if (!issues.length) commit();
    }
    if (issues.length) {
      showToast(issues[0], 5000);
      go("roster");
      return true;
    }
    return false;
  };

  const act = {
    startSeason: () => {
      if (blockers()) return;
      L.startRegularSeason(league);
      commit();
    },
    simDay: () => {
      if (blockers()) return;
      L.simDay(league);
      commit();
    },
    simDays: (n, label) => {
      if (blockers()) return;
      let i = 0;
      runChunked(
        () => `${label} — ${dayToDate(league.year, league.day, league.scheduleStart)}`,
        () => {
          if (league.phase !== "regular" || L.seasonOver(league) || i >= n || deadlinePending(league)) return false;
          L.simDay(league);
          i++;
          return true;
        },
        () => deadlinePending(league) && blockers()
      );
    },
    simToDeadline: () => {
      if (blockers()) return;
      runChunked(
        () => `Simulating to the trade deadline — ${dayToDate(league.year, league.day, league.scheduleStart)}`,
        () => {
          if (league.phase !== "regular" || L.seasonOver(league) || deadlinePending(league) || league.day > league.deadlineDay) return false;
          L.simDay(league);
          return true;
        },
        () => deadlinePending(league) && blockers()
      );
    },
    simToEnd: () => {
      if (blockers()) return;
      runChunked(
        () => `Simulating the regular season — ${dayToDate(league.year, league.day, league.scheduleStart)}`,
        () => {
          if (league.phase !== "regular" || L.seasonOver(league) || deadlinePending(league)) return false;
          L.simDay(league);
          return true;
        },
        () => deadlinePending(league) && blockers()
      );
    },
    playLive: () => {
      if (blockers()) return;
      const g = L.userGameOnDay(league);
      if (!g) return;
      L.simDay(league, { holdUserGame: true });
      setLive({ kind: "regular", gid: g.id, home: g.h, away: g.a });
      commit();
    },
    startPlayoffs: () => {
      L.endRegularSeason(league);
      go("playoffs");
      commit();
    },
    simPlayoffDay: () => {
      simPlayoffDay(league);
      commit();
    },
    simPlayoffRound: () => {
      const r = league.playoffs.round;
      runChunked(
        () => "Simulating the playoffs…",
        () => league.playoffs.champion == null && league.playoffs.round === r && simPlayoffDay(league)
      );
    },
    simPlayoffsAll: () => {
      runChunked(
        () => "Simulating the playoffs…",
        () => { if (league.playoffs.champion != null || league.playoffs.papers?.some((p) => !p.seen)) return false; simPlayoffDay(league); return !league.playoffs.papers?.some((p) => !p.seen); }
      );
    },
    playPlayoffLive: () => {
      const s = userSeries(league);
      if (!s) return;
      const g = nextGame(league, s);
      setLive({ kind: "playoff", series: s, home: g.home, away: g.away });
    },
    toDraft: () => {
      L.finishPlayoffs(league);
      setTab("draft");
      commit();
    },
    startDraft: () => {
      openDraftFloor(league);
      setTab("draft");
      commit();
    },
    simToMyPick: () => {
      simDraftToUser(league);
      commit();
    },
    autoDraft: () => {
      simDraftToUser(league, { all: true });
      commit();
    },
    toResign: () => {
      L.completeDraft(league);
      go("freeagency");
      commit();
    },
    toFA: () => {
      L.goToFreeAgency(league);
      go("freeagency");
      commit();
    },
    faDay: () => {
      simFADay(league);
      commit();
    },
    faToEnd: () => {
      while (league.fa && league.fa.day < FA_DAYS) simFADay(league);
      commit();
    },
    nextSeason: () => {
      if(league.career?.fired){showToast("Accept your next GM job in Hockey Operations.",5000);go("operations");return;}
      runChunked(
        () => "Aging players and building the new season…",
        () => {
          while (league.fa && league.fa.day < FA_DAYS) simFADay(league);
          L.beginNextSeason(league);
          return false;
        },
        () => setTab("dashboard")
      );
    },
  };

  const onLiveDone = () => {
    setLive(null);
    commit();
  };

  // ---------- Top bar ----------

  const actions = [];
  if (league.phase === "preseason") actions.push(<button key="s" className="primary" onClick={act.startSeason}>Start Season ▶</button>);
  if (league.phase === "regular") {
    if (L.seasonOver(league)) actions.push(<button key="po" className="primary" onClick={act.startPlayoffs}>Start Playoffs 🏆</button>);
    else if (deadlinePending(league)) {
      actions.push(<button key="dd" className="primary" onClick={openDeadline}>⏰ Trade Deadline Day</button>);
    } else {
      const ug = L.userGameOnDay(league);
      if (ug) {
        const opp = league.teams[ug.h === user.id ? ug.a : ug.h];
        actions.push(<button key="live" className="primary" onClick={act.playLive}>▶ Play Live {ug.h === user.id ? "vs" : "@"} {opp.abbr}</button>);
        actions.push(<button key="sg" onClick={act.simDay}>Sim Game</button>);
      } else actions.push(<button key="sd" onClick={act.simDay}>Sim Day</button>);
      actions.push(<button key="sw" onClick={() => act.simDays(7, "Simulating a week")}>Week</button>);
      if (league.day < league.deadlineDay) actions.push(<button key="dl" onClick={act.simToDeadline} title="Sim to Trade Deadline Day">To Deadline</button>);
      actions.push(<button key="se" onClick={act.simToEnd}>To End</button>);
    }
  }
  if (league.phase === "playoffs") {
    if (league.playoffs.champion != null) actions.push(<button key="d" className="primary" onClick={act.toDraft}>Go to the Draft →</button>);
    else {
      if (userSeries(league)) actions.push(<button key="pl" className="primary" onClick={act.playPlayoffLive}>▶ Play Live</button>);
      actions.push(<button key="pd" onClick={act.simPlayoffDay}>Sim Day</button>);
      actions.push(<button key="pr" onClick={act.simPlayoffRound}>Sim Round</button>);
      actions.push(<button key="pa" onClick={act.simPlayoffsAll}>Sim All</button>);
    }
  }
  if (league.phase === "draft") {
    if (atCombine(league)) actions.push(<button key="sd" className="primary" onClick={act.startDraft}>Start the Draft →</button>);
    else if (draftDone(league)) actions.push(<button key="rs" className="primary" onClick={act.toResign}>Continue to Re-signing →</button>);
    else {
      const slot = currentSlot(league);
      if (slot.owner !== user.id) actions.push(<button key="mp" className="primary" onClick={act.simToMyPick}>Sim to My Pick</button>);
      actions.push(<button key="ad" onClick={act.autoDraft}>Auto-Draft Rest</button>);
    }
  }
  if (league.phase === "resign") actions.push(<button key="fa" className="primary" onClick={act.toFA}>Proceed to Free Agency →</button>);
  if (league.phase === "freeagency") {
    if (league.fa.day < FA_DAYS) {
      actions.push(<button key="fd" onClick={act.faDay}>Next Day</button>);
      actions.push(<button key="fe" onClick={act.faToEnd}>Sim to End</button>);
    }
    actions.push(<button key="ns" className="primary" onClick={act.nextSeason}>Start {league.year + 1}-{String(league.year + 2).slice(2)} Season →</button>);
  }

  const space = capSpace(league, user);
  const badgeFor = (id) => {
    if (id === "draft" && league.phase === "draft") return "LIVE";
    if (id === "trade") { if (deadlinePending(league)) return "LIVE"; if (league.phase === "resign" || league.phase === "freeagency") return "OPEN"; const n = userOffers(league).length; return n ? String(n) : null; }
    if (id === "league" && league.phase === "playoffs") return "ON";
    return null;
  };

  const gm = ensurePulse(league);
  const rep = repTier(gm.rep);
  const capCeiling = capForYear(capYear(league));
  const unread = Math.max(0, league.inbox.length - (league.settings.activityReadCount || 0));
  const seasonLabel = `${league.year}-${String(league.year + 1).slice(2)}`;
  const phasePill = league.phase === "regular" ? `Wk ${Math.floor(league.day / 7) + 1}/${Math.floor(lastDay(league.schedule) / 7) + 1}` : league.phase === "playoffs" ? (league.playoffs?.champion != null ? "Cup awarded" : `Playoffs R${(league.playoffs?.round ?? 0) + 1}`) : league.phase === "draft" ? (atCombine(league) ? "Combine" : "Draft") : league.phase === "resign" ? "Re-sign" : league.phase === "freeagency" ? `FA Day ${league.fa?.day ?? 0}` : "Preseason";

  return (
    <GameCtx.Provider value={ctx}>
      <div className="app" data-density={league.settings.uiDensity || "compact"} data-text-size={league.settings.textSize || "standard"} data-motion={league.settings.reducedMotion ? "reduced" : "auto"}>
        <header className="gg-head">
          <div className="gg-id">
            <TeamBadge team={user} size={30} className="gg-badge"/>
            <div>
              <div className="gg-name">{user.city} {user.name}</div>
              <div className="gg-status">
                {seasonLabel} • <span aria-label={`Record ${recordStr(user.rec)}, ${user.rec.pts} points`}>{recordStr(user.rec)}</span> • <b>{user.rec.pts}</b> PTS • Cap <span style={{color:space<0?"#ef4444":"#22c55e",fontWeight:700}}>{money(space)}</span>/{money(capCeiling)} • SP:<b className="gg-sp">{gm.sp}</b> • MOR:<span style={{color:tierColor(user.morale),fontWeight:700}}>{moraleLabel(user.morale)}</span> • CHEM:<span style={{color:tierColor(user.chemistry,80,65),fontWeight:700}}>{Math.round(user.chemistry)}</span> • REP:<span style={{color:rep.color,fontWeight:700}}>{rep.label}</span>{user.owner?.personality && <> • 👔 <span className="gg-owner">{user.owner.personality.toUpperCase()}</span></>}
              </div>
            </div>
          </div>
          <div className="gg-right">
            <span className="gg-phase">{phasePill}</span>
            {!live && <div className="actions">{actions}</div>}
            <button className="gg-ico" disabled={!!live} onClick={()=>setSearchOpen(true)} aria-label="Search players, teams and screens" title="Search (Ctrl/⌘ K)">🔍</button>
            <button className="gg-ico" disabled={!!live} onClick={()=>setTab("activity")} aria-label="Club news and inbox" title="News & inbox">🔔{unread>0 && <span className="notification-dot"/>}</button>
            <button className="gg-ico" disabled={!!live} onClick={()=>go("trophies")} aria-label="Trophy room" title="Trophy room">🏆</button>
            <button className="gg-ico" onClick={()=>{flushSave();showToast("Game saved in this browser.");}} aria-label="Save game" title="Save">💾</button>
            <button className="gg-ico" disabled={!!live} onClick={()=>setTab("settings")} aria-label="Settings" title="Settings">🔧</button>
          </div>
        </header>
        <div className="gg-rep" aria-label={`GM reputation ${Math.round(gm.rep)} of 100`}>
          <span style={{color:rep.color}}>{rep.label}</span>
          <span className="gg-repbar"><i style={{width:`${Math.round(rep.pct*100)}%`,background:rep.color}}/></span>
          <span className="gg-repnum">{Math.round(gm.rep)}/{rep.next}</span>
          {rep.nextLabel && <span className="gg-repnext">{Math.round(rep.pct*100)}% → {rep.nextLabel}</span>}
        </div>
        {toast && <div className={`gg-flash${/failed|blocked|invalid|rejected|not enough|cannot|declined|paused|stopped|injur|unhappy|over the|max \d|need/i.test(String(toast))?" warn":""}`} role="status" aria-live="polite">{String(toast)}</div>}
        {deadlineActive(league) && !live && <DeadlineTicker league={league} onOpen={() => go("deadline")} />}
        <nav className="gg-tabs nav" aria-label="Main navigation">
          {NAV.filter((n) => !n.when || n.when(league)).map((n) => (
            <button key={n.id} aria-current={tab===n.id && !live?"page":undefined} className={tab === n.id && !live ? "active" : ""} disabled={!!live} title={n.label} onClick={() => setTab(n.id)}>
              <span className="gg-tab-label">{n.short}</span><span className="sr-only">{n.label}</span>
              {badgeFor(n.id) && <span className="badge">{badgeFor(n.id)}</span>}
            </button>
          ))}
        </nav>
        <label className="gg-jump">Go to <select aria-label="Game navigation" value={tab} disabled={!!live} onChange={e=>go(e.target.value)}>{NAV.filter(n=>!n.when || n.when(league)).map(n=><option key={n.id} value={n.id}>{n.label}</option>)}<option value="activity">News & Inbox</option><option value="settings">Settings</option></select></label>
        <div className="body">
          <div className="main"><ErrorBoundary key={live ? "live" : tab} onHome={()=>{setLive(null);setTab("dashboard");}}>
            {live ? (
              <LiveGame spec={live} onDone={onLiveDone} />
            ) : (
              <>
                {tab === "dashboard" && <Dashboard act={act} />}
                {tab === "activity" && <ActivityPage />}
                {tab === "lines" && <LinesHub sub={sub.lines} onSub={(k) => setSub("lines", k)} />}
                {tab === "schedule" && <SchedulePage />}
                {tab === "stats" && <StatsPage />}
                {tab === "draft" && <DraftPage act={act} />}
                {tab === "coaching" && <CoachingHub sub={sub.coaching} onSub={(k) => setSub("coaching", k)} />}
                {tab === "frontoffice" && <FrontOfficeHub sub={sub.frontoffice} onSub={(k) => setSub("frontoffice", k)} />}
                {tab === "trade" && <TradeHub sub={sub.trade} onSub={(k) => setSub("trade", k)} seed={tradeSeed} />}
                {tab === "legacy" && <TrophyRoom />}
                {tab === "records" && <RecordBookPage />}
                {tab === "league" && <LeagueHub sub={sub.league} onSub={(k) => setSub("league", k)} act={act} />}
                {tab === "settings" && <SettingsPage />}
              </>
            )}
          </ErrorBoundary></div>
        </div>
        {!live && !busy && league.playoffs?.papers?.some((p) => !p.seen) && <SeriesPaper paper={league.playoffs.papers.find((p) => !p.seen)} onClose={() => { league.playoffs.papers.find((p) => !p.seen).seen = true; commit(); }} />}
        {searchOpen && !live && <CommandPalette league={league} nav={NAV} onClose={()=>setSearchOpen(false)} onNavigate={id=>go(id)} onPlayer={id=>setModal({type:"player",id})} onTeam={tid=>setModal({type:"team",tid})}/>}
        {modal?.type === "player" && league.players[modal.id] && <PlayerModal pid={modal.id} />}
        {modal?.type === "team" && <TeamModal tid={modal.tid} />}
        {modal?.type === "box" && <BoxScoreModal game={modal.game} />}
        {busy && (
          <div className="overlay">
            <div className="box">
              <StanleyCup3D size={125} showControls={false}><div className="spinner" /></StanleyCup3D>
              <div>{busy.label}</div>
              {busy.cancel && (
                <button className="small" style={{ marginTop: 12 }} onClick={() => (cancelRef.current = true)}>
                  Stop
                </button>
              )}
            </div>
          </div>
        )}
        {confirmEl}
      </div>
    </GameCtx.Provider>
  );
}

