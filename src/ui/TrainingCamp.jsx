import React, { useState } from "react";
import { useGame, PlayerName, money, ovrColor } from "./common.jsx";
import Select from "./Select.jsx";
import { TRAINING } from "../engine/franchise.js";
import { isGoalie } from "../engine/constants.js";
import { ensurePulse } from "../engine/clubPulse.js";
import { resignAsk } from "../engine/offseason.js";
import { campStatus, playExhibition, devCampCandidates, runDevCamp, runTrainingFocus, setCampGroup, battlePairs, runBattle, CAMP_GAMES, CAMP_COSTS, CAMP_GROUPS } from "../engine/camp.js";
import { POS_COLOR } from "./TradePage.jsx";
import { ExtensionModal } from "./FrontOfficePage.jsx";

const PosBadge = ({ pos }) => <span className="gg-pos" style={{ background: POS_COLOR[pos] || "#64748b" }}>{pos}</span>;
const gradeColor = (g) => (g?.[0] === "A" ? "#22c55e" : g?.[0] === "B" ? "#60a5fa" : g?.[0] === "C" ? "#eab308" : "#f97316");
const last = (n) => n.split(" ").at(-1);

function PracticeReport({ game, onClose }) {
  return (
    <div className="modalbg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal gg-report" role="dialog" aria-label="Practice report">
        <div className="gg-report-h">📋 PRACTICE REPORT — {game.us}-{game.them}{game.ot ? " (OT)" : ""} {game.home ? "vs" : "@"} {game.opp}</div>
        <div className="gg-k" style={{ color: "#7dd3fc" }}>STANDOUT PERFORMANCES</div>
        {game.lines.map((l) => <div key={l.id} className="gg-camp-line"><span className="gg-grade-chip" style={{ color: gradeColor(l.grade), borderColor: gradeColor(l.grade) }}>{l.grade}</span><b>{l.name}</b><span className="dim">{l.pos}</span><span className="muted">{l.sa ? `${l.sv}/${l.sa} saves` : `${l.g}G ${l.a}A · ${l.sog} SOG · ${l.pm > 0 ? "+" : ""}${l.pm}`}</span></div>)}
        {game.bonuses.length > 0 && <><div className="gg-k" style={{ color: "#22c55e", marginTop: 8 }}>DEVELOPMENT EARNED</div>{game.bonuses.map((b, i) => <div key={i} className="small good">{b.gain ? "▲ +1 OVR" : "+ camp credit"} → {b.name} ({b.pos}) · grade {b.grade}</div>)}</>}
        {game.hurt?.length > 0 && <div className="small bad" style={{ marginTop: 6 }}>🚑 Injured: {game.hurt.join(", ")}</div>}
        <button style={{ width: "100%", marginTop: 10 }} onClick={onClose}>CLOSE</button>
      </div>
    </div>
  );
}

