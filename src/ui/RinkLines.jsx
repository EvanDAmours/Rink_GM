import React, { useEffect, useRef, useState } from "react";
import { useGame, ovrColor } from "./common.jsx";
import Headshot from "./Headshot.jsx";
import Select from "./Select.jsx";
import GamePlanPicker from "./GamePlanPicker.jsx";
import { syncLines, gameLines, healthy, lineupIds } from "../engine/lines.js";
import { isGoalie, isDefense, isForward } from "../engine/constants.js";
import { lineChemistry, schemeFit } from "../engine/development.js";
import { restShare, REST_OPTIONS } from "../engine/sim.js";
import { gamePlan } from "../engine/teamPlanning.js";
import { COACH_STYLES } from "../engine/franchise.js";
import { POS_COLOR } from "./TradePage.jsx";
import { slotRating, slotRole, roleFit, ROLES, IDENTITIES, identityOf, lineRoles, LINE_ROLES, PAIR_ROLES } from "../engine/roles.js";
import { IdentityPanel, IceTimeSliders, SpotPreview, TacticUsage } from "./LinesTactics.jsx";
import { esSpots, esTags, esBand, stSpots, stTags, stBand, iceShare, goalieShare, lastName, nameSize, offPosition, planWords } from "./linesView.js";

// The rink view of the lines, like the football game's depth-chart field: the whole dressed
// lineup on the ice at once (lines across the attacking half, pairs across the defensive half,
// the starter in the crease), or both power-play or penalty-kill units, one per end. The list on
// the right shows every unit with its ratings and share of the ice; tap a spot or a row to change
// who plays there.

export const UNIT_COLOR = { L: "#3b82f6", P: "#22c55e", G: "#a855f7", PP: "#f59e0b", PK: "#ef4444" };
export const unitColor = (key) => UNIT_COLOR[/^P[PK]/.test(key) ? key.slice(0, 2) : key[0]] || "#475569";
const F_POS = ["LW", "C", "RW"], D_POS = ["LD", "RD"];
const KIND = { es: "ES", pp: "PP", pk: "PK" };
const STRENGTH = { ES: "even-strength", PP: "power-play", PK: "penalty-kill" };
const spotVars = (s) => ({ "--lx": `${s.land[0]}%`, "--ly": `${s.land[1]}%`, "--lw": `${s.land[2]}%`, "--px": `${s.port[0]}%`, "--py": `${s.port[1]}%`, "--pw": `${s.port[2]}%` });
const tagVars = (t) => ({ "--lx": `${t.land[0]}%`, "--ly": `${t.land[1]}%`, "--px": `${t.port[0]}%`, "--py": `${t.port[1]}%` });
const boxVars = (b) => ({ "--lx": `${b.land.x}%`, "--ly": `${b.land.y}%`, "--lw": `${b.land.w}%`, "--lh": `${b.land.h}%`, "--px": `${b.port.x}%`, "--py": `${b.port.y}%`, "--pw": `${b.port.w}%`, "--ph": `${b.port.h}%` });
const signed = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;

// The rink markings, drawn twice: landscape (wide screens) and portrait (phones). CSS shows one.
function Marks() {
  const m = (cls, style) => <i className={`lx-mk ${cls}`} style={style} aria-hidden="true" />;
  return (
    <>
      <span className="lx-marks l" aria-hidden="true">
        {m("gl v", { left: "6%" })}{m("gl v", { left: "94%" })}
        {m("bl v", { left: "36%" })}{m("bl v", { left: "64%" })}{m("rl v", { left: "50%" })}
        {m("cc", { left: "50%", top: "50%" })}{m("dot", { left: "50%", top: "50%" })}
        {[[17, 24], [17, 76], [83, 24], [83, 76]].map(([x, y]) => <React.Fragment key={`${x}${y}`}>{m("fc", { left: `${x}%`, top: `${y}%` })}{m("fd", { left: `${x}%`, top: `${y}%` })}</React.Fragment>)}
        {m("cr l", { left: "6%", top: "50%" })}{m("cr r", { left: "94%", top: "50%" })}
        {m("net l", { left: "6%", top: "50%" })}{m("net r", { left: "94%", top: "50%" })}
      </span>
      <span className="lx-marks p" aria-hidden="true">
        {m("gl h", { top: "4%" })}{m("gl h", { top: "96%" })}
        {m("bl h", { top: "33%" })}{m("bl h", { top: "67%" })}{m("rl h", { top: "50%" })}
        {m("cc", { left: "50%", top: "50%" })}{m("dot", { left: "50%", top: "50%" })}
        {[[24, 13], [76, 13], [24, 87], [76, 87]].map(([x, y]) => <React.Fragment key={`${x}${y}`}>{m("fc", { left: `${x}%`, top: `${y}%` })}{m("fd", { left: `${x}%`, top: `${y}%` })}</React.Fragment>)}
        {m("cr t", { left: "50%", top: "4%" })}{m("cr b", { left: "50%", top: "96%" })}
        {m("net t", { left: "50%", top: "4%" })}{m("net b", { left: "50%", top: "96%" })}
      </span>
    </>
  );
}

