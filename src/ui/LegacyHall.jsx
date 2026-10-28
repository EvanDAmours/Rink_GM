// The Legacy Hall section (Gridiron's Legacy Hall, translated to hockey): Banners, Trophies, Hall of
// Fame, Ring of Honour, Records and League awards. The section hero carries the six as tabs; each
// screen is one calm idea that fits at 1440×900 without scrolling (long shelves and award rows slide
// sideways with arrows instead). Data: engine/legacyHall.js.
import React, { useEffect, useRef, useState } from "react";
import { useGame, TeamBadge, Sheet } from "./common.jsx";
import Icon from "./Icon.jsx";
import { AWARD_NAMES, ALL_STAR_LABEL } from "../engine/awards.js";
import { trophyUrl } from "./trophies.js";
import { CUP_HISTORY } from "../data/cupHistory.js";
import { RETIRED_NUMBERS, HALL_OF_FAME, LEAGUE_RETIRED, HALL_SOURCES } from "../data/hallOfFame.js";
import { retireNumber, declineNumber } from "../engine/dynasty.js";
import { seasonMark, SEASON_MARKS } from "../engine/records.js";
import { franchiseBoard } from "../engine/legacy.js";
import { AWARD_ROWS, AWARD_SHORT, awardSeasons, awardStat, cupShelf, playerAwardShelf, seasonText, isTeamAward } from "../engine/legacyHall.js";
import { Banner, NumberBanner, Wall } from "./LegacyRafters.jsx";
import "./legacy.css";

export const LEGACY_VIEWS = ["banners", "trophies", "hof", "honour", "records", "awards"];
const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
const Art = ({ kind, h, alt }) => { const url = trophyUrl(kind); return url ? <img className="lh-art" src={url} alt={alt ?? AWARD_NAMES[kind] ?? kind} style={{ height: h }} draggable={false} /> : <span className="lh-art lh-art-none" style={{ height: h, width: h * 0.5 }} />; };

// A row that slides sideways: arrows appear only when there's more to see. end: open on the newest.
function Strip({ children, end = false, className = "", label }) {
  const ref = useRef(null);
  const [edge, setEdge] = useState({ l: false, r: false });
  const n = React.Children.count(children);
  const upd = () => { const el = ref.current; if (el) setEdge({ l: el.scrollLeft > 4, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 }); };
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    if (end) el.scrollLeft = el.scrollWidth;
    upd();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(upd) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [end, n]); // eslint-disable-line react-hooks/exhaustive-deps
  const by = (d) => ref.current?.scrollBy({ left: d * Math.max(200, ref.current.clientWidth * 0.8), behavior: "smooth" });
  return (
    <div className={`lh-strip ${className}`}>
      {edge.l && <button type="button" className="lh-arrow l" aria-label={`Earlier ${label || ""}`.trim()} onClick={() => by(-1)}><Icon name="chevron" size={18} /></button>}
      <div className="lh-track" ref={ref} onScroll={upd}>{children}</div>
      {edge.r && <button type="button" className="lh-arrow r" aria-label={`More ${label || ""}`.trim()} onClick={() => by(1)}><Icon name="chevron" size={18} /></button>}
    </div>
  );
}

// ---------- Trophies: the lit Stanley Cup shelf, then the Player awards shelf ----------
function Shelf({ title, count, children, empty, end, label }) {
  const has = React.Children.count(children) > 0;
  return (
    <section className="lh-shelfsec">
      <div className="lh-h"><span>{title}</span>{count ? <b>{count}</b> : null}</div>
      <div className="keep-dark lh-shelf">
        {has ? <Strip end={end} label={label}>{children}</Strip> : <p className="lh-empty">{empty}</p>}
        <div className="lh-wood" />
      </div>
    </section>
  );
}
function TrophiesView() {
  const { league, openPlayer } = useGame();
  const club = league.teams[league.userTid];
  const cups = cupShelf(league);
  const mine = playerAwardShelf(league);
  return (
    <div className="lh-trophies">
      <Shelf title="Stanley Cups" count={cups.length} end label="Stanley Cups" empty={`No Stanley Cups yet for the ${club.name}. Win one and it stands here.`}>
        {cups.map((c) => (
          <div key={c.key} className={`lh-piece cup${c.year === league.year ? " spot" : ""}${c.real ? "" : " ours"}`} title={`${c.title} · ${c.line}`}>
            <Art kind="stanley" h={150} alt={c.title} />
            <span className="lh-plate">{c.plaque}</span>
          </div>
        ))}
      </Shelf>
      <Shelf title="Player awards" count={mine.reduce((s, a) => s + a.n, 0)} label="player awards" empty="Win the Hart, Vezina, Norris, Calder or Conn Smythe with you as GM and the trophy goes here.">
        {mine.map((a) => (
          <div key={a.kind} className="lh-piece award" title={AWARD_NAMES[a.kind]}>
            {a.n > 1 && <span className="lh-times">×{a.n}</span>}
            <Art kind={a.kind} h={112} />
            <span className="lh-plate">{AWARD_SHORT[a.kind]}</span>
            <ul className="lh-winners">
              {a.winners.slice(0, 3).map((w) => <li key={`${w.year}${w.name}`}><button type="button" disabled={w.pid == null} onClick={() => openPlayer(w.pid, "legacy")}>{w.name}</button><span>{seasonText(w.year)}</span></li>)}
              {a.winners.length > 3 && <li className="more">and {a.winners.length - 3} more</li>}
            </ul>
          </div>
        ))}
      </Shelf>
    </div>
  );
}

