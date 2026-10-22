import {visibleRatings} from '../engine/draft.js';
import React, { useEffect, useRef, useState } from "react";
import { useGame, PlayerName, TeamBadge, money } from "./common.jsx";
import { startDeadline, deadlineTick, deadlinePending, userOffers, toggleUserBlock, onBlock, fmtClock, marketStance, deadlineBoard, acceptOffer, declineOffer, fairLabel, DEADLINE_START, DEADLINE_END } from "../engine/market.js";
import { teamNeeds } from "../engine/teamPlanning.js";
import { capSpace } from "../engine/roster.js";
import { pickLabel } from "../engine/draft.js";
import { dayToDate } from "../engine/schedule.js";
import { OfferCard, WireItem, BlockList } from "./TradeBlockPage.jsx";
import { usePhone } from "./mobile.js";
import { MobileActionBar } from "./MobileShell.jsx";

// Trade Deadline Day: a broadcast-style desk with a running clock, a breaking-news
// feed of deals and rumours, offers for your players, buyers and sellers, and the best
// names still out there.
const QUIET_MS = 750; // real time per 10 minutes of deadline day when nothing happened
const BUSY_MS = 1700; // ...and after a tick that produced a trade, so it can be read

// A scrolling news ticker under the top bar while the deadline clock is live.
export function DeadlineTicker({ league, onOpen }) {
  const dl = league.deadline;
  if (!dl) return null;
  const items = dl.feed.filter((f) => f.kind === "trade").slice(0, 10);
  const text = items.length ? items.map((f) => `${f.big ? "BREAKING: " : ""}${f.short || f.text}`).join("   •   ") : "Trade Deadline Day: phones are ringing around the league…";
  return (
    <button type="button" className="ticker" onClick={onOpen} title="Open the deadline desk">
      <span className="ticker-k">⏰ {fmtClock(dl.minute)} ET</span>
      <span className="ticker-win">
        <span className="ticker-track" key={items.length} style={{ animationDuration: `${Math.max(18, Math.round(text.length / 7))}s` }}>{text}</span>
      </span>
    </button>
  );
}

function Stance({ league }) {
  const { buyers, sellers } = marketStance(league);
  const row = (r) => (
    <div key={r.t.id} className={`strow${r.movesLeft === 0 ? " spent" : ""}`} title={r.movesLeft === 0 ? "Out of deadline-day moves" : undefined}>
      <TeamBadge team={r.t} size={20} />
      <b>{r.t.abbr}</b>
      <span className="muted">{r.gap > 0 ? `+${r.gap}` : r.gap} pts</span>
      <span className="muted">{money(r.cap)}</span>
      <span className="muted">{r.movesLeft == null ? "you" : `${r.movesLeft} move${r.movesLeft === 1 ? "" : "s"}`}</span>
    </div>
  );
  return (
    <div className="panel">
      <h3>Buyers & sellers</h3>
      <div className="muted small" style={{ marginBottom: 8 }}>Points above or below the 8th playoff spot in each conference, cap room, and deadline-day moves left (each team gets two).</div>
      <div className="stance">
        <div><div className="dlab">Buyers</div>{buyers.map(row)}</div>
        <div><div className="dlab">Sellers</div>{sellers.map(row)}</div>
      </div>
    </div>
  );
}

const HOURS = [9, 10, 11, 12, 13, 14, 15];
const hourLabel = (h) => `${((h + 11) % 12) + 1} ${h >= 12 ? "PM" : "AM"}`;
const full = (t) => (t ? `${t.city} ${t.name}` : "?");
const recOf = (t) => `${t.rec.w}-${t.rec.l}-${t.rec.otl ?? 0}`;
const TAGS = { trade: ["TRADE", "trade"], rumor: ["RUMOR", "rumor"], offer: ["YOUR PHONE", "phone"], mine: ["YOUR PHONE", "phone"], info: ["NEWS", "news"], done: ["FINAL", "news"] };
const POSF = ["All positions", "C", "LW", "RW", "LD", "RD", "G"];