// Gridiron's GAME PLAN strip under the field, for hockey: the team identity, how many dressed
// skaters suit it, and the plan for the next opponent. Each part opens right here.
export function PlanStrip({ team, mine }) {
  const { league, commit, toast, go } = useGame();
  const [open, setOpen] = useState(null);
  const style = COACH_STYLES[team.strategy || team.coach?.style] ? team.strategy || team.coach?.style : "balanced";
  const lines = gameLines(league, team);
  const dressed = [...lines.F.flat(), ...lines.D.flat()].map((id) => league.players[id]).filter(Boolean);
  const fits = dressed.filter((p) => schemeFit(p, team) > 0).length;
  const next = (league.schedule || []).find((g) => !g.played && (g.h === team.id || g.a === team.id));
  const opp = next ? league.teams[next.h === team.id ? next.a : next.h] : null;
  const plan = opp ? gamePlan(league, team, opp) : null;
  const auto = team.autoPlan !== false;
  const tab = (k, label) => <button type="button" key={k} className={`lx-plan-tab${open === k ? " on" : ""}`} aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)}>{label} {open === k ? "▴" : "▾"}</button>;
  const icon = { attack: "⚡", defend: "🛡️", balanced: "⚖️" };
  return (
    <div className="lx-planwrap">
      <div className="lx-plan">
        <span className="lx-plan-k">📋 GAME PLAN</span>
        <span>System <b>{COACH_STYLES[style].name}</b></span>
        <span>Identity <b>{IDENTITIES[identityOf(team)].icon} {IDENTITIES[identityOf(team)].name}</b></span>
        <span title={`${fits} of ${dressed.length} dressed skaters suit a ${COACH_STYLES[style].name} identity; each gets +0.7 to his game ratings.`}>System fit <b className={fits * 2 >= dressed.length ? "good" : ""}>{fits}/{dressed.length}</b></span>
        {opp ? <span>vs {opp.abbr} <b>{planWords(plan)}</b> <em>{mine ? (auto ? "coaches' pick" : "your call") : ""}</em></span> : <span className="lx-dim">No game on the schedule</span>}
        {mine && <span className="lx-plan-tabs">{tab("system", "System")}{tab("identity", "Identity")}{tab("ice", "Ice time")}{opp && tab("plan", "Game plan")}<button type="button" className="lx-plan-tab" onClick={() => go("coaching", "coaching")}>Coaching →</button></span>}
      </div>
      {mine && open === "identity" && <div className="lx-plan-box"><IdentityPanel team={team} mine={mine} /></div>}
      {mine && open === "ice" && <div className="lx-plan-box"><IceTimeSliders team={team} mine={mine} /></div>}
      {mine && open === "system" && (
        <div className="lx-plan-open">
          {Object.entries(COACH_STYLES).map(([k, v]) => (
            <button type="button" key={k} className={`lx-style${style === k ? " on" : ""}`} aria-pressed={style === k} onClick={() => { team.strategy = k; commit(); toast(`System: ${v.name}.`); }}>
              <b>{icon[k]} {v.name}</b><small>{v.desc}</small>
            </button>
          ))}
        </div>
      )}
      {mine && open === "plan" && opp && <GamePlanPicker opp={opp} compact />}
    </div>
  );
}

