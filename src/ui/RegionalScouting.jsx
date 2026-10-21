import React from "react";
import { useGame, PlayerName } from "./common.jsx";
import { REGIONS, ensureAreaScouting, scoutRegion, regionOf, TRIP_COST, MAX_TRIPS } from "../engine/regions.js";
import { prospectRead, csRank } from "../engine/scouting.js";
import { ScoutFlags } from "./scoutingBits.jsx";

// Area scouting (Gridiron 1.81): trips read every prospect in a region. From the third trip they
// start seeing through Central Scouting's list (💎 sleepers and hunches, 🚩 red flags); after the
// fourth they've seen enough to put a ~OVR on everyone there.
export default function RegionalScouting() {
  const { league, commit, toast } = useGame();
  const area = ensureAreaScouting(league);
  const pool = league.draftClass.map((id) => league.players[id]).filter((p) => p?.tid === -2);
  const closed = ["resign", "freeagency"].includes(league.phase) || league.phase === "draft" && league.draft?.stage !== "combine";
  return <div className="stack">
    <div className="notice">Send your area scouts to leagues, then use position scouts to investigate individual players. Each visit sharpens every read in that region. From the third visit they start seeing through Central Scouting's list to its sleepers (💎) and red flags (🚩); after the fourth you get a ~OVR estimate on everyone there. They never expose exact ratings or reorder Central Scouting.</div>
    <div className="pagehead"><h3>Amateur scouting network</h3><div className="scout-budget regional"><span>AREA POINTS</span><strong>{area.points}</strong></div><span className="muted small">2 per week · {TRIP_COST} per visit · up to {MAX_TRIPS} visits</span></div>
    <div className="grid g3">{Object.entries(REGIONS).map(([key, r]) => {
      const ps = pool.filter((p) => regionOf(p) === key).sort((a,b) => csRank(a)-csRank(b));
      const trips = area.trips[key] || 0;
      const reads = ps.map((p) => [p, prospectRead(league, p)]);
      const gems = reads.filter(([, x]) => x.sleeper || x.hunch), flags = reads.filter(([, x]) => x.flag);
      const r1 = ps.filter((p) => csRank(p) <= 32).length;
      return <div className="panel region-card" key={key}>
        <div className="row"><span className="pill">{r.family}</span><h3 style={{margin:0}}>{r.name}</h3></div>
        <p className="muted small">{r.note}</p><div className="row"><b>{ps.length} prospects</b><span className="muted">{r1} in Central Scouting's first round · {trips}/{MAX_TRIPS} visits</span></div>
        <div className="region-progress" aria-label={`${trips} scouting visits`}>{[1,2,3,4].map((n) => <i key={n} className={n <= trips ? "on" : ""} />)}</div>
        <button disabled={closed || area.points < TRIP_COST || trips >= MAX_TRIPS || !ps.length} onClick={() => { const r = scoutRegion(league,key); toast(r.msg); commit(); }}>{trips >= MAX_TRIPS ? "Fully scouted" : `Scout ${r.name} · ${TRIP_COST} pts`}</button>
        <div className="list" style={{marginTop:12}}>{reads.slice(0,3).map(([p, x]) => <div className="item small" key={p.id}><span className="dim">#{csRank(p)}</span><PlayerName p={p} /><ScoutFlags read={x} compact /><b style={{marginLeft:"auto"}}>{x.pot}{trips >= MAX_TRIPS && x.ovr !== "??" ? <span className="dim"> · {x.ovr}</span> : null}</b></div>)}</div>
        {gems.length > 0 && <p className="sc-region-note gem small">💎 {gems.length} possible sleeper{gems.length > 1 ? "s" : ""}: {gems.slice(0, 3).map(([p]) => p.name).join(", ")}</p>}
        {flags.length > 0 && <p className="sc-region-note red small">🚩 {flags.length} red flag{flags.length > 1 ? "s" : ""}: {flags.slice(0, 3).map(([p]) => p.name).join(", ")}</p>}
        {trips >= MAX_TRIPS && <p className="muted tiny" style={{ margin: "6px 0 0" }}>Four visits: every prospect here has a ~OVR on the boards.</p>}
      </div>;
    })}</div>
  </div>;
}
