// Draft day on the floor (Gridiron 1.9994, 2.6, 2.19, 2.36, 3.4, 3.5, 3.39): the sticky clock bar
// with Pause, speed and the sims; the broadcast On the Clock stage; "The pick is in" for round 1;
// the steals/reaches ticker; the phone (incoming calls, trade up for any pick, shop your picks);
// the Up next queue. The engine side is engine/draftClock.js.
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGame, TeamBadge, PlayerName } from "./common.jsx";
import { momentColors } from "./MomentFrame.jsx";
import { POS_COLOR } from "./TradePage.jsx";
import { currentSlot } from "../engine/draft.js";
import { csRank, gradeClass } from "../engine/scouting.js";
import { pickValueTag } from "../engine/draftRecap.js";
import {
  DRAFT_CLOCK, clockTick, clockText, draftClock, draftLive, tickDraftClock, simThisPick, simToMyPick, cycleDraftSpeed, setDraftPaused,
  nextUserSlot, clubNeeds, shortPick, quoteTradeUp, tradeUpCalls, tradeDownCalls, acceptCall, askForMore, hangUp, dismissCall,
} from "../engine/draftClock.js";
import "./draft.css";

const ord = (n) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const pickOf = (league, id) => league.draftPicks.find((p) => p.id === id);

// Phone layout (the same breakpoint the live game uses).
export function usePhone() {
  const q = "(max-width: 640px)";
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = typeof window !== "undefined" ? window.matchMedia?.(q) : null;
    if (!m) return undefined;
    const on = () => setPhone(m.matches);
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, []);
  return phone;
}

export function PosChip({ pos }) {
  return <span className="gg-pos" style={{ background: POS_COLOR[pos] || "#64748b" }}>{pos}</span>;
}

// STEAL +12 / REACH -15 against Central Scouting.
export function ValueTag({ overall, csr, small }) {
  const t = pickValueTag(overall, csr);
  if (!t) return null;
  return <span className={`dd-vtag ${t.kind}${small ? " sm" : ""}`} title={`Central Scouting #${csr}`}>{t.kind === "steal" ? "STEAL" : "REACH"} {t.d > 0 ? `+${t.d}` : t.d}</span>;
}

// The latest picks, newest first, steals and reaches called out. Scroll it sideways for older picks.
export function DraftTicker() {
  const { league } = useGame();
  const d = league.draft;
  const made = (d?.slots || []).slice(0, d?.idx || 0).filter((s) => s.pid).slice(-32).reverse();
  if (!made.length) return null;
  return (
    <div className="dd-ticker" aria-label="Latest picks">
      <div className="dd-ticker-k">LATEST</div>
      <div className="dd-ticker-list">
        {made.map((s, i) => {
          const p = league.players[s.pid];
          return (
            <span key={s.overall} className={`dd-tick${s.owner === league.userTid ? " mine" : ""}${i === 0 ? " new" : ""}`}>
              <span className="dd-tick-n">#{s.overall}</span><b>{league.teams[s.owner]?.abbr}</b><span>{p?.name}</span><span className="dd-tick-pos">{p?.pos}</span><ValueTag overall={s.overall} csr={s.csr} small />
            </span>
          );
        })}
      </div>
    </div>
  );
}

