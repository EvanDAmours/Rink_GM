import React, { useMemo, useState } from "react";
import { useGame, Modal, money, ovrColor } from "./common.jsx";
import { evaluateOffer, submitOffer, capRoomByYear, termWindow, askFor, dealKind, dealStart, BONUS_OPTIONS, clubLook, dealNotes } from "../engine/contracts.js";
import { minSalaryForYear, maxSalaryForYear } from "../engine/constants.js";
import { MARKET_MIN } from "../engine/faMarket.js";
import { POS_COLOR } from "./TradePage.jsx";
import { RoleTag } from "./ContractBits.jsx";
import "./contracts.css";

const KIND_LABEL = { extension: "CONTRACT EXTENSION", resign: "RE-SIGNING", fa: "FREE AGENT OFFER", holdout: "HOLDOUT · NEW CONTRACT" };
const initials = (name) => name.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
const round2 = (n) => Math.round(n * 100) / 100;
const mood = (i) => (i >= 0.8 ? ["Eager", "#22c55e"] : i >= 0.6 ? ["Interested", "#84cc16"] : i >= 0.4 ? ["Listening", "#eab308"] : i >= 0.2 ? ["Cool", "#f97316"] : ["Not interested", "#ef4444"]);
const season = (y) => `${y}-${String(y + 1).slice(2)}`;

