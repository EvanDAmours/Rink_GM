import React, { useEffect, useState } from "react";
import Select from "./Select.jsx";
import { useGame, PlayerName, TeamBadge, TeamName, Bar } from "./common.jsx";
import { currentSlot, draftDone, pickSlot } from "../engine/draft.js";
import { teamNeeds } from "../engine/teamPlanning.js";
import { POS_COLOR } from "./TradePage.jsx";
import { DRAFT_ROUNDS, COMBINE_INVITES } from "../engine/constants.js";
import {
  prospectRead, classPool, csRank, fmtHeight, gradeClass, COMBINE_TESTS, interviewProspect, atCombine, openDraftFloor,
  myListIds, onMyList, toggleMyList, SCOUT_GROUPS, SCOUT_ROLES, SCOUT_TRAITS,
  staffWindowOpen, hireScout, releaseScout, swapScoutRoles, scoutGroup, SCOUT_SLOTS,
} from "../engine/scouting.js";
import { Read, DevChip, CovTag, ScoutButton, statText } from "./scoutingBits.jsx";

import RegionalScouting from "./RegionalScouting.jsx";
import ScoutingHQ from "./ScoutingHQ.jsx";
import ScoutBoard from "./ScoutBoard.jsx";
import DraftDay, { YourClass } from "./DraftDay.jsx";
import { usePhone, PosChip } from "./DraftTools.jsx";
import { draftLive, draftClock, draftPlayer } from "../engine/draftClock.js";
import { stampDraftTruth } from "../engine/draftRecap.js";
import { REGIONS, regionOf } from "../engine/regions.js";
import "./draft.css";

const POSITIONS = ["all", "C", "LW", "RW", "LD", "RD", "G"];
const PAGE = 50;

// A rating as you know it, in plain big type for the phone row: "?" (no idea), "B+" (a scout's
// general idea), "~72" (a report's estimate) or "72" (exact).
function Val({ txt, title }) {
  const unk = txt === "??", gen = /^[A-D]/.test(txt), est = String(txt).startsWith("~");
  return <b className={`dd-val${unk ? " unk" : gen ? ` gen ${gradeClass(txt)}` : est ? " est" : " exact"}`} title={title}>{unk ? "?" : txt}</b>;
}

// A pick can't be taken back, so on a phone the first tap arms the button and the second drafts.
function ArmButton({ onGo, disabled }) {
  const [arm, setArm] = useState(false);
  useEffect(() => { if (!arm) return undefined; const t = setTimeout(() => setArm(false), 3000); return () => clearTimeout(t); }, [arm]);
  return <button type="button" className={`dd-arm${arm ? " armed" : ""}`} disabled={disabled} onClick={(e) => { e.stopPropagation(); if (arm) { setArm(false); onGo(); } else setArm(true); }}>{arm ? "Confirm" : "Draft"}</button>;
}

// The phone row's one button when you're not drafting: a scouting report, then the workup.
function PhoneScout({ read }) {
  return <span className={`dd-scout${read.lvl >= 2 ? " done" : ""}`} title="Filed by your scouts in their regions">{read.lvl >= 2 ? "✓" : read.lvl === 1 ? "Rpt" : "—"}</span>;
}

