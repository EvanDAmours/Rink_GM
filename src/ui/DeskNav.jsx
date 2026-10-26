// Desktop navigation (the football game's "one clean bar"): six sections in one top bar, a season
// button that opens the season at a glance, search, the live-window pills, the phase's buttons and
// one ⋯ menu. Every section opens on the shared page header (common.jsx PageHead): quiet pills
// for its screens, a plain title and one grey line.
import React, { useEffect, useRef, useState } from "react";
import { TeamBadge, recordStr, money } from "./common.jsx";
import Icon from "./Icon.jsx";
import { ROUND_NAMES } from "../engine/playoffs.js";
import { lastDay } from "../engine/schedule.js";

// Each screen: [label, tab, sub (the hub section it opens), subs it covers (for "which tab is on")].
export function sectionsFor(league, { deadlineOpen, frenzyOpen }) {
  return [
    { id: "home", label: "Home", screens: [["Home", "dashboard"]] },
    { id: "team", label: "Team", screens: [["Lines", "lines", "lines", ["lines"]], ["Roster", "lines", "roster", ["roster"]], ["Coaching", "coaching"]] },
    { id: "standings", label: "Standings", screens: [["Standings", "standings"]] },
    { id: "season", label: "Season", screens: [["Schedule", "schedule"], ["Playoffs", "league", "playoffs", ["playoffs"]], ["Stats", "stats"]] },
    { id: "development", label: "Development", screens: [["Overview", "development", "overview", ["overview"]], ["Season plan", "development", "plan", ["plan"]], ["Prospects", "development", "prospects", ["prospects"]]] },
    { id: "draft", label: "Draft", screens: [["Scouting", "draft", "board", ["board", "list", "myscouts", "scouts", "regions"]], ["Draft", "draft", "floor", ["floor", "combine"]], ["Draft Recap", "draft", "recap", ["recap"]]] },
    { id: "market", label: "Trades & FA", screens: [["Trade", "trade", "trade", ["trade"]], ["Trade Block", "trade", "block", ["block"]], [league.phase === "resign" ? "Re-sign" : "Free Agency", "trade", "fa", ["fa"]], ...(deadlineOpen ? [["Deadline Day", "trade", "deadline", ["deadline"]]] : []), ...(frenzyOpen ? [["July 1 Frenzy", "trade", "frenzy", ["frenzy"]]] : [])] },
    { id: "office", label: "Front Office", screens: [["Front Office", "frontoffice"], ["League", "league", "teams", ["teams", "retired", "standings"]], ["Franchise History", "legacy", "club", ["club", "case", "gm"]], ["Record Book", "league", "records", ["records"]], ["League History", "league", "awards", ["awards"]], ["Transactions", "league", "tx", ["tx"]], ["Legacy Hall", "legacy", "hall", ["hall", "trophies", "awards"]]] },
  ];
}
// Default sub of a hub when none was picked yet (mirrors the hubs' own defaults).
const DEFAULT_SUB = { lines: "lines", trade: "trade", league: "standings", legacy: "hall", development: "overview" };
export function screenOn(scr, tab, sub) {
  const [, t, , subs] = scr;
  if (t !== tab) return false;
  if (!subs) return true;
  const v = sub[t] || DEFAULT_SUB[t];
  // Development's old screens (the desk and the pipeline) open its overview and prospects.
  return subs.includes(t === "development" ? ({ development: "overview", pipeline: "prospects" }[v] || (["overview", "plan", "prospects"].includes(v) ? v : "overview")) : v);
}
export function sectionOf(sections, tab, sub) {
  for (const s of sections) for (const scr of s.screens) if (screenOn(scr, tab, sub)) return { section: s, screen: scr };
  return null;
}

// The section's one grey line under the title: the hero's numbers, as plain words.
export function heroLine(id, league, user, h) {
  const rec = user.rec || { w: 0, l: 0, otl: 0, pts: 0 };
  const gp = rec.w + rec.l + rec.otl;
  const cap = h.capSpace >= 0 ? `${money(h.capSpace)} in cap space` : `${money(-h.capSpace)} over the cap`;
  const pts = rec.pts ?? rec.w * 2 + rec.otl;
  const gd = h.goalDiff > 0 ? `+${h.goalDiff}` : String(h.goalDiff);
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  if (id === "team") return [`${user.city} ${user.name}`, recordStr(rec), `${h.active} on the roster`, cap, h.injured ? `${h.injured} injured` : "nobody injured"].join(" · ");
  if (id === "standings" || id === "season") return [recordStr(rec), n(pts, "point", "points"), `${gp} of 82 played`, gp ? `goal difference ${gd}` : null].filter(Boolean).join(" · ");
  if (id === "draft") return [`${h.draftYear} draft`, n(h.picks, "pick", "picks"), h.firstPick ? `first in ${h.firstPick.toLowerCase()}` : null, n(h.reports, "report filed", "reports filed")].filter(Boolean).join(" · ");
  if (id === "market") return [cap, `${h.active} on the roster`, n(h.offers, "trade offer", "trade offers"), n(league.freeAgents?.length || 0, "free agent", "free agents")].join(" · ");
  if (id === "office") return [cap, `${money(h.payroll)} payroll`, `${h.expiring} expiring`, `fans ${h.fans}%`].join(" · ");
  return "";
}

