import React, { useState } from "react";
import { useGame, PlayerName, TeamBadge, TeamName, recordStr, pct, signed } from "./common.jsx";
import { isGoalie } from "../engine/constants.js";
import { savePct, gaa } from "../engine/players.js";
import { powerRankings, playoffOdds, rosterGrades, gradeColor, bestAt, SP_ACTIONS, runAction, ensurePulse, repTier, tierColor } from "../engine/clubPulse.js";

// The franchise hub (Gridiron GM's HUB tab, in hockey form): season leaders, power rankings,
// roster grades, franchise history and the Season Points desk.
const SECTIONS = [
  ["leaders", "📊 Season Leaders"],
  ["power", "⚡ Power Rankings"],
  ["grades", "💪 Roster Grades"],
  ["history", "🏆 Franchise History"],
  ["sp", "💰 Season Points"],
];

const SKATER_CATS = [
  ["PTS", "Points", (p) => p.stats.pts],
  ["G", "Goals", (p) => p.stats.g],
  ["A", "Assists", (p) => p.stats.a],
  ["+/-", "Plus/minus", (p) => p.stats.pm],
  ["PPG", "Power-play goals", (p) => p.stats.ppg],
  ["SOG", "Shots", (p) => p.stats.sog],
];
const GOALIE_CATS = [
  ["W", "Wins", (p) => p.stats.w, false],
  ["SV%", "Save %", (p) => savePct(p.stats), false, (v) => pct(v)],
  ["GAA", "Goals against avg", (p) => gaa(p.stats), true, (v) => v.toFixed(2)],
  ["SO", "Shutouts", (p) => p.stats.so, false],
];

function Leaders({ league }) {
  const ps = Object.values(league.players).filter((p) => p.tid >= 0 && p.stats?.gp > 0);
  const sk = ps.filter((p) => !isGoalie(p.pos));
  const gk = ps.filter((p) => isGoalie(p.pos));
  const maxGp = Math.max(1, ...league.teams.map((t) => t.rec.gp));
  const qualified = gk.filter((p) => p.stats.gp >= Math.max(1, Math.floor(maxGp * 0.25)));
  const card = (key, title, list, val, fmt = (v) => v, asc = false) => {
    const top = [...list].sort((a, b) => (asc ? val(a) - val(b) : val(b) - val(a))).slice(0, 5);
    return (
      <div key={key} className="gg-card gg-leader">
        <div className="gg-k">{title.toUpperCase()}</div>
        {top.map((p, i) => (
          <div key={p.id} className={`gg-lrow${p.tid === league.userTid ? " mine" : ""}`}>
            <span className="gg-rank">{i + 1}</span>
            <PlayerName p={p} />
            <span className="dim small">{league.teams[p.tid]?.abbr}</span>
            <b>{fmt(val(p))}</b>
          </div>
        ))}
        {!top.length && <div className="dim small">No games yet.</div>}
      </div>
    );
  };
  return (
    <>
      <div className="gg-title">SEASON LEADERS — {league.year}-{String(league.year + 1).slice(2)}</div>
      <div className="gg-grid">
        {SKATER_CATS.map(([k, t, f]) => card(k, t, sk, f, (v) => (k === "+/-" ? signed(v) : v)))}
        {GOALIE_CATS.map(([k, t, f, asc, fmt]) => card(k, t, k === "W" || k === "SO" ? gk : qualified, f, fmt, asc))}
      </div>
    </>
  );
}

