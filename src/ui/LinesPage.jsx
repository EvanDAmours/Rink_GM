import Select from "./Select.jsx";
import Headshot, { headshotId } from "./Headshot.jsx";
import React, { useState } from "react";
import { useGame, TeamBadge, ovrColor } from "./common.jsx";
import { autoLines, resetNhlLines, syncLines, gameLines, healthy, teamRatings, lineupIds } from "../engine/lines.js";
import { isGoalie, isForward } from "../engine/constants.js";
import { restShare, REST_OPTIONS } from "../engine/sim.js";
import { lineChemistry } from "../engine/development.js";
import { POS_COLOR } from "./TradePage.jsx";

// The line chart: four forward lines, three pairs, two goalies, the special-teams units and
// the scratches. Tap a player, then tap where he goes; a scratch can be tapped straight into
// a selected slot. No sprites: number plates in the club's colours.

const F_POS = ["LW", "C", "RW"];
const D_POS = ["LD", "RD"];
const splitName = (name) => { const i = name.lastIndexOf(" "); return i < 0 ? ["", name] : [name.slice(0, i), name.slice(i + 1)]; };
const avg = (ps) => (ps.length ? Math.round(ps.reduce((s, p) => s + p.ovr, 0) / ps.length) : null);
const sameLines = (a, b) => !!a && !!b && JSON.stringify([a.F, a.D, a.G]) === JSON.stringify([b.F, b.D, b.G]);