// The hour-by-hour track: past hours red, the current one white, the rest dim.
function HourTrack({ minute }) {
  return (
    <div className="dd-track">
      {HOURS.map((h) => {
        const st = minute >= (h + 1) * 60 ? "past" : minute >= h * 60 ? "now" : "";
        return (
          <div key={h} className={`dd-seg ${st}`}>
            <i />
            <span>{hourLabel(h)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Asset({ league, id, pick }) {
  if (pick) return <div className="dd-asset"><b>{pickLabel(league, league.draftPicks.find((pk) => pk.id === id)) || "Draft pick"}</b></div>;
  const p = league.players[id];
  if (!p) return null;
  return (
    <div className="dd-asset">
      <div><span className="posbadge">{p.pos}</span> <PlayerName p={p} /> <b className="dd-ovr">{visibleRatings(league, p).ovr}</b></div>
      <div className="muted small">Age {p.age} · {money(p.cap)}{p.yrs <= 1 ? " · expiring" : ` × ${p.yrs}`}</div>
    </div>
  );
}

function PhoneOffer({ o, minute }) {
  const { league, commit, toast } = useGame();
  const t = league.teams[o.tid];
  const hrs = o.expMin != null ? Math.max(1, Math.ceil((Math.min(o.expMin, DEADLINE_END) - minute) / 60)) : null;
  const fair = fairLabel(o.fair);
  return (
    <div className="dd-offer">
      <div className="dd-offer-h">
        <TeamBadge team={t} size={30} />
        <div className="dd-offer-who">
          <b>{full(t)}</b>
          <div className="muted small">{recOf(t)}{hrs != null ? ` · offer good for ${hrs} more hour${hrs === 1 ? "" : "s"}` : ""}</div>
        </div>
        {fair && <span className={`dd-fair${o.fair >= 1.12 ? " over" : o.fair < 0.9 ? " low" : ""}`}>{fair}</span>}
      </div>
      <div className="dd-offer-sides">
        <div><div className="dd-lab">They want</div>{o.give.map((id) => <Asset key={id} league={league} id={id} />)}{(o.givePicks || []).map((id) => <Asset key={id} league={league} id={id} pick />)}</div>
        <div><div className="dd-lab">You get</div>{o.get.map((id) => <Asset key={id} league={league} id={id} />)}{(o.getPicks || []).map((id) => <Asset key={id} league={league} id={id} pick />)}{o.getRetention && <div className="muted small">They keep 50% of his salary.</div>}</div>
      </div>
      <div className="dd-offer-btns">
        <button className="dd-accept" onClick={() => { const r = acceptOffer(league, o.id); toast(r.msg, 4500); commit(); }}>Accept</button>
        <button className="dd-decline" onClick={() => { declineOffer(league, o.id); commit(); }}>Decline</button>
      </div>
    </div>
  );
}

function FeedRow({ league, w }) {
  const [tag, cls] = w.big && w.kind === "trade" ? ["BREAKING", "big"] : TAGS[w.kind] || TAGS.info;
  const tid = w.a ?? w.tids?.[0];
  const t = tid != null ? league.teams[tid] : null;
  return (
    <div className={`dd-feed-row${w.kind === "trade" ? " trade" : ""}${w.big ? " big" : ""}`}>
      <div className="dd-feed-t">{w.min != null ? fmtClock(w.min).replace(":00", "") : ""}</div>
      {t ? <TeamBadge team={t} size={24} /> : <span style={{ width: 24, flex: "none" }} />}
      <div className="dd-feed-x"><span className={`dd-tag ${cls}`}>{tag}</span>{w.text}</div>
    </div>
  );
}

function BoardPanel({ league, closed }) {
  const { proposeTradeFor } = useGame();
  const user = league.teams[league.userTid];
  const needs = teamNeeds(league, user).filter((n) => n.score >= 20).slice(0, 4).map((n) => n.pos);
  const [mode, setMode] = useState("needs");
  const [pos, setPos] = useState("All positions");
  if (closed) return <div className="muted small">The deadline has passed: the block reopens after the playoffs.</div>;
  const all = deadlineBoard(league);
  const rows = all.filter((r) => (pos === "All positions" ? mode === "all" || !needs.length || needs.includes(r.p.pos) : r.p.pos === pos));
  return (
    <>
      <div className="dd-filters">
        <select value={mode} onChange={(e) => { setMode(e.target.value); setPos("All positions"); }} aria-label="Filter by need">
          <option value="needs">Your needs ({needs.join(", ") || "none"})</option>
          <option value="all">Everyone</option>
        </select>
        <select value={pos} onChange={(e) => setPos(e.target.value)} aria-label="Position">{POSF.map((x) => <option key={x}>{x}</option>)}</select>
      </div>
      <div className="muted small dd-count">{rows.length} available</div>
      <div className="dd-scroll">
        {rows.slice(0, 40).map((r) => (
          <div key={r.pid} className="dd-brow">
            <TeamBadge team={r.t} size={26} />
            <div className="dd-bwho">
              <div><span className="posbadge">{r.p.pos}</span> <PlayerName p={r.p} /></div>
              <div className="muted small">{r.t.abbr} · age {r.p.age} · {money(r.p.cap)}, {r.p.yrs} yr{r.p.yrs === 1 ? "" : "s"}{r.p.yrs <= 1 ? " · Expiring" : ""} · {r.why} · {r.asking}</div>
            </div>
            <b className="dd-bovr">{visibleRatings(league, r.p).ovr}</b>
            <button className="dd-inq" onClick={() => proposeTradeFor(r.pid, r.tid)} title="Open the trade screen with him loaded">Inquire</button>
          </div>
        ))}
        {!rows.length && <div className="dim small">Nobody available who fits that filter.</div>}
      </div>
    </>
  );
}

function MarketPanel({ league }) {
  const { buyers, sellers } = marketStance(league);
  const row = (r, cls) => (
    <div key={r.t.id} className="dd-mrow" title={r.movesLeft === 0 ? "Out of deadline-day moves" : `${r.gap > 0 ? "+" : ""}${r.gap} pts from the 8th spot · ${money(r.cap)} cap room`}>
      <TeamBadge team={r.t} size={22} />
      <span className="dd-mname">{full(r.t)}{r.movesLeft == null ? " (you)" : ""}</span>
      <b className={cls}>{recOf(r.t)}</b>
    </div>
  );
  return (
    <>
      <div className="dd-head">Buyers</div>
      {buyers.slice(0, 10).map((r) => row(r, "good"))}
      {!buyers.length && <div className="muted small">Nobody's clearly buying.</div>}
      <div className="dd-head" style={{ marginTop: 14 }}>Sellers</div>
      {sellers.slice(0, 10).map((r) => row(r, "bad"))}
      {!sellers.length && <div className="muted small">Nobody's clearly selling.</div>}
    </>
  );
}

function DealsTicker({ dl, year }) {
  const items = dl.feed.filter((f) => f.kind === "trade").slice(0, 12).reverse();
  const text = items.length ? `DEADLINE DEALS ${year + 1}: ${items.map((f) => f.short || f.text).join("   •   ")}` : "DEADLINE DAY: phones are ringing around the league…";
  return (
    <div className="dd-ticker keep-dark" aria-live="off">
      <span className="ticker-track" key={items.length} style={{ animationDuration: `${Math.max(20, Math.round(text.length / 7))}s` }}>{text}</span>
    </div>
  );
}

export default function DeadlinePage() {
  const { league, commit, go, toast, save } = useGame();
  const phone = usePhone();
  const [running, setRunning] = useState(false);
  const [view, setView] = useState("feed"); // phones: the feed, the block, or buyers & sellers
  const timer = useRef(null);
  const dl = league.deadline && league.deadline.year === league.year ? league.deadline : null;
  const done = !dl || dl.done;

  // Opened straight from the nav: start the day (and save that it started).
  useEffect(() => {
    if (deadlinePending(league) && !dl) {
      startDeadline(league);
      commit();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The running clock: quick through quiet stretches, slower after a trade, and it stops
  // when a team calls you. Saves are batched while it runs.
  useEffect(() => {
    if (!running || done) return;
    const step = () => {
      const before = new Set(userOffers(league).map((o) => o.id));
      const trades = league.deadline.trades;
      deadlineTick(league, 10);
      const fresh = userOffers(league).filter((o) => !before.has(o.id));
      commit(30000);
      if (league.deadline.done) {
        setRunning(false);
        save();
        return;
      }
      if (fresh.length) {
        const o = fresh[0];
        setRunning(false);
        save();
        toast(`📞 The ${full(league.teams[o.tid])} are on the phone. The clock is paused.`, 5000);
        return;
      }
      timer.current = setTimeout(step, league.deadline.trades > trades ? BUSY_MS : QUIET_MS);
    };
    timer.current = setTimeout(step, QUIET_MS);
    return () => {
      clearTimeout(timer.current);
      save();
    };
  }, [running, done]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!dl) {
    return (
      <div className="stack">
        <div className="pagehead"><h2>Trade Deadline</h2></div>
        <div className="panel muted">The deadline is {dayToDate(league.year, league.deadlineDay, league.scheduleStart)}. When the season reaches it, the sim stops here for Deadline Day.</div>
      </div>
    );
  }

  const advance = (min) => {
    setRunning(false);
    deadlineTick(league, Math.max(10, min));
    commit();
  };
  const minute = Math.max(DEADLINE_START, dl.minute);
  const nextHour = Math.min(DEADLINE_END, (Math.floor(minute / 60) + 1) * 60);
  const left = Math.max(0, DEADLINE_END - minute);
  const hrsLeft = Math.ceil(left / 60);
  const offers = userOffers(league);
  const user = league.teams[league.userTid];
  const total = dl.total ?? dl.feed.filter((f) => f.kind === "trade").length;
  const cap = capSpace(league, user);

  const phonePanel = (
    <div className={`dd-panel${offers.length ? " hot" : ""}`}>
      <div className="dd-head">Your phone {offers.length > 0 && <i className="dd-badge">{offers.length}</i>}</div>
      {offers.map((o) => <PhoneOffer key={o.id} o={o} minute={minute} />)}
      {!offers.length && <div className="muted small dd-empty">{done ? "The phones have gone quiet. Trading is closed until after the playoffs." : `No offers on the table right now. Calls come in through the day: put players on your trade block to draw interest, or pick up the phone yourself with Make a call.${running ? " The clock pauses whenever an offer comes in." : ""}`}</div>}
      {done && (dl.deals || []).length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="dd-head">Today's deals ({dl.deals.length})</div>
          {dl.deals.map((d, i) => <div key={i} className="small dd-deal"><b>{league.teams[d.buyer]?.abbr}</b> get <b>{d.name}</b> ({d.pos} {d.ovr}) from <b>{league.teams[d.seller]?.abbr}</b></div>)}
        </div>
      )}
    </div>
  );
  const feedPanel = (
    <div className="dd-panel">
      <div className="dd-head">Deadline feed</div>
      <div className="dd-scroll">
        {dl.feed.map((w, i) => <FeedRow key={dl.feed.length - i} league={league} w={w} />)}
        {!dl.feed.length && <div className="dim small">{dl.synthetic ? "This deadline passed before the deadline desk existed, so there's no feed for it." : "Nothing yet."}</div>}
      </div>
    </div>
  );
  const blockPanel = (
    <div className="dd-panel">
      <div className="dd-head">Trade block</div>
      <BoardPanel league={league} closed={done} />
    </div>
  );
  const marketPanel = <div className="dd-panel"><MarketPanel league={league} /></div>;

  if (phone) {
    const bar = done
      ? [{ label: "Back to the season ▸", onClick: () => go("dashboard") }]
      : [
          { label: `Advance to ${fmtClock(nextHour)} ▸`, onClick: () => advance(nextHour - dl.minute), tone: "red" },
          { label: "📞 Make a call", onClick: () => { setRunning(false); go("trade"); }, tone: "blue" },
          { label: "Sim to 3:00 PM", onClick: () => advance(DEADLINE_END - dl.minute) },
        ];
    return (
      <div className={`rk-dlp dd${done ? " done" : ""}`}>
        <div className="rk-dlp-clock" role="timer" aria-label={`Deadline clock ${fmtClock(minute)} ET`}>
          <div className="rk-dlp-row">
            <span className="rk-dlp-live">{done ? "FINAL" : "● LIVE"}</span>
            <span className="rk-dlp-time">{fmtClock(minute)}</span>
            <span className="rk-dlp-left">{done ? `Deadline passed · ${total} trade${total === 1 ? "" : "s"}` : left <= 60 ? "Final hour" : `${hrsLeft} hrs left`}</span>
            {!done && <button className={`rk-dlp-run${running ? " on" : ""}`} onClick={() => setRunning((r) => !r)}>{running ? "❚❚ Pause" : "▶ Run clock"}</button>}
          </div>
          <div className="dd-mini">{HOURS.map((h) => <i key={h} className={minute >= (h + 1) * 60 ? "past" : minute >= h * 60 ? "now" : ""} />)}</div>
        </div>
        <DealsTicker dl={dl} year={league.year} />
        {phonePanel}
        <div className="rk-dlp-tabs" role="tablist">
          {[["feed", "Feed"], ["block", "Trade block"], ["market", "Buyers & sellers"]].map(([k, l]) => <button key={k} role="tab" aria-selected={view === k} className={view === k ? "on" : ""} onClick={() => setView(k)}>{l}</button>)}
        </div>
        {view === "feed" && feedPanel}
        {view === "block" && blockPanel}
        {view === "market" && marketPanel}
        <MobileActionBar key={done ? "done" : "live"} actions={bar} />
      </div>
    );
  }

  return (
    <div className="dd">
      <div className={`dd-hero keep-dark${done ? " done" : ""}`}>
        <div className="dd-top">
          <div>
            <div className="dd-live">{done ? "DEADLINE DAY · FINAL" : "● LIVE · TRADE DEADLINE DAY"}</div>
            <div className="dd-clockrow">
              <span className="dd-clock">{fmtClock(minute).replace(/ (AM|PM)/, "")}<small>{minute >= 720 ? " PM" : " AM"}</small><em>ET</em></span>
              <span className="dd-left">{done ? `THE DEADLINE HAS PASSED · ${total} TRADE${total === 1 ? "" : "S"}` : left <= 60 ? "FINAL HOUR BEFORE THE DEADLINE" : `${hrsLeft} HOURS TO THE DEADLINE`}</span>
            </div>
          </div>
          <div className="dd-me">
            <TeamBadge team={user} size={40} />
            <div><div><b>{recOf(user)}</b> at the deadline</div><div>Cap space <b className={cap >= 0 ? "good" : "bad"}>{money(cap)}</b></div></div>
          </div>
        </div>
        <HourTrack minute={done ? DEADLINE_END + 60 : minute} />
        <div className="dd-btns">
          {!done ? (
            <>
              <button className="dd-b red" onClick={() => advance(nextHour - dl.minute)}>Advance to {fmtClock(nextHour)} ▸</button>
              <button className={`dd-b dark${running ? " on" : ""}`} onClick={() => setRunning((r) => !r)}>{running ? "❚❚ Pause clock" : "▶ Run the clock"}</button>
              <button className="dd-b blue" onClick={() => { setRunning(false); go("trade"); }}>📞 Make a call (trade screen)</button>
              <button className="dd-b dim" onClick={() => advance(DEADLINE_END - dl.minute)}>Sim to 3:00 PM</button>
            </>
          ) : (
            <button className="dd-b green" onClick={() => go("dashboard")}>Back to the season ▸</button>
          )}
        </div>
      </div>
      <DealsTicker dl={dl} year={league.year} />
      <div className="dd-grid">
        {phonePanel}
        {feedPanel}
        {blockPanel}
        {marketPanel}
      </div>
    </div>
  );
}