// Phones: one compact row per prospect. The single button is Draft while you're on the clock,
// otherwise Scout / Workup; tap the row for his full profile.
function PhoneRow({ p, onDraft, canDraft }) {
  const { league, commit, openPlayer } = useGame();
  const read = prospectRead(league, p);
  const listed = onMyList(league, p.id);
  const drafted = p.tid !== -2;
  const drafting = !!onDraft && canDraft && !drafted;
  const slot = drafted && league.draft ? league.draft.slots.find((s) => s.pid === p.id) : null;
  return (
    <div className={`dd-prow${drafting ? " live" : ""}${drafted ? " gone" : ""}`} onClick={() => openPlayer(p.id, "draft")} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && openPlayer(p.id, "draft")} aria-label={`${p.name}, ${p.pos}, Central Scouting ${csRank(p)}`}>
      <span className="dd-prow-rk">{csRank(p)}</span>
      <button type="button" className={`dd-star${listed ? " on" : ""}`} aria-label={listed ? "Remove from your list" : "Add to your list"} onClick={(e) => { e.stopPropagation(); toggleMyList(league, p.id); commit(); }}>{listed ? "★" : "☆"}</button>
      <PosChip pos={p.pos} />
      <span className="dd-prow-name">{p.name}</span>
      <span className="dd-prow-v"><Val txt={read.ovr} /><small>OVR</small></span>
      <span className="dd-prow-v"><Val txt={read.pot} title={read.tier ? `Projects as ${read.tier}` : undefined} /><small>POT</small></span>
      <span className="dd-prow-act" onClick={(e) => e.stopPropagation()}>
        {drafted ? <small className="muted">{slot ? `#${slot.overall} ${league.teams[slot.owner].abbr}` : "Drafted"}</small> : drafting ? <ArmButton onGo={() => onDraft(p)} /> : <PhoneScout p={p} read={read} />}
      </span>
    </div>
  );
}

// ---------- Big Board rows ----------

function Arrow({ p }) {
  if (!p.cs?.final || p.cs.final === p.cs.mid) return null;
  const up = p.cs.final < p.cs.mid;
  return <span className={`csmove ${up ? "up" : "down"}`} title={`Midterm #${p.cs.mid} → final #${p.cs.final}`}>{up ? "▲" : "▼"}{Math.abs(p.cs.mid - p.cs.final)}</span>;
}