const PHASE_STAGES = [["preseason", "Preseason"], ["regular", "Regular season"], ["playoffs", "Playoffs"], ["draft", "Draft"], ["resign", "Re-sign"], ["freeagency", "Free agency"]];

export function seasonLabel(league, user) {
  const rec = user.rec;
  const gp = rec.w + rec.l + rec.otl;
  const ph = league.phase;
  const when = ph === "regular" ? `Game ${Math.min(82, gp + 1)}` : ph === "playoffs" ? (league.playoffs?.champion != null ? "Playoffs over" : ROUND_NAMES[league.playoffs?.round || 0] || "Playoffs") : { preseason: "Preseason", draft: "Draft", resign: "Re-signing", freeagency: "Free agency" }[ph] || league.year;
  return `${recordStr(rec)} · ${when}`;
}

// The season button's dropdown: every game as a box (W / L / OTL, the next one ringed), the stages
// of the year and links to the season's screens.
export function SeasonMenu({ league, user, onGo, onClose }) {
  const mine = league.schedule.filter((g) => g.h === user.id || g.a === user.id);
  const next = mine.find((g) => !g.played);
  const stageIdx = PHASE_STAGES.findIndex(([k]) => k === league.phase);
  const res = (g) => {
    if (!g.played) return null;
    const home = g.h === user.id, us = home ? g.hs : g.as, them = home ? g.as : g.hs;
    return us > them ? "W" : g.ot ? "O" : "L";
  };
  const ref = useRef(null);
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <>
      <div className="rk-scrim" onClick={onClose} />
      <div className="rk-seasonmenu" ref={ref} role="dialog" aria-label="Your season">
        <div className="rk-sm-head">{league.year}-{String(league.year + 1).slice(2)} season · {recordStr(user.rec)}</div>
        <div className="rk-sm-games">
          {mine.map((g, i) => {
            const r = res(g), opp = league.teams[g.h === user.id ? g.a : g.h];
            return <button key={g.id ?? i} className={`rk-sm-g ${r ? r.toLowerCase() : ""}${g === next ? " next" : ""}`} title={`Game ${i + 1}: ${g.h === user.id ? "vs" : "@"} ${opp?.abbr}${r ? ` · ${g.h === user.id ? g.hs : g.as}-${g.h === user.id ? g.as : g.hs}${g.ot ? " OT" : ""}` : ""}`} onClick={() => { onGo("schedule"); onClose(); }}>{r === "O" ? "OT" : r || ""}</button>;
          })}
        </div>
        <div className="rk-sm-legend"><span className="w">W</span> win <span className="l">L</span> loss <span className="o">OT</span> overtime loss · ringed: next game{mine.length && lastDay(league.schedule) ? "" : ""}</div>
        <div className="rk-sm-stages">
          {PHASE_STAGES.map(([k, l], i) => <span key={k} className={i === stageIdx ? "on" : i < stageIdx ? "done" : ""}>{l}</span>)}
        </div>
        <div className="rk-sm-links">
          {[["Schedule", "schedule"], ["Standings", "standings"], ["Playoffs", "playoffs"], ["Stats", "stats"]].map(([l, id]) => <button key={id} onClick={() => { onGo(id); onClose(); }}>{l}</button>)}
        </div>
      </div>
    </>
  );
}

export function DeskBar({ league, user, sections, cur, onSection, onGo, onSearch, pills, actions, ff, menu }) {
  const [seasonOpen, setSeasonOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="rk-bar">
      <div className="rk-bar-left">
        <TeamBadge team={user} size={34} className="gg-badge" />
        <button className={`rk-seasonbtn${seasonOpen ? " on" : ""}`} aria-expanded={seasonOpen} title="Your season, game by game" onClick={() => setSeasonOpen((v) => !v)}>
          <b>{user.name}</b>
          <span>{seasonLabel(league, user)} {seasonOpen ? "▴" : "▾"}</span>
        </button>
        {seasonOpen && <SeasonMenu league={league} user={user} onGo={onGo} onClose={() => setSeasonOpen(false)} />}
      </div>
      <nav className="rk-bar-nav" aria-label="Main navigation">
        {sections.map((s) => <button key={s.id} aria-current={cur === s.id ? "page" : undefined} className={cur === s.id ? "on" : ""} onClick={() => onSection(s)}>{s.label}{s.badge && <span className="badge">{s.badge}</span>}</button>)}
      </nav>
      <div className="rk-bar-right">
        <button className="rk-search" onClick={onSearch} aria-label="Search players, teams and screens" title="Search (press / or Ctrl+K)"><Icon name="search" size={16} /><span className="rk-search-t">Search</span><kbd>/</kbd></button>
        {pills}
        <div className="rk-bar-actions">{actions}{ff}</div>
        <div className="rk-more">
          <button className="rk-more-btn" aria-label="More" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>⋯</button>
          {menuOpen && <><div className="rk-scrim" onClick={() => setMenuOpen(false)} /><div className="rk-moremenu" role="menu" onClick={() => setMenuOpen(false)}>{menu}</div></>}
        </div>
      </div>
    </header>
  );
}
