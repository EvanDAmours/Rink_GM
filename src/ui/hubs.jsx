import React, { useState } from "react";
import { useGame } from "./common.jsx";
import LinesPage from "./LinesPage.jsx";
import RosterPage from "./RosterPage.jsx";
import FrontOfficePage from "./FrontOfficePage.jsx";
import GamePlanPage from "./GamePlanPage.jsx";
import HockeyOperationsPage from "./HockeyOperationsPage.jsx";
import TradePage from "./TradePage.jsx";
import TradeBlockPage from "./TradeBlockPage.jsx";
import FreeAgencyPage from "./FreeAgencyPage.jsx";
import DeadlinePage from "./DeadlinePage.jsx";
import FrenzyPage from "./FrenzyPage.jsx";
import { frenzyFor } from "../engine/frenzy.js";
import StandingsPage from "./StandingsPage.jsx";
import PlayoffsPage from "./PlayoffsPage.jsx";
import LeaguePage from "./LeaguePage.jsx";
import DevelopmentDesk from "./DevelopmentDesk.jsx";
import CapOverview, { CapGuide } from "./CapOverview.jsx";
import RecordBookPage from "./RecordBookPage.jsx";
import ContractsTable from "./ContractsTable.jsx";
import { ResignPage } from "./FreeAgencyPage.jsx";
import { deadlinePending, deadlineActive, userOffers } from "../engine/market.js";

// One body for a family of screens. The section hero above (App: common.jsx SectionHero) carries
// the section's screens as tabs, the title and the numbers, on phones and computers alike, so a
// hub only keeps its inner views as a small segmented filter (deskTabs: the ones it keeps).
// The screens inside render without their own title (see .gg-embed in gridiron.css).
export function Hub({ tabs, sub, onSub, badges = {}, right, children, deskTabs }) {
  const cur = tabs.some(([k]) => k === sub) ? sub : tabs[0][0];
  const chips = !deskTabs ? tabs : tabs.filter(([k]) => deskTabs.includes(k));
  const showHead = chips.length > 1 || right;
  return (
    <div className="stack gg-hub">
      {showHead && <div className="gg-pagehead gg-hub-head">
        {chips.length > 1 && <div className="gg-chips gg-hub-chips">{chips.map(([k, l]) => <button key={k} className={cur === k ? "on" : ""} onClick={() => onSub(k)}>{l}{badges[k] && <span className="badge">{badges[k]}</span>}</button>)}</div>}
        {right}
      </div>}
      <div className="gg-embed">{typeof children === "function" ? children(cur) : children}</div>
    </div>
  );
}

export function LinesHub({ sub, onSub }) {
  const { league } = useGame();
  const t = league.teams[league.userTid];
  const { go } = useGame();
  // Coaching is its own screen; the pill is here so the phone's Team pills match Lineup's.
  const tabs = [["lines", "Lines"], ["roster", "Roster"], ["coaching", "Coaching"]];
  const cur = sub || "lines";
  if (cur === "lines") return <LinesPage onRoster={() => onSub("roster")} />;
  return <Hub title="Roster" status={`${t.city} ${t.name} · manage the people who define your season`} tabs={tabs} sub={cur} onSub={(k) => (k === "coaching" ? go("coaching") : onSub(k))} deskTabs={[]}><RosterPage /></Hub>;
}

export function CoachingHub({ sub, onSub }) {
  const { league } = useGame();
  const t = league.teams[league.userTid];
  const tabs = [["coaching", "Head coach"], ["plan", "Game plan"]];
  return (
    <Hub title="Coaching" status={`${t.coach?.name || "Head coach"} · systems, tactics and the plan for the next opponent`} tabs={tabs} sub={sub} onSub={onSub}>
      {(cur) => (cur === "plan" ? <GamePlanPage /> : <FrontOfficePage view="coaching" />)}
    </Hub>
  );
}

