// The weekly injury report (Gridiron 3.70 / 3.33): one corner card for your club's injuries this
// week. Who's newly out and for how long (games, or the playoff round he's back for), IR and LTIR,
// who holds each injured regular's spot tonight with a Change button, who's still out and who's
// back. It shows when something has changed since you last closed it, and replaces the injury
// toasts and pauses. ReplacementPicker (also used by Game Prep) lists every healthy player not
// dressed, rated for that spot, with the off-position penalty, and puts your pick into the lines.
import React, { useEffect, useState } from "react";
import { useGame, Modal, money } from "./common.jsx";
import { POS_COLOR } from "./TradePage.jsx";
import { weeklyInjuryReport, closeInjuryReport, reportBaseline, injuryReturn, outPhrase } from "../engine/injuryReport.js";
import { replacementOptions, chooseReplacement, rememberSlots } from "../engine/injuries.js";
import "./prep.css";

const Pos = ({ pos }) => <span className="gg-pos" style={{ background: POS_COLOR[pos] || "#64748b" }}>{pos}</span>;
const tone = (v) => (v >= 85 ? "#22c55e" : v >= 79 ? "#84cc16" : v >= 73 ? "#eab308" : v >= 67 ? "#f97316" : "#ef4444");

// Keeps the memory of each regular's spot current (an injured player keeps the spot he held), and
// gives an old save its starting point for the report. Bookkeeping only; saved with the next commit.
export function useInjuryBookkeeping(league) {
  useEffect(() => {
    const t = league?.teams?.[league.userTid];
    if (!t) return;
    rememberSlots(league, t);
    if (!t.injuryCard) t.injuryCard = reportBaseline(league, t);
  });
}

// Who plays in an injured regular's spot. pid: the injured player.
export function ReplacementPicker({ pid, onClose }) {
  const { league: lg, commit, toast } = useGame();
  const t = lg.teams[lg.userTid];
  const out = lg.players[pid];
  const o = out ? replacementOptions(lg, t, pid) : null;
  if (!out || !o) return null;
  const ret = injuryReturn(lg, out);
  const pick = (id) => { const r = chooseReplacement(lg, t, pid, id); toast(r.msg, r.ok ? 3500 : 5000); if (r.ok) { commit(); onClose(); } };
  const row = (x, btn, farm) => (
    <div key={x.p.id} className="rk-rep-row">
      <Pos pos={x.p.pos} />
      <div className="rk-rep-who">
        <div><b>{x.p.name}</b> <span style={{ color: tone(x.p.ovr) }}>{x.p.ovr}</span>
          <span className="rk-rep-at"> · at {o.name.short} <b style={{ color: tone(x.r) }}>{x.r}</b></span>
          {String(x.p.id) === String(o.bestId) && <span className="rk-tag good">BEST FIT</span>}
          {String(x.p.id) === String(o.nowId) && <span className="rk-tag">IN NOW</span>}
          {x.pen > 0 && <span className="rk-tag warn" title={`${x.note}: −${x.pen}`}>−{x.pen} {x.note}</span>}
        </div>
        <small>Age {x.p.age}{farm ? " · AHL, needs a call-up" : ""}{x.p.cap ? ` · ${money(x.p.cap)}` : ""}</small>
      </div>
      {btn}
    </div>
  );
  return (
    <Modal title={`Replace ${out.name}`} onClose={onClose} bare className="rk-rep-modal">
      <div className="rk-rep">
        <div className="rk-rep-head">
          <span className="rk-rep-ico" aria-hidden>🚑</span>
          <div><small>REGULAR DOWN</small><b>{out.name} ({o.name.short}) is {outPhrase(ret)}</b></div>
        </div>
        <p className="rk-rep-lede">Who plays {o.name.long} while he's out? Your pick takes his spot in the lines until you change it; when he's healthy he works back in. Everyone is rated at {o.name.short}, with a penalty for playing off position.</p>
        {o.roster.map((x) => row(x, <button className={String(x.p.id) === String(o.nowId) ? "primary small" : "small"} onClick={() => pick(x.p.id)}>{String(x.p.id) === String(o.nowId) ? "Keep him" : "Dress him"}</button>))}
        {!o.roster.length && <div className="dim small rk-rep-none">Nobody healthy on the NHL roster can play there.</div>}
        {o.farm.length > 0 && <>
          <div className="rk-rep-sub">FROM THE AHL</div>
          {o.farm.map((x) => row(x, <button className="small" onClick={() => pick(x.p.id)}>Call up</button>, true))}
        </>}
      </div>
    </Modal>
  );
}

