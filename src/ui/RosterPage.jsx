import {buyoutSummary} from '../engine/capAccounting.js';
import { useCallUp } from "./CallUpFlow.jsx";
import Select from "./Select.jsx";
import {automaticallyHandleRoster,automaticRosterPlan} from "../engine/autoRoster.js";
import React, { useState } from "react";
import { useGame, Table, PlayerName, TeamBadge, Ovr, money, pct, signed, POS_ORDER } from "./common.jsx";
import { isGoalie, isDefense, capForYear, capFloorForYear, MAX_ROSTER, ARCHETYPES } from "../engine/constants.js";
import { capSpace, payroll, counts, sendDown, callUp, releasePlayer, canSendDown, rosterIssues, hasRoomFor, ensureMinimums, capYear, capFloorGap, onIR, IR_GAMES } from "../engine/roster.js";
import { designateLTIR, activateLTIR } from "../engine/operations.js";
import { ltirRelief } from "../engine/hockeyRules.js";
import Headshot from "./Headshot.jsx";
import AbilityChip from "./AbilityChip.jsx";
import { savePct, gaa } from "../engine/players.js";
import Icon from "./Icon.jsx";
import { shownRatings } from "../engine/draft.js";
import TrainingCamp from "./TrainingCamp.jsx";
import { DevChip } from "./scoutingBits.jsx";
import { ovrColor } from "./common.jsx";
import "./lines.css";

// Where each player sits on the line chart, so the roster reads in line order like the
// football depth chart: L1 LW, L1 C, L1 RW … P1 LD … the starter, then scratches by OVR.
const F_SLOTS = ["LW", "C", "RW"], D_SLOTS = ["LD", "RD"];
function lineSlots(team) {
  const m = {}, L = team?.lines;
  if (!L) return m;
  (L.F || []).forEach((line, i) => line.forEach((id, j) => { if (id && !m[id]) m[id] = { rank: i * 3 + j, label: `L${i + 1} ${F_SLOTS[j]}`, top: i < 2 }; }));
  (L.D || []).forEach((pair, i) => pair.forEach((id, j) => { if (id && !m[id]) m[id] = { rank: 20 + i * 2 + j, label: `P${i + 1} ${D_SLOTS[j]}`, top: i < 2 }; }));
  (L.G || []).forEach((id, i) => { if (id && !m[id]) m[id] = { rank: 40 + i, label: i === 0 ? "Starter" : "Backup", top: i === 0 }; });
  return m;
}
// Status badges beside a name (the football game's roster badges), so the whole roster reads
// at a glance: hurt (IR or out), LTIR, on waivers, a trade request, the last year of his deal
// (or an extension signed), a rookie, and your focus player.
export function rosterBadges(league, team, p) {
  const b = [];
  if (p.ltir) b.push(["rb-ltir", "LTIR", `Long-term injured reserve${p.injury > 0 ? `: out ${p.injury} more game${p.injury === 1 ? "" : "s"}` : ""}. His cap hit comes off the cap while he's out.`]);
  else if (p.injury > 0) b.push(["rb-inj", onIR(p) ? `IR ${p.injury}` : `OUT ${p.injury}`, `${p.injuryNote ? p.injuryNote[0].toUpperCase() + p.injuryNote.slice(1) : "Injured"}: out ${p.injury} game${p.injury === 1 ? "" : "s"}${onIR(p) ? ", on injured reserve (doesn't count against the 23)" : ""}.`]);
  if (p.waiverPending) b.push(["rb-wv", "WAIVERS", "On waivers: any club can claim him until the window closes."]);
  if (p.wantsTrade) b.push(["rb-tr", "TRADE REQ", "Has asked for a trade. Talk him down or shop him from Home."]);
  if (p.extension) b.push(["rb-ext", "EXTENDED", `Extended: ${p.extension.yrs} more year${p.extension.yrs === 1 ? "" : "s"} at ${money(p.extension.aav)} from next season.`]);
  else if (p.signed !== false && p.yrs <= 1 && team?.roster.includes(p.id)) b.push(["rb-exp", p.yrs === 0 ? "EXPIRED" : "EXPIRING", p.yrs === 0 ? "His contract is up: re-sign him or he reaches free agency." : "Contract year: the last season of his deal."]);
  if (p.rookie) b.push(["rb-rook", "ROOKIE", "First NHL season: Calder-eligible."]);
  if (team?.devPlan?.year === league.year && team.devPlan.focus === p.id) b.push(["rb-dev", "FOCUS", "Your focus player: a weekly chance of +1 OVR all season."]);
  return b;
}
function RosterBadges({ p, team }) {
  const { league } = useGame();
  const b = rosterBadges(league, team, p);
  if (!b.length) return null;
  return <span className="rk-rbadges">{b.map(([k, l, tip]) => <span key={k} className={`rk-rb ${k}`} title={tip}>{l}</span>)}</span>;
}
const lineRank = (slots, p) => slots[p.id]?.rank ?? 100 + (p.injury > 0 || p.ltir ? 50 : 0) + (99 - p.ovr) / 100;

