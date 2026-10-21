import React, { useState } from "react";
import { useGame, Table, TeamBadge, TeamName, PlayerName, recordStr, money } from "./common.jsx";
import { teamRatings } from "../engine/lines.js";
import { payroll, capSpace } from "../engine/roster.js";
import { AWARD_NAMES } from "../engine/awards.js";
import { leagueTable } from "../engine/standings.js";
import { dayToDate } from "../engine/schedule.js";
import Select from "./Select.jsx";
import "./legacy.css";

const seasonOf = (y) => `${y}-${String(y + 1).slice(2)}`;
// Transactions by kind, matched on the wording (logTx keeps text only).
const TX_KINDS = [["all", "All moves"], ["trade", "Trades", /trade|acquire/i], ["sign", "Signings", /sign|re-sign|extension/i], ["waive", "Waivers & releases", /waiv|release|buyout|claim/i], ["move", "Call-ups & assignments", /call|assign|recall|loan|minors|AHL/i], ["retire", "Retirements", /retire/i], ["staff", "Coaches & GMs", /coach|GM /i], ["draft", "Draft", /draft/i]];

export default function LeaguePage({ view: forced }) {
  const { league, openTeam, openPlayer } = useGame();
  const [txKind, setTxKind] = useState("all"), [txClub, setTxClub] = useState("all"), [txYear, setTxYear] = useState("all");
  const [viewState, setView] = useState("teams");
  const view = forced || viewState;
  const awardsNow = league.awards;
  return (
    <div className="stack">
      <div className="pagehead">
        <h2>League</h2>
        {!forced && <div className="tabs" style={{ margin: 0 }}>
          {[["teams", "Teams"], ["awards", "Awards & History"], ["tx", "Transactions"], ["retired", "Retired"]].map(([k, l]) => (
            <button key={k} className={view === k ? "on" : ""} onClick={() => setView(k)}>{l}</button>
          ))}
        </div>}
      </div>

      {view === "teams" && (
        <Table
          columns={[
            { key: "t", label: "Team", render: (t) => <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}><TeamBadge team={t} size={22} /><TeamName tid={t.id} /></span>, sort: (t) => t.city },
            { key: "div", label: "Division", sort: (t) => t.div },
            { key: "rec", label: "Record", render: (t) => recordStr(t.rec), sort: (t) => t.rec.pts },
            { key: "pts", label: "PTS", num: true, render: (t) => t.rec.pts, sort: (t) => t.rec.pts },
            { key: "ovr", label: "OVR", num: true, render: (t) => teamRatings(league, t).ovr, sort: (t) => teamRatings(league, t).ovr },
            { key: "f", label: "F", num: true, render: (t) => teamRatings(league, t).fwd, sort: (t) => teamRatings(league, t).fwd },
            { key: "d", label: "D", num: true, render: (t) => teamRatings(league, t).def, sort: (t) => teamRatings(league, t).def },
            { key: "g", label: "G", num: true, render: (t) => teamRatings(league, t).g, sort: (t) => teamRatings(league, t).g },
            { key: "pay", label: "Payroll", num: true, render: (t) => money(payroll(league, t)), sort: (t) => payroll(league, t) },
            { key: "space", label: "Cap Space", num: true, render: (t) => money(capSpace(league, t)), sort: (t) => capSpace(league, t) },
            { key: "go", label: "", render: (t) => <button className="tiny" onClick={() => openTeam(t.id)}>Roster</button> },
          ]}
          rows={leagueTable(league)}
          initialSort={{ key: "ovr", dir: "desc" }}
          rowClass={(t) => (t.id === league.userTid ? "me" : "")}
        />
      )}

      {view === "awards" && (
        <div className="stack">
          {league.history.length > 0 && <>
            <div className="gg-rec-sec"><h3>STANLEY CUP CHAMPIONS</h3><span className="dim small">Every season in your league, newest first.</span></div>
            <div className="lg-hist-champ">{league.history.map((h) => { const t = league.teams[h.champion]; const cs = h.awards?.connSmythe; return (
              <div key={h.year} className={`gg-card lg-hist-card${h.champion === league.userTid ? " mine" : ""}`} onClick={() => openTeam(h.champion)} style={{ cursor: "pointer", borderLeft: `4px solid ${t?.colors?.[0] || "#475569"}` }}>
                <TeamBadge team={t} size={40} decorative />
                <div><small className="gg-k">{seasonOf(h.year)}</small><div><b>{t?.city} {t?.name}</b></div><div className="dim small">over {league.teams[h.runnerUp]?.abbr}{cs ? ` · Conn Smythe: ` : ""}{cs && (league.players[cs.pid] ? <PlayerName p={league.players[cs.pid]} /> : cs.name)}</div></div>
              </div>); })}</div>
          </>}
          {(league.hallOfFame || []).length > 0 && <>
            <div className="gg-rec-sec"><h3>HALL OF FAME</h3><span className="dim small">Inducted three years after retiring, on a legacy score that counts real pre-league careers.</span></div>
            <div className="lg-hist-champ">{[...league.hallOfFame].reverse().map((h) => <div key={h.pid} className="gg-card lg-hist-card" style={{ cursor: "pointer" }} onClick={() => openPlayer(h.pid)}>{league.teams[h.tid] && <TeamBadge team={league.teams[h.tid]} size={32} decorative />}<div><b>{h.name}</b><div className="dim small">{h.pos} · Class of {h.inducted}{h.legacy != null ? ` · legacy ${h.legacy}` : ""}</div></div></div>)}</div>
          </>}
          <div className="gg-rec-sec"><h3>AWARDS BY SEASON</h3></div>
          {awardsNow && (
            <div className="panel">
              <h3>{league.year}-{String(league.year + 1).slice(2)} Awards</h3>
              <div className="list">
                {Object.entries(awardsNow).map(([k, a]) => a && (
                  <div className="item" key={k}>
                    <span className="muted small" style={{ width: 250 }}>{AWARD_NAMES[k]}</span>
                    <TeamBadge team={league.teams[a.tid]} size={20} />
                    {league.players[a.pid] && !a.shared ? <PlayerName p={league.players[a.pid]} /> : <b>{a.name}</b>}
                    <span className="muted small" style={{ marginLeft: "auto" }}>{a.why}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <Table
            columns={[
              { key: "y", label: "Season", render: (h) => `${h.year}-${String(h.year + 1).slice(2)}` },
              { key: "c", label: "Stanley Cup", render: (h) => <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}><TeamBadge team={league.teams[h.champion]} size={20} /><TeamName tid={h.champion} /></span> },
              { key: "r", label: "Runner-up", render: (h) => <TeamName tid={h.runnerUp} short /> },
              { key: "p", label: "Presidents' Trophy", render: (h) => <TeamName tid={h.presidents} short /> },
              { key: "hart", label: "Hart", render: (h) => h.awards.hart?.name || "—" },
              { key: "vez", label: "Vezina", render: (h) => h.awards.vezina?.name || "—" },
              { key: "nor", label: "Norris", render: (h) => h.awards.norris?.name || "—" },
              { key: "cs", label: "Conn Smythe", render: (h) => h.awards.connSmythe?.name || "—" },
              { key: "me", label: "Your season", render: (h) => (h.userRec ? `${recordStr(h.userRec)}${h.userRec.playoff ? " · " + h.userRec.playoff : " · missed playoffs"}` : "—") },
            ]}
            rows={league.history}
            empty="No completed seasons yet."
          />
        </div>
      )}

      {view === "tx" && (
        <div className="panel">
          <div className="gg-tx">
            <div className="lg-tx-filters">
              <Select aria-label="Kind" value={txKind} onChange={(e) => setTxKind(e.target.value)}>{TX_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
              <Select aria-label="Club" value={txClub} onChange={(e) => setTxClub(e.target.value)}><option value="all">All clubs</option>{league.teams.map((t) => <option key={t.id} value={t.id}>{t.city} {t.name}</option>)}</Select>
              <Select aria-label="Season" value={txYear} onChange={(e) => setTxYear(e.target.value)}><option value="all">All seasons</option>{[...new Set(league.transactions.map((t) => t.year))].map((y) => <option key={y} value={y}>{seasonOf(y)}</option>)}</Select>
            </div>
            {league.transactions.filter((t) => (txKind === "all" || TX_KINDS.find(([k]) => k === txKind)[2].test(t.text)) && (txClub === "all" || t.tids?.includes(Number(txClub))) && (txYear === "all" || String(t.year) === txYear)).slice(0, 400).map((t, i, arr) => { const tid = t.tids?.[0]; const mine = t.tids?.includes(league.userTid); return (<React.Fragment key={i}>{(i === 0 || arr[i - 1].year !== t.year) && <div className="lg-tx-season">{seasonOf(t.year)}</div>}
              <div className={`gg-tx-row ${mine ? "mine" : "other"}`} key={i}>
                <small>{t.day != null && t.phase === "regular" ? dayToDate(t.year, t.day, league.scheduleStart) : t.phase === "playoffs" ? `${t.year} playoffs` : t.phase === "draft" ? `${t.year} draft` : t.phase === "freeagency" || t.phase === "resign" ? `${t.year} summer` : t.year}</small>
                {tid != null && league.teams[tid] ? <TeamBadge team={league.teams[tid]} size={22} decorative /> : <span />}
                <span>{t.text}</span>
              </div></React.Fragment>
            ); })}
            {!league.transactions.length && <div className="gg-empty"><i>📰</i><b>No transactions yet</b>Signings, trades, waivers and call-ups around the league land here.</div>}
          </div>
        </div>
      )}

      {view === "retired" && (
        <Table
          columns={[
            { key: "name", label: "Player", sort: (r) => r.name, render: (r) => r.pid != null ? <button className="link" onClick={() => openPlayer(r.pid)}>{r.name}</button> : r.name },
            { key: "from", label: "Club", render: (r) => (r.tid != null && league.teams[r.tid] ? <TeamBadge team={league.teams[r.tid]} size={20} decorative /> : "FA") },
            { key: "pos", label: "Pos" },
            { key: "year", label: "Retired", num: true, sort: (r) => r.year },
            { key: "age", label: "Age", num: true },
            { key: "gp", label: "GP", num: true, sort: (r) => r.gp },
            { key: "g", label: "G", num: true, render: (r) => (r.pos === "G" ? "—" : r.g), sort: (r) => r.g },
            { key: "pts", label: "PTS", num: true, render: (r) => (r.pos === "G" ? "—" : r.g + r.a), sort: (r) => r.g + r.a },
            { key: "w", label: "W", num: true, render: (r) => (r.pos === "G" ? r.w : "—"), sort: (r) => r.w },
            { key: "peak", label: "Peak OVR", num: true, sort: (r) => r.peak },
          ]}
          rows={(league.retirementArchive || []).length ? [...league.retirementArchive].filter((r) => r.gp >= 100 || r.peak >= 85 || r.hof).map((r) => ({ ...r, age: r.age ?? r.player?.age })) : league.retired}
          initialSort={{ key: "year", dir: "desc" }}
          empty="No notable retirements yet."
        />
      )}
    </div>
  );
}
