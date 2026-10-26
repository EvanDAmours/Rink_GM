// Draft recap (Gridiron 1.69): after the draft, every pick with his true ratings and development
// trait revealed, so you can see where you (and everyone else) hit or missed. Every club's class
// is graded and ranked; past drafts stay here with a Now column. The public first-round mock
// lives here too.
import React, { useMemo, useState } from "react";
import Select from "./Select.jsx";
import { useGame, TeamBadge, TeamName, PlayerName } from "./common.jsx";
import { DevChip } from "./scoutingBits.jsx";
import { PosChip } from "./DraftTools.jsx";
import { DEV_TRAITS } from "../engine/players.js";
import { visibleRatings } from "../engine/draft.js";
import { mockDraft } from "../engine/draftTools.js";
import { draftRecap, recapYears, stampDraftTruth, VERDICT, HIT } from "../engine/draftRecap.js";
import { DRAFT_ROUNDS } from "../engine/constants.js";
import "./draft.css";

const GRADE_C = { A: "#22c55e", "B+": "#84cc16", B: "#a3e635", "C+": "#f59e0b", C: "#fb923c", D: "#ef4444", "—": "#64748b" };
const POSITIONS = ["C", "LW", "RW", "LD", "RD", "G"];

function Verdict({ v }) {
  const [txt, col] = VERDICT[v] || VERDICT.solid;
  return <span className="dr-verdict" style={{ color: col }}>{txt}</span>;
}

export default function DraftRecap() {
  const { league } = useGame();
  const [view, setView] = useState("recap");
  return (
    <div className="stack dr">
      <div className="tabs">
        <button className={view === "recap" ? "on" : ""} onClick={() => setView("recap")}>Draft recap</button>
        <button className={view === "mock" ? "on" : ""} onClick={() => setView("mock")}>First-round mock</button>
      </div>
      {view === "mock" ? <MockDraftView /> : <RecapView key={league.draft?.year || 0} />}
    </div>
  );
}

