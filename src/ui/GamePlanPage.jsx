import React from "react";
import { useGame, TeamBadge, TeamName } from "./common.jsx";
import FranchiseDepth from "./FranchiseDepth.jsx";

export default function GamePlanPage() {
  const { league } = useGame();
  const t = league.teams[league.userTid];
  const next = league.schedule.find((g) => !g.played && (g.h === t.id || g.a === t.id));
  const opp = next ? league.teams[next.h === t.id ? next.a : next.h] : null;
  return (
    <div className="stack gg-gameplan">
      <div className="gg-pagehead">
        <div><h2>Game Plan & Reports</h2><div className="gg-status">Opponent scouting, tactics, cap ledger and postgame analysis</div></div>
        {opp && <div className="gg-next"><span className="gg-k" style={{ margin: 0 }}>NEXT</span><TeamBadge team={opp} size={30} /><b>{next.h === t.id ? "vs" : "@"} <TeamName tid={opp.id} /></b></div>}
      </div>
      <FranchiseDepth />
    </div>
  );
}
