import React, { useEffect, useRef, useState } from "react";
import { useGame, PlayerName, TeamBadge, money } from "./common.jsx";
import { fmtClock, userOffers } from "../engine/market.js";
import { startFrenzy, frenzyTick, frenzyFor, frenzyPending, openCalls, answerCall, beatPrice, frenzyBoard, frenzyBuyers, FRENZY_START, FRENZY_END } from "../engine/frenzy.js";
import { simFADay } from "../engine/offseason.js";
import { teamNeeds } from "../engine/teamPlanning.js";
import { capSpace, counts } from "../engine/roster.js";
import { contractCount } from "../engine/hockeyRules.js";
import { visibleRatings } from "../engine/draft.js";
import { PhoneOffer, FeedRow, HourTrack } from "./DeadlinePage.jsx";
import ContractModal from "./ContractModal.jsx";
import { usePhone } from "./mobile.js";
import { MobileActionBar } from "./MobileShell.jsx";

// Free Agent Frenzy: July 1 on a live clock, the sibling of Deadline Day. Noon ET to midnight:
// signings and rumours in the feed, your phone (agents saying you've been outbid, trade calls),
// the best players still out there, and the clubs with money to spend.
const QUIET_MS = 700;
const BUSY_MS = 1600;
const HOURS = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
const full = (t) => (t ? `${t.city} ${t.name}` : "?");
const deal = (aav, yrs) => `${money(aav)} × ${yrs}`;
const POSF = ["All", "C", "LW", "RW", "LD", "RD", "G"];
const PLAN = { contend: ["Contender", "good"], rebuild: ["Rebuilding", "bad"], middle: ["Middle", "muted"] };

function MatchCall({ c, minute }) {
  const { league, commit, toast } = useGame();
  const p = league.players[c.pid];
  const t = league.teams[c.tid];
  const n = league.negotiations?.[c.pid];
  const mine = n?.bids.find((b) => b.tid === league.userTid);
  const price = beatPrice(league, c.pid);
  if (!p || !mine) return null;
  const mins = Math.max(0, c.expMin - minute);
  const act = (how) => { const r = answerCall(league, c.id, how); toast(r.msg, 4500); commit(); };
  return (
    <div className="dd-offer ff-call">
      <div className="dd-offer-h">
        <TeamBadge team={t} size={30} />
        <div className="dd-offer-who">
          <b>{p.name}'s agent</b>
          <div className="muted small">{p.pos} {visibleRatings(league, p).ovr} · age {p.age} · decides in {mins >= 60 ? `${Math.ceil(mins / 60)} hr` : `${mins} min`}</div>
        </div>
        <span className="dd-fair low">Outbid</span>
      </div>
      <div className="dd-offer-sides">
        <div><div className="dd-lab">{t.abbr} offer</div><b>{deal(c.aav, c.yrs)}</b></div>
        <div><div className="dd-lab">Yours</div><b>{deal(mine.aav, mine.yrs)}</b></div>
      </div>
      <div className="dd-offer-btns">
        {price && <button className="dd-accept" disabled={price.aav > capSpace(league, league.teams[league.userTid])} onClick={() => act("beat")}>Beat it: {deal(price.aav, price.yrs)}</button>}
        <button className="dd-decline" onClick={() => act("pass")}>Let him go</button>
      </div>
    </div>
  );
}

function Board({ league, onOffer }) {
  const [pos, setPos] = useState("All");
  const rows = frenzyBoard(league).filter((r) => pos === "All" || r.p.pos === pos);
  return (
    <>
      <div className="dd-filters">
        <select value={pos} onChange={(e) => setPos(e.target.value)} aria-label="Position">{POSF.map((x) => <option key={x}>{x}</option>)}</select>
      </div>
      <div className="muted small dd-count">{rows.length} still available</div>
      <div className="dd-scroll">
        {rows.slice(0, 40).map((r) => (
          <div key={r.p.id} className={`dd-brow${r.mine ? " ff-mine" : ""}`}>
            <span className="posbadge">{r.p.pos}</span>
            <div className="dd-bwho">
              <div><PlayerName p={r.p} />{r.hot && <span className="ff-hot" title="Several clubs are after him"> 🔥</span>}</div>
              <div className="muted small">Age {r.p.age} · asks {deal(r.ask.aav, r.ask.yrs)} · interest in you <b className={r.interest === "High" ? "good" : r.interest === "Low" ? "bad" : ""}>{r.interest}</b></div>
              <div className="muted small">
                {r.suitors.length ? <>{r.suitors.length} suitor{r.suitors.length === 1 ? "" : "s"}: {r.suitors.slice(0, 4).map((tid) => league.teams[tid].abbr).join(", ")}</> : r.market ? "No offers yet" : "Takes the first fair deal"}
                {r.mine && <> · <b className={r.leader === league.userTid ? "good" : "bad"}>you {r.leader === league.userTid ? "lead" : "trail"} at {deal(r.mine.aav, r.mine.yrs)}</b></>}
                {r.decideMin != null && <> · decides ~{fmtClock(r.decideMin)}</>}
              </div>
            </div>
            <b className="dd-bovr">{visibleRatings(league, r.p).ovr}</b>
            <button className="dd-inq" onClick={() => onOffer(r.p)}>{r.mine ? "Raise" : "Offer"}</button>
          </div>
        ))}
        {!rows.length && <div className="dim small">Nobody left at that position.</div>}
      </div>
    </>
  );
}

