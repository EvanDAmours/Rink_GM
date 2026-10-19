import React from "react";
import { useGame, PlayerName, money } from "./common.jsx";
import { capOverview } from "../engine/capOverview.js";
import { POS_COLOR } from "./TradePage.jsx";

const PosBadge = ({ pos }) => <span className="gg-pos" style={{ background: POS_COLOR[pos] || "#64748b" }}>{pos}</span>;
const tone = (n) => (n < 0 ? "#ef4444" : "#22c55e");

// Front Office → Overview: your cap, every season it reaches into, and the advisor's read.
export default function CapOverview() {
  const { league, go, openPlayer } = useGame();
  const t = league.teams[league.userTid];
  const o = capOverview(league, t);
  const yr = (y) => `${y}-${String(y + 1).slice(2)}`;
  return (
    <div className="stack gg-capov">
      <div className="gg-status-row gg-capov-tiles">
        <section className="gg-stat" onClick={() => go("roster")}><small>CAP SPACE</small><div className="gg-stat-line"><b style={{ color: tone(o.space) }}>{money(o.space)}</b><span>of {money(o.cap)} · {o.active} on the active roster</span></div></section>
        <section className="gg-stat"><small>NEXT SEASON'S ROOM</small><div className="gg-stat-line"><b style={{ color: tone(o.next.room) }}>{money(o.next.room)}</b><span>{o.next.signed} signed for {yr(o.next.year)}, before re-signings and rookies</span></div></section>
        <section className="gg-stat"><small>DEAD MONEY</small><div className="gg-stat-line"><b>{money(o.dead)}</b><span>{o.dead ? "buyouts and retained salary" : "none on the books"}</span></div></section>
        <section className="gg-stat" onClick={() => go("frontoffice")}><small>EXPIRING DEALS</small><div className="gg-stat-line"><b>{o.expiring}</b><span>after this season · see them →</span></div></section>
      </div>
      <section className="gg-card">
        <div className="gg-k">THE LONG VIEW <span className="dim" style={{ letterSpacing: 0, textTransform: "none" }}>· money already committed against each season's cap. Re-signings, rookies and free agents come out of the room.</span></div>
        <div className="gg-capov-years">
          {o.years.map((y, i) => (
            <div key={y.year} className={`gg-capov-year${i === 0 ? " now" : ""}`}>
              <div className="gg-capov-yh"><b>{y.year}</b><small>{i === 0 ? "this cap year" : `cap ${money(y.cap)}`}</small></div>
              <div className="gg-capov-bar"><i style={{ width: `${Math.min(100, (y.committed / y.cap) * 100)}%`, background: y.room < 0 ? "#ef4444" : i === 0 ? "#22c55e" : "#38bdf8" }} /></div>
              <div className="gg-capov-room" style={{ color: y.room < 0 ? "#ef4444" : i === 0 ? "#22c55e" : "#fbbf24" }}>{money(y.room)}</div>
              <small className="dim">room · {money(y.committed)} committed</small>
              <small className="dim">{y.signed} players signed</small>
              <div className="gg-k" style={{ marginTop: 8 }}>DEALS ENDING</div>
              {y.ending.slice(0, 4).map((p) => <div key={p.id} className="gg-capov-row"><PosBadge pos={p.pos} /><button className="link" onClick={() => openPlayer(p.id)}>{p.name}</button><b>{p.ovr}</b></div>)}
              {y.ending.length > 4 && <small className="dim">+{y.ending.length - 4} more</small>}
              {!y.ending.length && <small className="dim">nobody</small>}
            </div>
          ))}
        </div>
      </section>
      <div className="gg-capov-bottom">
        <section className="gg-card">
          <div className="gg-k">WHERE THE MONEY GOES</div>
          <div className="gg-capov-split">{o.groups.map((g) => <i key={g.key} style={{ flex: Math.max(1, g.you), background: g.key === "F" ? "#f59e0b" : g.key === "D" ? "#38bdf8" : "#a78bfa" }} title={`${g.label} ${money(g.you)}`} />)}</div>
          <table className="gg-pc-table"><thead><tr><th>Group</th><th className="num">You</th><th className="num">League avg</th><th className="num">vs avg</th></tr></thead><tbody>
            {o.groups.map((g) => <tr key={g.key}><td><span className="gg-capov-dot" style={{ background: g.key === "F" ? "#f59e0b" : g.key === "D" ? "#38bdf8" : "#a78bfa" }} />{g.label}</td><td className="num"><b>{money(g.you)}</b></td><td className="num dim">{money(g.avg)}</td><td className="num" style={{ color: g.vs > 15 ? "#ef4444" : g.vs < -15 ? "#22c55e" : "#94a3b8" }}>{g.vs >= 0 ? "+" : ""}{g.vs}%</td></tr>)}
          </tbody></table>
        </section>
        <section className="gg-card">
          <div className="gg-k">BIGGEST CAP HITS <button className="link right" onClick={() => go("frontoffice")}>All {o.roster} contracts →</button></div>
          {o.biggest.map(({ p, pct }) => <div key={p.id} className="gg-capov-row"><PosBadge pos={p.pos} /><button className="link" onClick={() => openPlayer(p.id)}><PlayerName p={p} /></button><b style={{ color: "#fbbf24" }}>{money(p.cap)}</b><small className="dim">{pct}%</small></div>)}
        </section>
        <section className="gg-card">
          <div className="gg-k">CAP ADVISOR</div>
          {o.advice.map((a, i) => <button key={i} className={`gg-advice ${a.tone}`} onClick={() => a.go && go(a.go)}><b>{a.title}</b><span>{a.text}</span></button>)}
        </section>
      </div>
    </div>
  );
}

// Front Office → How the cap works: the rules this game plays by, in one screen.
export function CapGuide() {
  const rows = [
    ["The ceiling", "Every club's cap hits must fit under the league cap. It rises each season, and your room is the cap minus payroll, dead money and retained salary."],
    ["Daily accrual", "Cap space is earned a day at a time. Room you bank early in the year can be spent on a bigger contract at the deadline, because only the remaining days of his deal count."],
    ["Burying contracts", "A player sent to the farm takes most of his cap hit off the books; only the part above the league minimum plus a buffer stays. Waiver-exempt players go down freely; veterans must clear waivers first."],
    ["LTIR", "A long-term injury lets you exceed the cap by the injured player's hit while he is out. It does not bank space, and you must get back under when he returns."],
    ["Retained salary", "A trade partner can keep up to half of a player's cap hit for the rest of his deal. A club may retain on at most three contracts, and no more than 15% of the cap in total."],
    ["Buyouts", "A buyout spreads a reduced charge over twice the years left. Players 26 and over cost two thirds of the remaining money; younger ones cost one third."],
    ["Entry-level and RFAs", "Draft picks sign entry-level deals with performance bonuses that can push a club over by a sliver (carried into next year). Players under 27 coming off a deal are restricted: qualify them and you keep matching rights."],
    ["Contract limits", "Fifty signed contracts and ninety players on the reserve list, including unsigned draft rights. Both block signings when full."],
    ["The floor", "Clubs must also spend to a floor (about three quarters of the cap). The AI respects it; the game warns you rather than blocking you."],
  ];
  return (
    <div className="stack">
      <section className="gg-card"><div className="gg-k">HOW THE CAP WORKS</div><div className="gg-guide">{rows.map(([h, p]) => <div key={h}><b>{h}</b><span>{p}</span></div>)}</div></section>
    </div>
  );
}
