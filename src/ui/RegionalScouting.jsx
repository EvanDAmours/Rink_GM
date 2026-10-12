import React from "react";
import { useGame, PlayerName } from "./common.jsx";
import { REGIONS, ensureAreaScouting, scoutRegion, regionOf, regionRead, TRIP_COST, MAX_TRIPS } from "../engine/regions.js";
import { prospectRead, csRank } from "../engine/scouting.js";

export default function RegionalScouting() {
  const { league, commit, toast } = useGame();
  const area = ensureAreaScouting(league);
  const pool = league.draftClass.map((id) => league.players[id]).filter((p) => p?.tid === -2);
  const closed = ["resign", "freeagency"].includes(league.phase) || league.phase === "draft" && league.draft?.stage !== "combine";
  return <div className="stack">
    <div className="notice">Send your area scouts to leagues, then use position scouts to investigate individual players. Visits improve estimates across a region. Three visits can uncover sleeper candidates; they never expose exact ratings or reorder Central Scouting.</div>
    <div className="pagehead"><h3>Amateur scouting network</h3><div className="scout-budget regional"><span>AREA POINTS</span><strong>{area.points}</strong></div><span className="muted small">2 per week · {TRIP_COST} per visit · up to {MAX_TRIPS} visits</span></div>
    <div className="grid g3">{Object.entries(REGIONS).map(([key, r]) => {
      const ps = pool.filter((p) => regionOf(p) === key).sort((a,b) => csRank(a)-csRank(b));
      const trips = area.trips[key] || 0;
      const sleepers = ps.filter((p) => regionRead(league,p)?.sleeper);
      return <div className="panel region-card" key={key}>
        <div className="row"><span className="pill">{r.family}</span><h3 style={{margin:0}}>{r.name}</h3></div>
        <p className="muted small">{r.note}</p><div className="row"><b>{ps.length} prospects</b><span className="muted">{trips}/{MAX_TRIPS} visits</span></div>
        <div className="region-progress" aria-label={`${trips} scouting visits`}>{[1,2,3,4].map((n) => <i key={n} className={n <= trips ? "on" : ""} />)}</div>
        <button disabled={closed || area.points < TRIP_COST || trips >= MAX_TRIPS || !ps.length} onClick={() => { const r = scoutRegion(league,key); toast(r.msg); commit(); }}>Scout {r.name} · {TRIP_COST} pts</button>
        <div className="list" style={{marginTop:12}}>{ps.slice(0,3).map((p) => <div className="item small" key={p.id}><span className="dim">#{csRank(p)}</span><PlayerName p={p} /><b style={{marginLeft:"auto"}}>{prospectRead(league,p).pot}</b></div>)}</div>
        {sleepers.length > 0 && <p className="good small">Sleeper watch: {sleepers.map(p => p.name).join(", ")}</p>}
      </div>;
    })}</div>
  </div>;
}