function RecapView() {
  const { league, openPlayer } = useGame();
  stampDraftTruth(league);
  const years = recapYears(league);
  const [pickYr, setPickYr] = useState(null);
  const [show, setShow] = useState("all");
  const [round, setRound] = useState("all");
  const [pos, setPos] = useState("all");
  const [teamF, setTeamF] = useState(-1);
  const year = years.includes(pickYr) ? pickYr : years[0];
  const slotsKey = league.draft && league.draft.year === year ? league.draft.idx : -1;
  const rec = useMemo(() => (year ? draftRecap(league, year) : null), [league, year, slotsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const me = league.userTid;

  if (!rec || !rec.rows.length) return (
    <div className="panel">
      <h3>Draft recap</h3>
      <div className="muted">No picks yet. Once the draft starts, every pick shows up here with his real ratings and development trait.</div>
    </div>
  );

  const live = league.phase === "draft" && league.draft?.year === year && league.draft.idx < league.draft.slots.length;
  const past = !(league.draft?.year === year && ["draft", "resign", "freeagency"].includes(league.phase));
  const { rows, grades, counts } = rec;
  const mine = grades[me];
  const ranked = grades.filter((g) => g.picks.length).sort((a, b) => a.rank - b.rank);
  const jackpots = rows.filter((r) => HIT.has(r.verdict)).sort((a, b) => b.score - a.score || a.overall - b.overall);
  const shown = rows.filter((r) => (teamF >= 0 ? r.owner === teamF : true) && (show === "hits" ? HIT.has(r.verdict) : show === "mine" ? r.owner === me : show === "misses" ? ["bust", "miss"].includes(r.verdict) : true) && (round === "all" || r.round === +round) && (pos === "all" || r.pos === pos));
  const now = (r) => { const p = league.players[r.pid]; if (!p) return null; const v = visibleRatings(league, p); return { ovr: v.ovr, exact: v.exact, tid: p.tid }; };
  const open = (r) => league.players[r.pid] && openPlayer(r.pid);

  return (
    <>
      <div className="dr-head">
        <div className="dr-title">{year} Draft Recap</div>
        {years.length > 1 && <Select aria-label="Draft year" value={year} onChange={(e) => setPickYr(+e.target.value)}>{years.map((y) => <option key={y} value={y}>{y} draft</option>)}</Select>}
      </div>
      <div className="muted dr-sub">Every pick with his true ratings and development trait revealed{live ? ", updated as the picks come in" : ""}. {past ? "\"Now\" shows what each player has become since (other clubs' prospects as your scouts read them)." : "Development traits decide how fast a player grows, so this is where you find out if you hit."}</div>

      {mine && mine.picks.length > 0 && (
        <div className="panel dr-mine" style={{ "--gc": GRADE_C[mine.grade] }}>
          <div className="dr-mine-h">
            <div className="dr-mine-g">{mine.grade}</div>
            <div>
              <div className="dr-k">Your class</div>
              <div className="muted">{mine.picks.length} pick{mine.picks.length === 1 ? "" : "s"} · {mine.hits} hit{mine.hits === 1 ? "" : "s"} (Star or better) · ranked {mine.rank} of {ranked.length}</div>
            </div>
          </div>
          <div className="dr-cards">
            {mine.picks.map((r) => { const n = past ? now(r) : null; return (
              <button type="button" key={r.pid} className="dr-card" onClick={() => open(r)} style={{ "--vc": (VERDICT[r.verdict] || VERDICT.solid)[1] }}>
                <span className="dr-card-h"><PosChip pos={r.pos} /><b>{r.name}</b></span>
                <span className="dr-card-m">Round {r.round}, pick {r.overall}{r.age ? ` · age ${r.age}` : ""}</span>
                <span className="dr-card-r">OVR <b>{r.ovr ?? "—"}</b> · POT <b>{r.pot ?? "—"}</b>{n ? <span className="dr-now"> · now {n.ovr}</span> : null} <DevChip dev={r.dev} /></span>
                <Verdict v={r.verdict} />
              </button>
            ); })}
          </div>
        </div>
      )}

      <div className="dr-grid">
        <div className="panel">
          <h3>Hidden gems and best traits</h3>
          <div className="dr-counts">{Object.keys(DEV_TRAITS).filter((k) => k !== "normal").concat("normal").map((k) => <span key={k}><DevChip dev={k} /> {counts[k] || 0}</span>)}</div>
          {jackpots.slice(0, 10).map((r) => (
            <div key={r.pid} className={`dr-jrow${r.owner === me ? " mine" : ""}`} onClick={() => open(r)}>
              <span className="dr-n">#{r.overall}</span>
              <TeamBadge team={league.teams[r.owner]} size={20} decorative />
              <PosChip pos={r.pos} />
              <span className="dr-jname">{r.name}</span>
              {r.verdict === "gem" ? <Verdict v="gem" /> : <DevChip dev={r.dev} />}
            </div>
          ))}
          {!jackpots.length && <div className="muted small">No Star-or-better traits or hidden gems in this class.</div>}
        </div>
        <div className="panel">
          <h3>Class grades <span className="right muted small" style={{ textTransform: "none", letterSpacing: 0 }}>tap a club to filter</span></h3>
          {ranked.map((g) => { const t = league.teams[g.tid]; return (
            <div key={g.tid} className={`dr-grow${g.tid === me ? " mine" : ""}${teamF === g.tid ? " on" : ""}`} onClick={() => setTeamF(teamF === g.tid ? -1 : g.tid)}>
              <span className="dr-n">{g.rank}</span>
              <TeamBadge team={t} size={20} decorative />
              <span className="dr-gname">{t.city} {t.name}</span>
              <span className="dr-gmeta">{g.picks.length} pick{g.picks.length === 1 ? "" : "s"} · {g.hits} hit{g.hits === 1 ? "" : "s"}</span>
              <b className="dr-gg" style={{ color: GRADE_C[g.grade] }}>{g.grade}</b>
            </div>
          ); })}
        </div>
      </div>

      <div className="panel">
        <div className="dr-filters">
          <div className="dr-k flex1">Every pick</div>
          {[["all", "All"], ["mine", "Mine"], ["hits", "Hits"], ["misses", "Misses"]].map(([k, l]) => <button key={k} type="button" className={`small${show === k ? " primary" : ""}`} onClick={() => setShow(k)}>{l}</button>)}
          <Select aria-label="Round" value={round} onChange={(e) => setRound(e.target.value)}><option value="all">All rounds</option>{Array.from({ length: DRAFT_ROUNDS }, (_, i) => <option key={i} value={i + 1}>Round {i + 1}</option>)}</Select>
          <Select aria-label="Position" value={pos} onChange={(e) => setPos(e.target.value)}><option value="all">All positions</option>{POSITIONS.map((x) => <option key={x} value={x}>{x}</option>)}</Select>
          {teamF >= 0 && <button type="button" className="small" onClick={() => setTeamF(-1)}>{league.teams[teamF]?.abbr} ✕</button>}
        </div>
        <div className="tablewrap">
          <table className="t dr-table">
            <thead><tr><th>Pick</th><th>Team</th><th>Player</th><th>Pos</th><th className="num">OVR</th><th className="num">POT</th>{past && <th className="num">Now</th>}<th>Dev</th><th>Verdict</th></tr></thead>
            <tbody>
              {shown.map((r, i) => { const n = past ? now(r) : null; const prev = shown[i - 1]; return (
                <tr key={r.pid} className={`${r.owner === me ? "mine" : ""}${prev && prev.round !== r.round ? " newround" : ""}`} onClick={() => open(r)}>
                  <td className="nowrap muted">{r.round}-{r.overall}</td>
                  <td><span className="dr-team"><TeamBadge team={league.teams[r.owner]} size={18} decorative />{league.teams[r.owner]?.abbr}</span></td>
                  <td className="dr-pl">{league.players[r.pid] ? <PlayerName p={league.players[r.pid]} showInj={false} /> : r.name}</td>
                  <td><PosChip pos={r.pos} /></td>
                  <td className="num">{r.ovr ?? "—"}</td>
                  <td className="num"><b>{r.pot ?? "—"}</b></td>
                  {past && <td className="num dr-now">{n ? n.ovr : <span className="muted">gone</span>}</td>}
                  <td><DevChip dev={r.dev} /></td>
                  <td className="nowrap"><Verdict v={r.verdict} /></td>
                </tr>
              ); })}
              {!shown.length && <tr><td colSpan={past ? 9 : 8} className="muted">No picks match.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function MockDraftView() {
  const { league } = useGame();
  const mock = league.draftClass?.length ? mockDraft(league) : [];
  return (
    <div className="panel">
      <h3>Public consensus mock draft</h3>
      <p className="muted small">Projection from public ranks and team needs. Picks and prospects are unchanged.</p>
      <div className="list">{mock.map((s) => <div className="item" key={s.overall}><b>#{s.overall}</b><TeamName tid={s.owner} /><span style={{ marginLeft: "auto" }}>{league.players[s.pid] ? <PlayerName p={league.players[s.pid]} /> : "—"}</span></div>)}</div>
      {!mock.length && <div className="muted small">The next class isn't set yet.</div>}
    </div>
  );
}