export function FrontOfficeHub({ sub, onSub }) {
  const { league } = useGame();
  const t = league.teams[league.userTid];
  // Contracts is its own section now (ContractsHub); the cap overview stays here.
  const tabs = [["overview", "Overview"], ["owner", "Owner"], ["ops", "Operations"], ["capguide", "How the cap works"]];
  return (
    <Hub title="Front Office" status={`${t.city} ${t.name} · your cap, the owner and hockey operations`} tabs={tabs} sub={sub} onSub={onSub}>
      {(cur) => (cur === "ops" ? <HockeyOperationsPage /> : cur === "overview" ? <CapOverview /> : cur === "capguide" ? <CapGuide /> : <FrontOfficePage view={cur} />)}
    </Hub>
  );
}

// Development is its own section: Overview · Season plan · Prospects (DevelopmentDesk.jsx).
export function DevelopmentHub({ sub, onSub }) {
  return <DevelopmentDesk sub={sub} onSub={onSub} />;
}

export function TradeHub({ sub, onSub, seed }) {
  const { league } = useGame();
  const dl = (league.phase === "regular" || league.phase === "playoffs") && (deadlinePending(league) || (league.deadline?.year === league.year && !league.deadline.synthetic));
  const tabs = [["trade", "Trade Center"], ["block", "Trade Block"], ["fa", "Free Agency"], ...(dl ? [["deadline", "Deadline Day"]] : []), ...(league.phase === "freeagency" && (frenzyFor(league) || (league.fa?.day || 0) === 0) ? [["frenzy", "July 1 Frenzy"]] : [])];
  const offers = userOffers(league).length;
  const badges = { block: offers ? String(offers) : null, fa: league.phase === "freeagency" ? "OPEN" : null, deadline: deadlinePending(league) || deadlineActive(league) ? "LIVE" : null, frenzy: league.phase === "freeagency" && !frenzyFor(league)?.done && (league.fa?.day || 0) === 0 ? "LIVE" : null };
  return (
    <Hub title="Trade & Market" status="Trades, the league-wide block, free agency and the deadline" tabs={tabs} sub={sub} onSub={onSub} badges={badges} deskTabs={[]}>
      {(cur) => (cur === "block" ? <TradeBlockPage /> : cur === "fa" ? <FreeAgencyPage /> : cur === "deadline" ? <DeadlinePage /> : cur === "frenzy" ? <FrenzyPage /> : <TradePage seed={seed} />)}
    </Hub>
  );
}

// League: one tab for the clubs, the league's history (awards, Cups) and the retired, with the
// Record Book and Transactions beside it in Front Office. Standings and the playoffs have their own section.
export const LEAGUE_VIEWS = [["teams", "Teams"], ["awards", "History"], ["retired", "Retired"]];
export function LeagueHub({ sub, onSub }) {
  const { league } = useGame();
  const tabs = [...LEAGUE_VIEWS, ["records", "Record Book"], ["tx", "Transactions"]];
  const cur = tabs.some(([k]) => k === sub) ? sub : "teams";
  return (
    <Hub title="League" status={`${league.year}-${String(league.year + 1).slice(2)} · 32 clubs`} tabs={tabs} sub={cur} onSub={onSub} deskTabs={LEAGUE_VIEWS.some(([k]) => k === cur) ? LEAGUE_VIEWS.map(([k]) => k) : []}>
      {(c) => (c === "records" ? <RecordBookPage /> : <LeaguePage view={c} />)}
    </Hub>
  );
}

// Standings: the tables and the playoff picture, and the Playoffs (the bracket while they're on,
// the bracket today's seeds would make before that). The hero carries the two as tabs.
export function StandingsHub({ sub, act }) {
  const { league } = useGame();
  const cur = sub === "playoffs" || sub === "table" ? sub : league.phase === "playoffs" ? "playoffs" : "table";
  return <div className="gg-embed">{cur === "playoffs" ? <PlayoffsPage act={act} /> : <StandingsPage />}</div>;
}

// Contracts: every deal you carry, and in re-sign week the Re-sign screen first.
export function ContractsHub({ sub }) {
  const { league } = useGame();
  const resign = league.phase === "resign";
  const cur = sub === "resign" && resign ? "resign" : sub === "contracts" ? "contracts" : resign ? "resign" : "contracts";
  return <div className="gg-embed">{cur === "resign" ? <ResignPage /> : <ContractsTable />}</div>;
}
