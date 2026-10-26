// Game Prep (Gridiron 3.34 Week Prep): opened from the gameday card on Home. Everything for your
// next game on one screen: the scouting report on the opponent (record, form, top line and pair,
// goalie, PP/PK rank, key matchups) and your game plan on the left; a Ready Check on the right
// (injured regulars still in your lines, an empty spot, a tired goalie or a back-to-back, a plan
// that doesn't fit, empty development focus slots), each with a one-tap fix, then your special
// teams and the buttons to play or sim it (when the screen that opens it passes onPlay / onSim).
import React, { useMemo, useState } from "react";
import { useGame, Modal, TeamBadge } from "./common.jsx";
import GamePlanPicker from "./GamePlanPicker.jsx";
import { POS_COLOR } from "./TradePage.jsx";
import { nextMatchup, opponentReport, readyCheck, applyPrepFix } from "../engine/gamePrep.js";
import { gameLines } from "../engine/lines.js";
import { dayToDate } from "../engine/schedule.js";
import { ReplacementPicker, useInjuryBookkeeping } from "./InjuryReportCard.jsx";
import { ROUND_TITLE } from "../engine/injuryReport.js";
import "./prep.css";

const ORD = (n) => (n ? n + (["st", "nd", "rd"][((n + 90) % 100 - 10) % 10 - 1] || "th") : "—");
const tone = (v) => (v >= 85 ? "#22c55e" : v >= 79 ? "#84cc16" : v >= 73 ? "#eab308" : v >= 67 ? "#f97316" : "#ef4444");
const rankTone = (r, n = 32) => (r <= n / 4 ? "#22c55e" : r > (n * 3) / 4 ? "#ef4444" : "#e0e6f0");
const Pos = ({ pos }) => <span className="gg-pos" style={{ background: POS_COLOR[pos] || "#64748b" }}>{pos}</span>;
const lastName = (n) => String(n || "").split(" ").slice(1).join(" ") || n;
const Form = ({ team, results }) => <div className="gg-form"><TeamBadge team={team} size={18} decorative /><b>{team.abbr}</b>{results.length ? results.map((r, i) => <i key={i} className={r}>{r === "O" ? "OT" : r}</i>) : <span className="dim">no games yet</span>}</div>;

