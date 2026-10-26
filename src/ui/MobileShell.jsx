// Phone navigation, as in the football game: a slim header, a bottom tab bar (Home, Lines,
// Scouting, whatever the season phase is about, More), the day's main action in a big button
// right above it (everything else one tap away behind the ▾), and a full-screen "More" sheet
// with every other screen and the settings. App.jsx decides what goes in each; these draw it.
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TeamBadge, money } from "./common.jsx";
import { Hub } from "./hubs.jsx";
import StandingsPage from "./StandingsPage.jsx";
import StatsPage from "./StatsPage.jsx";
import SchedulePage from "./SchedulePage.jsx";
import PlayoffsPage from "./PlayoffsPage.jsx";
import { OfflineChip } from "./OfflinePanel.jsx";
import Icon from "./Icon.jsx";

// The slim phone header: your club, the season, record and cap room, and search and news.
export function PhoneHeader({ team, season, record, cap, live, unread, onSearch, onInbox }) {
  return (
    <header className="rk-phead" data-tour="phone-head">
      <TeamBadge team={team} size={30} decorative className="rk-phead-badge" />
      <div className="rk-phead-id">
        <div className="rk-phead-name"><span>{team.city} {team.name}</span><OfflineChip /></div>
        <div className="rk-phead-sub">{live ? "Live game" : <>{season} · {record} · Cap room <b className={cap < 0 ? "neg" : ""}>{money(cap)}</b></>}</div>
      </div>
      <button className="rk-phead-btn" disabled={!!live} onClick={onSearch} aria-label="Search players, teams and screens"><Icon name="search" size={20} /></button>
      <button className="rk-phead-btn" disabled={!!live} onClick={onInbox} aria-label="Club news and inbox"><Icon name="bell" size={20} />{unread > 0 && <span className="rk-phead-dot" />}</button>
    </header>
  );
}

// items: [{ key, icon, label, on, onClick, badge }] (icon = an Icon name); the More button is added last.
export function MobileNav({ items, moreOpen, onMore }) {
  return (
    <nav className="rk-mnav" aria-label="Main" data-tour="nav">
      {[...items, { key: "more", icon: "menu", label: "More", more: true }].map((it) => {
        const on = it.more ? moreOpen : !moreOpen && it.on;
        return (
          <button key={it.key} className={on ? "on" : ""} aria-current={on && !it.more ? "page" : undefined} aria-expanded={it.more ? moreOpen : undefined} onClick={it.more ? onMore : it.onClick}>
            <span className="rk-mnav-ico" aria-hidden="true"><Icon name={it.icon} size={22} /></span>
            <span className="rk-mnav-lbl">{it.label}</span>
            {it.badge && <span className="rk-mnav-badge">{it.badge}</span>}
          </button>
        );
      })}
    </nav>
  );
}

// Every other screen, grouped like the computer's bar (Team, Season, Draft, Trades & FA,
// Front Office), then saving and the settings. One column, nothing wider than the screen.
// groups: [{ label, items: [{ key, label, on, onClick, badge }] }]; actions: [{ label, onClick }].
export function MoreSheet({ groups, actions, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    const key = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="rk-msheet" role="dialog" aria-label="More" ref={ref} tabIndex={-1}>
      <div className="rk-msheet-head">
        <span>More</span>
        <button className="rk-msheet-x" onClick={onClose} aria-label="Close"><Icon name="close" size={20} /></button>
      </div>
      {groups.map((g) => (
        <div key={g.label} className="rk-msheet-group">
          <div className="rk-msheet-k">{g.label}</div>
          <div className="rk-msheet-list">
            {g.items.map((it) => <button key={it.key} className={it.on ? "on" : ""} onClick={it.onClick}><span>{it.label}</span>{it.badge && <span className="badge">{it.badge}</span>}<Icon name="chevron" size={16} /></button>)}
          </div>
        </div>
      ))}
      <div className="rk-msheet-group">
        <div className="rk-msheet-k">Settings & help</div>
        <div className="rk-msheet-list">
          {actions.map((a) => <button key={a.label} onClick={a.onClick}><span>{a.label}</span><Icon name="chevron" size={16} /></button>)}
        </div>
      </div>
    </div>
  );
}