function Needs({ league }) {
  const user = league.teams[league.userTid];
  const c = counts(league, user);
  const needs = teamNeeds(league, user).slice(0, 4);
  const cap = capSpace(league, user);
  return (
    <>
      <div className="dd-head">Your club</div>
      <div className="ff-stats">
        <div><span>Cap room</span><b className={cap >= 0 ? "good" : "bad"}>{money(cap)}</b></div>
        <div><span>Roster</span><b>{c.active}/23</b></div>
        <div><span>Contracts</span><b>{contractCount(league, user)}/50</b></div>
        <div><span>F · D · G</span><b>{c.F} · {c.D} · {c.G}</b></div>
      </div>
      <div className="dd-lab" style={{ marginTop: 10 }}>Biggest needs</div>
      {needs.map((n) => <div key={n.pos} className="small ff-need"><span className="posbadge">{n.pos}</span> <b>{n.role}</b>{n.reasons?.length ? <span className="muted"> · {n.reasons.slice(0, 2).join(", ")}</span> : null}</div>)}
      <div className="dd-head" style={{ marginTop: 14 }}>Big spenders</div>
      {frenzyBuyers(league).map((r) => (
        <div key={r.t.id} className="dd-mrow">
          <TeamBadge team={r.t} size={22} />
          <span className="dd-mname">{full(r.t)}</span>
          <span className={`small ${PLAN[r.plan][1]}`}>{PLAN[r.plan][0]}</span>
          <b>{money(r.cap)}</b>
        </div>
      ))}
    </>
  );
}

function SigningsTicker({ f, league }) {
  const items = (f.deals || []).slice(-12).reverse();
  const text = items.length ? `JULY 1 SIGNINGS: ${items.map((d) => `${d.name} → ${league.teams[d.tid]?.abbr} ${money(d.aav)} × ${d.yrs}`).join("   •   ")}` : "FREE AGENT FRENZY: agents are working the phones…";
  return (
    <div className="dd-ticker keep-dark" aria-live="off">
      <span className="ticker-track" key={items.length} style={{ animationDuration: `${Math.max(20, Math.round(text.length / 7))}s` }}>{text}</span>
    </div>
  );
}