// The commissioner at the podium: every first-round pick (not on Fast).
export function PickIsIn({ overall, onDone, ms = 2300 }) {
  const { league } = useGame();
  const done = useRef(onDone);
  done.current = onDone;
  // keyed on the pick only: the clock re-renders often and must not restart this
  useEffect(() => { const t = setTimeout(() => done.current(), ms); return () => clearTimeout(t); }, [overall, ms]);
  const s = league.draft?.slots.find((x) => x.overall === overall);
  const p = s?.pid && league.players[s.pid];
  if (!s || !p) return null;
  const t = league.teams[s.owner];
  const { clr, ac } = momentColors(t);
  return (
    <div className="dd-pickin-wrap" onClick={onDone} role="status" aria-live="polite">
      <div className="dd-pickin">
        <div className="dd-stripe" style={{ "--c1": clr, "--c2": ac }} />
        <div className="dd-pickin-body" style={{ "--clr": clr }}>
          <TeamBadge team={t} size={64} decorative />
          <div className="dd-pickin-text">
            <div className="dd-k gold">THE PICK IS IN</div>
            <div className="dd-quote">"With the {ord(s.overall)} pick in the {league.draft.year} NHL Draft, the {t.city} {t.name} select…"</div>
            <div className="dd-pickin-name">{p.name}</div>
            <div className="dd-pickin-meta"><PosChip pos={p.pos} /><span>{p.bio?.team}{p.bio?.lg ? ` (${p.bio.lg})` : ""}</span>{s.grade && <span className="dd-gradechip">Grade {s.grade}</span>}<ValueTag overall={s.overall} csr={s.csr} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- The clock ----------

// Runs the draft clock while the floor is on screen: one clock second per tick (real seconds in
// round 1, quicker after on Normal and Fast). `hold` stops it without pausing the draft (a moment
// on screen, a trade panel open, the tab hidden). onPick(result) after every pick it makes.
function useClockRunner({ hold, onPick }) {
  const { league, commit } = useGame();
  const [, setN] = useState(0);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const live = draftLive(league);
  const c = live ? draftClock(league) : null;
  const s = live ? currentSlot(league) : null;
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.visibilityState === "hidden");
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const on = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  const running = live && !c.paused && !hold && !hidden;
  const last = useRef(Date.now());
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => {
      const r = tickDraftClock(league);
      if (r) { last.current = Date.now(); pickRef.current?.(r); commit(); return; }
      // the clock is saved with the draft: a save every few seconds, so a reload keeps the time
      if (Date.now() - last.current > 5000) { last.current = Date.now(); commit(3000); } else setN((n) => n + 1);
    }, clockTick(c.speed, s.round));
    return () => clearInterval(t);
  }, [running, c?.speed, s?.round, s?.overall]); // eslint-disable-line react-hooks/exhaustive-deps
  // Leaving the floor keeps the time on the clock.
  useEffect(() => () => commit(), []); // eslint-disable-line react-hooks/exhaustive-deps
  return { live, c, s, running };
}