// Phones get Gridiron's roster cards instead of the wide table: face, name and badges, his line
// spot (green in the top six / top four), age and contract, OVR with POT under it. One sort menu
// covers what the table's column headers do.
const DEV_RANK = { superstar: 3, star: 2, normal: 1, late: 0 };
const CARD_SORTS = [["line", "Line order"], ["ovr", "Overall"], ["pot", "Potential"], ["age", "Age"], ["cap", "Cap hit"], ["name", "Name"]];
function RosterCards({ rows, slots, team, sort }) {
  const { openPlayer } = useGame();
  const key = { line: (p) => lineRank(slots, p), ovr: (p) => -p.ovr, pot: (p) => -(p.pot || p.ovr), age: (p) => p.age, cap: (p) => -p.cap, name: (p) => p.name };
  const list = [...rows].sort((a, b) => { const x = key[sort](a), y = key[sort](b); return (typeof x === "string" ? x.localeCompare(y) : x - y) || b.ovr - a.ovr; });
  return (
    <div className="rk-rcards">
      {list.map((p) => {
        const s = slots[p.id], hurt = p.injury > 0 || p.ltir;
        return (
          <button type="button" key={p.id} className={`rk-rcard${s?.top && !hurt ? " top" : ""}${hurt ? " out" : ""}`} onClick={() => openPlayer(p.id)}>
            <span className="rk-rc-face"><Headshot team={team} p={p} size={36} decorative /></span>
            <span className="rk-rc-who">
              <span className="rk-rc-nm">{p.name}<AbilityChip p={p} /><RosterBadges p={p} team={team} /></span>
              <span className="rk-rc-meta"><span className="posbadge">{p.pos}</span><b className={`gg-ro-line${hurt ? " out" : s?.top ? " top" : !s ? " off" : ""}`}>{s?.label || (hurt ? "Out" : "Scratch")}</b><span>Age {p.age}</span><span>{money(p.cap)} · {p.yrs}y</span>{p.age <= 25 && p.dev && p.dev !== "normal" && <DevChip dev={p.dev} />}</span>
            </span>
            <span className="rk-rc-r"><b style={{ color: ovrColor(p.ovr) }}>{p.ovr}</b><small>POT {p.pot}</small></span>
          </button>
        );
      })}
      {!list.length && <div className="dim small" style={{ padding: 12 }}>Nobody matches.</div>}
    </div>
  );
}

