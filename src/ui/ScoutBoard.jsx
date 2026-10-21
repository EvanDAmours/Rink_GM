import React, { useState } from "react";
import Select from "./Select.jsx";
import { useGame, PlayerName } from "./common.jsx";
import { prospectRead, csRank, classPool, myBoard, SHOW_FILTERS, showMatch, crewStrength, SCOUT_GROUPS, fmtHeight, atCombine } from "../engine/scouting.js";
import { roleNeeds, ROLE_FILTERS, roleFilterMatch } from "../engine/teamPlanning.js";
import { Read, DevChip, CovTag, ScoutButton, RoleTag } from "./scoutingBits.jsx";
import { CombineWeek, VisitList } from "./ScoutingHQ.jsx";
import { POS_COLOR } from "./TradePage.jsx";

const POS = ["C", "LW", "RW", "LD", "RD", "G"];
const PAGE = 40;
const DEV_ORDER = { superstar: 4, star: 3, normal: 2, late: 1 };

// Your scouts' crews, group by group (Gridiron 1.42 / 1.52 / 1.74): who works each position, their
// combined evaluation, and what a crew of two or more can see through the board.
export function CrewStrip() {
  const { league } = useGame();
  const crews = crewStrength(league);
  return (
    <div className="sc-crews" aria-label="Scouting crews">
      {crews.map((c) => (
        <div key={c.group} className={`sc-crew${c.n >= 2 ? " deep" : c.n ? "" : " none"}`} title={c.scouts.length ? c.scouts.map((x) => `${x.scout.name} (eval ${x.scout.eval})`).join(", ") : "Nobody covers this group: your front office files rough reports."}>
          <b>{SCOUT_GROUPS[c.group]}</b>
          <span className="sc-crew-n">{c.n ? `${c.n} scout${c.n > 1 ? "s" : ""}` : "No scout"}</span>
          <span className="sc-crew-bar"><i style={{ width: `${Math.max(6, Math.min(100, (c.ev - 40) * 1.7))}%` }} /></span>
          <small>{c.n ? `${c.label} · eval ${c.ev}` : c.label}</small>
        </div>
      ))}
    </div>
  );
}

