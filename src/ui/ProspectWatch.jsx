import React, { useMemo, useState } from "react";
import { useGame, PlayerName, ovrColor } from "./common.jsx";
import Headshot from "./Headshot.jsx";
import Select from "./Select.jsx";
import { prospectWatch, ratingPath } from "../engine/prospectWatch.js";
import { assignProspect } from "../engine/operations.js";
import { callUp, hasRoomFor } from "../engine/roster.js";
import { setTraining } from "../engine/franchise.js";
import { weakestGroup, FOCUS_SLOTS } from "../engine/developmentPlan.js";
import { DEV_TRAITS } from "../engine/players.js";
import { POS_COLOR } from "./TradePage.jsx";

// A small rating line for the season: weekly points, flat until the kid moves.
export function Sparkline({ path, color = "#22c55e", width = 120, height = 30 }) {
  if (!path?.length) return null;
  const lo = Math.min(...path.map((x) => x.ovr)) - 1, hi = Math.max(...path.map((x) => x.ovr)) + 1;
  const xs = path.length > 1 ? path.map((_, i) => (i / (path.length - 1)) * (width - 4) + 2) : [width / 2];
  const ys = path.map((x) => height - 3 - ((x.ovr - lo) / Math.max(1, hi - lo)) * (height - 6));
  const d = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
  return <svg className="gg-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true"><path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /><circle cx={xs.at(-1)} cy={ys.at(-1)} r="2.6" fill={color} /></svg>;
}

const LEVEL_TONE = { AHL: "ahl", NHL: "nhl" };
const levelTone = (lv) => LEVEL_TONE[lv] || "amateur";
const FILTERS = [["all", "All"], ["farm", "On the farm"], ["nhl", "In the NHL"], ["drafted", "My draft picks"], ["decide", "Needs a decision"]];

