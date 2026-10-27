import {decisionInterrupt} from './engine/decisionInterrupts.js';
import SeriesPaper from "./ui/SeriesPaper.jsx";
import NewsPaper from "./ui/NewsPaper.jsx";
import SimSummary from "./ui/SimSummary.jsx";
import { snapshotForSummary, buildSummary } from "./engine/simSummary.js";
import { ensurePulse, repTier, moraleLabel, tierColor } from "./engine/clubPulse.js";
import { capForYear } from "./engine/constants.js";
import { capYear } from "./engine/roster.js";
import { lastDay } from "./engine/schedule.js";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameCtx, TeamBadge, recordStr, money, SectionHero } from "./ui/common.jsx";
import { heroStats, heroEyebrow } from "./ui/heroStats.js";
import StanleyCup3D from "./ui/StanleyCup3D.jsx";
import ActivityPage from "./ui/ActivityPage.jsx";
import CommandPalette from "./ui/CommandPalette.jsx";
import TitleScreen from "./ui/TitleScreen.jsx";
import Dashboard from "./ui/Dashboard.jsx";
import RosterPage from "./ui/RosterPage.jsx";
import LinesPage from "./ui/LinesPage.jsx";
import SchedulePage from "./ui/SchedulePage.jsx";
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
import ErrorBoundary from "./ui/ErrorBoundary.jsx";
import LeaguePage from "./ui/LeaguePage.jsx";
import SettingsPage from "./ui/SettingsPage.jsx";
import LiveGame from "./ui/LiveGame.jsx";
import PlayerSheet from "./ui/PlayerSheet.jsx";
import TeamModal from "./ui/TeamModal.jsx";
import BoxScoreModal from "./ui/BoxScoreModal.jsx";
import OwnerReview from "./ui/OwnerReview.jsx";
import StageConfirm from "./ui/StageConfirm.jsx";
import Tour, { TourWelcome } from "./ui/Tour.jsx";
import DraftPickCard from "./ui/DraftPickCard.jsx";
import { expiringPlayers } from "./engine/offseason.js";
import { counts } from "./engine/roster.js";
import { myOffers } from "./engine/negotiations.js";
import * as L from "./engine/league.js";
import { startResign as DBG_startResign } from "./engine/offseason.js";
import { frenzyTick as DBG_frenzyTick } from "./engine/frenzy.js";
import { simFADay as DBG_simFADay } from "./engine/offseason.js";
import { advanceRoundIfDone as DBG_advanceRound } from "./engine/playoffs.js";
import { PHASES, FA_DAYS, SAVE_KEY } from "./engine/constants.js";
import { dayToDate } from "./engine/schedule.js";
import { capSpace, rosterIssues } from "./engine/roster.js";
import { automaticallyHandleRoster } from "./engine/autoRoster.js";
import { simPlayoffDay, userSeries, nextGame } from "./engine/playoffs.js";
import { simDraftToUser, draftDone, currentSlot } from "./engine/draft.js";
import { atCombine, openDraftFloor } from "./engine/scouting.js";
import { simFADay } from "./engine/offseason.js";
import { cloudSave } from "./platform.js";
import ConfirmModal from "./ui/ConfirmModal.jsx";
import FeedbackToast from "./ui/FeedbackToast.jsx";
import Moment from "./ui/Moment.jsx";
import InjuryReportCard from "./ui/InjuryReportCard.jsx";
import { closeMoment } from "./engine/moments.js";
import { repairLeague, repairSummary, loadRepairedKey } from "./engine/repair.js";
import { staffGapText } from "./engine/franchise.js";
import { backupSave, dropBackup } from "./engine/saveSlots.js";
import { LinesHub, CoachingHub, FrontOfficeHub, TradeHub, LeagueHub, DevelopmentHub, StandingsHub, ContractsHub } from "./ui/hubs.jsx";
import { devView } from "./ui/DevelopmentDesk.jsx";
import TrophyRoom from "./ui/TrophyRoom.jsx";
import GameUpdates from "./ui/GameUpdates.jsx";
import { usePhone, desktopUrl, phoneUrl, swipeHandlers } from "./ui/mobile.js";
import { applyTheme, getTheme } from "./ui/theme.js";
import { PhoneHeader, MobileNav, MoreSheet, MobileActionBar, TapTips } from "./ui/MobileShell.jsx";
import { OfflineChip } from "./ui/OfflinePanel.jsx";
import { setInjuriesEnabled } from "./engine/injuries.js";
import { DeskBar, sectionsFor, sectionOf, screenOn, defaultSubs } from "./ui/DeskNav.jsx";
import { route } from "./ui/navRoute.js";
import { frenzyFor } from "./engine/frenzy.js";
import { payroll } from "./engine/roster.js";
import { capOverview } from "./engine/capOverview.js";

const NAV = [
  {id:"dashboard",label:"Home",short:"Home"},{id:"lines",label:"Lines & Roster",short:"Lines"},{id:"schedule",label:"Schedule",short:"Schedule"},{id:"standings",label:"Standings",short:"Standings"},
  {id:"playoffs",label:"Playoffs",short:"Playoffs"},{id:"stats",label:"Stats",short:"Stats"},{id:"development",label:"Development",short:"Development"},{id:"draft",label:"Draft & Scouting",short:"Draft"},
  {id:"coaching",label:"Coaching",short:"Coaching"},{id:"frontoffice",label:"Front Office",short:"Front Office"},{id:"contracts",label:"Contracts",short:"Contracts"},{id:"trade",label:"Trade & Market",short:"Trade"},
  {id:"league",label:"League",short:"League"},{id:"legacy",label:"Legacy Hall",short:"Legacy Hall",tiny:"Legacy"},
];
// Screens reached from the menu rather than the bar (search finds them too).
const EXTRA_SCREENS = [{id:"activity",label:"News & Inbox"},{id:"updates",label:"Game updates"},{id:"settings",label:"Settings"}];

