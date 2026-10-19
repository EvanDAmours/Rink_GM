import {buyoutSummary} from '../engine/capAccounting.js';
import Select from "./Select.jsx";
import {automaticallyHandleRoster,automaticRosterPlan} from "../engine/autoRoster.js";
import React, { useState } from "react";
import { useGame, Table, PlayerName, PlayerCell, TeamBadge, Ovr, money, pct, signed, POS_ORDER } from "./common.jsx";
import { isGoalie, isDefense, capForYear, capFloorForYear, MAX_ROSTER, ARCHETYPES } from "../engine/constants.js";
import { capSpace, payroll, counts, sendDown, callUp, releasePlayer, canSendDown, rosterIssues, hasRoomFor, ensureMinimums, capYear, capFloorGap } from "../engine/roster.js";
import { savePct, gaa } from "../engine/players.js";
import Icon from "./Icon.jsx";
import { shownRatings } from "../engine/draft.js";
import TrainingCamp from "./TrainingCamp.jsx";

export default function RosterPage() {
  const { league, commit, toast, ask } = useGame();
  const [query,setQuery]=useState(""),[position,setPosition]=useState("all");
  const user = league.teams[league.userTid];
  const [view, setView] = useState(league.phase === "preseason" && !(user.camp?.year === league.year && user.camp.games.length >= 4) ? "camp" : "roster");
  const roster = user.roster.map((id) => league.players[id]).filter(Boolean);
  const minors = user.prospects.map((id) => league.players[id]).filter(Boolean);
  const c = counts(league, user);
  const issues = rosterIssues(league, user);
  const fits=p=>(position==="all" || p.pos===position) && p.name.toLowerCase().includes(query.toLowerCase());

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
  const doCallUp = (p) => {
    if (!hasRoomFor(league, user)) return toast(`Roster is full (${MAX_ROSTER} active). Send someone down first.`);
    if(!callUp(league,user,p.id))return toast("Recall blocked by cap, eligibility or contract limits.");
    commit();
  };

  const statusCol = { key: "st", label: "", render: (p) => (p.injury > 0 ? <span className="inj">INJ {p.injury}</span> : p.rookie ? <span className="pill">R</span> : null) };
  const base = [
    { key: "name", label: "Player", render: (p) => <PlayerCell p={p} team={user} />, sort: (p) => p.name },
    { key: "pos", label: "Pos", render: (p) => <span className="posbadge">{p.pos}</span>, sort: (p) => POS_ORDER[p.pos] },
    { key: "age", label: "Age", num: true, sort: (p) => p.age },
    { key: "ovr", label: "OVR", render: (p) => <Ovr v={p.ovr} src={p.src} />, sort: (p) => p.ovr },
    { key: "pot", label: "POT", num: true, sort: (p) => p.pot },
    { key: "type", label: "Type", render: (p) => <span className="small muted">{ARCHETYPES[p.type]?.name}</span>, sort: (p) => p.type },
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
      <div className="gg-pagehead"><div><h2>Roster</h2><div className="gg-status">{user.city} {user.name} · manage the people who define your season</div></div>
        <div className="gg-tiles"><div><small>ACTIVE</small><b>{c.active}<span className="dim">/{MAX_ROSTER}</span></b></div><div><small>F / D / G</small><b>{c.F}/{c.D}/{c.G}</b></div><div><small>CAP SPACE</small><b style={{color:capSpace(league,user)>=0?"#22c55e":"#ef4444"}}>{money(capSpace(league,user))}</b></div><div><small>INJURED</small><b style={{color:roster.filter(p=>p.injury>0).length?"#ef4444":"#22c55e"}}>{roster.filter(p=>p.injury>0).length}</b></div></div></div>
      {issues.length > 0 && (
        <div className="notice warn">
          {issues.map((i) => <div key={i}>⚠️ {i}</div>)}
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
      <div className="gg-chips">
        <button className={view === "roster" ? "on" : ""} onClick={() => setView("roster")}>NHL Roster</button>
        <button className={view === "minors" ? "on" : ""} onClick={() => setView("minors")}>Minors & Prospects ({minors.length})</button>
        {league.phase === "preseason" && <button className={view === "camp" ? "on" : ""} onClick={() => setView("camp")}>🏕️ Training Camp</button>}
      </div>

      {view !== "camp" && <div className="roster-controls"><label className="roster-search"><Icon name="search" size={16}/><input aria-label="Find roster player" placeholder="Find a player…" value={query} onChange={e=>setQuery(e.target.value)}/></label><Select aria-label="Filter roster position" value={position} onChange={e=>setPosition(e.target.value)}><option value="all">All positions</option>{["C","LW","RW","LD","RD","G"].map(pos=><option key={pos}>{pos}</option>)}</Select><span className="muted small">Click a player to open their profile.</span></div>}
      {view === "camp" && <TrainingCamp />}
      {view === "roster" &&
        groups.map(([title, rows, stats]) => (
          <div key={title}>
            <div className="gg-roster-h"><b>{title}</b><span>{rows.filter(fits).length}</span><em>OVR · CONTRACT · SEASON</em></div>
            <Table columns={[...base, statusCol, ...stats, actions]} rows={rows.filter(fits)} initialSort={{ key: "ovr", dir: "desc" }} />
          </div>
        ))}

      {view === "minors" && (
        <>
          <div className="muted small">AHL players use a buried-contract cap calculation. Entry-level term depends on age; rights expiry depends on the player's league. Front Office → Operations manages assignments and waivers.</div>
          <Table
            columns={[
              { key: "name", label: "Player", render: (p) => <PlayerCell p={p} team={user} />, sort: (p) => p.name },
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

      {view === "contracts" && (
        <div className="grid g2">
          <Table
            columns={[
              { key: "name", label: "Player", render: (p) => <PlayerCell p={p} team={user} />, sort: (p) => p.name },
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
