import React from "react";
import { Modal, useGame, TeamBadge, PlayerName, signed } from "./common.jsx";
import { dayToDate } from "../engine/schedule.js";
import { ordinal } from "../engine/papers.js";

// What happened while you simulated: record, standings movement, who carried
// the club, who got hurt, and what is next.
export default function SimSummary({ data, onClose }) {
  const { league } = useGame();
  const t = league.teams[league.userTid];
  const d = data;
  const span = d.span;
  const arrow = (n) => (n > 0 ? <span className="good">▲ {n}</span> : n < 0 ? <span className="bad">▼ {-n}</span> : <span className="dim">—</span>);
  const from = dayToDate(league.year, d.from, league.scheduleStart), to = dayToDate(league.year, Math.max(d.from, d.to - 1), league.scheduleStart);
  return (
    <Modal title={d.ended ? "Season summary" : "Sim summary"} onClose={onClose} head={<TeamBadge team={t} size={36} />}>
      <div className="stack gg-sum">
        <div className="gg-sum-hero">
          <div><span className="gg-k">{from} – {to} · {span.gp} game{span.gp === 1 ? "" : "s"}</span><b className="gg-sum-rec">{span.w}-{span.l}-{span.otl}</b><span className="dim small">{span.gf} GF · {span.ga} GA · {signed(span.gf - span.ga)} · now {t.rec.w}-{t.rec.l}-{t.rec.otl}, {t.rec.pts} pts{d.last10 ? ` · last 10: ${d.last10}` : ""}</span></div>
          <div className="gg-sum-ranks">
            <div><small>Division</small><b>{ordinal(d.now.div)}</b>{arrow(d.movement.div)}</div>
            <div><small>Conference</small><b>{ordinal(d.now.conf)}</b>{arrow(d.movement.conf)}</div>
            <div><small>League</small><b>{ordinal(d.now.league)}</b>{arrow(d.movement.league)}</div>
          </div>
        </div>
        <div className="gg-sum-games">{d.games.slice(-12).map((g, i) => <span key={i} className={`gg-sum-g ${g.result === "W" ? "w" : g.result === "OTL" ? "o" : "l"}`} title={`${g.home ? "vs" : "@"} ${g.opp} ${g.us}-${g.them}${g.ot ? " " + g.ot : ""}`}>{g.home ? "" : "@"}{g.opp} {g.us}-{g.them}</span>)}</div>
        <div className="grid g2">
          <section className="gg-card"><div className="gg-k">Carried the club</div>
            {d.topSkaters.length ? d.topSkaters.map((x) => <div key={x.p.id} className="gg-sum-row"><PlayerName p={x.p} /><span>{x.g}G {x.pts - x.g}A · {x.pts} pts in {x.gp}</span></div>) : <div className="dim small">No games played.</div>}
            {d.topGoalie && <div className="gg-sum-row"><PlayerName p={d.topGoalie.p} /><span>{d.topGoalie.w}-{d.topGoalie.gp - d.topGoalie.w} · {d.topGoalie.so} SO</span></div>}
          </section>
          <section className="gg-card"><div className="gg-k">Health</div>
            {d.newInjuries.length ? d.newInjuries.map((x) => <div key={x.pid} className="gg-sum-row bad"><PlayerName p={league.players[x.pid]} /><span>out {x.games} game{x.games === 1 ? "" : "s"}{x.note ? ` · ${x.note}` : ""}</span></div>) : <div className="dim small">No new injuries.</div>}
            {d.returned.map((x) => <div key={x.pid} className="gg-sum-row good"><PlayerName p={league.players[x.pid]} /><span>back in the lineup</span></div>)}
            {d.coachNotes > 0 && <div className="dim small">{t.coach?.name || "The coach"} adjusted the lines {d.coachNotes} time{d.coachNotes === 1 ? "" : "s"}.</div>}
          </section>
        </div>
        {(d.milestones.length > 0 || d.headlines.length > 0 || d.myTx.length > 0) && <section className="gg-card"><div className="gg-k">Around the club</div>
          {d.milestones.map((m) => <div key={m.pid} className="gg-sum-row"><span>{m.name} reached {m.label}</span></div>)}
          {d.myTx.map((x, i) => <div key={i} className="gg-sum-row"><span>{x.text}</span></div>)}
          {d.headlines.map((n, i) => <div key={i} className="gg-sum-row"><span>{n.text}</span></div>)}
        </section>}
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <span className="dim small">{d.ended ? "The regular season is complete." : d.next ? `Next: ${d.next.home ? "vs" : "@"} ${d.next.opp.city} ${d.next.opp.name}, ${dayToDate(league.year, d.next.day, league.scheduleStart)}` : "No games scheduled."}</span>
          <button className="primary" onClick={onClose}>Continue</button>
        </div>
      </div>
    </Modal>
  );
}
