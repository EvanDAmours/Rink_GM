import React, { useState } from "react";
import { useGame, PlayerName, money, ovrColor, Dialog, DBtn } from "./common.jsx";
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
const POS_GROUPS = [["C", "Centres"], ["LW", "Left wings"], ["RW", "Right wings"], ["LD", "Left D"], ["RD", "Right D"], ["G", "Goalies"]];
// Young: 23 and under on the NHL roster. Prospect: anyone in the system below the NHL.
const youngTag = (p, farm) => (farm ? <em className="gg-focus-tag prospect" title="In the minors or still developing elsewhere">Prospect</em> : p.age <= 23 ? <em className="gg-focus-tag young" title="23 or younger">Young</em> : null);

function PracticeReport({ game, onClose }) {
  return (
    <Dialog title={`Practice report: ${game.us}-${game.them}${game.ot ? " (OT)" : ""} ${game.home ? "vs" : "@"} ${game.opp}`} onClose={onClose} actions={<DBtn kind="primary" onClick={onClose}>Close</DBtn>}>
      <div className="gg-report">
        <div className="gg-k" style={{ color: "#7dd3fc" }}>Standout performances</div>
        {game.lines.map((l) => <div key={l.id} className="gg-camp-line"><span className="gg-grade-chip" style={{ color: gradeColor(l.grade), borderColor: gradeColor(l.grade) }}>{l.grade}</span><b>{l.name}</b><span className="dim">{l.pos}</span><span className="muted">{l.sa ? `${l.sv}/${l.sa} saves` : `${l.g}G ${l.a}A · ${l.sog} SOG · ${l.pm > 0 ? "+" : ""}${l.pm}`}</span></div>)}
        {game.bonuses.length > 0 && <><div className="gg-k" style={{ color: "#22c55e", marginTop: 8 }}>Development earned</div>{game.bonuses.map((b, i) => <div key={i} className="small good">{b.gain ? "▲ +1 OVR" : "+ camp credit"} → {b.name} ({b.pos}) · grade {b.grade}</div>)}</>}
        {game.hurt?.length > 0 && <div className="small bad" style={{ marginTop: 6 }}>🚑 Injured: {game.hurt.join(", ")}</div>}
      </div>
    </Dialog>
  );
}

