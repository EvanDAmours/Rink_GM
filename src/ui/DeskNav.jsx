// Desktop navigation (the football game's "one clean bar"): six sections in one top bar, a season
// button that opens the season at a glance, search, the live-window pills, the phase's buttons and
// one ⋯ menu. Every section opens on the section hero (common.jsx SectionHero, numbers in
// heroStats.js) with its screens as underline tabs.
import React, { useEffect, useRef, useState } from "react";
import { TeamBadge, recordStr } from "./common.jsx";
import Icon from "./Icon.jsx";
import { ROUND_NAMES } from "../engine/playoffs.js";
import { lastDay } from "../engine/schedule.js";

// The sections, their screens and which one is on live in navRoute.js (pure, so tests check them).
export { sectionsFor, screenOn, sectionOf, defaultSubs } from "./navRoute.js";

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