export default function RosterPage() {
  const { league, commit, toast, ask } = useGame();
  const [cardSort, setCardSort] = useState("line");
  // The table opens calm (who, where he plays, rating, contract, points); the rest is one tap away.
  const [more, setMore] = useState(false);
  const MORE_KEYS = ["pos", "age", "pot", "type", "dev", "pm"];
  const calm = (cols) => (more ? cols : cols.filter((c) => !MORE_KEYS.includes(c.key)));
  const callUpFlow = useCallUp();
  const [query,setQuery]=useState(""),[position,setPosition]=useState("all");
  const user = league.teams[league.userTid];
  const [view, setView] = useState(league.phase === "preseason" && !(user.camp?.year === league.year && user.camp.games.length >= 4) ? "camp" : "roster");
  const shown = view === "camp" && league.phase !== "preseason" ? "roster" : view;
  const roster = user.roster.map((id) => league.players[id]).filter(Boolean);
  const minors = user.prospects.map((id) => league.players[id]).filter(Boolean);
  const c = counts(league, user);
  const issues = rosterIssues(league, user);
  const fits=p=>(position==="all" || p.pos===position) && p.name.toLowerCase().includes(query.toLowerCase());
  const slots = lineSlots(user);
  const injured = [...roster, ...minors].filter((p) => p.injury > 0 || p.ltir).sort((a, b) => b.injury - a.injury || b.ovr - a.ovr);
  const relief = ltirRelief(league, user);
  const ltirPool = roster.filter((p) => p.ltir).reduce((n, p) => n + p.cap, 0);
  const injuriesOff = league.settings?.injuries === false;
  const ltirOpen = league.phase === "regular" || league.phase === "preseason";
  const runOp = (r) => { toast(r.msg); if (r.ok) commit(); };

  const doSendDown = (p) => {
    if (!sendDown(league, user, p.id)) return toast("This player requires waivers. Open Front Office → Operations to manage waivers.");
    commit();
  };
  const doRelease = async (p) => {
    const dead = p.yrs > 0 && p.cap > 0 ? ` ${buyoutSummary(p,capYear(league))}` : "";
    if (!(await ask({ title: `Release ${p.name}?`, body: `He becomes a free agent.${dead}`, yes: "Release", danger: true }))) return;
    releasePlayer(league, user, p.id);
    commit();
  };
  const doCallUp = (p) => callUpFlow.start(p);

  // Name, X-Factor tag and a trade-request badge, so the whole roster reads at a glance.
  const nameCell = (p) => (
    <div className="player-cell">
      <span className="roster-sweater"><Headshot team={user} p={p} size={38} decorative /></span>
      <div>
        <PlayerName p={p} showInj={false} /><AbilityChip p={p} /><RosterBadges p={p} team={user} />
        <span className="player-detail">{p.pos} · {p.age} years{p.rookie ? " · Rookie" : ""}</span>
      </div>
    </div>
  );
  const lineCol = { key: "line", label: "Line", title: "Where he plays on your line chart", render: (p) => { const s = slots[p.id]; const hurt = p.injury > 0 || p.ltir; return <span className={`gg-ro-line${hurt ? " out" : s?.top ? " top" : !s ? " off" : ""}`} title={hurt && s ? "Injured: someone else dresses in his spot" : undefined}>{s?.label || (hurt ? "Out" : "Scratch")}</span>; }, sort: (p) => lineRank(slots, p) };
  const base = [
    { key: "name", label: "Player", render: (p) => nameCell(p), sort: (p) => p.name },
    { key: "pos", label: "Pos", render: (p) => <span className="posbadge">{p.pos}</span>, sort: (p) => POS_ORDER[p.pos] },
    lineCol,
    { key: "age", label: "Age", num: true, sort: (p) => p.age },
    { key: "ovr", label: "OVR", render: (p) => <Ovr v={p.ovr} src={p.src} />, sort: (p) => p.ovr },
    { key: "pot", label: "POT", num: true, sort: (p) => p.pot },
    { key: "type", label: "Type", render: (p) => <span className="small muted">{ARCHETYPES[p.type]?.name}</span>, sort: (p) => p.type },
    { key: "dev", label: "Dev", title: "Development trait (shown through age 25)", render: (p) => (p.age <= 25 && p.dev ? <DevChip dev={p.dev} /> : <span className="dim">—</span>), sort: (p) => (p.age <= 25 ? DEV_RANK[p.dev] ?? 1 : -1) },
    { key: "cap", label: "Cap Hit", num: true, render: (p) => money(p.cap), sort: (p) => p.cap },
    { key: "yrs", label: "Yrs", num: true, sort: (p) => p.yrs, title: "Contract years remaining (including this season)" },
  ];
  const skaterStats = [
    { key: "gp", label: "GP", num: true, render: (p) => p.stats.gp, sort: (p) => p.stats.gp },
    { key: "g", label: "G", num: true, render: (p) => p.stats.g, sort: (p) => p.stats.g },
    { key: "a", label: "A", num: true, render: (p) => p.stats.a, sort: (p) => p.stats.a },
    { key: "pts", label: "P", num: true, render: (p) => p.stats.pts, sort: (p) => p.stats.pts },
    { key: "pm", label: "+/-", num: true, render: (p) => signed(p.stats.pm), sort: (p) => p.stats.pm },
  ];
  const goalieStats = [
    { key: "gp", label: "GP", num: true, render: (p) => p.stats.gp, sort: (p) => p.stats.gp },
    { key: "rec", label: "W-L-OT", render: (p) => `${p.stats.w}-${p.stats.l}-${p.stats.otl}` },
    { key: "sv", label: "SV%", num: true, render: (p) => pct(savePct(p.stats)), sort: (p) => savePct(p.stats) },
    { key: "gaa", label: "GAA", num: true, render: (p) => gaa(p.stats).toFixed(2), sort: (p) => gaa(p.stats) },
  ];
  const actions = {
    key: "act",
    label: "",
    render: (p) => (
      <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
        <button className="tiny" disabled={!canSendDown(p)} title={canSendDown(p) ? "Send to the minors" : "Waivers or a clause prevents direct assignment"} onClick={() => doSendDown(p)}>↓ Minors</button>
        <button className="tiny danger" onClick={() => doRelease(p)}>Release</button>
      </span>
    ),
  };

  const groups = [
    ["Forwards", roster.filter((p) => !isGoalie(p.pos) && !isDefense(p.pos)), skaterStats],
    ["Defense", roster.filter((p) => isDefense(p.pos)), skaterStats],
    ["Goalies", roster.filter((p) => isGoalie(p.pos)), goalieStats],
  ];

  return (
    <div className="stack gg-roster">
      {callUpFlow.element}
      <div className="gg-pagehead"><div><h2>Roster</h2><div className="gg-status">{user.city} {user.name} · manage the people who define your season</div></div>
        <div className="gg-tiles"><div><small>ACTIVE</small><b>{c.active}<span className="dim">/{MAX_ROSTER}</span></b></div><div><small>F / D / G</small><b>{c.F}/{c.D}/{c.G}</b></div><div><small>CAP SPACE</small><b style={{color:capSpace(league,user)>=0?"#22c55e":"#ef4444"}}>{money(capSpace(league,user))}</b></div><div><small>INJURED</small><b style={{color:roster.filter(p=>p.injury>0).length?"#ef4444":"#22c55e"}}>{roster.filter(p=>p.injury>0).length}</b></div></div></div>
      {issues.length > 0 && (
        <div className="notice warn">
          {issues.map((i) => <div key={i}>{i}</div>)}
          <button className="small" style={{marginTop:10}} onClick={async()=>{const plan=automaticRosterPlan(league,user),waivers=plan.moves.filter(p=>p.waivers);if(waivers.length && !await ask({title:"Automatically handle roster?",body:`Selected by lowest overall and positional surplus: ${plan.moves.map(p=>`${p.name} (${p.pos}, ${p.ovr})`).join(", ")}. ${waivers.map(p=>p.name).join(", ")} require waivers and may be claimed by another club. This action resolves the claim window immediately without skipping games.`,yes:"Handle assignments",danger:true}))return;const r=automaticallyHandleRoster(league,user,{allowWaivers:true});commit();toast(r.msg,10000);}}>Automatically handle</button><p className="small muted">Assigns eligible excess players by lowest overall while keeping positional depth. Reviews required waiver assignments before resolving them. No-movement clauses and cap rules remain in effect.</p>
          {issues.some((i) => i.startsWith("Need")) && (
            <button className="small" style={{ marginTop: 6 }} onClick={() => { ensureMinimums(league, user, { notify: true }); commit(); }}>Auto-fill with call-ups</button>
          )}
        </div>
      )}
      {capFloorGap(league, user) > 0 && (
        <div className="notice">
          You're {money(capFloorGap(league, user))} under the {money(capFloorForYear(capYear(league)))} cap floor. NHL teams have to spend at least that much; sign free agents or trade for salary to get there.
        </div>
      )}
      <div className="gg-chips gg-ro-tabs" role="tablist" aria-label="Roster views">
        {[["roster", `NHL Roster (${c.active}/${MAX_ROSTER})`], ["minors", `Minors & Prospects (${minors.length})`], ["injured", `Injured & LTIR (${injured.length})`], ["contracts", "Contracts"], ...(league.phase === "preseason" ? [["camp", "Preseason games"]] : [])].map(([k, l]) => <button key={k} role="tab" aria-selected={shown === k} className={shown === k ? "on" : ""} onClick={() => setView(k)}>{l}</button>)}
      </div>

      {shown !== "camp" && <div className="roster-controls"><label className="roster-search"><Icon name="search" size={16}/><input aria-label="Find roster player" placeholder="Find a player…" value={query} onChange={e=>setQuery(e.target.value)}/></label><Select aria-label="Filter roster position" value={position} onChange={e=>setPosition(e.target.value)}><option value="all">All positions</option>{["C","LW","RW","LD","RD","G"].map(pos=><option key={pos}>{pos}</option>)}</Select>{more && <span className="muted small rk-rlegend">Click a player to open his profile. <span className="gg-xf">XF</span> EA X-Factor · <span className="rk-rb rb-inj">OUT</span> injured · <span className="rk-rb rb-ltir">LTIR</span> · <span className="rk-rb rb-wv">WAIVERS</span> · <span className="rk-rb rb-tr">TRADE REQ</span> · <span className="rk-rb rb-exp">EXPIRING</span> · <span className="rk-rb rb-rook">ROOKIE</span></span>}{shown === "roster" && <button type="button" className="rk-morecols" aria-pressed={more} onClick={() => setMore((v) => !v)}>{more ? "Fewer columns" : "More columns"}</button>}</div>}
      {shown === "camp" && <TrainingCamp />}
      {shown === "roster" && <label className="rk-rc-sort">Sort <Select value={cardSort} onChange={(e) => setCardSort(e.target.value)} aria-label="Sort roster">{CARD_SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>}
      {shown === "roster" &&
        groups.map(([title, rows, stats]) => (
          <div key={title}>
            <div className="gg-roster-h"><b>{title}</b><span>{rows.filter(fits).length}</span></div>
            <div className="rk-rtable"><Table columns={calm([...base, ...stats, actions])} rows={rows.filter(fits)} initialSort={{ key: "line", dir: "asc" }} /></div>
            <RosterCards rows={rows.filter(fits)} slots={slots} team={user} sort={cardSort} />
          </div>
        ))}

      {shown === "minors" && (
        <>
          <div className="muted small">AHL players use a buried-contract cap calculation. Entry-level term depends on age; rights expiry depends on the player's league. Front Office → Operations manages assignments and waivers.</div>
          <Table
            columns={[
              { key: "name", label: "Player", render: (p) => nameCell(p), sort: (p) => p.name },
              { key: "pos", label: "Pos", render: (p) => <span className="posbadge">{p.pos}</span>, sort: (p) => POS_ORDER[p.pos] },
              { key: "age", label: "Age", num: true, sort: (p) => p.age },
              { key: "ovr", label: "OVR", render: (p) => <Ovr v={p.ovr} />, sort: (p) => p.ovr },
              { key: "pot", label: "POT", num: true, render: (p) => p.pot, sort: (p) => p.pot },
              { key: "draft", label: "Drafted", render: (p) => (p.draft ? `${p.draft.year} R${p.draft.round} #${p.draft.pick}` : <span className="dim">—</span>) },
              { key: "k", label: "Contract", render: (p) => (p.signed ? `${money(p.cap)} × ${p.yrs}` : <span className="pill">Unsigned</span>) },
              {
                key: "act",
                label: "",
                render: (p) => (
                  <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                    <button className="tiny" onClick={() => doCallUp(p)}>↑ Call up</button>
                    <button className="tiny danger" onClick={() => doRelease(p)}>Release</button>
                  </span>
                ),
              },
            ]}
            rows={minors.filter(fits)}
            initialSort={{ key: "pot", dir: "desc" }}
            empty="No players in the minors."
          />
        </>
      )}

      {shown === "injured" && (
        <>
          <div className="gg-tiles gg-ro-inj-tiles">
            <div><small>OUT</small><b style={{ color: injured.length ? "#ef4444" : "#22c55e" }}>{injured.length}</b></div>
            <div><small>ON LTIR</small><b>{injured.filter((p) => p.ltir).length}</b></div>
            <div><small>LTIR RELIEF</small><b style={{ color: relief > 0 ? "#22c55e" : undefined }}>{relief > 0 ? money(relief) : "None"}</b></div>
            <div><small>ACTIVE</small><b>{c.active}<span className="dim">/{MAX_ROSTER}</span></b></div>
          </div>
          <div className="muted small">Players out {IR_GAMES} or more games go on injured reserve and don't count against the {MAX_ROSTER}-man limit. Out 10 games or more, a player can go on long-term injured reserve: his cap hit comes off the cap while he's out, less whatever cap room you had when he went on. He stays at least 24 days and 10 games.</div>
          {ltirPool > 0 && <div className="small">LTIR: {money(ltirPool)} in cap hits, less the {money(user.ltirUnused || 0)} of cap room you had when the first player went on, leaves <b className={relief > 0 ? "good" : ""}>{relief > 0 ? `${money(relief)} of relief` : "no relief"}</b>{league.phase === "playoffs" ? " (none in the playoffs)" : ""}.</div>}
          {injuriesOff && <div className="notice">Injuries are turned off in Settings, so nobody is hurt.</div>}
          <Table
            columns={[
              { key: "name", label: "Player", render: (p) => nameCell(p), sort: (p) => p.name },
              { key: "pos", label: "Pos", render: (p) => <span className="posbadge">{p.pos}</span>, sort: (p) => POS_ORDER[p.pos] },
              { key: "ovr", label: "OVR", render: (p) => <Ovr v={p.ovr} src={p.src} />, sort: (p) => p.ovr },
              { key: "inj", label: "Injury", render: (p) => <span className="gg-ro-injury">{p.injuryNote ? p.injuryNote[0].toUpperCase() + p.injuryNote.slice(1) : p.injury > 0 ? "Undisclosed" : "Recovered"}</span>, sort: (p) => p.injuryNote || "" },
              { key: "out", label: "Games left", num: true, render: (p) => (p.injury > 0 ? <b className="bad">{p.injury}</b> : <span className="good">Ready</span>), sort: (p) => p.injury },
              { key: "status", label: "Status", render: (p) => <span className={`gg-ro-ir ${p.ltir ? "ltir" : onIR(p) ? "ir" : "dtd"}`}>{p.ltir ? "LTIR" : user.prospects.includes(p.id) ? "Minors" : onIR(p) ? "IR" : "Day to day"}</span>, sort: (p) => (p.ltir ? 2 : onIR(p) ? 1 : 0) },
              { key: "cap", label: "Cap Hit", num: true, render: (p) => money(p.cap), sort: (p) => p.cap },
              { key: "relief", label: "On LTIR", num: true, title: "His cap hit in the LTIR pool. The team's relief is the pool less the cap room you had when the first player went on.", render: (p) => (p.ltir ? money(p.cap) : <span className="dim">—</span>), sort: (p) => (p.ltir ? p.cap : 0) },
              {
                key: "act",
                label: "",
                render: (p) => !user.roster.includes(p.id) ? null : p.ltir ? (
                  <button className="tiny" disabled={p.injury > 0} title={p.injury > 0 ? "Still injured" : "Return him to the active roster"} onClick={() => runOp(activateLTIR(league, p.id))}>Activate</button>
                ) : (
                  <button className="tiny" disabled={p.injury < 10 || !ltirOpen} title={p.injury < 10 ? "LTIR needs an injury of 10 games or more" : !ltirOpen ? "LTIR is used in the preseason and regular season" : "Place on long-term injured reserve"} onClick={() => runOp(designateLTIR(league, p.id))}>Place on LTIR</button>
                ),
              },
            ]}
            rows={injured.filter(fits)}
            initialSort={{ key: "out", dir: "desc" }}
            empty="Nobody is hurt."
          />
        </>
      )}

      {shown === "contracts" && (
        <div className="grid g2">
          <Table
            columns={[
              { key: "name", label: "Player", render: (p) => nameCell(p), sort: (p) => p.name },
              { key: "pos", label: "Pos", sort: (p) => POS_ORDER[p.pos] },
              { key: "age", label: "Age", num: true, sort: (p) => p.age },
              { key: "ovr", label: "OVR", render: (p) => <Ovr v={p.ovr} src={p.src} />, sort: (p) => p.ovr },
              { key: "cap", label: "Cap Hit", num: true, render: (p) => money(p.cap), sort: (p) => p.cap },
              { key: "yrs", label: "Years", num: true, sort: (p) => p.yrs },
              { key: "exp", label: "Expires", render: (p) => (p.yrs > 0 ? `${league.year + p.yrs}` : "—"), sort: (p) => p.yrs },
              { key: "pct", label: "% Cap", num: true, render: (p) => ((p.cap / capForYear(league.year)) * 100).toFixed(1) + "%", sort: (p) => p.cap },
            ]}
            rows={roster.filter(fits)}
            initialSort={{ key: "cap", dir: "desc" }}
          />
          <div className="panel gg-deadcap">
            <h3>Dead Cap (buyouts)</h3>
            <div className="list">
              {user.deadCap.map((d, i) => (
                <div className="item" key={i}>{d.name}<span style={{ marginLeft: "auto" }} className="mono">{money(d.amt)} × {d.yrs}{d.offset>0?` · starts ${capYear(league)+d.offset}`:" · current"}</span></div>
              ))}
              {!user.deadCap.length && <div className="dim small">None.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