export default function RinkLines({ team, mine, onOpen, strength = "es", top = null }) {
  const { league, commit, toast } = useGame();
  const [pick, setPick] = useState(null);
  const [unit, setUnit] = useState("L1");
  if (!team.lines) syncLines(league, team);
  const L = team.lines, game = gameLines(league, team);
  const get = (id) => (id ? league.players[id] : null);
  const kind = KIND[strength] || "ES";
  const st = kind !== "ES";
  // The highlighted unit and the open spot belong to the strength on show.
  const cur = (st ? unit.startsWith(kind) : /^(L\d|P\d|G)$/.test(unit)) ? unit : st ? `${kind}1` : "L1";
  const pk = pick && (st ? pick.g === kind : ["F", "D", "G"].includes(pick.g)) ? pick : null;
  const same = (a, b) => a && b && a.g === b.g && a.i === b.i && (a.j ?? null) === (b.j ?? null);

  const read = (a) => (a.g === "G" ? L.G[a.i] : L[a.g]?.[a.i]?.[a.j]);
  const write = (a, id) => { if (a.g === "G") L.G[a.i] = id; else L[a.g][a.i][a.j] = id; };
  const grpOf = (a) => (a.g === "PP" || a.g === "PK" ? a.g : a.g === "G" ? "G" : "ES");
  const findSlot = (pid, grp) => { // where a player sits now in the same kind of unit
    if (grp === "PP" || grp === "PK") { for (let i = 0; i < L[grp].length; i++) { const j = L[grp][i].indexOf(pid); if (j >= 0) return { g: grp, i, j }; } return null; }
    if (grp === "G") { const i = L.G.indexOf(pid); return i >= 0 ? { g: "G", i } : null; }
    for (const g of ["F", "D"]) for (let i = 0; i < L[g].length; i++) { const j = L[g][i].indexOf(pid); if (j >= 0) return { g, i, j }; }
    return null;
  };
  const candidates = (a) => {
    const grp = grpOf(a);
    const pool = grp === "G" ? healthy(league, team).filter((p) => isGoalie(p.pos))
      : grp === "ES" ? healthy(league, team).filter((p) => !isGoalie(p.pos) && (a.g === "D" ? isDefense(p.pos) : isForward(p.pos)))
      : [...new Set([...L.F.flat(), ...L.D.flat()])].map(get).filter((p) => p && p.injury <= 0);
    const cur = read(a);
    const val = (p) => (a.g === "F" ? slotRating(p, F_POS[a.j]) : a.g === "D" ? slotRating(p, D_POS[a.j]) : p.ovr);
    return pool.filter((p) => p.id !== cur).map((p) => ({ p, at: findSlot(p.id, grp) })).sort((x, y) => val(y.p) - val(x.p) || y.p.ovr - x.p.ovr);
  };
  const place = (a, p) => {
    const cur = read(a);
    const from = findSlot(p.id, grpOf(a));
    write(a, p.id);
    if (from) write(from, cur || null);
    syncLines(league, team); commit(); toast(`${p.name} takes the spot.`);
  };
  const chem = (ids) => { try { const v = lineChemistry(league, team, ids.filter(Boolean)); return Number.isFinite(v) ? v : null; } catch { return null; } };
  const rest = restShare(league, team);
  const [gStart, gBack] = goalieShare(rest);

  // Unit names, slots and shares.
  const unitOf = (a) => (a.g === "F" ? `L${a.i + 1}` : a.g === "D" ? `P${a.i + 1}` : a.g === "G" ? "G" : `${a.g}${a.i + 1}`);
  const unitName = (key) => (key === "G" ? "Goalies" : key[0] === "L" ? `Line ${key.slice(1)}` : key.startsWith("PP") ? `Power play ${key.slice(2)}` : key.startsWith("PK") ? `Penalty kill ${key.slice(2)}` : `Pair ${key.slice(1)}`);
  const slotsOf = (key) => {
    if (key === "G") return [{ g: "G", i: 0 }, { g: "G", i: 1 }];
    const m = /^(L|P|PP|PK)(\d)$/.exec(key); if (!m) return [];
    const i = Number(m[2]) - 1, g = m[1] === "L" ? "F" : m[1] === "P" ? "D" : m[1];
    return (L[g]?.[i] || []).map((_, j) => ({ g, i, j }));
  };
  const slotName = (a) => (a.g === "F" ? F_POS[a.j] : a.g === "D" ? D_POS[a.j] : a.g === "G" ? (a.i ? "Backup" : "Starter") : get(read(a))?.pos || a.g);
  const shareOf = (key) => (key === "G" ? gStart : key[0] === "L" ? iceShare("F", Number(key.slice(1)) - 1, team) : key.startsWith("PP") || key.startsWith("PK") ? iceShare(key.slice(0, 2), Number(key.slice(2)) - 1) : iceShare("D", Number(key.slice(1)) - 1, team));
  const choose = (a) => { setUnit(unitOf(a)); setPick(same(pk, a) ? null : a); };
  // On a phone the list sits under the rink: bring the picker into view when a spot opens.
  const side = useRef(null);
  const pickKey = pk ? `${pk.g}${pk.i}${pk.j ?? ""}` : "";
  useEffect(() => { if (pickKey && typeof window !== "undefined" && window.innerWidth < 700) side.current?.scrollIntoView?.({ block: "start", behavior: "smooth" }); }, [pickKey]);
  const showUnit = (key) => { setUnit(key); setPick(null); };

  // ---- the rink ----
  const spots = st
    ? L[kind].flatMap((u, i) => stSpots(kind, i, u.map((id) => isDefense(get(id)?.pos || ""))))
    : esSpots(L);
  const tags = st ? stTags(kind) : esTags(L);
  const band = st ? stBand(Number(cur.slice(2)) - 1) : esBand(cur);
  const spot = (s) => {
    const a = s.g === "G" ? { g: "G", i: s.i } : { g: s.g, i: s.i, j: s.j };
    const p = get(read(a)), out = !!p && (p.injury > 0 || !!p.ltir), on = !!same(pk, a);
    const stPos = s.g === "PP" || s.g === "PK";
    const label = s.g === "G" ? (s.i ? "BACKUP" : "G") : stPos ? p?.pos || "—" : s.pos;
    const color = POS_COLOR[stPos ? p?.pos : s.pos] || "#64748b";
    const off = !stPos && s.g !== "G" && offPosition(p, s.pos);
    const sub = out ? get(s.g === "G" ? game.G[s.i] : s.g === "F" || s.g === "D" ? game[s.g][s.i][s.j] : null) : null;
    const ln = p ? lastName(p.name) : "Empty";
    const r = p ? (stPos ? p.ovr : slotRating(p, s.g === "G" ? "G" : s.pos)) : null;
    const where = s.g === "G" ? (s.i ? "Backup goalie" : "Starting goalie") : `${unitName(unitOf(a))} ${stPos ? "" : s.pos}`.trim();
    const title = p ? `${where}: ${p.name}, ${p.pos} ${p.ovr}${off || r !== p.ovr ? ` (rates ${r} at ${s.pos})` : ""}${out ? ` · out ${p.injury > 0 ? `${p.injury}g` : "(LTIR)"}${sub ? `, ${sub.name} plays` : ""}` : ""}` : `${where}: empty`;
    return (
      <button type="button" key={s.key} className={`lx-spot${on ? " on" : ""}${out ? " out" : ""}${s.small ? " sm" : ""}${mine ? "" : " ro"}${!p ? " empty" : ""}`} style={{ ...spotVars(s), "--pc": color }} onClick={() => (mine ? choose(a) : p && onOpen?.(p.id))} title={title} aria-label={title} aria-pressed={mine ? on : undefined}>
        <span className="lx-ring" style={p ? { color: ovrColor(r) } : undefined}>{p ? r : "—"}{out && <i className="lx-out" aria-hidden="true">{p.injury > 0 ? `${p.injury}g` : "IR"}</i>}</span>
        <span className={`lx-chip${off ? " warn" : ""}`} style={{ background: color }}>{label}</span>
        <span className={`lx-nm${nameSize(ln) ? ` ${nameSize(ln)}` : ""}`}>{ln}</span>
      </button>
    );
  };
  const tag = (t) => (
    <button type="button" key={t.key} className={`lx-tag${cur === t.key ? " on" : ""}`} style={{ ...tagVars(t), "--uc": unitColor(t.key) }} onClick={() => showUnit(t.key)} title={`${unitName(t.key)}: ${t.key === "G" ? `the starter gets about ${gStart}% of starts` : `about ${shareOf(t.key)}% of the ${STRENGTH[kind]} ice time`}`}>
      <b>{t.key}</b><i>{shareOf(t.key)}%</i>
    </button>
  );

  // ---- the list at a glance ----
  const injuredNote = (ids, g, i) => ids.map((id, j) => {
    const p = get(id); if (!p || !(p.injury > 0 || p.ltir)) return null;
    const sub = g === "G" ? get(game.G[j]) : g === "F" || g === "D" ? get(game[g][i][j]) : null;
    return `${lastName(p.name)} out${p.injury > 0 ? ` ${p.injury}g` : ""}${sub ? ` · ${lastName(sub.name)} plays` : ""}`;
  }).filter(Boolean);
  const row = (key) => {
    const slots = slotsOf(key), ids = slots.map(read);
    const g = slots[0]?.g, i = slots[0]?.i;
    // Rating and chemistry of who plays tonight (an injured player's fill-in counts), as the sim sees it.
    const tonight = g === "F" || g === "D" ? game[g][i] || ids : ids;
    const c = g === "F" ? chem(tonight) : null;
    const ps = tonight.map(get).filter(Boolean);
    const avg = ps.length ? Math.round(ps.reduce((s, p) => s + p.ovr, 0) / ps.length) : null;
    const notes = injuredNote(ids, g, i);
    const goalies = key === "G";
    return (
      <button type="button" key={key} className={`lx-grow${cur === key ? " on" : ""}`} onClick={() => { setUnit(key); setPick(mine ? slots[0] || null : null); }} title={mine ? `Change ${unitName(key).toLowerCase()}` : unitName(key)}>
        <i className="lx-gtag" style={{ background: unitColor(key) }}>{key}</i>
        <span className="lx-gbody">
          <span className="lx-gnames">{slots.map((a, j) => {
            const p = get(ids[j]);
            const lab = goalies ? (j ? "BU" : "ST") : g === "F" ? F_POS[j] : g === "D" ? D_POS[j] : p?.pos;
            return (
              <span key={j} className={`lx-gp${p && (p.injury > 0 || p.ltir) ? " out" : ""}`}>
                <em>{lab}</em>{p ? lastName(p.name) : "Empty"} {p && <b style={{ color: ovrColor(p.ovr) }}>{p.ovr}</b>}{goalies && p && <small> {j ? gBack : gStart}%</small>}
              </span>
            );
          })}</span>
          {(c != null || notes.length > 0 || (!goalies && avg != null)) && (
            <span className="lx-gsub">
              {!goalies && avg != null && <span>{g === "F" ? "Line" : g === "D" ? "Pair" : "Unit"} <b style={{ color: ovrColor(avg) }}>{avg}</b></span>}
              {(g === "F" || g === "D") && <span>{(g === "F" ? LINE_ROLES[lineRoles(team).F[i]] : PAIR_ROLES[lineRoles(team).D[i]])?.name}</span>}
              {c != null && <span>Chemistry <b className={c >= 0.6 ? "good" : c < 0 ? "bad" : ""}>{signed(c)}</b></span>}
              {notes.map((n) => <span key={n} className="bad">{n}</span>)}
            </span>
          )}
        </span>
        {!goalies && <span className="lx-gshare"><b>{shareOf(key)}%</b><small>{st ? (kind === "PP" ? "of PP" : "of PK") : "TOI"}</small></span>}
      </button>
    );
  };
  const keys = st ? L[kind].map((_, i) => `${kind}${i + 1}`) : [...L.F.map((_, i) => `L${i + 1}`), ...L.D.map((_, i) => `P${i + 1}`), "G"];
  const dressedIds = new Set(lineupIds(L));
  const scratches = healthy(league, team).filter((p) => !dressedIds.has(p.id)).sort((a, b) => b.ovr - a.ovr);
  const injured = team.roster.map(get).filter((p) => p && (p.injury > 0 || p.ltir)).sort((a, b) => b.injury - a.injury);
  const gameDiffers = st && JSON.stringify(game[kind]) !== JSON.stringify(L[kind]);

  // ---- the picker (Gridiron's position list) ----
  const where = (at) => (!at ? "Scratch" : at.g === "F" ? `L${at.i + 1} ${F_POS[at.j]}` : at.g === "D" ? `P${at.i + 1} ${D_POS[at.j]}` : at.g === "G" ? (at.i ? "Backup" : "Starter") : `${at.g}${at.i + 1}`);
  const picker = () => {
    const key = unitOf(pk), here = get(read(pk));
    const esSpot = pk.g === "F" || pk.g === "D", slot = esSpot ? slotName(pk) : null;
    const rk = slotRole(team, pk.g, pk.i, pk.j, here);
    const atSpot = (p) => (esSpot ? slotRating(p, slot) : p.ovr);
    const fitAt = (p) => { const k2 = slotRole(team, pk.g, pk.i, pk.j, p); return k2 ? roleFit(p, k2, slot) : null; };
    const list = candidates(pk);
    const noUnit = pk.g === "PP" || pk.g === "PK" ? "Not on a unit" : "Scratch";
    return (
      <>
        <div className="lx-pick-h"><b>{slotName(pk)}</b><span> · {unitName(key)} · {pk.g === "G" ? `${pk.i ? gBack : gStart}% of starts` : `${shareOf(key)}% of ${STRENGTH[kind]} time`}</span></div>
        <div className="lx-pick-nav">
          <button type="button" className="lx-back" onClick={() => setPick(null)}>← All {st ? "units" : "lines"}</button>
          <span className="lx-slots" role="group" aria-label={`${unitName(key)} spots`}>
            {slotsOf(key).map((a) => { const p = get(read(a)); return <button type="button" key={`${a.i}${a.j ?? ""}`} className={same(a, pk) ? "on" : ""} aria-pressed={!!same(a, pk)} onClick={() => setPick(a)}><em>{slotName(a) === "Starter" ? "ST" : slotName(a) === "Backup" ? "BU" : slotName(a)}</em>{p ? lastName(p.name) : "Empty"}</button>; })}
          </span>
        </div>
        {pk.g === "G" && (
          <label className="lx-rest">Starter rests
            <Select value={Math.round(rest * 100)} onChange={(e) => { team.restPct = Number(e.target.value); team.autoGoalie = team.restPct > 0; commit(); }} aria-label="How often the starter rests">
              {REST_OPTIONS.map((r) => <option key={r} value={r}>{r === 0 ? "never" : `${r}%`} · ~{Math.round(league.schedule.filter((g) => g.h === team.id || g.a === team.id).length * (1 - r / 100))} starts{r === 20 ? " (typical)" : r >= 40 ? " (1A/1B)" : ""}</option>)}
            </Select>
          </label>
        )}
        <div className="lx-cands">
          {here && <div className="lx-cand here"><span className="lx-cwhere on">{where(pk)}</span><span className="lx-face sm"><Headshot p={here} team={team} size={26} decorative /></span><span className="lx-cwho"><button type="button" className="link lx-pname" onClick={() => onOpen?.(here.id)}>{here.name}</button><small>{here.pos} · Age {here.age}{fitAt(here) != null ? <> · {ROLES[slotRole(team, pk.g, pk.i, pk.j, here)].name} <b style={{ color: ovrColor(fitAt(here)) }}>{fitAt(here)}</b></> : ""}{here.injury > 0 ? <b className="bad"> · out {here.injury}g</b> : ""}</small></span><b className="lx-covr" style={{ color: ovrColor(atSpot(here)) }}>{atSpot(here)}</b><span className="lx-here">Here</span></div>}
          {here && esSpot && <SpotPreview p={here} team={team} mine={mine} />}
          {rk && <div className="lx-dim lx-rolewant">{ROLES[rk].name}: {ROLES[rk].wants}</div>}
          {list.map(({ p, at }) => (
            <div key={p.id} className="lx-cand">
              <span className={`lx-cwhere${at ? " on" : ""}`}>{at ? where(at) : noUnit}</span>
              <span className="lx-face sm"><Headshot p={p} team={team} size={26} decorative /></span>
              <span className="lx-cwho"><button type="button" className="link lx-pname" onClick={() => onOpen?.(p.id)}>{p.name}</button><small>{p.pos} · Age {p.age}{fitAt(p) != null ? <> · fit <b style={{ color: ovrColor(fitAt(p)) }}>{fitAt(p)}</b></> : ""}</small></span>
              <b className="lx-covr" style={{ color: ovrColor(atSpot(p)) }} title={esSpot && atSpot(p) !== p.ovr ? `${p.ovr} OVR; ${atSpot(p)} at ${slot}` : undefined}>{atSpot(p)}</b>
              <button type="button" className="lx-start" onClick={() => place(pk, p)}>{at ? "Swap" : "Start"}</button>
            </div>
          ))}
          {!list.length && <div className="lx-dim">Nobody else is available for this spot.</div>}
        </div>
      </>
    );
  };

  return (
    <div className="lx-rv">
      <div className="lx-left">
        {top}
        <div className={`lx-rink${st ? " st" : " es"}`} role="group" aria-label={st ? `${unitName(`${kind}1`)} and ${unitName(`${kind}2`).toLowerCase()} on the ice` : "The dressed lineup on the ice"}>
          <Marks />
          {band && <span className="lx-band" style={{ ...boxVars(band), "--uc": unitColor(cur) }} aria-hidden="true" />}
          {tags.map(tag)}
          {spots.map(spot)}
        </div>
        <div className="lx-hint">{mine ? `Tap a spot to change who plays there. Red rings are injured players; the list shows who fills in.${st ? " Units are drawn from the dressed skaters." : ""}` : `Viewing the ${team.name}' lines. Tap a player for his card.`}</div>
        <PlanStrip team={team} mine={mine} />
      </div>
      <aside className="lx-glance" ref={side}>
        {pk ? picker() : (
          <>
            <div className="lx-glance-h"><b>{st ? `${kind === "PP" ? "Power play" : "Penalty kill"} at a glance` : "Lines at a glance"}</b><span>Who plays and how much.{mine ? " Tap a line (or a spot on the rink) to change it." : ""}</span></div>
            <div className="lx-glist">
              {keys.map((k, n) => <React.Fragment key={k}>{!st && n > 0 && k[0] !== keys[n - 1][0] && <span className="lx-gsep" />}{row(k)}</React.Fragment>)}
            </div>
            {gameDiffers && <div className="lx-dim lx-gnote">Tonight's {kind === "PP" ? "power play" : "kill"} is re-picked from the healthy dressed skaters while an injured player holds a lineup spot.</div>}
            <div className="lx-bench">
              <div className="lx-k">SCRATCHES <span>· {scratches.length} healthy</span></div>
              <div className="lx-chips">{scratches.map((p) => <button type="button" key={p.id} className="lx-pchip" onClick={() => onOpen?.(p.id)}><i style={{ background: POS_COLOR[p.pos] }}>{p.pos}</i>{lastName(p.name)} <b style={{ color: ovrColor(p.ovr) }}>{p.ovr}</b></button>)}{!scratches.length && <span className="lx-dim">Nobody is sitting.</span>}</div>
              {injured.length > 0 && <>
                <div className="lx-k">INJURED <span>· {injured.length} out</span></div>
                <div className="lx-chips">{injured.map((p) => <button type="button" key={p.id} className="lx-pchip out" onClick={() => onOpen?.(p.id)}><i style={{ background: POS_COLOR[p.pos] }}>{p.pos}</i>{lastName(p.name)} <b className="bad">{p.injury > 0 ? `${p.injury}g` : "LTIR"}</b></button>)}</div>
              </>}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
