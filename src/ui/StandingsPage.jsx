import React, { useState } from "react";
import { useGame, TeamBadge, TeamName, ovrColor } from "./common.jsx";
import { divisionTable, conferenceTable, leagueTable, playoffPicture, clinchStatus, CLINCH_MARKS, conferenceSeeds, projectedFirstRound } from "../engine/standings.js";
import { ROUND_NAMES } from "../engine/playoffs.js";
import { Column, SeriesCard } from "./PlayoffsPage.jsx";
import { DIVISIONS } from "../engine/teams.js";
import { teamRatings } from "../engine/lines.js";
import "./standings.css";

const pct = (r) => (r.gp ? (r.pts / (2 * r.gp)).toFixed(3).replace(/^0/, "") : "—");
const rec = (x) => `${x.w}-${x.l}-${x.otl}`;
const MARK_TITLE = Object.fromEntries(CLINCH_MARKS);

// The NHL's clinch letters (Gridiron 3.2): p Presidents' Trophy, z conference, y division, x playoff spot, e eliminated.
export function ClinchMark({ mark }) {
  if (!mark) return null;
  return <span className={`gg-clinch ${mark}`} title={MARK_TITLE[mark]} aria-label={MARK_TITLE[mark]}>{mark}</span>;
}
export function ClinchLegend() {
  return (
    <div className="gg-clinch-legend" aria-label="Clinch marks">
      {CLINCH_MARKS.map(([k, label]) => <span key={k}><ClinchMark mark={k} />{label}</span>)}
    </div>
  );
}

