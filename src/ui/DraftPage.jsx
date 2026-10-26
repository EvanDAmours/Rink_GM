import React, { useEffect, useState } from "react";
import Select from "./Select.jsx";
import { useGame, PlayerName, TeamBadge, TeamName, Bar, PageHead } from "./common.jsx";
import { currentSlot, draftDone, pickSlot } from "../engine/draft.js";
import { teamNeeds } from "../engine/teamPlanning.js";
import { POS_COLOR } from "./TradePage.jsx";
import { DRAFT_ROUNDS, COMBINE_INVITES } from "../engine/constants.js";
import {
  prospectRead, classPool, csRank, fmtHeight, gradeClass, COMBINE_TESTS, interviewProspect, atCombine, openDraftFloor,
  myList, onMyList, toggleMyList, moveOnMyList, pickTake, teamDraftGrade, SCOUT_GROUPS, SCOUT_ROLES, SCOUT_TRAITS,
  staffWindowOpen, hireScout, releaseScout, swapScoutRoles, scoutGroup, SCOUT_SLOTS,
} from "../engine/scouting.js";
import { Read, DevChip, CovTag, ScoutButton, statText } from "./scoutingBits.jsx";

import RegionalScouting from "./RegionalScouting.jsx";
import ScoutingHQ from "./ScoutingHQ.jsx";
import ScoutBoard from "./ScoutBoard.jsx";
import DraftRecap from "./DraftRecap.jsx";
import {
  usePhone, PosChip, ValueTag, DraftTicker, PickIsIn, ClockBar, OnTheClock, WarRoom, OffersFold, IncomingCall,
  ForPickPanel, TradeUpPanel, ShopPanel, DraftQueue, DraftStatusLine,
} from "./DraftTools.jsx";
import { draftLive, draftClock, draftPlayer, onClockOffers, incomingCall } from "../engine/draftClock.js";
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
    <div className={`dd-prow${drafting ? " live" : ""}${drafted ? " gone" : ""}`} onClick={() => openPlayer(p.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && openPlayer(p.id)} aria-label={`${p.name}, ${p.pos}, Central Scouting ${csRank(p)}`}>
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
          <button key={x} className={`small${pos === x ? " primary" : ""}`} onClick={() => { setPos(x); setN(PAGE); }}>{x === "all" ? "All" : x}</button>
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

function MyListPanel({ onDraft, canDraft, compact = false }) {
  const { league, commit } = useGame();
  const phone = usePhone();
  const ids = myList(league).ids.filter((id) => league.players[id]);
  const ps = ids.map((id) => league.players[id]);
  const shown = compact ? ps.filter((p) => p.tid === -2).slice(0, 6) : ps;
  return (
    <div className="panel">
      <h3>Your list <span className="right muted small" style={{ textTransform: "none", letterSpacing: 0 }}>{ps.filter((p) => p.tid === -2).length} available</span></h3>
      {!ps.length && <div className="dim small">Star prospects on the Big Board (☆) to build your own ranking. It stays in the order you set.</div>}
      <div className="list">
        {shown.map((p) => {
          const i = ids.indexOf(p.id);
          const read = prospectRead(league, p);
          const taken = p.tid !== -2;
          const slot = taken && league.draft ? league.draft.slots.find((s) => s.pid === p.id) : null;
          return (
            <div className={`item small mlrow${taken ? " gone" : ""}`} key={p.id}>
              <b className="mono">{i + 1}.</b>
              <span className="posbadge">{p.pos}</span>
              <PlayerName p={p} />
              <span className="muted">CS #{csRank(p)}</span>
              <span className="mlread">
                <Read label="OVR" txt={read.ovr} />
                <Read label="POT" txt={read.pot} />
              </span>
              <span className="mlact">
                {taken ? (
                  <span className="muted">{slot ? `#${slot.overall} ${league.teams[slot.owner].abbr}` : "Drafted"}</span>
                ) : (
                  <>
                    {!compact && <button className="tiny ghost" aria-label="Move up" disabled={i === 0} onClick={() => { moveOnMyList(league, p.id, -1); commit(); }}>▲</button>}
                    {!compact && <button className="tiny ghost" aria-label="Move down" disabled={i === ids.length - 1} onClick={() => { moveOnMyList(league, p.id, 1); commit(); }}>▼</button>}
                    {onDraft && (phone && canDraft ? <ArmButton onGo={() => onDraft(p)} /> : <button className="tiny primary" disabled={!canDraft} onClick={() => onDraft(p)}>Draft</button>)}
                  </>
                )}
                {!compact && <button className="tiny ghost" aria-label="Remove from list" onClick={() => { toggleMyList(league, p.id); commit(); }}>✕</button>}
              </span>
            </div>
          );
        })}
      </div>
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
          No points to spend. Before each season send every scout to a region (the Assignments tab). Through the season they file reports there on their own: higher-graded scouts read closer, reach full workups sooner and find the late-ranked gems. At the Combine you get interviews and private workouts.
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

// ---------- Scouting Combine ----------

// Find a prospect (the football game's Combine search): any player in this class by name or
// junior club, with his Central Scouting rank (and how it moved from the midterm) and his
// combine results, or a note that he wasn't invited.
function CombineSearch() {
  const { league } = useGame();
  const [q, setQ] = useState("");
  const n = q.trim().toLowerCase();
  const hits = n.length >= 2 ? (league.draftClass || []).map((id) => league.players[id]).filter((p) => p && `${p.name} ${p.bio?.team || ""}`.toLowerCase().includes(n)).sort((a, b) => csRank(a) - csRank(b)).slice(0, 8) : [];
  return (
    <div className="panel rk-csearch">
      <h3>Find a prospect <span className="right muted small" style={{ textTransform: "none", letterSpacing: 0 }}>Central Scouting rank and combine results</span></h3>
      <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or junior club…" aria-label="Search the draft class" />
      {n.length >= 2 && !hits.length && <div className="muted small" style={{ marginTop: 6 }}>Nobody in this class matches.</div>}
      {hits.map((p) => {
        const mid = p.cs?.mid, fin = p.cs?.final, mv = mid && fin ? mid - fin : 0;
        return (
          <div key={p.id} className="rk-csearch-row">
            <div className="rk-csearch-who">
              <span className="posbadge">{p.pos}</span><PlayerName p={p} />
              <span className="muted small">{p.bio?.team}{p.bio?.lg ? ` (${p.bio.lg})` : ""}{p.tid !== -2 ? " · drafted" : ""}</span>
              {p.combine ? <span className={`grade sm ${gradeClass(p.combine.grade)}`} title="Combine grade">{p.combine.grade}</span> : <span className="pill" title="Not one of the combine invitees">No invite</span>}
              <b className={`rk-csearch-cs${mv > 0 ? " up" : mv < 0 ? " down" : ""}`} title="Central Scouting: midterm → final">{mid && fin ? `CS #${mid} → #${fin}${mv > 0 ? ` ▲${mv}` : mv < 0 ? ` ▼${-mv}` : " ="}` : `CS #${csRank(p)}`}</b>
            </div>
            {p.combine && <div className="rk-csearch-tests">{COMBINE_TESTS.map((t) => <span key={t.k} className={p.combine.pcts[t.k] >= 0.9 ? "top" : ""} title={`${t.name}${t.unit ? ` (${t.unit})` : ""}: ${Math.round(p.combine.pcts[t.k] * 100)}th percentile`}>{t.short} <b>{p.combine.tests[t.k].toFixed(t.dp)}</b></span>)}{p.scout?.intv && <span title={p.scout.intv.note}>Interview <b className={`grade sm ${gradeClass(p.scout.intv.grade)}`}>{p.scout.intv.grade}</b></span>}</div>}
          </div>
        );
      })}
    </div>
  );
}

function CombineView() {
  const { league, commit, toast } = useGame();
  const d = league.draft;
  const live = atCombine(league);
  const invited = classPool(league).filter((p) => p.combine).sort((a, b) => csRank(a) - csRank(b));
  const allInvited = (league.draftClass || []).map((id) => league.players[id]).filter((p) => p?.combine).sort((a, b) => csRank(a) - csRank(b));
  const rows = live ? invited : allInvited;
  const [n, setN] = useState(40);
  const interview = (p) => {
    const r = interviewProspect(league, p.id);
    toast(r.msg);
    commit();
  };
  return (
    <div className="stack">
      <CombineSearch />
      <div className="dgrid">
        <div className="panel">
          <h3>Results <span className="right muted small" style={{ textTransform: "none", letterSpacing: 0 }}>{COMBINE_INVITES} invited · final Central Scouting order</span></h3>
          <div className="tablewrap">
            <table className="t combine">
              <thead>
                <tr>
                  <th>CS</th><th>Player</th><th>Size</th>
                  {COMBINE_TESTS.map((t) => <th key={t.k} className="num" title={`${t.name}${t.unit ? ` (${t.unit})` : ""}${t.lowGood ? ", lower is better" : ""}`}>{t.short}</th>)}
                  <th>Grade</th><th>Interview</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, n).map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{csRank(p)} <Arrow p={p} /></td>
                    <td><PlayerName p={p} /> <span className="posbadge">{p.pos}</span></td>
                    <td className="nowrap">{p.bio ? `${fmtHeight(p.bio.ht)} ${p.bio.wt}` : ""}</td>
                    {COMBINE_TESTS.map((t) => (
                      <td key={t.k} className={`num${p.combine.pcts[t.k] >= 0.9 ? " top" : ""}`}>{p.combine.tests[t.k].toFixed(t.dp)}</td>
                    ))}
                    <td><span className={`grade ${gradeClass(p.combine.grade)}`}>{p.combine.grade}</span></td>
                    <td className="nowrap">
                      {p.scout?.intv ? (
                        <span title={p.scout.intv.note}>Work ethic <span className={`grade ${gradeClass(p.scout.intv.grade)}`}>{p.scout.intv.grade}</span></span>
                      ) : live ? (
                        <button className="tiny" disabled={!(d.interviewsLeft > 0)} onClick={() => interview(p)}>Interview</button>
                      ) : (
                        <span className="dim">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > n && <div style={{ marginTop: 10 }}><button className="small" onClick={() => setN(n + 30)}>Show more ({rows.length - n} left)</button></div>}
          <div className="muted tiny" style={{ marginTop: 6 }}>Highlighted results are in the top 10%. Hover a column for the test; pro agility is timed, so lower is better.</div>
        </div>
        <div className="stack">
          {live && (
            <div className="panel hot">
              <h3>Before the draft</h3>
              <div className="small">Interviews left: <b>{d.interviewsLeft}</b></div>
              <div className="muted small" style={{ margin: "6px 0 10px" }}>Interviews read a prospect's work ethic, which tends to go with how fast he develops. Then head to the draft floor.</div>
              <button className="primary" onClick={() => { openDraftFloor(league); commit(); }}>Start the draft →</button>
            </div>
          )}
          <div className="panel">
            <h3>Draft buzz</h3>
            <div className="stack" style={{ gap: 6 }}>
              {(d?.buzz || []).map((x, i) => (
                <div key={i} className={`wire buzz ${x.kind}`}>
                  <span className="wtag">{x.kind === "up" ? "RISING" : x.kind === "down" ? "FALLING" : "TOP TEST"}</span>
                  <span className="small">{x.text}</span>
                </div>
              ))}
              {!d?.buzz?.length && <div className="dim small">No buzz yet.</div>}
            </div>
          </div>
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

// What your roster is short of, by position, most urgent first (teamPlanning.teamNeeds).
const URGENCY = [[50, "High", "#ef4444"], [25, "Medium", "#f97316"], [8, "Low", "#eab308"], [-1, "Set", "#22c55e"]];
function NeedsPanel() {
  const { league } = useGame();
  const needs = teamNeeds(league, league.teams[league.userTid]);
  return (
    <div className="panel gg-needs">
      <h3>Your needs <span className="right muted small" style={{ textTransform: "none", letterSpacing: 0 }}>NHL roster today</span></h3>
      <div className="gg-needs-list">
        {needs.map((n) => { const [, word, col] = URGENCY.find(([min]) => n.score > min); return (
          <div key={n.pos} className="gg-needs-row" title={`${n.have} healthy of ${n.target} wanted · ${n.role}`}>
            <span className="gg-pos" style={{ background: POS_COLOR[n.pos] }}>{n.pos}</span>
            <b style={{ color: col }}>{word}</b>
            <i className="gg-needs-bar"><i style={{ width: `${Math.max(4, n.score)}%`, background: col }} /></i>
            <small>{n.reasons.length ? n.reasons.join(" · ") : `${n.have}/${n.target} healthy · set`}</small>
          </div>
        ); })}
      </div>
    </div>
  );
}

// The latest selections, newest first; yours stand out.
function RecentPicks({ n = 8 }) {
  const { league } = useGame();
  const d = league.draft;
  const made = (d?.slots || []).slice(0, d?.idx || 0).filter((s) => s.pid).slice(-n).reverse();
  return (
    <div className="panel gg-recent">
      <h3>Recent picks <span className="right muted small" style={{ textTransform: "none", letterSpacing: 0 }}>{d?.idx || 0} made</span></h3>
      {!made.length && <div className="dim small">No picks yet.</div>}
      <div className="gg-recent-list">
        {made.map((s) => { const p = league.players[s.pid]; const t = league.teams[s.owner]; return p ? (
          <div key={s.overall} className={`gg-recent-row${s.owner === league.userTid ? " mine" : ""}`}>
            <span className="gg-recent-n">#{s.overall}</span>
            <TeamBadge team={t} size={18} decorative />
            <b className="gg-recent-t">{t.abbr}</b>
            <span className="gg-recent-p"><PlayerName p={p} /></span>
            <span className="gg-pos" style={{ background: POS_COLOR[p.pos] }}>{p.pos}</span>
            {s.grade && <span className={`grade sm ${gradeClass(s.grade)}`} title={pickTake(s.grade, s.overall, s.csr)}>{s.grade}</span>}
          </div>
        ) : null; })}
      </div>
    </div>
  );
}

// ---------- Draft floor ----------

// The floor while the draft runs (Gridiron's Draft Day): the ticker, the On the Clock stage with
// the phone, your points and picks on one slim line, the board, and Up next, recent picks, your
// list, your needs and the full order beside it. Once the last pick is in: the class grades.
function DraftFloor({ act, onDraft, canDraft, panel, setPanel, panelEl, phone, onRecap }) {
  const { league } = useGame();
  const user = league.teams[league.userTid];
  const d = league.draft;
  const done = draftDone(league);
  const live = draftLive(league);
  const slot = live ? currentSlot(league) : null;
  const onClock = !!slot && slot.owner === user.id;
  const [roundSel, setRound] = useState(null);
  const [fold, setFold] = useState(false);
  const round = roundSel ?? (slot ? slot.round : DRAFT_ROUNDS);
  const offers = onClock ? onClockOffers(league) : [];
  const call = onClock && !panel && !league.moments?.length ? incomingCall(league) : null;
  const forPick = (o) => setPanel(panel?.kind === "for" && panel.overall === o ? null : { kind: "for", overall: o });
  const tradeUp = () => setPanel(panel?.kind === "up" ? null : { kind: "up" });
  const shop = (o) => setPanel(panel?.kind === "shop" && panel.overall === o ? null : { kind: "shop", overall: o });
  const slotLine = (s) => {
    const p = s.pid ? league.players[s.pid] : null;
    const now = slot && s.overall === slot.overall;
    return (
      <div key={s.overall} className={`dslot${s.owner === user.id ? " mine" : ""}${now ? " now" : ""}`}>
        <span className="dnum">{s.overall}</span>
        <TeamBadge team={league.teams[s.owner]} size={22} />
        <span className="dslot-main">
          {p ? <><PlayerName p={p} /> <span className="dim small">{p.pos}</span></> : now ? <b>On the clock</b> : <span className="dim">{league.teams[s.owner].abbr} · round {s.round}, pick {((s.overall - 1) % 32) + 1}</span>}
          {s.orig !== s.owner && <span className="dim small"> (from {league.teams[s.orig].abbr})</span>}
        </span>
        {s.pid && <ValueTag overall={s.overall} csr={s.csr} small />}
        {s.grade && <span className={`grade sm ${gradeClass(s.grade)}`} title={pickTake(s.grade, s.overall, s.csr)}>{s.grade}</span>}
      </div>
    );
  };
  const grades = done ? league.teams.map((t) => ({ t, g: teamDraftGrade(league, t.id) })).filter((x) => x.g) : [];
  const order = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D"];
  grades.sort((a, b) => order.indexOf(a.g) - order.indexOf(b.g));
  const mineBox = onClock && (
    <div className="dd-otc-war">
      <WarRoom />
      <OffersFold offers={offers} open={fold} onToggle={() => setFold((v) => !v)} />
    </div>
  );

  return (
    <div className="stack dd-floor">
      {live && <DraftTicker />}
      {live && !phone && (
        <OnTheClock onForPick={forPick} onTradeUp={tradeUp} onShop={shop} forOpen={panel?.kind === "for" && panel.overall === slot.overall} upOpen={panel?.kind === "up"}>
          {mineBox}
        </OnTheClock>
      )}
      {live && phone && mineBox && <div className="panel dd-mine-phone">{mineBox}</div>}
      {!phone && panelEl}
      {call && <IncomingCall o={call} phone={phone} />}
      {live && (phone ? <DraftStatusLine /> : (
        <div className="dd-slim">
          <PickTracker years={[d.year]} />
        </div>
      ))}
      {done && (
        <div className="otc you dd-done">
          <div>
            <div className="otc-k">Draft complete</div>
            <div className="otc-t">Your new prospects are in the minors.</div>
            {teamDraftGrade(league, user.id) && <div className="small muted">Analysts give your class a <b>{teamDraftGrade(league, user.id)}</b>. The recap has every pick's real ratings.</div>}
          </div>
          <div style={{ flex: 1 }} />
          <div className="row">
            <button onClick={onRecap}>Draft recap</button>
            <button className="primary" onClick={act.toResign}>Continue to re-signing →</button>
          </div>
        </div>
      )}
      {done && <PickTracker years={[d.year]} />}
      <div className="dgrid">
        {!done ? <Board onDraft={onDraft} canDraft={canDraft} availableOnly title="Best available" /> : (
          <div className="panel">
            <h3>Draft grades</h3>
            <div className="muted small" style={{ marginBottom: 8 }}>Instant grades compare where each player went with where Central Scouting had him. Analysts don't know what your scouts know. The <button className="link" onClick={onRecap}>draft recap</button> shows how each class really graded out.</div>
            <div className="ggrid">
              {grades.map(({ t, g }) => (
                <div key={t.id} className={`gcell${t.id === user.id ? " mine" : ""}`}><TeamBadge team={t} size={22} /> <b>{t.abbr}</b> <span className={`grade ${gradeClass(g)}`}>{g}</span></div>
              ))}
            </div>
          </div>
        )}
        <div className="stack">
          {live && <DraftQueue onForPick={forPick} onShop={shop} />}
          <RecentPicks />
          {!done && <MyListPanel onDraft={onDraft} canDraft={canDraft} compact />}
          <NeedsPanel />
          {d.lottery?.draws?.length > 0 && d.idx < 32 && (
            <div className="panel">
              <h3>Draft lottery</h3>
              <div className="stack" style={{ gap: 6 }}>
                {d.lottery.draws.map((x, i) => (
                  <span key={i} className="row small" style={{ gap: 6 }}>
                    <b>#{i + 1}</b> <TeamBadge team={league.teams[x.id]} size={20} /> <TeamName tid={x.id} />
                    <span className="muted small">{x.from > x.to ? `jumped from ${x.from}` : x.to === 1 ? "held the top spot" : "kept its spot"}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="panel">
            <h3>Draft order</h3>
            <div className="row" style={{ gap: 4, marginBottom: 8 }}>
              {Array.from({ length: DRAFT_ROUNDS }, (_, i) => i + 1).map((r) => (
                <button key={r} className={`small${round === r ? " primary" : ""}`} onClick={() => setRound(r)}>{phone ? `R${r}` : `Round ${r}`}</button>
              ))}
            </div>
            <div className="dorder">{d.slots.filter((s) => s.round === round).map(slotLine)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Page ----------

// A save picked up mid-draft opens paused (press Resume), as in Gridiron; navigating away and back
// in the same visit keeps the clock as you left it.
const SESSION = Math.random().toString(36).slice(2, 10);

export default function DraftPage({ act, want, onView }) {
  const { league, commit, toast } = useGame();
  const phone = usePhone();
  const user = league.teams[league.userTid];
  const inDraft = league.phase === "draft" && !!league.draft;
  const combine = atCombine(league);
  const hasCombine = (league.draftClass || []).some((id) => league.players[id]?.combine);
  const defaultView = inDraft ? (combine ? "combine" : "floor") : league.phase === "preseason" ? "regions" : phone ? "hq" : "board";
  // A tab you pick sticks until the draft moves on (combine → draft floor → done).
  const stageKey = `${league.phase}|${league.draft?.stage || ""}`;
  const [sel, setSel] = useState({ v: null, k: stageKey });
  const viewSel = sel.k === stageKey ? sel.v : null;
  const setView = (v) => setSel({ v, k: stageKey });
  const views = [
    inDraft && !combine && ["floor", "Draft floor"],
    ["board", "Big Board"],
    ["list", `Your list (${myList(league).ids.length})`],
    ["myscouts", "Your scouts"],
    hasCombine && ["combine", "Combine"],
    ["scouts", "Scouts"],
    ["regions", "Scout assignments"],
    ["recap", "Draft recap"],
    phone && ["hq", "HQ"],
  ].filter(Boolean);
  const view = views.some(([k]) => k === viewSel) ? viewSel : defaultView;
  // The section header's tabs (Scouting / Draft / Draft Recap) pick a view from outside.
  useEffect(() => { if (want?.v) setView(want.v === "floor" && !(inDraft && !combine) ? (combine ? "combine" : "board") : want.v); }, [want?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onView?.(view); }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  const year = inDraft ? league.draft.year : league.draftClassYear;
  const done = inDraft && draftDone(league);
  const live = draftLive(league);
  const slot = live ? currentSlot(league) : null;
  const onClock = !!slot && slot.owner === user.id;
  // The tracker: this draft while it runs (or at the combine), otherwise every year you hold picks in.
  const trackerYears = inDraft ? [league.draft.year] : [...new Set(league.draftPicks.filter((p) => p.owner === user.id).map((p) => p.year))].sort((a, b) => a - b);
  // The phone: one trade panel at a time ({ kind: "for" | "up" | "shop", overall }); the clock holds while it's open.
  const [panel, setPanel] = useState(null);
  // "The pick is in": the overall pick being announced.
  const [announce, setAnnounce] = useState(null);

  useEffect(() => {
    if (!live) return;
    const c = draftClock(league);
    if (c.session && c.session !== SESSION && !c.paused) {
      c.paused = true;
      toast("Picking the draft up where you left it. It's paused: press Resume.", 5000);
    }
    c.session = SESSION;
  }, [live]); // eslint-disable-line react-hooks/exhaustive-deps
  // Draft-day truth for the recap, also for picks simmed from the top bar (and, until the next
  // season starts, for a class archived before anyone looked).
  useEffect(() => { if (stampDraftTruth(league)) commit(3000); });
  // The recap opens on its own once the last pick is in.
  useEffect(() => {
    if (done && !league.draft.recapShown) {
      league.draft.recapShown = true;
      setView("recap");
      commit();
    }
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!live) setPanel(null); }, [live]);

  const draft = (p) => {
    if (!onClock || !draftPlayer(league, p.id)) return;
    setPanel(null);
    commit();
  };
  const onPick = (r) => {
    if (r.slot.round === 1 && r.slot.owner !== league.userTid && league.draft?.clock?.speed !== "Fast") setAnnounce(r.slot.overall);
    else setAnnounce(null);
  };
  const closePanel = () => setPanel(null);
  const panelEl = panel && live && (
    panel.kind === "for" ? <ForPickPanel key={`for${panel.overall}`} overall={panel.overall} phone={phone} onDone={closePanel} onClose={closePanel} />
      : panel.kind === "up" ? <TradeUpPanel phone={phone} onDone={closePanel} onClose={closePanel} />
      : <ShopPanel key={`shop${panel.overall}`} overall={panel.overall} phone={phone} onDone={closePanel} onClose={closePanel} />
  );

  return (
    <div className={`stack gg-draft${live ? " dd-running" : ""}`}>
      {!onView && <div className="pagehead">
        <h2>{combine ? `${year} Scouting Combine` : `${year} NHL Entry Draft`}</h2>
        {slot && <span className="pill on">Round {slot.round} of {DRAFT_ROUNDS}</span>}
        {!inDraft && <span className="pill">{DRAFT_ROUNDS} rounds · {DRAFT_ROUNDS * 32} picks</span>}
        {!live && <div className="scout-budget"><span>REPORTS FILED</span><strong>{user.surveyLog?.year === league.draftClassYear ? user.surveyLog.filed : 0}</strong><small>by your scouts in their regions</small></div>}
      </div>}
      {onView && slot && <div className="pagehead"><span className="pill on">Round {slot.round} of {DRAFT_ROUNDS}</span></div>}
      {phone && view !== "floor" && view !== "recap" && view !== "combine" ? (() => {
        // Phones: three segments (HQ, Board, Scouts), each with its own small chips.
        const seg = view === "hq" ? "hq" : view === "board" || view === "list" ? "board" : "scouts";
        const subs = seg === "board" ? [["board", "Big Board"], ["list", `Your list (${myList(league).ids.length})`]] : seg === "scouts" ? [["regions", "Assignments"], ["myscouts", "Reports"], ["scouts", "Staff"]] : [];
        return (
          <>
            <PageHead label="Scouting" pills={[["hq", "HQ", seg === "hq"], ["board", "Board", seg === "board"], ["scouts", "Scouts", seg === "scouts"]]} onPick={(k) => setView(k === "scouts" ? "regions" : k)}
              title={seg === "hq" ? "Scouting" : seg === "board" ? "Big board" : "Your scouts"} sub={`${year} draft class · ${DRAFT_ROUNDS} rounds`} />
            {subs.length > 0 && <div className="rk-subchips">{subs.map(([k, l]) => <button key={k} className={view === k ? "on" : ""} onClick={() => setView(k)}>{l}</button>)}</div>}
          </>
        );
      })() : <>{phone && <PageHead title={view === "recap" ? "Draft recap" : combine ? "Scouting combine" : "Draft"} sub={slot ? `${year} draft · round ${slot.round} of ${DRAFT_ROUNDS}` : `${year} draft · ${DRAFT_ROUNDS} rounds`} />}<div className="tabs">
        {views.filter(([k]) => !onView || (view === "recap" ? false : view === "floor" || view === "combine" ? k === "floor" || k === "combine" : !["floor", "recap", "combine"].includes(k))).map(([k, label]) => (
          <button key={k} className={view === k ? "on" : ""} onClick={() => setView(k)}>{label}</button>
        ))}
      </div></>}
      {live && <ClockBar phone={phone} hold={!!league.moments?.length || !!panel} onPick={onPick} onForPick={(o) => setPanel({ kind: "for", overall: o })} onTradeUp={() => setPanel({ kind: "up" })} />}
      {live && phone && panelEl}
      {announce != null && <PickIsIn overall={announce} onDone={() => setAnnounce(null)} />}

      {view === "floor" && <DraftFloor act={act} onDraft={draft} canDraft={onClock} panel={panel} setPanel={setPanel} panelEl={panelEl} phone={phone} onRecap={() => setView("recap")} />}
      {view === "myscouts" && <ScoutBoard />}
      {view === "board" && (
        <>
          {!inDraft && !phone && <ScoutingHQ onBoard={() => setView("board")} onRegions={() => setView("regions")} onList={() => setView("list")} />}
          {!(live && phone) && <PickTracker years={trackerYears} />}
          {live && phone && <DraftStatusLine />}
          {!(live && phone) && <Legend />}
          <div className="dgrid">
            <Board onDraft={slot ? draft : null} canDraft={onClock} />
            <div className="stack">
              <MyListPanel compact />
              <ScoutSummary go={() => setView("scouts")} />
            </div>
          </div>
        </>
      )}
      {view === "hq" && <><ScoutingHQ onBoard={() => setView("board")} onRegions={() => setView("regions")} onList={() => setView("list")} /><PickTracker years={trackerYears} /></>}
      {view === "list" && <MyListPanel onDraft={slot ? draft : null} canDraft={onClock} />}
      {view === "combine" && <CombineView />}
      {view === "scouts" && <ScoutsView />}
      {view === "regions" && <RegionalScouting />}
      {view === "recap" && <DraftRecap />}
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
