import React, { useState } from "react";
import { useGame, PlayerName } from "./common.jsx";
import { TRAINING } from "../engine/franchise.js";
import { isGoalie } from "../engine/constants.js";
import { ensurePulse } from "../engine/clubPulse.js";
import { campStatus, playExhibition, devCampCandidates, runDevCamp, runTrainingFocus, setCampGroup, battlePairs, runBattle, CAMP_GAMES, CAMP_COSTS, CAMP_GROUPS } from "../engine/camp.js";
import { POS_COLOR } from "./TradePage.jsx";

const ovrColor = (o) => (o >= 85 ? "#22c55e" : o >= 79 ? "#84cc16" : o >= 73 ? "#eab308" : o >= 67 ? "#f97316" : "#ef4444");
const gradeColor = (g) => (g?.[0] === "A" ? "#22c55e" : g?.[0] === "B" ? "#60a5fa" : g?.[0] === "C" ? "#eab308" : "#f97316");

function PracticeReport({ game, onClose }) {
  return (
    <div className="modalbg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal gg-report" role="dialog" aria-label="Practice report">
        <div className="gg-report-h">📋 PRACTICE REPORT — {game.us}-{game.them}{game.ot ? " (OT)" : ""} {game.home ? "vs" : "@"} {game.opp}</div>
        <div className="gg-k" style={{ color: "#7dd3fc" }}>STANDOUT PERFORMANCES</div>
        {game.lines.map((l) => (
          <div key={l.id} className="gg-camp-line">
            <span className="gg-grade-chip" style={{ color: gradeColor(l.grade), borderColor: gradeColor(l.grade) }}>{l.grade}</span>
            <b>{l.name}</b>
            <span className="dim">{l.pos}</span>
            <span className="muted">{l.sa ? `${l.sv}/${l.sa} saves` : `${l.g}G ${l.a}A · ${l.sog} SOG · ${l.pm > 0 ? "+" : ""}${l.pm}`}</span>
          </div>
        ))}
        {game.bonuses.length > 0 && (
          <>
            <div className="gg-k" style={{ color: "#22c55e", marginTop: 8 }}>DEVELOPMENT EARNED</div>
            {game.bonuses.map((b, i) => <div key={i} className="small good">{b.gain ? "▲ +1 OVR" : "+ camp credit"} → {b.name} ({b.pos}) · grade {b.grade}</div>)}
          </>
        )}
        {game.hurt?.length > 0 && <div className="small bad" style={{ marginTop: 6 }}>🚑 Injured: {game.hurt.join(", ")}</div>}
        <button style={{ width: "100%", marginTop: 10 }} onClick={onClose}>CLOSE</button>
      </div>
    </div>
  );
}

