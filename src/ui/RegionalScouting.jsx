import React from "react";
import { useGame, PlayerName } from "./common.jsx";
import { REGIONS, regionOf, scoutAssignments, assignScout, assignWindowOpen } from "../engine/regions.js";
import { prospectRead, csRank, classPool, SCOUT_SLOTS, SCOUT_ROLES, reportsPerWeek } from "../engine/scouting.js";
import { ScoutFlags } from "./scoutingBits.jsx";

const gradeWord = (ev) => (ev >= 85 ? "Elite eye" : ev >= 76 ? "Sharp" : ev >= 66 ? "Solid" : "Raw");

// Scout assignments (batch x2: hands-off scouting). One screen, set before the season: send each
// scout to a region. Through the season they file reports there on their own; nothing to spend,
// nothing stops the sim. Better-graded scouts read tighter, work players up faster and find the
// region's hidden gems.
export default function RegionalScouting() {
  const { league, commit, toast } = useGame();
  const t = league.teams[league.userTid];
  const s = t.scouts || {};
  const a = scoutAssignments(league, t);
  const open = assignWindowOpen(league);
  const pool = classPool(league);
  const set = (role, k) => { const r = assignScout(league, role, k); if (!r.ok) toast(r.msg); commit(); };
  const byRegion = Object.fromEntries(Object.keys(REGIONS).map((k) => [k, pool.filter((p) => regionOf(p) === k)]));
  return <div className="stack sc-assign">
    <div className="panel">
      <h3>Scout assignments {open ? <span className="pill on">Set for the season</span> : <span className="pill">On the road</span>}</h3>
      <p className="muted small" style={{ margin: "4px 0 0" }}>{open
        ? "Send each scout to a region. Once the season starts they file reports there on their own: no points, no stops. Higher-graded scouts read closer, work players up sooner and find the late-ranked gems."
        : "Your scouts are on the road. Reports come in on their own through the season; you can change assignments after the draft and in the preseason."}</p>
      <div className="sc-assign-grid">
        {SCOUT_SLOTS.map((role) => { const sc = s[role]; const reg = a[role]; const ps = byRegion[reg] || []; const done = ps.filter((p) => (p.scout?.lvl || 0) > 0).length; return (
          <div key={role} className={`sc-assign-card${sc ? "" : " empty"}`}>
            <small className={role.startsWith("major") ? "maj" : "min"}>{SCOUT_ROLES[role].name.toUpperCase()}</small>
            {sc ? <>
              <b>{sc.name}</b>
              <span className="muted small">Grade <b>{sc.eval}</b> · {gradeWord(sc.eval)} · {reportsPerWeek(sc.eval) + (sc.trait === "workhorse" ? 1 : 0)} reports a week</span>
              <label className="sc-assign-pick"><span className="dim tiny">REGION</span>
                <select value={reg} disabled={!open} onChange={(e) => set(role, e.target.value)} aria-label={`${sc.name}'s region`}>
                  {Object.entries(REGIONS).map(([k, r]) => <option key={k} value={k}>{r.name} · {byRegion[k].length} prospects</option>)}
                </select>
              </label>
              <span className="tiny muted">{REGIONS[reg].note}{pool.length ? ` · ${done}/${ps.length} reported` : ""}</span>
            </> : <span className="dim small">Vacant: hire one on the Scouts tab.</span>}
          </div>); })}
      </div>
    </div>
    <div className="grid g3">{Object.entries(REGIONS).map(([key, r]) => {
      const ps = [...byRegion[key]].sort((x, y) => csRank(x) - csRank(y));
      const who = SCOUT_SLOTS.filter((k) => s[k] && a[k] === key).map((k) => s[k]);
      const reads = ps.map((p) => [p, prospectRead(league, p)]);
      const gems = reads.filter(([, x]) => x.sleeper || x.hunch), flags = reads.filter(([, x]) => x.flag);
      const r1 = ps.filter((p) => csRank(p) <= 32).length;
      const reported = reads.filter(([, x]) => x.lvl > 0).length;
      return <div className={`panel region-card${who.length ? " on" : ""}`} key={key}>
        <div className="row"><span className="pill">{r.family}</span><h3 style={{ margin: 0 }}>{r.name}</h3></div>
        <p className="muted small">{r.note}</p>
        <div className="row"><b>{ps.length} prospects</b><span className="muted">{r1} in Central Scouting's first round · {reported} reported</span></div>
        <div className="small" style={{ margin: "4px 0" }}>{who.length ? <>🔎 {who.map((x) => `${x.name} (${x.eval})`).join(", ")}</> : <span className="dim">No scout assigned: front-office reads only.</span>}</div>
        <div className="list" style={{ marginTop: 8 }}>{reads.slice(0, 3).map(([p, x]) => <div className="item small" key={p.id}><span className="dim">#{csRank(p)}</span><PlayerName p={p} /><ScoutFlags read={x} compact /><b style={{ marginLeft: "auto" }}>{x.pot}</b></div>)}</div>
        {gems.length > 0 && <p className="sc-region-note gem small">💎 {gems.length} possible sleeper{gems.length > 1 ? "s" : ""}: {gems.slice(0, 3).map(([p]) => p.name).join(", ")}</p>}
        {flags.length > 0 && <p className="sc-region-note red small">🚩 {flags.length} red flag{flags.length > 1 ? "s" : ""}: {flags.slice(0, 3).map(([p]) => p.name).join(", ")}</p>}
      </div>;
    })}</div>
  </div>;
}