function Power({ league }) {
  const rows = powerRankings(league);
  const odds = playoffOdds(league);
  return (
    <>
      <div className="gg-title">⚡ POWER RANKINGS {league.gm.power ? `— WEEK ${league.gm.power.week + 1}` : ""}</div>
      <div className="gg-power">
        {rows.map(({ t, rank, move }) => (
          <div key={t.id} className={`gg-prow${t.id === league.userTid ? " mine" : ""}`}>
            <span className="gg-rank">{rank}</span>
            <span className={`gg-move ${move > 0 ? "up" : move < 0 ? "down" : ""}`}>{move > 0 ? `▲${move}` : move < 0 ? `▽${-move}` : "–"}</span>
            <TeamBadge team={t} size={20} />
            <TeamName tid={t.id} />
            <span className="dim small">{recordStr(t.rec)} · {t.rec.pts} pts</span>
            <span className="gg-odds" title="Playoff odds" style={{ color: tierColor(odds[t.id] * 100, 70, 35) }}>{Math.round(odds[t.id] * 100)}%</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Grades({ league }) {
  const t = league.teams[league.userTid];
  const g = rosterGrades(league, t.id);
  const tiles = [
    ["FORWARDS", g.F, g.ratings.fwd],
    ["DEFENSE", g.D, g.ratings.def],
    ["GOALTENDING", g.G, g.ratings.g],
    ["OVERALL", g.OVR, g.ratings.ovr],
  ];
  return (
    <>
      <div className="gg-title">💪 ROSTER GRADES — {t.abbr}</div>
      <div className="gg-grid g4">
        {tiles.map(([k, grade, v]) => (
          <div key={k} className="gg-card gg-grade">
            <div className="gg-k">{k}</div>
            <div className="gg-big" style={{ color: gradeColor(grade) }}>{grade}</div>
            <div className="dim small">Rating {v} · league percentile</div>
          </div>
        ))}
      </div>
      <div className="gg-card" style={{ marginTop: 8 }}>
        <div className="gg-k">BEST AT EACH POSITION</div>
        <div className="row" style={{ gap: 6 }}>
          {bestAt(league, t).map(([pos, p]) => (
            <span key={pos} className="gg-pill"><b>{pos}</b> <PlayerName p={p} /> <span className={`ovr-txt`} style={{ color: ovrColor(p.ovr) }}>{p.ovr}</span></span>
          ))}
        </div>
        <div className="gg-tiles" style={{ marginTop: 8 }}>
          <div><small>MORALE</small><b style={{ color: tierColor(t.morale) }}>{Math.round(t.morale)}</b></div>
          <div><small>CHEMISTRY</small><b style={{ color: tierColor(t.chemistry, 80, 65) }}>{Math.round(t.chemistry)}</b></div>
          <div><small>FAN SUPPORT</small><b style={{ color: tierColor(t.owner?.fanSupport ?? 60) }}>{t.owner?.fanSupport ?? "—"}</b></div>
          <div><small>OWNER TRUST</small><b style={{ color: tierColor(t.owner?.trust ?? 65) }}>{t.owner?.trust ?? "—"}</b></div>
        </div>
      </div>
    </>
  );
}

function History({ league }) {
  const t = league.teams[league.userTid];
  const past = (league.history || []).filter((h) => h.userRec);
  const sum = (k) => past.reduce((n, h) => n + (h.userRec[k] || 0), 0) + (t.rec[k] || 0);
  const w = sum("w"), l = sum("l"), otl = sum("otl");
  const cups = (league.history || []).filter((h) => h.champion === t.id).map((h) => h.year);
  const apps = past.filter((h) => h.userRec.playoff).length;
  const legacy = Math.min(1000, Math.round(w * 2 + cups.length * 150 + apps * 25));
  const tier = legacy >= 700 ? "DYNASTY LEGEND" : legacy >= 400 ? "FRANCHISE CONTENDER" : legacy >= 150 ? "RISING POWER" : "EXPANSION ERA";
  const tiles = [
    ["ALL-TIME", `${w}-${l}-${otl}`],
    ["POINT %", w + l + otl ? ((w * 2 + otl) / (2 * (w + l + otl))).toFixed(3).replace(/^0/, "") : "—"],
    ["STANLEY CUPS", cups.length],
    ["PLAYOFF APPS", apps],
    ["SEASONS", past.length + 1],
    ["LEGACY", legacy],
  ];
  return (
    <>
      <div className="gg-title">🏆 FRANCHISE HISTORY — {t.city} {t.name}</div>
      <div className="gg-tiles big">
        {tiles.map(([k, v]) => <div key={k}><small>{k}</small><b>{v}</b></div>)}
      </div>
      <div className="row" style={{ gap: 6, margin: "8px 0" }}>
        <span className="gg-pill gold">{tier}</span>
        {cups.map((y) => <span key={y} className="gg-pill gold">🏆 {y}-{String(y + 1).slice(2)}</span>)}
      </div>
      <div className="gg-card">
        <div className="gg-k">SEASON LOG</div>
        {past.length ? past.map((h) => (
          <div key={h.year} className="gg-lrow">
            <span className="gg-rank">{h.year}</span>
            <span>{recordStr(h.userRec)} · {h.userRec.pts} pts</span>
            <span className="dim small">{h.userRec.playoff || "Missed playoffs"}</span>
            {h.champion === t.id && <b style={{ color: "#f59e0b" }}>CHAMPIONS</b>}
          </div>
        )) : <div className="dim small">Your first season is under way. Completed seasons appear here.</div>}
      </div>
    </>
  );
}

function SeasonPoints({ league }) {
  const { commit, toast } = useGame();
  const gm = ensurePulse(league);
  const rep = repTier(gm.rep);
  return (
    <>
      <div className="gg-title">💰 SEASON POINTS — {gm.sp} SP</div>
      <div className="muted small" style={{ marginBottom: 8 }}>
        You earn 2 SP every week of the season (+1 at RESPECTED reputation, +1 more at LEGEND, ±1 for very happy or unhappy fans), plus bonuses for playoff series and the Cup. Spend them to manage the room and the front office.
        Your reputation: <b style={{ color: rep.color }}>{rep.label}</b>.
      </div>
      <div className="gg-grid">
        {Object.entries(SP_ACTIONS).map(([k, a]) => (
          <div key={k} className="gg-card">
            <div className="gg-k">{a.name.toUpperCase()}</div>
            <div className="small" style={{ minHeight: 34 }}>{a.desc}</div>
            <button className="small primary" disabled={gm.sp < a.cost} onClick={() => { const r = runAction(league, k); toast(r.msg); commit(); }}>Spend {a.cost} SP</button>
          </div>
        ))}
      </div>
      <div className="gg-card" style={{ marginTop: 8 }}>
        <div className="gg-k">LEDGER</div>
        {gm.ledger.slice(0, 15).map((e, i) => (
          <div key={i} className="gg-lrow"><span className="dim small">{e.year}</span><span>{e.label}</span><b style={{ color: e.n > 0 ? "#22c55e" : "#ef4444" }}>{e.n > 0 ? "+" : ""}{e.n}</b></div>
        ))}
        {!gm.ledger.length && <div className="dim small">No Season Points earned or spent yet.</div>}
      </div>
    </>
  );
}

export const ovrColor = (o) => (o >= 85 ? "#22c55e" : o >= 79 ? "#84cc16" : o >= 73 ? "#eab308" : o >= 67 ? "#f97316" : "#ef4444");

export default function HubPage() {
  const { league } = useGame();
  const [sec, setSec] = useState("leaders");
  ensurePulse(league);
  return (
    <div className="stack gg-hub">
      <div className="gg-chips">
        {SECTIONS.map(([k, l]) => (
          <button key={k} className={sec === k ? "on" : ""} onClick={() => setSec(k)}>{l}</button>
        ))}
      </div>
      {sec === "leaders" && <Leaders league={league} />}
      {sec === "power" && <Power league={league} />}
      {sec === "grades" && <Grades league={league} />}
      {sec === "history" && <History league={league} />}
      {sec === "sp" && <SeasonPoints league={league} />}
    </div>
  );
}
