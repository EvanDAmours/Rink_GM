import React from "react";
import { useGame, TeamBadge } from "./common.jsx";
import { ROUND_NAMES } from "../engine/playoffs.js";
import { trophyUrl } from "./trophies.js";
import Jersey from "./Jersey.jsx";

// The morning paper after a playoff series: shown once per series the user
// played (and after the Final for everyone).
export default function SeriesPaper({ paper, onClose }) {
  const { league } = useGame();
  const w = league.teams[paper.winner], l = league.teams[paper.loser];
  const mvp = paper.mvp && league.players[paper.mvp.pid];
  const date = new Date(Date.UTC(paper.year + 1, 3, 20 + paper.round * 14));
  const dateStr = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const road = (league.playoffs?.rounds || []).flatMap((r, i) => r.filter((s) => i <= paper.round && (s.top === w.id || s.bot === w.id) && s.winner != null).map((s) => ({ round: i, opp: league.teams[s.top === w.id ? s.bot : s.top], won: s.winner === w.id, score: s.winner === w.id ? `${Math.max(s.wTop, s.wBot)}-${Math.min(s.wTop, s.wBot)}` : `${Math.min(s.wTop, s.wBot)}-${Math.max(s.wTop, s.wBot)}` })));
  const cups = (league.history || []).filter((h) => h.champion === w.id).length + (paper.round === 3 ? 1 : 0);
  return (
    <div className="modalbg gg-paperbg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gg-paper" role="dialog" aria-label="Series newspaper">
        <div className="gg-paper-mast">
          <div className="gg-paper-ear"><i>“All the Hockey That’s Fit to Print”</i></div>
          <div className="gg-paper-title">The Rink Gazette</div>
          <div className="gg-paper-ear right"><b>LATE CITY EDITION</b><span>{paper.round === 3 ? "Confetti, then clearing." : "Clear and cold."} Tonight, {paper.round === 3 ? "a parade" : "ice"}.</span></div>
        </div>
        <div className="gg-paper-rule"><span>VOL. {league.year - 1900} … No. {5000 + paper.round * 37 + w.id}</span><span>{w.city.toUpperCase()}, {dateStr.toUpperCase()}</span><span>$4.00</span></div>
        <h1 className="gg-paper-h1">{paper.headline}</h1>
        <div className="gg-paper-cols">
          <div className="gg-paper-main">
            <h2 className="gg-paper-h2">{paper.sub}</h2>
            <div className="gg-paper-byline">By the Gazette Staff</div>
            <div className="gg-paper-body">{paper.story.map((t, i) => <p key={i} className={i === 0 ? "drop" : ""}>{t}</p>)}<p className="dim">Continued on Page D4</p></div>
          </div>
          <div className="gg-paper-photo">
            {mvp ? <><div className="gg-paper-frame"><Jersey team={w} player={mvp} size={150} decorative /></div><div className="gg-paper-cap">{mvp.name} of the {w.name}, the most valuable player of the {ROUND_NAMES[paper.round]}, after the final buzzer.</div></> : <div className="gg-paper-frame"><TeamBadge team={w} size={120} decorative /></div>}
            <div className="gg-paper-frame small">{paper.round === 3 && trophyUrl("stanley") ? <img src={trophyUrl("stanley")} alt="Stanley Cup" /> : <TeamBadge team={w} size={90} decorative />}</div>
            <div className="gg-paper-cap">{paper.round === 3 ? `The Stanley Cup heads home to ${w.city} today.` : `${w.city} moves on; ${l.city} goes home.`}</div>
          </div>
          <aside className="gg-paper-side">
            <h4>The Road So Far</h4>
            {road.map((r, i) => <div key={i} className="gg-paper-kv"><span>{ROUND_NAMES[r.round]}</span><b>vs. {r.opp.name} {r.won ? "W" : "L"} {r.score}</b></div>)}
            <h4>By the Numbers</h4>
            <div className="gg-paper-kv"><span>Regular season</span><b>{w.rec.w}-{w.rec.l}-{w.rec.otl}</b></div>
            <div className="gg-paper-kv"><span>Series</span><b>{paper.wins}-{paper.losses}</b></div>
            {paper.games.map((g, i) => <div key={i} className="gg-paper-kv"><span>Game {i + 1}</span><b>{league.teams[g.a].abbr} {g.as} – {g.hs} {league.teams[g.h].abbr}{g.ot ? ` ${g.ot}` : ""}</b></div>)}
            {paper.round === 3 && <><div className="gg-paper-kv"><span>Titles, all time</span><b>{cups}</b></div><h4>Parade Set for Tuesday</h4><p>The city will hold a victory parade Tuesday at 11 a.m. Officials expect more than a million people along the route.</p></>}
            {league.awards?.hart && paper.round === 3 && <><h4>League Honors</h4><p>{league.awards.hart.name} was named the league’s most valuable player. Full list of winners in the Trophy Room.</p></>}
          </aside>
        </div>
        <div className="gg-paper-foot">INSIDE · {paper.round === 3 ? "Awards and the All-Star team, D2 · How the champions were built, D6" : "Series grades, D2 · What comes next, D6"} · Letters, A22 · Weather, A24</div>
      </div>
      <button className="gg-paper-btn" onClick={onClose}>{paper.round === 3 ? "Continue to the awards →" : "Continue →"}</button>
    </div>
  );
}
