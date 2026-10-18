import { CUP_HISTORY, CUP_HISTORY_SOURCE } from "../data/cupHistory.js";
import React, { useState } from "react";
import { useGame, TeamName, TeamBadge, PlayerName } from "./common.jsx";
import { AWARD_NAMES, AWARD_BLURB, computeAwards } from "../engine/awards.js";
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
const season = (y) => `${y}–${String(y + 1).slice(2)}`;

// The user's own trophy room: the club's Stanley Cups (real history and this league), its banners,
// every individual award its players have won, and a case showing which trophies it still chases.
export default function TrophyRoom() {
  const { league } = useGame();
  const [view, setView] = useState("club");
  const team = league.userTid;
  const club = league.teams[team];
  const seasons = [...league.history];
  const realCups = CUP_HISTORY.filter((c) => c.abbr === club.abbr);
  const yearsWith = (f) => seasons.filter(f);
  const cups = yearsWith((h) => h.champion === team);
  const finals = yearsWith((h) => h.runnerUp === team);
  const pres = yearsWith((h) => h.presidents === team);
  const confs = seasons.flatMap((h) => [["princeOfWales", h.awards?.princeOfWales], ["campbellBowl", h.awards?.campbellBowl]].filter(([, a]) => a?.tid === team).map(([k]) => ({ kind: k, year: h.year })));
  const individual = seasons.flatMap((h) => Object.entries(h.awards || {}).filter(([k, a]) => a?.tid === team && !a.team && k !== "presidents").map(([kind, a]) => ({ kind, year: h.year, ...a })));
  const thisYear = league.awards && !seasons.some((h) => h.year === league.year) ? Object.entries(league.awards).filter(([k, a]) => a?.tid === team && !a.team).map(([kind, a]) => ({ kind, year: league.year, ...a })) : [];
  const mine = [...thisYear, ...individual];
  const latest = seasons[0];
  const haveCeremony = league.awards && Object.keys(league.awards).length > 3;
  const ceremonyYear = haveCeremony ? league.year : latest?.year;
  const ceremony = haveCeremony ? league.awards : latest?.awards;
  // Mid-season: the race as it stands today, so the ceremony page is never empty.
  const inSeason = !haveCeremony && ["regular", "playoffs"].includes(league.phase) && club.rec.gp >= 10;
  const projected = inSeason ? computeAwards(league) : null;
  const shown = ceremony || projected;
  const shownYear = ceremony ? ceremonyYear : league.year;
  const won = (k) => (k === "stanley" ? realCups.length + cups.length : k === "presidents" ? pres.length : k === "princeOfWales" || k === "campbellBowl" ? confs.filter((c) => c.kind === k).length : mine.filter((a) => a.kind === k).length);
  const wonYears = (k) => (k === "stanley" ? [...realCups.map((c) => String(c.year)), ...cups.map((h) => season(h.year))] : k === "presidents" ? pres.map((h) => season(h.year)) : k === "princeOfWales" || k === "campbellBowl" ? confs.filter((c) => c.kind === k).map((c) => season(c.year)) : mine.filter((a) => a.kind === k).map((a) => season(a.year)));
  const holder = (k) => { const a = shown?.[k]; const p = a?.pid && league.players[a.pid]; return a ? `${p ? p.name : a.name}${a.tid != null ? ` · ${league.teams[a.tid].abbr}` : ""}` : null; };
  const caseWon = TROPHY_ORDER.filter((k) => won(k) > 0).length;

  return (
    <div className="stack gg-trophyroom">
      <div className="gg-pagehead">
        <div><h2>{club.city} {club.name} Trophy Room</h2><div className="gg-status">Your club's Stanley Cups, banners and silverware · {caseWon} of {TROPHY_ORDER.length} trophies won at least once</div></div>
        <div className="gg-chips"><button className={view === "club" ? "on" : ""} onClick={() => setView("club")}>Our trophies</button><button className={view === "case" ? "on" : ""} onClick={() => setView("case")}>Trophy case</button><button className={view === "awards" ? "on" : ""} onClick={() => setView("awards")}>League awards</button></div>
      </div>

      {view === "club" && (
        <>
          <div className="gg-legacy-hero" style={{ "--c1": club.colors[0] }}>
            <Trophy kind="stanley" size={190} className="hero" />
            <div className="gg-legacy-who">
              <span className="gg-k">FRANCHISE LEGACY · SINCE {realCups[0]?.year ? "THE NHL'S EARLY DAYS" : "EXPANSION"}</span>
              <h2><TeamName tid={team} /></h2>
              <div className="gg-tiles"><div><small>STANLEY CUPS</small><b>{realCups.length + cups.length}</b></div><div><small>WON IN YOUR LEAGUE</small><b>{cups.length}</b></div><div><small>CUP FINALS LOST</small><b>{finals.length}</b></div><div><small>CONFERENCE TITLES</small><b>{confs.length}</b></div><div><small>PRESIDENTS' TROPHIES</small><b>{pres.length}</b></div><div><small>INDIVIDUAL AWARDS</small><b>{mine.length}</b></div></div>
              <div className="dim small" style={{ marginTop: 8 }}>{realCups.length ? `Last real Stanley Cup: ${realCups.at(-1).year}.` : "No Stanley Cup in franchise history yet."}{cups.length ? ` Last in your league: ${season(cups[0].year)}.` : ""}</div>
            </div>
            <TeamBadge team={club} size={120} decorative />
          </div>
          <Shelf title="Stanley Cup banners" count={realCups.length + cups.length} empty={`No Stanley Cups yet for the ${club.name}. Win one and it hangs here.`}>
            {cups.map((h) => <Piece key={`s${h.year}`} kind="stanley" year={season(h.year)} title="Stanley Cup" line={`Defeated ${league.teams[h.runnerUp]?.abbr}`} small="your league" size={110} />)}
            {[...realCups].reverse().map((c) => <Piece key={`r${c.year}`} kind="stanley" year={c.year} title="Stanley Cup" small="NHL history" size={110} />)}
          </Shelf>
          <Shelf title="Conference and regular-season banners" count={confs.length + pres.length} empty="Win the conference or the Presidents' Trophy to fill this shelf.">
            {pres.map((h) => <Piece key={`p${h.year}`} kind="presidents" year={season(h.year)} title="Presidents' Trophy" line="Best regular-season record" size={100} />)}
            {confs.map((c) => <Piece key={`${c.kind}${c.year}`} kind={c.kind} year={season(c.year)} title={AWARD_NAMES[c.kind]} line={AWARD_BLURB[c.kind]} size={100} />)}
          </Shelf>
          <Shelf title={`${club.name} award winners`} count={mine.length} empty="Your players' trophies will be displayed here.">
            {mine.map((a, i) => <Piece key={`${a.kind}${a.year}${i}`} kind={a.kind} year={season(a.year)} title={AWARD_NAMES[a.kind]} line={a.pid && league.players[a.pid] ? league.players[a.pid].name : a.name} small={a.why} size={96} />)}
          </Shelf>
          <p className="muted small">Championship history checked through 2026 (<a href={CUP_HISTORY_SOURCE} target="_blank" rel="noreferrer">NHL source</a>); pre-1927 titles are credited as the NHL credits them. Original Ottawa Senators titles belong to that earlier franchise.</p>
        </>
      )}

      {view === "case" && (
        <section className="gg-case">
          <div className="dim small" style={{ marginBottom: 8 }}>Every trophy the league awards. Lit trophies are ones the {club.name} have won; dimmed ones are still to be chased.{shown ? ` Current holders are ${projected && !ceremony ? "projected from this season's numbers" : `from ${season(shownYear)}`}.` : ""}</div>
          <div className="gg-case-grid">
            {TROPHY_ORDER.map((k) => { const n = won(k); const h = holder(k); const yrs = wonYears(k); return (
              <div key={k} className={`gg-case-item${n ? " won" : " unwon"}`}><Trophy kind={k} size={120} /><b>{AWARD_NAMES[k]}</b><small>{AWARD_BLURB[k]}</small>
                {n ? <span className="gg-case-count">{n}× · {yrs.length > 4 ? `${yrs.slice(-4).join(", ")} …` : yrs.join(", ")}</span> : <span className="dim small">Never won by the {club.name}</span>}
                {h && <span className="gg-case-holder">{projected && !ceremony ? "Leader: " : "Holder: "}{h}</span>}
              </div>
            ); })}
          </div>
        </section>
      )}

      {view === "awards" && (
        <section className="gg-ceremony">
          <div className="gg-ceremony-h"><Trophy kind="hart" size={70} /><div><span className="gg-k">NHL AWARDS</span><h2>{shown ? `${season(shownYear)} ${ceremony ? "winners" : "race · projected"}` : "Awards night"}</h2><div className="dim small">{ceremony ? "Decided from the season's statistics: production, rate, team success and position. The Conn Smythe follows the Final." : projected ? "Where the trophies would go if the season ended today. Winners are announced after the Final." : "The first awards are handed out after the regular season."}</div></div></div>
          {shown ? (
            <div className="gg-award-grid">
              {TROPHY_ORDER.filter((k) => shown[k]).sort((a, b) => Number(shown[b].tid === team) - Number(shown[a].tid === team)).map((k) => { const a = shown[k]; const p = a.pid && league.players[a.pid]; return (
                <div key={k} className={`gg-award${a.tid === team ? " mine" : ""}`}>
                  <Trophy kind={k} size={84} />
                  <div className="gg-award-body"><small>{AWARD_NAMES[k]}{a.tid === team ? " · YOURS" : ""}</small><b>{p ? <PlayerName p={p} /> : a.name}</b><span className="row" style={{ gap: 6 }}>{a.tid != null && <TeamBadge team={league.teams[a.tid]} size={18} decorative />}<span className="dim">{a.tid != null ? league.teams[a.tid].abbr : ""}{p ? ` · ${p.pos}` : ""}</span></span><em>{AWARD_BLURB[k]}{a.why ? ` · ${a.why}` : ""}</em></div>
                </div>
              ); })}
            </div>
          ) : <div className="gg-card"><div className="dim">Play ten games and the awards race appears here; the winners are announced after the Final.</div></div>}
        </section>
      )}
    </div>
  );
}

// Compatibility for the title screen: the premium sprite.
export function HockeyTrophy({ kind = "stanley", size = 170 }) {
  return <Trophy kind={kind} size={size * 1.3} />;
}
