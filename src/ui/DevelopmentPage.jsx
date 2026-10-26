import React, { useMemo, useState } from "react";
import { useGame, PlayerName, ovrColor, Dialog, DBtn } from "./common.jsx";
import Select from "./Select.jsx";
import { TRAINING, setTraining } from "../engine/franchise.js";
import { isGoalie } from "../engine/constants.js";
import { assignProspect } from "../engine/operations.js";
import { requestPosition } from "../engine/development.js";
import { FOCUS_SLOTS, outlook, focusWork, groupAverages, autoFocus } from "../engine/developmentPlan.js";
import { POS_COLOR } from "./TradePage.jsx";
import ProspectWatch from "./ProspectWatch.jsx";

const PosBadge = ({ pos }) => <span className="gg-pos" style={{ background: POS_COLOR[pos] || "#64748b" }}>{pos}</span>;
const fmt = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;
const tone = (n) => (n >= 1 ? "#22c55e" : n > -0.5 ? "#eab308" : "#ef4444");
const FILTERS = [["all", "Everyone"], ["young", "Under 25"], ["nhl", "NHL"], ["farm", "Farm"], ["focus", "In the plan"]];
const SORTS = [["outlook", "Sort: outlook"], ["ovr", "Sort: overall"], ["pot", "Sort: ceiling"], ["age", "Sort: youngest"]];

const TAG = { cornerstone: "★ CORNERSTONE", breakout: "BREAKOUT", trait: "TRAIT UP", milestone: "BIG SEASON", role: "ROLE ↗", wall: "THE WALL" };
// The off-season report (Gridiron's off-season log): your players' summers first, then the league's
// cornerstone seasons and breakouts.
function SummerReport() {
  const { league, openPlayer } = useGame();
  const [all, setAll] = useState(false);
  const rep = league.devReport;
  if (!rep || rep.year !== league.year || !rep.rows?.length) return null;
  const mine = rep.rows.filter((r) => r.tid === league.userTid), rest = rep.rows.filter((r) => r.tid !== league.userTid);
  const shown = [...mine, ...(all ? rest : rest.slice(0, 5))];
  return (
    <section className="gg-card gg-dev-report">
      <div className="gg-k">Off-season report <span className="dim" style={{ letterSpacing: 0, textTransform: "none" }}>· milestones, league leaders, breakouts and roles from the {league.year - 1}-{String(league.year).slice(2)} season</span></div>
      {shown.map((r) => { const t = league.teams[r.tid]; return (
        <div key={r.pid} className="gg-dev-rep-row">
          <PosBadge pos={r.pos} />
          <div className="gg-dev-rep-who"><button className="link" onClick={() => openPlayer(r.pid)}>{r.name}</button>{r.tid !== league.userTid && t ? <span className="dim small"> · {t.abbr}</span> : null}<small>{r.notes.join(" · ")}</small></div>
          {[...new Set(r.kinds)].slice(0, 2).map((k) => <span key={k} className={`gg-dev-rep-tag ${k}`}>{TAG[k]}</span>)}
          <span className="gg-dev-rep-ovr" style={{ color: r.to > r.from ? "#4ade80" : r.to < r.from ? "#f87171" : "#e2e8f0" }}>{r.from} → {r.to}</span>
        </div>
      ); })}
      {rest.length > 5 && <button className="link small" onClick={() => setAll((v) => !v)}>{all ? "Fewer ▴" : `All ${rest.length} around the league ▾`}</button>}
    </section>
  );
}