// The day's main action sits right above the tab bar, where your thumb is. Anything else (Sim
// Week, Sim to Deadline, Sim Round...) is one tap away behind the ▾.
// actions: [{ label, onClick, tone, small }], the first is the main one; small = a compact pill
// on the left (off Home, so a tap meant for the screen can't sim).
// A screen can show its own bar (the deadline desk's clock controls): it's drawn into App's
// dock (#rk-dock), outside the screen, so the screen's button styles don't reach it.
export function MobileActionBar({ actions }) {
  const [open, setOpen] = useState(false);
  const [arm, setArm] = useState(null); // a big jump (Sim to Deadline, Sim to End) takes a second tap
  const [dock, setDock] = useState(null);
  useEffect(() => { setDock(document.getElementById("rk-dock")); }, []);
  if (!actions?.length) return null;
  const [main, ...rest] = actions;
  const bar = (
    <>
      {open && rest.length > 0 && (
        <div className="rk-abar-scrim" onClick={() => { setOpen(false); setArm(null); }}>
          <div className="rk-abar-menu" role="menu" onClick={(e) => e.stopPropagation()}>
            {rest.map((a) => <button key={a.label} role="menuitem" className={`${a.tone ? `t-${a.tone}` : ""}${arm === a.label ? " armed" : ""}`} onClick={() => { if (a.confirm && arm !== a.label) { setArm(a.label); return; } setArm(null); setOpen(false); a.onClick(); }}>{arm === a.label ? `Tap again: ${a.label}` : a.label}</button>)}
          </div>
        </div>
      )}
      <div className={`rk-abar${main.small ? " small" : ""}`} data-tour="actions">
        <button className={`rk-abar-main${main.tone ? ` t-${main.tone}` : ""}`} onClick={main.onClick}>{main.label}</button>
        {rest.length > 0 && <button className={`rk-abar-more${open ? " on" : ""}`} onClick={() => { setOpen((o) => !o); setArm(null); }} aria-label="More actions" aria-expanded={open}>{open ? "✕" : "▾"}</button>}
      </div>
    </>
  );
  return dock ? createPortal(bar, dock) : bar;
}

// Phones can't hover, so the explanations that live in `title` (badges, chips, notes) never
// show. A tap on a plain element with a title, or a long-press on anything with one (buttons
// too), shows that text in a small popover by your finger. The next tap or a few seconds closes it.
const INTERACTIVE = "button, a, input, select, textarea, label, [role=button], [role=tab], [onclick]";
export function TapTips() {
  const [tip, setTip] = useState(null);
  useEffect(() => {
    let timer = 0, hide = 0, start = null, longShown = false;
    const titled = (el) => { for (let n = el; n && n !== document.body; n = n.parentElement) if (n.getAttribute?.("title")) return n; return null; };
    const show = (el, x, y) => {
      const text = el.getAttribute("title");
      if (!text) return;
      clearTimeout(hide);
      setTip({ text, x, y });
      hide = setTimeout(() => setTip(null), 4500);
    };
    const down = (e) => {
      const t = e.touches[0]; start = { x: t.clientX, y: t.clientY }; longShown = false;
      setTip(null);
      const el = titled(e.target);
      clearTimeout(timer);
      if (el) timer = setTimeout(() => { longShown = true; show(el, start.x, start.y); }, 450);
    };
    const move = (e) => { const t = e.touches[0]; if (start && Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) clearTimeout(timer); };
    const up = (e) => {
      clearTimeout(timer);
      if (longShown) { e.preventDefault(); return; } // the long-press already answered; don't also fire the button
      const el = titled(e.target);
      if (!el || !start) return;
      const ct = e.changedTouches[0];
      if (Math.hypot(ct.clientX - start.x, ct.clientY - start.y) > 10) return;
      // a plain tap explains only things that do nothing else when tapped
      if (e.target.closest(INTERACTIVE) || el.closest(INTERACTIVE)) return;
      show(el, ct.clientX, ct.clientY);
    };
    // A long-press shouldn't also open the browser's own menu on the button.
    const ctx = (e) => { if (longShown) e.preventDefault(); };
    document.addEventListener("touchstart", down, { passive: true });
    document.addEventListener("touchmove", move, { passive: true });
    document.addEventListener("touchend", up, { passive: false });
    document.addEventListener("contextmenu", ctx);
    return () => { clearTimeout(timer); clearTimeout(hide); document.removeEventListener("touchstart", down); document.removeEventListener("touchmove", move); document.removeEventListener("touchend", up); document.removeEventListener("contextmenu", ctx); };
  }, []);
  if (!tip) return null;
  const w = Math.min(280, window.innerWidth - 24);
  const left = Math.max(12, Math.min(tip.x - w / 2, window.innerWidth - w - 12));
  const above = tip.y > 140;
  return <div className="rk-taptip" role="tooltip" style={{ left, width: w, ...(above ? { bottom: window.innerHeight - tip.y + 14 } : { top: tip.y + 18 }) }}>{tip.text}</div>;
}

// Phones: the standings, stats, schedule and playoffs on one screen, a chip for each.
export const SEASON_TABS = [["standings", "Standings"], ["stats", "Stats"], ["schedule", "Schedule"], ["playoffs", "Playoffs"]];
export function SeasonHub({ league, sub, onSub, act }) {
  return (
    <Hub tabs={SEASON_TABS} sub={sub || (league.phase === "playoffs" ? "playoffs" : "standings")} onSub={onSub} deskTabs={[]}>
      {(cur) => (cur === "stats" ? <StatsPage /> : cur === "schedule" ? <SchedulePage /> : cur === "playoffs" ? <PlayoffsPage act={act} /> : <StandingsPage />)}
    </Hub>
  );
}
