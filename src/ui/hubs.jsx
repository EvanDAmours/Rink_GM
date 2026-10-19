import React, { useState } from "react";
import { useGame, TeamBadge } from "./common.jsx";
import LinesPage from "./LinesPage.jsx";
import RosterPage from "./RosterPage.jsx";
import FrontOfficePage from "./FrontOfficePage.jsx";
import GamePlanPage from "./GamePlanPage.jsx";
import HockeyOperationsPage from "./HockeyOperationsPage.jsx";
import TradePage from "./TradePage.jsx";
import TradeBlockPage from "./TradeBlockPage.jsx";
import FreeAgencyPage from "./FreeAgencyPage.jsx";
import DeadlinePage from "./DeadlinePage.jsx";
import StandingsPage from "./StandingsPage.jsx";
import PlayoffsPage from "./PlayoffsPage.jsx";
import LeaguePage from "./LeaguePage.jsx";
import DevelopmentPage from "./DevelopmentPage.jsx";
import PipelinePage from "./PipelinePage.jsx";
import TrophyRoom from "./TrophyRoom.jsx";
import RecordBookPage from "./RecordBookPage.jsx";
import { deadlinePending, deadlineActive, userOffers } from "../engine/market.js";

// One header for a family of screens: title, a line of status, and the section chips.
// The screens inside render without their own title (see .gg-embed in gridiron.css).
export function Hub({ title, status, tabs, sub, onSub, badges = {}, right, children }) {
  const cur = tabs.some(([k]) => k === sub) ? sub : tabs[0][0];
  return (
    <div className="stack gg-hub">
      <div className="gg-pagehead gg-hub-head">
        <div><h2>{title}</h2>{status && <div className="gg-status">{status}</div>}</div>
        <div className="gg-chips gg-hub-chips">{tabs.map(([k, l]) => <button key={k} className={cur === k ? "on" : ""} onClick={() => onSub(k)}>{l}{badges[k] && <span className="badge">{badges[k]}</span>}</button>)}</div>
        {right}
      </div>
      <div className="gg-embed">{typeof children === "function" ? children(cur) : children}</div>
    </div>
  );
}

export function LinesHub({ sub, onSub }) {
  const { league } = useGame();
  const t = league.teams[league.userTid];
  const tabs = [["lines", "Lines"], ["roster", "Roster"]];
  const cur = sub || "lines";
  if (cur === "lines") return <LinesPage onRoster={() => onSub("roster")} />;
  return <Hub title="Roster" status={`${t.city} ${t.name} · manage the people who define your season`} tabs={tabs} sub={cur} onSub={onSub}><RosterPage /></Hub>;
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
  const tabs = [["contracts", "Contracts"], ["owner", "Owner"], ["ops", "Operations"]];
  return (
    <Hub title="Front Office" status={`${t.city} ${t.name} · contracts, the owner and hockey operations`} tabs={tabs} sub={sub} onSub={onSub}>
      {(cur) => (cur === "ops" ? <HockeyOperationsPage /> : <FrontOfficePage view={cur} />)}
    </Hub>
  );
}

// Player development gets its own front door: the plan, the prospect watch and the pipeline.
export function DevelopmentHub({ sub, onSub }) {
  const { league } = useGame();
  const t = league.teams[league.userTid];
  const rising = [...t.roster, ...t.prospects].map((id) => league.players[id]).filter((p) => p && (p.lastChange || 0) >= 2).length;
  const tabs = [["development", "Development"], ["pipeline", "Pipeline"]];
  return (
    <Hub title="Player Development" status={`${t.prospects.length} on the farm · ${rising} players up 2+ since last season · focus slots, the prospect watch and the pipeline`} tabs={tabs} sub={sub} onSub={onSub}>
      {(cur) => (cur === "pipeline" ? <PipelinePage /> : <DevelopmentPage />)}
    </Hub>
  );
}

export function TradeHub({ sub, onSub, seed }) {
  const { league } = useGame();
  const dl = (league.phase === "regular" || league.phase === "playoffs") && (deadlinePending(league) || (league.deadline?.year === league.year && !league.deadline.synthetic));
  const tabs = [["trade", "Trade Center"], ["block", "Trade Block"], ["fa", league.phase === "resign" ? "Re-sign" : "Free Agency"], ...(dl ? [["deadline", "Deadline Day"]] : [])];
  const offers = userOffers(league).length;
  const badges = { block: offers ? String(offers) : null, fa: league.phase === "resign" || league.phase === "freeagency" ? "OPEN" : null, deadline: deadlinePending(league) || deadlineActive(league) ? "LIVE" : null };
  return (
    <Hub title="Trade & Market" status="Trades, the league-wide block, free agency and the deadline" tabs={tabs} sub={sub} onSub={onSub} badges={badges}>
      {(cur) => (cur === "block" ? <TradeBlockPage /> : cur === "fa" ? <FreeAgencyPage /> : cur === "deadline" ? <DeadlinePage /> : <TradePage seed={seed} />)}
    </Hub>
  );
}

export function LeagueHub({ sub, onSub, act }) {
  const { league } = useGame();
  const tabs = [["standings", "Standings"], ["playoffs", "Playoffs"], ["teams", "Teams"], ["legacy", "Legacy Hall"], ["records", "Record Book"], ["awards", "Awards & History"], ["tx", "Transactions"], ["retired", "Retired"]];
  const badges = { playoffs: league.phase === "playoffs" ? "ON" : null };
  return (
    <Hub title="League" status={`${league.year}-${String(league.year + 1).slice(2)} · 32 clubs`} tabs={tabs} sub={sub} onSub={onSub} badges={badges}>
      {(cur) => (cur === "standings" ? <StandingsPage /> : cur === "playoffs" ? <PlayoffsPage act={act} /> : cur === "legacy" ? <TrophyRoom /> : cur === "records" ? <RecordBookPage /> : <LeaguePage view={cur} />)}
    </Hub>
  );
}
