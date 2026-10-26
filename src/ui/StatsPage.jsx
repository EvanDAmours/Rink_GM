import Headshot from "./Headshot.jsx";
import React, { useMemo, useState } from "react";
import Select from "./Select.jsx";
import { useGame, Table, PlayerName, TeamBadge, Ovr, pct, signed, POS_ORDER } from "./common.jsx";
import { isGoalie, isDefense } from "../engine/constants.js";
import { savePct, gaa } from "../engine/players.js";
import { blankSeason, unitRates, leagueUnitAverages, specialTeamsTable } from "../engine/unitStats.js";
import { lineRoles, LINE_ROLES } from "../engine/roles.js";

const toi = (s) => (s.gp ? `${Math.floor(s.toi / s.gp / 60)}:${String(Math.round((s.toi / s.gp) % 60)).padStart(2, "0")}` : "-");

export default function StatsPage() {
  const { league } = useGame();
  const [kind, setKind] = useState("sk");
  const [season, setSeason] = useState(league.phase === "playoffs" ? "po" : "rs");
  const [team, setTeam] = useState("all");
  const [pos, setPos] = useState("all");
  const [rookies, setRookies] = useState(false);
  // A calm table first (the numbers people look for); every column one tap away.
  const [more, setMore] = useState(false);
  const key = season === "po" ? "pstats" : "stats";

  const players = useMemo(
    () =>
      Object.values(league.players).filter((p) => {
        if (p.tid < 0 || p[key].gp === 0) return false;
        if (team !== "all" && p.tid !== Number(team)) return false;
        if (rookies && !p.rookie) return false;
        return true;
      }),
    [league, key, team, rookies, league.day, league.phase] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const skaters = players.filter((p) => !isGoalie(p.pos) && (pos === "all" || (pos === "F" ? !isDefense(p.pos) : isDefense(p.pos))));
  const goalies = players.filter((p) => isGoalie(p.pos));
  const S = (p) => p[key];
  const teamCol = { key: "tm", label: "Team", render: (p) => <TeamBadge team={league.teams[p.tid]} size={20} />, sort: (p) => league.teams[p.tid].abbr };

  const skCols = [
    { key: "rk", label: "#", render: (_, i) => <span className="dim">{i + 1}</span> },
    { key: "name", label: "Player", render: (p) => <span className="gg-mugname"><Headshot p={p} team={league.teams[p.tid]} size={26} decorative /><PlayerName p={p} /></span>, sort: (p) => p.name },
    teamCol,
    { key: "pos", label: "Pos", sort: (p) => POS_ORDER[p.pos] },
    { key: "ovr", label: "OVR", render: (p) => <Ovr v={p.ovr} />, sort: (p) => p.ovr },
    { key: "gp", label: "GP", num: true, render: (p) => S(p).gp, sort: (p) => S(p).gp },
    { key: "g", label: "G", num: true, render: (p) => S(p).g, sort: (p) => S(p).g },
    { key: "a", label: "A", num: true, render: (p) => S(p).a, sort: (p) => S(p).a },
    { key: "pts", label: "P", num: true, render: (p) => <b>{S(p).pts}</b>, sort: (p) => S(p).pts * 1000 + S(p).g },
    {key:'p60',label:'P/60',num:true,render:p=>S(p).toi?(S(p).pts*3600/S(p).toi).toFixed(2):'—',sort:p=>S(p).toi?S(p).pts*3600/S(p).toi:0},
    { key: "pm", label: "+/-", num: true, render: (p) => signed(S(p).pm), sort: (p) => S(p).pm },
    { key: "pim", label: "PIM", num: true, render: (p) => S(p).pim, sort: (p) => S(p).pim },
    { key: "ppg", label: "PPG", num: true, render: (p) => S(p).ppg, sort: (p) => S(p).ppg },
    { key: "ppp", label: "PPP", num: true, render: (p) => S(p).ppp, sort: (p) => S(p).ppp },
    { key: "shg", label: "SHG", num: true, render: (p) => S(p).shg, sort: (p) => S(p).shg },
    { key: "gwg", label: "GWG", num: true, render: (p) => S(p).gwg, sort: (p) => S(p).gwg },
    { key: "sog", label: "SOG", num: true, render: (p) => S(p).sog, sort: (p) => S(p).sog },
    { key: "shp", label: "S%", num: true, render: (p) => (S(p).sog ? ((S(p).g / S(p).sog) * 100).toFixed(1) : "-"), sort: (p) => (S(p).sog >= 20 ? S(p).g / S(p).sog : 0) },
    { key: "hit", label: "HIT", num: true, render: (p) => S(p).hit, sort: (p) => S(p).hit },
    { key: "blk", label: "BLK", num: true, render: (p) => S(p).blk, sort: (p) => S(p).blk },
    { key: "fo", label: "FO%", num: true, render: (p) => (S(p).fow + S(p).fol >= 20 ? ((S(p).fow / (S(p).fow + S(p).fol)) * 100).toFixed(1) : "-"), sort: (p) => (S(p).fow + S(p).fol >= 100 ? S(p).fow / (S(p).fow + S(p).fol) : 0) },
    { key: "toi", label: "TOI/GP", num: true, render: (p) => toi(S(p)), sort: (p) => (S(p).gp ? S(p).toi / S(p).gp : 0) },
  ];
  const minGp = season === "po" ? 1 : Math.max(1, Math.floor((league.teams[0].rec.gp || 0) * 0.25));
  const gCols = [
    { key: "rk", label: "#", render: (_, i) => <span className="dim">{i + 1}</span> },
    { key: "name", label: "Goalie", render: (p) => <span className="gg-mugname"><Headshot p={p} team={league.teams[p.tid]} size={26} decorative /><PlayerName p={p} /></span>, sort: (p) => p.name },
    teamCol,
    { key: "ovr", label: "OVR", render: (p) => <Ovr v={p.ovr} />, sort: (p) => p.ovr },
    { key: "gp", label: "GP", num: true, render: (p) => S(p).gp, sort: (p) => S(p).gp },
    { key: "gs", label: "GS", num: true, render: (p) => S(p).gs, sort: (p) => S(p).gs },
    { key: "w", label: "W", num: true, render: (p) => S(p).w, sort: (p) => S(p).w },
    { key: "l", label: "L", num: true, render: (p) => S(p).l, sort: (p) => S(p).l },
    { key: "otl", label: "OTL", num: true, render: (p) => S(p).otl, sort: (p) => S(p).otl },
    { key: "sa", label: "SA", num: true, render: (p) => S(p).sa, sort: (p) => S(p).sa },
    { key: "ga", label: "GA", num: true, render: (p) => S(p).ga, sort: (p) => S(p).ga },
    { key: "sv", label: "SV%", num: true, render: (p) => pct(savePct(S(p))), sort: (p) => (S(p).gp >= minGp ? savePct(S(p)) : 0) },
    { key: "gaa", label: "GAA", num: true, render: (p) => gaa(S(p)).toFixed(2), sort: (p) => (S(p).gp >= minGp ? -gaa(S(p)) : -99) },
    { key: "so", label: "SO", num: true, render: (p) => S(p).so, sort: (p) => S(p).so },
  ];

  const SK_BASIC = ["rk", "name", "tm", "pos", "gp", "g", "a", "pts", "pm", "toi"];
  const G_BASIC = ["rk", "name", "tm", "gp", "w", "l", "otl", "sv", "gaa", "so"];
  const skShown = more ? skCols : skCols.filter((c) => SK_BASIC.includes(c.key));
  const gShown = more ? gCols : gCols.filter((c) => G_BASIC.includes(c.key));
  return (
    <div className="stack">
      <div className="pagehead">
        <h2>Stats</h2>
        <div className="tabs" style={{ margin: 0 }}>
          <button className={kind === "sk" ? "on" : ""} onClick={() => setKind("sk")}>Skaters</button>
          <button className={kind === "g" ? "on" : ""} onClick={() => setKind("g")}>Goalies</button>
          <button className={kind === "units" ? "on" : ""} onClick={() => setKind("units")}>Team / Lines</button>
        </div>
        {kind !== "units" && <>
        <Select value={season} onChange={(e) => setSeason(e.target.value)}>
          <option value="rs">Regular season</option>
          <option value="po">Playoffs</option>
        </Select>
        <Select value={team} onChange={(e) => setTeam(e.target.value)}>
          <option value="all">All teams</option>
          {league.teams.map((t) => <option key={t.id} value={t.id}>{t.city} {t.name}</option>)}
        </Select>
        {kind === "sk" && (
          <Select value={pos} onChange={(e) => setPos(e.target.value)}>
            <option value="all">All skaters</option>
            <option value="F">Forwards</option>
            <option value="D">Defense</option>
          </Select>
        )}
        <label className="row small"><input type="checkbox" checked={rookies} onChange={(e) => setRookies(e.target.checked)} /> Rookies</label>
        <button type="button" className="rk-morecols" aria-pressed={more} onClick={() => setMore((v) => !v)}>{more ? "Fewer columns" : "More columns"}</button>
        </>}
      </div>
      {kind === "units" ? <UnitStats league={league} /> : kind === "sk" ? (
        <Table columns={skShown} rows={skaters} initialSort={{ key: "pts", dir: "desc" }} limit={150} rowClass={(p) => (p.tid === league.userTid ? "me" : "")} empty="No games played yet." dense={more} />
      ) : (
        <Table columns={gShown} rows={goalies} initialSort={{ key: "w", dir: "desc" }} limit={100} rowClass={(p) => (p.tid === league.userTid ? "me" : "")} empty="No games played yet." dense={more} />
      )}
      {kind === "g" && <div className="muted small">SV% and GAA rankings require {minGp}+ games played.</div>}
    </div>
  );
}

// Stats > Team / Lines (Gridiron 3.25 "By the Numbers"): a club's season by forward line and
// special-teams unit next to the league average for that unit, green when better and red when
// worse; then every team's power play and penalty kill.
const UNIT_ROWS = [["Line 1", "L1"], ["Line 2", "L2"], ["Line 3", "L3"], ["Line 4", "L4"], ["PP", "PP"], ["SH", "PK"]];
const f1 = (v) => (v == null ? "—" : v.toFixed(1));
function UnitStats({ league }) {
  const [tid, setTid] = useState(league.userTid);
  const team = league.teams[tid];
  const S = team.unitSeason?.year === league.year ? team.unitSeason : blankSeason(league.year);
  const avg = leagueUnitAverages(league);
  const roles = lineRoles(team);
  const mark = (v, ref, higher = true) => (v == null || ref == null || Math.abs(v - ref) < 0.05 ? "" : (v > ref) === higher ? "good" : "bad");
  const cell = (v, ref, higher, digits = 1) => <span><b className={mark(v, ref, higher)}>{v == null ? "—" : v.toFixed(digits)}</b>{ref != null && <small className="dim"> {ref.toFixed(digits)}</small>}</span>;
  const st = specialTeamsTable(league);
  const rank = (key, dir) => { const xs = st.filter((r) => r[key] != null).sort((a, b) => (b[key] - a[key]) * dir); return (r) => (r[key] == null ? "—" : xs.indexOf(r) + 1); };
  const ppRank = rank("ppPct", 1), pkRank = rank("pkPct", 1);
  const mine = st.find((r) => r.tid === tid);
  return (
    <div className="stack rk-units">
      <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <TeamBadge team={team} size={26} />
        <Select value={tid} onChange={(e) => setTid(Number(e.target.value))} aria-label="Team">
          {[...league.teams].sort((a, b) => a.city.localeCompare(b.city)).map((t) => <option key={t.id} value={t.id}>{t.city} {t.name}{t.id === league.userTid ? " (you)" : ""}</option>)}
        </Select>
        <span className="muted small">{S.gp} games · small numbers are the league average for the same unit</span>
      </div>
      <div className="gg-tiles">
        <div><small>POWER PLAY</small><b>{f1(mine?.ppPct)}%</b><span className="dim small"> {mine?.ppGoals ?? 0}/{mine?.ppOpp ?? 0} · #{ppRank(mine || {})}</span></div>
        <div><small>PENALTY KILL</small><b>{f1(mine?.pkPct)}%</b><span className="dim small"> {mine ? mine.pkOpp - mine.pkGa : 0}/{mine?.pkOpp ?? 0} · #{pkRank(mine || {})}</span></div>
        <div><small>LEAGUE PP / PK</small><b>{f1(avg.ppPct)}% / {f1(avg.pkPct)}%</b></div>
      </div>
      <Table
        columns={[
          { key: "unit", label: "Unit", render: (r) => <span><b>{r.label}</b> <span className="muted small">{r.name}</span></span> },
          { key: "min", label: "Min", num: true, render: (r) => (r.r ? Math.round(r.r.min) : "—") },
          { key: "cf", label: "CF%", num: true, title: "Share of shot attempts", render: (r) => cell(r.r?.cfPct, r.a?.cfPct, true) },
          { key: "xgf", label: "xGF%", num: true, title: "Share of chance quality (model goals)", render: (r) => cell(r.r?.xgfPct, r.a?.xgfPct, true) },
          { key: "gf60", label: "GF/60", num: true, render: (r) => cell(r.r?.gf60, r.a?.gf60, true, 2) },
          { key: "ga60", label: "GA/60", num: true, render: (r) => cell(r.r?.ga60, r.a?.ga60, false, 2) },
          { key: "sf60", label: "SF/60", num: true, render: (r) => cell(r.r?.sf60, r.a?.sf60, true) },
          { key: "sa60", label: "SA/60", num: true, render: (r) => cell(r.r?.sa60, r.a?.sa60, false) },
          { key: "gf", label: "GF", num: true, render: (r) => r.U?.gf ?? 0 },
          { key: "ga", label: "GA", num: true, render: (r) => r.U?.ga ?? 0 },
        ]}
        rows={UNIT_ROWS.map(([k, label], i) => ({ id: k, label, name: i < 4 ? LINE_ROLES[roles.F[i]]?.name : k === "SH" ? "Penalty kill" : "Power play", U: S.units[k], r: unitRates(S.units[k]), a: avg.units[k] || null }))}
        dense
      />
      <h3 style={{ margin: "6px 0 0" }}>Special teams</h3>
      <Table
        columns={[
          { key: "tm", label: "Team", render: (r) => <span className="row" style={{ gap: 6 }}><TeamBadge team={league.teams[r.tid]} size={20} />{league.teams[r.tid].city} {league.teams[r.tid].name}</span>, sort: (r) => league.teams[r.tid].city },
          { key: "gp", label: "GP", num: true, sort: (r) => r.gp },
          { key: "pp", label: "PP%", num: true, render: (r) => <b>{f1(r.ppPct)}</b>, sort: (r) => r.ppPct ?? -1 },
          { key: "ppr", label: "Rk", num: true, render: (r) => ppRank(r), sort: (r) => r.ppPct ?? -1 },
          { key: "ppg", label: "PPG", num: true, render: (r) => r.ppGoals, sort: (r) => r.ppGoals },
          { key: "ppo", label: "PPO", num: true, render: (r) => r.ppOpp, sort: (r) => r.ppOpp },
          { key: "pk", label: "PK%", num: true, render: (r) => <b>{f1(r.pkPct)}</b>, sort: (r) => r.pkPct ?? -1 },
          { key: "pkr", label: "Rk", num: true, render: (r) => pkRank(r), sort: (r) => r.pkPct ?? -1 },
          { key: "pkga", label: "PPGA", num: true, render: (r) => r.pkGa, sort: (r) => -r.pkGa },
          { key: "tsh", label: "TSH", num: true, title: "Times shorthanded", render: (r) => r.pkOpp, sort: (r) => r.pkOpp },
        ]}
        rows={st}
        initialSort={{ key: "pp", dir: "desc" }}
        rowClass={(r) => (r.tid === league.userTid ? "me" : "")}
        empty="No games played yet."
        dense
      />
    </div>
  );
}
