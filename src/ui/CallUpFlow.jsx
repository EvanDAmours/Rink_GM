// One call-up flow for every screen that offers "Call up": roster, pipeline, prospect watch, the
// player card and the player modal. When the call-up is blocked by a full roster (or the cap),
// it opens a "Make room" chooser instead of failing: send a waiver-exempt player down and the
// call-up happens in the same move; someone who needs waivers can be placed on waivers.
// Usage:  const callUp = useCallUp();  …  onClick={() => callUp.start(p)}  …  {callUp.element}
import React, { useState } from "react";
import { useGame, Modal, money, ovrColor } from "./common.jsx";
import { callUp as engineCallUp, callUpBlock, sendDownOptions, swapCallUp, counts } from "../engine/roster.js";
import { MAX_ROSTER } from "../engine/constants.js";
import { placeWaivers } from "../engine/operations.js";
import "./callup.css";

export function useCallUp() {
  const { league, commit, toast } = useGame();
  const [upId, setUpId] = useState(null);
  const team = league.teams[league.userTid];

  const start = (p) => {
    const block = callUpBlock(league, team, p.id);
    if (!block) {
      if (engineCallUp(league, team, p.id)) {
        commit();
        const over = counts(league, team).active - MAX_ROSTER;
        toast?.(league.phase === "preseason" && over > 0
          ? `${p.name} joins the NHL group at training camp. You're ${over} over the ${MAX_ROSTER}-man limit; cut down before opening night.`
          : `${p.name} is called up to the NHL roster.`);
      }
      else toast?.(`${p.name} couldn't be called up.`);
      return;
    }
    if (block.code === "room" || block.code === "cap") { setUpId(p.id); return; }
    toast?.(block.msg);
  };

  const element = upId != null ? <MakeRoom upId={upId} onClose={() => setUpId(null)} /> : null;
  return { start, element };
}

function MakeRoom({ upId, onClose }) {
  const { league, commit, toast } = useGame();
  const team = league.teams[league.userTid];
  const up = league.players[upId];
  if (!up) return null;
  const block = callUpBlock(league, team, upId);
  const options = sendDownOptions(league, team, upId);
  const swap = (q) => {
    const r = swapCallUp(league, team, upId, q.id);
    toast?.(r.msg);
    if (r.ok) { commit(); onClose(); }
  };
  const waive = (q) => {
    const r = placeWaivers(league, q.id);
    toast?.(r.ok ? `${q.name} is on waivers. Claims settle after the next day; call ${up.name} up once he's gone.` : r.msg);
    if (r.ok) { commit(); onClose(); }
  };
  return (
    <Modal title={`Make room for ${up.name}`} onClose={onClose} className="cu-modal">
      <p className="cu-why">{block?.msg || "Pick someone to send down."}</p>
      <div className="cu-up">
        <span className="cu-pos">{up.pos}</span><b>{up.name}</b>
        <span style={{ color: ovrColor(up.ovr) }}>{up.ovr}</span>
        <span className="muted">{up.age} yrs · {up.signed === false ? "unsigned pick (entry-level deal)" : `${money(up.cap)} cap hit`}</span>
      </div>
      <div className="cu-list" role="list">
        {options.map(({ p: q, nmc, exempt, waivers, freed, works, samePos }) => (
          <div key={q.id} className={`cu-row${works ? "" : " dim"}`} role="listitem">
            <span className="cu-pos">{q.pos}</span>
            <span className="cu-name"><b>{q.name}</b><small>{q.age} yrs · {money(q.cap)}{freed > 0 ? ` · frees ${money(freed)}` : ""}{samePos ? " · same position" : ""}</small></span>
            <span className="cu-ovr" style={{ color: ovrColor(q.ovr) }}>{q.ovr}</span>
            <span className={`cu-tag ${nmc ? "nmc" : exempt ? "ex" : "wv"}`}>{nmc ? "No-movement" : exempt ? "Waiver exempt" : "Needs waivers"}</span>
            {nmc ? <button className="small" disabled title="A no-movement clause blocks any assignment">Can't move</button>
              : !works ? <button className="small" disabled title="Doesn't free enough cap for this call-up">Not enough cap</button>
              : exempt ? <button className="small primary" onClick={() => swap(q)}>Send down &amp; call up</button>
              : waivers ? <button className="small" onClick={() => waive(q)}>Place on waivers</button> : null}
          </div>
        ))}
      </div>
      <p className="cu-note muted">Players on injured reserve and LTIR don't count against the {23}-man roster. A player who needs waivers can be claimed by any club for a day before he goes down.</p>
    </Modal>
  );
}
