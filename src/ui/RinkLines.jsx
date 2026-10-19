import React, { useState } from "react";
import { useGame, ovrColor } from "./common.jsx";
import { syncLines, gameLines, healthy, lineupIds } from "../engine/lines.js";
import { isGoalie, isDefense, isForward } from "../engine/constants.js";
import { lineChemistry } from "../engine/development.js";
import { POS_COLOR } from "./TradePage.jsx";

// The rink view of the lines, like the football game's depth-chart field: one unit on
// the ice at a time, every unit listed at a glance on the right. Tap a spot to change
// who plays there; tap a row to put that unit on the ice.
const last = (name) => name.split(" ").slice(-1)[0];
const tone = (v) => (v >= 90 ? "#4ade80" : v >= 85 ? "#a3e635" : v >= 80 ? "#facc15" : v >= 75 ? "#fb923c" : "#f87171");
const UNITS = (L) => [
  ...L.F.map((_, i) => ({ key: `L${i + 1}`, label: `Line ${i + 1}`, slots: [{ g: "F", i, j: 0, pos: "LW" }, { g: "F", i, j: 1, pos: "C" }, { g: "F", i, j: 2, pos: "RW" }, { g: "D", i: Math.min(i, 2), j: 0, pos: "LD" }, { g: "D", i: Math.min(i, 2), j: 1, pos: "RD" }, { g: "G", i: 0, pos: "G" }] })),
  ...L.D.map((_, i) => ({ key: `P${i + 1}`, label: `Pair ${i + 1}`, slots: [{ g: "F", i: Math.min(i, 3), j: 0, pos: "LW" }, { g: "F", i: Math.min(i, 3), j: 1, pos: "C" }, { g: "F", i: Math.min(i, 3), j: 2, pos: "RW" }, { g: "D", i, j: 0, pos: "LD" }, { g: "D", i, j: 1, pos: "RD" }, { g: "G", i: 0, pos: "G" }] })),
  { key: "G", label: "Goalies", slots: [{ g: "G", i: 0, pos: "G" }, { g: "G", i: 1, pos: "G2" }] },
  ...(L.PP || []).map((u, i) => ({ key: `PP${i + 1}`, label: `Power play ${i + 1}`, slots: u.map((_, j) => ({ g: "PP", i, j, pos: "PP" })) })),
  ...(L.PK || []).map((u, i) => ({ key: `PK${i + 1}`, label: `Penalty kill ${i + 1}`, slots: u.map((_, j) => ({ g: "PK", i, j, pos: "PK" })) })),
];
// Where each spot sits on a 400 x 200 rink (attacking to the right).
const SPOT = { LW: [268, 42], C: [222, 100], RW: [268, 158], LD: [136, 58], RD: [136, 142], G: [66, 100], G2: [90, 165] };
const stSpots = (n, pk) => (pk ? [[150, 70], [150, 130], [230, 60], [230, 140]] : [[300, 60], [300, 140], [230, 100], [170, 60], [170, 140]]).slice(0, n);