export default function FrenzyPage() {
  const { league, commit, toast, save, go } = useGame();
  const phone = usePhone();
  const [running, setRunning] = useState(false);
  const [view, setView] = useState("feed");
  const [offerOn, setOfferOn] = useState(null);
  const timer = useRef(null);
  const f = frenzyFor(league);
  const done = !f || f.done;

  useEffect(() => {
    if (frenzyPending(league) && !f) { startFrenzy(league); commit(); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The clock runs on its own and stops when your phone rings.
  useEffect(() => {
    if (!running || done) return;
    const step = () => {
      const fz = league.frenzy;
      const before = new Set([...openCalls(league).map((c) => c.id), ...userOffers(league).map((o) => o.id)]);
      const signed = fz.signed;
      frenzyTick(league, 10);
      commit(30000);
      if (fz.done) { setRunning(false); save(); return; }
      const fresh = [...openCalls(league), ...userOffers(league)].filter((x) => !before.has(x.id));
      if (fresh.length) { setRunning(false); save(); toast("📞 Your phone is ringing. The clock is paused.", 4500); return; }
      timer.current = setTimeout(step, fz.signed > signed ? BUSY_MS : QUIET_MS);
    };
    timer.current = setTimeout(step, QUIET_MS);
    return () => { clearTimeout(timer.current); save(); };
  }, [running, done]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!f) {
    return <div className="stack"><div className="pagehead"><h2>Free Agent Frenzy</h2></div><div className="panel muted">Free agency opens on July 1 at noon ET. When the off-season gets there, the market plays out live here.</div></div>;
  }
  const minute = Math.max(FRENZY_START, f.minute);
  const advance = (min) => { setRunning(false); frenzyTick(league, Math.max(10, min)); commit(); };
  const nextHour = Math.min(FRENZY_END, (Math.floor(minute / 60) + 1) * 60);
  const hrsLeft = Math.ceil((FRENZY_END - minute) / 60);
  const calls = openCalls(league);
  const offers = userOffers(league);
  const ringing = calls.length + offers.length;
  const user = league.teams[league.userTid];
  const cap = capSpace(league, user);
  const n = (f.deals || []).length;
  const nextDay = () => { simFADay(league); commit(); go("freeagency"); if (league.fa?.summary?.text) toast(league.fa.summary.text, 5000); };

  const phonePanel = (
    <div className={`dd-panel${ringing ? " hot" : ""}`}>
      <div className="dd-head">Your phone {ringing > 0 && <i className="dd-badge">{ringing}</i>}</div>
      {calls.map((c) => <MatchCall key={c.id} c={c} minute={minute} />)}
      {offers.map((o) => <PhoneOffer key={o.id} o={o} minute={null} />)}
      {!ringing && <div className="muted small dd-empty">{done ? "Day one is over. The rest of the market decides over the coming days." : "Quiet for now. Make offers from the board: if a rival tops you, his agent calls before he signs so you can beat it. Clubs may also call about trades."}</div>}
    </div>
  );
  const feedPanel = (
    <div className="dd-panel">
      <div className="dd-head">Signings & rumours</div>
      <div className="dd-scroll">{f.feed.map((w, i) => <FeedRow key={f.feed.length - i} league={league} w={w} />)}</div>
    </div>
  );
  const boardPanel = <div className="dd-panel"><div className="dd-head">Top free agents</div><Board league={league} onOffer={setOfferOn} /></div>;
  const needsPanel = <div className="dd-panel"><Needs league={league} /></div>;
  const modal = offerOn && <ContractModal p={offerOn} kind="fa" onClose={() => { setOfferOn(null); commit(); }} />;

  if (phone) {
    const bar = done
      ? [{ label: "Next day: July 2 ▸", onClick: nextDay }]
      : [
          { label: `Advance to ${fmtClock(nextHour)} ▸`, onClick: () => advance(nextHour - f.minute), tone: "red" },
          { label: running ? "❚❚ Pause" : "▶ Run clock", onClick: () => setRunning((r) => !r), tone: "blue" },
          { label: "Sim to midnight", onClick: () => advance(FRENZY_END - f.minute) },
        ];
    return (
      <div className={`rk-dlp dd ff${done ? " done" : ""}`}>
        <div className="rk-dlp-clock" role="timer" aria-label={`Free agency clock ${fmtClock(minute)} ET`}>
          <div className="rk-dlp-row">
            <span className="rk-dlp-live">{done ? "DAY 1 DONE" : "● LIVE"}</span>
            <span className="rk-dlp-time">{fmtClock(minute)}</span>
            <span className="rk-dlp-left">July 1 · {n} signed{done ? "" : ` · ${hrsLeft} hrs left`}</span>
          </div>
          <div className="dd-mini">{HOURS.map((h) => <i key={h} className={minute >= (h + 1) * 60 ? "past" : minute >= h * 60 ? "now" : ""} />)}</div>
        </div>
        <SigningsTicker f={f} league={league} />
        {phonePanel}
        <div className="rk-dlp-tabs" role="tablist">
          {[["feed", "Feed"], ["board", "Free agents"], ["needs", "Cap & needs"]].map(([k, l]) => <button key={k} role="tab" aria-selected={view === k} className={view === k ? "on" : ""} onClick={() => setView(k)}>{l}</button>)}
        </div>
        {view === "feed" && feedPanel}
        {view === "board" && boardPanel}
        {view === "needs" && needsPanel}
        {modal}
        <MobileActionBar key={done ? "done" : "live"} actions={bar} />
      </div>
    );
  }

  return (
    <div className="dd ff">
      <div className={`dd-hero ff-hero keep-dark${done ? " done" : ""}`}>
        <div className="dd-top">
          <div>
            <div className="dd-live">{done ? "FREE AGENT FRENZY · DAY 1 FINAL" : "● LIVE · FREE AGENT FRENZY · JULY 1"}</div>
            <div className="dd-clockrow">
              <span className="dd-clock">{fmtClock(minute).replace(/ (AM|PM)/, "")}<small>{minute >= 720 && minute < 1440 ? " PM" : " AM"}</small><em>ET</em></span>
              <span className="dd-left">{done ? `DAY ONE IS IN THE BOOKS · ${n} SIGNING${n === 1 ? "" : "S"}` : `${n} SIGNED · ${hrsLeft} HOURS LEFT IN DAY ONE`}</span>
            </div>
          </div>
          <div className="dd-me">
            <TeamBadge team={user} size={40} />
            <div><div>Cap space <b className={cap >= 0 ? "good" : "bad"}>{money(cap)}</b></div><div>{counts(league, user).active}/23 roster · {contractCount(league, user)}/50 contracts</div></div>
          </div>
        </div>
        <HourTrack minute={done ? FRENZY_END + 60 : minute} hours={HOURS} />
        <div className="dd-btns">
          {!done ? (
            <>
              <button className="dd-b red" onClick={() => advance(nextHour - f.minute)}>Advance to {fmtClock(nextHour)} ▸</button>
              <button className={`dd-b dark${running ? " on" : ""}`} onClick={() => setRunning((r) => !r)}>{running ? "❚❚ Pause clock" : "▶ Run the clock"}</button>
              <button className="dd-b dim" onClick={() => advance(FRENZY_END - f.minute)}>Sim to midnight</button>
            </>
          ) : (
            <button className="dd-b green" onClick={nextDay}>Next day: July 2 ▸</button>
          )}
        </div>
      </div>
      <SigningsTicker f={f} league={league} />
      <div className="dd-grid ff-grid">
        {phonePanel}
        {feedPanel}
        {boardPanel}
        {needsPanel}
      </div>
      {modal}
    </div>
  );
}
