import React from "react";
import { TeamBadge } from "./common.jsx";
import { trophyUrl } from "./trophies.js";

// Pre-game curtain for the Stanley Cup Final: the Cup, the clubs, one line.
export default function CupFinalSplash({ home, away, game, onStart }) {
  return (
    <div className="gg-splash" role="dialog" aria-label="Stanley Cup Final">
      <div className="gg-splash-inner">
        {trophyUrl("stanley") && <img className="gg-splash-cup" src={trophyUrl("stanley")} alt="Stanley Cup" />}
        <div className="gg-splash-title">STANLEY CUP FINAL</div>
        <div className="gg-splash-sub">GAME {game}</div>
        <div className="gg-splash-teams"><TeamBadge team={away} size={54} decorative /><b>{away.name}</b><span>AT</span><b>{home.name}</b><TeamBadge team={home} size={54} decorative /></div>
        <div className="gg-splash-line">FOUR WINS FOR EVERYTHING</div>
        <button className="primary big" onClick={onStart}>Drop the puck ▶</button>
      </div>
    </div>
  );
}