// `marks`: clinchStatus for the league; `back`: show points back of `back` (the last wild card).
function StandTable({ teams, cutAfter, title, accent = "#3b82f6", startRank = 1, marks, back = null }) {
  const { league } = useGame();
  const status = marks || clinchStatus(league);
  return (
    <section className="gg-stand" style={{ "--acc": accent }}>
      {title && <div className="gg-stand-h"><span>{title}</span>{cutAfter != null && <small>top {cutAfter} qualify</small>}</div>}
      <div className="tablewrap gg-stand-wrap">
        <table className="t gg-stand-t">
          <thead>
            <tr>
              <th className="gg-rank">#</th><th>Team</th><th className="num">GP</th><th className="num">W</th><th className="num">L</th><th className="num">OTL</th>
              <th className="num pts">PTS</th>{back && <th className="num pb" title="Points back of the last wild card">PB</th>}<th className="num opt">P%</th><th className="num opt">RW</th><th className="num opt">ROW</th><th className="num">GF</th>
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
                <tr key={t.id} className={`${t.id === league.userTid ? "me" : ""} ${cutAfter != null && i === cutAfter - 1 ? "cut" : ""} ${st === "e" ? "elim" : ""}`}>
                  <td className="gg-rank">{startRank + i}</td>
                  <td className="gg-stand-tc">
                    {/* The flex row lives inside the cell: a flex <td> drops out of the table layout. */}
                    <div className="gg-stand-team">
                      <TeamBadge team={t} size={26} />
                      <b><TeamName tid={t.id} /></b>
                      <ClinchMark mark={st} />
                    </div>
                  </td>
                  <td className="num">{r.gp}</td><td className="num">{r.w}</td><td className="num">{r.l}</td><td className="num">{r.otl}</td>
                  <td className="num pts"><b>{r.pts}</b></td>
                  {back && <td className="num pb">{cutAfter != null && i >= cutAfter && r.gp ? back.rec.pts - r.pts : "—"}</td>}
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

// Gridiron's "Playoff picture": who'd be in if the season ended today, who's chasing, and the bracket.
function PicConf({ conf, marks }) {
  const { league } = useGame();
  const { seeds, hunt } = conferenceSeeds(league, conf);
  const Row = ({ t, tag, kind, back }) => {
    const me = t.id === league.userTid;
    return (
      <div className={`pp-row${me ? " me" : ""}${kind === "WC" && tag === "WC2" ? " cut" : ""}`}>
        <span className={`pp-seed ${kind ? kind.toLowerCase() : "out"}`}>{tag || ""}</span>
        <TeamBadge team={t} size={26} decorative />
        <span className="pp-name"><TeamName tid={t.id} /><ClinchMark mark={marks[t.id]} /></span>
        <span className="pp-rec">{rec(t.rec)}</span>
        <span className="pp-pts">{t.rec.pts}</span>
        <span className={`pp-tag ${kind ? kind.toLowerCase() : "out"}`}>{back != null ? (back <= 0 ? "TIED" : `${back} PT${back === 1 ? "" : "S"} BACK`) : kind}</span>
      </div>
    );
  };
  return (
    <section className="pp-conf" style={{ "--acc": CONF_ACC[conf] }}>
      <div className="pp-conf-h"><span>{conf}ern Conference</span><small>W-L-OTL · PTS</small></div>
      {seeds.map((s) => <Row key={s.t.id} {...s} />)}
      <div className="pp-sub">In the hunt</div>
      {hunt.slice(0, 5).map((h) => <Row key={h.t.id} t={h.t} back={h.back} />)}
    </section>
  );
}

function PlayoffPicture({ marks }) {
  const { league } = useGame();
  const me = league.teams[league.userTid];
  const tags = {};
  for (const c of ["East", "West"]) conferenceSeeds(league, c).seeds.forEach((s) => (tags[s.t.id] = s.tag));
  const r1 = projectedFirstRound(league).map((m) => ({ ...m, round: 0, wTop: tags[m.top], wBot: tags[m.bot], games: [], winner: null }));
  const pick = (c) => r1.filter((s) => s.conf === c);
  const tbd = (n) => Array(n).fill(null);
  const myTag = tags[me.id];
  const gp = me.rec.gp;
  return (
    <div className="stack pp-wrap">
      <div className="pp-lead">
        If the season ended today{gp ? ` (after game ${gp})` : ""}. The top three in each division are in, plus two wild cards per conference.
        <b className={myTag ? "in" : "outl"}> The {me.name} {myTag ? `would be the ${me.conf}'s ${myTag} seed` : "are out right now"}.</b>
      </div>
      <div className="pp-grid"><PicConf conf="East" marks={marks} /><PicConf conf="West" marks={marks} /></div>
      {r1.length === 8 && (
        <>
          <div className="pp-bh">The bracket these seeds would make</div>
          <div className="gg-bracket pp-bracket">
            <Column side="left" title={`East · ${ROUND_NAMES[0]}`} list={pick("East")} />
            <Column side="left" title={ROUND_NAMES[1]} list={tbd(2)} />
            <Column side="left" title={ROUND_NAMES[2]} list={tbd(1)} />
            <div className="gg-bcol final"><div className="gg-bcol-h">🏆 Stanley Cup Final</div><div className="gg-bcol-body"><SeriesCard s={null} /></div></div>
            <Column side="right" title={ROUND_NAMES[2]} list={tbd(1)} />
            <Column side="right" title={ROUND_NAMES[1]} list={tbd(2)} />
            <Column side="right" title={`West · ${ROUND_NAMES[0]}`} list={pick("West")} />
          </div>
        </>
      )}
    </div>
  );
}

export default function StandingsPage() {
  const { league } = useGame();
  const [view, setView] = useState("picture");
  const marks = clinchStatus(league);
  const me = league.teams[league.userTid];
  const conf = conferenceTable(league, me.conf);
  const myConfRank = conf.findIndex((t) => t.id === me.id) + 1;
  const myLeagueRank = leagueTable(league).findIndex((t) => t.id === me.id) + 1;
  return (
    <div className="stack gg-standings">
      <div className="gg-pagehead">
        <div><h2>Standings</h2><div className="gg-status">{league.year}-{String(league.year + 1).slice(2)} · <TeamName tid={me.id} /> {me.rec.gp ? <>{rec(me.rec)} · <b>{me.rec.pts} PTS</b> · {myConfRank}{myConfRank === 1 ? "st" : myConfRank === 2 ? "nd" : myConfRank === 3 ? "rd" : "th"} in the {me.conf} · {myLeagueRank}{myLeagueRank === 1 ? "st" : myLeagueRank === 2 ? "nd" : myLeagueRank === 3 ? "rd" : "th"} overall</> : "season not started"}</div></div>
        <div className="gg-chips">
          {[["picture", "Playoff picture"], ["wild", "Wild Card"], ["div", "Divisions"], ["conf", "Conference"], ["league", "League"]].map(([k, l]) => (
            <button key={k} className={view === k ? "on" : ""} onClick={() => setView(k)}>{l}</button>
          ))}
        </div>
      </div>
      {view === "picture" && <PlayoffPicture marks={marks} />}
      {view === "div" && Object.entries(DIVISIONS).flatMap(([, divs]) => divs.map((d) => <StandTable key={d} title={`${d} Division`} accent={DIV_ACC[d]} teams={divisionTable(league, d)} cutAfter={3} marks={marks} />))}
      {view === "conf" && ["East", "West"].map((c) => <StandTable key={c} title={`${c}ern Conference`} accent={CONF_ACC[c]} teams={conferenceTable(league, c)} cutAfter={8} marks={marks} />)}
      {view === "league" && <StandTable title="League" accent="#22c55e" teams={leagueTable(league)} cutAfter={16} marks={marks} />}
      {view === "wild" &&
        ["East", "West"].map((c) => {
          const pic = playoffPicture(league, c);
          return (
            <div key={c} className="stack gg-conf" style={{ "--acc": CONF_ACC[c] }}>
              <div className="gg-conf-h">{c}ern Conference</div>
              <div className="gg-stand-grid">
                {pic.order.map((d) => <StandTable key={d} title={`${d} — top 3`} accent={DIV_ACC[d]} teams={pic.divs[d]} marks={marks} />)}
              </div>
              <StandTable title="Wild Card race" accent={CONF_ACC[c]} teams={[...pic.wildcards, ...pic.out]} cutAfter={2} marks={marks} back={pic.wildcards[1] || pic.wildcards[0] || null} />
            </div>
          );
        })}
      <ClinchLegend />
      <div className="muted small">Tiebreakers: points, points %, regulation wins, regulation + OT wins, wins, goal differential. Dashed line marks the playoff cut{view === "wild" ? "; PB is points back of the last wild card" : ""}.</div>
    </div>
  );
}