export default function TrainingCamp() {
  const { league, commit, toast } = useGame();
  const [report, setReport] = useState(null);
  const [focusPid, setFocusPid] = useState(null);
  if (league.phase !== "preseason") return null;
  const camp = campStatus(league);
  const gm = ensurePulse(league);
  const t = league.teams[league.userTid];
  const run = (r, after) => {
    toast(r.msg);
    if (r.ok) after?.(r);
    commit();
  };
  const focusP = focusPid && league.players[focusPid];
  const roster = t.roster.map((id) => league.players[id]).filter(Boolean).sort((a, b) => b.ovr - a.ovr);

  return (
    <div className="gg-camp stack">
      <div className="gg-camp-h">🏕️ TRAINING CAMP <span className="dim small">{league.year}-{String(league.year + 1).slice(2)} preseason · {gm.sp} SP available</span></div>

      <section className="gg-campbox" style={{ borderColor: "#eab30866" }}>
        <div className="gg-camp-k" style={{ color: "#eab308" }}>🏒 PRESEASON — Exhibition games ({camp.games.length}/{CAMP_GAMES} played)</div>
        <div className="row" style={{ gap: 6 }}>
          <button className={camp.risk ? "gg-risk on" : "gg-risk"} onClick={() => { camp.risk = !camp.risk; commit(); }} aria-pressed={camp.risk}>⚠️ Injury risk: {camp.risk ? "ON" : "OFF"}</button>
          <button className="primary" disabled={camp.games.length >= CAMP_GAMES} onClick={() => run(playExhibition(league), (r) => setReport(r.game))}>▶ Sim Game</button>
          {camp.games.length > 0 && <button onClick={() => setReport(camp.games[camp.games.length - 1])}>📋 Practice Report</button>}
        </div>
        {camp.games.length > 0 && (
          <div className="row" style={{ gap: 4, marginTop: 6 }}>
            {camp.games.map((g, i) => <span key={i} className={`gg-result ${g.us > g.them ? "w" : "l"}`} onClick={() => setReport(g)}>{g.us > g.them ? "W" : "L"} {g.us}–{g.them} {g.home ? "vs" : "@"} {g.opp}</span>)}
          </div>
        )}
        <div className="dim small" style={{ marginTop: 4 }}>Exhibitions use the real game engine but don't count in the standings or stats. Standout young players earn development.</div>
      </section>

      <section className="gg-campbox" style={{ borderColor: "#7c3aed66" }}>
        <div className="gg-camp-k" style={{ color: "#a78bfa" }}>🎓 DEV CAMP — {CAMP_COSTS.devCamp} SP</div>
        {camp.devCamp ? (
          <div className="small good">Done: {camp.devCamp.name} {camp.devCamp.before} → {camp.devCamp.after} OVR</div>
        ) : (
          <>
            <div className="dim small">Send one young player (23 or under) to dev camp for a +3 OVR boost.</div>
            <div className="row" style={{ gap: 4, marginTop: 4 }}>
              {devCampCandidates(league).map((p) => (
                <button key={p.id} className="gg-chip violet" disabled={gm.sp < CAMP_COSTS.devCamp} onClick={() => run(runDevCamp(league, p.id))}>{p.name} <b style={{ color: POS_COLOR[p.pos] }}>{p.pos}</b> {p.ovr}<span className="dim"> · POT {p.pot}</span></button>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="gg-campbox" style={{ borderColor: "#0ea5e966" }}>
        <div className="gg-camp-k" style={{ color: "#38bdf8" }}>🏋️ TRAINING FOCUS — {CAMP_COSTS.focus} SP</div>
        <div className="dim small">Boost one player's skill group this preseason (+1.5 to each attribute in it).</div>
        {!focusP ? (
          <div className="row" style={{ gap: 4, marginTop: 4 }}>
            {roster.filter((p) => !camp.focused.includes(p.id)).slice(0, 14).map((p) => (
              <button key={p.id} className="gg-chip blue" disabled={gm.sp < CAMP_COSTS.focus} onClick={() => setFocusPid(p.id)}>{p.name} <b style={{ color: POS_COLOR[p.pos] }}>{p.pos}</b> <span style={{ color: ovrColor(p.ovr) }}>{p.ovr}</span></button>
            ))}
          </div>
        ) : (
          <div style={{ marginTop: 4 }}>
            <div className="small">Selected: <PlayerName p={focusP} /> ({focusP.pos} {focusP.ovr}) — pick a skill:</div>
            <div className="row" style={{ gap: 4, marginTop: 4 }}>
              {Object.entries(TRAINING).filter(([k]) => isGoalie(focusP.pos) === (k === "goaltending")).map(([k, sk]) => (
                <button key={k} className="gg-chip green" onClick={() => run(runTrainingFocus(league, focusP.id, k), () => setFocusPid(null))}>{sk.name}</button>
              ))}
              <button className="ghost small" onClick={() => setFocusPid(null)}>✕ cancel</button>
            </div>
          </div>
        )}
      </section>

      <section className="gg-campbox" style={{ borderColor: "#22d3ee66" }}>
        <div className="gg-camp-k" style={{ color: "#22d3ee" }}>🏋️ TRAINING CAMP FOCUS {camp.group && <span className="small">— {CAMP_GROUPS[camp.group].name} set</span>}</div>
        <div className="dim small">Pick a group. Its top five players gain +1 OVR at the end of the regular season.</div>
        <div className="row" style={{ gap: 4, marginTop: 4 }}>
          {Object.entries(CAMP_GROUPS).map(([k, g]) => (
            <button key={k} className={`gg-chip cyan${camp.group === k ? " on" : ""}`} aria-pressed={camp.group === k} onClick={() => run(setCampGroup(league, camp.group === k ? null : k))}>{g.name}</button>
          ))}
        </div>
      </section>

      <section className="gg-campbox" style={{ borderColor: "#f59e0b66" }}>
        <div className="gg-camp-k" style={{ color: "#f59e0b" }}>⚔️ POSITION BATTLES — {CAMP_COSTS.battle} SP each</div>
        <div className="dim small">The top two at a position compete; the higher-rated player wins 60% of the time and the winner gains +1 OVR.</div>
        <div className="row" style={{ gap: 4, marginTop: 4 }}>
          {battlePairs(league).map(([pos, [a, b]]) => camp.battles[pos] ? (
            <span key={pos} className="gg-chip done">✓ {pos}: {camp.battles[pos].winner}</span>
          ) : (
            <button key={pos} className="gg-chip amber" disabled={gm.sp < CAMP_COSTS.battle} onClick={() => run(runBattle(league, pos))}>{pos} ({a.name} vs {b.name})</button>
          ))}
        </div>
      </section>
      {report && <PracticeReport game={report} onClose={() => setReport(null)} />}
    </div>
  );
}