export default function GamePrep({ onClose, onPlay, onSim }) {
  const { league: lg, commit, toast, go, openPlayer } = useGame();
  const [picking, setPicking] = useState(null);
  useInjuryBookkeeping(lg);
  const t = lg.teams[lg.userTid];
  const mu = nextMatchup(lg);
  const rev = JSON.stringify([lg.day, lg.phase, t.lines, t.gamePlan, t.autoPlan, t.training?.assignments, mu?.series?.games?.length]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rep = useMemo(() => (mu ? opponentReport(lg, t, mu.opp, { home: mu.home }) : null), [rev, mu?.opp?.id]);
  if (!mu || !rep) {
    return <Modal title="Game prep" onClose={onClose}><p className="muted">No game to prepare for right now. Game Prep opens before each game of the season and the playoffs.</p></Modal>;
  }
  const checks = readyCheck(lg, mu);
  const open = checks.filter((c) => !c.ok).length;
  const { opp } = mu;
  const kicker = mu.series ? `${(ROUND_TITLE[mu.series.round] || "Playoffs").toUpperCase()} · GAME ${mu.gameNo} PREP` : lg.phase === "preseason" ? `OPENING NIGHT PREP · ${dayToDate(lg.year, mu.day, lg.scheduleStart).toUpperCase()}` : `GAME ${t.rec.gp + 1} PREP · ${dayToDate(lg.year, mu.day, lg.scheduleStart).toUpperCase()}`;
  const fix = (c) => {
    if (c.fix?.kind === "replace") return setPicking(c.fix.pid);
    const r = applyPrepFix(lg, c.fix, mu);
    toast(r.msg, r.ok ? 3500 : 5000);
    if (r.ok) commit();
  };
  const toLines = () => { onClose?.(); go?.("lines"); };
  const mine = gameLines(lg, t);
  const unit = (ids) => (ids || []).map((id) => lg.players[id]).filter(Boolean);
  const seriesLine = mu.series ? (() => { const s = mu.series, us = s.top === t.id ? s.wTop : s.wBot, them = s.top === t.id ? s.wBot : s.wTop; return us === them ? `Series tied ${us}-${them}` : `${us > them ? `${t.abbr} lead` : `${opp.abbr} lead`} ${Math.max(us, them)}-${Math.min(us, them)}`; })() : null;
  const person = (p, note) => p ? <span className="rk-prep-person"><Pos pos={p.pos} /><button className="link" onClick={() => openPlayer?.(p.id)}>{p.name}</button> <span style={{ color: tone(p.ovr) }}>{p.ovr}</span>{note ? <span className="dim"> · {note}</span> : null}</span> : null;

  return (
    <Modal title={`Game prep vs ${opp.city} ${opp.name}`} onClose={onClose} bare className="rk-prep-modal">
      <div className="rk-prep">
        <header className="rk-prep-head">
          <TeamBadge team={opp} size={44} decorative />
          <div className="rk-prep-title">
            <small>{kicker}</small>
            <h2>{mu.home ? "vs" : "@"} {opp.city} {opp.name} <span>({rep.record}{seriesLine ? ` · ${seriesLine}` : ""})</span></h2>
          </div>
          <span className={`rk-prep-status ${open ? "warn" : "ok"}`}>{open ? `${open} to look at` : "✓ Ready"}</span>
        </header>
        <div className="rk-prep-grid">
          <div className="rk-prep-col">
            <section className="rk-prep-card">
              <div className="rk-prep-k">Scouting report · {opp.abbr}</div>
              <div className="rk-prep-tiles">
                <div><small>Record</small><b>{rep.record}</b><span>{rep.pts} pts · {ORD(rep.divRank)} {opp.div}</span></div>
                <div><small>The line</small><b>{rep.prob >= 0.5 ? t.abbr : opp.abbr} {Math.round(Math.max(rep.prob, 1 - rep.prob) * 100)}%</b><span>{rep.prob >= 0.55 ? "You're the favourite." : rep.prob <= 0.45 ? "You're the underdog." : "A coin flip."}</span></div>
                <div><small>Power play</small><b style={{ color: rankTone(rep.pp.rank, rep.teams) }}>{ORD(rep.pp.rank)}</b><span>{rep.pp.goals} PP goals · yours {ORD(rep.myPp.rank)}</span></div>
                <div><small>Penalty kill</small><b style={{ color: rankTone(rep.pk.rank, rep.teams) }}>{ORD(rep.pk.rank)}</b><span>unit strength · yours {ORD(rep.myPk.rank)}</span></div>
              </div>
              <div className="rk-prep-form"><small>Form · last 5</small><Form team={t} results={rep.myForm} /><Form team={opp} results={rep.form} /></div>
              <div className="rk-prep-who">
                <div><small>TOP LINE · {rep.lineOvr}</small><div>{rep.topLine.map((p) => <React.Fragment key={p.id}>{person(p)}</React.Fragment>)}</div></div>
                <div><small>TOP PAIR · {rep.pairOvr}</small><div>{rep.topPair.map((p) => <React.Fragment key={p.id}>{person(p)}</React.Fragment>)}</div></div>
                <div><small>In goal</small><div>{person(rep.goalie)}{rep.goalie?.stats?.gp > 0 && <span className="rk-prep-gnote">{rep.goalieNote}</span>}</div></div>
              </div>
              {rep.notes.slice(0, 3).map((n, i) => <div key={i} className={`rk-prep-note ${n.tone}`}>{n.text}</div>)}
              <div className="rk-prep-sub">Key matchups</div>
              {rep.matchups.map((m) => (
                <div key={m.label} className="rk-mu">
                  <span className="rk-mu-k" title={m.label}>{m.short}</span>
                  <span className="rk-mu-v"><b>{m.mine.name}</b> <span className="dim">{m.mineNote || `${m.mine.pos} ${m.mine.ovr}`}</span> <i>vs</i> <b>{m.theirs.name}</b> <span className="dim">{m.theirsNote || `${m.theirs.pos} ${m.theirs.ovr}`}</span></span>
                  <em className={`rk-edge ${m.tone}`}>{m.edge}</em>
                </div>
              ))}
            </section>
            <GamePlanPicker opp={opp} compact />
          </div>
          <div className="rk-prep-col">
            <section className="rk-prep-card">
              <div className="rk-prep-k">Ready check</div>
              {checks.map((c) => (
                <div key={c.key} className={`rk-check ${c.ok ? "ok" : "open"}`}>
                  <span className="rk-check-ico" aria-hidden>{c.ok ? "✓" : "!"}</span>
                  <span className="rk-check-text">{c.text}</span>
                  {c.fix && <button className="small rk-check-fix" onClick={() => fix(c)}>{c.fix.label}</button>}
                  {!c.fix && c.link && <button className="small rk-check-fix" onClick={() => { onClose?.(); go?.(...c.link.to); }}>{c.link.label}</button>}
                </div>
              ))}
            </section>
            <section className="rk-prep-card">
              <div className="rk-prep-k">Special teams <button className="link rk-prep-edit" onClick={toLines}>Edit on Lines →</button></div>
              {[["PP1", mine.PP?.[0]], ["PP2", mine.PP?.[1]], ["PK1", mine.PK?.[0]], ["PK2", mine.PK?.[1]]].map(([k, ids]) => (
                <div key={k} className="rk-unit"><b className={k.startsWith("PP") ? "rk-u-pp" : "rk-u-pk"}>{k}</b><span>{unit(ids).map((p) => lastName(p.name)).join(" · ") || <span className="dim">not set</span>}</span></div>
              ))}
              <div className="dim small">Your power play ranks {ORD(rep.myPp.rank)} and your penalty kill {ORD(rep.myPk.rank)} by the units you dress tonight.</div>
            </section>
            {(onPlay || onSim) && (
              <div className="rk-prep-go">
                {onPlay && <button className="primary" onClick={() => { onClose?.(); onPlay(); }}>▶ Play {mu.series ? `Game ${mu.gameNo}` : "Live"}</button>}
                {onSim && <button className="rk-prep-sim" onClick={() => { onClose?.(); onSim(); }}>Sim Game</button>}
              </div>
            )}
          </div>
        </div>
      </div>
      {picking && <ReplacementPicker pid={picking} onClose={() => setPicking(null)} />}
    </Modal>
  );
}
