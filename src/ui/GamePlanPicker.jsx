import React from "react";
import { useGame } from "./common.jsx";
import { matchupPlan } from "../engine/teamPlanning.js";

// One game-plan control for the whole game: the home screen and the Game Plan tab share it.
// Picks write the user's plan and switch the coaches' automatic choice off.
export const PLAN_ROWS = [["forecheck", "FORECHECK", ["balanced", "aggressive"]], ["neutral", "NEUTRAL ZONE", ["balanced", "trap"]], ["attack", "ATTACK", ["balanced", "rush", "shoot", "cycle"]]];

export default function GamePlanPicker({ opp, compact = false }) {
  const { league: lg, commit, toast } = useGame();
  const t = lg.teams[lg.userTid];
  const plan = matchupPlan(lg, t, opp || t);
  const auto = t.autoPlan !== false;
  const current = auto ? plan : { forecheck: "balanced", neutral: "balanced", attack: "balanced", ...t.gamePlan };
  const setPlan = (key, value) => { t.autoPlan = false; t.gamePlan = { ...current, [key]: value }; commit(); toast(`Game plan: ${value} ${key}.`); };
  const grade = (key, value) => value === plan[key] ? ["best fit", "#22c55e"] : value === "balanced" ? ["B", "#60a5fa"] : ["C", "#eab308"];
  return (
    <section className="gg-card gg-plan">
      <div className="gg-k">🎯 GAME PLAN{opp ? ` vs ${opp.abbr}` : ""} <span className="dim" style={{ letterSpacing: 0, textTransform: "none" }}>{auto ? "your coaches' pick (best fit)" : "your call"}</span>
        <label className="gg-plan-auto"><input type="checkbox" checked={auto} onChange={(e) => { t.autoPlan = e.target.checked; if (!e.target.checked) t.gamePlan = { ...current }; commit(); }} /> Automatically adapt to each opponent</label>
      </div>
      {PLAN_ROWS.map(([key, label, values]) => (
        <div key={key} className="gg-plan-row" role="group" aria-label={`Game plan ${key}`}><small>{label}</small><div className="gg-plan-opts">{values.map((v) => { const [g, c] = grade(key, v); return <button key={v} className={current[key] === v ? "on" : ""} aria-pressed={current[key] === v} onClick={() => setPlan(key, v)}><b>{v}</b><span style={{ color: c }}>{g}</span></button>; })}</div></div>
      ))}
      {!compact && <div className="dim small">{plan.reason} Aggressive forechecking improves dump-in recovery but risks lost cycle passes. The trap reduces controlled entries. Shooting creates more attempts; cycling waits for passing chances.</div>}
    </section>
  );
}
