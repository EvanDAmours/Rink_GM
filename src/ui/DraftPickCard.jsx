import React from "react";
import { Modal, TeamBadge, useGame } from "./common.jsx";
import Headshot from "./Headshot.jsx";
import { momentColors } from "./MomentFrame.jsx";
import { POS_COLOR } from "./TradePage.jsx";
import { DEV_TRAITS } from "../engine/players.js";
import { fmtHeight, comparable } from "../engine/scouting.js";
import { stageMoment } from "../engine/momentsDraft.js";
import { ValueTag } from "./DraftTools.jsx";
import "./moments/draftnight.css";

const DEV_STYLE = { superstar: ["#f5c542", "#8a6d1d"], star: ["#60a5fa", "#1e3a5f"], normal: ["#94a3b8", "#1e293b"], late: ["#c4b5fd", "#6d5bd0"] };
const oC = (v) => (v >= 80 ? "#22c55e" : v >= 70 ? "#a3e635" : v >= 60 ? "#eab308" : "#f97316");

// The stage (Gridiron 3.4 Draft Night): your pick walks up under the lights in your sweater, his
// name across the back and his number on it; first-rounders come from the green room. Then his
// real card, now that he's yours: development trait, best skills, OVR/POT and the analysts' take.
// `m` is the draft-stage moment (engine/momentsDraft.js).
export function PickStage({ m, onClose, onFull, cta = "Continue the draft" }) {
  const { league } = useGame();
  const team = league.teams[m.tid] || league.teams[league.userTid];
  const live = league.players[m.pid];
  const p = { ...m.p, ...(live ? { name: live.name, pos: live.pos } : {}), number: live?.number ?? m.p.num ?? undefined };
  const dev = DEV_TRAITS[m.p.dev] ? m.p.dev : "normal";
  const [fg, bg] = DEV_STYLE[dev];
  const { clr, ac } = momentColors(team);
  const comp = live ? comparable(league, live, live.pot) : null;
  const compName = comp?.name || comp?.p?.name || (typeof comp === "string" ? comp : null);
  return (
    <div className="dn-card" role="dialog" aria-modal="true" aria-label={`Pick ${m.overall}: ${p.name}`} onClick={(e) => e.stopPropagation()} style={{ "--dn-fg": fg, "--dn-bg": bg, "--dn-clr": clr, "--dn-ac": ac }}>
      <div className="dn-stage">
        <div className="dn-lights" aria-hidden />
        {m.green && <div className="dn-green">★ FROM THE GREEN ROOM ★</div>}
        <div className="dn-podium">
          <span className="dn-crest"><TeamBadge team={team} size={64} decorative /></span>
          <span className="dn-sweater"><Headshot p={p} team={team} size={118} /></span>
        </div>
        <div className="dn-k">ROUND {m.round} · PICK #{m.overall} · {m.year} NHL DRAFT</div>
        <div className="dn-sel">The {team.city} {team.name} select</div>
        <div className="dn-name">{p.name}</div>
        <div className="dn-meta">
          <span className="gg-pos" style={{ background: POS_COLOR[p.pos] || "#64748b" }}>{p.pos}</span>
          {m.p.club && <span>{m.p.club}{m.p.lg ? ` (${m.p.lg})` : ""}</span>}
          {m.p.age && <span>Age {m.p.age}</span>}
          {m.p.ht && <span>{fmtHeight(m.p.ht)}{m.p.wt ? ` · ${m.p.wt} lb` : ""}</span>}
        </div>
      </div>
      <div className="dn-body">
        <div className="dn-dev">
          <div className="dn-dev-k">DEVELOPMENT TRAIT</div>
          <div className="dn-dev-v">{DEV_TRAITS[dev].name}</div>
          <div className="dn-dev-d">{DEV_TRAITS[dev].desc}</div>
        </div>
        {m.top?.length > 0 && (
          <div className="dn-tiles">
            {m.top.map(([l, v], i) => <div key={l} className="dn-tile" style={{ animationDelay: `${0.6 + i * 0.15}s` }}><b style={{ color: oC(v) }}>{v}</b><span>{l}</span></div>)}
          </div>
        )}
        <div className="dn-nums">
          <span>OVR <b style={{ color: oC(m.p.ovr) }}>{m.p.ovr}</b></span>
          <span>POT <b className="pot">{m.p.pot}</b></span>
          {m.grade && <span>Grade <b className="grade-v">{m.grade}</b></span>}
          <ValueTag overall={m.overall} csr={m.csr} />
        </div>
        {m.take && <div className="dn-take">{m.take}</div>}
        <div className="dn-note">{m.scouted >= 2 ? "Your full workup backs the pick." : m.scouted === 1 ? "You had a scouting report on him." : "You drafted him blind: no scouting report."}{compName ? ` Plays like a young ${compName}.` : ""}{m.weak ? ` Needs work: ${m.weak[0].toLowerCase()} (${m.weak[1]}).` : ""}</div>
        <div className="dn-act">
          {onFull && <button type="button" className="dn-ghost" onClick={onFull}>Full card</button>}
          <button type="button" className="dn-go" onClick={onClose} autoFocus>{cta}</button>
        </div>
      </div>
    </div>
  );
}

// The pick card as a popup (opened with openPick): the same stage, outside the moment queue.
export default function DraftPickCard({ pid, slot, onClose }) {
  const { league, openPlayer } = useGame();
  const p = league.players[pid];
  if (!p || !slot) return null;
  const m = stageMoment(league, { ...slot, pid });
  if (!m) return null;
  return (
    <Modal title={`Pick ${slot.overall}: ${p.name}`} onClose={onClose} bare className="dn-modal">
      <PickStage m={m} onClose={onClose} onFull={() => { onClose(); openPlayer(p.id); }} cta="Back to the draft →" />
    </Modal>
  );
}