export default function RinkLines({ team, mine, onOpen }) {
  const { league, commit, toast } = useGame();
  const [unitKey, setUnitKey] = useState("L1");
  const [pick, setPick] = useState(null);
  if (!team.lines) syncLines(league, team);
  const L = team.lines, game = gameLines(league, team);
  const get = (id) => (id ? league.players[id] : null);
  const units = UNITS(L);
  const unit = units.find((u) => u.key === unitKey) || units[0];
  const read = (a) => (a.g === "G" ? L.G[a.i] : L[a.g][a.i][a.j]);
  const write = (a, id) => { if (a.g === "G") L.G[a.i] = id; else L[a.g][a.i][a.j] = id; };
  const findSlot = (pid, grp) => { // where a player currently sits in the same kind of unit
    if (grp === "PP" || grp === "PK") { for (let i = 0; i < L[grp].length; i++) { const j = L[grp][i].indexOf(pid); if (j >= 0) return { g: grp, i, j }; } return null; }
    if (grp === "G") { const i = L.G.indexOf(pid); return i >= 0 ? { g: "G", i } : null; }
    for (const g of ["F", "D"]) for (let i = 0; i < L[g].length; i++) { const j = L[g][i].indexOf(pid); if (j >= 0) return { g, i, j }; }
    return null;
  };
  const candidates = (a) => {
    const cur = read(a);
    const grp = a.g === "PP" || a.g === "PK" ? a.g : a.g === "G" ? "G" : "ES";
    const pool = grp === "G" ? healthy(league, team).filter((p) => isGoalie(p.pos)) : grp === "ES" ? healthy(league, team).filter((p) => !isGoalie(p.pos) && (a.g === "D" ? isDefense(p.pos) : isForward(p.pos))) : [...new Set([...L.F.flat(), ...L.D.flat()])].map(get).filter((p) => p && p.injury <= 0);
    return pool.filter((p) => p.id !== cur).map((p) => ({ p, at: findSlot(p.id, grp === "ES" ? "ES" : grp) })).sort((x, y) => y.p.ovr - x.p.ovr);
  };
  const place = (a, p) => {
    const cur = read(a);
    const from = findSlot(p.id, a.g === "PP" || a.g === "PK" ? a.g : a.g === "G" ? "G" : "ES");
    write(a, p.id);
    if (from) write(from, cur || null);
    syncLines(league, team); commit(); setPick(null); toast(`${p.name} takes the spot.`);
  };
  // The badge under a spot is the position; the goalie's role (starter or backup) goes in the name line.
  const label = (a) => (a.g === "G" ? "G" : a.g === "PP" || a.g === "PK" ? a.g : a.pos);
  const role = (a) => (a.g === "G" ? (a.i ? "Backup" : "Starter") : label(a));
  const chem = (ids) => { try { const v = lineChemistry(league, team, ids.filter(Boolean)); return Number.isFinite(v) ? v : null; } catch { return null; } };
  const dressedIds = new Set(lineupIds(L));
  const scratches = healthy(league, team).filter((p) => !dressedIds.has(p.id)).sort((a, b) => b.ovr - a.ovr);
  const injured = team.roster.map(get).filter((p) => p && p.injury > 0);
  const spot = (a, k) => {
    const id = read(a), p = get(id), out = p && p.injury > 0;
    const sub = out ? get(a.g === "G" ? game.G[a.i] : a.g === "F" || a.g === "D" ? game[a.g][a.i][a.j] : null) : null;
    const [x, y] = a.g === "PP" || a.g === "PK" ? stSpots(unit.slots.length, a.g === "PK")[a.j] : SPOT[a.pos];
    const picking = pick && pick.g === a.g && pick.i === a.i && pick.j === a.j;
    return (
      <g key={k} className={`rk-spot${picking ? " on" : ""}${out ? " out" : ""}${mine ? "" : " ro"}`} transform={`translate(${x} ${y})`} onClick={() => mine && setPick(picking ? null : a)} role={mine ? "button" : undefined} tabIndex={mine ? 0 : undefined} aria-label={p ? `${role(a)}: ${p.name}, ${p.ovr}` : `${role(a)}: empty`}>
        <circle r="19" fill="#0b1220" stroke={out ? "#ef4444" : p ? tone(p.ovr) : "#475569"} strokeWidth={picking ? 4 : 3} />
        <text y="5" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="900">{p ? p.ovr : "—"}</text>
        <rect x="-16" y="21" width="32" height="12" rx="4" fill={a.g === "PP" || a.g === "PK" ? "#475569" : POS_COLOR[p?.pos || a.pos] || "#64748b"} />
        <text y="30" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="900">{a.g === "PP" || a.g === "PK" ? p?.pos || a.pos : label(a)}</text>
        <text y="45" textAnchor="middle" fill="#0b1220" stroke="#ffffff" strokeWidth="3" paintOrder="stroke" fontSize="11" fontWeight="900">{p ? last(p.name) : "Empty"}</text>
        {a.g === "G" && !sub && <text y="56" textAnchor="middle" fill="#6b21a8" stroke="#fff" strokeWidth="2.5" paintOrder="stroke" fontSize="9" fontWeight="800">{role(a)}</text>}
        {sub && <text y="56" textAnchor="middle" fill="#b91c1c" stroke="#fff" strokeWidth="2.5" paintOrder="stroke" fontSize="9" fontWeight="800">{last(sub.name)} in</text>}
      </g>
    );
  };
  const rowOf = (u) => {
    const ids = u.key.startsWith("L") ? L.F[Number(u.key[1]) - 1] : u.key.startsWith("P") && !u.key.startsWith("PP") && !u.key.startsWith("PK") ? L.D[Number(u.key[1]) - 1] : u.key === "G" ? L.G : L[u.key.slice(0, 2)][Number(u.key[2]) - 1];
    const c = u.key.startsWith("L") ? chem(ids) : null;
    const tagColor = u.key.startsWith("L") ? "#3b82f6" : u.key === "G" ? "#a855f7" : u.key.startsWith("PP") ? "#f59e0b" : u.key.startsWith("PK") ? "#ef4444" : "#22c55e";
    return (
      <button type="button" key={u.key} className={`rk-row${unit.key === u.key ? " on" : ""}`} onClick={() => { setUnitKey(u.key); setPick(null); }}>
        <i style={{ background: tagColor }}>{u.key}</i>
        <span className="rk-names">{ids.map((id, j) => { const p = get(id); return p ? <em key={j} className={p.injury > 0 ? "out" : ""}>{last(p.name)} <b style={{ color: ovrColor(p.ovr) }}>{p.ovr}</b></em> : <em key={j} className="empty">Empty</em>; })}</span>
        {c != null && <small className={c >= 0.6 ? "good" : c < 0 ? "bad" : ""}>{c >= 0 ? "+" : ""}{c.toFixed(1)} chem</small>}
      </button>
    );
  };
  const cands = pick ? candidates(pick) : [];
  return (
    <div className="rk">
      <div className="rk-left">
        <div className="gg-chips rk-units">{units.filter((u) => /^L|^PP|^PK|^G$/.test(u.key)).map((u) => <button key={u.key} className={unit.key === u.key ? "on" : ""} onClick={() => { setUnitKey(u.key); setPick(null); }}>{u.key}</button>)}</div>
        <svg className="rk-ice" viewBox="0 0 400 214" role="img" aria-label={`${unit.label} on the ice`}>
          <defs><clipPath id="rk-clip"><rect x="4" y="4" width="392" height="192" rx="44" /></clipPath></defs>
          <rect x="4" y="4" width="392" height="192" rx="44" fill="#e8f1f8" stroke="#94a3b8" strokeWidth="2" />
          <g clipPath="url(#rk-clip)">
            <rect x="198" y="4" width="4" height="192" fill="#dc2626" /><rect x="126" y="4" width="4" height="192" fill="#2563eb" /><rect x="270" y="4" width="4" height="192" fill="#2563eb" />
            <circle cx="200" cy="100" r="28" fill="none" stroke="#2563eb" strokeWidth="1.5" /><circle cx="200" cy="100" r="2.5" fill="#2563eb" />
            {[[70, 55], [70, 145], [330, 55], [330, 145]].map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r="24" fill="none" stroke="#dc2626" strokeWidth="1.5" /><circle cx={x} cy={y} r="2" fill="#dc2626" /></g>)}
            <path d="M28 88 a12 12 0 0 1 0 24 L18 112 L18 88 Z" fill="#bfdbfe" stroke="#2563eb" strokeWidth="1.2" /><rect x="14" y="92" width="4" height="16" fill="#dc2626" /><rect x="18" y="4" width="1.5" height="192" fill="#dc2626" />
            <path d="M372 88 a12 12 0 0 0 0 24 L382 112 L382 88 Z" fill="#bfdbfe" stroke="#2563eb" strokeWidth="1.2" /><rect x="382" y="92" width="4" height="16" fill="#dc2626" /><rect x="380.5" y="4" width="1.5" height="192" fill="#dc2626" />
          </g>
          {unit.slots.map((a, k) => spot(a, k))}
        </svg>
        <div className="dim small rk-hint">{mine ? "Tap a spot to change who plays there. Red rings are injured players; the name under them is who dresses tonight." : `Viewing the ${team.name}' ${unit.label.toLowerCase()}.`}</div>
        {pick && <div className="rk-picker">
          <div className="gg-k">PUT IN AT {label(pick)} <button className="tiny ghost" style={{ marginLeft: "auto" }} onClick={() => setPick(null)}>Cancel</button></div>
          <div className="rk-cands">{cands.map(({ p, at }) => <button type="button" key={p.id} className="rk-cand" onClick={() => place(pick, p)}><i style={{ background: POS_COLOR[p.pos] }}>{p.pos}</i><span>{p.name}<small>{at ? `now ${at.g === "F" ? `L${at.i + 1}` : at.g === "D" ? `P${at.i + 1}` : at.g === "G" ? (at.i ? "backup" : "starter") : `${at.g}${at.i + 1}`}` : "scratch"}</small></span><b style={{ color: ovrColor(p.ovr) }}>{p.ovr}</b></button>)}{!cands.length && <div className="dim small">Nobody else is available for this spot.</div>}</div>
        </div>}
      </div>
      <aside className="rk-right">
        <div className="rk-glance-h"><b>Lines at a glance</b><span className="dim small">Who plays with whom. Tap a line to see it on the ice.</span></div>
        <div className="rk-glance">
          {units.filter((u) => /^L/.test(u.key)).map(rowOf)}
          <div className="rk-sep" />
          {units.filter((u) => /^P\d/.test(u.key)).map(rowOf)}
          <div className="rk-sep" />
          {rowOf(units.find((u) => u.key === "G"))}
          <div className="rk-sep" />
          {units.filter((u) => /^PP|^PK/.test(u.key)).map(rowOf)}
        </div>
        <div className="rk-bench">
          <div className="gg-k">SCRATCHES <span className="dim" style={{ letterSpacing: 0, textTransform: "none" }}>· {scratches.length} healthy</span></div>
          <div className="rk-chips">{scratches.map((p) => <button type="button" key={p.id} className="rk-chip" onClick={() => onOpen?.(p.id)}><i style={{ background: POS_COLOR[p.pos] }}>{p.pos}</i>{last(p.name)} <b style={{ color: ovrColor(p.ovr) }}>{p.ovr}</b></button>)}{!scratches.length && <span className="dim small">Nobody is sitting.</span>}</div>
          {injured.length > 0 && <><div className="gg-k" style={{ marginTop: 10 }}>INJURED <span className="dim" style={{ letterSpacing: 0, textTransform: "none" }}>· {injured.length} out</span></div>
          <div className="rk-chips">{injured.map((p) => <button type="button" key={p.id} className="rk-chip out" onClick={() => onOpen?.(p.id)}><i style={{ background: POS_COLOR[p.pos] }}>{p.pos}</i>{last(p.name)} <b className="bad">{p.injury}g</b></button>)}</div></>}
        </div>
      </aside>
    </div>
  );
}