// ---------- Banners ----------
function BannersView() {
  const { league } = useGame();
  const club = league.teams[league.userTid];
  const realCups = CUP_HISTORY.filter((c) => c.abbr === club.abbr).map((c) => ({ y: c.year, real: true }));
  const simCups = (league.history || []).filter((h) => h.champion === club.id).map((h) => ({ y: h.year }));
  const confs = (league.history || []).flatMap((h) => ["princeOfWales", "campbellBowl"].filter((k) => h.awards?.[k]?.tid === club.id).map((k) => ({ y: h.year, k })));
  const pres = (league.history || []).filter((h) => h.presidents === club.id);
  return (
    <div className="stack lh-banners">
      <Wall label={`Stanley Cup champions · ${realCups.length + simCups.length}`} empty={`No Stanley Cup banners yet for the ${club.name}. Win one and it goes up here.`}>
        {realCups.length + simCups.length > 0 && <Strip end label="banners">{[...realCups, ...simCups].sort((a, b) => a.y - b.y).map((c) => <Banner key={c.y} team={club} line1="STANLEY CUP" line2="CHAMPIONS" year={c.real ? c.y : seasonText(c.y)} gold />)}</Strip>}
      </Wall>
      <Wall label="Conference and Presidents' Trophy banners" empty="Win the conference or the Presidents' Trophy in your league and the banner goes up here.">
        {confs.map((c) => <Banner key={`${c.k}${c.y}`} team={club} line1={c.k === "princeOfWales" ? "EASTERN CONF." : "WESTERN CONF."} line2="CHAMPIONS" year={seasonText(c.y)} />)}
        {pres.map((h) => <Banner key={`p${h.year}`} team={club} line1="PRESIDENTS'" line2="TROPHY" year={seasonText(h.year)} />)}
      </Wall>
    </div>
  );
}