function ProspectRow({ p, onDraft, canDraft }) {
  const { league, commit } = useGame();
  const read = prospectRead(league, p);
  const listed = onMyList(league, p.id);
  const b = p.bio || {};
  const drafted = p.tid !== -2;
  const slot = drafted && league.draft ? league.draft.slots.find((s) => s.pid === p.id) : null;
  const stats = statText(league, p);
  return (
    <div className={`prow${drafted ? " gone" : ""}`}>
      <span className="prank">{csRank(p)}<Arrow p={p} /></span>
      <div className="pwho">
        <div className="pname">
          <button className={`star${listed ? " on" : ""}`} title={listed ? "Remove from your list" : "Add to your list"} aria-label={listed ? "Remove from your list" : "Add to your list"} onClick={() => { toggleMyList(league, p.id); commit(); }}>{listed ? "★" : "☆"}</button>
          <PlayerName p={p} />
          <span className="posbadge">{p.pos}</span>
        </div>
        <div className="tiny muted pmeta">{p.age} · {b.ht ? `${fmtHeight(b.ht)} ${b.wt}` : ""} · {b.team} <span className="dim">({b.lg})</span></div>
        {stats && <div className="tiny muted pmeta">{stats}</div>}
      </div>
      <div className="pread">
        <Read label="OVR" txt={read.ovr} />
        <Read label="POT" txt={read.pot} title={read.tier ? `Projects as ${read.tier}` : undefined} />
        <DevChip dev={read.dev} />
      </div>
      <div className="pact">
        {drafted ? (
          <span className="small muted">{slot ? <>#{slot.overall} <TeamName tid={slot.owner} short /></> : "Drafted"}</span>
        ) : (
          <>
            <CovTag read={read} />
            <ScoutButton p={p} read={read} />
            {onDraft && <button className="tiny primary" disabled={!canDraft} onClick={() => onDraft(p)}>Draft</button>}
          </>
        )}
      </div>
    </div>
  );
}

function Board({ onDraft, canDraft, availableOnly = false, title = "Big Board" }) {
  const { league } = useGame();
  const phone = usePhone();
  const [pos, setPos] = useState("all");
  const [q, setQ] = useState("");
  const [show, setShow] = useState("all");
  const [region, setRegion] = useState("all");
  const [hideTaken, setHideTaken] = useState(true);
  const [searching, setSearching] = useState(false);
  const [n, setN] = useState(PAGE);
  const user = league.teams[league.userTid];
  const s = user.scouts || {};
  const myGroups = SCOUT_SLOTS.map((role) => s[role]?.group).filter(Boolean);
  const all = (league.draftClass || []).map((id) => league.players[id]).filter(Boolean);
  // Always Central Scouting order: scouting a player never moves him on the board.
  const list = all
    .filter((p) => !(availableOnly || hideTaken) || p.tid === -2)
    .filter((p) => region === "all" || (region === "CHL" ? ["OHL", "WHL", "QMJHL"].includes(regionOf(p)) : regionOf(p) === region))
    .filter((p) => pos === "all" || p.pos === pos)
    .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.bio?.team || "").toLowerCase().includes(q.toLowerCase()))
    .filter((p) => show === "all" || (show === "scouted" ? p.scout?.lvl > 0 : show === "unscouted" ? !p.scout?.lvl : show === "list" ? onMyList(league, p.id) : myGroups.includes(scoutGroup(p.pos))))
    .sort((a, b) => csRank(a) - csRank(b));
  const leagueSel = <Select aria-label="Scouting league" value={region} onChange={(e) => {setRegion(e.target.value); setN(PAGE);}}><option value="all">All leagues</option><option value="CHL">CHL · all three leagues</option>{Object.entries(REGIONS).map(([k,r]) => <option key={k} value={k}>{r.name}</option>)}</Select>;
  const showSel = <Select value={show} onChange={(e) => { setShow(e.target.value); setN(PAGE); }} aria-label="Show"><option value="all">Everyone</option><option value="covered">Positions my scouts cover</option><option value="scouted">Scouted</option><option value="unscouted">Not scouted yet</option><option value="list">On my list</option></Select>;
  // Phones: the filters share one row and search sits behind 🔍; one compact row per prospect.
  if (phone) return (
    <div className="panel dd-board phone">
      <h3>{title}<span className="right muted small" style={{ textTransform: "none", letterSpacing: 0 }}>CS {all.some((p) => p.cs?.final) ? "final" : "midterm"}</span></h3>
      <div className={`dd-filters${searching ? " wrap" : ""}`}>
        <Select aria-label="Position" value={pos} onChange={(e) => { setPos(e.target.value); setN(PAGE); }}>{POSITIONS.map((x) => <option key={x} value={x}>{x === "all" ? "All pos." : x}</option>)}</Select>
        {leagueSel}
        {showSel}
        {!searching && <button type="button" className="dd-mag" aria-label="Search prospects" onClick={() => setSearching(true)}>Search</button>}
        {searching && <input className="search" autoFocus placeholder="Search name or team" value={q} onChange={(e) => { setQ(e.target.value); setN(PAGE); }} aria-label="Search prospects" />}
      </div>
      <div className="dd-plist">
        {list.slice(0, n).map((p) => <PhoneRow key={p.id} p={p} onDraft={onDraft} canDraft={canDraft} />)}
        {!list.length && <div className="dim small">No prospects match.</div>}
      </div>
      {list.length > n && <div style={{ marginTop: 10 }}><button className="small" onClick={() => setN(n + PAGE)}>Show more ({list.length - n} left)</button></div>}
    </div>
  );
  return (
    <div className="panel">
      <h3>
        {title}
        <span className="right muted small" style={{ textTransform: "none", letterSpacing: 0 }}>Central Scouting {all.some((p) => p.cs?.final) ? "final" : "midterm"} order</span>
      </h3>
      <div className="row" style={{ gap: 4, marginBottom: 8 }}>
        {POSITIONS.map((x) => (
          <button key={x} className={`small rk-sb${pos === x ? " on" : ""}`} onClick={() => { setPos(x); setN(PAGE); }}>{x === "all" ? "All" : x}</button>
        ))}
      </div>
      <div className="row" style={{ gap: 6, marginBottom: 10 }}>
        <input className="search" placeholder="Search name or team" value={q} onChange={(e) => { setQ(e.target.value); setN(PAGE); }} aria-label="Search prospects" />
        {leagueSel}
        {showSel}
        {!availableOnly && league.phase === "draft" && (
          <label className="small muted row" style={{ gap: 4 }}>
            <input type="checkbox" checked={hideTaken} onChange={(e) => setHideTaken(e.target.checked)} /> Hide drafted
          </label>
        )}
      </div>
      <div className="plist">
        {list.slice(0, n).map((p) => <ProspectRow key={p.id} p={p} onDraft={onDraft} canDraft={canDraft} />)}
        {!list.length && <div className="dim small">No prospects match.</div>}
      </div>
      {list.length > n && <div style={{ marginTop: 10 }}><button className="small" onClick={() => setN(n + PAGE)}>Show more ({list.length - n} left)</button></div>}
    </div>
  );
}

