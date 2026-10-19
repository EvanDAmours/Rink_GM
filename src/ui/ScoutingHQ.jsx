import React from "react";
import { useGame } from "./common.jsx";
import { prospectRead, scoutProspect, scoutCost } from "../engine/scouting.js";
import { POS_COLOR } from "./TradePage.jsx";
import { AREA_START, TRIP_COST } from "../engine/regions.js";

// "Do this next": one concrete scouting move, like the football game's Scouting HQ.
export default function ScoutingHQ({ onBoard, onRegions, onList }) {
  const { league, commit, toast, openPlayer } = useGame();
  const t = league.teams[league.userTid];
  const pts = t.scoutPts || 0, area = t.area?.year === league.draftClassYear ? t.area.points : AREA_START;
  const cls = (league.draftClass || []).map((id) => league.players[id]).filter((p) => p && p.tid === -2);
  if (!cls.length) return null;
  // Where you pick: the first-round slot a standings finish implies today.
  const order = [...league.teams].sort((a, b) => (a.rec.pts / Math.max(1, a.rec.gp) || 0) - (b.rec.pts / Math.max(1, b.rec.gp) || 0));
  const slot = order.findIndex((x) => x.id === t.id) + 1;
  const own = league.draftPicks.some((pk) => pk.owner === t.id && pk.round === 1 && pk.year === league.draftClassYear);
  // Needs: the lineup groups with the thinnest top end on the farm and roster under 24.
  const young = [...t.roster, ...t.prospects].map((id) => league.players[id]).filter((p) => p && p.age <= 23);
  const grp = (pos) => (pos === "G" ? "G" : pos === "LD" || pos === "RD" ? "D" : pos === "C" ? "C" : "W");
  const have = { C: 0, W: 0, D: 0, G: 0 };
  for (const p of young) if (p.pot >= 78) have[grp(p.pos)]++;
  const need = Object.entries(have).sort((a, b) => a[1] - b[1]).slice(0, 2).map(([k]) => k);
  const label = { C: "centre", W: "wing", D: "defence", G: "goalie" };
  const lo = Math.max(0, slot - 10), hi = slot + 8;
  const target = cls.slice(lo, hi).find((p) => scoutCost(p) > 0 && need.includes(grp(p.pos))) || cls.slice(lo, hi).find((p) => scoutCost(p) > 0) || cls.find((p) => scoutCost(p) > 0);
  const idx = target ? cls.indexOf(target) + 1 : 0;
  const read = target ? prospectRead(league, target) : null;
  const cost = target ? scoutCost(target) : 0;
  const act = () => { const r = scoutProspect(league, target.id); toast(r.msg); commit(); };
  return (
    <section className="gg-card gg-hq">
      <div className="gg-k">DO THIS NEXT <span className="right dim" style={{ letterSpacing: 0, textTransform: "none" }}>your thinnest pipelines: {need.map((k) => label[k]).join(", ")} · {own ? `your first pick lands around #${slot}` : "you have traded your first-round pick"}</span></div>
      {area >= TRIP_COST && <div className="gg-hq-row"><span className="gg-hq-ico">🗺️</span><div><b>Send your area scouts on a trip</b><span>{area} area points in hand. A trip reads every prospect in a region at once; the sleepers show up there.</span></div><button className="primary small" onClick={onRegions}>Regions ({TRIP_COST} pts)</button></div>}
      {target && <div className="gg-hq-row"><span className="gg-pos" style={{ background: POS_COLOR[target.pos] || "#64748b" }}>{target.pos}</span><div><b><button className="link" onClick={() => openPlayer(target.id)}>{target.name}</button> <span className="dim">#{idx} on the board · {target.bio?.lg || "junior"}</span></b><span>{target.scout?.lvl ? "A first read is in; a full workup pins his ceiling and trait." : "No report yet."} {need.includes(grp(target.pos)) ? "A need position in your range." : "In your range."}</span></div><button className="primary small" disabled={pts < cost} title={pts < cost ? `Needs ${cost} scouting point${cost > 1 ? "s" : ""}` : ""} onClick={act}>Scout ({cost})</button></div>}
      {!target && <div className="dim small">Every prospect near your pick is fully scouted. Spend what's left on the next tier.</div>}
      <div className="row" style={{ gap: 6 }}><button className="small" onClick={onBoard}>Big Board →</button><button className="small" onClick={onList}>Your list →</button><button className="small" onClick={onRegions}>All regions →</button></div>
      <div className="gg-guide gg-guide-3">
        <div><b>1. Area trips</b><span>Area points. A rough read on every prospect in a region; more trips sharpen it and turn up sleepers.</span></div>
        <div><b>2. Scouting reports</b><span>1 scouting point per prospect: close estimates, tool grades and an NHL comparison. Best in your scouts' position groups.</span></div>
        <div><b>3. Full workups</b><span>2 more points: exact ratings, and from a major scout his development trait. Save these for the players you'd actually draft.</span></div>
      </div>
    </section>
  );
}