function InjRow({ r, onChange, openPlayer }) {
  return (
    <div className="rk-inj-row">
      <div className="rk-inj-top">
        <Pos pos={r.p.pos} />
        <div className="rk-inj-who">
          <button className="link rk-inj-name" onClick={() => openPlayer?.(r.p.id)}>{r.p.name}</button>
          <small>{r.p.injuryNote ? `${r.p.injuryNote[0].toUpperCase()}${r.p.injuryNote.slice(1)}` : "Injury"} · {r.ret?.list ? <b className={`rk-list ${r.ret.list.toLowerCase()}`}>{r.ret.list}</b> : null}{r.ret?.list ? " · " : ""}{r.ret?.text || "out"}</small>
        </div>
        {r.slot && <button className="small rk-inj-change" onClick={() => onChange(r.p.id)}>Change</button>}
      </div>
      {r.slot && <div className="rk-inj-sub">{r.slotName.short}: {r.fill ? <><b>{r.fill.name}</b> {r.fillFit ? <span style={{ color: tone(r.fillFit.r) }}>{r.fillFit.r}</span> : null}{r.chosen ? " · in his spot" : " · covering tonight"}</> : <span className="bad">nobody healthy left: call someone up</span>}</div>}
    </div>
  );
}

export default function InjuryReportCard() {
  const { league: lg, commit, openPlayer } = useGame();
  const [picking, setPicking] = useState(null);
  useInjuryBookkeeping(lg);
  const rep = lg ? weeklyInjuryReport(lg) : null;
  if (!rep) return picking ? <ReplacementPicker pid={picking} onClose={() => setPicking(null)} /> : null;
  const close = () => { closeInjuryReport(lg); commit(); };
  const { out, still, back } = rep;
  const coach = lg.settings?.coachLines;
  return (
    <>
      <section className="rk-injcard" role="region" aria-label="Injury report">
        <div className="rk-injcard-head">
          <span className="rk-injcard-ico" aria-hidden>🏥</span>
          <div>
            <small>INJURY REPORT</small>
            <b>{rep.period.label}{out.length ? ` · ${out.length} out` : ""}{back.length ? ` · ${back.length} back` : ""}</b>
          </div>
          <button className="ghost rk-injcard-x" aria-label="Close the injury report" onClick={close}>×</button>
        </div>
        <div className="rk-injcard-body">
          {out.length > 0 && <div className="rk-inj-sec"><div className="rk-inj-k out">OUT</div>{out.map((r) => <InjRow key={r.p.id} r={r} onChange={setPicking} openPlayer={openPlayer} />)}</div>}
          {still.length > 0 && <div className="rk-inj-sec"><div className="rk-inj-k still">STILL OUT</div><div className="rk-inj-still">{still.map((r, i) => <span key={r.p.id}>{i ? ", " : ""}<button className="link" onClick={() => openPlayer?.(r.p.id)}>{r.p.name}</button> <span className="dim">({r.ret?.short || "out"})</span></span>)}</div></div>}
          {back.length > 0 && <div className="rk-inj-sec"><div className="rk-inj-k back">BACK</div><div className="rk-inj-still">{back.map((p, i) => <span key={p.id}>{i ? ", " : ""}<button className="link" onClick={() => openPlayer?.(p.id)}>{p.name}</button></span>)}</div></div>}
        </div>
        <div className="rk-injcard-foot">{coach ? "Your head coach dresses the best healthy scratch in any spot you don't change." : "Regulars you don't change are covered by your best healthy scratch."}</div>
      </section>
      {picking && <ReplacementPicker pid={picking} onClose={() => setPicking(null)} />}
    </>
  );
}
