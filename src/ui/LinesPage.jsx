import Select from "./Select.jsx";
import Headshot from "./Headshot.jsx";
import React, { useState } from "react";
import { useGame, TeamBadge, ovrColor } from "./common.jsx";
import { autoLines, resetNhlLines, syncLines, gameLines, healthy, teamRatings, lineupIds } from "../engine/lines.js";
import { isGoalie } from "../engine/constants.js";
import { restShare, REST_OPTIONS } from "../engine/sim.js";
import { lineChemistry } from "../engine/development.js";
import { POS_COLOR } from "./TradePage.jsx";
import RinkLines, { unitColor } from "./RinkLines.jsx";
import { DevChip } from "./scoutingBits.jsx";
import AbilityChip from "./AbilityChip.jsx";
import { iceShare, goalieShare, listName, lastName, firstName, offPosition } from "./linesView.js";
import "./lines.css";

// The lines, laid out like the football game's depth chart: a quiet LINES header with the
// Rink / List switch, the rink with every unit on it (RinkLines.jsx), and a list of readable
// cards: four lines, three pairs, the goalies, the special teams, the scratches and the injured.
// In the list, tap a player, then tap where he goes; a scratch can be tapped into a selected slot.

const F_POS = ["LW", "C", "RW"];
const D_POS = ["LD", "RD"];
const avg = (ps) => (ps.length ? Math.round(ps.reduce((s, p) => s + p.ovr, 0) / ps.length) : null);
const sameLines = (a, b) => !!a && !!b && JSON.stringify([a.F, a.D, a.G]) === JSON.stringify([b.F, b.D, b.G]);
// A young player's development trait (Late bloomer, Star, Superstar), as on the football depth
// chart: shown through age 25, while it still matters; Normal isn't worth the room.
const devTrait = (p) => (p && p.age <= 25 && p.dev && p.dev !== "normal" ? p.dev : null);
const Dev = ({ p }) => { const d = devTrait(p); return d ? <em className="lx-dev"><DevChip dev={d} /></em> : null; };
const signed = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;
const STRENGTHS = [["es", "Even strength"], ["pp", "Power play"], ["pk", "Penalty kill"]];

