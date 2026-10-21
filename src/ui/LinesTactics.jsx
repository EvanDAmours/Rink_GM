// The Lines screen's coaching tools (Gridiron's Personnel card, snap sliders, Situations card and
// position moves, for hockey): team identity and line matching, ice-time sliders, situational
// units, a selected player's rating at every spot with "Move to", and the plan usage report.
import React, { useState } from "react";
import { useGame, ovrColor } from "./common.jsx";
import Headshot from "./Headshot.jsx";
import { POS_COLOR } from "./TradePage.jsx";
import { gameLines } from "../engine/lines.js";
import { isGoalie, isDefense, isForward } from "../engine/constants.js";
import { IDENTITIES, identityOf, lineRoles, LINE_ROLES, PAIR_ROLES, ROLES, SKATER_SLOTS, slotRating, moveCost, movePreview, movePosition, bestRoles } from "../engine/roles.js";
import { iceShares, setShare, resetShares, matchLine, UNIT_KINDS, gameUnits, setUnitSlot, resetUnit, SHARE_MIN, SHARE_MAX } from "../engine/situations.js";
import { lastName, listName, planWords } from "./linesView.js";
import GamePlanPicker from "./GamePlanPicker.jsx";
import { schemeFit } from "../engine/development.js";
import { gamePlan } from "../engine/teamPlanning.js";
import { COACH_STYLES } from "../engine/franchise.js";

const fitColor = (v) => ovrColor(v);

// ---- Identity and line matching ----------------------------------------------------------
export function IdentityPanel({ team, mine }) {
  const { commit, toast } = useGame();
  const id = identityOf(team), m = matchLine(team), roles = lineRoles(team);
  const matchOn = m >= 0;
  return (
    <div className="lx-idn">
      <div className="lx-k">TEAM IDENTITY <span>· sets the default ice time and what the coaches lean toward in the game plan</span></div>
      <div className="lx-plan-open">
        {Object.entries(IDENTITIES).map(([k, v]) => (
          <button type="button" key={k} disabled={!mine} className={`lx-style${id === k ? " on" : ""}`} aria-pressed={id === k} onClick={() => { if (k === "balanced") delete team.identity; else team.identity = k; commit(); toast(`Identity: ${v.name}.`); }}>
            <b>{v.icon} {v.name}</b><small>{v.desc}</small><small className="lx-idn-sh">F {v.F.join("/")} · D {v.D.join("/")}</small>
          </button>
        ))}
      </div>
      <div className="lx-idn-row">
        <label className="lx-check"><input type="checkbox" disabled={!mine} checked={matchOn} onChange={(e) => { team.lineMatch = e.target.checked; commit(); }} /> Line matching</label>
        <span className="lx-dim">{matchOn ? `When their top line is out, your coach sends Line ${m + 1} (${LINE_ROLES[roles.F[m]]?.name.toLowerCase()}). At home he always gets the last change; on the road, on whistles.` : "Your lines roll in order, whoever the other team sends out."}</span>
      </div>
    </div>
  );
}

// ---- Ice time ----------------------------------------------------------------------------
export function IceTimeSliders({ team, mine }) {
  const { league, commit } = useGame();
  const sh = iceShares(team), L = team.lines, roles = lineRoles(team);
  const get = (x) => (x ? league.players[x] : null);
  const own = !!team.iceShares;
  const row = (g, i) => {
    const ids = L[g][i] || [], key = g === "F" ? `L${i + 1}` : `P${i + 1}`;
    const role = g === "F" ? LINE_ROLES[roles.F[i]] : PAIR_ROLES[roles.D[i]];
    return (
      <div className="lx-ice" key={key}>
        <span className="lx-ice-l"><b>{key}</b><small>{role?.short}</small></span>
        <span className="lx-ice-n">{ids.map((x) => (get(x) ? lastName(get(x).name) : "—")).join(" · ")}</span>
        <input type="range" min={SHARE_MIN} max={SHARE_MAX} step={1} value={sh[g][i]} disabled={!mine} aria-label={`${key} share of even-strength ice time`} onChange={(e) => { setShare(team, g, i, Number(e.target.value)); commit(); }} />
        <b className="lx-ice-v">{sh[g][i]}%</b>
      </div>
    );
  };
  return (
    <div className="lx-icebox">
      <div className="lx-k">ICE TIME <span>· share of even-strength minutes{own ? " · your settings" : ` · ${IDENTITIES[identityOf(team)].name} defaults`}</span>
        {mine && own && <button type="button" className="lx-linkbtn" onClick={() => { resetShares(team); commit(); }}>Reset</button>}
      </div>
      {L.F.map((_, i) => row("F", i))}
      <span className="lx-gsep" />
      {L.D.map((_, i) => row("D", i))}
      <div className="lx-dim">Drag one and the others make room, so each group still adds to 100%. Tired lines still sit; late in close games the coach leans on his top units.</div>
    </div>
  );
}

