import React from "react";
import { useGame, TeamBadge, TeamName } from "./common.jsx";
import { ROUND_NAMES } from "../engine/playoffs.js";
import { Trophy } from "./TrophyRoom.jsx";
import { playoffPicture } from "../engine/standings.js";

// One best-of-seven matchup: two team rows with series wins, game chips below.
function SeriesCard({ s, compact = false }) {
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
function Column({ list, title, side }) {
  return (
    <div className={`gg-bcol ${side}`}>
      <div className="gg-bcol-h">{title}</div>
      <div className="gg-bcol-body">{list.map((s, i) => <SeriesCard key={i} s={s} />)}</div>
    </div>
  );
}

export default function PlayoffsPage({ act }) {
  const { league } = useGame();
  const po = league.playoffs;
  if (!po) {
    return (
      <div className="stack">
        <div className="gg-pagehead"><div><h2>Playoff Picture</h2><div className="gg-status">Top three in each division plus two wild cards per conference qualify. The bracket tree appears once the playoffs begin.</div></div></div>
        <div className="gg-stand-grid">
          {["East", "West"].map((c) => {
            const pic = playoffPicture(league, c);
            const seeds = [];
            pic.order.forEach((d) => pic.divs[d].forEach((t, i) => seeds.push({ t, tag: `${d[0]}${i + 1}`, d })));
            pic.wildcards.forEach((t, i) => seeds.push({ t, tag: `WC${i + 1}`, d: "Wild card" }));
            return (
              <section className="gg-stand" key={c} style={{ "--acc": c === "East" ? "#3b82f6" : "#ef4444" }}>
                <div className="gg-stand-h"><span>{c}ern Conference · if the playoffs started today</span><small>8 qualify</small></div>
                <div className="gg-seedlist">
                  {seeds.map(({ t, tag, d }, i) => (
                    <div key={t.id} className={`gg-seed${t.id === league.userTid ? " me" : ""}${i === 5 ? " cut" : ""}`}>
                      <span className="gg-seed-tag">{tag}</span><TeamBadge team={t} size={30} decorative /><span className="gg-seed-name"><b><TeamName tid={t.id} /></b><small>{d} · {t.rec.w}-{t.rec.l}-{t.rec.otl}</small></span><span className="gg-seed-pts">{t.rec.pts}</span>
                    </div>
                  ))}
                  <div className="gg-seed-sub">Chasing</div>
                  {pic.out.slice(0, 4).map((t) => (
                    <div key={t.id} className={`gg-seed out${t.id === league.userTid ? " me" : ""}`}>
                      <span className="gg-seed-tag">—</span><TeamBadge team={t} size={26} decorative /><span className="gg-seed-name"><b><TeamName tid={t.id} short /></b><small>{t.rec.w}-{t.rec.l}-{t.rec.otl}</small></span><span className="gg-seed-pts">{t.rec.pts}</span>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
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
          <div className="gg-bcol-h">🏆 {ROUND_NAMES[3]}</div>
          <div className="gg-bcol-body"><SeriesCard s={final} /></div>
        </div>
        <Column side="right" title={ROUND_NAMES[2]} list={pad(conf(r(2), "West"), 1)} />
        <Column side="right" title={ROUND_NAMES[1]} list={pad(conf(r(1), "West"), 2)} />
        <Column side="right" title={`West · ${ROUND_NAMES[0]}`} list={pad(conf(r(0), "West"), 4)} />
      </div>
    </div>
  );
}
