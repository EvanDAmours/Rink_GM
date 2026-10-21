import Select from "./Select.jsx";
import Headshot from "./Headshot.jsx";
import React, { useRef, useState } from "react";
import { useGame, TeamBadge, ovrColor } from "./common.jsx";
import { autoLines, resetNhlLines, syncLines, gameLines, healthy, teamRatings, lineupIds } from "../engine/lines.js";
import { isGoalie } from "../engine/constants.js";
import { restShare, REST_OPTIONS } from "../engine/sim.js";
import { lineChemistry } from "../engine/development.js";
import { POS_COLOR } from "./TradePage.jsx";
import AbilityChip from "./AbilityChip.jsx";
import { iceShare, goalieShare, lastName, firstName, offPosition } from "./linesView.js";
import { slotRating, slotRole, roleFit, ROLES, lineRoles, LINE_ROLES, PAIR_ROLES } from "../engine/roles.js";
import { IdentityPanel, IceTimeSliders, SpotPreview, SituationsPanel, PlanStrip } from "./LinesTactics.jsx";
import "./lines.css";

// The lines, laid out like a hockey video game's lines screen: one strength at a time (even
// strength, power play, penalty kill, situations), each line a row of compact player cards.
// Move players by dragging one card onto another (desktop), or tap one, then tap where he goes.
// A selected spot also opens a short list of who could play there, best fit first.
// Everything else (identity, line matching, ice time, roles, goalie rest, the game plan) sits
// in the Line settings drawer.

const F_POS = ["LW", "C", "RW"];
const D_POS = ["LD", "RD"];
const avg = (ps) => (ps.length ? Math.round(ps.reduce((s, p) => s + p.ovr, 0) / ps.length) : null);
const sameLines = (a, b) => !!a && !!b && JSON.stringify([a.F, a.D, a.G]) === JSON.stringify([b.F, b.D, b.G]);
const signed = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;
const TABS = [["es", "Even Strength", "5v5"], ["pp", "Power Play", "PP"], ["pk", "Penalty Kill", "PK"], ["sit", "Situations", "Sit"]];
const GROUP = { es: ["F", "D", "G"], pp: ["PP"], pk: ["PK"] };

