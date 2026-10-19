import React, { useMemo, useState } from "react";
import { useGame, PlayerName } from "./common.jsx";
import { prospectRead, csRank } from "../engine/scouting.js";
import { Read, DevChip, ScoutButton } from "./scoutingBits.jsx";

// Your scouts' board: every prospect your staff has a read on, in the order they would take
// them, against where Central Scouting has him. The gap is where the value is.
export default function ScoutBoard() {
  const { league } = useGame();
  const [sort, setSort] = useState("ceiling");
  const [pos, setPos] = useState("all");
  const cls = (league.draftClass || []).map((id) => league.players[id]).filter((p) => p && p.tid === -2);
  const rows = useMemo(() => {
    const reads = cls.map((p) => ({ p, r: prospectRead(league, p), cs: csRank(p) })).filter((x) => x.r.lvl > 0 && x.r.potV != null);
    const ranked = [...reads].sort((a, b) => b.r.potV - a.r.potV || (b.r.ovrV || 0) - (a.r.ovrV || 0));
    ranked.forEach((x, i) => { x.ours = i + 1; x.gap = x.cs - x.ours; });
    const out = ranked.filter((x) => pos === "all" || x.p.pos === pos);
    if (sort === "value") out.sort((a, b) => b.gap - a.gap || a.ours - b.ours);
    else if (sort === "ready") out.sort((a, b) => (b.r.ovrV || 0) - (a.r.ovrV || 0) || a.ours - b.ours);
    else if (sort === "dev") out.sort((a, b) => ({ superstar: 4, star: 3, normal: 2, late: 1 }[b.r.dev] || 0) - ({ superstar: 4, star: 3, normal: 2, late: 1 }[a.r.dev] || 0) || a.ours - b.ours);
    return out;
  }, [league, cls, sort, pos]);
  const blind = cls.length - rows.length;
  const round = (n) => Math.ceil(n / 32);
  return (
    <div className="panel gg-sboard">
      <h3>Your scouts' board <span className="right muted small" style={{ textTransform: "none", letterSpacing: 0 }}>{rows.length} with a report · {blind > 0 ? `${blind} without one` : "the whole class covered"}</span></h3>
      <p className="dim small">Ranked by your staff's ceiling estimate. "Ours" is where your scouts would take him, "CS" is Central Scouting's slot; a big plus is a player the league is sleeping on. Exact numbers come from a full workup; the rest are estimates.</p>
      <div className="row" style={{ gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        <div className="gg-chips">{[["ceiling", "By ceiling"], ["value", "Value vs CS"], ["ready", "Ready now"], ["dev", "Dev trait"]].map(([k, l]) => <button key={k} className={sort === k ? "on" : ""} onClick={() => setSort(k)}>{l}</button>)}</div>
        <div className="gg-chips">{["all", "C", "LW", "RW", "LD", "RD", "G"].map((x) => <button key={x} className={pos === x ? "on" : ""} onClick={() => setPos(x)}>{x === "all" ? "All" : x}</button>)}</div>
      </div>
      <div className="gg-sboard-rows">
        <div className="gg-sboard-row head"><span>Ours</span><span>Player</span><span>CS</span><span>Gap</span><span>OVR</span><span>POT</span><span>Grade</span><span>Dev</span><span>Projects as</span><span></span></div>
        {rows.map(({ p, r, cs, ours, gap }) => (
          <div key={p.id} className="gg-sboard-row">
            <b className="mono">#{ours}</b>
            <span className="gg-sboard-who"><span className="posbadge">{p.pos}</span><PlayerName p={p} /><small className="dim">{p.age} · {p.bio?.lg || "—"}</small></span>
            <span className="dim">#{cs}</span>
            <span className={gap >= 8 ? "gg-gap good" : gap <= -8 ? "gg-gap bad" : "gg-gap"}>{gap > 0 ? `+${gap}` : gap}</span>
            <Read label="" txt={r.ovr} /><Read label="" txt={r.pot} />
            <span className={`rd g ${r.grade ? r.grade[0].toLowerCase() : ""}`}>{r.grade || "?"}</span>
            <DevChip dev={r.dev} />
            <small className="dim">{r.tier || "—"} · round {round(ours)}</small>
            <ScoutButton p={p} read={r} />
          </div>
        ))}
        {!rows.length && <div className="dim small">No reports filed yet. Area trips give a rough idea on the Big Board; a scouting point on a prospect puts him here with numbers.</div>}
      </div>
    </div>
  );
}