export default function TrainingCamp() {
  const { league, commit, toast } = useGame();
  const [report, setReport] = useState(null);
  const [tab, setTab] = useState("battles");
  const [focusPid, setFocusPid] = useState("");
  const [skill, setSkill] = useState("");
  const [extend, setExtend] = useState(null);
  if (league.phase !== "preseason") return null;
  const camp = campStatus(league);
  const gm = ensurePulse(league);
  const t = league.teams[league.userTid];
  const run = (r, after) => { toast(r.msg); if (r.ok) after?.(r); commit(); };
  const roster = t.roster.map((id) => league.players[id]).filter(Boolean).sort((a, b) => b.ovr - a.ovr);
  const focusP = focusPid && league.players[focusPid];
  const skillsFor = (p) => Object.entries(TRAINING).filter(([k]) => isGoalie(p.pos) === (k === "goaltending"));
  const avg = (p, keys) => keys.reduce((s, k) => s + (p.attrs[k] || 0), 0) / keys.length;
  const pairs = battlePairs(league);
  const open = pairs.filter(([pos]) => !camp.battles[pos]);
  const autoFocus = () => {
    const cands = roster.filter((p) => !camp.focused.includes(p.id) && p.age <= 27).sort((a, b) => (b.pot - b.ovr) - (a.pot - a.ovr) || b.ovr - a.ovr).slice(0, 5);
    let n = 0;
    for (const p of cands) { const [k] = skillsFor(p).sort((a, b) => avg(p, a[1].keys) - avg(p, b[1].keys))[0]; const r = runTrainingFocus(league, p.id, k); if (r.ok) n++; else { toast(r.msg); break; } }
    toast(`Training focus for ${n} player${n === 1 ? "" : "s"}.`); commit();
  };
  const runAll = () => { let n = 0; for (const [pos] of open) { const r = runBattle(league, pos); if (!r.ok) { toast(r.msg); break; } n++; } toast(`${n} position battle${n === 1 ? "" : "s"} decided.`); commit(); };
  const extendable = roster.filter((p) => p.signed !== false && p.yrs === 1 && !p.extension).sort((a, b) => b.ovr - a.ovr);
  const extended = roster.filter((p) => p.extension).length;
  const TABS = [["battles", "Position battles", `${Object.keys(camp.battles).length}/${pairs.length}`], ["focus", "Training focus", `${camp.focused.length} trained`], ["dev", "Dev camp", camp.devCamp ? "done" : "open"], ["ext", "Extensions", `${extended}/${extendable.length + extended}`]];

  return (
    <div className="gg-camp3 stack">
      <div className="gg-camp2-h"><h3>Training Camp</h3><span>Season points <b>{gm.sp} SP</b></span></div>
      <div className="gg-camp3-top">
        <section className="gg-camp3-card">
          <div className="gg-camp3-t"><b>Preseason games {camp.games.length}/{CAMP_GAMES}</b><span>{camp.risk ? "Injury risk is on." : "Standout young players earn development."}</span></div>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <button className="primary" disabled={camp.games.length >= CAMP_GAMES} onClick={() => run(playExhibition(league), (r) => setReport(r.game))}>▶ Play game</button>
            <button className={camp.risk ? "danger" : ""} onClick={() => { camp.risk = !camp.risk; commit(); }} aria-pressed={camp.risk}>Injury risk: {camp.risk ? "On" : "Off"}</button>
            {camp.games.map((g, i) => <button key={i} className={`gg-result ${g.us > g.them ? "w" : "l"}`} onClick={() => setReport(g)}>{g.us > g.them ? "W" : "L"} {g.us}–{g.them} {g.home ? "vs" : "@"} {g.opp}</button>)}
          </div>
        </section>
        <section className="gg-camp3-card">
          <div className="gg-camp3-t"><b>Camp focus</b><span>Top 5 in the group gain +1 OVR at season's end.</span></div>
          <div className="gg-camp2-focus">{Object.entries(CAMP_GROUPS).map(([k, g]) => <button key={k} className={camp.group === k ? "on" : ""} aria-pressed={camp.group === k} onClick={() => run(setCampGroup(league, camp.group === k ? null : k))}>{g.name}</button>)}</div>
        </section>
      </div>

      <section className="gg-camp3-card">
        <div className="gg-camp3-tabs">{TABS.map(([k, l, n]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l} <span>{n}</span></button>)}</div>
        {tab === "battles" && (
          <>
            <div className="gg-camp3-sub"><span>{CAMP_COSTS.battle} SP each. The top two at a spot compete; the winner (usually the better player) gains +1 OVR.</span>{open.length > 0 && <button className="blue ghost small" disabled={gm.sp < CAMP_COSTS.battle} onClick={runAll}>⚔️ Run {Math.min(open.length, gm.sp)} of {open.length} · {Math.min(open.length, gm.sp)} SP</button>}</div>
            <div className="gg-camp3-chips">
              {pairs.map(([pos, [a, b]]) => camp.battles[pos] ? <div key={pos} className="gg-bchip done"><PosBadge pos={pos} /><span>✓ <b>{last(camp.battles[pos].winner)}</b> beat {last(camp.battles[pos].loser)}</span></div> : <button key={pos} className="gg-bchip" disabled={gm.sp < CAMP_COSTS.battle} onClick={() => run(runBattle(league, pos))}><PosBadge pos={pos} /><span>{last(a.name)} <i>vs</i> {last(b.name)}</span></button>)}
            </div>
          </>
        )}
        {tab === "focus" && (
          <>
            <div className="gg-camp3-sub"><span>{CAMP_COSTS.focus} SP. Extra reps for one player: +1.5 to every attribute in a skill group, once per player each camp.</span><button className="blue ghost small" disabled={gm.sp < CAMP_COSTS.focus} onClick={autoFocus}>🎲 Auto-pick 5 · {CAMP_COSTS.focus * 5} SP</button></div>
            <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Select value={focusPid} onChange={(e) => { setFocusPid(e.target.value); setSkill(""); }} aria-label="Training focus player" placeholder="Choose a player…" style={{ minWidth: 260 }}>
                <option value="">Choose a player…</option>
                {["C", "LW", "RW", "LD", "RD", "G"].map((pos) => <optgroup key={pos} label={pos}>{roster.filter((p) => p.pos === pos && !camp.focused.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.pos}, {p.ovr} OVR, POT {p.pot})</option>)}</optgroup>)}
              </Select>
              {focusP && <div className="gg-chips">{skillsFor(focusP).map(([k, sk]) => <button key={k} className={skill === k ? "on" : ""} onClick={() => setSkill(k)}>{sk.name}</button>)}</div>}
              <button className="primary" disabled={!focusP || !skill || gm.sp < CAMP_COSTS.focus} onClick={() => run(runTrainingFocus(league, focusP.id, skill), () => { setFocusPid(""); setSkill(""); })}>Train{skill ? ` · ${TRAINING[skill].name}` : ""}</button>
            </div>
            {camp.focused.length > 0 && <div className="gg-camp3-chips" style={{ marginTop: 8 }}>{camp.focused.map((id) => league.players[id]).filter(Boolean).map((p) => <div key={p.id} className="gg-bchip done"><PosBadge pos={p.pos} /><span>✓ {p.name}</span></div>)}</div>}
          </>
        )}
        {tab === "dev" && (
          <>
            <div className="gg-camp3-sub"><span>{CAMP_COSTS.devCamp} SP. Once per preseason, one player 23 or under gains up to +3 OVR, never past his potential.</span></div>
            {camp.devCamp ? <div className="gg-camp2-done">✓ {camp.devCamp.name}: {camp.devCamp.before} → {camp.devCamp.after} OVR</div> : (
              <div className="gg-camp3-chips">{devCampCandidates(league).map((p) => <button key={p.id} className="gg-bchip" disabled={gm.sp < CAMP_COSTS.devCamp} onClick={() => run(runDevCamp(league, p.id))}><PosBadge pos={p.pos} /><span>{p.name} <b style={{ color: ovrColor(p.ovr) }}>{p.ovr}</b> <em>POT {p.pot}</em></span></button>)}</div>
            )}
          </>
        )}
        {tab === "ext" && (
          <>
            <div className="gg-camp3-sub"><span>Extend players heading into the last year of their deals. The new deal starts next season and must fit under next year's cap.</span></div>
            <div className="gg-camp3-chips">{extendable.map((p) => <button key={p.id} className="gg-bchip" onClick={() => setExtend(p)}><PosBadge pos={p.pos} /><span>{p.name} <b style={{ color: ovrColor(p.ovr) }}>{p.ovr}</b> <em>asks {money(resignAsk(league, p, 3).aav)}</em></span></button>)}{!extendable.length && <div className="dim small">Nobody is in the last year of his deal.</div>}</div>
          </>
        )}
      </section>
      {report && <PracticeReport game={report} onClose={() => setReport(null)} />}
      {extend && <ExtensionModal p={extend} onClose={() => setExtend(null)} />}
    </div>
  );
}