export default function LinesPage({ onRoster }) {
  const { league, commit, openPlayer, toast } = useGame();
  const [viewTid, setViewTid] = useState(league.userTid);
  const [sel, setSel] = useState(null);
  const team = league.teams[viewTid];
  const mine = viewTid === league.userTid;
  if (!team.lines) syncLines(league, team);
  const L = team.lines;
  const game = gameLines(league, team);
  const get = (id) => (id ? league.players[id] : null);
  const tr = teamRatings(league, team);
  const [c1, c2] = team.colors;

  const read = (a) => (a.g === "X" ? a.id : a.g === "G" ? L.G[a.i] : L[a.g][a.i][a.j]);
  const write = (a, id) => { if (a.g === "G") L.G[a.i] = id; else L[a.g][a.i][a.j] = id; };
  const kind = (a) => (a.g === "PP" || a.g === "PK" ? a.g : a.g === "X" ? a.k : a.g === "G" ? "G" : "ES");
  const same = (a, b) => a && b && a.g === b.g && a.i === b.i && a.j === b.j && a.id === b.id;

  const act = (a) => {
    if (!mine) return;
    if (!sel) return setSel(a);
    if (same(sel, a)) return setSel(null);
    const ka = kind(sel), kb = kind(a);
    const goalieA = isGoalie(get(read(sel))?.pos || (ka === "G" ? "G" : ""));
    const goalieB = isGoalie(get(read(a))?.pos || (kb === "G" ? "G" : ""));
    const ok = ka === kb || (ka === "ES" && kb === "G" && goalieA) || (ka === "G" && kb === "ES" && goalieB);
    if (!ok || (sel.g === "X" && a.g === "X")) return setSel(a);
    if (goalieA !== goalieB && ka !== "PP" && ka !== "PK") { toast("Goalies can only swap with goalies."); return setSel(null); }
    const x = read(sel), y = read(a);
    if (sel.g !== "X") write(sel, y);
    if (a.g !== "X") write(a, x);
    setSel(null); syncLines(league, team); commit();
  };

  const card = (a, label) => {
    const id = read(a); const p = get(id); const isSel = same(sel, a);
    let sub = null;
    if (p && p.injury > 0 && (a.g === "F" || a.g === "D")) sub = get(game[a.g][a.i][a.j])?.name;
    if (p && p.injury > 0 && a.g === "G") sub = get(game.G[a.i])?.name;
    const off = p && label && p.pos !== label && !(label !== "C" && isForward(p.pos) && p.pos !== "C") && !["PP", "PK", "G"].includes(label);
    const [first, last] = p ? splitName(p.name) : ["", "Empty"];
    const target = mine && sel && !isSel && kind(sel) === kind(a);
    return (
      <button type="button" key={`${a.g}${a.i}${a.j ?? ""}`} className={`ln-card${isSel ? " sel" : ""}${target ? " target" : ""}${p?.injury > 0 ? " out" : ""}${mine ? "" : " ro"}${!p ? " empty" : ""}`} onClick={() => act(a)} title={p ? `${p.name} · ${p.pos} · ${p.ovr} OVR` : "Empty slot"}>
        <span className="ln-num" style={{ background: c1, color: c2, borderColor: c2 }}>{p && headshotId(p) ? <Headshot p={p} team={team} size={34} decorative /> : (p?.number ?? "–")}</span>
        <span className="ln-name"><small>{first}</small><b>{last}</b></span>
        {p && <span className="ln-right"><b style={{ color: ovrColor(p.ovr) }}>{p.ovr}</b><i className={off ? "warn" : ""} style={{ background: POS_COLOR[p.pos] }}>{p.pos}</i></span>}
        {p?.injury > 0 && <span className="ln-out">OUT {p.injury}g{sub ? ` · ${splitName(sub)[1]} in` : ""}</span>}
      </button>
    );
  };

  const roster = team.roster.map(get).filter(Boolean);
  const inLineup = new Set(lineupIds(L));
  const dressedIds = new Set([...L.F.flat(), ...L.D.flat()]);
  const injured = roster.filter((p) => p.injury > 0).sort((a, b) => b.injury - a.injury);
  const scratches = healthy(league, team).filter((p) => !inLineup.has(p.id)).sort((a, b) => b.ovr - a.ovr);
  const stBench = (k) => [...dressedIds].map(get).filter((p) => p && !L[k].flat().includes(p.id)).sort((a, b) => b.ovr - a.ovr);
  const selKind = sel ? kind(sel) : null;
  const selPlayer = sel ? get(read(sel)) : null;
  const chip = (p, k) => { const a = { g: "X", id: p.id, k }; const hot = mine && sel && sel.g !== "X" && selKind === k; return (
    <button type="button" key={`${k}${p.id}`} className={`ln-scratch${same(sel, a) ? " sel" : ""}${hot ? " target" : ""}${mine ? "" : " ro"}`} onClick={() => act(a)}>
      <i style={{ background: POS_COLOR[p.pos] }}>{p.pos}</i><span>{p.name}</span><b style={{ color: ovrColor(p.ovr) }}>{p.ovr}</b>
    </button>
  ); };
  const chem = (ids) => { try { const v = lineChemistry(league, team, ids.filter(Boolean)); return Number.isFinite(v) ? v : null; } catch { return null; } };
  const nhl = team.nhlLines; const matchesNhl = sameLines(L, nhl);

  const rowTag = (label, ids) => { const a = avg(ids.map(get).filter(Boolean)); const c = chem(ids); return (
    <div className="ln-tag"><b>{label}</b>{a != null && <span style={{ color: ovrColor(a) }}>{a}</span>}{c != null && <em className={c >= 0.6 ? "good" : c < 0 ? "bad" : ""}>{c >= 0 ? "+" : ""}{c.toFixed(1)}</em>}</div>
  ); };

  return (
    <div className="stack gg-lines2" style={{ "--c1": c1, "--c2": c2 }}>
      <div className="gg-pagehead gg-lines-head">
        <TeamBadge team={team} size={44} decorative />
        <div style={{ minWidth: 0 }}><h2>Lines</h2><div className="gg-status">{team.city} {team.name} · {league.year}-{String(league.year + 1).slice(2)}{nhl && (matchesNhl ? " · opening-night NHL lines" : " · changed from opening night")}</div></div>
        <div className="gg-tiles" style={{ marginLeft: "auto" }}><div><small>TEAM</small><b>{tr.ovr}</b></div><div><small>FWD</small><b>{tr.fwd}</b></div><div><small>DEF</small><b>{tr.def}</b></div><div><small>G</small><b>{tr.g}</b></div></div>
        <Select value={viewTid} onChange={(e) => { setViewTid(Number(e.target.value)); setSel(null); }} aria-label="Team">
          {[...league.teams].sort((a, b) => a.city.localeCompare(b.city)).map((t) => <option key={t.id} value={t.id}>{t.city} {t.name}{t.id === league.userTid ? " (you)" : ""}</option>)}
        </Select>
      </div>
      <div className="ln-tools">
        <div className="ln-hint">{mine ? (selPlayer ? <><b>{selPlayer.name}</b> selected · tap another player or an empty slot to swap</> : "Tap a player, then tap another to swap. Scratches drop into a selected slot.") : `Viewing the ${team.name}' lines.`}</div>
        <div className="row" style={{ gap: 6 }}>
          {mine && selPlayer && <><button className="small ghost" onClick={() => openPlayer(selPlayer.id)}>Profile</button><button className="small ghost" onClick={() => setSel(null)}>Cancel</button></>}
          {mine && onRoster && <button className="small" onClick={onRoster}>Roster & call-ups →</button>}
          {mine && nhl && !matchesNhl && <button className="small" onClick={() => { resetNhlLines(league, team); setSel(null); commit(); toast("Back to the opening-night NHL lines."); }}>Reset to NHL lines</button>}
          {mine && <button className="small primary" onClick={() => { autoLines(league, team); setSel(null); commit(); toast("Lines set by rating."); }}>Auto-set by rating</button>}
        </div>
      </div>

      <div className="ln-grid">
        <section className="ln-panel ln-fwd">
          <div className="ln-h"><span>Forwards</span><small>{tr.fwd} · line rating and chemistry on the left</small></div>
          <div className="ln-cols f"><span /> {F_POS.map((x) => <span key={x}>{x}</span>)}</div>
          {L.F.map((line, i) => <div key={i} className="ln-row f">{rowTag(`L${i + 1}`, game.F[i])}{line.map((_, j) => card({ g: "F", i, j }, F_POS[j]))}</div>)}
        </section>
        <section className="ln-panel ln-def">
          <div className="ln-h"><span>Defence</span><small>{tr.def}</small></div>
          <div className="ln-cols d"><span /> {D_POS.map((x) => <span key={x}>{x}</span>)}</div>
          {L.D.map((pair, i) => <div key={i} className="ln-row d">{rowTag(`P${i + 1}`, game.D[i])}{pair.map((_, j) => card({ g: "D", i, j }, D_POS[j]))}</div>)}
          <div className="ln-h" style={{ marginTop: 10 }}><span>Goalies</span>
            {mine ? <label className="ln-rest">Starter rests <Select value={Math.round(restShare(league, team) * 100)} onChange={(e) => { team.restPct = Number(e.target.value); team.autoGoalie = team.restPct > 0; commit(); }} aria-label="How often the starter rests">{REST_OPTIONS.map((r) => <option key={r} value={r}>{r === 0 ? "never" : `${r}%`} · ~{Math.round(league.schedule.filter((g) => g.h === team.id || g.a === team.id).length * (1 - r / 100))} starts{r === 20 ? " (typical)" : r >= 40 ? " (1A/1B)" : ""}</option>)}</Select></label>
                  : <small>{Math.round(restShare(league, team) * 100) >= 40 ? "1A/1B tandem" : `backup starts ~${Math.round(restShare(league, team) * 100)}%`}</small>}
          </div>
          <div className="ln-cols d"><span /> <span>STARTER</span><span>BACKUP</span></div>
          <div className="ln-row d">{rowTag("G", [L.G[0], L.G[1]])}{card({ g: "G", i: 0 }, "G")}{card({ g: "G", i: 1 }, "G")}</div>
        </section>
        <aside className="ln-side">
          <section className="ln-panel">
            <div className="ln-h"><span>Scratches</span><small>{scratches.length} healthy</small></div>
            {scratches.length ? <div className="ln-scratches">{scratches.map((p) => chip(p, isGoalie(p.pos) ? "G" : "ES"))}</div> : <div className="dim small">Nobody is sitting.</div>}
          </section>
          <section className="ln-panel">
            <div className="ln-h"><span>Injured</span><small>{injured.length ? `${injured.length} out` : "healthy"}</small></div>
            {injured.length ? <div className="ln-scratches">{injured.map((p) => <button type="button" key={p.id} className="ln-scratch out" onClick={() => openPlayer(p.id)}><i style={{ background: POS_COLOR[p.pos] }}>{p.pos}</i><span>{p.name}<small>{p.injuryNote || "injury"}</small></span><b className="bad">{p.injury}g</b></button>)}</div> : <div className="dim small">No injuries.</div>}
          </section>
        </aside>
        <section className="ln-panel ln-st">
          <div className="ln-h"><span>Special teams</span><small>units are drawn from dressed skaters</small></div>
          <div className="ln-st-grid">
            {["PP", "PK"].map((k) => <div key={k} className="ln-st-col">
              {L[k].map((unit, i) => <div key={i} className="ln-row st">{rowTag(`${k}${i + 1}`, unit)}<div className={`ln-unit n${unit.length}`}>{unit.map((_, j) => card({ g: k, i, j }, k))}</div></div>)}
              {mine && selKind === k && sel.g !== "X" && <div className="ln-bench"><small>Put in instead</small><div className="ln-scratches">{stBench(k).slice(0, 10).map((p) => chip(p, k))}</div></div>}
            </div>)}
          </div>
        </section>
      </div>
    </div>
  );
}
