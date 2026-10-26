import React from "react";
import { useGame, PlayerName } from "./common.jsx";
import { REGIONS, REGION_SLOTS, regionOf, scoutAssignments, assignScout, assignWindowOpen, regionCoverage } from "../engine/regions.js";
import { prospectRead, csRank, classPool, SCOUT_SLOTS, SCOUT_ROLES, SCOUT_GROUPS, scoutGroup, reportsPerWeek } from "../engine/scouting.js";
import { ScoutFlags } from "./scoutingBits.jsx";

const gradeWord = (ev) => (ev >= 85 ? "Elite eye" : ev >= 76 ? "Sharp" : ev >= 66 ? "Solid" : "Raw");

// Scout assignments (batch x2: hands-off scouting; r11: 3 / 2 / 1 / 1 regions per scout). One
// screen, set before the season: send each scout to his regions. Through the season they file reports there on their own; nothing to spend,
// nothing stops the sim. Better-graded scouts read tighter, work players up faster and find the
// region's hidden gems.
export default function RegionalScouting() {
  const { league, commit, toast } = useGame();
  const t = league.teams[league.userTid];
  const s = t.scouts || {};
  const a = scoutAssignments(league, t);
  const open = assignWindowOpen(league);
  const pool = classPool(league);
  // Tap a region to add it (a full scout's oldest region makes room) or drop it. A region another
  // scout works moves over (regions.js assignScout).
  const set = (role, k) => {
    const r = assignScout(league, role, k);
    if (!r.ok) { toast(r.msg); return; }
    const who = s[role]?.name || "Your scout";
    toast(r.dropped ? `${who} drops the ${REGIONS[r.dropped].name}.`
      : r.swapped ? `${who} and ${s[r.swapped]?.name || "your other scout"} swapped regions.`
        : `${who} takes the ${REGIONS[k].name}${r.freed ? ` instead of the ${REGIONS[r.freed].name}` : ""}${r.moved ? ` from ${s[r.moved]?.name || "another scout"}` : ""}.`);
    commit();
  };
  const cov = regionCoverage(league, t);
  const byRegion = Object.fromEntries(Object.keys(REGIONS).map((k) => [k, pool.filter((p) => regionOf(p) === k)]));
  // What each region is deep at: the position group with the most of its top-96 prospects.
  const deep = Object.fromEntries(Object.keys(REGIONS).map((k) => { const n = {}; for (const p of byRegion[k]) if (csRank(p) <= 96) n[scoutGroup(p.pos)] = (n[scoutGroup(p.pos)] || 0) + 1; const g = Object.entries(n).sort((x, y) => y[1] - x[1])[0]; return [k, g ? { g: g[0], n: g[1], r1: byRegion[k].filter((p) => csRank(p) <= 32).length } : null]; }));
  return <div className="stack sc-assign">
    <div className="panel">
      <h3>Scout assignments {open ? <span className="pill on">Set for the season</span> : <span className="pill">On the road</span>}</h3>
      <p className="sc-cover"><b>Coverage {cov.n} of {cov.of} regions</b>{cov.n < cov.of && <span className="muted"> · no scout in {Object.keys(REGIONS).filter((k) => !cov.regions.has(k)).map((k) => REGIONS[k].name).join(" or ")}</span>}</p>
      <p className="muted small" style={{ margin: "4px 0 0" }}>{open
        ? "Your senior scout works three regions, the second major scout two, each minor scout one. Tap a region to add or drop it. Once the season starts they file reports there on their own: no points, no stops. Higher-graded scouts read closer, work players up sooner and find the late-ranked gems."
        : "Your scouts are on the road. Reports come in on their own through the season; you can change assignments after the draft and in the preseason."}</p>
      <div className="sc-assign-grid">
        {SCOUT_SLOTS.map((role) => { const sc = s[role]; const mine = a[role]; const ps = mine.flatMap((k) => byRegion[k] || []); const done = ps.filter((p) => (p.scout?.lvl || 0) > 0).length; const cap = REGION_SLOTS[role]; return (
          <div key={role} className={`sc-assign-card${sc ? "" : " empty"}`}>
            <small className={role.startsWith("major") ? "maj" : "min"}>{SCOUT_ROLES[role].name} <span className="sc-slots">{mine.length} of {cap} region{cap === 1 ? "" : "s"}</span></small>
            {sc ? <>
              <b>{sc.name}</b>
              <span className="muted small">{SCOUT_GROUPS[sc.group]} specialist · grade <b>{sc.eval}</b> · {gradeWord(sc.eval)} · {reportsPerWeek(sc.eval) + (sc.trait === "workhorse" ? 1 : 0)} reports a week</span>
              <div className="sc-regpick" role="group" aria-label={`${sc.name}'s regions`}>
                {Object.entries(REGIONS).map(([k, r]) => { const d = deep[k]; const holder = SCOUT_SLOTS.find((x) => x !== role && s[x] && a[x].includes(k)); const match = d && d.g === sc.group; const on = mine.includes(k); return (
                  <button key={k} role="checkbox" aria-checked={on} className={`sc-regrow${on ? " on" : ""}`} disabled={!open && !on} onClick={() => set(role, k)}>
                    <b>{r.name}</b>
                    <span>{d ? `Deep at ${SCOUT_GROUPS[d.g].toLowerCase()} · ${d.r1} first-rounders` : `${byRegion[k].length} prospects`}{match ? <em> ✓ match</em> : null}</span>
                    {holder && <small>{s[holder].name.split(" ").at(-1)} has it</small>}
                  </button>); })}
              </div>
              <span className="tiny muted">{mine.map((k) => REGIONS[k].name).join(", ")}{pool.length ? ` · ${done}/${ps.length} reported` : ""}</span>
            </> : <span className="dim small">Vacant: hire one on the Scouts tab.</span>}
          </div>); })}
      </div>
    </div>
    <details className="sc-regions-more"><summary>Region reports</summary><div className="grid g3">{Object.entries(REGIONS).map(([key, r]) => {
      const ps = [...byRegion[key]].sort((x, y) => csRank(x) - csRank(y));
      const who = SCOUT_SLOTS.filter((k) => s[k] && a[k].includes(key)).map((k) => s[k]);
      const reads = ps.map((p) => [p, prospectRead(league, p)]);
      const gems = reads.filter(([, x]) => x.sleeper || x.hunch), flags = reads.filter(([, x]) => x.flag);
      const r1 = ps.filter((p) => csRank(p) <= 32).length;
      const reported = reads.filter(([, x]) => x.lvl > 0).length;
      return <div className={`panel region-card${who.length ? " on" : ""}`} key={key}>
        <div className="row"><span className="pill">{r.family}</span><h3 style={{ margin: 0 }}>{r.name}</h3></div>
        <p className="muted small">{r.note}</p>
        <div className="row"><b>{ps.length} prospects</b><span className="muted">{r1} in Central Scouting's first round · {reported} reported</span></div>
        <div className="small" style={{ margin: "4px 0" }}>{who.length ? <>{who.map((x) => `${x.name} (${x.eval})`).join(", ")}</> : <span className="dim">No scout assigned: front-office reads only.</span>}</div>
        <div className="list" style={{ marginTop: 8 }}>{reads.slice(0, 3).map(([p, x]) => <div className="item small" key={p.id}><span className="dim">#{csRank(p)}</span><PlayerName p={p} /><ScoutFlags read={x} compact /><b style={{ marginLeft: "auto" }}>{x.pot}</b></div>)}</div>
        {gems.length > 0 && <p className="sc-region-note gem small">💎 {gems.length} possible sleeper{gems.length > 1 ? "s" : ""}: {gems.slice(0, 3).map(([p]) => p.name).join(", ")}</p>}
        {flags.length > 0 && <p className="sc-region-note red small">🚩 {flags.length} red flag{flags.length > 1 ? "s" : ""}: {flags.slice(0, 3).map(([p]) => p.name).join(", ")}</p>}
      </div>;
    })}</div></details>
  </div>;
}
