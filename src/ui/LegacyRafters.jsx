// The Legacy Hall's rafters and Hall (Gridiron 2.0 / 2.50): team-colour championship banners, the
// club's retired numbers, its Hockey Hall of Famers (real and from your league), the era
// documentaries, and the GM's own career measured against the great NHL general managers.
import React, { useState } from "react";
import { useGame, TeamBadge } from "./common.jsx";
import { CUP_HISTORY } from "../data/cupHistory.js";
import { RETIRED_NUMBERS, HALL_OF_FAME, LEAGUE_RETIRED, HALL_SOURCES } from "../data/hallOfFame.js";
import { retireNumber, declineNumber } from "../engine/dynasty.js";
import { gmCareer, GM_GREATS } from "../engine/legacy.js";
import "./legacy.css";

const season = (y) => `${y}-${String(y + 1).slice(2)}`;
export function Banner({ team, line1, line2, year, gold }) {
  return (
    <div className={`lg-banner${gold ? " gold" : ""}`} style={{ "--bg": team.colors?.[0] || "#1e3a8a", "--ac": team.colors?.[1] || "#e5e7eb" }}>
      <i className="lg-bar" />
      <div className="lg-cloth"><span className="lg-logo"><TeamBadge team={team} size={32} decorative /></span><b>{line1}</b><b>{line2}</b><em>{year}</em>{gold && <span className="lg-star">★</span>}</div>
    </div>
  );
}
export function NumberBanner({ team, number, name, yours }) {
  return (
    <div className={`lg-banner num${yours ? " yours" : ""}`} style={{ "--bg": team.colors?.[0] || "#1e3a8a", "--ac": team.colors?.[1] || "#e5e7eb" }} title={yours ? "Retired in your league" : "Retired by the club"}>
      <i className="lg-bar" />
      <div className="lg-cloth"><em className="big">{number}</em><b>{String(name).toUpperCase()}</b></div>
    </div>
  );
}
export const Wall = ({ label, children, empty }) => <div className="lg-wall"><div className="lg-wall-k">{label}</div><div className="lg-wall-row">{React.Children.count(children) ? children : <p className="dim small">{empty}</p>}</div></div>;

