import React, { useEffect, useLayoutEffect, useState } from "react";
import { useGame, TeamBadge, Modal } from "./common.jsx";

// A guided tour of the game: a spotlight on the part of the screen each step is about, a
// card that says what it does and how a good GM uses it. Modelled on the football game's.
export const TOUR_STEPS = [
  { title: "Your franchise at a glance", go: "dashboard", sel: ".gg-status-row", text: "Record, cap space, roster health, and how the owner and the room feel. When something needs a decision from you, Needs Attention shows up first: tap it to see the list. Tap any box to jump to that screen." },
  { title: "This week", go: "dashboard", sel: ".gg-home-left", text: "Everything waiting on you, most urgent first: injured starters, contract-year stars who want to talk, empty development slots, offer sheets. A good GM clears this list before simming, because the game will not stop for most of it." },
  { title: "Moving time forward", go: "dashboard", sel: ".gg-head .gg-right", text: "Everything moves from here. Start Season, then Play Live to coach your game shift by shift, or Sim Game to skip it and read the box score. The ⏩ menu sims a week, jumps to Trade Deadline Day or plays out the season. In the offseason the same spot walks you from the draft to re-signing, free agency and the next season." },
  { title: "Getting around", go: "dashboard", sel: ".gg-head", text: "Every screen lives in this bar. Some hold a few related screens, with chips across the top: Lines also has your roster and call-ups, Front Office has the cap overview, contracts, the owner and operations, Trade has the block and free agency, and League has standings, the Legacy Hall and the record book. On a phone the ☰ menu lists them all." },
  { title: "Lines", go: "lines", sel: ".main", text: "Tap a spot on the rink to change who plays there; the list on the right shows every line and the chemistry of each. Auto-set by rating is a fine default, and with Head Coach mode on (Settings) your coach covers injuries so the sim never stalls. Roster & call-ups is where waivers, the farm and LTIR live." },
  { title: "Player development", go: "development", sel: ".main", text: "Your staff gives three players individual attention a week; banked work pays out at the season rollover. The Prospect Watch tracks every draft pick you still hold, wherever he plays, and flags the ones who need a decision. The Pipeline shows the whole system by position. Young players with a strong trait grow fastest: put them in the lab." },
  { title: "Front Office", go: "frontoffice", sel: ".main", text: "Your cap and every contract. The Overview shows the next four seasons, where the money goes against the league, and a Cap Advisor that names the move. Extend young stars in their last year: it only gets pricier at the market. Banked cap space is a deadline budget, so don't spend it on depth you don't need." },
  { title: "Coaching", go: "coaching", sel: ".main", text: "Your head coach and systems, and the game plan for the next opponent. A better bench is worth points over a season. Switch systems to fit the roster you actually have, and set a plan before big games rather than leaving it on auto." },
  { title: "Trades", go: "trade", sel: ".main", text: "Pick a partner (the cards show record and cap space), tick players and picks on both sides and the bar tells you if they'd take it. The Trade Finder proposes deals they'd accept; the Trade Block invites offers on your players. Deadline Day is a live event with calls coming in through the afternoon." },
  { title: "Free agency", go: "freeagency", sel: ".main", text: "Make offers to as many agents as you like; each only has to fit on its own. Agents collect bids for two days and weigh money, role, term and whether you're a contender, and Your Offers tells you where you stand. Re-sign week comes first, when only you can talk to your own players." },
  { title: "Scouting and the draft", go: "draft", sel: ".main", text: "Scouting points buy reports on prospects; area scouts read a whole region at once. Do This Next names the one move that matters. Build your own list before the Combine, and on draft day sim to your pick, then take the best player on your board, not the need." },
  { title: "Schedule, stats and the league", go: "schedule", sel: ".main", text: "Your games (play any of them live), the standings and the playoff picture: who'd be in if the season ended today. Stats has every league leader and award race; League holds standings, playoffs, the Legacy Hall and the record book." },
  { title: "You're all set", go: "dashboard", sel: ".gg-head .gg-right", text: "The game saves itself in this browser; 💾 saves now, and Settings has export, save slots and cloud sync. You can replay this tour from Settings or the ☰ menu any time. Good luck, GM." },
];

export default function Tour({ onDone }) {
  const { go } = useGame();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const step = TOUR_STEPS[i];
  useEffect(() => { go(step.go); }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    let alive = true;
    const place = () => {
      if (!alive) return;
      const el = document.querySelector(step.sel) || document.querySelector(".main");
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      if (r.height > window.innerHeight * 0.62 && step.sel === ".main") setRect({ left: r.left, top: r.top, width: r.width, height: Math.min(r.height, window.innerHeight * 0.62) });
      else setRect({ left: r.left, top: r.top, width: r.width, height: r.height });
    };
    const t1 = setTimeout(() => { const el = document.querySelector(step.sel); if (el && step.sel !== ".main") el.scrollIntoView({ block: "nearest" }); window.scrollTo({ top: 0 }); place(); }, 80);
    const t2 = setTimeout(place, 350);
    window.addEventListener("resize", place);
    return () => { alive = false; clearTimeout(t1); clearTimeout(t2); window.removeEventListener("resize", place); };
  }, [i, step.sel]);
  // Leave every hub on its first chip, then go home.
  const finish = () => { go("trade", "trade"); go("frontoffice", "overview"); go("dashboard"); onDone(); };
  const last = i === TOUR_STEPS.length - 1;
  return (
    <div className="gg-tour" role="dialog" aria-modal="true" aria-label={`Tour step ${i + 1} of ${TOUR_STEPS.length}: ${step.title}`}>
      {rect ? <div className="gg-tour-spot" style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }} /> : <div className="gg-tour-dim" />}
      <div className="gg-tour-card">
        <div className="gg-tour-k">TOUR · {i + 1} OF {TOUR_STEPS.length} <span className="gg-tour-bar"><i style={{ width: `${((i + 1) / TOUR_STEPS.length) * 100}%` }} /></span></div>
        <h3>{step.title}</h3>
        <p>{step.text}</p>
        <div className="gg-tour-actions">
          <button className="ghost" onClick={finish}>{last ? "Close" : "Skip tour"}</button>
          <span style={{ flex: 1 }} />
          {i > 0 && <button onClick={() => setI(i - 1)}>Back</button>}
          <button className="primary" autoFocus onClick={() => (last ? finish() : setI(i + 1))}>{last ? "Let's go" : "Next →"}</button>
        </div>
      </div>
    </div>
  );
}

// The welcome card a new franchise opens with: take the tour, skip it, or stop being asked.
export function TourWelcome({ onTour, onSkip }) {
  const { league } = useGame();
  const t = league.teams[league.userTid];
  const [never, setNever] = useState(false);
  const close = (fn) => { if (never) { try { localStorage.setItem("rinkgm_tour_optout", "1"); } catch {} } fn(); };
  return (
    <Modal title="Welcome" onClose={() => close(onSkip)} bare className="gg-preview gg-welcome">
      <div className="gg-pv" style={{ alignItems: "center", textAlign: "center" }}>
        <TeamBadge team={t} size={64} />
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Welcome to the {t.city} {t.name}, GM</h2>
        <div className="dim">Want a quick tour of where everything is and how to run the club well? About two minutes, and you can leave it any time.</div>
        <button className="primary big" style={{ width: "100%" }} onClick={() => close(onTour)}>Show me around</button>
        <button className="ghost" style={{ width: "100%" }} onClick={() => close(onSkip)}>Skip the tour</button>
        <label className="dim small"><input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} /> Don't offer this on new franchises</label>
      </div>
    </Modal>
  );
}
