// Small pieces shared by the free-agency, contract and home screens: the role tag with a $ on
// bargain roles, the market tag on a free agent, and the Build your 23 board.
import React from "react";
import { useGame, money, ovrColor } from "./common.jsx";
import { roleTag } from "../engine/contractValue.js";
import { marketOn, MARKET_MIN } from "../engine/faMarket.js";
import { bidStanding } from "../engine/negotiations.js";
import { rosterPlan, PLAN_PHASES } from "../engine/rosterPlan.js";
import { capOverview } from "../engine/capOverview.js";
import "./contracts.css";

// Where Build your 23 sends you: Free Agency opens on that position.
export const faStart = { pos: null };

// His archetype as a small tag; a $ when the market pays the role less (hover says how much).
export function RoleTag({ p }) {
  const r = roleTag(p);
  if (!r) return null;
  return <span className={`ct-role${r.bargain ? " bargain" : r.premium ? " premium" : ""}`} title={r.title}>{r.name.toUpperCase()}{r.bargain ? " · $" : ""}</span>;
}

// The market on a free agent (Gridiron's MarketTag): your offer and where it stands, other offers,
// and when he decides.
export function MarketTag({ p }) {
  const { league } = useGame();
  if (league.phase !== "freeagency") {
    const st = bidStanding(league, p.id);
    return st?.status === "counter" ? <span className="ct-mkt" title={st.says}>Countered</span> : null;
  }
  if (p.ovr < MARKET_MIN) return <span className="ct-mkt depth" title="Depth players aren't bid on: the first fair offer signs him.">Takes the first fair deal</span>;
  const m = marketOn(league, p);
  const st = bidStanding(league, p.id);
  if (st?.status === "counter" || st?.status === "walked") return <span className="ct-mkt" title={st.says}>{st.status === "walked" ? "Talks over" : "Countered"}{m.offers ? ` · ${m.offers} offer${m.offers > 1 ? "s" : ""} · ${m.when}` : ""}</span>;
  if (!m.offers) return <span className="ct-mkt none">No offers{m.when ? ` · ${m.when}` : ""}</span>;
  const lead = st?.standing === "lead" || st?.standing === "edge";
  return (
    <span className={`ct-mkt${m.mine ? " mine" : ""}`} title={st?.says || ""}>
      {m.mine ? <>Your offer {money(m.mine.aav)} <span className={lead ? "lead" : "out"}>{st?.standing === "blocked" ? "✕ can't fit" : lead ? "✓ leading" : "▲ outbid"}</span></> : null}
      {m.mine && m.others ? " · " : ""}{m.others ? `${m.others}${m.mine ? " other" : ""} offer${m.others > 1 ? "s" : ""}` : ""}{` · ${m.when}`}
    </span>
  );
}

// Build your 23 (Gridiron 3.7): every position against a typical NHL 23, the cap, and the best free
// agent left at each spot with his ask. A tap opens free agency at that position (onPick).
export function BuildYour23({ onPick, foot = true }) {
  const { league } = useGame();
  if (!PLAN_PHASES.has(league.phase)) return null;
  const t = league.teams[league.userTid];
  const plan = rosterPlan(league, t);
  const room = league.phase === "draft" ? capOverview(league, t).years[1]?.room ?? plan.room : plan.room;
  const pct = Math.min(100, (100 * plan.count) / plan.target);
  const tone = (r) => (r.have === 0 ? "#ef4444" : r.short ? "#eab308" : "#22c55e");
  return (
    <section className="ct-plan" aria-label="Build your 23">
      <div className="ct-plan-h">
        <span className="ct-plan-k">BUILD YOUR 23</span>
        <b className="ct-plan-n" style={{ color: plan.open ? "#eab308" : "#22c55e" }}>{plan.count}/{plan.target}</b>
        <span className="ct-plan-bar"><i style={{ width: `${pct}%`, background: plan.open ? "#eab308" : "#22c55e" }} /></span>
        <span className="ct-plan-sub">{plan.open ? `${plan.open} spot${plan.open > 1 ? "s" : ""} to fill` : "Full roster"} for next season · <b style={{ color: room >= 0 ? "#22c55e" : "#ef4444" }}>{money(room)}</b> cap space</span>
      </div>
      <div className="ct-plan-grid">
        {plan.rows.map((r) => (
          <button key={r.key} className="ct-plan-row" onClick={() => onPick?.(r.pos)} title={r.best ? `Best free agent: ${r.best.name} (${r.best.pos} ${r.best.ovr}), asking about ${money(r.ask)} a year. Tap to see every free agent at ${r.label.toLowerCase()}.` : `Nobody left on the market at ${r.label.toLowerCase()}`}>
            <span className="ct-plan-dot" style={{ background: tone(r) }} />
            <span className="ct-plan-lbl">{r.label}</span>
            <b className="ct-plan-have" style={{ color: tone(r) }}>{r.have}/{r.want}</b>
            <span className={`ct-plan-best${r.short ? "" : " dim"}`}>{r.best ? <>{r.best.name} <b style={{ color: ovrColor(r.best.ovr) }}>{r.best.ovr}</b> · {money(r.ask)}</> : "market empty"}</span>
          </button>
        ))}
      </div>
      {foot && <div className="ct-plan-foot">{league.phase === "freeagency" ? "Signed for next season, against a typical NHL 23. Tap a spot to see its free agents." : "Players signed past this season, against a typical NHL 23. Deals running out show up as holes to fill."}</div>}
    </section>
  );
}