function Legend() {
  return (
    <div className="legend small muted">
      <span><span className="rd unk"><b>??</b></span> not scouted</span>
      <span><span className="rd gen gb"><b>B+</b></span> a scout's general idea of his ceiling</span>
      <span><span className="rd est"><b>~84</b></span> estimate from a report</span>
      <span><span className="rd exact"><b>84</b></span> exact (major scout's full workup)</span>
    </div>
  );
}

// ---------- Your list ----------

function MyListPanel({ onOpen }) {
  const { league, openPlayer } = useGame();
  const ids = myListIds(league).filter((id) => league.players[id]?.tid === -2);
  return (
    <div className="panel">
      <h3>Your list <span className="right muted small" style={{ textTransform: "none", letterSpacing: 0 }}>{ids.length} names</span></h3>
      {!ids.length && <div className="dim small">Your scouts haven't filed on anyone yet.</div>}
      <div className="list">
        {ids.slice(0, 8).map((id, i) => {
          const p = league.players[id];
          const read = prospectRead(league, p);
          return (
            <div className="item small mlrow" key={id}>
              <b className="mono">{i + 1}.</b>
              <span className="posbadge">{p.pos}</span>
              <button type="button" className="link" onClick={() => openPlayer(id, "draft")}>{p.name}</button>
              <span className="mlread"><Read label="POT" txt={read.pot} /></span>
            </div>
          );
        })}
      </div>
      {onOpen && <button type="button" className="small" style={{ marginTop: 8 }} onClick={onOpen}>Open Your list on the Draft screen</button>}
    </div>
  );
}

// ---------- Scouting staff ----------

function ScoutCard({ scout, role, children }) {
  return (
    <div className={`scard${scout ? "" : " empty"}`}>
      <div className="row" style={{ gap: 8 }}>
        <span className={`cov ${role}`}>{SCOUT_ROLES[role]?.name || "Available"}</span>
        {scout && <b>{SCOUT_GROUPS[scout.group]}</b>}
      </div>
      {scout ? (
        <>
          <div className="scname">{scout.name}</div>
          <div className="tiny muted">{scout.age} · {scout.bg}</div>
          <div className="row" style={{ gap: 8, marginTop: 4 }}>
            <span className="dlab" style={{ width: 70 }}>Evaluation</span>
            <span style={{ flex: 1 }}><Bar v={scout.eval} /></span>
            <b className="mono">{scout.eval}</b>
          </div>
          {scout.trait ? <div className="small"><span className="pill on">{SCOUT_TRAITS[scout.trait].name}</span> <span className="muted">{SCOUT_TRAITS[scout.trait].desc}</span></div> : <div className="tiny dim">No special trait</div>}
        </>
      ) : (
        <div className="small muted" style={{ marginTop: 6 }}>Vacant. Hire someone from the list below.</div>
      )}
      {children}
    </div>
  );
}

function ScoutsView() {
  const { league, commit, toast } = useGame();
  const user = league.teams[league.userTid];
  const s = user.scouts || {};
  const open = staffWindowOpen(league);
  const act = (r) => {
    toast(r.msg);
    commit();
  };
  const pool = [...(league.scoutPool || [])].sort((a, b) => a.group.localeCompare(b.group) || b.eval - a.eval);
  const blocked = () => null;
  return (
    <div className="stack">
      <div className="panel">
        <h3>How scouting works</h3>
        <div className="muted small">
          No points to spend. Before each season send your scouts to their regions (the Regions tab): three for your senior scout, two for the second major scout, one for each minor scout. Through the season they file reports there on their own: higher-graded scouts read closer, reach full workups sooner and find the late-ranked gems. At the Combine you get interviews and private workouts.
        </div>
      </div>
      <div className="sgrid">
        {SCOUT_SLOTS.map((role) => (
          <ScoutCard key={role} scout={s[role]} role={role}>
            <div className="tiny muted" style={{ marginTop: 6 }}>{SCOUT_ROLES[role].desc}</div>
            {open && s[role] && <div className="row" style={{ marginTop: 8 }}><button className="tiny ghost" onClick={() => act(releaseScout(league, role))}>Let go</button></div>}
          </ScoutCard>
        ))}
      </div>
      {open && (s.major || s.minor) && <div><button className="small" onClick={() => act(swapScoutRoles(league))}>⇄ Swap major and minor roles</button></div>}

      <div className="panel">
        <h3>What your scouts can tell you</h3>
        <div className="tablewrap">
          <table className="t howto">
            <thead>
              <tr><th></th><th>Without a report</th><th>Scouting report</th><th>Full workup</th></tr>
            </thead>
            <tbody>
              <tr><td><b>Major scout's region</b></td><td>A general idea of every prospect's ceiling (letter grade)</td><td>Close estimates, tool grades, strengths, an NHL comparable</td><td><b>Exact ratings and his development trait</b></td></tr>
              <tr><td><b>Minor scout's region</b></td><td>A rougher general idea of every prospect's ceiling</td><td>Looser estimates and the full write-up</td><td>Sharper estimates (no development trait)</td></tr>
              <tr><td><b>Regions with no scout</b></td><td>Only Central Scouting's ranking</td><td>A rough estimate from the front office</td><td>A slightly better estimate</td></tr>
            </tbody>
          </table>
        </div>
        <div className="muted small" style={{ marginTop: 8 }}>A scout's Evaluation rating sets how close his reads are. The Big Board never reorders when you scout: it's always in Central Scouting's order, and your own ranking lives in Your list.</div>
      </div>

      <div className="panel">
        <h3>Scouts available</h3>
        {!open && <div className="notice warn" style={{ marginBottom: 10 }}>Your scouts are on the road for the season. You can change your staff after the draft or in the preseason.</div>}
        <div className="sgrid pool">
          {pool.map((sc) => (
            <ScoutCard key={sc.id} scout={sc} role="pool">
              {open && (
                <div className="row" style={{ marginTop: 8, gap: 6 }}>
                  {SCOUT_SLOTS.map((role) => (
                    <button key={role} className="tiny" disabled={!!blocked(sc, role)} title={blocked(sc, role) || `Hire him as your ${SCOUT_ROLES[role].name.toLowerCase()}${s[role] ? ` (replacing ${s[role].name})` : ""}`} onClick={() => act(hireScout(league, sc.id, role))}>
                      Hire as {role}
                    </button>
                  ))}
                </div>
              )}
            </ScoutCard>
          ))}
          {!pool.length && <div className="dim small">Nobody's looking for work right now.</div>}
        </div>
      </div>
    </div>
  );
}

// ---------- Your picks ----------

// One chip per round for each draft, as in the football game: R1 #12 … R7 #204. A pick you've
// used is struck through with the player you took; a round you traded away is faded.
// Numbers come from the running draft, or the standings for the coming one.
function trackerRow(league, year) {
  const user = league.teams[league.userTid];
  const d = league.draft;
  const live = d?.year === year && Array.isArray(d.slots);
  const owned = live
    ? d.slots.filter((s) => s.owner === user.id).map((s) => ({ key: `s${s.overall}`, round: s.round, orig: s.orig, overall: s.overall, pid: s.pid }))
    : league.draftPicks.filter((pk) => pk.year === year && pk.owner === user.id).map((pk) => ({ key: pk.id, round: pk.round, orig: pk.orig, overall: pickSlot(league, pk)?.overall ?? null }));
  const away = (round) => (live ? d.slots.find((s) => s.round === round && s.orig === user.id && s.owner !== user.id) : league.draftPicks.find((pk) => pk.year === year && pk.round === round && pk.orig === user.id && pk.owner !== user.id));
  const chips = [];
  for (let r = 1; r <= DRAFT_ROUNDS; r++) {
    const mine = owned.filter((x) => x.round === r).sort((a, b) => (a.overall ?? 999) - (b.overall ?? 999));
    if (mine.length) mine.forEach((x) => chips.push({ r, x }));
    else { const gone = away(r); chips.push({ r, to: gone ? gone.owner : null }); }
  }
  return { year, live, chips, left: owned.filter((x) => !x.pid).length, total: owned.length };
}

function PickTracker({ years }) {
  const { league } = useGame();
  const [more, setMore] = useState(false);
  const user = league.teams[league.userTid];
  const rows = years.map((y) => trackerRow(league, y));
  if (!rows.length) return <div className="panel gg-picks"><div className="gg-picks-h"><b>Your picks</b><span className="dim small">You don't own any picks.</span></div></div>;
  const shown = more ? rows : rows.slice(0, 1);
  const chip = ({ r, x, to }, row) => {
    if (!x) {
      const t = to != null ? league.teams[to] : null;
      return <span key={`r${r}`} className="gg-pk none" title={t ? `Round ${r}: traded to the ${t.city} ${t.name}` : `No round ${r} pick`}><b>R{r}</b>{t ? `→ ${t.abbr}` : "—"}</span>;
    }
    const via = x.orig !== user.id ? league.teams[x.orig]?.abbr : "";
    const p = x.pid ? league.players[x.pid] : null;
    const num = <span className="gg-pk-n">{x.overall ? `#${x.overall}` : ""}{via ? `${x.overall ? " " : ""}${via}` : ""}</span>;
    if (p) return <span key={x.key} className="gg-pk used" title={`Round ${r}, pick ${x.overall}: ${p.name}`}><b>R{r}</b>{num}<span className="gg-pk-who">✓ <PlayerName p={p} showInj={false} /> <i>{p.pos}</i></span></span>;
    const title = row.live ? `Round ${r}, pick ${x.overall}${via ? ` (from ${via})` : ""}` : x.overall ? `Round ${r}: projected #${x.overall} from the standings, before the lottery${via ? ` (from ${via})` : ""}` : `Round ${r}${via ? ` (from ${via})` : ""}: the order is set after the season`;
    return <span key={x.key} className="gg-pk" title={title}><b>R{r}</b>{num}</span>;
  };
  return (
    <div className="panel gg-picks">
      {shown.map((row, i) => (
        <div key={row.year} className="gg-picks-row">
          {i === 0 ? <span className="gg-picks-h"><b>Your picks</b><small>{row.year}</small><em className={row.left ? "good" : ""}>{row.left} of {row.total} left</em></span> : <span className="gg-picks-h later"><small>{row.year}</small><em>{row.total} pick{row.total === 1 ? "" : "s"}</em></span>}
          <span className="gg-picks-chips">{row.chips.map((c) => chip(c, row))}</span>
        </div>
      ))}
      {rows.length > 1 && <button className="link gg-picks-more" onClick={() => setMore((v) => !v)}>{more ? "Fewer ▴" : `Later drafts (${rows.length - 1}) ▾`}</button>}
    </div>
  );
}

// ---------- Page ----------

// The Draft section (r16): Scouting (HQ, Big Board, Scouts' board, Regions, Scouts: unchanged),
// Draft (one Draft Day screen, DraftDay.jsx) and Your class (replaces the recap and the mock).
// The old Combine table, war room, draft floor, mock draft and recap are gone; the Combine's tests
// live on the player card, the visits on the Draft screen's Combine card.
const SESSION = Math.random().toString(36).slice(2, 10);
const OLD = { floor: "day", combine: "day", list: "day", recap: "class" };

export default function DraftPage({ act, want, onView }) {
  const { league, commit, toast } = useGame();
  const inDraft = league.phase === "draft" && !!league.draft;
  const done = inDraft && draftDone(league);
  const defaultView = inDraft ? "day" : "hq";
  // A tab you pick sticks until the draft moves on (combine → draft → done).
  const stageKey = `${league.phase}|${league.draft?.stage || ""}`;
  const [sel, setSel] = useState({ v: null, k: stageKey });
  const viewSel = sel.k === stageKey ? sel.v : null;
  const setView = (v) => setSel({ v: OLD[v] || v, k: stageKey });
  const views = [["hq", "Scouting HQ"], ["board", "Big Board"], ["myscouts", "Scouts' board"], ["regions", "Regions"], ["scouts", "Scouts"], ["day", "Draft"], ["class", "Your class"]];
  const view = views.some(([k]) => k === viewSel) ? viewSel : defaultView;
  useEffect(() => { if (want?.v) setView(want.v); }, [want?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onView?.(view); }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  const year = inDraft ? league.draft.year : league.draftClassYear;
  const live = draftLive(league);
  const slot = live ? currentSlot(league) : null;
  const user = league.teams[league.userTid];
  const onClock = !!slot && slot.owner === user.id;
  const trackerYears = inDraft ? [league.draft.year] : [...new Set(league.draftPicks.filter((p) => p.owner === user.id).map((p) => p.year))].sort((a, b) => a - b);

  // A save picked up mid-draft opens paused (press Resume); leaving the screen and coming back in
  // the same visit keeps the clock as you left it.
  useEffect(() => {
    if (!live) return;
    const c = draftClock(league);
    if (c.session && c.session !== SESSION && !c.paused) {
      c.paused = true;
      toast("Picking the draft up where you left it. It's paused: press Resume.", 5000);
    }
    c.session = SESSION;
  }, [live]); // eslint-disable-line react-hooks/exhaustive-deps
  // Draft-day truth for the archive (the recap's verdicts two seasons on), also for picks simmed from the top bar.
  useEffect(() => { if (stampDraftTruth(league)) commit(3000); });
  // Your class opens on its own once the last pick is in.
  useEffect(() => {
    if (done && !league.draft.recapShown) {
      league.draft.recapShown = true;
      setView("class");
      commit();
    }
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps
  const draft = (p) => { if (onClock && draftPlayer(league, p.id)) commit(); };

  const scouting = ["hq", "board", "myscouts", "regions", "scouts"].includes(view);
  return (
    <div className={`stack gg-draft${live ? " dd-running" : ""}`}>
      {!onView && <div className="pagehead"><h2>{`${year} NHL Entry Draft`}</h2></div>}
      {scouting && <div className="tabs hq-views">{views.filter(([k]) => !["day", "class"].includes(k)).map(([k, label]) => <button key={k} className={view === k ? "on" : ""} onClick={() => setView(k)}>{label}</button>)}</div>}
      {view === "day" && <DraftDay act={act} onClass={() => setView("class")} />}
      {view === "class" && <YourClass />}
      {view === "myscouts" && <ScoutBoard />}
      {view === "board" && (
        <>
          <PickTracker years={trackerYears} />
          <Legend />
          <div className="dgrid">
            <Board onDraft={slot ? draft : null} canDraft={onClock} />
            <div className="stack">
              <MyListPanel compact onOpen={() => setView("day")} />
              <ScoutSummary go={() => setView("scouts")} />
            </div>
          </div>
        </>
      )}
      {view === "hq" && <ScoutingHQ onBoard={() => setView("board")} onRegions={() => setView("regions")} onList={() => setView("day")} onScouts={() => setView("scouts")} />}
      {view === "scouts" && <ScoutsView />}
      {view === "regions" && <RegionalScouting />}
    </div>
  );
}

function ScoutSummary({ go }) {
  const { league } = useGame();
  const s = league.teams[league.userTid].scouts || {};
  return (
    <div className="panel">
      <h3>Your scouts <span className="right"><button className="tiny" onClick={go}>Manage</button></span></h3>
      <div className="list">
        {SCOUT_SLOTS.map((role) => (
          <div className="item small" key={role}>
            <span className={`cov ${role}`}>{SCOUT_ROLES[role].short}</span>
            {s[role] ? <><b>{SCOUT_GROUPS[s[role].group]}</b><span className="muted">{s[role].name} · eval {s[role].eval}</span></> : <span className="dim">Vacant</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
