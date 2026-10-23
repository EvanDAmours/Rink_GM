// Scouting beats: scouting misses revealed, a hidden gem or a red flag confirmed.
// Export { kind: Component }. Each component gets { m, onClose } and usually renders MomentFrame
// from ../MomentFrame.jsx. Put this family's styles in ./scouting.css (imported here).
//   scoutReveal      (Gridiron 2.20) after his second season a draftee's real ceiling is out.
import React, { useEffect, useRef, useState } from "react";
import "./scouting.css";
import { useGame, PlayerName } from "../common.jsx";
import Headshot from "../Headshot.jsx";
import { MomentFrame } from "../MomentFrame.jsx";
import { dayToDate } from "../../engine/schedule.js";
import { POS_COLOR } from "../TradePage.jsx";
import { ScoutButton, ScoutFlags, RoleTag } from "../scoutingBits.jsx";

const Pos = ({ pos }) => <span className="gg-pos" style={{ background: POS_COLOR[pos] || "#64748b" }}>{pos}</span>;

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

// In-season scouting checkpoints are gone (batch x2): reports accumulate without a pop-up.
export const SCOUTING_MOMENTS = { scoutReveal: ScoutReveal };