// ---------- Hall of Fame: the club's Hockey Hall of Famers ----------
function HallOfFameView() {
  const { league, openPlayer } = useGame();
  const club = league.teams[league.userTid];
  const real = [...(HALL_OF_FAME[club.abbr] || [])].sort((a, b) => b[2] - a[2]);
  const ours = (league.hallOfFame || []).filter((h) => h.tid === club.id).sort((a, b) => b.inducted - a.inducted);
  return (
    <div className="stack">
      <div className="lh-h"><span>Hockey Hall of Fame</span><b>{real.length + ours.length}</b><small>Honoured members who made their name with the {club.name}, real and from your league</small></div>
      <div className="keep-dark lh-hof">
        {ours.map((h) => <button key={h.pid} type="button" className="lh-plaque yours" onClick={() => openPlayer(h.pid, "legacy")}><em>Your league</em><b>{h.name}</b><span>{h.pos} · Class of {h.inducted}</span></button>)}
        {real.map(([n, pos, cls]) => <div key={n} className="lh-plaque"><b>{n}</b><span>{pos} · Class of {cls}</span></div>)}
        {!real.length && !ours.length && <p className="lh-empty">No Hall of Famers yet. The club's first will be enshrined here.</p>}
      </div>
      <p className="muted small">Hall of Fame members through 2026, from <a href={HALL_SOURCES[0]} target="_blank" rel="noreferrer">hhof.com</a>. Players retire into the Hall three years after their last season.</p>
    </div>
  );
}

// ---------- Ring of Honour: retired numbers and the club's legends of your era ----------
function RingOfHonourView() {
  const { league, commit, toast, openPlayer } = useGame();
  const club = league.teams[league.userTid];
  const nums = [...(RETIRED_NUMBERS[club.abbr] || []).map(([n, name]) => ({ n, name })), ...LEAGUE_RETIRED.filter(([n]) => !(RETIRED_NUMBERS[club.abbr] || []).some(([m]) => m === n)).map(([n, name]) => ({ n, name: `${name} (league-wide)` })), ...(league.numberRetirements || []).filter((x) => x.tid === club.id).map((x) => ({ n: x.number, name: x.name, yours: true, pid: x.pid }))].sort((a, b) => a.n - b.n);
  const prompts = (league.numberPrompts || []).map((x) => (league.retirementArchive || []).find((r) => r.pid === x.pid)).filter(Boolean);
  const legends = (league.retirementArchive || []).filter((r) => r.tid === club.id && (r.hof || (r.legacy ?? 0) >= 20)).sort((a, b) => (b.legacy ?? 0) - (a.legacy ?? 0)).slice(0, 12);
  const answer = (r, yes) => { if (yes) { const res = retireNumber(league, r.pid); toast?.(res.msg); if (!res.ok) return; } else declineNumber(league, r.pid); commit(); };
  return (
    <div className="stack lh-banners">
      {prompts.map((r) => (
        <div key={r.pid} className="gg-card lg-prompt"><b>Raise #{r.number} to the rafters for {r.name}?</b><span className="dim small">{r.pos} · retired {seasonText(r.year)} · {r.gp} GP with this franchise · legacy {r.legacy ?? "—"}</span><div className="row"><button className="primary" onClick={() => answer(r, true)}>Yes, retire #{r.number}</button><button className="ghost" onClick={() => answer(r, false)}>Not now</button></div></div>
      ))}
      <Wall label={`Retired numbers · ${nums.length}`} empty="No numbers retired yet.">{nums.length > 0 && <Strip label="retired numbers">{nums.map((x) => <NumberBanner key={`${x.n}${x.name}`} team={club} number={x.n} name={x.name} yours={x.yours} />)}</Strip>}</Wall>
      <div className="lh-h"><span>Legends of your era</span><small>Greats who finish their careers with the {club.name} in your league</small></div>
      <div className="keep-dark lh-ring" style={{ "--bg": club.colors?.[0] || "#1e3a8a", "--ac": club.colors?.[1] || "#e5e7eb" }}>
        {legends.map((r) => (
          <button key={r.pid} type="button" className="lh-ringcard" onClick={() => openPlayer(r.pid, "legacy")}>
            <span className="lh-ringnum">{r.number ?? "—"}</span>
            <span><b>{r.name}</b><small>{r.pos} · retired {seasonText(r.year)} · {r.gp} GP{r.hof ? " · Hall of Famer" : ""}</small></span>
          </button>
        ))}
        {!legends.length && <p className="lh-empty">When a star retires here after a big career, he joins this wall, and you can raise his number.</p>}
      </div>
    </div>
  );
}

// ---------- Records: the club's marks, real history plus your league ----------
function RecordsView() {
  const { league, go, openPlayer } = useGame();
  const club = league.teams[league.userTid];
  const marks = SEASON_MARKS.map((d) => ({ d, m: seasonMark(league, "franchise", d.key, club.abbr) })).filter((x) => x.m);
  const boards = [["pts", "Points"], ["g", "Goals"], ["a", "Assists"], ["gp", "Games"], ["w", "Goalie wins"], ["so", "Shutouts"]].map(([k, l]) => ({ k, l, rows: franchiseBoard(league, club.abbr, k, 3) })).filter((b) => b.rows.length);
  return (
    <div className="stack lh-records">
      <div className="lh-h"><span>Single-season records</span><small>The club's best seasons. Beat one in your league and it's yours.</small></div>
      <div className="lh-recgrid">
        {marks.map(({ d, m }) => (
          <div key={d.key} className={`lh-rec${m.real ? "" : " yours"}`}>
            <small>{d.label}</small><b>{fmt(m.value)}</b>
            <span>{m.real ? m.name : <button type="button" className="lh-link" disabled={m.pid == null} onClick={() => openPlayer(m.pid, "legacy")}>{m.name}</button>}{` · ${m.season || seasonText(m.year)}`}</span>
            {!m.real && <em>Set in your league</em>}
          </div>
        ))}
      </div>
      <div className="lh-h"><span>Franchise career leaders</span><small>All-time with the club: its real history plus everything done in your league</small></div>
      <div className="lh-recgrid six">
        {boards.map((b) => (
          <div key={b.k} className="lh-rec board">
            <small>{b.l}</small><b>{fmt(b.rows[0].value)}</b>
            <span className={b.rows[0].active ? "act" : ""}>{b.rows[0].name}</span>
            <ol>{b.rows.slice(1).map((r, i) => <li key={r.name} className={r.active ? "act" : ""}><i>{i + 2}</i><span>{r.name}</span><b>{fmt(r.value)}</b></li>)}</ol>
          </div>
        ))}
      </div>
      <div className="row lh-foot"><span className="muted small">Green: still playing for the club. Real records from records.nhl.com, through 2025-26.</span><button type="button" className="rk-quiet" onClick={() => go("records")}>Full record book</button></div>
    </div>
  );
}

// ---------- League awards: four rows of compact tiles, one season at a time ----------
function AwardTile({ kind, a, s, mine, onOpen }) {
  const { league } = useGame();
  const t = a?.tid != null ? league.teams[a.tid] : null;
  const team = isTeamAward(kind);
  const who = a ? (team && t ? t.name : kind === "jimGregory" && t ? (a.tid === league.userTid ? "You" : `${t.name} GM`) : a.name) : null;
  const stat = a ? awardStat(kind, a, s, league) : s?.projected ? (kind === "presidents" ? "" : "Decided in the playoffs") : "Not awarded";
  return (
    <button type="button" className={`lh-tile${mine ? " mine" : ""}${a ? "" : " none"}`} disabled={!a} onClick={a ? onOpen : undefined} title={AWARD_NAMES[kind]}>
      <Art kind={kind} h={58} />
      <span className="lh-tile-body">
        <small>{AWARD_SHORT[kind]}</small>
        {a ? <b>{t && <TeamBadge team={t} size={18} decorative />}<span>{who}</span></b> : <b className="dim"><span>—</span></b>}
        <em>{stat}</em>
      </span>
    </button>
  );
}
function AwardsView() {
  const { league, openPlayer, openTeam } = useGame();
  const seasons = awardSeasons(league);
  const [i, setI] = useState(0);
  const [stars, setStars] = useState(false);
  const s = seasons[Math.min(i, seasons.length - 1)];
  if (!s) return <div className="gg-card lh-none"><b>Awards night is still to come.</b><span className="dim">Play ten games and the awards race appears here; the winners are announced after the Final.</span></div>;
  const mineN = Object.values(s.awards).filter((a) => a?.tid === league.userTid).length;
  const allNHL = s.year === league.year && league.allNHL?.year === league.year ? league.allNHL : (league.history || []).find((h) => h.year === s.year)?.allNHL || null;
  const open = (a) => { if (a.pid != null && !isTeamAwardObj(a)) openPlayer(a.pid, "awards"); else if (a.tid != null) openTeam(a.tid); };
  return (
    <div className="lh-awards">
      <div className="lh-season">
        <button type="button" className="lh-step l" aria-label="Later season" disabled={i <= 0} onClick={() => setI(i - 1)}><Icon name="chevron" size={16} /></button>
        <b>{seasonText(s.year)}</b>
        <button type="button" className="lh-step" aria-label="Earlier season" disabled={i >= seasons.length - 1} onClick={() => setI(i + 1)}><Icon name="chevron" size={16} /></button>
        <span className="dim">{s.projected ? "The race today · winners are named after the Final" : mineN ? `${mineN} won by the ${league.teams[league.userTid].name}` : "Tap a winner for details"}</span>
        {allNHL && <button type="button" className="rk-quiet lh-stars" onClick={() => setStars(true)}>All-Star Teams</button>}
      </div>
      {AWARD_ROWS.map(([id, label, kinds]) => (
        <section key={id} className="lh-arow">
          <div className="lh-arow-h">{label}</div>
          <Strip label={label}>{kinds.map((k) => { const a = s.awards[k]; return <AwardTile key={k} kind={k} a={a} s={s} mine={a?.tid === league.userTid} onOpen={() => open(a)} />; })}</Strip>
        </section>
      ))}
      {stars && allNHL && (
        <Sheet title={`${seasonText(s.year)} All-Star Teams`} onClose={() => setStars(false)}>
          <div className="tr-allnhl">
            {["first", "second", "rookie"].filter((k) => allNHL[k]?.length).map((k) => (
              <div key={k} className="tr-allnhl-team">
                <div className="tr-allnhl-h">{ALL_STAR_LABEL[k]}</div>
                {allNHL[k].map((e, j) => <button type="button" key={`${e.pid}${j}`} className={`tr-allnhl-row${e.tid === league.userTid ? " mine" : ""}`} onClick={() => { setStars(false); openPlayer(e.pid, "awards"); }}><span className="tr-allnhl-slot">{e.slot}</span><span className="tr-allnhl-name">{e.name}</span><span className="dim small">{e.abbr} · {e.line}</span></button>)}
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}
const isTeamAwardObj = (a) => !!a?.team;

export default function LegacyHall({ view }) {
  const v = view === "hall" || !LEGACY_VIEWS.includes(view) ? "banners" : view;
  return (
    <div className="gg-embed lh">
      {v === "banners" && <BannersView />}
      {v === "trophies" && <TrophiesView />}
      {v === "hof" && <HallOfFameView />}
      {v === "honour" && <RingOfHonourView />}
      {v === "records" && <RecordsView />}
      {v === "awards" && <AwardsView />}
    </div>
  );
}