export default function TrainingCamp() {
  const { league, commit, toast } = useGame();
  const [report, setReport] = useState(null);
  const [extOpen, setExtOpen] = useState(false);
  const [focusPid, setFocusPid] = useState("");
  const [skill, setSkill] = useState("");
  const [extend, setExtend] = useState(null);
  const [focusView, setFocusView] = useState("bets");
  const [focusQ, setFocusQ] = useState("");
  if (league.phase !== "preseason") return null;
  const camp = campStatus(league);
  const gm = ensurePulse(league);
  const t = league.teams[league.userTid];
  const run = (r, after) => { toast(r.msg); if (r.ok) after?.(r); commit(); };
  const roster = t.roster.map((id) => league.players[id]).filter(Boolean).sort((a, b) => b.ovr - a.ovr);
  const focusP = focusPid && league.players[focusPid];
  // Who is worth the reps: room between potential and overall, youngest first; the stars are already there.
  // Everyone and By position list the whole roster and farm; By position groups them like the
  // football game's picker (best first in each group, young players and prospects marked).
  const farmIds = new Set(t.prospects);
  const whole = focusView === "all" || focusView === "pos";
  const focusCands = [...t.roster, ...t.prospects].map((id) => league.players[id]).filter((p) => p && !camp.focused.includes(p.id))
    .filter((p) => (focusView === "bets" ? p.pot - p.ovr >= 2 && p.age <= 27 : focusView === "young" ? p.age <= 25 : true) && (!focusQ || p.name.toLowerCase().includes(focusQ.toLowerCase())))
    .sort((a, b) => (b.pot - b.ovr) - (a.pot - a.ovr) || a.age - b.age || b.ovr - a.ovr).slice(0, whole ? undefined : 12);
  const focusGroups = focusView === "pos" ? POS_GROUPS.map(([pos, name]) => [pos, name, focusCands.filter((p) => p.pos === pos).sort((a, b) => b.ovr - a.ovr || a.age - b.age)]).filter(([, , ps]) => ps.length) : null;
  const skillsFor = (p) => Object.entries(TRAINING).filter(([k]) => isGoalie(p.pos) === (k === "goaltending"));
  const avg = (p, keys) => keys.reduce((s, k) => s + (p.attrs[k] || 0), 0) / keys.length;
  const focusRow = (p) => { const room = p.pot - p.ovr, farm = farmIds.has(p.id), weak = skillsFor(p).sort((a, b) => avg(p, a[1].keys) - avg(p, b[1].keys))[0]; return (
    <button type="button" key={p.id} className={`gg-focus-row${focusPid === p.id ? " on" : ""}`} onClick={() => { setFocusPid(p.id); setSkill(weak?.[0] || ""); }}>
      <PosBadge pos={p.pos} /><b><span>{p.name}</span>{youngTag(p, farm)}</b><small>{p.age} yrs</small>
      <span className="gg-focus-ovr"><i style={{ color: ovrColor(p.ovr) }}>{p.ovr}</i> → <i style={{ color: ovrColor(p.pot) }}>{p.pot}</i></span>
      <span className={`gg-focus-room${room >= 6 ? " hot" : room >= 3 ? " warm" : ""}`}>{room > 0 ? `+${room} room` : "at his ceiling"}</span>
      <small className="dim">weakest: {weak?.[1].name}</small>
    </button>
  ); };
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

  return (
    <div className="gg-camp3 stack">
      <div className="gg-camp2-h"><h3>Training camp</h3><span>Season points <b>{gm.sp} SP</b></span></div>
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
        <div className="gg-camp3-sec-h"><b>Position battles</b><span>{Object.keys(camp.battles).length}/{pairs.length}</span></div>
        <div className="gg-camp3-sub"><span>{CAMP_COSTS.battle} SP each. The top two at a spot compete; the winner (usually the better player) gains +1 OVR.</span>{open.length > 0 && <button className="blue ghost small" disabled={gm.sp < CAMP_COSTS.battle} onClick={runAll}>⚔️ Run {Math.min(open.length, gm.sp)} of {open.length} · {Math.min(open.length, gm.sp)} SP</button>}</div>
        <div className="gg-camp3-chips">
          {pairs.map(([pos, [a, b]]) => camp.battles[pos] ? <div key={pos} className="gg-bchip done"><PosBadge pos={pos} /><span>✓ <b>{last(camp.battles[pos].winner)}</b> beat {last(camp.battles[pos].loser)}</span></div> : <button key={pos} className="gg-bchip" disabled={gm.sp < CAMP_COSTS.battle} onClick={() => run(runBattle(league, pos))}><PosBadge pos={pos} /><span>{last(a.name)} <i>vs</i> {last(b.name)}</span></button>)}
        </div>
      </section>
      <section className="gg-camp3-card">
        <div className="gg-camp3-sec-h"><b>Training focus</b><span>{camp.focused.length} trained</span></div>
        <div className="gg-camp3-sub"><span>{CAMP_COSTS.focus} SP. Extra reps for one player: +1.5 to every attribute in a skill group, once per player each camp.</span><button className="blue ghost small" disabled={gm.sp < CAMP_COSTS.focus} onClick={autoFocus}>🎲 Auto-pick 5 · {CAMP_COSTS.focus * 5} SP</button></div>
        <div className="gg-focus-tools">
          <div className="gg-chips">{[["bets", "Best bets"], ["young", "Under 25"], ["all", "Everyone"], ["pos", "By position"]].map(([k, l]) => <button key={k} className={focusView === k ? "on" : ""} onClick={() => setFocusView(k)}>{l}</button>)}</div>
          <input className="gg-fa-search" placeholder="Find a player…" aria-label="Find a player to train" value={focusQ} onChange={(e) => setFocusQ(e.target.value)} />
          <span className="dim small">{focusView === "pos" ? "Your roster and farm by position, best first." : "Ranked by room to grow: potential minus overall, youngest first. A 99 is already there."}</span>
        </div>
        <div className="gg-focus-list">
          {focusGroups ? focusGroups.map(([pos, name, ps]) => (
            <React.Fragment key={pos}>
              <div className="gg-focus-grp"><PosBadge pos={pos} /><b>{name}</b><em>{ps.length}</em></div>
              {ps.map(focusRow)}
            </React.Fragment>
          )) : focusCands.map(focusRow)}
          {!focusCands.length && <div className="dim small">Nobody left to train on this view.</div>}
        </div>
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
          {focusP ? <><b>{focusP.name}</b><div className="gg-chips">{skillsFor(focusP).map(([k, sk]) => <button key={k} className={skill === k ? "on" : ""} onClick={() => setSkill(k)}>{sk.name}</button>)}</div></> : <span className="dim small">Pick a player above, then the skill group to drill.</span>}
          <button className="primary" disabled={!focusP || !skill || gm.sp < CAMP_COSTS.focus} onClick={() => run(runTrainingFocus(league, focusP.id, skill), () => { setFocusPid(""); setSkill(""); })}>Train{skill ? ` · ${TRAINING[skill].name}` : ""}</button>
        </div>
        {camp.focused.length > 0 && <div className="gg-camp3-chips" style={{ marginTop: 8 }}>{camp.focused.map((id) => league.players[id]).filter(Boolean).map((p) => <div key={p.id} className="gg-bchip done"><PosBadge pos={p.pos} /><span>✓ {p.name}</span></div>)}</div>}
      </section>
      <section className="gg-camp3-card">
        <div className="gg-camp3-sec-h"><b>Dev camp</b><span>{camp.devCamp ? "done" : "open"}</span></div>
        <div className="gg-camp3-sub"><span>{CAMP_COSTS.devCamp} SP. Once per preseason, one player 23 or under gains up to +3 OVR, never past his potential.</span></div>
        {camp.devCamp ? <div className="gg-camp2-done">✓ {camp.devCamp.name}: {camp.devCamp.before} → {camp.devCamp.after} OVR</div> : (
          <div className="gg-camp3-chips">{devCampCandidates(league).map((p) => <button key={p.id} className="gg-bchip" disabled={gm.sp < CAMP_COSTS.devCamp} onClick={() => run(runDevCamp(league, p.id))}><PosBadge pos={p.pos} /><span>{p.name} <b style={{ color: ovrColor(p.ovr) }}>{p.ovr}</b> <em>POT {p.pot}</em></span></button>)}</div>
        )}
      </section>
      <section className={`gg-camp3-card fold${extOpen ? " open" : ""}`}>
        <button className="gg-camp3-sec-h fold" onClick={() => setExtOpen((v) => !v)} aria-expanded={extOpen}><b>Extensions</b><span>{extended}/{extendable.length + extended}</span><i>{extOpen ? "▲" : "▼"}</i></button>
        {extOpen && (
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