// The sticky bar at the top of the draft floor: who's on the clock, the clock, Pause/Resume, the
// speed (saved with the draft; every draft starts at Normal), Sim this pick and Sim to my pick.
// On phones it's the whole clock: club, pick, your next pick, and Sim pick / Get this pick / Trade up.
export function ClockBar({ hold, onPick, onForPick, onTradeUp, phone }) {
  const { league, commit, toast } = useGame();
  const { live, c, s, running } = useClockRunner({ hold, onPick });
  if (!live) return null;
  const t = league.teams[s.owner];
  const mine = s.owner === league.userTid;
  const nx = nextUserSlot(league);
  const { clr } = momentColors(t);
  const low = c.remaining <= 10;
  const pause = () => { setDraftPaused(league, !c.paused); commit(); };
  const speed = () => { const v = cycleDraftSpeed(league); commit(); toast(v === "Slow" ? "Slow: every pick in real time." : v === "Fast" ? "Fast: AI picks fly by after round 1." : "Normal: real time in round 1, quicker after."); };
  const simPick = () => { const r = simThisPick(league); if (r) { onPick?.(r); commit(); } };
  const simMine = () => { const n = simToMyPick(league); commit(); if (n) toast(`${n} pick${n === 1 ? "" : "s"} made. ${currentSlot(league)?.owner === league.userTid ? "You're on the clock." : ""}`); };
  const state = c.paused ? "PAUSED" : hold ? "ON HOLD" : mine ? (phone ? "YOU'RE UP" : "YOU'RE ON THE CLOCK") : "ON THE CLOCK";
  const pauseBtn = <button type="button" className={`dd-pause${c.paused ? " go" : ""}`} onClick={pause} aria-label={c.paused ? "Resume the draft" : "Pause the draft"}>{c.paused ? "▶ Resume" : "⏸ Pause"}</button>;
  if (phone) return (
    <div className={`dd-bar phone${mine ? " mine" : ""}`} style={{ "--clr": clr }}>
      <div className="dd-bar-top">
        <TeamBadge team={t} size={34} decorative />
        <div className="dd-bar-who">
          <div className="dd-bar-k">{state} · R{s.round} #{s.overall}</div>
          <div className="dd-bar-t">{t.city} {t.name}</div>
          {!mine && nx && <div className="dd-bar-nx">Your pick: #{nx.slot.overall} ({nx.away} away)</div>}
        </div>
        <div className={`dd-bar-clock${low ? " low" : ""}${mine ? " mine" : ""}`} aria-label={`${clockText(c.remaining)} left on the clock`}>{clockText(c.remaining)}</div>
        {pauseBtn}
      </div>
      {!mine && (
        <div className="dd-bar-row">
          <button type="button" className="dd-b sim" onClick={simPick}>⏭ Sim pick</button>
          {nx && <button type="button" className="dd-b for" onClick={() => onForPick?.(s.overall)}>🔁 Get this pick</button>}
          {nx && <button type="button" className="dd-b up" onClick={onTradeUp}>📞 Trade up</button>}
        </div>
      )}
    </div>
  );
  return (
    <div className={`dd-bar${mine ? " mine" : ""}${c.paused ? " paused" : ""}`} style={{ "--clr": clr }}>
      <span className={`dd-live${c.paused || hold ? " off" : ""}`}>{c.paused ? "PAUSED" : hold ? "HOLD" : "● LIVE"}</span>
      <span className="dd-bar-pick">R{s.round} · #{s.overall}</span>
      <TeamBadge team={t} size={26} decorative />
      <span className="dd-bar-team"><b>{mine ? "You're" : t.abbr}</b> on the clock</span>
      <span className={`dd-bar-clock${low ? " low" : ""}${mine ? " mine" : ""}`}>{clockText(c.remaining)}</span>
      {!mine && nx && <span className="dd-bar-nx">Your pick #{nx.slot.overall} · {nx.away} away</span>}
      <span className="dd-bar-sp" />
      {pauseBtn}
      <button type="button" className="dd-b speed" onClick={speed} title="How fast the clock runs after round 1 (round 1 is always real time)">Speed: {c.speed}</button>
      <button type="button" className="dd-b sim" onClick={simPick} disabled={mine} title={mine ? "You're on the clock" : "The club on the clock picks now"}>⏭ Sim this pick</button>
      {nx && !mine && <button type="button" className="dd-b go" onClick={simMine}>⏩ Sim to my pick</button>}
      {running ? null : <span className="sr-only">Clock stopped</span>}
    </div>
  );
}

// The broadcast stage for the pick on the clock: club colours, round and pick, the club's needs,
// how far away your next pick is, the big clock, and the phone.
export function OnTheClock({ onForPick, onTradeUp, onShop, forOpen, upOpen, children }) {
  const { league } = useGame();
  if (!draftLive(league)) return null;
  const c = draftClock(league);
  const s = currentSlot(league);
  const t = league.teams[s.owner];
  const mine = s.owner === league.userTid;
  const nx = nextUserSlot(league);
  const needs = clubNeeds(league, s.owner);
  const { clr, ac } = momentColors(t);
  return (
    <div className={`dd-otc${mine ? " mine" : ""}`} style={{ "--clr": clr }}>
      <div className="dd-stripe" style={{ "--c1": clr, "--c2": ac }} />
      <div className="dd-otc-main">
        <TeamBadge team={t} size={64} />
        <div className="dd-otc-who">
          <div className="dd-otc-k"><span className={`dd-badge${c.paused ? " off" : ""}`}>{c.paused ? "PAUSED" : "ON THE CLOCK"}</span><span>ROUND {s.round} · PICK {((s.overall - 1) % 32) + 1} · #{s.overall} OVERALL</span>{s.orig !== s.owner && <span className="dd-via">FROM {league.teams[s.orig].abbr}</span>}</div>
          <div className="dd-otc-t">{t.city} {t.name}{mine ? " (YOU)" : ""}</div>
          {needs.length > 0 && <div className="dd-needs"><span>NEEDS</span>{needs.map((n) => <PosChip key={n} pos={n} />)}</div>}
          {!mine && nx && <div className="dd-otc-nx">Your next pick: #{nx.slot.overall} ({nx.away} away)</div>}
          {!mine && !nx && <div className="dd-otc-nx">You have no picks left in this draft.</div>}
          {mine && <div className="dd-otc-nx">{c.paused ? "Draft paused" : "Make your pick from the board below"}</div>}
        </div>
        <div className="dd-otc-clock">
          <div className={`dd-big${c.remaining <= 10 ? " low" : ""}${mine ? " mine" : ""}`}>{clockText(c.remaining)}</div>
          <small>{mine ? "TIME LEFT" : "ON THE CLOCK"}</small>
        </div>
      </div>
      {!mine && nx && (
        <div className="dd-otc-row">
          <button type="button" className={`dd-b for${forOpen ? " on" : ""}`} onClick={() => onForPick?.(s.overall)}>🔁 {forOpen ? "Never mind" : "Trade for this pick"}</button>
          <button type="button" className={`dd-b up${upOpen ? " on" : ""}`} onClick={onTradeUp}>📞 {upOpen ? "Hide calls" : "Trade up"}</button>
          <button type="button" className="dd-b shop" onClick={() => onShop?.(nx.slot.overall)}>💱 Shop pick #{nx.slot.overall}</button>
        </div>
      )}
      {children}
    </div>
  );
}

// The war room's read, one line: best left and the best at your top need.
export function WarRoom() {
  const { league } = useGame();
  const pool = (league.draftClass || []).map((id) => league.players[id]).filter((p) => p?.tid === -2).sort((a, b) => csRank(a) - csRank(b));
  const best = pool[0];
  if (!best) return null;
  const need = clubNeeds(league, league.userTid, 2);
  const fit = need.map((n) => pool.find((p) => p.pos === n)).filter(Boolean)[0];
  return (
    <div className="dd-war">
      <b className="dd-war-k">🎙️ WAR ROOM</b>
      <span>Best left: <PlayerName p={best} /> ({best.pos}, CS #{csRank(best)}).{fit && fit.id !== best.id ? <> Top {need.join("/")}: <PlayerName p={fit} /> ({fit.pos}, #{csRank(fit)}).</> : fit ? <> Fills a need, too.</> : null}</span>
      <span className="dd-war-rule">At 0:00 you take the top name on Your list, then Central Scouting's best.</span>
    </div>
  );
}

// ---------- The phone ----------

function PickPills({ ids, first = "good" }) {
  const { league } = useGame();
  return <div className="dd-pills">{ids.map((id, i) => <span key={id} className={`dd-pill${i === 0 ? ` ${first}` : ""}`}>{shortPick(league, pickOf(league, id))}</span>)}</div>;
}

// One offer from a club: who, what you get or give, the chart, and the buttons.
export function OfferCard({ o, onAccept, onMore, onPass }) {
  const { league } = useGame();
  const t = league.teams[o.team];
  const target = o.target && league.players[o.target];
  const up = o.kind === "up";
  return (
    <div className={`dd-offer${o.kind === "faller" ? " hot" : ""}${!up && o.pct >= 5 ? " good" : ""}`}>
      <div className="dd-offer-h">
        <TeamBadge team={t} size={28} decorative />
        <div className="dd-offer-who">
          <b>{t.city} {t.name}</b>
          <small>{up ? <>Their pick <b className="pos">#{o.theirOverall}</b> · move up {o.up} spot{o.up === 1 ? "" : "s"}</> : <>Move up {o.move} spot{o.move === 1 ? "" : "s"}{target ? ` · eyeing ${target.name} (${target.pos})` : ""}{o.kind === "faller" && <b className="neg"> · he's sliding</b>}</>}</small>
        </div>
      </div>
      <div className="dd-offer-k">{up ? "You give" : "You get"}</div>
      <PickPills ids={up ? [o.mine, ...o.extras] : [o.theirs, ...o.extras]} first={up ? "bad" : "good"} />
      <div className={`dd-offer-chart${up || o.pct >= 0 ? " ok" : ""}`}>{up ? `Chart: you give ${o.give} for ${o.get}` : `Chart value ${o.get} for your ${o.give} (${o.pct >= 0 ? "+" : ""}${o.pct}%)`}</div>
      <div className="dd-offer-act">
        <button type="button" className="dd-b accept" onClick={() => onAccept(o)}>{up ? "Make the trade" : "Accept"}</button>
        {onMore && <button type="button" className="dd-b more" onClick={() => onMore(o)}>Ask for more</button>}
        {onPass && <button type="button" className="dd-b pass" aria-label="Turn it down" onClick={() => onPass(o)}>✕</button>}
      </div>
    </div>
  );
}

// Phones: trade panels open as a bottom sheet over the board.
export function Sheet({ phone, onClose, children }) {
  if (!phone) return children;
  return (
    <div className="dd-sheet-bg" onClick={onClose}>
      <div className="dd-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button type="button" className="dd-sheet-x" aria-label="Close" onClick={onClose}>✕</button>
        {children}
      </div>
    </div>
  );
}

const FORPICK_NO = {
  keep: (t) => `The ${t} like their spot and aren't moving off this pick.`,
  cost: (t) => `You don't have the picks to cover what the ${t} want for this spot.`,
  none: () => "You need a later pick in this draft to build a deal around.",
  taken: () => "That pick has been made.",
};

// "What would it take for this pick?" Any club's pick before one of yours.
export function ForPickPanel({ overall, phone, onDone, onClose }) {
  const { league, commit, toast } = useGame();
  const s = league.draft?.slots.find((x) => x.overall === overall);
  if (!s) return null;
  const t = league.teams[s.owner];
  const q = quoteTradeUp(league, overall);
  const accept = (o) => { const r = acceptCall(league, o); toast(r.msg); commit(); if (r.ok) onDone?.(); };
  return (
    <Sheet phone={phone} onClose={onClose}>
      <div className="dd-panel for">
        <div className="dd-panel-h">🔁 Trade for pick #{overall} <small>· the draft is on hold while you talk. Make the trade and the pick is yours.</small></div>
        {!q.offer && <div className="dd-panel-no">{FORPICK_NO[q.no]?.(t.name)}</div>}
        {q.offer && <div className="dd-offers"><OfferCard o={q.offer} onAccept={accept} /></div>}
        <div className="dd-panel-f"><button type="button" className="dd-b pass" onClick={onClose}>{q.offer ? "No thanks" : "Close"}</button></div>
      </div>
    </Sheet>
  );
}

// The trade-up phone bank: the clubs picking before your next pick.
export function TradeUpPanel({ phone, onDone, onClose }) {
  const { league, commit, toast } = useGame();
  const offers = tradeUpCalls(league);
  const accept = (o) => { const r = acceptCall(league, o); toast(r.msg); commit(); if (r.ok) onDone?.(); };
  const pass = (o) => { dismissCall(league, o); commit(); };
  return (
    <Sheet phone={phone} onClose={onClose}>
      <div className="dd-panel up">
        <div className="dd-panel-h">📞 Trade up <small>· the draft is on hold while you work the phones. Prices from the draft chart; moving up costs a premium.</small></div>
        {!offers.length && <div className="dd-panel-no">Nobody ahead of you is willing to move down right now (or you don't have the picks to pay for it).</div>}
        <div className="dd-offers">{offers.map((o) => <OfferCard key={o.id} o={o} onAccept={accept} onPass={pass} />)}</div>
        <div className="dd-panel-f"><button type="button" className="dd-b pass" onClick={onClose}>Close</button></div>
      </div>
    </Sheet>
  );
}

// Shop one of your picks: clubs behind it that would move up, and what they'd give.
export function ShopPanel({ overall, phone, onDone, onClose }) {
  const { league, commit, toast } = useGame();
  const offers = tradeDownCalls(league, overall);
  const accept = (o) => { const r = acceptCall(league, o); toast(r.msg); commit(); if (r.ok) onDone?.(); };
  const more = (o) => { toast(askForMore(league, o).msg); commit(); };
  const pass = (o) => { dismissCall(league, o); commit(); };
  return (
    <Sheet phone={phone} onClose={onClose}>
      <div className="dd-panel shop">
        <div className="dd-panel-h">💱 Shop pick #{overall} <small>· clubs picking after it that would move up. You always come out with more picks.</small></div>
        {!offers.length && <div className="dd-panel-no">No club behind this pick wants to move up right now.</div>}
        <div className="dd-offers">{offers.map((o) => <OfferCard key={o.id} o={o} onAccept={accept} onMore={more} onPass={pass} />)}</div>
        <div className="dd-panel-f"><button type="button" className="dd-b pass" onClick={onClose}>Close</button></div>
      </div>
    </Sheet>
  );
}

// You're on the clock: every offer folds behind one button, so the board is right there.
export function OffersFold({ offers, open, onToggle }) {
  const { league, commit, toast } = useGame();
  if (!offers.length) return null;
  const accept = (o) => { const r = acceptCall(league, o); toast(r.msg); commit(); };
  const more = (o) => { toast(askForMore(league, o).msg); commit(); };
  const pass = (o) => { dismissCall(league, o); commit(); };
  return (
    <div className="dd-fold">
      <button type="button" className="dd-fold-btn" aria-expanded={open} onClick={onToggle}><span>📞 {offers.length} trade offer{offers.length > 1 ? "s" : ""}: clubs want to move up</span><span>{open ? "▲" : "▼"}</span></button>
      {open && <div className="dd-offers">{offers.map((o) => <OfferCard key={o.id} o={o} onAccept={accept} onMore={more} onPass={pass} />)}</div>}
    </div>
  );
}

// The phone rings on the clock: the best offer comes in as a call with 20 seconds to answer
// before they hang up. A star sliding makes it an urgent call. Every offer stays in the list.
export function IncomingCall({ o, phone, secs = 20 }) {
  const { league, commit, toast } = useGame();
  const drop = useRef(null);
  drop.current = () => { hangUp(league, o); commit(); };
  useEffect(() => { const t = setTimeout(() => drop.current(), secs * 1000); return () => clearTimeout(t); }, [o.id, secs]);
  if (typeof document === "undefined") return null;
  const t = league.teams[o.team];
  const target = o.target && league.players[o.target];
  const cur = currentSlot(league);
  const accept = () => { const r = acceptCall(league, o); toast(r.msg); commit(); };
  const more = () => { toast(askForMore(league, o).msg); commit(); };
  return createPortal(
    <div className={`dd-call${phone ? " phone" : ""}${o.kind === "faller" ? " urgent" : ""}`} role="alertdialog" aria-label={`Incoming call from the ${t.city} ${t.name}`}>
      <div className="dd-call-h">
        <div className="dd-call-ring"><TeamBadge team={t} size={46} decorative /></div>
        <div className="dd-call-who">
          <div className="dd-call-k"><span className="dd-call-ico">📞</span> {o.kind === "faller" ? <span className="neg">URGENT CALL · HE'S SLIDING</span> : "INCOMING CALL"}</div>
          <div className="dd-call-t">{t.city} {t.name}</div>
          <div className="dd-call-q">{o.kind === "faller" && target ? `"${target.name} (${target.pos}) was #${csRank(target)} on Central Scouting's board and he's still there. We'll overpay to jump you at #${cur.overall}."` : `"We'd like to move up to #${cur.overall}${target ? ` for ${target.name}` : ""}."`}</div>
        </div>
      </div>
      <div className="dd-call-b">
        <div className="dd-offer-k">THEY OFFER</div>
        <PickPills ids={[o.theirs, ...o.extras]} />
        <div className={`dd-offer-chart${o.pct >= 0 ? " ok" : ""}`}>Draft chart: {o.pct >= 0 ? `+${o.pct}% in your favour` : `${o.pct}% (they're asking a discount)`}</div>
        <div className="dd-offer-act">
          <button type="button" className="dd-b accept" onClick={accept}>Accept</button>
          <button type="button" className="dd-b more" onClick={more}>Ask for more</button>
          <button type="button" className="dd-b hang" onClick={() => drop.current()}>Hang up</button>
        </div>
      </div>
      <div className="dd-call-timer"><i key={o.id} style={{ animationDuration: `${secs}s` }} /></div>
    </div>,
    document.body
  );
}

// ---------- Up next ----------

// Who's on the clock and who picks next, with a way to call any of them: Trade up on a club's
// pick before your next one, Shop on one of yours.
export function DraftQueue({ n = 12, onForPick, onShop }) {
  const { league } = useGame();
  const d = league.draft;
  const next = d.slots.slice(d.idx, d.idx + n);
  if (!next.length) return null;
  const me = league.userTid;
  const nx = nextUserSlot(league);
  return (
    <div className="panel dd-queue">
      <h3>Up next <span className="right">{nx ? (nx.away === 0 ? <b className="good">You're on the clock</b> : `Your pick in ${nx.away}`) : "No picks left"}</span></h3>
      {next.map((s, i) => {
        const t = league.teams[s.owner], mine = s.owner === me;
        const canUp = !mine && nx && s.overall < nx.slot.overall;
        return (
          <div key={s.overall} className={`dd-q${i === 0 ? " now" : ""}${mine ? " mine" : ""}`} style={i === 0 ? { "--clr": momentColors(t).clr } : undefined}>
            <span className="dd-q-n">R{s.round} #{s.overall}</span>
            <TeamBadge team={t} size={22} decorative />
            <span className="dd-q-t">{t.city} {t.name}{mine ? " (you)" : ""}</span>
            {s.orig !== s.owner && <span className="dd-q-via" title={`From the ${league.teams[s.orig].name}`}>via {league.teams[s.orig].abbr}</span>}
            {i === 0 && <span className="dd-q-otc">ON THE CLOCK</span>}
            {i > 0 && canUp && <button type="button" className="dd-q-act" onClick={() => onForPick?.(s.overall)} title={`What would it take to get pick #${s.overall}?`}>↑ Trade up</button>}
            {i > 0 && mine && <button type="button" className="dd-q-act shop" onClick={() => onShop?.(s.overall)} title={`Shop pick #${s.overall} to clubs behind it`}>Shop</button>}
          </div>
        );
      })}
    </div>
  );
}

// One-line mid-draft status: scouting points, picks left, the clock.
export function DraftStatusLine() {
  const { league } = useGame();
  const user = league.teams[league.userTid];
  const d = league.draft;
  const mine = d.slots.filter((s) => s.owner === user.id);
  const left = mine.filter((s) => !s.pid).length;
  const live = draftLive(league);
  const c = live ? draftClock(league) : null;
  const nx = live ? nextUserSlot(league) : null;
  return (
    <div className="dd-status" aria-label="Draft status">
      <span className={left ? "good" : ""}>{left} of {mine.length} picks left</span>
      {nx && <span>{nx.away === 0 ? "You're up" : `Next #${nx.slot.overall} (${nx.away} away)`}</span>}
      {c && <span className="mono">⏱ {clockText(c.remaining)}{c.paused ? " · paused" : ""}</span>}
    </div>
  );
}

export { DRAFT_CLOCK, gradeClass };
