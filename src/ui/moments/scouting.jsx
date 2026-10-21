// Scouting beats: checkpoints that pause the sim, scouting misses revealed, a hidden gem or a red flag confirmed.
// Export { kind: Component }. Each component gets { m, onClose } and usually renders MomentFrame
// from ../MomentFrame.jsx. Put this family's styles in ./scouting.css (imported here).
//   scoutCheckpoint  (Gridiron 2.91 / 3.6) every fourth week: Central Scouting's list moved and your
//                    scouts want eyes on prospects near your pick. It pauses a running sim: Keep
//                    simming, scout everyone it lists (the sim then carries on by itself), or Stop.
//   scoutReveal      (Gridiron 2.20) after his second season a draftee's real ceiling is out.
import React, { useEffect, useRef, useState } from "react";
import "./scouting.css";
import { useGame, PlayerName } from "../common.jsx";
import Headshot from "../Headshot.jsx";
import { MomentFrame } from "../MomentFrame.jsx";
import { prospectRead, csRank, scoutCost, SCOUT_PTS_CAP } from "../../engine/scouting.js";
import { dayToDate } from "../../engine/schedule.js";
import { POS_COLOR } from "../TradePage.jsx";
import { ScoutButton, ScoutFlags, RoleTag } from "../scoutingBits.jsx";

// ---------- Pause and resume (Gridiron 3.6) ----------
// A checkpoint moment carries stop: true, so the app's chunked sim stops when it's queued. To pick
// the sim back up, the card needs to know which sim was running. The app can say so directly:
// set simControl.resume to a function that restarts it (e.g. act.simToEnd) when a long sim starts,
// and clear it when one ends on its own. Until it does, the card remembers the sim from the app's
// busy overlay ("Simulating the regular season — Nov 2") and restarts it from the header's
// fast-forward menu.
export const simControl = { resume: null, session: null };
const LONG_SIMS = [[/trade deadline/i, "Sim to Deadline"], [/regular season/i, "Sim to End of Season"]];
if (typeof window !== "undefined" && typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
  const read = (node) => {
    const box = node.querySelector?.(".box");
    const label = box ? [...box.children].map((el) => el.textContent || "").find((t) => /^Simulat/i.test(t.trim())) : null;
    return label ? label.trim() : null;
  };
  const watch = () => {
    try {
      new MutationObserver((records) => {
        for (const r of records) {
          for (const n of r.addedNodes) if (n.nodeType === 1 && n.classList?.contains("overlay")) { const label = read(n); if (label) simControl.session = { label, done: false }; }
          for (const n of r.removedNodes) if (n.nodeType === 1 && n.classList?.contains("overlay") && simControl.session) { const label = read(n); if (label) simControl.session.label = label; simControl.session.ended = true; }
        }
      }).observe(document.body, { childList: true, subtree: true });
    } catch { /* no DOM to watch */ }
  };
  if (document.body) watch(); else window.addEventListener("DOMContentLoaded", watch, { once: true });
}
// Was a long sim running when this checkpoint stopped it? The overlay's last label carries the
// sim's date, a few days at most before the checkpoint's.
function pausedSim(league, m) {
  if (simControl.resume) return { menu: null, label: "the sim" };
  const s = simControl.session;
  if (!s || s.done || !s.ended) return null;
  const kind = LONG_SIMS.find(([re]) => re.test(s.label));
  if (!kind) return null;
  const date = s.label.split("—").pop().trim();
  for (let d = m.day + 1; d >= m.day - 8; d--) if (dayToDate(league.year, d, league.scheduleStart) === date) return { menu: kind[1], label: kind[1] === "Sim to Deadline" ? "the trade deadline" : "the end of the regular season" };
  return null;
}
function resumeSim(paused) {
  if (simControl.session) simControl.session.done = true;
  if (simControl.resume) { const f = simControl.resume; setTimeout(() => f(), 30); return; }
  if (!paused?.menu) return;
  // The header's fast-forward menu: open it, then pick the same sim.
  setTimeout(() => {
    const ff = document.querySelector(".gg-ff-btn");
    if (!ff) return;
    ff.click();
    setTimeout(() => {
      const item = [...document.querySelectorAll(".gg-ffmenu button")].find((b) => b.textContent.trim() === paused.menu);
      if (item) item.click(); else ff.click();
    }, 60);
  }, 40);
}