export function Rafters() {
  const { league, commit, toast, openPlayer } = useGame();
  const club = league.teams[league.userTid];
  const realCups = CUP_HISTORY.filter((c) => c.abbr === club.abbr).map((c) => ({ y: c.year, real: true }));
  const simCups = (league.history || []).filter((h) => h.champion === club.id).map((h) => ({ y: h.year }));
  const confs = (league.history || []).flatMap((h) => ["princeOfWales", "campbellBowl"].filter((k) => h.awards?.[k]?.tid === club.id).map((k) => ({ y: h.year, k })));
  const pres = (league.history || []).filter((h) => h.presidents === club.id);
  const nums = [...(RETIRED_NUMBERS[club.abbr] || []).map(([n, name]) => ({ n, name })), ...LEAGUE_RETIRED.filter(([n]) => !(RETIRED_NUMBERS[club.abbr] || []).some(([m]) => m === n)).map(([n, name]) => ({ n, name: `${name} (league-wide)` })), ...(league.numberRetirements || []).filter((x) => x.tid === club.id).map((x) => ({ n: x.number, name: x.name, yours: true, pid: x.pid }))].sort((a, b) => a.n - b.n);
  const hofReal = [...(HALL_OF_FAME[club.abbr] || [])].sort((a, b) => b[2] - a[2]);
  const hofLeague = (league.hallOfFame || []).filter((h) => h.tid === club.id);
  const prompts = (league.numberPrompts || []).map((x) => (league.retirementArchive || []).find((r) => r.pid === x.pid)).filter(Boolean);
  const answer = (r, yes) => { if (yes) { const res = retireNumber(league, r.pid); toast?.(res.msg); if (!res.ok) return; } else declineNumber(league, r.pid); commit(); };
  return (
    <div className="stack lg-hall">
      {prompts.map((r) => (
        <div key={r.pid} className="gg-card lg-prompt"><b>Raise #{r.number} to the rafters for {r.name}?</b><span className="dim small">{r.pos} · retired {season(r.year)} · {r.gp} GP with this franchise · legacy {r.legacy ?? "—"}</span><div className="row"><button className="primary" onClick={() => answer(r, true)}>Yes, retire #{r.number}</button><button className="ghost" onClick={() => answer(r, false)}>Not now</button></div></div>
      ))}
      <div className="lg-h"><span>The Rafters</span><small>{realCups.length + simCups.length} Stanley Cups · {confs.length} conference titles · {pres.length} Presidents' Trophies in your league</small></div>
      <Wall label="Stanley Cup champions" empty={`No Stanley Cup banners yet for the ${club.name}. Win one and it goes up here.`}>
        {[...realCups, ...simCups].sort((a, b) => a.y - b.y).map((c) => <Banner key={c.y} team={club} line1="STANLEY CUP" line2="CHAMPIONS" year={c.real ? c.y : season(c.y)} gold />)}
      </Wall>
      {(confs.length > 0 || pres.length > 0) && <Wall label="Conference and regular-season champions">
        {confs.map((c) => <Banner key={`${c.k}${c.y}`} team={club} line1={c.k === "princeOfWales" ? "EASTERN CONF." : "WESTERN CONF."} line2="CHAMPIONS" year={season(c.y)} />)}
        {pres.map((h) => <Banner key={`p${h.year}`} team={club} line1="PRESIDENTS'" line2="TROPHY" year={season(h.year)} />)}
      </Wall>}
      <Wall label="Retired numbers" empty="No numbers retired yet.">{nums.map((x) => <NumberBanner key={`${x.n}${x.name}`} team={club} number={x.n} name={x.name} yours={x.yours} />)}</Wall>
      <div className="lg-h"><span>Hockey Hall of Fame</span><small>{hofReal.length + hofLeague.length} honoured members: the club's real inductees, and legends who retire here in your league</small></div>
      <div className="lg-hof">
        {hofLeague.map((h) => <button key={h.pid} className="lg-hof-card yours" onClick={() => openPlayer(h.pid)}><b>{h.name}</b><span>{h.pos} · Class of {h.inducted}</span><em>YOUR LEAGUE</em></button>)}
        {hofReal.map(([n, pos, cls]) => <div key={n} className="lg-hof-card"><b>{n}</b><span>{pos} · Class of {cls}</span></div>)}
        {!hofLeague.length && !hofReal.length && <p className="dim small">No Hall of Famers yet. The club's first will be enshrined here.</p>}
      </div>
      {(league.documentaries || []).length > 0 && <>
        <div className="lg-h"><span>Era documentaries</span><small>Every five seasons, the story of your club on film</small></div>
        {[...league.documentaries].reverse().map((d) => <details key={d.from} className="gg-card lg-doc"><summary><b>{season(d.from)} to {season(d.to)}</b> · {d.tier} · {d.w}-{d.l}-{d.otl}{d.cups.length ? ` · ${d.cups.length} Cup${d.cups.length > 1 ? "s" : ""}` : ""}</summary>{d.chapters.map((c, i) => <p key={i}>{c}</p>)}</details>)}
      </>}
      <p className="muted small">Retired numbers and Hall of Fame members through the 2025-26 season, from <a href={HALL_SOURCES[0]} target="_blank" rel="noreferrer">hhof.com</a> and <a href={HALL_SOURCES[1]} target="_blank" rel="noreferrer">NHL.com</a>.</p>
    </div>
  );
}

export function GmLegacy() {
  const { league } = useGame();
  const [show] = useState(true);
  const c = gmCareer(league);
  const rows = [...GM_GREATS, { name: "You", club: league.teams[league.userTid].name, yrs: `${league.startYear || 2026}–`, ...c, cups: c.cups.length, you: true }].sort((a, b) => b.score - a.score);
  return show && (
    <div className="stack lg-gm">
      <div className="gg-legacy-hero lg-gm-hero"><div><span className="gg-k">GM legacy</span><h2>{c.tier}</h2><div className="dim small">Score {c.score} · #{c.rank} against the great NHL general managers</div></div>
        <div className="gg-tiles"><div><small>Seasons</small><b>{c.seasons}</b></div><div><small>Record</small><b>{c.w}-{c.l}</b></div><div><small>Stanley Cups</small><b>{c.cups.length}</b></div><div><small>Playoff trips</small><b>{c.playoffs}</b></div><div><small>Awards won</small><b>{c.awards}</b></div></div></div>
      {c.draftees.length > 0 && <div className="gg-card"><div className="gg-k">Your best draft picks</div>{c.draftees.map((p) => <div key={p.id} className="small">{p.name} · {p.pos} · {p.draft.year} #{p.draft.pick} · peak {p.peak || p.ovr}</div>)}</div>}
      <div className="gg-card"><div className="gg-k">Against the greats</div>
        <div className="tablewrap"><table className="t"><thead><tr><th>#</th><th>GM</th><th>Club</th><th>Years</th><th className="num">Cups</th><th className="num">Score</th></tr></thead><tbody>
          {rows.map((g, i) => <tr key={g.name} className={g.you ? "me" : ""}><td>{i + 1}</td><td><b>{g.name}</b>{g.note && <div className="dim small">{g.note}</div>}</td><td>{g.club}</td><td>{g.yrs}</td><td className="num">{g.cups}</td><td className="num">{g.score}</td></tr>)}
        </tbody></table></div>
        <div className="dim small">Score: Cups count most, then Finals, playoff trips, winning, staying power, Hall of Famers you drafted and awards. Real GMs' totals are approximate.</div>
      </div>
    </div>
  );
}
