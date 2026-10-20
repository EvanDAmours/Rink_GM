import React from "react";
import { Modal, TeamBadge, useGame } from "./common.jsx";
import { seasonPreview } from "../engine/seasonPreview.js";
import { staffGapText } from "../engine/franchise.js";

// "Here's what's ahead": the card the football game shows before week one.
export default function SeasonPreview({ onStart, onClose }) {
  const { league, go } = useGame();
  const t = league.teams[league.userTid];
  const pv = seasonPreview(league);
  const campDone = t.camp?.year === league.year && t.camp.games.length >= 4;
  const n = league.year - (league.startYear || league.year) + 1;
  // An interim head coach (or an empty staff chair) on opening night: say so, with a way to hire.
  const staff = staffGapText(t);
  if (!pv) return null;
  const vs = (g) => `${g.home ? "vs" : "@"} ${g.opp.city} ${g.opp.name}`;
  return (
    <Modal title={`The ${pv.year}-${String(pv.year + 1).slice(2)} season`} onClose={onClose} bare className="gg-preview">
      <div className="gg-pv">
        <div className="gg-pv-head"><TeamBadge team={t} size={54} /><div><div className="gg-k">THE {pv.year}-{String(pv.year + 1).slice(2)} SEASON</div><h2>{t.city} {t.name}</h2><div className="dim">{t.city} {t.name}, season {n} under you. Here's what's ahead.</div></div></div>
        <div className="gg-pv-grid">
          <div><div className="gg-k">THE OPENER</div><b>Game 1: {vs(pv.opener)}</b><span>{pv.opener.date}{pv.opener.home ? " · home ice" : " · on the road"}</span></div>
          <div><div className="gg-k">THE LINE</div><b>Over/under {pv.pts} points</b><span>{pv.tier} (No. {pv.rank} roster){pv.goal ? ` · the owner wants: ${pv.goal.toLowerCase()}` : ""}</span></div>
          <div><div className="gg-k">MARQUEE DATES</div>{pv.marquee.map((m, i) => <span key={i}><b>{m.date}</b> {vs(m)} · {m.why}</span>)}{!pv.marquee.length && <span>Every night counts.</span>}</div>
          <div><div className="gg-k">TOUGHEST STRETCH</div><b>Games {pv.stretch.from}-{pv.stretch.to} ({pv.stretch.start} to {pv.stretch.end})</b><span>{pv.stretch.opps.join(", ")} · average opponent {pv.stretch.avg} OVR</span></div>
        </div>
        {!campDone && <div className="gg-pv-camp">🏕️ Training camp isn't finished. Camp work, position battles and the dev camp only happen before game one.</div>}
        {staff && <div className="gg-pv-camp gg-pv-staff"><b>🪑 {staff.head}.</b> {staff.text}</div>}
        <div className="gg-pv-actions">
          {staff && <button className="ghost" onClick={() => { onClose(); go("coaching", "coaching"); }}>Hire a coach</button>}
          {!campDone && <button className="ghost" onClick={() => { onClose(); go("roster"); }}>Go to Training Camp</button>}
          <button className="primary big" onClick={onStart}>{campDone ? "LET'S GO →" : "Start the season anyway →"}</button>
        </div>
      </div>
    </Modal>
  );
}