// ---- A selected player: his rating at every spot, and Move to ------------------------------
export function SpotPreview({ p, team, mine, onMoved }) {
  const { league, commit, toast } = useGame();
  if (!p || isGoalie(p.pos)) return null;
  const tag = { free: "free", cheap: "cheap", costly: "costly" };
  const roles = bestRoles(p, 3);
  return (
    <div className="lx-spv">
      <div className="lx-k">{lastName(p.name).toUpperCase()} AT EACH SPOT <span>· what he rates there (cost of the move)</span></div>
      <div className="lx-spv-row">
        {SKATER_SLOTS.map((s) => {
          const v = slotRating(p, s), c = s === p.pos ? "here" : moveCost(p, s), pv = movePreview(p, s);
          return (
            <span key={s} className={`lx-spv-c ${c}`}>
              <i style={{ background: POS_COLOR[s] }}>{s}</i><b style={{ color: ovrColor(v) }}>{v}</b><small>{c === "here" ? "plays here" : tag[c]}</small>
              {mine && pv && s !== p.pos && <button type="button" className="lx-move" title={`Make him a ${s} from now on. He re-rates to ${pv.ovr}${pv.back ? " (his old rating)" : ""}.`} onClick={() => { const r = movePosition(league, p.id, s); toast(r.msg); if (r.ok) { commit(); onMoved?.(); } }}>Move to {s}{pv.back ? " ↩" : ""}</button>}
            </span>
          );
        })}
      </div>
      <div className="lx-spv-roles">Best roles: {roles.map((r) => <span key={r.role}>{r.name} <b style={{ color: fitColor(r.fit) }}>{r.fit}</b></span>)}{p.posFrom && <span className="lx-dim"> · natural {p.posFrom.pos}: moving him back restores his rating</span>}</div>
    </div>
  );
}