export default function LinesPage({ onRoster }) {
  const { league, commit, openPlayer, toast } = useGame();
  const [viewTid, setViewTid] = useState(league.userTid);
  const [sel, setSel] = useState(null);
  const [view, setView] = useState(league.settings?.linesView || "rink");
  const [strength, setStrength] = useState("es");
  const pickView = (v) => { setView(v); if (league.settings) league.settings.linesView = v; setSel(null); };
  const team = league.teams[viewTid];
  const mine = viewTid === league.userTid;
  if (!team.lines) syncLines(league, team);
  const L = team.lines;
  const game = gameLines(league, team);
  const get = (id) => (id ? league.players[id] : null);
  const tr = teamRatings(league, team);
  const [c1, c2] = team.colors;

  // ---- list view: tap one, then tap another to swap (scratches drop into a selected slot) ----
  const read = (a) => (a.g === "X" ? a.id : a.g === "G" ? L.G[a.i] : L[a.g][a.i][a.j]);
  const write = (a, id) => { if (a.g === "G") L.G[a.i] = id; else L[a.g][a.i][a.j] = id; };
  const kind = (a) => (a.g === "PP" || a.g === "PK" ? a.g : a.g === "X" ? a.k : a.g === "G" ? "G" : "ES");
  const same = (a, b) => a && b && a.g === b.g && a.i === b.i && a.j === b.j && a.id === b.id;
  const act = (a) => {
    if (!mine) { const p = get(read(a)); if (p) openPlayer(p.id); return; }
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

  // One player row in a unit card: slot chip, face, full name (first initial if it's long),
  // position and age with the dev and X-Factor chips, and the rating.
  const row = (a, slot) => {
    const id = read(a), p = get(id), isSel = same(sel, a);
    const out = !!p && (p.injury > 0 || !!p.ltir);
    const sub = out && (a.g === "F" || a.g === "D") ? get(game[a.g][a.i][a.j]) : out && a.g === "G" ? get(game.G[a.i]) : null;
    const off = (a.g === "F" || a.g === "D") && offPosition(p, slot);
    const target = mine && sel && !isSel && kind(sel) === kind(a);
    const st = a.g === "PP" || a.g === "PK";
    const chip = st ? p?.pos || "—" : slot;
    const nm = p ? listName(p.name) : "";
    const ln = p ? lastName(nm) : "Empty", fn = p ? firstName(nm) : "";
    return (
      <button type="button" key={`${a.g}${a.i}${a.j ?? ""}`} className={`lx-row${isSel ? " sel" : ""}${target ? " target" : ""}${out ? " out" : ""}${mine ? "" : " ro"}${!p ? " empty" : ""}`} onClick={() => act(a)} aria-pressed={mine ? !!isSel : undefined} title={p ? `${p.name} · ${p.pos} · ${p.ovr} OVR${off ? ` · playing ${slot}` : ""}` : "Empty slot"}>
        <i className={`lx-slot${off ? " warn" : ""}`} style={{ background: POS_COLOR[st ? p?.pos : slot === "BU" || slot === "ST" ? "G" : slot] || "#475569" }}>{chip}</i>
        <span className="lx-face">{p && <Headshot p={p} team={team} size={30} decorative />}</span>
        <span className="lx-who">
          <span className="lx-nmrow">{fn && <span className="lx-fn">{fn}&nbsp;</span>}<span className="lx-ln">{ln}</span></span>
          <span className="lx-meta">{out ? <b className="bad">{p.injury > 0 ? `Out ${p.injury}g` : "LTIR"}{sub ? ` · ${lastName(sub.name)} plays` : ""}</b> : p ? <span>{p.pos}{off ? ` at ${slot}` : ""} · {p.age}</span> : <span>Tap to fill</span>}<Dev p={p} /><AbilityChip p={p} /></span>
        </span>
        {p && <b className="lx-ovr" style={{ color: ovrColor(p.ovr) }}>{p.ovr}</b>}
      </button>
    );
  };
  const chem = (ids) => { try { const v = lineChemistry(league, team, ids.filter(Boolean)); return Number.isFinite(v) ? v : null; } catch { return null; } };
  const card = (key, title, meta, rows, extra) => (
    <section key={key} className="lx-card">
      <div className="lx-card-h"><i className="lx-gtag" style={{ background: unitColor(key) }}>{key}</i><b>{title}</b><span className="lx-card-m">{meta}</span></div>
      <div className="lx-rows">{rows}</div>
      {extra}
    </section>
  );
  const metaOf = (ids, share, label, c) => { const a = avg(ids.map(get).filter(Boolean)); return <>{a != null && <span>Rating <b style={{ color: ovrColor(a) }}>{a}</b></span>}{c != null && <span>Chem <b className={c >= 0.6 ? "good" : c < 0 ? "bad" : ""}>{signed(c)}</b></span>}<span><b>{share}%</b> {label}</span></>; };

  const roster = team.roster.map(get).filter(Boolean);
  const inLineup = new Set(lineupIds(L));
  const dressedIds = new Set([...L.F.flat(), ...L.D.flat()]);
  const injured = roster.filter((p) => p.injury > 0 || p.ltir).sort((a, b) => b.injury - a.injury);
  const scratches = healthy(league, team).filter((p) => !inLineup.has(p.id)).sort((a, b) => b.ovr - a.ovr);
  const stBench = (k) => [...dressedIds].map(get).filter((p) => p && p.injury <= 0 && !L[k].flat().includes(p.id)).sort((a, b) => b.ovr - a.ovr);
  const selKind = sel ? kind(sel) : null;
  const selPlayer = sel ? get(read(sel)) : null;
  const scratchRow = (p, k) => {
    const a = { g: "X", id: p.id, k }; const hot = mine && sel && sel.g !== "X" && selKind === k; const nm = listName(p.name);
    return (
      <button type="button" key={`${k}${p.id}`} className={`lx-row bench${same(sel, a) ? " sel" : ""}${hot ? " target" : ""}${mine ? "" : " ro"}`} onClick={() => (mine ? act(a) : openPlayer(p.id))} aria-pressed={mine ? !!same(sel, a) : undefined}>
        <i className="lx-slot" style={{ background: POS_COLOR[p.pos] }}>{p.pos}</i>
        <span className="lx-face"><Headshot p={p} team={team} size={30} decorative /></span>
        <span className="lx-who"><span className="lx-nmrow">{firstName(nm) && <span className="lx-fn">{firstName(nm)}&nbsp;</span>}<span className="lx-ln">{lastName(nm)}</span></span><span className="lx-meta"><span>{p.pos} · {p.age}</span><Dev p={p} /><AbilityChip p={p} /></span></span>
        <b className="lx-ovr" style={{ color: ovrColor(p.ovr) }}>{p.ovr}</b>
      </button>
    );
  };
  const nhl = team.nhlLines; const matchesNhl = sameLines(L, nhl);
  const rest = restShare(league, team);
  const [gStart, gBack] = goalieShare(rest);
  const starts = (r) => Math.round(league.schedule.filter((g) => g.h === team.id || g.a === team.id).length * (1 - r / 100));

  // Gridiron's PERSONNEL row, for hockey: the team ratings, and whether these are the
  // opening-night NHL lines (with the way back to them).
  const ratings = (
    <div className="lx-sub">
      <span className="lx-k">RATINGS</span>
      {[["Team", tr.ovr], ["Fwd", tr.fwd], ["Def", tr.def], ["G", tr.g]].map(([k, v]) => <span key={k} className="lx-rt"><small>{k}</small><b style={{ color: ovrColor(v) }}>{v}</b></span>)}
      {nhl && <span className={`lx-nhl${matchesNhl ? " ok" : ""}`}>{matchesNhl ? "Opening-night NHL lines" : <>Changed from opening night{mine && <button type="button" className="lx-linkbtn" onClick={() => { resetNhlLines(league, team); setSel(null); commit(); toast("Back to the opening-night NHL lines."); }}>Reset</button>}</>}</span>}
    </div>
  );

  return (
    <div className="lnx" style={{ "--c1": c1, "--c2": c2 }}>
      <div className="lx-head">
        <div className="lx-h1">
          <TeamBadge team={team} size={26} decorative />
          <span className="lx-eyebrow">LINES</span>
          <div className="lx-subtabs" role="tablist" aria-label="Lines and roster">
            <button type="button" role="tab" aria-selected="true" className="on">Lines</button>
            {onRoster && <button type="button" role="tab" aria-selected="false" onClick={onRoster}>Roster &amp; call-ups</button>}
          </div>
          <div className="lx-h1r">
            <Select className="lx-team" value={viewTid} onChange={(e) => { setViewTid(Number(e.target.value)); setSel(null); }} aria-label="Team">
              {[...league.teams].sort((a, b) => a.city.localeCompare(b.city)).map((t) => <option key={t.id} value={t.id}>{t.city} {t.name}{t.id === league.userTid ? " (you)" : ""}</option>)}
            </Select>
            <div className="lx-seg" role="tablist" aria-label="View">
              <button type="button" role="tab" aria-selected={view === "rink"} className={view === "rink" ? "on" : ""} onClick={() => pickView("rink")}>🏒 Rink</button>
              <button type="button" role="tab" aria-selected={view === "list"} className={view === "list" ? "on" : ""} onClick={() => pickView("list")}>☰ List</button>
            </div>
          </div>
        </div>
        <div className="lx-h2">
          {view === "rink" ? (
            <div className="lx-sides" role="tablist" aria-label="Strength">
              {STRENGTHS.map(([k, l]) => <button type="button" key={k} role="tab" aria-selected={strength === k} className={strength === k ? "on" : ""} onClick={() => setStrength(k)}>{l}</button>)}
            </div>
          ) : (
            <div className="lx-hint lx-selbar">{!mine ? `Viewing the ${team.name}' lines. Tap a player for his card.` : selPlayer ? <><b>{selPlayer.name}</b><AbilityChip p={selPlayer} /> selected · tap another player{selKind === "PP" || selKind === "PK" ? " or a skater below" : " or a scratch"} to swap</> : sel ? "Empty slot selected · tap a player to move him here" : "Tap a player, then tap another to swap. Scratches drop into a selected slot."}</div>
          )}
          <div className="lx-h2r">
            {view === "list" && mine && selPlayer && <><button type="button" className="lx-ghost" onClick={() => openPlayer(selPlayer.id)}>Profile</button><button type="button" className="lx-ghost" onClick={() => setSel(null)}>Cancel</button></>}
            {mine && <button type="button" className="lx-auto" onClick={() => { autoLines(league, team); setSel(null); commit(); toast("Lines set by rating."); }}>Auto-set by rating</button>}
          </div>
        </div>
      </div>

      {view === "rink" && <RinkLines key={viewTid} team={team} mine={mine} onOpen={openPlayer} strength={strength} top={ratings} />}
      {view === "list" && (
        <div className="lx-list">
          {ratings}
          <div className="lx-sec">
            <div className="lx-sec-h">FORWARDS <small>line rating, chemistry and share of even-strength ice time on each card</small></div>
            <div className="lx-cards">
              {L.F.map((line, i) => card(`L${i + 1}`, `Line ${i + 1}`, metaOf(game.F[i], iceShare("F", i), "TOI", chem(line)), line.map((_, j) => row({ g: "F", i, j }, F_POS[j]))))}
            </div>
          </div>
          <div className="lx-sec">
            <div className="lx-sec-h">DEFENCE &amp; GOALIES</div>
            <div className="lx-cards">
              {L.D.map((pair, i) => card(`P${i + 1}`, `Pair ${i + 1}`, metaOf(game.D[i], iceShare("D", i), "TOI", null), pair.map((_, j) => row({ g: "D", i, j }, D_POS[j]))))}
              {card("G", "Goalies", <span><b>{gStart}%</b> / {gBack}% of starts</span>, [row({ g: "G", i: 0 }, "ST"), row({ g: "G", i: 1 }, "BU")],
                <div className="lx-card-f">
                  {mine ? <label className="lx-rest">Starter rests <Select value={Math.round(rest * 100)} onChange={(e) => { team.restPct = Number(e.target.value); team.autoGoalie = team.restPct > 0; commit(); }} aria-label="How often the starter rests">{REST_OPTIONS.map((r) => <option key={r} value={r}>{r === 0 ? "never" : `${r}%`} · ~{starts(r)} starts{r === 20 ? " (typical)" : r >= 40 ? " (1A/1B)" : ""}</option>)}</Select></label>
                    : <span className="lx-dim">{Math.round(rest * 100) >= 40 ? "1A/1B tandem" : `Backup starts ~${Math.round(rest * 100)}%`}</span>}
                </div>)}
            </div>
          </div>
          <div className="lx-sec">
            <div className="lx-sec-h">SPECIAL TEAMS <small>units are drawn from the dressed skaters</small></div>
            <div className="lx-cards">
              {["PP", "PK"].flatMap((k) => L[k].map((unit, i) => card(`${k}${i + 1}`, `${k === "PP" ? "Power play" : "Penalty kill"} ${i + 1}`, metaOf(unit, iceShare(k, i), `of ${k}`, null), unit.map((_, j) => row({ g: k, i, j }, k)),
                mine && sel && sel.g === k && sel.i === i && (
                  <div className="lx-card-f lx-instead"><span className="lx-k">PUT IN INSTEAD</span><div className="lx-rows">{stBench(k).slice(0, 8).map((p) => scratchRow(p, k))}</div></div>
                ))))}
            </div>
          </div>
          <div className="lx-sec">
            <div className="lx-sec-h">OUT OF THE LINEUP</div>
            <div className="lx-cards">
              <section className="lx-card">
                <div className="lx-card-h"><b>Scratches</b><span className="lx-card-m"><span>{scratches.length} healthy</span></span></div>
                <div className="lx-rows">{scratches.length ? scratches.map((p) => scratchRow(p, isGoalie(p.pos) ? "G" : "ES")) : <div className="lx-dim">Nobody is sitting.</div>}</div>
              </section>
              <section className="lx-card">
                <div className="lx-card-h"><b>Injured</b><span className="lx-card-m"><span>{injured.length ? `${injured.length} out` : "all healthy"}</span></span></div>
                <div className="lx-rows">{injured.length ? injured.map((p) => (
                  <button type="button" key={p.id} className="lx-row out" onClick={() => openPlayer(p.id)}>
                    <i className="lx-slot" style={{ background: POS_COLOR[p.pos] }}>{p.pos}</i>
                    <span className="lx-face"><Headshot p={p} team={team} size={30} decorative /></span>
                    <span className="lx-who"><span className="lx-nmrow"><span className="lx-ln">{listName(p.name)}</span></span><span className="lx-meta"><span>{p.injuryNote || "injury"}</span></span></span>
                    <b className="lx-ovr bad">{p.injury > 0 ? `${p.injury}g` : "LTIR"}</b>
                  </button>
                )) : <div className="lx-dim">No injuries.</div>}</div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
