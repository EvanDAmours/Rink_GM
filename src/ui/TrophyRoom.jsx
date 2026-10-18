import { CUP_HISTORY, CUP_HISTORY_SOURCE } from "../data/cupHistory.js";
import React, { useState } from "react";
import { useGame, TeamName, TeamBadge, PlayerName } from "./common.jsx";
import Select from "./Select.jsx";
import { AWARD_NAMES, AWARD_BLURB } from "../engine/awards.js";
import { trophyUrl, TROPHY_ORDER } from "./trophies.js";

export function Trophy({ kind, size = 110, className = "" }) {
  const url = trophyUrl(kind);
  return url ? <img className={`gg-trophy ${className}`} src={url} alt={AWARD_NAMES[kind] || kind} style={{ height: size }} draggable={false} /> : <span className="gg-trophy-fallback" style={{ fontSize: size * 0.6 }}>🏆</span>;
}

// A trophy on the shelf with its plaque.
function Piece({ kind, year, title, line, small, size = 120 }) {
  return (
    <div className="gg-piece">
      <div className="gg-piece-light" />
      <Trophy kind={kind} size={size} />
      <div className="gg-plaque"><b>{year}</b><span>{title}</span>{line && <em>{line}</em>}{small && <small>{small}</small>}</div>
    </div>
  );
}
const Shelf = ({ title, count, children, empty }) => (
  <section className="gg-shelf"><div className="gg-shelf-h"><span>{title}</span>{count != null && <small>{count}</small>}</div><div className="gg-shelf-row">{React.Children.count(children) ? children : <p className="gg-shelf-empty">{empty}</p>}</div><div className="gg-shelf-wood" /></section>
);

