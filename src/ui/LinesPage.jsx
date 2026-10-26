import Select from "./Select.jsx";
import React, { useMemo, useRef, useState } from "react";
import { useGame, ovrColor, Sheet } from "./common.jsx";
import { usePhone } from "./mobile.js";
import { resetNhlLines, syncLines, gameLines, healthy, lineupIds } from "../engine/lines.js";
import { isGoalie, isDefense } from "../engine/constants.js";
import { restShare, REST_OPTIONS } from "../engine/sim.js";
import { chemistry, autofillByChemistry, autofillByOverall, autofillSpecialTeams } from "../engine/chemistry.js";
import { coachIdeas, applyIdea, lineupGap, gapSummary } from "../engine/lineCoach.js";
import { injuryReturn } from "../engine/injuryReport.js";
import { iceShare, goalieShare, lastName, offPosition } from "./linesView.js";
import { slotRating, lineRoles, LINE_ROLES, PAIR_ROLES } from "../engine/roles.js";
import { IdentityPanel, IceTimeSliders, SpotPreview, SituationsPanel, PlanStrip } from "./LinesTactics.jsx";
import "./lines.css";

// The Lineup screen: one strength at a time (Even strength, Power play, Penalty kill, Situations).
// Every unit is a row: Line 1-4 (LW | C | RW), Pair 1-3 (LD | RD), the goalies beside the coach. The coach panel ("Best change right now") works out, live from the engine,
// the single swap or dressed scratch that most improves rating plus chemistry, and makes it on a
// tap. Move players by dragging one onto another (desktop) or tap one, then tap where he goes;
// a selected spot opens the best fits as a Sheet. Everything else sits in Line settings.

const F_POS = ["LW", "C", "RW"];
const D_POS = ["LD", "RD"];
const avg = (ps) => (ps.length ? Math.round(ps.reduce((s, p) => s + p.ovr, 0) / ps.length) : null);
const sameLines = (a, b) => !!a && !!b && JSON.stringify([a.F, a.D, a.G]) === JSON.stringify([b.F, b.D, b.G]);
const signed = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;
const CHEM_TONE = { Great: "#22c55e", Good: "#84cc16", Fair: "#eab308", Poor: "#ef4444" };
const toneOf = (score) => CHEM_TONE[score >= 76 ? "Great" : score >= 58 ? "Good" : score >= 40 ? "Fair" : "Poor"];
const STRENGTHS = [["es", "Even strength"], ["pp", "Power play"], ["pk", "Penalty kill"], ["sit", "Situations"]];
// The coach panel is closed by default; each device remembers whether it was left open.
const COACH_KEY = "rink.lineCoach.open";
const readOpen = () => { try { return localStorage.getItem(COACH_KEY) === "1"; } catch { return false; } };
const saveOpen = (v) => { try { localStorage.setItem(COACH_KEY, v ? "1" : "0"); } catch { /* storage blocked */ } };
const GAP_WORD = { es: "lineup", pp: "power play", pk: "penalty kill", st: "special teams" };
const POS_WORD = { LW: "left wing", C: "centre", RW: "right wing", LD: "left D", RD: "right D" };

// A small menu: a popover on a computer, a Sheet on a phone.
function Menu({ label, title, items, phone }) {
  const [open, setOpen] = useState(false);
  const pick = (f) => { setOpen(false); f(); };
  const list = items.filter(Boolean).map((it, k) => (it.sep ? <span key={k} className="lx-msep" /> : it.node ? <div key={k} className="lx-mnode">{it.node}</div> : (
    <button type="button" key={k} role="menuitem" className={`lx-mi${it.on ? " on" : ""}`} disabled={it.disabled} onClick={() => pick(it.do)}>
      <b>{it.label}</b>{it.hint && <small>{it.hint}</small>}
    </button>
  )));
  return (
    <span className="lx-menu">
      <button type="button" className="lx-btn quiet" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>{label} ▾</button>
      {open && (phone
        ? <Sheet title={title} onClose={() => setOpen(false)}><div className="lnx lx-msheet" role="menu">{list}</div></Sheet>
        : <><div className="lx-scrim" onClick={() => setOpen(false)} /><div className="lx-pop" role="menu">{list}</div></>)}
    </span>
  );
}