// ---- Situational units -------------------------------------------------------------------
const SHAPE_LABEL = { F: "F", D: "D", C: "C", S: "#" };
export function SituationsPanel({ team, mine }) {
  const { league, commit, openPlayer } = useGame();
  const [sel, setSel] = useState(null); // { kind, j }
  const game = gameLines(league, team);
  const dressedIds = [...game.F.flat(), ...game.D.flat()].filter(Boolean);
  const units = gameUnits(league, team, dressedIds);
  const get = (x) => (x ? league.players[x] : null);
  const pin = (kind) => { team.units ||= {}; if (!team.units[kind]?.some(Boolean)) team.units[kind] = [...units[kind]]; };
  const put = (kind, j, pid) => { pin(kind); setUnitSlot(team, kind, j, pid); setSel(null); commit(); };
  const fits = (kind, j, p) => { const s = UNIT_KINDS[kind].shape[j]; return s === "S" ? true : s === "D" ? isDefense(p.pos) : isForward(p.pos); };
  return (
    <div className="lx-cards">
      {Object.entries(UNIT_KINDS).map(([kind, K]) => {
        const ids = units[kind];
        const open = sel && sel.kind === kind;
        const pool = open ? dressedIds.map(get).filter((p) => p && !ids.includes(p.id) && fits(kind, sel.j, p)).sort((a, b) => b.ovr - a.ovr).slice(0, 8) : [];
        return (
          <section key={kind} className="lx-card">
            <div className="lx-card-h"><i className="lx-gtag lx-sit">{kind}</i><b>{K.name}</b><span className="lx-card-m"><span>{units.custom[kind] ? "your picks" : "staff pick"}</span>{mine && units.custom[kind] && <button type="button" className="lx-linkbtn" onClick={() => { resetUnit(team, kind); setSel(null); commit(); }}>Reset</button>}</span></div>
            <div className="lx-dim lx-sit-d">{K.desc}{kind === "LP" || kind === "DZ" ? " Used only once you set it." : ""}</div>
            <div className="lx-rows">
              {ids.map((pid, j) => {
                const p = get(pid), on = open && sel.j === j;
                const lab = kind === "SO" ? `${j + 1}` : SHAPE_LABEL[K.shape[j]];
                return (
                  <button type="button" key={j} className={`lx-row${on ? " sel" : ""}${mine ? "" : " ro"}${p ? "" : " empty"}`} onClick={() => (mine ? setSel(on ? null : { kind, j }) : p && openPlayer(p.id))} aria-pressed={mine ? on : undefined}>
                    <i className="lx-slot" style={{ background: POS_COLOR[p?.pos] || "#475569" }}>{lab}</i>
                    <span className="lx-face">{p && <Headshot p={p} team={team} size={30} decorative />}</span>
                    <span className="lx-who"><span className="lx-nmrow"><span className="lx-ln">{p ? listName(p.name) : "Empty"}</span></span><span className="lx-meta"><span>{p ? `${p.pos} · ${p.age}` : "Tap to fill"}</span></span></span>
                    {p && <b className="lx-ovr" style={{ color: ovrColor(p.ovr) }}>{p.ovr}</b>}
                  </button>
                );
              })}
            </div>
            {open && (
              <div className="lx-card-f lx-instead"><span className="lx-k">PUT IN INSTEAD</span>
                <div className="lx-rows">{pool.map((p) => (
                  <button type="button" key={p.id} className="lx-row bench" onClick={() => put(kind, sel.j, p.id)}>
                    <i className="lx-slot" style={{ background: POS_COLOR[p.pos] }}>{p.pos}</i>
                    <span className="lx-face"><Headshot p={p} team={team} size={30} decorative /></span>
                    <span className="lx-who"><span className="lx-nmrow"><span className="lx-ln">{listName(p.name)}</span></span><span className="lx-meta"><span>{p.pos} · {p.age}</span></span></span>
                    <b className="lx-ovr" style={{ color: ovrColor(p.ovr) }}>{p.ovr}</b>
                  </button>
                ))}{!pool.length && <div className="lx-dim">Nobody else dressed fits this spot.</div>}</div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ---- Plan usage (2.72) -------------------------------------------------------------------
const UNIT_WORD = { OT: "OT trio", EA: "extra attacker", LP: "lead unit", DZ: "D-zone unit" };
export function TacticUsage({ team }) {
  const { league } = useGame();
  const t = team?.tacticLog;
  if (!t) return <div className="lx-dim">How your plan was used shows here after your next game.</div>;
  const opp = league.teams[t.opp];
  const bits = [
    t.dumpIns != null && [`Dump-ins`, `${t.dumpIns}% of entries`, t.plan.forecheck === "aggressive" ? "aggressive forecheck chases them" : null],
    t.shoot != null && [`Shot`, `on ${t.shoot}% of zone touches`, t.plan.attack && t.plan.attack !== "balanced" ? `${t.plan.attack} plan` : null],
    t.oppCarry != null && [`Their carries`, `${t.oppCarry}% of entries`, t.plan.neutral === "trap" ? "the trap pushes this down" : null],
    t.pushing != null && [`Pushing / sitting back`, `${t.pushing}% / ${t.sitting}% of 5-on-5`, null],
  ].filter(Boolean);
  const u = Object.entries(t.units || {}).filter(([, s]) => s > 0);
  return (
    <div className="lx-usage">
      <div className="lx-k">LAST GAME{opp ? ` vs ${opp.abbr}` : ""} <span>· how the plan was used</span></div>
      <div className="lx-usage-g">{bits.map(([k, v, why]) => <span key={k}><small>{k}</small><b>{v}</b>{why && <em>{why}</em>}</span>)}</div>
      {u.length > 0 && <div className="lx-dim">Situational units: {u.map(([k, s]) => `${UNIT_WORD[k] || k} ${Math.round(s)}s`).join(" · ")}</div>}
    </div>
  );
}

// The role a slot asks for and this player's fit there, for a Lines row.
export function roleWord(roleKey) { return ROLES[roleKey]?.name || ""; }

// ---- The game plan: system, identity, ice time and the next game's plan (in Line settings) ----
export function PlanStrip({ team, mine, inDrawer = false }) {
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
        {mine && <span className="lx-plan-tabs">{tab("system", "System")}{!inDrawer && tab("identity", "Identity")}{!inDrawer && tab("ice", "Ice time")}{opp && tab("plan", "Game plan")}<button type="button" className="lx-plan-tab" onClick={() => go("coaching", "coaching")}>Coaching →</button></span>}
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