const CLOUD_EVERY_MS = 60000;

export default function App({ resume = false }) {
  const leagueRef = useRef(null);
  // A save is repaired as it loads (repair.js), so one bad entry can't break every screen.
  const bootFixes = useRef(null);
  if (resume && !leagueRef.current) {
    const r = loadRepairedKey(SAVE_KEY);
    leagueRef.current = r.league;
    bootFixes.current = r.fixes;
  }
  const [, setRev] = useState(0);
  const [screen, setScreen] = useState(leagueRef.current ? "game" : "title");
  const [confirmReq, setConfirmReq] = useState(null);
  const cloudRef = useRef({ last: 0, timer: null, phase: null, busy: false });
  const [tab, setTab] = useState("dashboard");
  const [sub, setSubState] = useState({});
  const setSub = useCallback((t, k) => setSubState((prev) => (prev[t] === k ? prev : { ...prev, [t]: k })), []);
  // Phones: the bottom tab bar, the More sheet and the action button (ui/MobileShell.jsx).
  const phone = usePhone();
  const phoneRef = useRef(phone);
  phoneRef.current = phone;
  const [moreOpen, setMoreOpen] = useState(false);
  const [themeNow, setThemeNow] = useState(getTheme);
  // go("roster") opens the Lines hub on its Roster section, go("league","tx") the League hub on transactions, and so on.
  // The Draft screen picks its tab from `draftWant` (Home's reminders open Scout assignments, Scouts).
  // go(id, k): ui/navRoute.js maps old ids (roster, playoffs, freeagency...) onto the sections.
  const go = useCallback((id, k) => { const [t, kk] = route(id, k, leagueRef.current?.phase); setTab(t); if (kk) setSub(t, kk); else if (t === "standings" || t === "contracts") setSub(t, null); if (t === "draft" && kk) setDraftWant({ v: kk, n: Date.now() }); setMoreOpen(false); }, [setSub]);
  const [searchOpen,setSearchOpen]=useState(false);
  const [menuOpen,setMenuOpen]=useState(false);
  const [ffOpen,setFfOpen]=useState(false);
  const [draftView, setDraftView] = useState(null);
  const [draftWant, setDraftWant] = useState(null);
  const [tour,setTour]=useState(null); // null | "welcome" | "run"
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(null);
  const [toasts, setToasts] = useState([]);
  const toastSeq = useRef(0);
  const saveOk = useRef(true);
  const [live, setLive] = useState(leagueRef.current?.activeGame?.spec || null);
  const [tradeSeed, setTradeSeed] = useState(null);
  const saveTimer = useRef(null);
  const cancelRef = useRef(false);
  const league = leagueRef.current;

  // Messages queue: each one gets its full time on screen, one after another. A backlog
  // never grows past the toast on screen and three waiting, and a repeat isn't queued twice.
  const showToast = useCallback((msg, ms = 3500) => {
    if (msg == null || msg === "") return;
    const text = String(msg), id = ++toastSeq.current;
    setToasts((q) => {
      if (q.some((t) => t.msg === text)) return q;
      const next = [...q, { id, msg: text, ms: Math.max(1500, ms) }];
      return next.length > 4 ? [next[0], ...next.slice(-3)] : next;
    });
  }, []);
  const toastHead = toasts[0];
  useEffect(() => {
    if (!toastHead) return undefined;
    const timer = setTimeout(() => setToasts((q) => (q[0]?.id === toastHead.id ? q.slice(1) : q)), toastHead.ms);
    return () => clearTimeout(timer);
  }, [toastHead?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const nextToast = useCallback(() => setToasts((q) => q.slice(1)), []);

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
    let ok = L.saveLeague(leagueRef.current);
    // The phase backup never costs you the autosave: if storage is full, it goes first.
    if (!ok && dropBackup()) ok = L.saveLeague(leagueRef.current);
    saveOk.current = ok;
    if (!ok && !cloudRef.current.last) showToast("This browser didn't keep your save. Use Settings → Export league to keep a copy.", 6000);
    syncCloud();
  }, [showToast, syncCloud]);

  // Throttled autosave: at most one write per 400ms, never more than 400ms behind.
  // Callers that change the league many times a second (the deadline clock) pass a longer
  // delay and call save() when they stop; leaving the page still flushes a pending save.
  const commit = useCallback((ms = 400) => {
    setRev((r) => r + 1);
    if (!saveTimer.current) saveTimer.current = setTimeout(() => {
      // Compressing a multi-season league can take a second or two; let the screen paint first.
      if (typeof requestIdleCallback === "function") {
        saveTimer.current = "idle";
        requestIdleCallback(() => { if (saveTimer.current === "idle") flushSave(); }, { timeout: 1500 });
      } else flushSave();
    }, ms);
  }, [flushSave]);

  // Before each phase change, the save as it stands is kept as a labelled backup
  // (Settings → Restore backup). Skipped quietly when storage is full or unavailable.
  const backup = useCallback((label) => {
    if (saveTimer.current) flushSave();
    if (saveOk.current && leagueRef.current) backupSave(leagueRef.current, label);
  }, [flushSave]);

  // Fixes made to a save resumed at start-up are listed once the game is on screen.
  useEffect(() => {
    if (!bootFixes.current?.length) return;
    showToast(repairSummary(bootFixes.current), 9000);
    bootFixes.current = null;
    commit();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // `fixes`: repairs already made while the save was read (loadRepaired), to list with any made here.
  const startLeague = (lg, earlier = []) => {
    const fixes = [...earlier, ...repairLeague(lg)];
    leagueRef.current = lg;
    setLive(lg.activeGame?.spec || null);
    cloudRef.current.phase = lg.phase;
    setScreen("game");
    setTab("dashboard");
    commit();
    syncCloud(true);
    if (fixes.length) showToast(repairSummary(fixes), 9000);
    // A brand-new franchise is offered the tour once, unless the player opted out for good.
    let optOut = false; try { optOut = localStorage.getItem("rinkgm_tour_optout") === "1"; } catch {}
    if (!lg.settings?.tourSeen && lg.year === lg.startYear && lg.phase === "preseason" && !optOut) setTour("welcome");
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
        while (more && performance.now() - t0 < 45) { more = step(); const notice=more && decisionInterrupt(leagueRef.current); if(notice){showToast(notice,7000);more=false;} /* moments and series papers never stop a sim: they wait until it finishes */ }
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

  // Search from anywhere: "/" (unless you're typing in a field) or Ctrl/Cmd+K, as in the football game.
  useEffect(()=>{const key=e=>{if(screen!=="game" || live)return;const el=e.target,typing=el && (el.tagName==="INPUT" || el.tagName==="TEXTAREA" || el.tagName==="SELECT" || el.isContentEditable);if((e.metaKey || e.ctrlKey) && e.key.toLowerCase()==="k"){e.preventDefault();setSearchOpen(v=>!v);}else if(e.key==="/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey){e.preventDefault();setSearchOpen(true);}};window.addEventListener("keydown",key);return ()=>window.removeEventListener("keydown",key);},[screen,live]);
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

  // Test hook for browser checks: open the game with ?debug to reach the live league from the console.
  useEffect(() => {
    try { if (/[?&]debug\b/.test(window.location.search)) window.__rinkDebug = { league: () => leagueRef.current, commit, setModal, setTab, go, engine: { ...L, startResign: DBG_startResign, frenzyTick: DBG_frenzyTick, simFADay: DBG_simFADay, advanceRoundIfDone: DBG_advanceRound, simDraftToUser } }; } catch { /* no window */ }
  });

  const ctx = useMemo(
    () => ({
      league: leagueRef.current,
      commit,
      toast: showToast,
      go,
      // ONE player sheet everywhere (ui/PlayerSheet.jsx): every name, row and card opens it.
      // context: where it was opened from ("lines", "roster", "fa", "draft"...), for its actions.
      openPlayer: (id, context) => id != null && setModal({ type: "player", id, context }),
      openTeam: (tid) => setModal({ type: "team", tid }),
      openBox: (game) => setModal({ type: "box", game }),
      startTour: () => { setModal(null); setMenuOpen(false); setTour("run"); },
      openPick: (pid, slot) => setModal({ type: "pick", pid, slot }),
      // A Gazette edition waiting in Needs Attention.
      openPaper: (id) => setModal({ type: "paper", id }),
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
      replaceLeague: (lg, fixes) => startLeague(lg, fixes),
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
  const seasonLabel = `${league.year}-${String(league.year + 1).slice(2)}`;

  // ---------- Phase actions ----------
  const openDeadline = () => {
    startDeadline(league);
    go("deadline");
    commit();
  };
  const blockers = () => {
    if(league.career?.fired){showToast("Accept your next GM job in Front Office → Operations before continuing.",5000);go("operations");return true;}
    if (deadlinePending(league)) {
      const first = !deadlineActive(league);
      openDeadline();
      if (first) showToast("It's Trade Deadline Day! Make your moves before 3:00 PM ET.", 5000);
      return true;
    }
    let issues = rosterIssues(league, user).filter((x) => !x.startsWith("Need"));
    if (issues.length && league.settings?.autoRoster !== false) {
      const r = automaticallyHandleRoster(league, user, { allowWaivers: true });
      if (r.moved.length || r.claimed.length) showToast(`${r.msg}`, 8000);
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
    // Start Season just starts it: no preview card, no camp prompt (unfinished camp simply ends).
    startSeason: () => act.startSeasonNow(),
    startSeasonNow: () => {
      setModal(null);
      if (blockers()) return;
      backup(`the ${seasonLabel} preseason`);
      L.startRegularSeason(league);
      // Opening night lands on Home: the first game and the to-do list.
      setTab("dashboard");
      commit();
      showToast("The season is under way.");
    },
    simDay: () => {
      if (blockers()) return;
      // One press = one game: sim today, then skip the off days so you land on your next game day
      // (Play or Sim game ready). Stops at the deadline, season's end or anything that needs you.
      const toNext = () => { while (league.phase === "regular" && !L.seasonOver(league) && !deadlinePending(league) && !L.userGameOnDay(league) && league.schedule.some((g) => !g.played && (g.h === league.userTid || g.a === league.userTid))) L.simDay(league); };
      if (league.phase === "regular" && !L.userGameOnDay(league)) toNext();
      else { L.simDay(league); toNext(); }
      commit();
      // Your game's result card (compact, full or off in Settings) is queued by the engine
      // (engine/momentsResults.js) and shows as a moment; its Box score button opens the box.
      // A sim of several days keeps only the latest card, after its summary.
    },
    showSummary: (snap) => { if (league.settings?.simSummary === false) return; const data = buildSummary(league, snap); if (data && data.span.gp >= 2) setModal({ type: "simsummary", data }); },
    simDays: (n, label) => {
      if (blockers()) return;
      let i = 0;
      const snap = snapshotForSummary(league);
      runChunked(
        () => `${label} — ${dayToDate(league.year, league.day, league.scheduleStart)}`,
        () => {
          if (league.phase !== "regular" || L.seasonOver(league) || i >= n || deadlinePending(league)) return false;
          L.simDay(league);
          i++;
          return true;
        },
        () => { act.showSummary(snap); if (deadlinePending(league)) blockers(); }
      );
    },
    simToDeadline: () => {
      if (blockers()) return;
      const snap = snapshotForSummary(league);
      runChunked(
        () => `Simulating to the trade deadline — ${dayToDate(league.year, league.day, league.scheduleStart)}`,
        () => {
          if (league.phase !== "regular" || L.seasonOver(league) || deadlinePending(league) || league.day > league.deadlineDay) return false;
          L.simDay(league);
          return true;
        },
        () => { act.showSummary(snap); if (deadlinePending(league)) blockers(); }
      );
    },
    simToEnd: () => {
      if (blockers()) return;
      const snap = snapshotForSummary(league);
      runChunked(
        () => `Simulating the regular season — ${dayToDate(league.year, league.day, league.scheduleStart)}`,
        () => {
          if (league.phase !== "regular" || L.seasonOver(league) || deadlinePending(league)) return false;
          L.simDay(league);
          return true;
        },
        () => { act.showSummary(snap); if (deadlinePending(league)) blockers(); }
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
      backup(`the end of the ${seasonLabel} regular season`);
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
        () => league.playoffs.champion == null && simPlayoffDay(league)
      );
    },
    playPlayoffLive: () => {
      const s = userSeries(league);
      if (!s) return;
      const g = nextGame(league, s);
      setLive({ kind: "playoff", series: s, home: g.home, away: g.away });
    },
    toDraft: () => {
      backup(`the ${seasonLabel} playoffs`);
      L.finishPlayoffs(league);
      // Each off-season step lands on Home, where the phase card says what's next.
      setTab("dashboard");
      commit();
    },
    startDraft: () => {
      const pts = 0, iv = league.draft?.interviewsLeft ?? 0;
      if (!pts && !iv) return act.startDraftNow();
      setModal({ type: "stage", title: "Move on to the Draft?", yes: "Yes, go to the Draft", onYes: act.startDraftNow, lines: [
        ...(iv ? [{ tone: "warn", head: `${iv} prospect interview${iv === 1 ? "" : "s"} not used yet`, text: "Interviews only happen at the Combine." }] : []),
        ...(pts ? [{ tone: "warn", head: `${pts} scouting point${pts === 1 ? "" : "s"} unspent`, text: "Reports can still be filed from the draft floor, but the clock runs there." }] : []),
        { tone: "info", head: "Combine results and your big board stay available until the draft ends" },
      ] });
    },
    startDraftNow: () => {
      setModal(null);
      openDraftFloor(league);
      setTab("dashboard");
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
      backup(`the ${league.draft?.year ?? league.year + 1} draft`);
      L.completeDraft(league);
      setTab("dashboard");
      commit();
    },
    toFA: () => {
      const left = expiringPlayers(league, user).filter((p) => p.yrs === 0).sort((a, b) => b.ovr - a.ovr);
      setModal({ type: "stage", title: "Move on to Free Agency?", yes: "Yes, go to Free Agency", onYes: act.toFANow, lines: [
        left.length ? { tone: "warn", head: `${left.length} expiring player${left.length === 1 ? "" : "s"} not re-signed`, text: `${left.slice(0, 5).map((p) => `${p.name} (${p.pos} ${p.ovr})`).join(", ")}${left.length > 5 ? "…" : ""}. They hit the open market, where 31 clubs can bid.` } : { tone: "good", head: "Every expiring contract is settled", text: "Nothing of yours reaches the market." },
        { tone: "info", head: `${money(capSpace(league, user))} of cap room for next season`, text: `${counts(league, user).active} players signed for the NHL roster.` },
      ] });
    },
    toFANow: () => {
      setModal(null);
      backup(`the ${league.year + 1} re-sign window`);
      L.goToFreeAgency(league);
      go("frenzy");
      commit();
    },
    faDay: () => {
      simFADay(league);
      commit();
      if (league.fa?.summary?.text) showToast(league.fa.summary.text);
    },
    faToEnd: () => {
      while (league.fa && league.fa.day < FA_DAYS) simFADay(league);
      commit();
    },
    nextSeason: () => {
      if(league.career?.fired){showToast("Accept your next GM job under Front Office → Operations.",5000);go("operations");return;}
      const open = Math.max(0, 23 - counts(league, user).active), pending = myOffers(league).filter((o) => o.standing.status === "pending").length;
      const daysLeft = league.fa ? Math.max(0, FA_DAYS - league.fa.day) : 0;
      setModal({ type: "stage", title: `Start the ${league.year + 1}-${String(league.year + 2).slice(2)} season?`, yes: "Yes, start the season", onYes: act.nextSeasonNow, lines: [
        { tone: open >= 4 ? "warn" : "info", head: `${open} open roster spot${open === 1 ? "" : "s"}`, text: open >= 4 ? "Camp fills them from the farm, but depth signed now is depth you chose." : "The NHL roster is close to full." },
        { tone: "info", head: `${money(capSpace(league, user))} of cap space left`, text: "Unspent room banks through the season for a deadline move." },
        ...(pending ? [{ tone: "warn", head: `${pending} offer${pending === 1 ? "" : "s"} still waiting on an answer`, text: `Agents decide over the remaining ${daysLeft} free-agency day${daysLeft === 1 ? "" : "s"}; starting the season settles them now.` }] : []),
        ...(staffGapText(user) ? [{ tone: "warn", ...staffGapText(user), action: { label: "Hire a coach", onClick: () => { setModal(null); go("coaching", "coaching"); } } }] : []),
      ] });
    },
    nextSeasonNow: () => {
      setModal(null);
      backup(`${league.year + 1} free agency`);
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

  const space = capSpace(league, user);
  const badgeFor = (id) => {
    if (id === "draft" && league.phase === "draft") return "LIVE";
    if (id === "trade") { if (deadlinePending(league)) return "LIVE"; if (league.phase === "freeagency") return "OPEN"; const n = userOffers(league).length; return n ? String(n) : null; }
    if (id === "contracts" && league.phase === "resign") return "OPEN";
    if (id === "standings" && league.phase === "playoffs" && league.playoffs?.champion == null) return "ON";
    return null;
  };

  const gm = ensurePulse(league);
  const rep = repTier(gm.rep);
  const capCeiling = capForYear(capYear(league));
  const unread = Math.max(0, league.inbox.length - (league.settings.activityReadCount || 0));

  // ---------- Phones ----------
  // The bottom bar is fixed: Home, Lineup, Standings, Development and More (every other screen,
  // grouped by the computer's sections). More lights up when the screen you're on lives there.
  const tradeSub = sub.trade || "trade";
  const phoneNav = [
    { key: "home", icon: "home", label: "Home", on: tab === "dashboard", onClick: () => go("dashboard") },
    { key: "lines", icon: "lines", label: "Lineup", on: tab === "lines" || tab === "coaching", onClick: () => go("lines", "lines") },
    { key: "standings", icon: "standings", label: "Standings", on: tab === "standings", onClick: () => go("standings"), badge: badgeFor("standings") },
    { key: "development", icon: "development", label: "Development", on: tab === "development", onClick: () => go("development") },
  ];
  // The day's main action, then the rest behind the ▾ (the same act functions as the top bar's).
  const phoneActions = (() => {
    const A = [];
    const ph = league.phase;
    if (ph === "preseason") A.push({ label: "Start Season ▶", onClick: act.startSeason });
    if (ph === "regular") {
      if (L.seasonOver(league)) A.push({ label: "Start the playoffs", onClick: act.startPlayoffs, tone: "gold" });
      else if (deadlinePending(league)) A.push({ label: "⏰ Trade Deadline Day", onClick: openDeadline, tone: "red" });
      else {
        const ug = L.userGameOnDay(league);
        if (ug) {
          const opp = league.teams[ug.h === user.id ? ug.a : ug.h];
          A.push({ label: `▶ Play Live ${ug.h === user.id ? "vs" : "@"} ${opp.abbr}`, onClick: act.playLive });
          A.push({ label: "Sim Game", onClick: act.simDay, tone: "blue" });
        } else A.push({ label: "Sim to next game", onClick: act.simDay, tone: "blue" });
        A.push({ label: "Sim Week", onClick: () => act.simDays(7, "Simulating a week"), tone: "blue" });
        if (league.day < league.deadlineDay) A.push({ label: "Sim to Deadline", onClick: act.simToDeadline, tone: "red", confirm: true });
        A.push({ label: "Sim to End of Season", onClick: act.simToEnd, tone: "violet", confirm: true });
      }
    }
    if (ph === "playoffs") {
      if (league.playoffs.champion != null) A.push({ label: "Go to the Draft →", onClick: act.toDraft, tone: "gold" });
      else {
        if (userSeries(league)) A.push({ label: "▶ Play Live", onClick: act.playPlayoffLive });
        A.push({ label: "Sim Day", onClick: act.simPlayoffDay, tone: "blue" });
        A.push({ label: "Sim Round", onClick: act.simPlayoffRound, tone: "gold" });
        A.push({ label: "Sim to the Final", onClick: act.simPlayoffsAll, tone: "violet", confirm: true });
      }
    }
    if (ph === "draft") {
      if (atCombine(league)) A.push({ label: "Start the Draft →", onClick: act.startDraft, tone: "gold" });
      else if (draftDone(league)) A.push({ label: "Continue to Re-signing →", onClick: act.toResign, tone: "gold" });
      else {
        // On the clock, the pick is yours to make on the screen: the bar only offers the auto-draft.
        if (currentSlot(league).owner !== user.id) A.push({ label: "⏩ Sim to My Pick", onClick: act.simToMyPick });
        A.push({ label: "Auto-Draft the Rest", onClick: act.autoDraft, tone: "violet", small: currentSlot(league).owner === user.id });
      }
    }
    if (ph === "resign") A.push({ label: "Finish → Free Agency", onClick: act.toFA, tone: "gold", small: true });
    if (ph === "freeagency") {
      const next = { label: `Start ${league.year + 1}-${String(league.year + 2).slice(2)} Season →`, onClick: act.nextSeason, tone: "gold" };
      if (league.fa.day < FA_DAYS) A.push({ label: "Next Day", onClick: act.faDay, tone: "blue" }, { label: "Sim to the End of Free Agency", onClick: act.faToEnd, tone: "violet" }, next);
      else A.push(next);
    }
    // Off Home and the draft, the main action shrinks to a pill so a tap meant for the screen can't sim.
    if (A[0] && tab !== "dashboard" && tab !== "draft") A[0] = { ...A[0], small: true };
    return A;
  })();
  // Desktop: the phase's main button (green), one quiet button and the rest behind ⏩.
  const deskMain = [], deskFF = [];
  {
    const ph = league.phase;
    const btn = (k, label, onClick, primary) => <button key={k} className={primary ? "primary" : "rk-quiet"} onClick={onClick}>{label}</button>;
    if (ph === "preseason") deskMain.push(btn("s", "Start season", act.startSeason, true));
    if (ph === "regular") {
      if (L.seasonOver(league)) deskMain.push(btn("po", "Start playoffs", act.startPlayoffs, true));
      else if (deadlinePending(league)) deskMain.push(btn("dd", "Open Deadline Day", openDeadline, true));
      else {
        const ug = L.userGameOnDay(league);
        if (ug) {
          const opp = league.teams[ug.h === user.id ? ug.a : ug.h];
          deskMain.push(btn("live", `Play ${ug.h === user.id ? "vs" : "@"} ${opp.abbr}`, act.playLive, true));
          deskMain.push(btn("sg", "Sim game", act.simDay));
        } else deskMain.push(btn("sd", "Sim to next game", act.simDay, true));
        deskFF.push(["Sim week", () => act.simDays(7, "Simulating a week")]);
        if (league.day < league.deadlineDay) deskFF.push(["Sim to deadline", act.simToDeadline]);
        deskFF.push(["Sim to end of season", act.simToEnd]);
      }
    }
    if (ph === "playoffs") {
      if (league.playoffs.champion != null) deskMain.push(btn("d", "Finish playoffs: go to the draft", act.toDraft, true));
      else {
        const mine = userSeries(league);
        if (mine) deskMain.push(btn("pl", "Play live", act.playPlayoffLive, true));
        deskMain.push(btn("pd", "Sim day", act.simPlayoffDay, !mine));
        deskFF.push(["Sim round", act.simPlayoffRound], ["Sim to the end", act.simPlayoffsAll]);
      }
    }
    if (ph === "draft") {
      if (atCombine(league)) deskMain.push(btn("sd", "Start the draft", act.startDraft, true));
      else if (draftDone(league)) deskMain.push(btn("rs", "Finish draft", act.toResign, true));
      else {
        if (currentSlot(league).owner !== user.id) deskMain.push(btn("mp", "Sim to my pick", act.simToMyPick, true));
        deskFF.push(["Auto-draft the rest", act.autoDraft]);
      }
    }
    if (ph === "resign") deskMain.push(btn("fa", "Finish re-signing", act.toFA, true));
    if (ph === "freeagency") {
      if (league.fa.day < FA_DAYS) { deskMain.push(btn("fd", "Next day", act.faDay)); deskFF.push(["Sim to the end of free agency", act.faToEnd]); }
      deskMain.push(btn("ns", "Finish free agency", act.nextSeason, true));
    }
  }
  const tradeDeadlineOpen = (league.phase === "regular" || league.phase === "playoffs") && (deadlinePending(league) || (league.deadline?.year === league.year && !league.deadline.synthetic));
  // The deadline desk has its own action bar (the clock's controls).
  const onDeadlineDesk = tab === "trade" && tradeSub === "deadline" && tradeDeadlineOpen && league.deadline?.year === league.year;
  const injOn = league.settings.injuries !== false;
  const moreActions = [
    { label: "Save game", onClick: () => { flushSave(); setMoreOpen(false); showToast("Game saved in this browser."); } },
    { label: injOn ? "Injuries: on (tap to turn off)" : "Injuries: off (tap to turn on)", onClick: () => { const healed = setInjuriesEnabled(league, !injOn); commit(); showToast(!injOn ? "Injuries enabled." : `Injuries disabled. ${healed} players restored to full health.`); } },
    { label: "Offline play", onClick: () => { go("settings"); setTimeout(() => document.getElementById("rk-offline")?.scrollIntoView({ block: "start" }), 120); } },
    { label: themeNow === "light" ? "Theme: light (tap for dark)" : themeNow === "dark" ? "Theme: dark (tap for auto)" : "Theme: auto (tap for light)", onClick: () => { setThemeNow(applyTheme(themeNow === "light" ? "dark" : themeNow === "dark" ? "auto" : "light")); } },
    { label: "Take the tour", onClick: () => { setMoreOpen(false); setTour("run"); } },
    { label: "Game updates", onClick: () => go("updates") },
    { label: "Settings", onClick: () => go("settings") },
    { label: "Computer layout", onClick: () => { flushSave(); window.location.href = desktopUrl(); } },
  ];

  // ---------- Desktop: the bar and each section's header ----------
  const frenzyOpen = league.phase === "freeagency" && (!!frenzyFor(league) || (league.fa?.day || 0) === 0);
  const sections = sectionsFor(league, { deadlineOpen: tradeDeadlineOpen, frenzyOpen });
  // the hubs' current screens, with the phase's defaults (Standings opens on the bracket in the playoffs)
  const navSub = { ...defaultSubs(league), ...Object.fromEntries(Object.entries(sub).filter(([, v]) => v != null)), draft: draftView };
  const draftSub = navSub;
  const where = sectionOf(sections, tab, navSub);
  const openScreen = (scr) => { const [, t, k] = scr; if (t === "draft" && k) { setDraftWant({ v: k, n: Date.now() }); setTab("draft"); } else { setTab(t); if (k) setSub(t, k); } setMoreOpen(false); };
  for (const s of sections) s.badge = s.id === "draft" ? badgeFor("draft") : s.id === "market" ? badgeFor("trade") : s.id === "standings" ? badgeFor("standings") : s.id === "contracts" ? badgeFor("contracts") : null;
  // Phones: the More sheet in the bar's groups, one row per screen.
  const screenBadge = (sec, scr) => (sec.id === "draft" && scr[2] === "floor" ? badgeFor("draft") : scr[1] === "trade" && (scr[2] === "deadline" || scr[2] === "fa") ? badgeFor("trade") : scr[1] === "contracts" && scr[2] === "resign" ? badgeFor("contracts") : scr[1] === "standings" && scr[2] === "playoffs" ? badgeFor("standings") : null);
  const moreGroups = [
    ...sections.filter((sec) => sec.id !== "home").map((sec) => ({ id: sec.id, label: sec.label, items: sec.screens.map((scr) => {
      const [label, t, k] = scr;
      return { key: `${t}-${k || ""}-${label}`, label, badge: screenBadge(sec, scr), on: screenOn(scr, tab, navSub), onClick: () => openScreen(scr) };
    }) })),
    { label: "Your club", items: [{ key: "activity", label: unread ? `News & inbox (${unread})` : "News & inbox", on: tab === "activity", onClick: () => go("activity") }] },
  ];
  // phones: swipe sideways to the next or previous screen of the section you're in
  const swipeHub = (dir) => {
    const g = moreGroups.find((x) => x.items.some((it) => it.on));
    if (!g) return;
    const i = g.items.findIndex((it) => it.on), next = g.items[i + dir];
    if (next) next.onClick();
  };
  // More carries the draft's and the deadline's LIVE while they run.
  const moreBadge = badgeFor("draft") || (deadlinePending(league) ? "LIVE" : null);
  const deskMenu = [
    <button key="n" role="menuitem" onClick={() => go("activity")}>News & inbox{unread > 0 && <span className="badge">{unread}</span>}</button>,
    <button key="sv" role="menuitem" onClick={() => { flushSave(); showToast("Game saved in this browser."); }}>Save game</button>,
    <button key="st" role="menuitem" onClick={() => go("settings")}>Settings</button>,
    <button key="inj" role="menuitem" onClick={() => { const healed = setInjuriesEnabled(league, !injOn); commit(); showToast(!injOn ? "Injuries enabled." : `Injuries disabled. ${healed} players restored to full health.`); }}>Injuries: {injOn ? "on" : "off"}</button>,
    <button key="th" role="menuitem" onClick={() => setThemeNow(applyTheme(themeNow === "light" ? "dark" : themeNow === "dark" ? "auto" : "light"))}>Theme: {themeNow}</button>,
    <button key="tr" role="menuitem" onClick={() => setTour("run")}>Take the tour</button>,
    <button key="up" role="menuitem" onClick={() => go("updates")}>Game updates</button>,
    <button key="ph" role="menuitem" onClick={() => { flushSave(); window.location.href = phoneUrl(); }}>Phone layout</button>,
  ];
  const deskPills = [
    tradeDeadlineOpen && (deadlinePending(league) || deadlineActive(league)) && <button key="dl" className="rk-pill red" onClick={() => go("deadline")}>Trade Deadline</button>,
    (league.phase === "freeagency" || league.phase === "resign") && <button key="fa" className="rk-pill blue" onClick={() => go("freeagency")}>{league.phase === "resign" ? "Re-sign" : "Free Agency"}</button>,
  ].filter(Boolean);
  const deskBar = (
    <DeskBar league={league} user={user} sections={sections} cur={live ? null : where?.section.id || null}
      onSection={(s) => { if (live) return; const keep = s.screens.find((scr) => screenOn(scr, tab, draftSub));
        // Standings and Contracts open on the phase's screen (the bracket in the playoffs, Re-sign in re-sign week).
        if (!keep && (s.id === "standings" || s.id === "contracts")) { go(s.screens[0][1]); return; }
        openScreen(keep || s.screens[0]); }}
      onGo={(id) => go(id)} onSearch={() => !live && setSearchOpen(true)} pills={live ? null : deskPills}
      actions={live ? null : <OfflineChip />} ff={live ? null : <>{deskMain}{deskFF.length > 0 && <div className="gg-ff"><button className="gg-ff-btn rk-quiet" aria-haspopup="menu" aria-expanded={ffOpen} title="Fast forward" onClick={() => setFfOpen((v) => !v)}>⏩</button>{ffOpen && <><div className="rk-scrim" onClick={() => setFfOpen(false)} /><div className="gg-ffmenu" role="menu">{deskFF.map(([l, f]) => <button key={l} role="menuitem" onClick={() => { setFfOpen(false); f(); }}>{l}</button>)}</div></>}</div>}</>}
      menu={deskMenu} />
  );
  // Every section opens on the same hero (common.jsx SectionHero, Gridiron's Team header): the club's
  // colours, the section's block title, the screen's own numbers (heroStats.js) and the section's
  // screens as underline tabs. Phones get the compact band.
  const heroSpec = live || tab === "dashboard" ? null : where && where.section.id !== "home" ? {
    id: where.section.id, label: where.section.label,
    key: where.screen[2] || where.screen[1],
    tabs: where.section.screens.map((scr) => [scr[0], scr[0], scr === where.screen, scr[1] === "trade" && scr[2] === "deadline" ? badgeFor("trade") : scr[1] === "draft" && scr[2] === "floor" ? badgeFor("draft") : null]),
    onTab: (l) => openScreen(where.section.screens.find((x) => x[0] === l)),
  } : null;
  const hero = heroSpec && <SectionHero team={user} compact={phone} eyebrow={heroEyebrow(heroSpec.id, league, user)} title={heroSpec.label}
    stats={heroStats(heroSpec.id, heroSpec.key, league, user)} tabs={heroSpec.tabs} onTab={heroSpec.onTab} />;

  return (
    <GameCtx.Provider value={ctx}>
      <div className={`app${phone ? " rk-phone-app" : ""}`} data-density={league.settings.uiDensity || "compact"} data-text-size={league.settings.textSize || "standard"} data-motion={league.settings.reducedMotion ? "reduced" : "auto"}>
        {phone ? <PhoneHeader team={user} season={seasonLabel} record={recordStr(user.rec)} cap={space} live={!!live} unread={unread} onSearch={() => setSearchOpen(true)} onInbox={() => go("activity")} /> : (
        deskBar)}
        {deadlineActive(league) && !live && <DeadlineTicker league={league} onOpen={() => go("deadline")} />}
        <div className="body">
          <div className={`main${hero ? " rk-heroed" : ""}${!phone && !live && tab !== "dashboard" ? " rk-paged" : ""}`} {...(phone && !live ? swipeHandlers(swipeHub) : {})}><ErrorBoundary key={live ? "live" : tab} onHome={()=>{setLive(null);setTab("dashboard");}}>
            {live ? (
              <LiveGame spec={live} onDone={onLiveDone} />
            ) : (
              <>
                {hero}
                {tab === "dashboard" && <Dashboard act={act} />}
                {tab === "activity" && <ActivityPage />}
                {tab === "lines" && <LinesHub sub={sub.lines} onSub={(k) => setSub("lines", k)} />}
                {tab === "schedule" && <SchedulePage />}
                {tab === "stats" && <StatsPage />}
                {tab === "standings" && <StandingsHub sub={navSub.standings} act={act} />}
                {tab === "contracts" && <ContractsHub sub={navSub.contracts} />}
                {tab === "draft" && <DraftPage act={act} want={draftWant} onView={setDraftView} />}
                {tab === "coaching" && <CoachingHub sub={sub.coaching} onSub={(k) => setSub("coaching", k)} />}
                {tab === "frontoffice" && <FrontOfficeHub sub={sub.frontoffice} onSub={(k) => setSub("frontoffice", k)} />}
                {tab === "trade" && <TradeHub sub={sub.trade} onSub={(k) => setSub("trade", k)} seed={tradeSeed} />}
                {tab === "development" && <DevelopmentHub sub={sub.development} onSub={(k) => setSub("development", k)} />}
                {tab === "league" && <LeagueHub sub={sub.league} onSub={(k) => setSub("league", k)} act={act} />}
                {tab === "settings" && <SettingsPage />}
                {tab === "legacy" && <TrophyRoom view={sub.legacy || "hall"} onView={(k) => setSub("legacy", k)} />}
                {tab === "updates" && <GameUpdates />}
              </>
            )}
          </ErrorBoundary></div>
        </div>
        {!live && !busy && league.playoffs?.papers?.some((p) => !p.seen) && <SeriesPaper paper={league.playoffs.papers.find((p) => !p.seen)} onClose={() => { league.playoffs.papers.find((p) => !p.seen).seen = true; commit(); }} />}
        {searchOpen && !live && <CommandPalette league={league} nav={[...NAV, ...EXTRA_SCREENS]} onClose={()=>setSearchOpen(false)} onNavigate={id=>go(id)} onPlayer={id=>setModal({type:"player",id,context:"search"})} onTeam={tid=>setModal({type:"team",tid})}/>}
        {modal?.type === "paper" && (league.papers || []).some((p) => p.id === modal.id) && <NewsPaper paper={league.papers.find((p) => p.id === modal.id)} onClose={() => { league.papers.find((p) => p.id === modal.id).seen = true; setModal(null); commit(); }} />}
        {modal?.type === "simsummary" && <SimSummary data={modal.data} onClose={() => setModal(null)} />}
        {modal?.type === "player" && <PlayerSheet pid={modal.id} context={modal.context} />}
        {modal?.type === "team" && <TeamModal tid={modal.tid} />}
        {modal?.type === "box" && <BoxScoreModal game={modal.game} />}
        {modal?.type === "stage" && <StageConfirm {...modal} onClose={() => setModal(null)} />}
        {modal?.type === "pick" && <DraftPickCard pid={modal.pid} slot={modal.slot} onClose={() => setModal(null)} />}
        {/* The big moments wait until the sim has stopped, no live game is on and no other popup is open. */}
        {league.moments?.length > 0 && !busy && !live && !modal && <Moment key={league.moments[0].key || league.moments.length} m={league.moments[0]} onClose={() => { const done = closeMoment(league); commit(); if (done?.then) setModal(done.then); }} />}
        {/* The weekly injury report (Gridiron 3.70): app-wide so it tracks spots whatever tab the sim ran from. */}
        {!live && !busy && !phone && <InjuryReportCard />}
        {tour === "welcome" && !live && <TourWelcome onTour={() => { league.settings.tourSeen = true; commit(); setTour("run"); }} onSkip={() => { league.settings.tourSeen = true; commit(); setTour(null); }} />}
        {tour === "run" && !live && <Tour onDone={() => { league.settings.tourSeen = true; commit(); setTour(null); }} />}
        {!modal && !live && !busy && league.ownerReviewPending != null && !league.playoffs?.papers?.some((p) => !p.seen) && <OwnerReview onClose={() => { delete league.ownerReviewPending; commit(); }} />}
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
        <div id="rk-dock" className="rk-dock" />
        {phone && moreOpen && !live && <MoreSheet groups={moreGroups} actions={moreActions} onClose={() => setMoreOpen(false)} />}
        {phone && !live && !busy && !moreOpen && !modal && !searchOpen && !onDeadlineDesk && !(tab === "trade" && tradeSub === "trade") && <MobileActionBar key={`${league.phase}-${tab}`} actions={phoneActions} />}
        {phone && !live && <MobileNav items={phoneNav} moreOpen={moreOpen} moreBadge={moreBadge} onMore={() => setMoreOpen((o) => !o)} />}
        {phone && <TapTips />}
        {confirmEl}
        <FeedbackToast toast={toastHead} waiting={toasts.length - 1} onDismiss={nextToast} />
      </div>
    </GameCtx.Provider>
  );
}