export default function LinesPage({ onRoster }) {
  const { league, commit, openPlayer, toast, go } = useGame();
  const phone = usePhone();
  const [viewTid, setViewTid] = useState(league.userTid);
  const [sel, setSel] = useState(null);
  const [pick, setPick] = useState(false);
  const [tab, setTab] = useState("es");
  const [settings, setSettings] = useState(false);
  const [over, setOver] = useState(null);
  const [spots, setSpots] = useState(false);
  const [why, setWhy] = useState(null);
  const [idea, setIdea] = useState({ sig: "", i: 0 });
  const [coachOpen, setCoachOpenState] = useState(readOpen);
  const setCoachOpen = (v) => { setCoachOpenState(v); saveOpen(v); };
  const drag = useRef(null);
  const team = league.teams[viewTid];
  const mine = viewTid === league.userTid;
  if (!team.lines) syncLines(league, team);
  const L = team.lines;
  const game = gameLines(league, team);
  const get = (id) => (id ? league.players[id] : null);
  const jz = phone ? 24 : 34;

  // ---- slots: { g: F|D|G|PP|PK, i, j } or an extra { g: "X", id, k } ----
  const read = (a) => (a.g === "X" ? a.id : a.g === "G" ? L.G[a.i] : L[a.g][a.i][a.j]);
  const write = (a, id) => { if (a.g === "G") L.G[a.i] = id; else L[a.g][a.i][a.j] = id; };
  const kind = (a) => (a.g === "PP" || a.g === "PK" ? a.g : a.g === "X" ? a.k : a.g === "G" ? "G" : "ES");
  const same = (a, b) => !!a && !!b && a.g === b.g && a.i === b.i && a.j === b.j && a.id === b.id;
  const posOf = (a) => (a.g === "F" ? F_POS[a.j] : a.g === "D" ? D_POS[a.j] : a.g === "G" ? "G" : null);
  const keyOf = (a) => (a.g === "X" ? `X${a.id}` : `${a.g}${a.i}${a.j ?? ""}`);
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
    if (!sel) { setSel(a); setPick(false); setSpots(false); return; }
    if (same(sel, a)) { setSel(null); setPick(false); return; }
    const r = swap(sel, a);
    if (r === false) { setSel(a); setPick(false); } else { setSel(null); setPick(false); }
  };
  const dnd = (a) => (mine && !phone ? {
    draggable: !!get(read(a)) || a.g !== "X",
    onDragStart: (e) => { drag.current = a; setSel(null); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", "lx"); } catch { /* old browsers */ } },
    onDragEnd: () => { drag.current = null; setOver(null); },
    onDragOver: (e) => { const s = drag.current; if (s && !same(s, a) && kind(s) === kind(a)) { e.preventDefault(); if (!same(over, a)) setOver(a); } else if (s && (kind(s) === "G" || kind(a) === "G") && (kind(s) === "ES" || kind(a) === "ES")) e.preventDefault(); },
    onDragLeave: () => setOver(null),
    onDrop: (e) => { e.preventDefault(); const s = drag.current; drag.current = null; setOver(null); if (s && !same(s, a)) swap(s, a); },
  } : {});

  const selPlayer = sel ? get(read(sel)) : null;
  const dressedIds = new Set([...L.F.flat(), ...L.D.flat()]);
  const roster = team.roster.map(get).filter(Boolean);
  const inLineup = new Set(lineupIds(L));
  const injured = roster.filter((p) => p.injury > 0 || p.ltir).sort((a, b) => b.injury - a.injury);
  const scratches = healthy(league, team).filter((p) => !inLineup.has(p.id)).sort((a, b) => b.ovr - a.ovr);
  const chem = (ids, g) => { try { return chemistry(league, team, ids.filter(Boolean), g); } catch { return null; } };
  const roles = lineRoles(team);

  // ---- the coach: best change right now ----
  const mode = tab === "sit" ? "st" : tab;
  const sig = JSON.stringify([L.F, L.D, L.PP, L.PK, mode]);
  // How far from the best lineup the coach can find (his greedy run, on a copy of the lines).
  const gapKey = mine ? `${viewTid}|${sig}|${league.year}|${league.day}|${team.roster.join(",")}` : "";
  const gap = useMemo(() => (mine ? lineupGap(league, team, mode) : null), [gapKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const ideas = mine && coachOpen ? coachIdeas(league, team, mode) : [];
  const idx = idea.sig === sig && ideas.length ? idea.i % ideas.length : 0;
  const shown = ideas[idx] || null;
  const setIdx = (i) => setIdea({ sig, i });
  const hl = new Set(shown && coachOpen ? [keyOf(shown.a), shown.kind === "swap" ? keyOf(shown.b) : `X${shown.inId}`] : []);
  const makeIdea = () => { applyIdea(league, team, shown); setSel(null); setPick(false); setWhy(null); commit(); toast(`${shown.title}. Done.`); };

  // ---- one player cell: sweater, surname, slot rating ----
  const cell = (a) => {
    const id = read(a), p = get(id), isSel = same(sel, a);
    const pos = posOf(a);
    const es = a.g === "F" || a.g === "D";
    const out = !!p && (p.injury > 0 || !!p.ltir);
    const sub = out && es ? get(game[a.g][a.i][a.j]) : out && a.g === "G" ? get(game.G[a.i]) : null;
    const off = es && offPosition(p, pos);
    const target = mine && sel && !isSel && kind(sel) === kind(a);
    const shownR = p ? (es ? slotRating(p, pos) : p.ovr) : null;
    const proj = target && selPlayer && es && !isGoalie(selPlayer.pos) ? slotRating(selPlayer, pos) : null;
    const lit = hl.has(keyOf(a));
    const inj = out ? injuryReturn(league, p) : null;
    return (
      <button type="button" key={keyOf(a)} {...dnd(a)}
        className={`lx-c${isSel ? " sel" : ""}${target ? " target" : ""}${same(over, a) ? " over" : ""}${lit ? " hl" : ""}${out ? " out" : ""}${off ? " off" : ""}${p ? "" : " empty"}`}
        onClick={() => act(a)} aria-pressed={mine ? isSel : undefined}
        title={p ? `${p.name} · ${p.pos} · ${p.ovr} OVR${off ? ` · playing ${POS_WORD[pos] || pos}, off position` : ""}${out ? ` · ${inj?.text || "injured"}` : ""}` : "Empty spot"}>
        <span className="lx-num">{p && (p.number ?? p.num) != null ? p.number ?? p.num : ""}</span>
        <span className="lx-nm">
          <b>{p ? lastName(p.name) : mine ? "Empty" : "—"}{off && <i className="lx-offm" aria-label="off position">{pos}</i>}</b>
          {out && <small className="lx-inj">{inj?.short || "Out"}{sub ? ` · ${lastName(sub.name)} in` : ""}</small>}
        </span>
        {proj != null ? <span className="lx-pj" title={`${selPlayer.name} would rate ${proj} here`}><small>→</small><b style={{ color: ovrColor(proj) }}>{proj}</b></span>
          : p && <span className="lx-ovr" style={{ color: ovrColor(shownR) }}>{shownR}</span>}
        {lit && <span className="lx-sw">swap</span>}
      </button>
    );
  };

  // ---- chemistry meter with its reasons (hover or tap) ----
  const meter = (c, key, withLabel) => {
    if (!c) return null;
    const open = why === key, tone = CHEM_TONE[c.label];
    return (
      <span className={`lx-cm-w${open ? " open" : ""}`}>
        <button type="button" className="lx-cm" aria-expanded={open} aria-label={`Chemistry ${c.score}, ${c.label}. Why?`} onClick={() => setWhy(open ? null : key)}>
          <span className="lx-meter"><i style={{ width: `${c.score}%`, background: tone }} /></span>
          <b style={{ color: tone }}>{c.score}</b>{withLabel && <em style={{ color: tone }}>{c.label}</em>}
        </button>
        <span className="lx-why" role="note">
          <b>Chemistry {c.label.toLowerCase()} ({signed(c.pts)})</b>
          {c.reasons.length ? c.reasons.map((r, k) => <span key={k}><i className={r.v >= 0 ? "good" : "bad"}>{signed(r.v)}</i> {r.text}</span>) : <span>Nothing special yet. Chemistry grows as they play together.</span>}
        </span>
      </span>
    );
  };

  // ---- the picker Sheet: who could play the selected spot, best fit first ----
  const picker = () => {
    if (!mine || !sel || !pick || sel.g === "X") return null;
    const k = kind(sel), pos = posOf(sel), cur = read(sel);
    let pool;
    if (k === "PP" || k === "PK") pool = [...dressedIds].map(get).filter((p) => p && p.injury <= 0);
    else if (k === "G") pool = healthy(league, team).filter((p) => isGoalie(p.pos));
    else pool = healthy(league, team).filter((p) => !isGoalie(p.pos));
    const score = (p) => (pos && pos !== "G" ? slotRating(p, pos) : p.ovr);
    pool = pool.filter((p) => p.id !== cur).sort((a, b) => score(b) - score(a)).slice(0, 10);
    const where = (p) => { const s = findSlot(p.id, k); if (!s) return k === "PP" || k === "PK" ? "Not on a unit" : "Scratch"; return s.g === "G" ? (s.i ? "Backup" : "Starter") : s.g === "F" ? `Line ${s.i + 1} ${posOf(s)}` : s.g === "D" ? `Pair ${s.i + 1} ${posOf(s)}` : `${k}${s.i + 1}`; };
    const take = (p) => { const s = findSlot(p.id, k); const r = swap(sel, s || { g: "X", id: p.id, k }); if (r !== false) { setSel(null); setPick(false); } };
    const spot = sel.g === "F" ? `${pos} on Line ${sel.i + 1}` : sel.g === "D" ? `${pos} on Pair ${sel.i + 1}` : sel.g === "G" ? (sel.i ? "backup" : "starter") : `${k}${sel.i + 1}`;
    const now = selPlayer ? `${lastName(selPlayer.name)} is there now (${score(selPlayer)}).` : "Nobody is there now.";
    return (
      <Sheet title={k === "G" ? `Who plays ${spot}?` : `Who plays ${spot}?`} onClose={() => setPick(false)}>
        <div className="lnx lx-picksheet">
          <div className="lx-dim">{now} Best fits first. Close this and tap another player to swap with him.</div>
          <div className="lx-pick-l">
            {pool.map((p) => { const v = score(p), off = pos && offPosition(p, pos); return (
              <button type="button" key={p.id} className="lx-pk" onClick={() => take(p)}>
                <span className="lx-num">{(p.number ?? p.num) ?? ""}</span>
                <span className="lx-pk-n"><b className={off ? "off" : ""}>{lastName(p.name)}</b><small>{p.pos}{off ? " · off position" : ""} · {where(p)}</small></span>
                <b className="lx-pk-v" style={{ color: ovrColor(v) }}><small>→</small> {v}</b>
              </button>); })}
            {!pool.length && <span className="lx-dim">Nobody else can play here.</span>}
          </div>
          <div className="lx-pick-f">
            {selPlayer && (sel.g === "F" || sel.g === "D") && <button type="button" className={`lx-btn quiet sm${spots ? " on" : ""}`} aria-expanded={spots} onClick={() => setSpots(!spots)}>His rating at every spot</button>}
            {selPlayer && <button type="button" className="lx-btn quiet sm" onClick={() => { setPick(false); setSel(null); openPlayer(selPlayer.id); }}>Profile</button>}
            <button type="button" className="lx-btn quiet sm" onClick={() => { setPick(false); setSel(null); }}>Done</button>
          </div>
          {spots && selPlayer && (sel.g === "F" || sel.g === "D") && <SpotPreview p={selPlayer} team={team} mine={mine} onMoved={() => { setSel(null); setPick(false); }} />}
        </div>
      </Sheet>
    );
  };

  // ---- defence pairs, goalies ----
  const rest = restShare(league, team);
  const [gStart, gBack] = goalieShare(rest);
  // One row per unit: "Line 2 · 75 · Two-way · 28%" with the chemistry meter on the right, then
  // its cells side by side (LW | C | RW, or LD | RD).
  const unitRow = (g, i) => {
    const ps = game[g][i].map(get).filter(Boolean), a = avg(ps);
    const role = (g === "F" ? LINE_ROLES[roles.F[i]] : PAIR_ROLES[roles.D[i]])?.name?.replace(/ (line|pair)$/i, "");
    const pos = g === "F" ? F_POS : D_POS;
    return (
      <div className={`lx-pr g-${g}`} key={`${g}${i}`}>
        <div className="lx-prh">
          <b>{g === "F" ? "Line" : "Pair"} {i + 1}</b>{a != null && <span className="lx-o" style={{ color: ovrColor(a) }}>{a}</span>}
          <span className="lx-m">{role} · {iceShare(g, i, team)}%</span>
          <span className="lx-prm">{meter(chem(L[g][i], g), `${g}${i}`, true)}</span>
        </div>
        <div className={`lx-prc n${pos.length}`}>{pos.map((ps2, j) => <div className="lx-side" key={ps2}><span className="lx-lab">{ps2}</span>{cell({ g, i, j })}</div>)}</div>
      </div>
    );
  };
  const forwards = (
    <section className="lx-gc lx-fwd">
      <h2 className="lx-gh">Forwards</h2>
      <div className="lx-prs">{L.F.map((_, i) => unitRow("F", i))}</div>
    </section>
  );
  const goalRow = (
    <div className="lx-pr lx-gk" key="G">
      <div className="lx-prh"><b>Goalies</b><span className="lx-m">Starter {gStart}% · backup {gBack}% of starts</span></div>
      <div className="lx-prc">{[0, 1].map((i) => <div className="lx-side" key={i}><span className="lx-lab">G{i + 1}</span>{cell({ g: "G", i })}</div>)}</div>
    </div>
  );
  const nameBtn = (p, a) => {
    const lit = hl.has(keyOf(a)), s = same(sel, a), hot = mine && sel && sel.g !== "X" && kind(sel) === a.k;
    return <button type="button" key={p.id} {...dnd(a)} className={`lx-xn${lit ? " hl" : ""}${s ? " sel" : ""}${hot ? " target" : ""}`} onClick={() => (mine ? act(a) : openPlayer(p.id))} title={`${p.name} · ${p.pos} · ${p.ovr} OVR`}>{lastName(p.name)}</button>;
  };
  const list = (arr) => arr.flatMap((x, k) => (k ? [<span key={`c${k}`}>, </span>, x] : [x]));
  const outLine = (
    <div className="lx-out">
      <span>Scratched: {scratches.length ? list(scratches.map((p) => nameBtn(p, { g: "X", id: p.id, k: isGoalie(p.pos) ? "G" : "ES" }))) : <em>nobody</em>}</span>
      {injured.length > 0 && <span>Injured: {list(injured.map((p) => <button type="button" key={p.id} className="lx-xn inj" onClick={() => openPlayer(p.id)} title={`${p.name} · ${injuryReturn(league, p)?.text || "injured"}`}>{lastName(p.name)}</button>))}</span>}
    </div>
  );
  const defence = (
    <section className="lx-gc">
      <h2 className="lx-gh">{phone ? "Defence and goal" : "Defence"}</h2>
      <div className="lx-prs">{L.D.map((_, i) => unitRow("D", i))}{phone && goalRow}</div>
      {outLine}
    </section>
  );

  // ---- special teams ----
  const stView = () => {
    const k = tab.toUpperCase(), word = k === "PP" ? "advantage" : "kill";
    const bench = [...dressedIds].map(get).filter((p) => p && p.injury <= 0 && !p.ltir && !L[k].flat().includes(p.id)).sort((a, b) => b.ovr - a.ovr);
    return (
      <section className="lx-gc">
        <h2 className="lx-gh">{k === "PP" ? "Power play" : "Penalty kill"}</h2>
        <div className="lx-prs">
          {L[k].map((u, i) => {
            const order = u.map((id, j) => ({ j, d: isDefense(get(id)?.pos) ? 1 : 0 })).sort((x, y) => x.d - y.d);
            const a = avg(u.map(get).filter(Boolean));
            return (
              <div className="lx-pr lx-st" key={`${k}${i}`}>
                <div className="lx-prh">
                  <b>{k}{i + 1}</b>{a != null && <span className="lx-o" style={{ color: ovrColor(a) }}>{a}</span>}
                  <span className="lx-m">{iceShare(k, i)}% of the {word}</span>
                  <span className="lx-prm">{meter(chem(u, k), `${k}${i}`, true)}</span>
                </div>
                <div className={`lx-stc n${u.length}`}>{order.map((o) => cell({ g: k, i, j: o.j }))}</div>
              </div>
            );
          })}
        </div>
        <div className="lx-out"><span>Not on a unit: {bench.length ? list(bench.map((p) => nameBtn(p, { g: "X", id: p.id, k }))) : <em>nobody</em>}</span></div>
      </section>
    );
  };

  // ---- the coach panel ----
  const word = tab === "es" ? "lines" : "units";
  const summary = gapSummary(gap, GAP_WORD[mode]);
  // Two short lines: how many changes, then how far from your best (the dot is for screen readers).
  const summaryText = summary.split(" · ").map((x, k) => (k ? <span key={k} className="lx-gap"><span className="lx-dot"> · </span>{x}</span> : <span key={k}>{x}</span>));
  const gapNote = gap && gap.moves ? `Points are rating plus chemistry, weighted by ice time${gap.chem > 0 ? `. ${gap.moves === 1 ? "That change" : `All ${gap.moves} together`}: +${gap.chem} chemistry` : ""}.` : "";
  const toggle = (open) => (
    <button type="button" className={`lx-ctog${open ? " open" : ""}`} aria-expanded={open} onClick={() => setCoachOpen(!open)} title={gapNote || undefined}>
      <span className="lx-ctog-t">{summaryText}</span>
      <span className="lx-ctog-a" aria-hidden="true">{open ? "Hide" : "Show ideas"}<i className="lx-chev">▾</i></span>
    </button>
  );
  const coach = mine && (!gap?.moves && !shown ? (
    <aside className="lx-coach lx-closed set"><div className="lx-ctog-t">{summaryText}</div></aside>
  ) : !coachOpen ? (
    <aside className="lx-coach lx-closed">{toggle(false)}</aside>
  ) : shown ? (() => {
    const others = ideas.map((x, k) => ({ x, k })).filter(({ k }) => k !== idx).slice(0, 3);
    return (
      <aside className="lx-coach" aria-live="polite">
        {toggle(true)}
        {gapNote && <div className="lx-gapnote">{gapNote}</div>}
        <div className="lx-eyb">Best change right now</div>
        <h3>{shown.title}</h3>
        <p>{shown.why}</p>
        {(shown.units.some((u) => u.after.score !== u.before.score) ? shown.units.filter((u) => u.after.score !== u.before.score) : shown.units).map((u) => {
          const b = u.before.score, a2 = u.after.score;
          const note = [u.gains.length && `Gains: ${u.gains.join("; ")}`, u.loses.length && `Loses: ${u.loses.join("; ")}`].filter(Boolean).join(" · ");
          return (
            <div className="lx-ba" key={u.name}>
              <div className="lx-ba-h">{u.name}<span><span style={{ color: toneOf(b) }}>{b}</span> <span className="lx-arrow">→</span> <span style={{ color: toneOf(a2) }}>{a2}</span></span></div>
              <div className="lx-bars">
                {a2 >= b ? <><i className="after" style={{ width: `${a2}%` }} /><i style={{ width: `${b}%`, background: toneOf(b) }} /></>
                  : <><i className="loss" style={{ width: `${b}%` }} /><i style={{ width: `${a2}%`, background: toneOf(a2) }} /></>}
              </div>
              {note && <div className="lx-note">{note}</div>}
            </div>
          );
        })}
        <div className="lx-acts">
          <button type="button" className="lx-btn primary" onClick={makeIdea}>{shown.kind === "swap" ? "Make the swap" : "Make the change"}</button>
          <button type="button" className="lx-btn quiet" disabled={ideas.length < 2} onClick={() => setIdx(idx + 1)}>Next idea</button>
        </div>
        {others.length > 0 && (
          <div className="lx-more">
            <div className="lx-more-t">Other ideas, best first</div>
            {others.map(({ x, k }) => <button type="button" key={k} className="lx-idea" onClick={() => setIdx(k)}><span>{x.title}</span><span className="lx-gain">{x.chem > 0 ? `+${x.chem} chem` : "Better ratings"}</span></button>)}
          </div>
        )}
      </aside>
    );
  })() : (
    <aside className="lx-coach calm">
      {toggle(true)}
      <div className="lx-eyb">Best change right now</div>
      <h3>Your {word} are set</h3>
      <p>No single swap makes these {word} better right now. Ideas show up here as soon as a move would help.</p>
    </aside>
  ));

  // ---- header menus ----
  const nhl = team.nhlLines; const matchesNhl = sameLines(L, nhl);
  const starts = (r) => Math.round(league.schedule.filter((g) => g.h === team.id || g.a === team.id).length * (1 - r / 100));
  const fill = (byChem) => {
    if (tab === "pp" || tab === "pk") autofillSpecialTeams(league, team, byChem);
    else if (byChem) autofillByChemistry(league, team); else autofillByOverall(league, team);
    setSel(null); setPick(false); setWhy(null); commit();
    toast(byChem ? "Lines set for the best chemistry." : "Lines set by overall.");
  };
  const strName = STRENGTHS.find(([k]) => k === tab)[1];
  const teamPick = (
    <label className="lx-teampick"><small>Look at another team's lines</small>
      <Select value={viewTid} onChange={(e) => { setViewTid(Number(e.target.value)); setSel(null); setPick(false); }} aria-label="Team">
        {[...league.teams].sort((a, b) => a.city.localeCompare(b.city)).map((t) => <option key={t.id} value={t.id}>{t.city} {t.name}{t.id === league.userTid ? " (you)" : ""}</option>)}
      </Select>
    </label>
  );
  const strengthMenu = <Menu phone={phone} title="Strength" label={strName} items={[...STRENGTHS.map(([k, l]) => ({ label: l, on: tab === k, do: () => { setTab(k); setSel(null); setPick(false); setWhy(null); } })), { sep: true }, { node: teamPick }]} />;
  const autoMenu = mine && <Menu phone={phone} title="Auto-set" label="Auto-set" items={[
    { label: "Auto lines by overall", hint: tab === "pp" || tab === "pk" ? "Special teams only" : "Best players on the top lines", do: () => fill(false) },
    { label: "Auto lines by chemistry", hint: "Rating plus how well they fit together", do: () => fill(true) },
    nhl && { label: "Reset to NHL lines", hint: matchesNhl ? "You're on the opening-night lines" : "Back to opening night", disabled: matchesNhl, do: () => { resetNhlLines(league, team); setSel(null); setPick(false); commit(); toast("Back to the opening-night NHL lines."); } },
    { sep: true },
    { label: "Line settings", hint: "Identity, line matching, ice time, roles, goalie rest, game plan", do: () => setSettings(true) },
  ]} />;

  const settingsSheet = mine && settings && (
    <Sheet title="Line settings" wide onClose={() => setSettings(false)}>
      <div className="lnx lx-settings">
        <div className="lx-set-r">
          {nhl && <span className="lx-dim">{matchesNhl ? "Opening-night NHL lines." : <>Changed from opening night. <button type="button" className="lx-linkbtn" onClick={() => { resetNhlLines(league, team); commit(); toast("Back to the opening-night NHL lines."); }}>Reset to NHL lines</button></>}</span>}
          <label className="lx-rest">Starter rests <Select value={Math.round(rest * 100)} onChange={(e) => { team.restPct = Number(e.target.value); team.autoGoalie = team.restPct > 0; commit(); }} aria-label="How often the starter rests">{REST_OPTIONS.map((r) => <option key={r} value={r}>{r === 0 ? "never" : `${r}%`} · ~{starts(r)} starts{r === 20 ? " (typical)" : r >= 40 ? " (1A/1B)" : ""}</option>)}</Select></label>
        </div>
        <div className="lx-roles">
          <span className="lx-k">Roles</span>
          {["F", "D"].flatMap((g) => roles[g].map((cur, i) => (
            <label key={`${g}${i}`} className="lx-role"><small>{g === "F" ? `L${i + 1}` : `D${i + 1}`}</small>
              <Select value={cur} aria-label={`${g === "F" ? "Line" : "Pair"} ${i + 1} role`} onChange={(e) => { team.lineRoles = { ...roles, [g]: roles[g].map((r, k) => (k === i ? e.target.value : r)) }; commit(); }}>
                {Object.entries(g === "F" ? LINE_ROLES : PAIR_ROLES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
              </Select>
            </label>)))}
        </div>
        <section className="lx-card"><IdentityPanel team={team} mine={mine} /></section>
        <section className="lx-card"><IceTimeSliders team={team} mine={mine} /></section>
        <PlanStrip team={team} mine={mine} inDrawer />
      </div>
    </Sheet>
  );

  const sectionTabs = (
    <nav className="lx-sectabs" aria-label="Team">
      <button type="button" className="on" aria-current="page">Lines</button>
      {onRoster && <button type="button" onClick={onRoster}>Roster</button>}
      <button type="button" onClick={() => go("coaching")}>Coaching</button>
    </nav>
  );

  const main = tab === "es" ? <>{forwards}{defence}</> : tab === "sit" ? <section className="lx-gc"><h2 className="lx-gh">Situations</h2><SituationsPanel team={team} mine={mine} /></section> : stView();
  const side = <>{coach}{tab === "es" && !phone && <section className="lx-gc lx-gkc">{goalRow}</section>}</>;

  return (
    <div className="lnx lx2">
      {sectionTabs}
      <div className="lx-ph">
        <div className="lx-ph-t">
          <h1>Lineup</h1>
          <div className="lx-s2">{mine ? `${strName} · ideas update every time you move someone` : `${team.city} ${team.name} · ${strName.toLowerCase()} · tap a player for his card`}</div>
        </div>
        <div className="lx-ph-r">
          {!mine && <button type="button" className="lx-btn quiet" onClick={() => { setViewTid(league.userTid); setSel(null); }}>Your lines</button>}
          {strengthMenu}{autoMenu}
        </div>
      </div>
      {phone ? <div className="lx-split">{coach}{main}</div>
        : <div className={`lx-split${mine || tab === "es" ? "" : " solo"}`}><div className="lx-left">{main}</div>{(mine || tab === "es") && <div className="lx-rcol">{side}</div>}</div>}
      {mine && sel && !pick && (
        <div className="lx-selbar" role="status">
          <span><b>{selPlayer ? lastName(selPlayer.name) : "Empty spot"}</b> selected · tap where he goes</span>
          {sel.g !== "X" && <button type="button" className="lx-btn quiet sm" onClick={() => setPick(true)}>Best fits</button>}
          <button type="button" className="lx-btn quiet sm" onClick={() => setSel(null)}>Cancel</button>
        </div>
      )}
      {picker()}
      {settingsSheet}
    </div>
  );
}