// One card per player: where he is, where he can get to, what next summer should bring,
// and the one decision that matters (his focus, or his farm assignment).
export default function DevelopmentPage() {
  const { league, commit, toast, openPlayer } = useGame();
  const t = league.teams[league.userTid];
  const [filter, setFilter] = useState("young");
  const [sort, setSort] = useState("outlook");
  const [q, setQ] = useState("");
  const [posTrain, setPosTrain] = useState(null);
  const assigned = t.training.assignments;
  const used = Object.keys(assigned).filter((id) => league.players[id]?.tid === t.id).length;
  const act = (r) => { toast(r.msg); commit(); };
  const rows = useMemo(() => [...t.roster, ...t.prospects].map((id) => league.players[id]).filter(Boolean).map((p) => ({ p, o: outlook(league, t, p), farm: t.prospects.includes(p.id), work: focusWork(league, t, p), groups: groupAverages(p) }))
    .filter(({ p, farm }) => (filter === "young" ? p.age <= 25 : filter === "nhl" ? !farm : filter === "farm" ? farm : filter === "focus" ? !!assigned[p.id] : true) && (!q || p.name.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (sort === "ovr" ? b.p.ovr - a.p.ovr : sort === "pot" ? b.p.pot - a.p.pot : sort === "age" ? a.p.age - b.p.age : b.o.total - a.o.total) || b.p.ovr - a.p.ovr), [league, t, filter, sort, q, assigned]); // eslint-disable-line react-hooks/exhaustive-deps
  const plan = Object.keys(assigned).map((id) => league.players[id]).filter((p) => p && p.tid === t.id);
  const staffDev = Math.round((t.coach.development + t.staff.assistant.development + t.staff.goalie.development) / 3);
  const rising = rows.filter((r) => r.o.total >= 1).length;
  return (
    <div className="stack gg-dev">
      <div className="gg-tiles gg-dev-tiles">
        <div><small>FOCUS SLOTS</small><b style={{ color: used >= FOCUS_SLOTS ? "#22c55e" : "#fbbf24" }}>{used}/{FOCUS_SLOTS}</b></div>
        <div><small>STAFF DEVELOPMENT</small><b>{staffDev}</b></div>
        <div><small>HEAD COACH</small><b>{t.coach.development}</b></div>
        <div><small>ON THE FARM</small><b>{t.prospects.length}</b></div>
        <div><small>RISING</small><b style={{ color: "#22c55e" }}>{rising}</b></div>
      </div>
      <SummerReport />
      <ProspectWatch />
      <section className="gg-card gg-dev-plan">
        <div className="gg-k">The plan <span className="dim" style={{ letterSpacing: 0, textTransform: "none" }}>· your staff gives {FOCUS_SLOTS} players individual attention each week; banked work pays out at season rollover</span>
          {used < FOCUS_SLOTS && <button className="small primary" style={{ marginLeft: "auto" }} onClick={() => act(autoFocus(league))}>Auto-fill {FOCUS_SLOTS - used} slot{FOCUS_SLOTS - used === 1 ? "" : "s"}</button>}</div>
        <div className="gg-dev-slots">
          {plan.map((p) => { const w = focusWork(league, t, p).find((x) => x.focus === assigned[p.id]); return (
            <div key={p.id} className="gg-dev-slot"><PosBadge pos={p.pos} /><div className="gg-dev-slot-who"><b><PlayerName p={p} /></b><small>{TRAINING[assigned[p.id]]?.name} · {w ? `${w.pct}% banked · +${w.gain.toFixed(1)} projected` : "starts this week"}</small><div className="gg-bar"><i style={{ width: `${w?.pct || 0}%`, background: "#22c55e" }} /></div></div><button className="tiny ghost" onClick={() => act(setTraining(league, p.id, ""))} aria-label={`Remove ${p.name}`}>✕</button></div>
          ); })}
          {Array.from({ length: Math.max(0, FOCUS_SLOTS - plan.length) }, (_, i) => <div key={`e${i}`} className="gg-dev-slot empty">Open slot · pick a player below</div>)}
        </div>
      </section>
      <div className="gg-dev-tools">
        <div className="gg-chips">{FILTERS.map(([k, l]) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>)}</div>
        <input className="gg-fa-search" placeholder="Find a player…" aria-label="Find a player" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort players" style={{ minWidth: 150 }}>{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
      </div>
      <div className="gg-dev-grid">
        {rows.map(({ p, o, farm, work, groups }) => {
          const focus = assigned[p.id];
          const full = !focus && used >= FOCUS_SLOTS;
          const span = Math.max(1, p.pot - 40);
          return (
            <div key={p.id} className={`gg-dev-card${focus ? " on" : ""}`}>
              <div className="gg-dev-top">
                <PosBadge pos={p.pos} />
                <button className="link gg-dev-name" onClick={() => openPlayer(p.id)}>{p.name}</button>
                <span className="dim small">{p.age} · {farm ? (p.assignment || "AHL").toUpperCase() : "NHL"}{o.trait ? ` · ${o.trait}` : ""}</span>
                <span className="gg-dev-out" style={{ color: tone(o.total) }} title={`Age curve ${fmt(o.age)} · usage ${fmt(o.usage)} · training ${fmt(o.training)}`}>{fmt(o.total)}<small>{o.label}</small></span>
              </div>
              <div className="gg-dev-ovr"><b style={{ color: ovrColor(p.ovr) }}>{p.ovr}</b><div className="gg-dev-track"><i style={{ width: `${((p.ovr - 40) / span) * 100}%`, background: ovrColor(p.ovr) }} /><em style={{ left: `${Math.min(100, ((p.ovr + Math.max(0, o.total) - 40) / span) * 100)}%` }} /></div><b className="dim">{p.pot}</b></div>
              <div className="gg-dev-groups">{groups.map((g, i) => <button key={g.focus} className={`gg-dev-g${focus === g.focus ? " on" : ""}${i === 0 && !focus ? " weak" : ""}`} disabled={full && focus !== g.focus} title={full ? "All focus slots are in use" : `Focus on ${g.name}`} onClick={() => act(setTraining(league, p.id, focus === g.focus ? "" : g.focus))}><span>{g.name}</span><b>{Math.round(g.avg)}</b>{work.find((w) => w.focus === g.focus) && <i style={{ width: `${work.find((w) => w.focus === g.focus).pct}%` }} />}</button>)}</div>
              {farm && <div className="gg-dev-farm">
                <Select value={p.assignment || "junior"} onChange={(e) => act(assignProspect(league, p.id, e.target.value))} aria-label={`${p.name} assignment`} style={{ minWidth: 110 }}>{["ahl", "junior", "college", "europe"].map((v) => <option key={v} value={v}>{v.toUpperCase()}</option>)}</Select>
                <Select value={p.farmRole || "middle"} onChange={(e) => { p.farmRole = e.target.value; commit(); }} aria-label={`${p.name} role`} style={{ minWidth: 110 }}>{[["top", "Top role"], ["middle", "Middle"], ["depth", "Depth"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
                {p.farmStats?.gp > 0 && <span className="dim small">{p.farmStats.gp} GP · {isGoalie(p.pos) ? `${p.farmStats.w} W` : `${p.farmStats.g + p.farmStats.a} PTS`}</span>}
              </div>}
              {!farm && !isGoalie(p.pos) && (p.positionTraining ? <div className="dim small">Learning {p.positionTraining.to} · week {p.positionTraining.weeks}/8</div> : <button className="tiny ghost gg-dev-pos" onClick={() => setPosTrain(p)}>Change position…</button>)}
            </div>
          );
        })}
        {!rows.length && <div className="gg-empty"><i>🧪</i><b>Nobody matches</b>Try another filter.</div>}
      </div>
      {t.training.campReport?.length > 0 && <section className="gg-card"><div className="gg-k">Camp report</div>{t.training.campReport.map((r) => <div className="gg-inj" key={r.pid}><b>{r.name}</b><span className="dim">{TRAINING[r.focus].name}</span><span className="mono" style={{ marginLeft: "auto" }}>{r.before} → {r.after}</span></div>)}</section>}
      {posTrain && <Dialog title={`Move ${posTrain.name} (${posTrain.pos})`} sub="Eight healthy weeks of training; his archetype and overall are re-read at the new spot." onClose={() => setPosTrain(null)} actions={<DBtn onClick={() => setPosTrain(null)}>Cancel</DBtn>}><div className="gg-chips">{["C", "LW", "RW", "LD", "RD"].filter((x) => x !== posTrain.pos).map((x) => <button key={x} onClick={() => { act(requestPosition(league, posTrain.id, x)); setPosTrain(null); }}>{x}</button>)}</div></Dialog>}
    </div>
  );
}
