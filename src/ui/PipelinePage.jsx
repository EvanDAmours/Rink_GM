import React, { useMemo, useState } from "react";
import { useGame, PlayerName, Ovr } from "./common.jsx";
import { DevChip } from "./scoutingBits.jsx";
import { isGoalie, isDefense, posGroup } from "../engine/constants.js";
import { callUp, sendDown, canSendDown, hasRoomFor } from "../engine/roster.js";
import { lineupIds } from "../engine/lines.js";
import Headshot from "./Headshot.jsx";

// Prospect pipeline: every young player you control, from junior and college
// through the AHL to the NHL roster, with where he stands and whether the
// staff think he is ready for a call-up.
const LEVELS = [["junior", "Junior"], ["college", "College"], ["europe", "Europe"], ["ahl", "AHL"], ["nhl", "NHL"]];
const levelOf = (lg, t, p) => (t.prospects.includes(p.id) ? (p.assignment && p.assignment !== "nhl" ? p.assignment : "ahl") : "nhl");
const draftLabel = (lg, p) => (p.draft ? `${p.draft.year} · Rd ${p.draft.round}, #${p.draft.pick}${p.draft.tid != null && p.draft.tid !== p.tid && lg.teams[p.draft.tid] ? ` (${lg.teams[p.draft.tid].abbr})` : ""}` : p.src === "gen" ? "Undrafted" : "Pro");
const eta = (p) => {
  if (p.ovr >= 76) return "Now";
  const gap = Math.max(0, 76 - p.ovr), pace = p.dev === "superstar" ? 4.5 : p.dev === "star" ? 3.2 : p.dev === "late" ? (p.age >= 21 ? 3 : 1.4) : 2.2;
  const yrs = Math.ceil(gap / pace);
  return p.pot < 74 ? "Depth ceiling" : yrs <= 1 ? "1 year" : `${yrs} years`;
};

