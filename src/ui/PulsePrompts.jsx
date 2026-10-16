import React from "react";
import { useGame } from "./common.jsx";
import { answerPresser, skipPresser, giveSpeech, SPEECHES } from "../engine/clubPulse.js";

// Press conferences and post-game locker-room speeches: a bottom sheet, never blocking the sim.
export default function PulsePrompts() {
  const { league, commit, toast } = useGame();
  const gm = league.gm;
  if (!gm) return null;
  const p = gm.presser;
  const s = !p && gm.speech;
  if (!p && !s) return null;
  const done = (r) => {
    toast(r.msg);
    commit();
  };
  return (
    <div className="gg-sheet" role="dialog" aria-label={p ? "Press conference" : "Locker-room speech"}>
      {p ? (
        <>
          <div className="gg-sheet-k">🎙️ PRESS CONFERENCE <span className="muted">· after a {p.res === "W" ? "win" : p.res === "OTL" ? "overtime loss" : "loss"}</span></div>
          <div className="gg-sheet-q">“{p.q}”</div>
          <div className="gg-sheet-a">
            {p.a.map((a, i) => (
              <button key={i} onClick={() => done(answerPresser(league, i))} title={a.risk || undefined}>{a.t}</button>
            ))}
            <button className="ghost" onClick={() => { skipPresser(league); commit(); }}>No comment</button>
          </div>
        </>
      ) : (
        <>
          <div className="gg-sheet-k">🏒 LOCKER ROOM <span className="muted">· the room is waiting after that {s.res === "W" ? "win" : s.res === "OTL" ? "overtime loss" : "loss"}</span></div>
          <div className="gg-sheet-a">
            {Object.entries(SPEECHES).map(([k, v]) => (
              <button key={k} onClick={() => done(giveSpeech(league, k))} title={v.desc}>{v.name}<small>{v.desc}</small></button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