export default function TrophyRoom() {
  const { league } = useGame();
  const [tid, setTid] = useState(String(league.userTid));
  const [view, setView] = useState("club");
  const team = Number(tid);
  const seasons = [...league.history];
  const realCups = CUP_HISTORY.filter((c) => c.abbr === league.teams[team].abbr);
  const yearsWith = (f) => seasons.filter(f);
  const cups = yearsWith((h) => h.champion === team);
  const pres = yearsWith((h) => h.presidents === team);
  const confs = seasons.flatMap((h) => [["princeOfWales", h.awards?.princeOfWales], ["campbellBowl", h.awards?.campbellBowl]].filter(([, a]) => a?.tid === team).map(([k]) => ({ kind: k, year: h.year })));
  const individual = seasons.flatMap((h) => Object.entries(h.awards || {}).filter(([k, a]) => a?.tid === team && !a.team && k !== "presidents").map(([kind, a]) => ({ kind, year: h.year, ...a })));
  const thisYear = league.awards && !seasons.some((h) => h.year === league.year) ? Object.entries(league.awards).filter(([k, a]) => a?.tid === team && !a.team).map(([kind, a]) => ({ kind, year: league.year, ...a })) : [];
  const latest = seasons[0];
  const ceremonyYear = league.awards && Object.keys(league.awards).length > 3 ? (seasons.some((h) => h.year === league.year) ? league.year : league.year) : latest?.year;
  const ceremony = league.awards && Object.keys(league.awards).length > 3 ? league.awards : latest?.awards;

  return (
    <div className="stack gg-trophyroom">
      <div className="gg-pagehead">
        <div><h2>Trophy Room</h2><div className="gg-status">Legacy room · the Stanley Cups, banners and silverware of your franchise, and the league's annual awards</div></div>
        <div className="gg-chips"><button className={view === "club" ? "on" : ""} onClick={() => setView("club")}>Franchise</button><button className={view === "awards" ? "on" : ""} onClick={() => setView("awards")}>Awards ceremony</button><button className={view === "case" ? "on" : ""} onClick={() => setView("case")}>Trophy case</button></div>
      </div>

      {view === "club" && (
        <>
          <div className="gg-legacy-hero" style={{ "--c1": league.teams[team].colors[0] }}>
            <Trophy kind="stanley" size={190} className="hero" />
            <div className="gg-legacy-who">
              <span className="gg-k">FRANCHISE LEGACY</span>
              <h2><TeamName tid={team} /></h2>
              <div className="gg-tiles"><div><small>STANLEY CUPS</small><b>{realCups.length + cups.length}</b></div><div><small>IN YOUR LEAGUE</small><b>{cups.length}</b></div><div><small>INDIVIDUAL AWARDS</small><b>{individual.length + thisYear.length}</b></div><div><small>PRESIDENTS' TROPHIES</small><b>{pres.length}</b></div></div>
              <Select aria-label="Trophy room team" value={tid} onChange={(e) => setTid(e.target.value)} style={{ marginTop: 8, minWidth: 220 }}>{league.teams.map((t) => <option key={t.id} value={t.id}>{t.city} {t.name}</option>)}</Select>
            </div>
            <TeamBadge team={league.teams[team]} size={110} decorative />
          </div>
          <Shelf title="Stanley Cup banners" count={realCups.length + cups.length} empty="No Stanley Cups yet for this franchise.">
            {realCups.map((c) => <Piece key={`r${c.year}`} kind="stanley" year={c.year} title="Stanley Cup" small="NHL history" size={110} />)}
            {cups.map((h) => <Piece key={`s${h.year}`} kind="stanley" year={`${h.year}–${String(h.year + 1).slice(2)}`} title="Stanley Cup" line={`Defeated ${league.teams[h.runnerUp]?.abbr}`} small="your league" size={110} />)}
          </Shelf>
          <Shelf title="Conference and regular-season honours" count={confs.length + pres.length} empty="Win a conference or the Presidents' Trophy to fill this shelf.">
            {pres.map((h) => <Piece key={`p${h.year}`} kind="presidents" year={`${h.year}–${String(h.year + 1).slice(2)}`} title="Presidents' Trophy" line="Best regular-season record" size={100} />)}
            {confs.map((c) => <Piece key={`${c.kind}${c.year}`} kind={c.kind} year={`${c.year}–${String(c.year + 1).slice(2)}`} title={AWARD_NAMES[c.kind]} line={AWARD_BLURB[c.kind]} size={100} />)}
          </Shelf>
          <Shelf title="Individual honours" count={individual.length + thisYear.length} empty="Your players' trophies will be displayed here.">
            {[...thisYear, ...individual].map((a, i) => <Piece key={`${a.kind}${a.year}${i}`} kind={a.kind} year={`${a.year}–${String(a.year + 1).slice(2)}`} title={AWARD_NAMES[a.kind]} line={a.pid && league.players[a.pid] ? league.players[a.pid].name : a.name} small={a.why} size={96} />)}
          </Shelf>
          <p className="muted small">Checked championship history through 2026. <a href={CUP_HISTORY_SOURCE} target="_blank" rel="noreferrer">NHL historical source</a>. Original Ottawa Senators titles belong to that earlier franchise.</p>
        </>
      )}

      {view === "awards" && (
        <section className="gg-ceremony">
          <div className="gg-ceremony-h"><Trophy kind="hart" size={70} /><div><span className="gg-k">NHL AWARDS</span><h2>{ceremonyYear ? `${ceremonyYear}–${String(ceremonyYear + 1).slice(2)} winners` : "Awards night"}</h2><div className="dim small">Decided from the season's statistics: production, rate, team success and position. The Conn Smythe follows the Final.</div></div></div>
          {ceremony ? (
            <div className="gg-award-grid">
              {TROPHY_ORDER.filter((k) => ceremony[k]).map((k) => { const a = ceremony[k]; const p = a.pid && league.players[a.pid]; return (
                <div key={k} className={`gg-award${a.tid === league.userTid ? " mine" : ""}`}>
                  <Trophy kind={k} size={84} />
                  <div className="gg-award-body"><small>{AWARD_NAMES[k]}</small><b>{p ? <PlayerName p={p} /> : a.name}</b><span className="row" style={{ gap: 6 }}>{a.tid != null && <TeamBadge team={league.teams[a.tid]} size={18} decorative />}<span className="dim">{a.tid != null ? league.teams[a.tid].abbr : ""}{p ? ` · ${p.pos}` : ""}</span></span><em>{AWARD_BLURB[k]}{a.why ? ` · ${a.why}` : ""}</em></div>
                </div>
              ); })}
            </div>
          ) : <div className="gg-card"><div className="dim">The first awards are handed out after the regular season. Play through a season to see the winners here.</div></div>}
        </section>
      )}

      {view === "case" && (
        <section className="gg-case">
          <div className="dim small" style={{ marginBottom: 8 }}>Every trophy the league awards, and who holds it right now.</div>
          <div className="gg-case-grid">
            {TROPHY_ORDER.map((k) => { const a = (league.awards && Object.keys(league.awards).length > 3 ? league.awards : latest?.awards)?.[k]; const p = a?.pid && league.players[a.pid]; return (
              <div key={k} className="gg-case-item"><Trophy kind={k} size={120} /><b>{AWARD_NAMES[k]}</b><small>{AWARD_BLURB[k]}</small>{a ? <span className="gg-case-holder">{p ? p.name : a.name}{a.tid != null ? ` · ${league.teams[a.tid].abbr}` : ""}</span> : <span className="dim small">not yet awarded</span>}</div>
            ); })}
          </div>
        </section>
      )}
    </div>
  );
}

// Compatibility for the title screen's 3D cup fallback: the premium sprite.
export function HockeyTrophy({ kind = "stanley", size = 170 }) {
  return <Trophy kind={kind} size={size * 1.3} />;
}
