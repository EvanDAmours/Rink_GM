import React from "react";
import { Modal, TeamBadge, useGame } from "./common.jsx";
import Headshot from "./Headshot.jsx";
import { DevChip } from "./scoutingBits.jsx";
import { skillsFor, pickTake, comparable } from "../engine/scouting.js";
import { fmtHeight } from "../engine/scouting.js";
import { POS_COLOR } from "./TradePage.jsx";

// "With the Nth pick…": the card that opens the moment you make a selection. Now that he is
// yours his real ratings show: top skill groups, the development trait and the analysts' take.
export default function DraftPickCard({ pid, slot, onClose }) {
  const { league, openPlayer } = useGame();
  const p = league.players[pid];
  if (!p) return null;
  const t = league.teams[slot.owner];
  const avg = (keys) => keys.reduce((s, k) => s + (p.attrs[k] || 0), 0) / keys.length;
  const groups = Object.entries(skillsFor(p.pos)).map(([k, g]) => ({ k, name: g.name, v: Math.round(avg(g.keys)), hi: g.hi?.[0] })).sort((a, b) => b.v - a.v);
  const top = groups.slice(0, 3), weak = groups.at(-1);
  const comp = comparable(league, p, p.pot);
  const compName = comp?.name || comp?.p?.name || (typeof comp === "string" ? comp : null);
  return (
    <Modal title={`Pick ${slot.overall}: ${p.name}`} onClose={onClose} bare className="gg-preview gg-pickcard">
      <div className="gg-pv">
        <div className="gg-k" style={{ color: "#fbbf24" }}>ROUND {slot.round} · PICK #{slot.overall} · {league.draft?.year || league.year} NHL ENTRY DRAFT</div>
        <div className="gg-pick-head">
          <Headshot p={p} team={t} size={96} fallback="plate" />
          <div className="gg-pick-who">
            <div className="dim">The {t.city} {t.name} select</div>
            <h2>{p.name}</h2>
            <div className="gg-pick-meta"><span className="gg-pos" style={{ background: POS_COLOR[p.pos] || "#64748b" }}>{p.pos}</span><span>{p.age} yrs</span>{p.bio?.ht && <span>{fmtHeight(p.bio.ht)}{p.bio.wt ? ` · ${p.bio.wt} lb` : ""}</span>}{p.bio?.team && <span>{p.bio.team}{p.bio.lg ? ` (${p.bio.lg})` : ""}</span>}</div>
            <div className="gg-pick-nums"><div><small>OVR</small><b>{p.ovr}</b></div><div><small>POT</small><b style={{ color: "#22c55e" }}>{p.pot}</b></div><div><small>DEV</small><DevChip dev={p.dev} /></div></div>
          </div>
          <TeamBadge team={t} size={56} />
        </div>
        <div className="gg-pv-grid">
          <div><div className="gg-k">TOP ATTRIBUTES</div>{top.map((g) => <span key={g.k} className="gg-pick-attr"><b>{g.name}</b><i style={{ width: `${g.v}%` }} /><em>{g.v}</em></span>)}<span className="dim small">Needs work: {weak?.name} ({weak?.v})</span></div>
          <div><div className="gg-k">THE ANALYSTS SAY</div><b>Grade {slot.grade}</b><span>{pickTake(slot.grade, slot.overall, slot.csr)}</span>{compName && <span>Plays like a young {compName}.</span>}{top[0]?.hi && <span>"{top[0].hi}."</span>}</div>
        </div>
        <div className="gg-pv-actions"><button className="ghost" onClick={() => { onClose(); openPlayer(p.id); }}>Full card</button><button className="primary big" onClick={onClose}>Back to the draft →</button></div>
      </div>
    </Modal>
  );
}
