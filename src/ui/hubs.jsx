import React, { useState } from "react";
import { useGame, TeamBadge, PageHead } from "./common.jsx";
import { usePhone } from "./mobile.js";
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
import { deadlinePending, deadlineActive, userOffers } from "../engine/market.js";

// One header for a family of screens. On a phone it is the shared page header (PageHead: quiet
// pills for the hub's screens, a big plain title, one grey line), the same as Lineup and
// Development. On a computer the section header above (App's PageHead) carries the pills and the
// title, so only the inner views stay, as a small segmented filter (deskTabs: the ones it keeps).
// The screens inside render without their own title (see .gg-embed in gridiron.css).
export function Hub({ title, status, tabs, sub, onSub, badges = {}, right, children, deskTabs }) {
  const phone = usePhone();
  const cur = tabs.some(([k]) => k === sub) ? sub : tabs[0][0];
  const chips = !deskTabs ? tabs : tabs.filter(([k]) => deskTabs.includes(k));
  const curLabel = tabs.find(([k]) => k === cur)?.[1];
  if (phone) {
    return (
      <div className="stack gg-hub">
        <PageHead label={title} pills={tabs.map(([k, l]) => [k, l, cur === k, badges[k]])} onPick={onSub}
          title={!curLabel || /^overview$/i.test(curLabel) ? title : curLabel} sub={status} right={right} />
        <div className="gg-embed">{typeof children === "function" ? children(cur) : children}</div>
      </div>
    );
  }
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
  const tabs = [["overview", "Overview"], ["contracts", "Contracts"], ["owner", "Owner"], ["ops", "Operations"], ["capguide", "How the cap works"]];
  return (
    <Hub title="Front Office" status={`${t.city} ${t.name} · your cap, every contract, the owner and hockey operations`} tabs={tabs} sub={sub} onSub={onSub}>
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
  const tabs = [["trade", "Trade Center"], ["block", "Trade Block"], ["fa", league.phase === "resign" ? "Re-sign" : "Free Agency"], ...(dl ? [["deadline", "Deadline Day"]] : []), ...(league.phase === "freeagency" && (frenzyFor(league) || (league.fa?.day || 0) === 0) ? [["frenzy", "July 1 Frenzy"]] : [])];
  const offers = userOffers(league).length;
  const badges = { block: offers ? String(offers) : null, fa: league.phase === "resign" || league.phase === "freeagency" ? "OPEN" : null, deadline: deadlinePending(league) || deadlineActive(league) ? "LIVE" : null, frenzy: league.phase === "freeagency" && !frenzyFor(league)?.done && (league.fa?.day || 0) === 0 ? "LIVE" : null };
  return (
    <Hub title="Trade & Market" status="Trades, the league-wide block, free agency and the deadline" tabs={tabs} sub={sub} onSub={onSub} badges={badges} deskTabs={[]}>
      {(cur) => (cur === "block" ? <TradeBlockPage /> : cur === "fa" ? <FreeAgencyPage /> : cur === "deadline" ? <DeadlinePage /> : cur === "frenzy" ? <FrenzyPage /> : <TradePage seed={seed} />)}
    </Hub>
  );
}

export function LeagueHub({ sub, onSub, act }) {
  const { league } = useGame();
  // The Legacy Hall is its own tab in the bar (as in the football game).
  const tabs = [["standings", "Standings"], ["playoffs", "Playoffs"], ["teams", "Teams"], ["records", "Record Book"], ["awards", "Awards & History"], ["tx", "Transactions"], ["retired", "Retired"]];
  const badges = { playoffs: league.phase === "playoffs" ? "ON" : null };
  return (
    <Hub title="League" status={`${league.year}-${String(league.year + 1).slice(2)} · 32 clubs`} tabs={tabs} sub={sub} onSub={onSub} badges={badges} deskTabs={["standings", "teams", "retired"].includes(sub || "standings") ? ["teams", "retired"] : []}>
      {(cur) => (cur === "standings" ? <StandingsPage /> : cur === "playoffs" ? <PlayoffsPage act={act} /> : cur === "records" ? <RecordBookPage /> : <LeaguePage view={cur} />)}
    </Hub>
  );
}
