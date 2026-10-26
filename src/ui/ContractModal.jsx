import React, { useMemo, useState } from "react";
import { useGame, Sheet, DBtn, money, ovrColor } from "./common.jsx";
import Headshot from "./Headshot.jsx";
import { evaluateOffer, submitOffer, capRoomByYear, termWindow, askFor, dealKind, dealStart, BONUS_OPTIONS, clubLook, dealNotes } from "../engine/contracts.js";
import { minSalaryForYear, maxSalaryForYear, capForYear } from "../engine/constants.js";
import { MARKET_MIN, marketOn } from "../engine/faMarket.js";
import { schemeFit } from "../engine/development.js";
import { projectedRole, ROLE_LABELS } from "../engine/teamPlanning.js";
import { POS_COLOR } from "./TradePage.jsx";
import { RoleTag } from "./ContractBits.jsx";
import "./contracts.css";
import "./negotiate.css";

const EYEBROW = { extension: "Contract extension", resign: "Re-sign", fa: "Free agent", holdout: "Holdout · new contract" };
const round2 = (n) => Math.round(n * 100) / 100;
const season = (y) => `${y}-${String(y + 1).slice(2)}`;
const ord = (n) => n + (["st", "nd", "rd"][((n + 90) % 100 - 10) % 10 - 1] || "th");
const GROUP = { C: "C", LW: "W", RW: "W", LD: "D", RD: "D", G: "G" };
const GROUP_NAME = { C: "center", W: "winger", D: "D", G: "goalie" };
const LOG_MAX = 8;

// The talk with his agent, kept on the save (league.talks[pid] = { year, log: [{ sal, yrs, r }] }).
// r: "accept" | "counter" | "reject" | "walk" | "kept"; old saves have none (an empty thread).
function talkLog(league, pid) {
  const t = league.talks?.[pid];
  return t && t.year === league.year ? t.log || [] : [];
}
function pushTalk(league, pid, entry) {
  league.talks ||= {};
  const log = [...talkLog(league, pid), entry].slice(-LOG_MAX);
  league.talks[pid] = { year: league.year, log };
}
const replyFor = (r) => {
  if (r.ok) return { r: "accept", msg: r.msg };
  if (r.keptBid) return { r: "kept", msg: r.msg, c: r.counter };
  if (r.walked) return { r: "walk", msg: "That's it. We're done talking this season." };
  if (r.countered) return { r: r.ev?.lowball ? "reject" : "counter", c: r.counter };
  return null;
};
const replyText = (e) => e.r === "accept" ? (e.msg || "You have a deal.")
  : e.r === "walk" ? "That's it. We're done talking this season."
  : e.r === "kept" ? (e.msg || "Your earlier offer stays on the table.")
  : e.r === "reject" ? `Not even close. He'd need ${money(e.c?.aav)} a year${e.c?.yrs ? ` over ${e.c.yrs}` : ""}.`
  : `He'd sign for ${money(e.c?.aav)} a year${e.c?.yrs ? ` over ${e.c.yrs}` : ""}.`;

function Dots({ n }) { return <span className="ng-dots" aria-label={`${n} of 3`}>{[0, 1, 2].map((i) => <i key={i} className={i < n ? "on" : ""} />)}</span>; }

// The league's contracts at his position group, biggest first, with your offer slotted in.
function marketLadder(league, p, aav) {
  const g = GROUP[p.pos] || p.pos;
  const rows = Object.values(league.players).filter((x) => x.tid >= 0 && x.id !== p.id && (x.yrs || 0) > 0 && x.cap > 0 && (GROUP[x.pos] || x.pos) === g).map((x) => ({ id: x.id, name: x.name, cap: x.cap, tid: x.tid })).sort((a, b) => b.cap - a.cap);
  const rank = rows.filter((r) => r.cap > aav + 1e-6).length + 1;
  const all = [...rows.slice(0, rank - 1), { id: "you", name: p.name, cap: aav, you: true }, ...rows.slice(rank - 1)];
  const lo = Math.max(1, rank - 3), hi = Math.min(all.length, rank + 2);
  const shown = [];
  if (lo > 0) shown.push({ ...all[0], n: 1 });
  if (lo > 1) shown.push({ gap: true });
  for (let i = lo; i < hi; i++) shown.push({ ...all[i], n: i + 1 });
  if (rank === 1) shown.splice(0, shown.length, ...all.slice(0, 4).map((r, i) => ({ ...r, n: i + 1 })));
  return { rank, rows: shown, label: `${ord(rank)}-highest-paid ${GROUP_NAME[g] || g}` };
}

