import React, { useState } from "react";
import { useGame, TeamBadge, TeamName, ovrColor } from "./common.jsx";
import { divisionTable, conferenceTable, leagueTable, playoffPicture, clinchStatus } from "../engine/standings.js";
import { DIVISIONS } from "../engine/teams.js";
import { teamRatings } from "../engine/lines.js";

const pct = (r) => (r.gp ? (r.pts / (2 * r.gp)).toFixed(3).replace(/^0/, "") : "—");
const rec = (x) => `${x.w}-${x.l}-${x.otl}`;

function StandTable({ teams, cutAfter, title, accent = "#3b82f6", startRank = 1 }) {
  const { league } = useGame();
  const status = clinchStatus(league);
  return (
    <section className="gg-stand" style={{ "--acc": accent }}>
      {title && <div className="gg-stand-h"><span>{title}</span>{cutAfter != null && <small>top {cutAfter} qualify</small>}</div>}
      <div className="tablewrap gg-stand-wrap">
        <table className="t gg-stand-t">
          <thead>
            <tr>
              <th className="rk">#</th><th>Team</th><th className="num">GP</th><th className="num">W</th><th className="num">L</th><th className="num">OTL</th>
              <th className="num pts">PTS</th><th className="num opt">P%</th><th className="num opt">RW</th><th className="num opt">ROW</th><th className="num">GF</th>
              <th className="num">GA</th><th className="num">DIFF</th><th className="opt">Home</th><th className="opt">Away</th><th className="l10">L10</th><th>Strk</th><th className="num">OVR</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t, i) => {
              const r = t.rec;
              const l10 = r.last10.split("");
              const st = status[t.id];
              const diff = r.gf - r.ga;
              const ovr = teamRatings(league, t).ovr;
              const streak = r.streak && r.gp ? `${r.streak[0]}${r.streak[1]}` : "—";
              return (
                <tr key={t.id} className={`${t.id === league.userTid ? "me" : ""} ${cutAfter != null && i === cutAfter - 1 ? "cut" : ""}`}>
                  <td className="rk">{startRank + i}</td>
                  <td className="gg-stand-team">
                    <TeamBadge team={t} size={26} />
                    <b><TeamName tid={t.id} /></b>
                    {st && <span className={`gg-clinch ${st === "x" ? "x" : "e"}`} title={st === "x" ? "Clinched playoff spot" : "Eliminated"}>{st}</span>}
                  </td>
                  <td className="num">{r.gp}</td><td className="num">{r.w}</td><td className="num">{r.l}</td><td className="num">{r.otl}</td>
                  <td className="num pts"><b>{r.pts}</b></td>
                  <td className="num opt">{pct(r)}</td>
                  <td className="num opt">{r.rw}</td><td className="num opt">{r.row}</td><td className="num">{r.gf}</td><td className="num">{r.ga}</td>
                  <td className={`num ${diff > 0 ? "good" : diff < 0 ? "bad" : "dim"}`}>{diff > 0 ? "+" : ""}{diff}</td>
                  <td className="opt mono">{rec(r.home)}</td>
                  <td className="opt mono">{rec(r.away)}</td>
                  <td className="l10"><span className="gg-l10">{l10.map((x, j) => <i key={j} className={x === "W" ? "w" : x === "L" ? "l" : "o"} />)}{!l10.length && <span className="dim">—</span>}</span></td>
                  <td className={`mono ${streak[0] === "W" ? "good" : streak[0] === "L" ? "bad" : "dim"}`}>{streak}</td>
                  <td className="num"><span style={{ color: ovrColor(ovr), fontWeight: 800 }}>{ovr}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const CONF_ACC = { East: "#3b82f6", West: "#ef4444" };
const DIV_ACC = { Atlantic: "#3b82f6", Metropolitan: "#8b5cf6", Central: "#ef4444", Pacific: "#f59e0b" };

export default function StandingsPage() {
  const { league } = useGame();
  const [view, setView] = useState("wild");
  const me = league.teams[league.userTid];
  const conf = league.teams.filter((t) => t.conf === me.conf).sort((a, b) => b.rec.pts - a.rec.pts || b.rec.rw - a.rec.rw);
  const myConfRank = conf.findIndex((t) => t.id === me.id) + 1;
  const myLeagueRank = leagueTable(league).findIndex((t) => t.id === me.id) + 1;
  return (
    <div className="stack gg-standings">
      <div className="gg-pagehead">
        <div><h2>Standings</h2><div className="gg-status">{league.year}-{String(league.year + 1).slice(2)} · <TeamName tid={me.id} /> {me.rec.gp ? <>{rec(me.rec)} · <b>{me.rec.pts} PTS</b> · {myConfRank}{myConfRank === 1 ? "st" : myConfRank === 2 ? "nd" : myConfRank === 3 ? "rd" : "th"} in the {me.conf} · {myLeagueRank}{myLeagueRank === 1 ? "st" : myLeagueRank === 2 ? "nd" : myLeagueRank === 3 ? "rd" : "th"} overall</> : "season not started"}</div></div>
        <div className="gg-chips">
          {[["wild", "Wild Card"], ["div", "Division"], ["conf", "Conference"], ["league", "League"]].map(([k, l]) => (
            <button key={k} className={view === k ? "on" : ""} onClick={() => setView(k)}>{l}</button>
          ))}
        </div>
      </div>
      {view === "div" && Object.entries(DIVISIONS).flatMap(([, divs]) => divs.map((d) => <StandTable key={d} title={`${d} Division`} accent={DIV_ACC[d]} teams={divisionTable(league, d)} cutAfter={3} />))}
      {view === "conf" && ["East", "West"].map((c) => <StandTable key={c} title={`${c}ern Conference`} accent={CONF_ACC[c]} teams={conferenceTable(league, c)} cutAfter={8} />)}
      {view === "league" && <StandTable title="League" accent="#22c55e" teams={leagueTable(league)} cutAfter={16} />}
      {view === "wild" &&
        ["East", "West"].map((c) => {
          const pic = playoffPicture(league, c);
          return (
            <div key={c} className="stack gg-conf" style={{ "--acc": CONF_ACC[c] }}>
              <div className="gg-conf-h">{c}ern Conference</div>
              <div className="gg-stand-grid">
                {pic.order.map((d) => <StandTable key={d} title={`${d} — top 3`} accent={DIV_ACC[d]} teams={pic.divs[d]} />)}
              </div>
              <StandTable title="Wild Card race" accent={CONF_ACC[c]} teams={[...pic.wildcards, ...pic.out]} cutAfter={2} />
            </div>
          );
        })}
      <div className="muted small">Tiebreakers: points, points %, regulation wins, regulation + OT wins, wins, goal differential. x = clinched, e = eliminated. Dashed line marks the playoff cut.</div>
    </div>
  );
}
