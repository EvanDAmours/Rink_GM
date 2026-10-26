// Preseason games (Roster › Preseason games): up to four exhibitions for fun and form, with a
// practice report. They never change a rating: development is the season plan (Development).
import React, { useState } from "react";
import { useGame, Dialog, DBtn } from "./common.jsx";
import { campStatus, playExhibition, CAMP_GAMES } from "../engine/camp.js";
import "./dev.css";

const gradeColor = (g) => (g?.[0] === "A" ? "#4ade80" : g?.[0] === "B" ? "#93c5fd" : g?.[0] === "C" ? "#facc15" : "#fb923c");

function PracticeReport({ game, onClose }) {
  return (
    <Dialog title={`${game.us > game.them ? "Win" : "Loss"} ${game.us}-${game.them}${game.ot ? " (OT)" : ""} ${game.home ? "vs" : "@"} ${game.opp}`} sub="Practice report: who stood out." onClose={onClose} className="dv-sheet" actions={<DBtn kind="primary" onClick={onClose}>Close</DBtn>}>
      <div className="dv-list inset">
        {game.lines.map((l) => (
          <div key={l.id} className="dv-li"><span className="dv-tx"><b>{l.name}</b><span>{l.sa ? `${l.sv} saves on ${l.sa} shots` : `${l.g} G · ${l.a} A · ${l.sog} shots · ${l.pm > 0 ? "+" : ""}${l.pm}`}</span></span><span className="dv-n" style={{ color: gradeColor(l.grade) }}>{l.grade}</span></div>
        ))}
      </div>
      {game.hurt?.length > 0 && <div className="dv-note" style={{ color: "#fca5a5" }}>Injured: {game.hurt.join(", ")}</div>}
    </Dialog>
  );
}

export default function TrainingCamp() {
  const { league, commit, toast, go } = useGame();
  const [report, setReport] = useState(null);
  if (league.phase !== "preseason") return null;
  const camp = campStatus(league);
  const left = CAMP_GAMES - camp.games.length;
  const play = () => { const r = playExhibition(league); toast(r.msg); if (r.ok) setReport(r.game); commit(); };
  return (
    <div className="dv-pre">
      <div className="dv-pre-h">
        <div><h2>Preseason games</h2><p>Up to {CAMP_GAMES} games for fun and form. They don't change ratings: your season plan is under <button type="button" className="dv-inlink" onClick={() => go("development", "plan")}>Development</button>.</p></div>
        <div className="dv-pre-r">
          <button type="button" className={`dv-ch${camp.risk ? " on" : ""}`} aria-pressed={camp.risk} onClick={() => { camp.risk = !camp.risk; commit(); }}>Injury risk: {camp.risk ? "on" : "off"}</button>
          <button type="button" className="dv-btn primary sm" disabled={!left} onClick={play}>{left ? `Play game ${camp.games.length + 1} of ${CAMP_GAMES}` : "All games played"}</button>
        </div>
      </div>
      {camp.games.length > 0 && (
        <div className="dv-list">
          {camp.games.map((g, i) => (
            <button key={i} type="button" className="dv-li" onClick={() => setReport(g)}>
              <span className="dv-tx"><b>Game {i + 1}: {g.home ? "vs" : "@"} {g.opp}</b><span>{(g.lines?.[0] && `${g.lines[0].name} stood out`) || "Practice report"}</span></span>
              <span className={`dv-n ${g.us > g.them ? "up" : "down"}`}>{g.us}-{g.them}</span><span className="dv-chev" aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      )}
      {report && <PracticeReport game={report} onClose={() => setReport(null)} />}
    </div>
  );
}