// The one contract table in the game. Years, a per-year slider with the ask marked, a
// signing bonus paid from club cash, the cap room it leaves for four seasons, how your club looks
// to him, and the player's live interest. He counters when the number is short, and walks after
// enough low-balls. In July a free agent's offer goes on the market table (faMarket.js).
export default function ContractModal({ p, kind: forcedKind, onClose }) {
  const { league, commit, toast } = useGame();
  const t = league.teams[league.userTid];
  const kind = forcedKind || dealKind(league, p);
  const start = dealStart(league, kind);
  const win = termWindow(p, kind);
  const ask0 = askFor(league, p, undefined, kind);
  const initYrs = Math.min(Math.max(ask0.yrs, win.lo), win.hi);
  const [yrs, setYrs] = useState(initYrs);
  const [aav, setAav] = useState(() => round2(askFor(league, p, initYrs, kind).aav * 0.93));
  const [bonus, setBonus] = useState(0);
  const [last, setLast] = useState(null);
  const ev = useMemo(() => evaluateOffer(league, p, { aav, yrs, bonusPct: bonus, kind }), [league, p, aav, yrs, bonus, kind]);
  const look = useMemo(() => clubLook(league, p, t), [league, p, t]);
  const notes = useMemo(() => dealNotes(league, p, kind), [league, p, kind]);
  const ask = ev.ask;
  const lo = minSalaryForYear(start), hi = maxSalaryForYear(start);
  const step = aav >= 5 ? 0.25 : 0.1;
  const rooms = capRoomByYear(league, t, { aav, yrs, start, pid: p.id });
  const [label, color] = mood(ev.interest);
  const total = round2(aav * yrs);
  const market = ev.market;
  const note = kind === "extension" ? `The new deal starts in ${season(start)}, when his current contract runs out, so it has to fit under that season's cap. Walk away and he'll wait for re-sign week.`
    : kind === "resign" ? `He is out of contract. A new deal starts next season and must fit under the ${season(start)} cap. Let him walk and he goes to the open market.`
    : kind === "holdout" ? "He signs today and joins the lineup. The deal starts this season and must fit under this season's cap and the 23-man roster."
    : market ? null
    : ["resign", "preseason"].includes(league.phase) ? "He signs as soon as he agrees. The deal starts this season." : "An in-season signing starts now and counts against this year's cap.";
  const current = kind === "fa" ? `${p.age} yrs · asking ${money(ask0.aav)} × ${ask0.yrs}` : `Age ${p.age} · now ${money(p.prevCap || p.cap)}${p.yrs > 0 ? ` · ${p.yrs} yr${p.yrs > 1 ? "s" : ""} left` : " · unsigned"}`;
  const offer = () => {
    const r = submitOffer(league, p.id, { aav, yrs, bonusPct: bonus, kind });
    toast(r.msg, 5000); commit();
    if (r.ok) onClose();
    else setLast(r);
  };
  const takeCounter = () => { if (!last?.counter) return; setYrs(last.counter.yrs); setAav(last.counter.aav); setLast(null); };
  const n = league.negotiations?.[p.id];
  const standing = n?.year === league.year ? n : null;
  const cta = ev.onSpot ? "Sign him now" : market ? "Put the offer on the table" : "Make offer";
  return (
    <Modal title={KIND_LABEL[kind]} onClose={onClose}>
      <div className="gg-cm">
        <div className="gg-cm-head">
          <span className="gg-cm-ini" style={{ background: POS_COLOR[p.pos] || "#334155" }}>{initials(p.name)}</span>
          <div className="gg-cm-who"><b>{p.name}</b><span><i className="gg-pos" style={{ background: POS_COLOR[p.pos] }}>{p.pos}</i> {current}<RoleTag p={p} /></span></div>
          <div className="gg-cm-ovr"><b style={{ color: ovrColor(p.ovr) }}>{p.ovr}</b><small>OVR</small></div>
        </div>
        {note && <div className="gg-cm-note">{note}</div>}
        {notes.length > 0 && <div className="ct-notes">{notes.map((x, i) => <div key={i} className={`ct-note ${x.tone}`}>{x.tone === "up" ? "📈 " : x.tone === "down" ? (kind === "holdout" ? "✋ " : "📉 ") : x.tone === "loyal" ? "❤️ " : "📋 "}{x.text}</div>)}</div>}
        <div className="ct-look" aria-label="How your club looks to him">
          <div className="ct-look-h">HOW YOUR CLUB LOOKS TO HIM · he wants {look.wants} most</div>
          {look.rows.map((r) => <React.Fragment key={r.k}><span className="ct-look-k">{r.k}</span><span className={`ct-look-v${r.good ? " good" : r.bad ? " bad" : ""}`}>{r.v}{r.wants && <span className="want">WANTS MOST</span>}</span></React.Fragment>)}
        </div>
        <div className="gg-cm-row"><span>Interest</span><div className="gg-cm-bar"><i style={{ width: `${Math.round(ev.interest * 100)}%`, background: color }} /></div><b style={{ color }}>{label}</b></div>
        <div className="gg-cm-k">YEARS <small>{win.lo === win.hi ? `will only sign for ${win.hi} year${win.hi > 1 ? "s" : ""}` : ev.prefs.priority === "security" ? `wants ${Math.min(ev.prefs.preferredTerm, win.hi)}+` : `prefers ${Math.min(Math.max(ask0.yrs, win.lo), win.hi)}`} · {win.lo === win.hi ? "" : `${win.lo}–${win.hi} years on the table · `}agent priority: {ev.prefs.priority}</small></div>
        <div className="gg-cm-years">{Array.from({ length: win.max }, (_, i) => i + 1).map((y) => <button key={y} className={yrs === y ? "on" : y < win.lo || y > win.hi ? "off" : ""} onClick={() => { setYrs(y); setAav((v) => round2(Math.min(hi, Math.max(lo, v)))); }} title={y < win.lo ? `He wants at least ${win.lo} years` : y > win.hi ? `He won't go past ${win.hi}` : ""}>{y}</button>)}</div>
        <div className="gg-cm-k">YOUR OFFER PER YEAR <small>· he's asking {money(ask.aav)}{ev.floor !== ask.aav ? ` · would take ${money(ev.floor)}` : ""}{market && p.ovr >= MARKET_MIN && ev.overpayAt ? ` · signs on the spot at ${money(ev.overpayAt)}` : ""}</small></div>
        <div className="gg-cm-amount"><button onClick={() => setAav((v) => round2(Math.max(lo, v - step)))} aria-label="Lower offer">−</button><b>{money(aav)}</b><button onClick={() => setAav((v) => round2(Math.min(hi, v + step)))} aria-label="Raise offer">+</button></div>
        <input className="gg-cm-slider" type="range" min={lo} max={hi} step={0.05} value={aav} onChange={(e) => setAav(round2(Number(e.target.value)))} aria-label="Offer per year" style={{ "--ask": `${((ev.floor - lo) / (hi - lo)) * 100}%` }} />
        <div className="gg-cm-row2"><span>Total <b>{money(total)}</b> over {yrs} yr{yrs > 1 ? "s" : ""}</span><span>{kind === "holdout" || (kind === "fa" && start === league.year) ? "Cap space after" : `${season(start)} cap after`} <b style={{ color: rooms[0].room >= 0 ? "#22c55e" : "#ef4444" }}>{money(rooms[0].room)}</b></span></div>
        <div className="gg-cm-cap"><div className="gg-cm-k">CAP ROOM WITH THIS DEAL</div><div className="gg-cm-capgrid">{rooms.map((r) => <div key={r.year}><small>{r.year}</small><b style={{ color: r.room >= 0 ? "#22c55e" : "#ef4444" }}>{money(r.room)}</b></div>)}</div><small className="dim">Before re-signings, rookies and free agents in later years.</small></div>
        <div className="gg-cm-k">SIGNING BONUS <small>· paid now from club cash ({money(ev.cash)} available)</small></div>
        <div className="gg-cm-years bonus">{BONUS_OPTIONS.map((b) => <button key={b} className={bonus === b ? "on" : ""} onClick={() => setBonus(b)}>{b === 0 ? "None" : `${b}%`}</button>)}</div>
        <div className="gg-cm-note small">{bonus ? <>Cash now: <b>{money(ev.bonusCash)}</b>. Players like money up front: interest rises and he'll take a little less per year. The cap hit is unchanged.{market && !ev.onSpot ? " It comes back if he signs elsewhere." : ""}</> : "No bonus. A bonus is cash from the arena account paid at signing; it lifts interest and trims his number a little."}</div>
        {last?.countered && <div className="gg-cm-counter"><span>{last.keptBid ? last.msg : <>His agent counters: <b>{money(last.counter.aav)} × {last.counter.yrs}</b> · round {standing?.rounds || 1} of 4</>}</span><button className="small" onClick={takeCounter}>Use the counter</button></div>}
        {(last?.walked || ev.walked) && <div className="gg-cm-counter bad">His agent has walked away for this season.</div>}
        {!last && ev.reasons.length > 0 && <div className="gg-cm-reasons">{ev.reasons.map((r, i) => <div key={i}>• {r}</div>)}</div>}
        <div className="gg-cm-actions"><button className="ghost" onClick={onClose}>Not now</button><button className="primary" disabled={ev.walked || !ev.capOk || !ev.cashOk || !ev.roomOk || !ev.slotOk} onClick={offer}>{cta}</button></div>
      </div>
    </Modal>
  );
}