// The one contract table in the game (Gridiron 3.71's negotiation table): his agent's thread, what
// he wants, where the offer lands in his position's market, and your offer. The rules are the
// engine's (contracts.js): a short offer draws a counter, four of them (three low-balls) and he walks.
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
  const [tick, setTick] = useState(0);
  const ev = useMemo(() => evaluateOffer(league, p, { aav, yrs, bonusPct: bonus, kind }), [league, p, aav, yrs, bonus, kind, tick]);
  const look = useMemo(() => clubLook(league, p, t), [league, p, t]);
  const notes = useMemo(() => dealNotes(league, p, kind), [league, p, kind]);
  const termAsks = useMemo(() => Array.from({ length: win.max }, (_, i) => askFor(league, p, i + 1, kind).aav), [league, p, kind, win.max]);
  const ladder = useMemo(() => marketLadder(league, p, aav), [league, p, aav]);
  const ask = ev.ask;
  const lo = minSalaryForYear(start), hi = maxSalaryForYear(start);
  const step = aav >= 5 ? 0.25 : 0.1;
  const rooms = capRoomByYear(league, t, { aav, yrs, start, pid: p.id });
  const total = round2(aav * yrs);
  const market = ev.market;
  const log = talkLog(league, p.id);
  const n = league.negotiations?.[p.id];
  const standing = n?.year === league.year ? n : null;
  const lastEntry = log[log.length - 1];
  const counter = standing?.status === "counter" && standing.counter ? { aav: standing.counter, yrs: standing.term } : lastEntry?.c && (lastEntry.r === "counter" || lastEntry.r === "kept") ? lastEntry.c : null;
  const walked = ev.walked;
  const left = walked ? 0 : Math.max(0, 3 - (ev.rounds || 0));
  const patienceClr = left >= 3 ? "#22c55e" : left === 2 ? "#eab308" : "#ef4444";
  const rivals = kind === "fa" && market ? marketOn(league, p).others : 0;
  const first = p.name.split(" ")[0];
  const capPct = (100 * aav) / capForYear(start);
  const blocked = walked || !ev.capOk || !ev.cashOk || !ev.roomOk || !ev.slotOk;
  const note = kind === "extension" ? `The new deal starts in ${season(start)}, when his current contract runs out. Walk away and he'll wait for re-sign week.`
    : kind === "resign" ? `He is out of contract. A new deal starts next season and must fit under the ${season(start)} cap.`
    : kind === "holdout" ? "He signs today and joins the lineup. The deal starts this season."
    : null;

  const send = (o) => {
    const r = submitOffer(league, p.id, { aav: o.aav, yrs: o.yrs, bonusPct: bonus, kind });
    const rep = replyFor(r);
    if (rep) pushTalk(league, p.id, { sal: o.aav, yrs: o.yrs, ...rep });
    toast(r.msg, 5000); commit(); setTick((x) => x + 1);
    if (r.ok) onClose();
  };
  const takeCounter = () => { if (!counter) return; setYrs(counter.yrs); setAav(counter.aav); send(counter); };

  // What he wants most: his priority, then ice time, system fit and winning with his weight and your fit.
  const role = projectedRole(league, t, p);
  const fit = p.pos === "G" ? null : schemeFit(p, t) > 0;
  const style = t.strategy || t.coach?.style || "balanced";
  const sysName = style === "attack" ? "attacking system" : style === "defend" ? "defensive system" : "balanced system";
  const contender = look.rows.find((r) => r.key === "winning");
  const pri = look.priority;
  const wantRows = [
    { k: "Ice time", w: pri === "role" ? 3 : 2, ok: role !== "depth" && role !== "backup" ? true : false, v: role === "depth" || role === "backup" ? `He'd be ${ROLE_LABELS[role]?.toLowerCase() || role} for you` : `${ROLE_LABELS[role] || role} with you` },
    { k: "System fit", w: 1, ok: fit, v: fit == null ? "Goalies play any system" : fit ? `Your ${sysName} suits his game` : `Your ${sysName} doesn't feature him` },
    { k: "Winning", w: pri === "winning" ? 3 : 1, ok: contender?.good ? true : contender?.bad ? false : null, v: contender?.v || "" },
  ];
  if (pri === "security") wantRows.push({ k: "Term", w: 3, ok: yrs >= ev.prefs.preferredTerm ? true : false, v: `He'd like about ${ev.prefs.preferredTerm} years; you're offering ${yrs}` });
  if (pri === "loyalty") { const f = look.rows.find((r) => r.key === "loyalty"); wantRows.push({ k: "Familiar faces", w: 3, ok: f?.good ? true : null, v: f?.v || "" }); }
  const priTitle = { winning: "A winner", role: "Ice time", security: "Term and security", loyalty: "Familiar faces" }[pri] || look.wants;

  const maxRoom = Math.max(1, ...rooms.map((r) => Math.abs(r.room)));
  const askPct = Math.min(100, Math.max(0, ((ask.aav - lo) / (hi - lo)) * 100));
  const cta = ev.onSpot ? `Sign ${money(aav)} × ${yrs}` : `Offer ${money(aav)} × ${yrs}`;
  const team = league.teams[p.tid] || t;

  const offerCol = (
    <div className="ng-col ng-offer">
      <div className="ng-k">Length</div>
      <div className="ng-terms">
        {termAsks.map((a, i) => { const y = i + 1, off = y < win.lo || y > win.hi; return (
          <button key={y} type="button" className={`ng-term${yrs === y ? " on" : ""}${off ? " off" : ""}`} disabled={off} onClick={() => { setYrs(y); setAav((v) => round2(Math.min(hi, Math.max(lo, v)))); }} title={y < win.lo ? `He wants at least ${win.lo} years` : y > win.hi ? `He won't go past ${win.hi}` : ""}>
            <b>{y} yr{y > 1 ? "s" : ""}</b><small>{off ? "—" : money(a)}</small>
          </button>); })}
      </div>
      <div className="ng-box">
        <div className="ng-k">Your offer per year</div>
        <div className="ng-money">
          <button type="button" onClick={() => setAav((v) => round2(Math.max(lo, v - step)))} aria-label="Lower offer">−</button>
          <div><b>{money(aav)}</b><small>{capPct.toFixed(1)}% of the cap · {money(total)} total</small></div>
          <button type="button" onClick={() => setAav((v) => round2(Math.min(hi, v + step)))} aria-label="Raise offer">+</button>
        </div>
        <div className="ng-slider">
          <input type="range" min={lo} max={hi} step={0.05} value={aav} onChange={(e) => setAav(round2(Number(e.target.value)))} aria-label="Offer per year" />
          <span className="ng-tick" style={{ left: `${askPct}%` }}>▲ his ask</span>
        </div>
        <div className="ng-row"><span>{kind === "holdout" || (kind === "fa" && start === league.year) ? "Cap room after" : `${season(start)} cap room after`}</span><b style={{ color: rooms[0].room >= 0 ? "#22c55e" : "#ef4444" }}>{money(rooms[0].room)}</b></div>
      </div>
      <div className="ng-box">
        <div className="ng-k">Signing bonus <small>· paid now from club cash ({money(ev.cash)} available)</small></div>
        <div className="ng-chips">{BONUS_OPTIONS.map((b) => <button key={b} type="button" className={bonus === b ? "on" : ""} onClick={() => setBonus(b)}>{b === 0 ? "None" : `${b}%`}</button>)}</div>
        <div className="ng-small">{bonus ? <>Cash now: <b>{money(ev.bonusCash)}</b>. Money up front makes him a little easier to sign; the cap hit is unchanged.{market && !ev.onSpot ? " It comes back if he signs elsewhere." : ""}</> : "A bonus is cash paid at signing: he takes a little less per year. The cap hit is unchanged."}</div>
      </div>
      <div className="ng-box">
        <div className="ng-k">Cap room with this deal</div>
        <div className="ng-bars">{rooms.map((r) => <div key={r.year}><span className="ng-bar"><i style={{ height: `${Math.max(4, (Math.abs(r.room) / maxRoom) * 100)}%`, background: r.room >= 0 ? "#22c55e" : "#ef4444" }} /></span><b style={{ color: r.room >= 0 ? "#22c55e" : "#ef4444" }}>{money(r.room)}</b><small>{season(r.year)}</small></div>)}</div>
        <div className="ng-small">Before re-signings, rookies and free agents in later years.</div>
      </div>
    </div>
  );

  return (
    <Sheet title="Negotiation" onClose={onClose} wide className="ng-sheet">
      <div className="ng">
        <div className="ng-head">
          <Headshot p={p} team={team} size={76} />
          <div className="ng-who">
            <small>{EYEBROW[kind]}</small>
            <b>{p.name}</b>
            <span><i className="gg-pos" style={{ background: POS_COLOR[p.pos] }}>{p.pos}</i><RoleTag p={p} /><span className="ng-nowrap">Age {p.age}{kind === "fa" ? "" : ` · now ${money(p.prevCap || p.cap)}`}</span></span>
          </div>
          <div className="ng-ovr"><b style={{ color: ovrColor(p.ovr) }}>{p.ovr}</b><small>OVR</small></div>
        </div>
        <div className="ng-status">
          <div className="ng-chip"><small>Asking</small><b>{money(ask.aav)}<em>/yr</em></b></div>
          <div className="ng-chip"><small>His patience</small><span className="ng-pat">{[0, 1, 2].map((i) => <i key={i} style={{ background: i < left ? patienceClr : undefined }} />)}</span><em>{walked ? "Talks are over" : left ? `${left} offer${left > 1 ? "s" : ""} left` : "One more short offer ends it"}</em></div>
          {rivals > 0 && <div className="ng-chip hot"><small>Other clubs are calling</small><b>{rivals} offer{rivals > 1 ? "s" : ""}</b></div>}
        </div>
        {(note || notes.length > 0) && <div className="ng-note">{note && <div>{note}</div>}{notes.map((x, i) => <div key={i} className={`ng-n ${x.tone}`}>{x.text}</div>)}</div>}
        <div className="ng-grid">
          {offerCol}
          <div className="ng-col ng-room">
            <div className="ng-box">
              <div className="ng-k">His agent</div>
              <div className="ng-thread">
                <div className="ng-b agent">"{first} is looking for about <b>{money(termAsks[initYrs - 1])}</b> a year on a {initYrs}-year deal."</div>
                {rivals > 0 && <div className="ng-b agent">"Other clubs have made him offers. Give him a reason to choose you."</div>}
                {log.map((e, i) => <React.Fragment key={i}><div className="ng-b you">{money(e.sal)} a year · {e.yrs} yr{e.yrs > 1 ? "s" : ""}</div><div className={`ng-b agent ${e.r}`}>{replyText(e)}</div></React.Fragment>)}
              </div>
            </div>
            <div className="ng-box">
              <div className="ng-k">What he wants most</div>
              <div className="ng-pri">{priTitle}</div>
              {wantRows.map((r) => <div key={r.k} className={`ng-want${r.w === 3 ? " top" : ""}`}><span>{r.k}</span><Dots n={r.w} /><span className={`ng-fit ${r.ok === true ? "y" : r.ok === false ? "n" : ""}`}>{r.ok === true ? "✓" : r.ok === false ? "✕" : "·"}</span><span className="ng-v">{r.v}</span></div>)}
              <div className="ng-small">A club that gives him what he wants can sign him for less.</div>
            </div>
            <div className="ng-box">
              <div className="ng-k">The market <small>· league cap hits, {GROUP_NAME[GROUP[p.pos]] || p.pos}s</small></div>
              <div className={`ng-rank${ladder.rank <= 5 ? " gold" : ""}`}>Your offer: {ladder.label}</div>
              <div className="ng-ladder">{ladder.rows.map((r, i) => r.gap ? <div key={`g${i}`} className="ng-lgap">⋯</div> : <div key={r.id} className={`ng-lrow${r.you ? " you" : ""}`}><span>{r.n}</span><b>{r.name}</b>{r.you && <em>your offer</em>}<span className="ng-lcap">{money(r.cap)}</span></div>)}</div>
            </div>
            {ev.reasons.length > 0 && <div className="ng-reasons">{ev.reasons.map((r, i) => <div key={i}>• {r}</div>)}</div>}
            {market && p.ovr >= MARKET_MIN && ev.overpayAt && <div className="ng-small">A big overpay ({money(ev.overpayAt)}+) signs him on the spot.</div>}
          </div>
        </div>
        <div className="ng-foot">
          <DBtn onClick={onClose}>Not now</DBtn>
          {counter && !walked && <DBtn kind="gold" onClick={takeCounter} disabled={blocked}>Accept counter {money(counter.aav)} × {counter.yrs}</DBtn>}
          <DBtn kind="primary" onClick={() => send({ aav, yrs })} disabled={blocked}>{cta}</DBtn>
        </div>
      </div>
    </Sheet>
  );
}