export default function PipelinePage() {
  const { league: lg, commit, toast } = useGame();
  const t = lg.teams[lg.userTid];
  const [level, setLevel] = useState("all");
  const young = useMemo(() => [...t.prospects, ...t.roster].map((id) => lg.players[id]).filter((p) => p && (t.prospects.includes(p.id) || p.age <= 24 || (p.draft && lg.year - p.draft.year <= 3))), [lg, t, lg.day]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = young.map((p) => ({ p, level: levelOf(lg, t, p), first: p.career?.[0]?.o ?? p.draftOvr ?? null })).sort((a, b) => b.p.pot - a.p.pot || b.p.ovr - a.p.ovr);
  const shown = level === "all" ? rows : rows.filter((r) => r.level === level);
  const counts = Object.fromEntries(LEVELS.map(([k]) => [k, rows.filter((r) => r.level === k).length]));
  // Call-up suggestions: a signed minor-leaguer who already out-rates a dressed player in his group.
  const dressed = new Set(lineupIds(t.lines || { F: [], D: [], G: [] }));
  const worstDressed = (grp) => [...dressed].map((id) => lg.players[id]).filter((p) => p && posGroup(p.pos) === grp).sort((a, b) => a.ovr - b.ovr)[0];
  const suggestions = rows.filter((r) => r.level === "ahl" && r.p.signed !== false && r.p.injury <= 0).map((r) => ({ ...r, beats: worstDressed(posGroup(r.p.pos)) })).filter((r) => r.beats && r.p.ovr >= r.beats.ovr + 1).slice(0, 4);
  const inSeason = ["preseason", "regular", "playoffs"].includes(lg.phase);
  const doCallUp = (p) => { if (!hasRoomFor(lg, t)) { toast("Your NHL roster is full (23). Send someone down first."); return; } if (callUp(lg, t, p.id)) { commit(); toast(`${p.name} called up.`); } else toast(`${p.name} cannot be recalled yet.`); };
  const doSendDown = (p) => { if (!canSendDown(p)) { toast(`${p.name} would need waivers to go down.`); return; } if (sendDown(lg, t, p.id)) { commit(); toast(`${p.name} assigned to the minors.`); } };
  return (
    <div className="stack gg-pipe">
      <div className="gg-pipe-top">
        <div className="gg-chips">
          <button className={level === "all" ? "on" : ""} onClick={() => setLevel("all")}>All <small>{rows.length}</small></button>
          {LEVELS.map(([k, label]) => <button key={k} className={level === k ? "on" : ""} onClick={() => setLevel(k)}>{label} <small>{counts[k]}</small></button>)}
        </div>
        <span className="dim small">Young players you control, junior to NHL. ETA is the staff's estimate of when he is a 76-rated NHL regular.</span>
      </div>
      {suggestions.length > 0 && <section className="gg-card gg-pipe-sugg"><div className="gg-k">READY FOR A LOOK · minor-leaguers rating above a dressed player</div>
        <div className="gg-pipe-sugg-rows">{suggestions.map((r) => <div key={r.p.id} className="gg-pipe-sugg-row"><Headshot p={r.p} team={t} size={40} decorative /><div><PlayerName p={r.p} /><span className="dim small">{r.p.pos} · {r.p.age} · <Ovr v={r.p.ovr} /> · out-rates {r.beats.name} ({r.beats.ovr})</span></div>{inSeason && <button className="small" onClick={() => doCallUp(r.p)}>Call up</button>}</div>)}</div>
      </section>}
      <div className="tablewrap">
        <table className="t gg-pipe-table">
          <thead><tr><th>Player</th><th>Level</th><th className="num">Age</th><th className="num">OVR</th><th className="num">POT</th><th>Dev</th><th>Drafted</th><th className="num">Since draft</th><th>ETA</th><th className="num">GP</th><th className="num">{"Pts/W"}</th><th></th></tr></thead>
          <tbody>
            {shown.map(({ p, level: lv, first }) => <tr key={p.id} className={lv === "nhl" ? "nhl" : ""}>
              <td><div className="player-cell"><span className="roster-sweater"><Headshot p={p} team={t} size={38} decorative /></span><div><PlayerName p={p} /><span className="player-detail">{p.pos}{p.bio?.lg ? ` · ${p.bio.lg}` : ""}{p.signed === false ? " · unsigned rights" : p.elc ? " · ELC" : ""}</span></div></div></td>
              <td><span className={`gg-pipe-lv ${lv}`}>{LEVELS.find(([k]) => k === lv)?.[1] || lv}</span></td>
              <td className="num">{p.age}</td><td className="num"><Ovr v={p.ovr} /></td><td className="num">{p.pot}</td><td><DevChip dev={p.dev} /></td>
              <td>{draftLabel(lg, p)}</td>
              <td className="num">{first != null ? <span className={p.ovr - first > 0 ? "good" : p.ovr - first < 0 ? "bad" : "dim"}>{p.ovr - first > 0 ? "+" : ""}{p.ovr - first}</span> : <span className="dim">—</span>}</td>
              <td>{eta(p)}</td>
              <td className="num">{lv === "nhl" ? p.stats.gp || 0 : p.farmStats?.gp || 0}</td><td className="num">{lv === "nhl" ? (isGoalie(p.pos) ? p.stats.w || 0 : p.stats.pts || 0) : (isGoalie(p.pos) ? p.farmStats?.w || 0 : (p.farmStats?.g || 0) + (p.farmStats?.a || 0))}</td>
              <td>{inSeason && (lv === "nhl" ? (canSendDown(p) ? <button className="small" onClick={() => doSendDown(p)}>Send down</button> : null) : lv === "ahl" && p.signed !== false ? <button className="small" onClick={() => doCallUp(p)}>Call up</button> : null)}</td>
            </tr>)}
            {!shown.length && <tr><td colSpan={12} className="dim">Nobody at this level.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