export default function LinesPage({ onRoster }) {
  const { league, commit, openPlayer, toast } = useGame();
  const [viewTid, setViewTid] = useState(league.userTid);
  const [sel, setSel] = useState(null);
  const [tab, setTab] = useState("es");
  const [drawer, setDrawer] = useState(false);
  const [over, setOver] = useState(null);
  const [spots, setSpots] = useState(false);
  const drag = useRef(null);
  const team = league.teams[viewTid];
  const mine = viewTid === league.userTid;
  if (!team.lines) syncLines(league, team);
  const L = team.lines;
  const game = gameLines(league, team);
  const get = (id) => (id ? league.players[id] : null);
  const tr = teamRatings(league, team);
  const [c1, c2] = team.colors;

  // ---- slots: { g: F|D|G|PP|PK, i, j } or an extra { g: "X", id, k } ----
  const read = (a) => (a.g === "X" ? a.id : a.g === "G" ? L.G[a.i] : L[a.g][a.i][a.j]);
  const write = (a, id) => { if (a.g === "G") L.G[a.i] = id; else L[a.g][a.i][a.j] = id; };
  const kind = (a) => (a.g === "PP" || a.g === "PK" ? a.g : a.g === "X" ? a.k : a.g === "G" ? "G" : "ES");
  const same = (a, b) => !!a && !!b && a.g === b.g && a.i === b.i && a.j === b.j && a.id === b.id;
  const posOf = (a) => (a.g === "F" ? F_POS[a.j] : a.g === "D" ? D_POS[a.j] : a.g === "G" ? "G" : null);
  const findSlot = (id, k) => {
    if (k === "G") { const i = L.G.indexOf(id); return i >= 0 ? { g: "G", i } : null; }
    for (const g of k === "ES" ? ["F", "D"] : [k]) for (let i = 0; i < L[g].length; i++) { const j = L[g][i].indexOf(id); if (j >= 0) return { g, i, j }; }
    return null;
  };
  // Swap two spots (an extra drops into a spot; the man there becomes the extra). Returns false if
  // the two can't trade places.
  const swap = (a, b) => {
    const ka = kind(a), kb = kind(b);
    const goalieA = isGoalie(get(read(a))?.pos || (ka === "G" ? "G" : ""));
    const goalieB = isGoalie(get(read(b))?.pos || (kb === "G" ? "G" : ""));
    const ok = ka === kb || (ka === "ES" && kb === "G" && goalieA) || (ka === "G" && kb === "ES" && goalieB);
    if (!ok || (a.g === "X" && b.g === "X")) return false;
    if (goalieA !== goalieB && ka !== "PP" && ka !== "PK") { toast("Goalies can only swap with goalies."); return null; }
    const x = read(a), y = read(b);
    if (a.g !== "X") write(a, y);
    if (b.g !== "X") write(b, x);
    syncLines(league, team); commit();
    return true;
  };
  const act = (a) => {
    if (!mine) { const p = get(read(a)); if (p) openPlayer(p.id); return; }
    if (!sel) return setSel(a);
    if (same(sel, a)) return setSel(null);
    const r = swap(sel, a);
    setSel(r === false ? a : null);
  };
  const dnd = (a) => (mine ? {
    draggable: !!get(read(a)) || a.g !== "X",
    onDragStart: (e) => { drag.current = a; setSel(null); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", "lx"); } catch { /* old browsers */ } },
    onDragEnd: () => { drag.current = null; setOver(null); },
    onDragOver: (e) => { const s = drag.current; if (s && !same(s, a) && kind(s) === kind(a)) { e.preventDefault(); if (!same(over, a)) setOver(a); } else if (s && (kind(s) === "G" || kind(a) === "G") && (kind(s) === "ES" || kind(a) === "ES")) e.preventDefault(); },
    onDragLeave: () => setOver(null),
    onDrop: (e) => { e.preventDefault(); const s = drag.current; drag.current = null; setOver(null); if (s && !same(s, a)) swap(s, a); },
  } : {});

  const selPlayer = sel ? get(read(sel)) : null;
  const selKind = sel ? kind(sel) : null;
  const dressedIds = new Set([...L.F.flat(), ...L.D.flat()]);
  const roster = team.roster.map(get).filter(Boolean);
  const inLineup = new Set(lineupIds(L));
  const injured = roster.filter((p) => p.injury > 0 || p.ltir).sort((a, b) => b.injury - a.injury);
  const scratches = healthy(league, team).filter((p) => !inLineup.has(p.id)).sort((a, b) => b.ovr - a.ovr);
  const stBench = (k) => [...dressedIds].map(get).filter((p) => p && p.injury <= 0 && !L[k].flat().includes(p.id)).sort((a, b) => b.ovr - a.ovr);

  // ---- one player card ----
  const slot = (a, label) => {
    const id = read(a), p = get(id), isSel = same(sel, a);
    const pos = posOf(a);
    const out = !!p && (p.injury > 0 || !!p.ltir);
    const sub = out && (a.g === "F" || a.g === "D") ? get(game[a.g][a.i][a.j]) : out && a.g === "G" ? get(game.G[a.i]) : null;
    const es = a.g === "F" || a.g === "D";
    const off = es && offPosition(p, pos);
    const target = mine && sel && !isSel && kind(sel) === kind(a);
    const shown = p ? (es ? slotRating(p, pos) : p.ovr) : null;
    const proj = target && selPlayer && es && !isGoalie(selPlayer.pos) ? slotRating(selPlayer, pos) : null;
    const rk = p ? slotRole(team, a.g, a.i, a.j, p) : null;
    const fit = p && rk ? roleFit(p, rk, es ? pos : null) : null;
    const tag = label || (a.g === "PP" || a.g === "PK" ? p?.pos || "—" : pos);
    return (
      <button type="button" key={`${a.g}${a.i}${a.j ?? ""}`} {...dnd(a)}
        className={`lx-pc${isSel ? " sel" : ""}${target ? " target" : ""}${same(over, a) ? " over" : ""}${out ? " out" : ""}${mine ? "" : " ro"}${p ? "" : " empty"}`}
        onClick={() => act(a)} aria-pressed={mine ? isSel : undefined}
        title={p ? `${p.name} · ${p.pos} · ${p.ovr} OVR${off ? ` · playing ${pos} (off position)` : ""}${fit != null ? ` · ${ROLES[rk].name} fit ${fit}` : ""}` : "Empty spot"}>
        <span className="lx-pc-tag" style={{ background: POS_COLOR[tag === "ST" || tag === "BU" ? "G" : tag] || "#475569" }}>{tag}{off && <i className="lx-off" aria-label="off position">!</i>}</span>
        <span className="lx-pc-face">{p && <Headshot p={p} team={team} size={40} decorative />}</span>
        <span className="lx-pc-who">
          <small>{p ? <>{p.number ? `#${p.number} ` : ""}{firstName(p.name)}</> : " "}</small>
          <b>{p ? lastName(p.name) : "Empty"}</b>
          <em>{out ? <span className="bad">{p.injury > 0 ? `Out ${p.injury}g` : "LTIR"}{sub ? ` · ${lastName(sub.name)} in` : ""}</span> : p ? <>{p.pos}{off ? <span className="warn"> at {pos}</span> : ""} · {p.age}<AbilityChip p={p} /></> : mine ? "Tap to fill" : ""}</em>
        </span>
        {proj != null ? <span className="lx-pc-proj" title={`${selPlayer.name} would rate ${proj} here`}><small>→</small><b style={{ color: ovrColor(proj) }}>{proj}</b></span>
          : p && <b className="lx-pc-ovr" style={{ color: ovrColor(shown) }}>{shown}</b>}
      </button>
    );
  };

  // ---- the picker: who could play the selected spot, best fit first ----
  const picker = () => {
    if (!mine || !sel || sel.g === "X") return null;
    const k = kind(sel), pos = posOf(sel), cur = read(sel);
    let pool;
    if (k === "PP" || k === "PK") pool = [...dressedIds].map(get).filter((p) => p && p.injury <= 0);
    else if (k === "G") pool = healthy(league, team).filter((p) => isGoalie(p.pos));
    else pool = healthy(league, team).filter((p) => !isGoalie(p.pos));
    const score = (p) => (pos && pos !== "G" ? slotRating(p, pos) : p.ovr);
    pool = pool.filter((p) => p.id !== cur).sort((a, b) => score(b) - score(a)).slice(0, 8);
    const where = (p) => { const s = findSlot(p.id, k); if (!s) return k === "PP" || k === "PK" ? "Not on a unit" : "Scratch"; return s.g === "G" ? (s.i ? "Backup" : "Starter") : `${s.g === "F" ? "L" : s.g === "D" ? "D" : k}${s.i + 1} ${posOf(s) || ""}`.trim(); };
    const take = (p) => { const s = findSlot(p.id, k); const r = swap(sel, s || { g: "X", id: p.id, k }); if (r !== false) setSel(null); };
    return (
      <div className="lx-pick" key="pick">
        <div className="lx-pick-h">
          <b>{pos && pos !== "G" ? `Who plays ${pos}?` : k === "G" ? "Who's in goal?" : `Who's on ${k}${sel.i + 1}?`}</b>
          <span className="lx-dim">Best fit first · or tap another card to swap</span>
          {selPlayer && (sel.g === "F" || sel.g === "D") && <button type="button" className={`lx-ghost${spots ? " on" : ""}`} aria-expanded={spots} onClick={() => setSpots(!spots)}>Positions</button>}
          {selPlayer && <button type="button" className="lx-ghost" onClick={() => openPlayer(selPlayer.id)}>Profile</button>}
          <button type="button" className="lx-ghost" onClick={() => setSel(null)}>Done</button>
        </div>
        <div className="lx-pick-l">
          {pool.map((p) => { const v = score(p), off = pos && offPosition(p, pos); return (
            <button type="button" key={p.id} className="lx-pk" onClick={() => take(p)}>
              <span className="lx-pc-face sm"><Headshot p={p} team={team} size={30} decorative /></span>
              <span className="lx-pk-n"><b>{lastName(p.name)}</b><small>{p.pos}{off ? <span className="warn"> !</span> : ""} · {where(p)}</small></span>
              <b className="lx-pk-v" style={{ color: ovrColor(v) }}>{v}</b>
            </button>); })}
          {!pool.length && <span className="lx-dim">Nobody else can play here.</span>}
        </div>
        {spots && selPlayer && (sel.g === "F" || sel.g === "D") && <SpotPreview p={selPlayer} team={team} mine={mine} onMoved={() => setSel(null)} />}
      </div>
    );
  };

  // ---- one line card ----
  const chem = (ids) => { try { const v = lineChemistry(league, team, ids.filter(Boolean)); return Number.isFinite(v) ? v : null; } catch { return null; } };
  const roles = lineRoles(team);
  const line = (g, i, ids, slots, extra) => {
    const name = g === "F" ? `Line ${i + 1}` : g === "D" ? `Pair ${i + 1}` : g === "G" ? "Goalies" : `${g === "PP" ? "Power play" : "Penalty kill"} ${i + 1}`;
    const a = avg(ids.map(get).filter(Boolean));
    const c = g === "F" ? chem(L.F[i]) : null;
    const role = g === "F" ? LINE_ROLES[roles.F[i]]?.name : g === "D" ? PAIR_ROLES[roles.D[i]]?.name : null;
    const share = g === "G" ? null : iceShare(g, i, g === "F" || g === "D" ? team : undefined);
    return (
      <section key={`${g}${i}`} className={`lx-line g-${g}`}>
        <header className="lx-line-h">
          <b>{name}</b>
          <span className="lx-chip" title={[a != null && `Line rating ${a}`, role && `Role: ${role}`, c != null && `Chemistry ${signed(c)}`, share != null && `${share}% of the ice time`].filter(Boolean).join(" · ")}>
            {a != null && <b style={{ color: ovrColor(a) }}>{a}</b>}
            {role && <span>{role.replace(/ (line|pair)$/i, "")}</span>}
            {c != null && <span className={c >= 0.6 ? "good" : c < 0 ? "bad" : ""}>{c >= 0.6 ? "●" : c < 0 ? "●" : "○"} chem {signed(c)}</span>}
            {share != null && <span>{share}%</span>}
            {extra}
          </span>
        </header>
        <div className={`lx-slots n${slots.length}`}>{slots}</div>
      </section>
    );
  };

  const nhl = team.nhlLines; const matchesNhl = sameLines(L, nhl);
  const rest = restShare(league, team);
  const [gStart, gBack] = goalieShare(rest);
  const starts = (r) => Math.round(league.schedule.filter((g) => g.h === team.id || g.a === team.id).length * (1 - r / 100));

  // Render the lines of this tab, with the picker right under the line that holds the selection.
  const blocks = [];
  const push = (g, i, ids, slots, extra) => { blocks.push(line(g, i, ids, slots, extra)); if (sel && sel.g === g && sel.i === i) blocks.push(picker()); };
  if (tab === "es") {
    blocks.push(<div className="lx-grp" key="hf">Forwards</div>);
    L.F.forEach((ln, i) => push("F", i, game.F[i], ln.map((_, j) => slot({ g: "F", i, j }))));
    blocks.push(<div className="lx-grp" key="hd">Defence</div>);
    L.D.forEach((pr, i) => push("D", i, game.D[i], pr.map((_, j) => slot({ g: "D", i, j }))));
    blocks.push(<div className="lx-grp" key="hg">Goalies</div>);
    push("G", 0, [], [slot({ g: "G", i: 0 }, "G1"), slot({ g: "G", i: 1 }, "G2")], <span>{gStart}/{gBack} starts</span>);
  } else if (tab === "pp" || tab === "pk") {
    const k = tab.toUpperCase();
    L[k].forEach((u, i) => push(k, i, u, u.map((_, j) => slot({ g: k, i, j }))));
  }
  const extrasK = tab === "es" ? "ES" : tab.toUpperCase();
  const extras = tab === "es" ? scratches : tab === "sit" ? [] : stBench(extrasK);

  return (
    <div className="lnx" style={{ "--c1": c1, "--c2": c2 }}>
      <div className="lx-head">
        <TeamBadge team={team} size={26} decorative />
        <div className="lx-subtabs" role="tablist" aria-label="Lines and roster">
          <button type="button" role="tab" aria-selected="true" className="on">Lines</button>
          {onRoster && <button type="button" role="tab" aria-selected="false" onClick={onRoster}>Roster</button>}
        </div>
        <span className="lx-rts" title="Team, forward, defence and goalie ratings">
          {[["TEAM", tr.ovr], ["F", tr.fwd], ["D", tr.def], ["G", tr.g]].map(([k, v]) => <span key={k}><small>{k}</small><b style={{ color: ovrColor(v) }}>{v}</b></span>)}
        </span>
        <div className="lx-hr">
          <Select className="lx-team" value={viewTid} onChange={(e) => { setViewTid(Number(e.target.value)); setSel(null); }} aria-label="Team">
            {[...league.teams].sort((a, b) => a.city.localeCompare(b.city)).map((t) => <option key={t.id} value={t.id}>{t.city} {t.name}{t.id === league.userTid ? " (you)" : ""}</option>)}
          </Select>
        </div>
      </div>

      <div className="lx-bar">
        <div className="lx-tabs" role="tablist" aria-label="Strength">
          {TABS.map(([k, l, s]) => <button type="button" key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => { setTab(k); setSel(null); }}><span className="l">{l}</span><span className="s">{s}</span></button>)}
        </div>
        <div className="lx-bar-r">
          {mine && <button type="button" className={`lx-ghost${drawer ? " on" : ""}`} aria-expanded={drawer} onClick={() => setDrawer(!drawer)}>⚙ Line settings</button>}
          {mine && <button type="button" className="lx-auto" onClick={() => { autoLines(league, team); setSel(null); commit(); toast("Coach set the lines."); }}>Auto lines</button>}
        </div>
      </div>

      {mine && drawer && (
        <div className="lx-drawer">
          <div className="lx-drawer-r">
            {nhl && <span className="lx-dim">{matchesNhl ? "Opening-night NHL lines." : <>Changed from opening night. <button type="button" className="lx-linkbtn" onClick={() => { resetNhlLines(league, team); setSel(null); commit(); toast("Back to the opening-night NHL lines."); }}>Reset to NHL lines</button></>}</span>}
            <label className="lx-rest">Starter rests <Select value={Math.round(rest * 100)} onChange={(e) => { team.restPct = Number(e.target.value); team.autoGoalie = team.restPct > 0; commit(); }} aria-label="How often the starter rests">{REST_OPTIONS.map((r) => <option key={r} value={r}>{r === 0 ? "never" : `${r}%`} · ~{starts(r)} starts{r === 20 ? " (typical)" : r >= 40 ? " (1A/1B)" : ""}</option>)}</Select></label>
          </div>
          <div className="lx-roles">
            <span className="lx-k">ROLES</span>
            {["F", "D"].flatMap((g) => roles[g].map((cur, i) => (
              <label key={`${g}${i}`} className="lx-role"><small>{g === "F" ? `L${i + 1}` : `D${i + 1}`}</small>
                <Select value={cur} aria-label={`${g === "F" ? "Line" : "Pair"} ${i + 1} role`} onChange={(e) => { team.lineRoles = { ...roles, [g]: roles[g].map((r, k) => (k === i ? e.target.value : r)) }; commit(); }}>
                  {Object.entries(g === "F" ? LINE_ROLES : PAIR_ROLES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                </Select>
              </label>)))}
          </div>
          <div className="lx-drawer-g">
            <section className="lx-card"><IdentityPanel team={team} mine={mine} /></section>
            <section className="lx-card"><IceTimeSliders team={team} mine={mine} /></section>
          </div>
          <PlanStrip team={team} mine={mine} inDrawer />
        </div>
      )}

      {mine && sel && sel.g === "X" && <div className="lx-selbar"><b>{selPlayer ? lastName(selPlayer.name) : "Empty spot"}</b> selected · tap the spot he goes into. <button type="button" className="lx-linkbtn" onClick={() => setSel(null)}>Cancel</button></div>}
      {!mine && <div className="lx-dim">Viewing the {team.name}' lines. Tap a player for his card.</div>}

      {tab === "sit" ? <SituationsPanel team={team} mine={mine} /> : <div className="lx-lines">{blocks}</div>}

      {tab !== "sit" && (
        <div className="lx-extras">
          <div className="lx-grp">{tab === "es" ? "Scratches" : "Not on a unit"} <small>{mine ? (tab === "es" ? "drag or tap into a spot" : "dressed skaters · drag or tap into a spot") : ""}</small></div>
          <div className="lx-xrow">
            {extras.length ? extras.map((p) => { const a = { g: "X", id: p.id, k: tab === "es" ? (isGoalie(p.pos) ? "G" : "ES") : extrasK }; const hot = mine && sel && sel.g !== "X" && kind(sel) === a.k; return (
              <button type="button" key={p.id} {...dnd(a)} className={`lx-x${same(sel, a) ? " sel" : ""}${hot ? " target" : ""}`} onClick={() => (mine ? act(a) : openPlayer(p.id))}>
                <i style={{ background: POS_COLOR[p.pos] }}>{p.pos}</i><span>{lastName(p.name)}</span><b style={{ color: ovrColor(p.ovr) }}>{p.ovr}</b>
              </button>); }) : <span className="lx-dim">Nobody.</span>}
          </div>
          {tab === "es" && injured.length > 0 && (
            <div className="lx-xrow inj"><span className="lx-k">INJURED</span>
              {injured.map((p) => <button type="button" key={p.id} className="lx-x out" onClick={() => openPlayer(p.id)} title={p.injuryNote || "injury"}><i style={{ background: POS_COLOR[p.pos] }}>{p.pos}</i><span>{lastName(p.name)}</span><b className="bad">{p.injury > 0 ? `${p.injury}g` : "LTIR"}</b></button>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