export default function ProspectWatch({ compact = false, limit }) {
  const { league, commit, toast, openPlayer, go } = useGame();
  const t = league.teams[league.userTid];
  const [filter, setFilter] = useState("all");
  const rows = useMemo(() => prospectWatch(league, t), [league, t, league.day, league.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = rows.filter((r) => filter === "all" || (filter === "farm" ? r.farm : filter === "nhl" ? !r.farm : filter === "drafted" ? r.p.draft?.tid === t.id : !!r.next)).slice(0, limit || rows.length);
  const act = (r) => { toast(r.msg); commit(); };
  const used = Object.keys(t.training?.assignments || {}).filter((id) => league.players[id]?.tid === t.id).length;
  const inSeason = ["preseason", "regular", "playoffs"].includes(league.phase);
  const doNext = (r) => {
    const p = r.p;
    if (!r.next) return;
    if (r.next.kind === "callup") { if (!hasRoomFor(league, t)) { toast("Your NHL roster is full (23). Send someone down first."); return; } if (callUp(league, t, p.id)) { commit(); toast(`${p.name} called up.`); } else toast(`${p.name} cannot be recalled yet.`); }
    else if (r.next.kind === "role") { p.farmRole = r.prod === "dominant" ? "top" : "middle"; commit(); toast(`${p.name} moved to a ${p.farmRole} role.`); }
    else if (r.next.kind === "assign") act(assignProspect(league, p.id, "ahl"));
    else if (r.next.kind === "focus") { if (used >= FOCUS_SLOTS) { toast("All focus slots are in use. Free one in the plan below."); return; } act(setTraining(league, p.id, weakestGroup(p))); }
    else if (r.next.kind === "sign") act(assignProspect(league, p.id, "ahl"));
    else if (r.next.kind === "senddown") go("pipeline");
  };
  const moved = rows.filter((r) => r.delta > 0).length, dom = rows.filter((r) => r.prod === "dominant").length, decisions = rows.filter((r) => r.next).length;
  return (
    <section className={`gg-card gg-watch${compact ? " compact" : ""}`}>
      <div className="gg-k">PROSPECT WATCH <span className="dim" style={{ letterSpacing: 0, textTransform: "none" }}>· {rows.length} young players · {moved} up this season · {dom} dominating · {decisions} need a decision</span>{compact && <button className="small" style={{ marginLeft: "auto" }} onClick={() => go("development")}>Open the development desk →</button>}</div>
      {!compact && <div className="gg-chips gg-watch-filters">{FILTERS.map(([k, l]) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>)}</div>}
      <div className="gg-watch-grid">
        {shown.map((r) => {
          const p = r.p, col = r.delta > 0 ? "#22c55e" : r.delta < 0 ? "#ef4444" : "#94a3b8";
          return (
            <div key={p.id} className={`gg-watch-card${r.next ? " decide" : ""}`}>
              <div className="gg-watch-head">
                <Headshot p={p} team={t} size={46} decorative />
                <div className="gg-watch-who">
                  <button className="link gg-watch-name" onClick={() => openPlayer(p.id)}>{p.name}</button>
                  <span className="dim small"><i className="gg-pos" style={{ background: POS_COLOR[p.pos] || "#64748b" }}>{p.pos}</i> {p.age} · {r.drafted || (p.src === "gen" ? "undrafted" : "pro")}{p.dev && DEV_TRAITS[p.dev] ? ` · ${DEV_TRAITS[p.dev].name}` : ""}</span>
                </div>
                <span className={`gg-watch-level ${levelTone(r.level)}`}>{r.level}</span>
              </div>
              <div className="gg-watch-mid">
                <div className="gg-watch-ovr"><b style={{ color: ovrColor(p.ovr) }}>{p.ovr}</b><small>OVR</small><span style={{ color: col }}>{r.delta > 0 ? "+" : ""}{r.delta}<em>since camp</em></span><small className="dim">POT {p.pot}</small></div>
                <div className="gg-watch-trend"><Sparkline path={r.path} color={col} /><small className="dim">{r.trend === "surging" ? "Surging" : r.trend === "up" ? "Trending up" : r.trend === "down" ? "Slipping" : "Holding"} · ETA {r.eta}</small></div>
              </div>
              <div className="gg-watch-line"><span className={`gg-watch-prod ${r.prod || "none"}`}>{r.prod === "dominant" ? "Dominating" : r.prod === "solid" ? "Holding his own" : r.prod === "struggling" ? "Struggling" : "Early"}</span><span>{r.line.text}{r.farm ? ` · ${r.role} role` : ""}</span></div>
              {(r.flags.length > 0 || r.focus) && <div className="gg-watch-flags">{r.flags.map((f) => <span key={f} className={`gg-watch-flag${/Injured/.test(f) ? " inj" : /ready|Dominating|Rising/.test(f) ? " good" : ""}`}>{f}</span>)}{r.focus && <span className="gg-watch-flag focus">In the plan</span>}</div>}
              {!compact && <div className="gg-watch-actions">
                {r.next ? <button className="small primary" onClick={() => doNext(r)}>{r.next.label}</button> : <span className="dim small">On track. Nothing to do.</span>}
                {r.farm && inSeason && <>
                  <Select value={p.assignment || "ahl"} onChange={(e) => act(assignProspect(league, p.id, e.target.value))} aria-label={`${p.name} assignment`} style={{ minWidth: 96 }}>{["ahl", "junior", "college", "europe"].map((v) => <option key={v} value={v}>{v.toUpperCase()}</option>)}</Select>
                  <Select value={p.farmRole || "middle"} onChange={(e) => { p.farmRole = e.target.value; commit(); }} aria-label={`${p.name} role`} style={{ minWidth: 96 }}>{[["top", "Top role"], ["middle", "Middle"], ["depth", "Depth"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
                </>}
              </div>}
            </div>
          );
        })}
        {!shown.length && <div className="gg-empty"><i>🧪</i><b>Nobody here</b>Draft or sign young players and they show up on the watch.</div>}
      </div>
    </section>
  );
}
