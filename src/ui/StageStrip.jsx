import React from "react";
import { lastDay } from "../engine/schedule.js";
import { atCombine } from "../engine/scouting.js";

// The season at a glance: preseason, one box per regular-season week, then the off-season stages.
const STAGES = ["preseason", "regular", "playoffs", "combine", "draft", "resign", "freeagency"];
const LABELS = { preseason: "PRE", regular: "SEASON", playoffs: "PLAYOFFS", combine: "COMBINE", draft: "DRAFT", resign: "RE-SIGN", freeagency: "FA" };

export default function StageStrip({ league }) {
  const stage = league.phase === "draft" ? (atCombine(league) ? "combine" : "draft") : league.phase;
  const cur = STAGES.indexOf(stage);
  const weeks = Math.floor(lastDay(league.schedule) / 7) + 1;
  const week = league.phase === "regular" ? Math.floor(league.day / 7) : -1;
  const dlWeek = Math.floor((league.deadlineDay ?? 0) / 7);
  const node = (key, i) => (
    <div key={key} className={`gg-stage${i < cur ? " done" : i === cur ? " now" : ""}`}>
      <span className="gg-node"><i /></span>
      <small>{LABELS[key]}</small>
    </div>
  );
  return (
    <div className="gg-strip" aria-label={`Season stage: ${LABELS[stage]}${week >= 0 ? `, week ${week + 1} of ${weeks}` : ""}`}>
      {node("preseason", 0)}
      <i className={`gg-link${cur > 0 ? " done" : ""}`} />
      <div className="gg-weeks">
        <div className="gg-weekboxes">
          {Array.from({ length: weeks }, (_, w) => {
            const done = cur > 1 || (cur === 1 && w < week);
            const now = cur === 1 && w === week;
            return <span key={w} className={`gg-wk${done ? " done" : ""}${now ? " now" : ""}${w === dlWeek ? " dl" : ""}`} title={w === dlWeek ? `Week ${w + 1}: trade deadline` : `Week ${w + 1}`}>{now ? w + 1 : w === dlWeek && !done ? "D" : done ? "✓" : ""}</span>;
          })}
        </div>
        <small>SEASON</small>
      </div>
      {STAGES.slice(2).map((k, j) => (
        <React.Fragment key={k}>
          <i className={`gg-link${cur > j + 1 ? " done" : ""}`} />
          {node(k, j + 2)}
        </React.Fragment>
      ))}
    </div>
  );
}