// Your scouts' big board (Gridiron 1.78 / 1.81): the whole class on a Consensus / Your scouts
// toggle. "Your scouts" ranks everyone on your reads (reports, a crew's general idea, area trips
// and the traits they've spotted), Central Scouting where you have nothing; ▲/▼ shows where your
// scouts are well above or below Central Scouting. Filters for sleepers and hunches, red flags,
// Star traits spotted, regions you've scouted, and roles (sniper, PP QB...) with a green NEED.
// onDraft/canDraft: pass them from the draft floor to show Draft buttons.
export default function ScoutBoard({ onDraft, canDraft = false, startMine = true }) {
  const { league } = useGame();
  const [mine, setMine] = useState(startMine);
  const [pos, setPos] = useState("all");
  const [show, setShow] = useState("all");
  const [sort, setSort] = useState("rank");
  const [q, setQ] = useState("");
  const [n, setN] = useState(PAGE);
  const cls = classPool(league);
  const needs = roleNeeds(league, league.teams[league.userTid]);
  const ranks = myBoard(league, cls);
  const reads = new Map(cls.map((p) => [p.id, prospectRead(league, p)]));
  const scouted = cls.filter((p) => reads.get(p.id).potV != null).length;
  const climbers = cls.filter((p) => csRank(p) - ranks.get(p.id) >= 25 && ranks.get(p.id) <= 96).length;
  const rankOf = (p) => (mine ? ranks.get(p.id) : csRank(p));
  const list = cls
    .filter((p) => pos === "all" || p.pos === pos || (pos.startsWith("R:") && roleFilterMatch(p, pos)))
    .filter((p) => !q || `${p.name} ${p.bio?.team || ""}`.toLowerCase().includes(q.toLowerCase()))
    .filter((p) => showMatch(league, p, show, reads.get(p.id)));
  if (sort === "value") list.sort((a, b) => (csRank(b) - ranks.get(b.id)) - (csRank(a) - ranks.get(a.id)) || rankOf(a) - rankOf(b));
  else if (sort === "ready") list.sort((a, b) => (reads.get(b.id).ovrV ?? 0) - (reads.get(a.id).ovrV ?? 0) || rankOf(a) - rankOf(b));
  else if (sort === "dev") list.sort((a, b) => (DEV_ORDER[reads.get(b.id).dev] || 0) - (DEV_ORDER[reads.get(a.id).dev] || 0) || rankOf(a) - rankOf(b));
  else list.sort((a, b) => rankOf(a) - rankOf(b));
  const reset = () => setN(PAGE);
  const combine = atCombine(league);
  return (
    <div className="stack">
      {combine && <CombineWeek />}
      {combine && <div className="panel sc-visit"><h3>🗂️ Your scouts' visit list <span className="right muted small" style={{ textTransform: "none", letterSpacing: 0 }}>interview and work out players who'll be there when you pick</span></h3><VisitList /></div>}
      <div className="panel sc-board">
        <h3>
          {mine ? "Your scouts' big board" : "Big Board"}
          <span className="right sc-toggle" role="group" aria-label="Board order">
            {[[false, "Consensus"], [true, "Your scouts"]].map(([k, l]) => <button key={l} className={mine === k ? "on" : ""} aria-pressed={mine === k} onClick={() => { setMine(k); setSort("rank"); reset(); }}>{l}</button>)}
          </span>
        </h3>
        <p className="dim small sc-board-note">
          {mine
            ? <>Everyone ranked on your own scouts' reads (and the development traits they've seen); where they don't know a player, they go with Central Scouting. ▲ means your scouts like him a lot more than Central Scouting does, ▼ a lot less. {scouted} of {cls.length} have a read.{climbers ? <> In their first three rounds they have <b className="good">{climbers}</b> prospect{climbers > 1 ? "s" : ""} 25+ spots higher than Central Scouting.</> : null}</>
            : <>Central Scouting's {cls.some((p) => p.cs?.final) ? "final" : cls.some((p) => p.cs?.now) ? "in-season" : "midterm"} rankings: what the league thinks. AI clubs mostly draft off this list.</>}
        </p>
        <CrewStrip />
        <div className="sc-filters">
          <Select aria-label="Position or role" value={pos} onChange={(e) => { setPos(e.target.value); reset(); }}>
            <option value="all">All positions</option>
            {POS.map((x) => <option key={x} value={x}>{x}</option>)}
            {ROLE_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Select aria-label="Show" value={show} onChange={(e) => { setShow(e.target.value); reset(); }}>
            {SHOW_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          {mine && <Select aria-label="Sort" value={sort} onChange={(e) => { setSort(e.target.value); reset(); }}>
            <option value="rank">Your rank</option><option value="value">Value vs Central Scouting</option><option value="ready">Ready now</option><option value="dev">Dev trait</option>
          </Select>}
          <input className="search" placeholder="Search name or team" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} aria-label="Search prospects" />
        </div>
        <div className="sc-rows">
          <div className="sc-row head"><span>#</span><span>Player</span><span className="sc-hide">CS</span><span>OVR</span><span>POT</span><span className="sc-hide">Dev</span><span className="sc-hide">Projects as</span><span /></div>
          {list.slice(0, n).map((p) => {
            const r = reads.get(p.id);
            const ours = ranks.get(p.id), cs = csRank(p), gap = cs - ours;
            const b = p.bio || {};
            return (
              <div key={p.id} className="sc-row">
                <span className={`sc-rank${mine ? " mine" : ""}`}>
                  {mine ? ours : cs}
                  {mine ? <small className={gap >= 10 ? "up" : gap <= -10 ? "down" : ""} title={`Central Scouting #${cs}; your scouts #${ours}`}>{gap >= 10 ? "▲" : gap <= -10 ? "▼" : ""}CS {cs}</small>
                    : Math.abs(gap) >= 25 && r.potV != null ? <small className={gap > 0 ? "up" : "down"} title={`Your scouts have him #${ours}`}>{gap > 0 ? "▲" : "▼"}ours {ours}</small> : null}
                </span>
                <span className="sc-who">
                  <span className="sc-name"><span className="gg-pos" style={{ background: POS_COLOR[p.pos] || "#64748b" }}>{p.pos}</span><PlayerName p={p} /><RoleTag p={p} needs={needs} /><CovTag read={r} /></span>
                  <small className="dim">{b.team || "—"} ({b.lg || "?"}) · {p.age} · {b.ht ? `${fmtHeight(b.ht)} ${b.wt}` : ""}</small>
                </span>
                <span className="sc-hide dim mono">#{cs}</span>
                <Read label="" txt={r.ovr} title={r.trips >= 4 && r.lvl === 0 ? "Your area scouts' estimate after four trips" : undefined} />
                <Read label="" txt={r.pot} title={r.tier ? `Projects as ${r.tier}` : undefined} />
                <span className="sc-hide"><DevChip dev={r.dev} /></span>
                <small className="sc-hide dim">{r.tier || "—"}{mine && r.potV != null ? ` · round ${Math.ceil(ours / 32)}` : ""}</small>
                <span className="sc-act">
                  <ScoutButton p={p} read={r} />
                  {onDraft && <button className="tiny primary" disabled={!canDraft} onClick={() => onDraft(p)}>Draft</button>}
                </span>
              </div>
            );
          })}
          {!list.length && <div className="dim small" style={{ padding: 8 }}>No prospects match.</div>}
        </div>
        {list.length > n && <div style={{ marginTop: 10 }}><button className="small" onClick={() => setN(n + PAGE)}>Show more ({list.length - n} left)</button></div>}
      </div>
    </div>
  );
}
