import React from "react";
import { Modal, TeamBadge, useGame } from "./common.jsx";

// The owner's review after the Final: patience before and after, the record, the playoffs,
// the goal he set and whether it was met. The football game's "Owner's review" card.
export default function OwnerReview({ onClose }) {
  const { league } = useGame();
  const t = league.teams[league.userTid];
  const r = t.owner?.reviews?.find((x) => x.year === league.ownerReviewPending);
  if (!r) return null;
  const tone = r.champion ? "ECSTATIC" : r.met && r.trust >= 60 ? "PLEASED" : r.met ? "SATISFIED" : r.trust < 35 ? "FURIOUS" : "UNEASY";
  const color = r.champion || r.met ? "#22c55e" : r.trust < 35 ? "#ef4444" : "#f59e0b";
  const rec = `${r.rec.w}-${r.rec.l}-${r.rec.otl}`;
  const line = r.champion ? `A Stanley Cup. The owner is telling everyone it was his idea to hire you.` : r.met ? `The owner got what he asked for from a ${rec} season${r.trust >= 70 ? " and is talking about extending you" : ""}.` : r.trust < 35 ? `The owner is done being patient after a ${rec} season. One more like it and you are gone.` : `The owner isn't happy with a ${rec} season. His patience is wearing thin.`;
  const playoff = r.champion ? "Stanley Cup champions" : r.playoff ? r.playoff : "Missed";
  return (
    <Modal title={`Owner's review ${r.year}`} onClose={onClose} bare className="gg-preview">
      <div className="gg-pv">
        <div className="gg-pv-head"><TeamBadge team={t} size={54} /><div><div className="gg-k">OWNER'S REVIEW · {r.year}-{String(r.year + 1).slice(2)} · <span style={{ color }}>{tone}</span></div><h2>{t.owner.name || `${t.city} ownership`}</h2><div className="dim">{line}</div></div></div>
        <div className="gg-pv-grid">
          <div><div className="gg-k">OWNER PATIENCE</div><b style={{ fontSize: 22 }}>{r.before} → <span style={{ color }}>{r.trust}</span> <small className="dim">/ 100</small></b><span>{r.trust < 35 ? "Hot seat." : r.trust < 60 ? "Watchful." : "Secure."}</span></div>
          <div><div className="gg-k">THE SEASON</div><b>Record {rec} · {r.rec.pts} points</b><span>Playoffs: {playoff}</span></div>
          <div><div className="gg-k">OWNER'S TARGET</div><b>{r.goal}</b><span style={{ color: r.met ? "#22c55e" : "#ef4444" }}>{r.met ? "✓ Achieved" : "✗ Missed"}{r.kind === "develop" ? ` · ${r.developed ?? 0} young players developed` : ""}</span></div>
          <div><div className="gg-k">NEXT SEASON</div><b>{r.trust < 35 ? "He wants results now" : r.met ? "He'll raise the bar at camp" : "Same ask, less patience"}</b><span>The new target is set when training camp opens.</span></div>
        </div>
        <div className="gg-pv-actions"><button className="primary big" onClick={onClose}>Got it</button></div>
      </div>
    </Modal>
  );
}