const Pos = ({ pos }) => <span className="gg-pos" style={{ background: POS_COLOR[pos] || "#64748b" }}>{pos}</span>;

function ScoutCheckpoint({ m, onClose }) {
  const { league, go } = useGame();
  const t = league.teams[league.userTid];
  const [paused] = useState(() => pausedSim(league, m));
  const targets = (m.targetIds || []).map((id) => league.players[id]).filter((p) => p && p.tid === -2);
  const pts = t.scoutPts || 0, cap = m.cap || SCOUT_PTS_CAP, full = pts >= cap - 1;
  const cheapest = Math.min(...targets.map((p) => scoutCost(p) || 99), 99);
  // Everyone it asked for now has a report: mid-sim, carry on by itself (only once you've scouted here).
  const allDone = targets.length > 0 && targets.every((p) => prospectRead(league, p).lvl > 0);
  const startedDone = useRef(allDone);
  const go1 = useRef(null);
  // Focus the main button without scrolling the sheet (on phones the header must stay in view).
  useEffect(() => { try { go1.current?.focus({ preventScroll: true }); } catch { /* old browser */ } }, []);
  const close = (resume) => { onClose(); if (resume) resumeSim(paused); else if (simControl.session) simControl.session.done = true; };
  useEffect(() => {
    if (!paused || !allDone || startedDone.current) return;
    const id = setTimeout(() => close(true), 1200);
    return () => clearTimeout(id);
  }, [allDone]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const key = (e) => { if (e.key === "Escape") close(!!paused); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const lost = m.lost || 0;
  return (
    <div className="sc-cp-overlay" onClick={() => close(!!paused)}>
      <div className="sc-cp" role="dialog" aria-modal="true" aria-label="Scouting checkpoint" onClick={(e) => e.stopPropagation()}>
        <div className="sc-cp-head">
          <div className="sc-cp-titles">
            <div className="sc-cp-kicker">🔭 SCOUTING CHECKPOINT · WEEK {m.week}</div>
            <div className="sc-cp-title">Your scouts are back from the road</div>
            <div className="sc-cp-sub">{m.pick ? <>You pick around <b>#{m.pick}</b> right now. Every report you file now is a pick you don't make blind in June.</> : "The draft order takes shape as the standings settle. Every report you file now is a pick you don't make blind in June."}</div>
            {paused && <div className="sc-cp-paused">{allDone && !startedDone.current ? "✓ All scouted. Back to the sim…" : `⏸ Sim paused. It carries on to ${paused.label} when you're done here.`}</div>}
          </div>
          <div className="sc-cp-pts" title="Scouting points to spend on reports and workups"><b>{pts}</b><span>SCOUTING<br />POINT{pts === 1 ? "" : "S"} LEFT</span></div>
        </div>
        {(full || lost > 0) && <div className="sc-cap">⚠ Your scouts carry at most <b>{cap}</b> points of unfiled work; past that, each week's point is lost.{lost > 0 ? <> You've already lost <b>{lost}</b> this year.</> : " You're at the cap: spend some now."}</div>}
        <div className="sc-cp-cols">
          <div className="sc-cp-box">
            <div className="sc-cp-h stock">📈 JUNIOR STOCK WATCH</div>
            <div className="sc-cp-note">Central Scouting's list moved. Some of it is real, some of it is hype; only a report tells you which.</div>
            {(m.news || []).length ? m.news.map((n) => (
              <div key={n.pid} className="sc-cp-news">
                <b className={n.dir > 0 ? "good" : "bad"}>{n.dir > 0 ? "▲" : "▼"}</b>
                <span><b>{n.name}</b> <span className="dim">{n.pos} · {n.team}</span><small>#{n.from} → #{n.to}: {n.why}</small></span>
              </div>
            )) : <div className="dim small">A quiet month on the junior beat.</div>}
          </div>
          <div className="sc-cp-box">
            <div className="sc-cp-h eyes">🎯 YOUR SCOUTS WANT EYES ON</div>
            {targets.length ? targets.map((p) => {
              const r = prospectRead(league, p);
              return (
                <div key={p.id} className="sc-cp-target">
                  <Pos pos={p.pos} />
                  <div className="sc-cp-tw">
                    <div className="sc-cp-tn"><PlayerName p={p} /> <RoleTag p={p} /> <ScoutFlags read={r} compact /></div>
                    <small>CS #{csRank(p)} · {p.bio?.team || "junior"} · {r.lvl === 0 ? "no report yet" : r.lvl === 1 ? "report filed; workup next" : "fully scouted"}</small>
                  </div>
                  <span className={`sc-cp-grade${r.grade ? ` g${r.grade[0].toLowerCase()}` : ""}`} title="Your read on his ceiling">{r.grade || "??"}</span>
                  <ScoutButton p={p} read={r} className="small" />
                </div>
              );
            }) : <div className="dim small">Everyone near your pick is scouted. Nice work.</div>}
            {targets.length > 0 && pts < cheapest && <div className="bad small" style={{ marginTop: 6 }}>Not enough points for these. More come in every week.</div>}
            {paused && targets.length > 0 && !allDone && <div className="dim tiny" style={{ marginTop: 6 }}>Scout everyone here and the sim carries on by itself.</div>}
          </div>
        </div>
        <div className="sc-cp-actions">
          {paused && <button className="sc-cp-stop" onClick={() => close(false)}>■ Stop the sim</button>}
          <button ref={go1} className={paused ? "primary" : ""} onClick={() => close(!!paused)}>{paused ? "▶ Keep simming" : "Back to the season"}</button>
          <button className="sc-cp-open" onClick={() => { close(false); go("draft"); }}>🔭 Open the scouting board</button>
        </div>
      </div>
    </div>
  );
}

// After his second season: the real ceiling is out. A steal gets confetti; a miss doesn't.
function ScoutReveal({ m, onClose }) {
  const { league } = useGame();
  const team = league.teams[m.tid] || league.teams[league.userTid];
  const p = league.players[m.pid];
  const face = { ...(p || {}), ...(m.p || {}), number: m.p?.num ?? p?.number };
  const d = m.draft;
  return (
    <MomentFrame m={m} team={team} kicker={m.kicker} title={m.title} party={m.steal} onClose={onClose} className={`sc-rev ${m.steal ? "steal" : "miss"}`}>
      <div className="mm-player sc-rev-body">
        <Headshot p={face} team={team} size={88} decorative />
        <div className="mm-player-text">
          <div className="mm-player-name">{m.p?.name}</div>
          <div className="mm-player-meta"><span className="mm-pos">{m.p?.pos}</span><span>{d ? `${d.year} draft · round ${d.round}, #${d.pick}` : "Drafted by you"}</span></div>
          <div className="sc-rev-nums">
            <span><small>DRAFT-DAY READ</small><b>{m.from}</b></span>
            <span className="sc-rev-arrow">{m.steal ? "▲" : "▼"}</span>
            <span><small>REAL CEILING</small><b className={m.steal ? "good" : "bad"}>{m.to}</b></span>
          </div>
        </div>
      </div>
      <div className="mm-note">{m.steal ? "Two seasons in, the development staff know what they have: a better player than anyone's board said on draft day." : "Two seasons in, the development staff know what they have. The scouts saw more in him than is there; it happens to every club."}</div>
    </MomentFrame>
  );
}

export const SCOUTING_MOMENTS = { scoutCheckpoint: ScoutCheckpoint, scoutReveal: ScoutReveal };
