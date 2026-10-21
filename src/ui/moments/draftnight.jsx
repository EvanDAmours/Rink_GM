// Draft night: the stage, the pick reveal, trade calls on the clock, a star sliding to you.
// Export { kind: Component }. Each component gets { m, onClose } and usually renders MomentFrame
// from ../MomentFrame.jsx. Put this family's styles in ./draftnight.css (imported here).
//
// "draft-stage" (engine/momentsDraft.js): your pick walks up on stage in your sweater. Queued for
// every pick you make (or the clock makes for you); the draft clock holds while it's on screen.
// Trade calls and "The pick is in" ring on the draft floor itself (ui/DraftTools.jsx), not here.
import React, { useEffect } from "react";
import { useGame } from "../common.jsx";
import { momentColors } from "../MomentFrame.jsx";
import { PickStage } from "../DraftPickCard.jsx";
import "./draftnight.css";

function StageMoment({ m, onClose }) {
  const { league, openPlayer } = useGame();
  const team = league.teams[m.tid] || league.teams[league.userTid];
  const { clr } = momentColors(team);
  useEffect(() => {
    const key = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const full = league.players[m.pid] ? () => { onClose(); openPlayer(m.pid); } : null;
  return (
    <div className="mm-overlay dn-overlay" onClick={onClose} style={{ "--mm-clr": clr }}>
      <PickStage m={m} onClose={onClose} onFull={full} />
    </div>
  );
}

export const DRAFT_MOMENTS = { "draft-stage": StageMoment };
