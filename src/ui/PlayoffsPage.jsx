import React from "react";
import { useGame, TeamBadge, TeamName } from "./common.jsx";
import { ROUND_NAMES } from "../engine/playoffs.js";
import { Trophy } from "./TrophyRoom.jsx";
import { conferenceSeeds, projectedFirstRound } from "../engine/standings.js";

// One best-of-seven matchup: two team rows with series wins, game chips below.
export function SeriesCard({ s, compact = false }) {
  const { league, openBox } = useGame();
  const me = s && (s.top === league.userTid || s.bot === league.userTid);
  // Every card keeps the same shape (two rows + a fixed game strip) so the tree stays aligned as results arrive.
  if (!s) return <div className="gg-series tbd"><div className="gg-stm"><span className="gg-stm-slot">TBD</span></div><div className="gg-stm"><span className="gg-stm-slot">TBD</span></div><div className="gg-sgames" /></div>;
  const row = (tid, w) => {
    const t = league.teams[tid];
    const won = s.winner === tid, lost = s.winner != null && !won;
    return (
      <div className={`gg-stm${won ? " won" : ""}${lost ? " lost" : ""}`}>
        <TeamBadge team={t} size={compact ? 26 : 32} decorative />
        <span className="gg-stm-name"><b>{t.abbr}</b><small>{t.rec.pts} pts</small></span>
        <span className="gg-stm-w">{w}</span>
      </div>
    );
  };
  return (
    <div className={`gg-series${me ? " me" : ""}${s.winner != null ? " done" : ""}`}>
      {row(s.top, s.wTop)}
      {row(s.bot, s.wBot)}
      <div className="gg-sgames">
        {s.games.map((g, i) => {
          const aWon = g.as > g.hs, w = aWon ? g.a : g.h;
          return (
            <span key={i} className="gg-sgame" title={`Game ${i + 1}: ${league.teams[g.a].abbr} ${g.as}-${g.hs} ${league.teams[g.h].abbr}${g.ot ? ` (${g.ot})` : ""} · box score`} onClick={() => openBox({ ...g, day: null, shots: null })}>
              <i>G{i + 1}</i><b>{league.teams[w].abbr}</b> {Math.max(g.as, g.hs)}-{Math.min(g.as, g.hs)}{g.ot ? <small>{g.ot}</small> : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// Bracket tree: each conference feeds inward from the outside toward the Final.
export function Column({ list, title, side }) {
  return (
    <div className={`gg-bcol ${side}`}>
      <div className="gg-bcol-h">{title}</div>
      <div className="gg-bcol-body">{list.map((s, i) => <SeriesCard key={i} s={s} />)}</div>
    </div>
  );
}

// The bracket today's seeds would make (Standings › Playoffs before the playoffs begin).
export function ProjectedBracket() {
  const { league } = useGame();
  const tags = {};
  for (const c of ["East", "West"]) conferenceSeeds(league, c).seeds.forEach((s) => (tags[s.t.id] = s.tag));
  const r1 = projectedFirstRound(league).map((m) => ({ ...m, round: 0, wTop: tags[m.top], wBot: tags[m.bot], games: [], winner: null }));
  if (r1.length !== 8) return null;
  const pick = (c) => r1.filter((s) => s.conf === c);
  const tbd = (n) => Array(n).fill(null);
  return (
    <div className="gg-bracket pp-bracket">
      <Column side="left" title={`East · ${ROUND_NAMES[0]}`} list={pick("East")} />
      <Column side="left" title={ROUND_NAMES[1]} list={tbd(2)} />
      <Column side="left" title={ROUND_NAMES[2]} list={tbd(1)} />
      <div className="gg-bcol final"><div className="gg-bcol-h">Stanley Cup Final</div><div className="gg-bcol-body"><SeriesCard s={null} /></div></div>
      <Column side="right" title={ROUND_NAMES[2]} list={tbd(1)} />
      <Column side="right" title={ROUND_NAMES[1]} list={tbd(2)} />
      <Column side="right" title={`West · ${ROUND_NAMES[0]}`} list={pick("West")} />
    </div>
  );
}

export default function PlayoffsPage({ act }) {
  const { league } = useGame();
  const po = league.playoffs;
  // Before the playoffs: the bracket today's seeds would make (the seed lists live on Standings).
  if (!po) {
    const me = league.teams[league.userTid];
    const tags = {};
    for (const c of ["East", "West"]) conferenceSeeds(league, c).seeds.forEach((s) => (tags[s.t.id] = s.tag));
    const myTag = tags[me.id];
    return (
      <div className="stack gg-playoffs">
        <div className="pp-lead">
          The bracket these seeds would make if the season ended today{me.rec.gp ? ` (after game ${me.rec.gp})` : ""}. The real bracket is drawn when the regular season ends.
          <b className={myTag ? "in" : "outl"}> The {me.name} {myTag ? `would open as the ${me.conf}'s ${myTag} seed` : "are out right now"}.</b>
        </div>
        <ProjectedBracket />
      </div>
    );
  }

  const r = (n) => po.rounds[n] || [];
  const conf = (list, c) => list.filter((s) => s.conf === c);
  const pad = (list, n) => [...list, ...Array(Math.max(0, n - list.length)).fill(null)];
  const champ = po.champion != null ? league.teams[po.champion] : null;
  const final = r(3)[0] || null;
  // The Conn Smythe is named as the Final ends (the Cup paper prints it); the awards record follows at the draft.
  const smythe = league.awards?.connSmythe || (po.papers || []).find((p) => p.round === 3 && p.year === league.year)?.connSmythe || null;
  return (
    <div className="stack gg-playoffs">
      <div className="gg-pagehead">
        <div><h2>Stanley Cup Playoffs</h2><div className="gg-status">{league.year}-{String(league.year + 1).slice(2)} · {champ ? "Complete" : ROUND_NAMES[po.round]} · best of seven, 16 clubs</div></div>
        <span className="gg-phase">{champ ? "Cup awarded" : ROUND_NAMES[po.round]}</span>
      </div>
      {champ && (
        <div className="gg-champ">
          <Trophy kind="stanley" size={84} className="gg-champ-cup" />
          <TeamBadge team={champ} size={64} decorative />
          <div>
            <div className="gg-champ-name">{champ.city} {champ.name}</div>
            <div className="muted">{league.year}-{String(league.year + 1).slice(2)} Stanley Cup Champions{smythe ? ` · Conn Smythe: ${smythe.name} (${smythe.why})` : ""}</div>
          </div>
          <div style={{ flex: 1 }} />
          {act && league.phase === "playoffs" && <button className="primary" onClick={act.toDraft}>Go to the Draft →</button>}
        </div>
      )}
      <div className="gg-bracket">
        <Column side="left" title={`East · ${ROUND_NAMES[0]}`} list={pad(conf(r(0), "East"), 4)} />
        <Column side="left" title={ROUND_NAMES[1]} list={pad(conf(r(1), "East"), 2)} />
        <Column side="left" title={ROUND_NAMES[2]} list={pad(conf(r(2), "East"), 1)} />
        <div className="gg-bcol final">
          <div className="gg-bcol-h">{ROUND_NAMES[3]}</div>
          <div className="gg-bcol-body"><SeriesCard s={final} /></div>
        </div>
        <Column side="right" title={ROUND_NAMES[2]} list={pad(conf(r(2), "West"), 1)} />
        <Column side="right" title={ROUND_NAMES[1]} list={pad(conf(r(1), "West"), 2)} />
        <Column side="right" title={`West · ${ROUND_NAMES[0]}`} list={pad(conf(r(0), "West"), 4)} />
      </div>
    </div>
  );
}
