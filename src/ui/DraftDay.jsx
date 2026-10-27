// Draft Day (r16, concept 2 "Your list is the draft", with Evan's changes): one Draft screen that
// changes with the stage, and Your class after it.
//   Before the draft: "You pick 6th", Your list (seeded by your scouts at the Combine, drag to move,
//     reset) with the chance each name lasts to your pick, the Combine as one card (your scouts
//     spend the interviews and workouts; Change who), who nobody has seen.
//   On the clock: your scouts' three options (best fit / best available / need or upside, one plain
//     sentence each) with one green Draft; or Your list, the top name left lit up. "Someone else"
//     finds anyone in the class. Up next, and trade offers as one quiet card with the odds.
//   Between your picks: Sim to my next pick, Scouts pick the rest, Just taken, Your list with the
//     odds at your next pick (or the scouts' options for it).
//   Your class: what your scouts believed, one analysts' grade; the truth over two seasons.
// The engine is engine/draftDay.js (odds, options, class rows) and scouting.js (the list).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useGame, TeamBadge, Dialog, DBtn, PlayerName } from "./common.jsx";
import { Silhouette } from "./Headshot.jsx";
import { currentSlot, draftDone } from "../engine/draft.js";
import {
  prospectRead, classPool, csRank, myList, myListIds, moveOnMyListTo, toggleMyList, resetMyList, userNeeds, atCombine,
  visitPlan, setVisit, scoutsShortlist, potGrade, projection, pickTake,
} from "../engine/scouting.js";
import {
  draftLive, draftClock, clockText, tickDraftClock, clockTick, draftPlayer, simToMyPick, scoutsPickRest, nextUserSlot,
  onClockOffers, tradeUpCalls, acceptCall, dismissCall,
} from "../engine/draftClock.js";
import { availabilityOdds, scoutOptions, nextPick, ceilingText, myClassRows, classYears, analystsGrade, analystsGrades, classMatured } from "../engine/draftDay.js";
import { draftRecap, VERDICT } from "../engine/draftRecap.js";
import { usePhone } from "./DraftTools.jsx";
import "./draftday.css";

const ord = (n) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const last = (name) => String(name || "").split(" ").slice(-1)[0];
const pct = (x) => `${Math.round((x || 0) * 100)}%`;
const LEAGUE_SHORT = { "J20 Nationell": "Sweden J20", HockeyAllsvenskan: "Allsvenskan", "U20 SM-sarja": "Finland U20", "U20-Elit": "Swiss U20", "DNL U20": "Germany U20" };
const club = (p) => (p.bio?.team ? `${p.bio.team}${p.bio.lg ? ` (${LEAGUE_SHORT[p.bio.lg] || p.bio.lg})` : ""}` : "");
const pickOf = (league, id) => league.draftPicks.find((p) => p.id === id);

// ---------- The clock (runs while the Draft screen is open) ----------

// One clock second per tick (real seconds in round 1). `hold` stops it without pausing the draft:
// a sheet open, a moment on screen, the tab hidden. Never stops a sim.
function useDraftClock(hold) {
  const { league, commit } = useGame();
  const [, setN] = useState(0);
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
  const running = live && !c.paused && !hold && !hidden && !(league.moments?.length > 0);
  const lastSave = useRef(Date.now());
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => {
      const r = tickDraftClock(league);
      if (r) { lastSave.current = Date.now(); commit(); return; }
      if (Date.now() - lastSave.current > 5000) { lastSave.current = Date.now(); commit(3000); } else setN((n) => n + 1);
    }, clockTick(c.speed, s.round));
    return () => clearInterval(t);
  }, [running, c?.speed, s?.round, s?.overall]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => commit(), []); // eslint-disable-line react-hooks/exhaustive-deps
  return { live, c, s, running };
}

// ---------- Small parts ----------

function Ceiling({ read }) {
  const t = ceilingText(read);
  return <span className={`dy-val${read?.potV == null ? " unk" : ""}`}><b>{t.big}</b><small>{t.small}</small></span>;
}

function Who({ p, read, need, sub }) {
  const tier = read?.tier || (read?.potV == null ? "Not seen by your scouts" : projection(p.pos, read.potV));
  const notes = [read?.sleeper && "your scouts' sleeper", read?.flag && "red flag", ["superstar", "star", "generational"].includes(read?.dev) && "star trait spotted"].filter(Boolean);
  return (
    <span className="dy-tx">
      <b><span className="dy-nm">{p.name}</span><i>{p.age} · {p.pos}</i>{need && <em>need</em>}</b>
      <span>{sub || [tier, ...notes, club(p)].filter(Boolean).join(" · ")}</span>
    </span>
  );
}

function goneSlot(league, p) {
  return p.tid !== -2 && league.draft?.slots ? league.draft.slots.find((s) => s.pid === p.id) : null;
}

// ---------- Your list (drag to move) ----------

const PAGE = 25;

function ListRows({ ids, odds, oddsAt, live, onClock, onDraft, phone, n, setN, filterGone }) {
  const { league, commit, openPlayer } = useGame();
  const needs = userNeeds(league, 3);
  const box = useRef(null);
  const [drag, setDrag] = useState(null); // { pid, from, to, dy, y0 }
  // Names already taken above the first one left fold into one line (the last two stay, struck through).
  const lead = Math.max(0, ids.findIndex((id) => league.players[id]?.tid === -2));
  const [unfold, setUnfold] = useState(false);
  const fold = unfold || lead <= 3 ? 0 : lead - 2;
  const shown = ids.slice(fold, n + fold);
  const firstLeft = ids[lead];

  // Pointer drag on the grip: mouse and touch alike (touch-action: none on the grip).
  const rowsGeom = () => [...(box.current?.querySelectorAll("[data-li]") || [])].map((el) => { const r = el.getBoundingClientRect(); return { top: r.top, mid: r.top + r.height / 2, h: r.height }; });
  const start = (e, pid, i) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    const geom = rowsGeom();
    setDrag({ pid, from: i, to: i, dy: 0, y0: e.clientY, geom, h: geom[i]?.h || 60 });
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* a synthetic pointer */ }
  };
  const move = (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.y0;
    const y = drag.geom[drag.from].mid + dy;
    let to = drag.from;
    for (let j = 0; j < drag.geom.length; j++) if (y > drag.geom[j].mid) to = j >= drag.from ? j : j + 1;
    to = Math.max(0, Math.min(drag.geom.length - 1, y < drag.geom[0].mid ? 0 : to));
    // Near the edge of the screen: scroll along.
    if (typeof window !== "undefined") { if (e.clientY < 70) window.scrollBy(0, -12); else if (e.clientY > window.innerHeight - 70) window.scrollBy(0, 12); }
    setDrag({ ...drag, dy, to });
  };
  const end = () => {
    if (!drag) return;
    if (drag.to !== drag.from) { moveOnMyListTo(league, drag.pid, myListIds(league).indexOf(shown[drag.to])); commit(); }
    setDrag(null);
  };
  const key = (e, pid, i) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const j = i + (e.key === "ArrowUp" ? -1 : 1);
    if (j < 0 || j >= shown.length) return;
    moveOnMyListTo(league, pid, myListIds(league).indexOf(shown[j]));
    commit();
    setTimeout(() => box.current?.querySelectorAll("[data-grip]")[j]?.focus(), 0);
  };
  const shift = (i) => {
    if (!drag || i === drag.from) return 0;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -drag.h;
    if (drag.from > drag.to && i >= drag.to && i < drag.from) return drag.h;
    return 0;
  };

  return (
    <div className={`dy-rows${drag ? " dragging" : ""}`} ref={box} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      {fold > 0 && <button type="button" className="dy-fold" onClick={() => setUnfold(true)}>{fold} names above are gone · Show</button>}
      {shown.map((id, i0) => {
        const i = i0;
        const rank = i0 + fold + 1;
        const p = league.players[id];
        if (!p) return null;
        const read = p.tid === -2 ? prospectRead(league, p) : null;
        const gone = goneSlot(league, p);
        const need = needs.includes(p.pos);
        if (gone || p.tid !== -2) {
          if (filterGone) return null;
          return (
            <div key={id} data-li className="dy-li gone" style={{ transform: `translateY(${shift(i)}px)` }}>
              <span className="dy-rk">{rank}</span>
              <span className="dy-tx"><b><span className="dy-nm">{p.name}</span><i>{p.age} · {p.pos}</i></b><span>{gone ? `Gone at #${gone.overall}` : "Drafted"}</span></span>
              {gone && <span className="dy-gone">#{gone.overall} {league.teams[gone.owner]?.abbr}</span>}
            </div>
          );
        }
        const top = live && onClock && id === firstLeft;
        const dragging = drag?.pid === id;
        const o = odds?.[id];
        return (
          <React.Fragment key={id}>
            <div data-li className={`dy-li${top ? " top" : ""}${dragging ? " lift" : ""}`} style={{ transform: `translateY(${dragging ? drag.dy : shift(i)}px)` }}>
              <button type="button" data-grip className="dy-grip" aria-label={`Move ${p.name} (number ${rank}). Drag, or use the arrow keys.`}
                onPointerDown={(e) => start(e, id, i)} onKeyDown={(e) => key(e, id, i)}><span aria-hidden="true">⋮⋮</span></button>
              <span className="dy-rk">{rank}</span>
              <button type="button" className="dy-open" onClick={() => openPlayer(id, "draft")}>
                {!phone && <Silhouette size={top ? 44 : 36} decorative />}
                <Who p={p} read={read} need={need} sub={top ? `${read.tier || "Prospect"} · the top name left on your list` : undefined} />
              </button>
              {o != null && !top && <span className={`dy-odds${o < 0.3 ? " warn" : ""}`} title={`Chance he's still there at #${oddsAt}`}>{pct(o)}</span>}
              <Ceiling read={read} />
              {top && !phone && <DBtn kind="primary" grow={false} onClick={() => onDraft(p)}>Draft</DBtn>}
            </div>
            {top && phone && <DBtn kind="primary" onClick={() => onDraft(p)} style={{ width: "100%", margin: "4px 0 10px" }}>Draft</DBtn>}
          </React.Fragment>
        );
      })}
      {ids.length > n + fold && <button type="button" className="dy-more" onClick={() => setN(n + PAGE)}>Show more ({ids.length - n - fold} left)</button>}
    </div>
  );
}

// ---------- Your scouts' three options ----------

function ScoutsPicks({ at, onClock, onDraft, onSomeoneElse, picks, setAt, phone }) {
  const { league, openPlayer } = useGame();
  const opts = useMemo(() => scoutOptions(league, at), [league, at, league.draft?.idx, myListIds(league).length]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="dy-opts">
      {picks.length > 1 && (
        <div className="dy-chips" role="tablist" aria-label="Your picks">
          {picks.map((o) => <button key={o} type="button" role="tab" aria-selected={o === at} className={o === at ? "on" : ""} onClick={() => setAt(o)}>#{o}</button>)}
        </div>
      )}
      <div className="dy-optsh">{onClock ? `Your scouts' three options at #${at}` : `For pick #${at}, your scouts like`}</div>
      {opts.map((o, i) => {
        const p = league.players[o.pid];
        const read = prospectRead(league, p);
        return (
          <div key={o.pid} className={`dy-opt${i === 0 ? " first" : ""}`}>
            <div className="dy-opt-row">
              <button type="button" className="dy-open" onClick={() => openPlayer(p.id, "draft")}>
                {!phone && <Silhouette size={40} decorative />}
                <span className="dy-tx">
                  <span className="dy-opt-k">{o.label}</span>
                  <b><span className="dy-nm">{p.name}</span><i>{p.age} · {p.pos}</i>{userNeeds(league, 3).includes(p.pos) && <em>need</em>}</b>
                  {!phone && <span>{[read.tier, club(p)].filter(Boolean).join(" · ")}</span>}
                </span>
              </button>
              <Ceiling read={read} />
              {onClock && <DBtn kind={i === 0 ? "primary" : "quiet"} grow={false} onClick={() => onDraft(p)}>Draft</DBtn>}
            </div>
            <div className="dy-why">{o.why}{o.odds != null && <> <b className={o.odds < 0.3 ? "warn" : ""}>{pct(o.odds)}</b> he's still there at #{at}.</>}</div>
          </div>
        );
      })}
      {!opts.length && <div className="dy-empty">Nobody left to pick.</div>}
      <button type="button" className="dy-else" onClick={onSomeoneElse}>{onClock ? "Someone else…" : "Find someone else in the class…"}</button>
    </div>
  );
}

// ---------- Sheets ----------

// Find anyone in the class: add him to Your list, or (on the clock) draft him.
function FindSheet({ onClose, onDraft, canDraft }) {
  const { league, commit, openPlayer } = useGame();
  const [q, setQ] = useState("");
  const n = q.trim().toLowerCase();
  const pool = classPool(league);
  const hits = (n.length >= 2 ? pool.filter((p) => `${p.name} ${p.bio?.team || ""}`.toLowerCase().includes(n)) : pool).sort((a, b) => csRank(a) - csRank(b)).slice(0, 12);
  return (
    <Dialog title={canDraft ? "Someone else" : "Find a player"} sub={canDraft ? "Anyone still in the class, by Central Scouting's order." : "Add anyone in the class to Your list. Central Scouting's order."} onClose={onClose}>
      <input className="search dy-search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or junior club" aria-label="Search the draft class" />
      <div className="dy-find">
        {hits.map((p) => {
          const read = prospectRead(league, p);
          const on = myListIds(league).includes(p.id);
          return (
            <div key={p.id} className="dy-li">
              <span className="dy-rk">{csRank(p)}</span>
              <button type="button" className="dy-open" onClick={() => { onClose(); openPlayer(p.id, "draft"); }}><Who p={p} read={read} /></button>
              <Ceiling read={read} />
              {canDraft ? <DBtn grow={false} onClick={() => { onClose(); onDraft(p); }}>Draft</DBtn>
                : <DBtn grow={false} onClick={() => { toggleMyList(league, p.id); commit(); }}>{on ? "On your list" : "Add"}</DBtn>}
            </div>
          );
        })}
        {!hits.length && <div className="dy-empty">Nobody in this class matches.</div>}
      </div>
    </Dialog>
  );
}

// Change who your scouts interview and work out (Combine week).
function VisitsSheet({ onClose }) {
  const { league, commit, toast, openPlayer } = useGame();
  const d = league.draft;
  const plan = visitPlan(league);
  const list = scoutsShortlist(league, { max: 12 });
  const ids = [...new Set([...plan.interview, ...plan.workout, ...list.map((x) => x.p.id)])];
  const flip = (pid, kind, on) => { const r = setVisit(league, pid, kind, on); if (!r.ok && r.msg) toast(r.msg); commit(); };
  return (
    <Dialog title="Combine visits" sub={`${d.interviewsLeft ?? 0} interviews and ${d.workoutsLeft ?? 0} workouts. Your scouts spend them when the draft starts.`} onClose={onClose}
      actions={<DBtn kind="primary" onClick={onClose}>Done</DBtn>}>
      <div className="dy-find">
        {ids.map((id) => {
          const p = league.players[id];
          if (!p || p.tid !== -2) return null;
          const why = list.find((x) => x.p.id === id)?.why?.[1] || list.find((x) => x.p.id === id)?.why?.[0] || "";
          const iv = plan.interview.includes(id), wo = plan.workout.includes(id);
          return (
            <div key={id} className="dy-li">
              <button type="button" className="dy-open" onClick={() => openPlayer(id, "draft")}><Who p={p} read={prospectRead(league, p)} sub={why ? why[0].toUpperCase() + why.slice(1) : undefined} /></button>
              <span className="dy-vis">
                {p.combine && !p.scout?.intv && <button type="button" className={iv ? "on" : ""} aria-pressed={iv} onClick={() => flip(id, "interview", !iv)}>Interview</button>}
                {(p.scout?.lvl || 0) < 2 && <button type="button" className={wo ? "on" : ""} aria-pressed={wo} onClick={() => flip(id, "workout", !wo)}>Workout</button>}
              </span>
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}

// Trade offers as one quiet sheet: what you give, what you get, and the odds for Your list at the new pick.
function OffersSheet({ offers, kind, onClose }) {
  const { league, commit, toast } = useGame();
  const [i, setI] = useState(0);
  const o = offers[Math.min(i, offers.length - 1)];
  if (!o) return null;
  const t = league.teams[o.team];
  const up = o.kind === "up";
  const at = o.theirOverall;
  // Who'd be there at the new pick if you said yes.
  const owners = up ? { [o.theirOverall]: league.userTid, [o.myOverall]: o.team } : { [o.myOverall]: o.team, [o.theirOverall]: league.userTid };
  const ids = myListIds(league).filter((id) => league.players[id]?.tid === -2).slice(0, 4);
  const odds = availabilityOdds(league, ids, at, { owners });
  const target = o.target && league.players[o.target];
  const yes = () => { const r = acceptCall(league, o); toast(r.msg); commit(); onClose(); };
  const no = () => { dismissCall(league, o); commit(); if (offers.length <= 1) onClose(); else setI(0); };
  const give = up ? [o.mine, ...o.extras] : [o.mine];
  const get = up ? [o.theirs] : [o.theirs, ...o.extras];
  return (
    <Dialog title={up ? `Move up to #${at} with the ${t.name}?` : `Trade down with the ${t.name}?`}
      sub={up ? `It costs ${give.map((id) => pickNumber(league, id)).join(" + ")}.` : `They want to move up${target ? ` for ${target.name}` : ""}.`} onClose={onClose}
      actions={<><DBtn onClick={no}>{up ? "No thanks" : `Keep #${o.myOverall}`}</DBtn><DBtn kind="primary" onClick={yes}>Make the trade</DBtn></>}>
      {offers.length > 1 && <div className="dy-chips">{offers.map((x, k) => <button key={x.id} type="button" className={k === i ? "on" : ""} onClick={() => setI(k)}>{league.teams[x.team].abbr} #{x.theirOverall}</button>)}</div>}
      <div className="dy-kv"><div><small>You give</small><b>{give.map((id) => pickNumber(league, id)).join(" + ")}</b></div><div><small>You get</small><b>{get.map((id) => pickNumber(league, id)).join(" + ")}</b></div></div>
      <div className="dy-optsh">Your list at #{at} <span>chance he's still there</span></div>
      {ids.map((id) => { const p = league.players[id]; const read = prospectRead(league, p); return (
        <div key={id} className="dy-li"><Who p={p} read={read} /><span className={`dy-big${odds[id] < 0.3 ? " warn" : ""}`}>{pct(odds[id])}</span></div>
      ); })}
    </Dialog>
  );
}
function pickNumber(league, id) {
  const pk = pickOf(league, id);
  if (!pk) return "?";
  const d = league.draft;
  const s = d && pk.year === d.year ? d.slots.find((x) => x.round === pk.round && x.orig === pk.orig) : null;
  return s ? `#${s.overall}` : `${pk.year} R${pk.round}`;
}

// ---------- The side column ----------

function UpNext() {
  const { league } = useGame();
  const d = league.draft;
  const next = d.slots.slice(d.idx, d.idx + 5);
  return (
    <div className="dy-card">
      <h3>Up next</h3>
      {next.map((s, i) => { const t = league.teams[s.owner], me = s.owner === league.userTid; return (
        <div key={s.overall} className={`dy-mini${me ? " me" : ""}`}>
          <span className="n">#{s.overall}</span><TeamBadge team={t} size={20} decorative /><span className="t">{me ? "You" : t.name}</span>
          <span className="p">{i === 0 ? "now" : me ? `${s.overall - d.slots[d.idx].overall} away` : ""}</span>
        </div>
      ); })}
    </div>
  );
}

function JustTaken() {
  const { league, openPlayer } = useGame();
  const d = league.draft;
  const made = d.slots.slice(0, d.idx).filter((s) => s.pid).slice(-3).reverse();
  if (!made.length) return null;
  return (
    <div className="dy-card">
      <h3>Just taken</h3>
      {made.map((s) => { const p = league.players[s.pid], t = league.teams[s.owner]; return (
        <button type="button" key={s.overall} className={`dy-mini btn${s.owner === league.userTid ? " me" : ""}`} onClick={() => openPlayer(p.id)}>
          <span className="n">#{s.overall}</span><TeamBadge team={t} size={20} decorative /><span className="t">{p.name} <i>{p.pos}</i></span><span className="p">{t.abbr}</span>
        </button>
      ); })}
    </div>
  );
}

function OfferCard({ onOpen }) {
  const { league } = useGame();
  const s = currentSlot(league);
  const onClock = s?.owner === league.userTid;
  const offers = onClock ? onClockOffers(league) : tradeUpCalls(league, 3);
  if (!offers.length) return null;
  const o = offers[0];
  const t = (x) => league.teams[x.team].name;
  const names = offers.map(t);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  return (
    <div className="dy-card">
      <h3>{onClock ? `${offers.length} offer${offers.length > 1 ? "s" : ""} for your pick` : "Move up?"}</h3>
      <div className="dy-cardtx">{onClock
        ? <>{list} want{offers.length === 1 ? "s" : ""} to move up. Closest: {[o.theirs, ...o.extras].map((id) => pickNumber(league, id)).join(" + ")} from the {t(o)}.</>
        : <>The {t(o)} would move down from #{o.theirOverall} for {[o.mine, ...o.extras].map((id) => pickNumber(league, id)).join(" + ")}.</>}</div>
      <DBtn grow={false} onClick={() => onOpen(offers)}>{onClock ? "See offers" : "See the deal"}</DBtn>
    </div>
  );
}

function CombineCard({ onChange }) {
  const { league } = useGame();
  const plan = visitPlan(league);
  const name = (id) => last(league.players[id]?.name);
  const join = (a) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} and ${a.at(-1)}` : a[0]);
  const iv = plan.interview.map(name), wo = plan.workout.map(name);
  return (
    <div className="dy-card">
      <h3>Combine week</h3>
      <div className="dy-cardtx">{iv.length || wo.length ? <>Your scouts will {iv.length ? <>interview <b>{join(iv)}</b></> : null}{iv.length && wo.length ? " and " : ""}{wo.length ? <>work out <b>{join(wo)}</b></> : null} before the draft.</> : "Your scouts have used every interview and workout."}</div>
      {(iv.length > 0 || wo.length > 0 || (league.draft.interviewsLeft || league.draft.workoutsLeft)) && <DBtn grow={false} onClick={onChange}>Change who</DBtn>}
    </div>
  );
}

function HowItWorks() {
  return (
    <div className="dy-card how">
      <h3>How the list works</h3>
      <p><b>On the clock:</b> the top name still there lights up. Tap Draft, or pick anyone else.</p>
      <p><b>Clock runs out:</b> you take the top name left.</p>
      <p><b>Picks you skip:</b> your scouts take the top name left on this list, then their board.</p>
    </div>
  );
}

function Unseen({ onFind }) {
  const { league, commit, openPlayer } = useGame();
  const on = new Set(myListIds(league));
  const unseen = classPool(league).filter((p) => !on.has(p.id) && prospectRead(league, p).potV == null).sort((a, b) => csRank(a) - csRank(b)).slice(0, 3);
  return (
    <div className="dy-card">
      <h3>Not on your list</h3>
      {unseen.length > 0 && <div className="dy-cardtx">Nobody on your staff covers their leagues.</div>}
      {unseen.map((p) => (
        <div key={p.id} className="dy-mini">
          <button type="button" className="t linkish" onClick={() => openPlayer(p.id, "draft")}>{p.name} <i>{p.pos} · CS #{csRank(p)}</i></button>
          <button type="button" className="dy-add" onClick={() => { toggleMyList(league, p.id); commit(); }}>Add</button>
        </div>
      ))}
      <button type="button" className="dy-findbtn" onClick={onFind}>Find a player to add</button>
    </div>
  );
}

// ---------- The Draft screen ----------

export default function DraftDay({ act, onClass }) {
  const { league, commit, toast } = useGame();
  const phone = usePhone();
  const [sheet, setSheet] = useState(null); // { kind: "find" | "else" | "visits" | "offers", offers }
  const { live, c, s } = useDraftClock(!!sheet);
  const d = league.draft;
  const inDraft = league.phase === "draft" && !!d?.slots;
  const combine = atCombine(league);
  const done = inDraft && draftDone(league);
  const onClock = live && s.owner === league.userTid;
  const np = inDraft ? nextPick(league) : null;
  const myPicks = inDraft ? d.slots.filter((x) => x.owner === league.userTid && !x.pid).map((x) => x.overall) : [];
  const [view, setView] = useState(null); // "opts" | "list"
  const shownView = view || (onClock ? "opts" : "list");
  const [at, setAt] = useState(null);
  const optAt = at && myPicks.includes(at) && !onClock ? at : np?.overall;
  const [n, setN] = useState(PAGE);
  // A new pick on the clock: back to the default (the scouts' options when it's yours).
  const key = `${d?.idx}|${onClock}`;
  const lastKey = useRef(key);
  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key; setView(null); setAt(null);
    // Your pick: the three options and Draft buttons come into view.
    if (onClock && typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const ids = myListIds(league);
  const oddsAt = !onClock && np ? np.overall : null;
  const odds = useMemo(() => (oddsAt ? availabilityOdds(league, ids.filter((id) => league.players[id]?.tid === -2).slice(0, 30), oddsAt) : null), [league, oddsAt, d?.idx, ids.slice(0, 30).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const draft = (p) => {
    if (!onClock) return;
    const r = draftPlayer(league, p.id);
    if (!r) return;
    commit();
  };
  const simMine = () => { const k = simToMyPick(league); commit(); if (k) toast(`${k} pick${k === 1 ? "" : "s"} made. ${currentSlot(league)?.owner === league.userTid ? "You're on the clock." : ""}`); };
  const scoutsRest = () => { scoutsPickRest(league); commit(); };

  // ----- headline -----
  let head = null;
  const goneMine = live ? ids.slice(0, ids.indexOf(ids.find((id) => league.players[id]?.tid === -2)) + 1).filter((id) => league.players[id]?.tid !== -2).length : 0;
  const topLeft = league.players[ids.find((id) => league.players[id]?.tid === -2)];
  if (!inDraft) {
    const sl = np?.overall;
    head = <><h1 className="dy-hs">Your list is your draft.</h1><p className="dy-hsub">Your scouts keep adding names as they file reports. At the Combine they rank the whole class for you; drag a name to move him.</p></>;
    void sl;
  } else if (combine) {
    const first = myPicks[0];
    const likely = first ? Object.entries(availabilityOdds(league, ids.filter((id) => league.players[id]?.tid === -2).slice(0, 40), first)).filter(([, v]) => v >= 0.5).length : 0;
    head = <><h1 className="dy-hs">{first ? `You pick ${ord(first)}.` : "You have no picks in this draft."}</h1>
      <p className="dy-hsub">{first ? `Your scouts have ${likely} name${likely === 1 ? "" : "s"} on your list who should be there. Drag a name to move him; when you're on the clock, the top name left is one tap away.` : "You can still watch it, or trade for a pick once it starts."}</p></>;
  } else if (onClock && phone) {
    head = null; // the hero carries "#30 On the clock" and the time; Pause sits in the action bar
  } else if (onClock) {
    head = (
      <div className="dy-otc">
        <div><b>You're on the clock</b><span>{goneMine ? `${goneMine} name${goneMine === 1 ? "" : "s"} on your list ${goneMine === 1 ? "is" : "are"} gone. ` : ""}{topLeft ? `${last(topLeft.name)} is still here.` : ""}</span></div>
      </div>
    );
  } else if (live) {
    const nx = nextUserSlot(league);
    const t = league.teams[s.owner];
    head = (
      <div className="dy-between">
        <div>
          <b>{nx ? `Your next pick is #${nx.slot.overall}, ${nx.away} away.` : "You have no picks left."}</b>
          <span>{t.name} {c.paused ? "are up (paused)" : `are on the clock · ${clockText(c.remaining)}`}</span>
        </div>
        <span className="dy-between-act">
          {nx && !phone && <DBtn kind="primary" grow={false} onClick={simMine}>Sim to my next pick</DBtn>}
          {nx && <button type="button" className="dy-quietlink" onClick={scoutsRest}>Scouts pick the rest</button>}
        </span>
      </div>
    );
  } else if (done) {
    head = (
      <div className="dy-between">
        <div><b>The draft is done.</b><span>Your class is in. What your scouts saw is on Your class; the truth comes out over two seasons.</span></div>
        <span className="dy-between-act"><DBtn grow={false} onClick={onClass}>See your class</DBtn></span>
      </div>
    );
  }

  const listCard = (
    <div className="dy-card list">
      <div className="dy-listhead">
        {inDraft && !done && (
          <span className="dy-seg" role="tablist" aria-label="View">
            <button type="button" role="tab" aria-selected={shownView === "opts"} className={shownView === "opts" ? "on" : ""} onClick={() => setView("opts")}>Scouts' picks</button>
            <button type="button" role="tab" aria-selected={shownView === "list"} className={shownView === "list" ? "on" : ""} onClick={() => setView("list")}>Your list</button>
          </span>
        )}
        {(!inDraft || done) && <span className="dy-lbl">Your list <i>{ids.filter((id) => league.players[id]?.tid === -2).length} left</i></span>}
        {shownView === "list" && (
          <span className="dy-listact">
            {!phone && <button type="button" className="dy-q" onClick={() => setSheet({ kind: "find" })}>Add a player</button>}
            <button type="button" className="dy-q ghost" onClick={() => { resetMyList(league); commit(); toast("Your list is back in your scouts' order."); }}>Reset to scouts' order</button>
          </span>
        )}
      </div>
      {shownView === "opts" && inDraft && !done ? (
        <ScoutsPicks phone={phone} at={onClock ? s.overall : optAt} onClock={onClock} onDraft={draft} picks={onClock ? [] : myPicks} setAt={setAt}
          onSomeoneElse={() => setSheet({ kind: onClock ? "else" : "find" })} />
      ) : (
        <>
          {oddsAt && <div className="dy-divider"><b>Top of your list</b> · chance he lasts to #{oddsAt}</div>}
          {!ids.length && <div className="dy-empty">Your scouts haven't filed on anyone yet. Their reads come in through the season.</div>}
          <ListRows ids={ids} odds={odds} oddsAt={oddsAt} live={live} onClock={onClock} onDraft={draft} phone={phone} n={n} setN={setN} />
        </>
      )}
    </div>
  );

  const side = (
    <div className="dy-side">
      {live && <UpNext />}
      {live && !onClock && <JustTaken />}
      {live && <OfferCard onOpen={(offers) => setSheet({ kind: "offers", offers })} />}
      {combine && <CombineCard onChange={() => setSheet({ kind: "visits" })} />}
      {!live && !done && <HowItWorks />}
      {!live && !done && <Unseen onFind={() => setSheet({ kind: "find" })} />}
      {combine && myPicks.length > 0 && <div className="dy-card"><h3>Your picks</h3><div className="dy-cardtx">{myPicks.map((o) => `#${o}`).join(" · ")}</div></div>}
    </div>
  );

  return (
    <div className="dy">
      <div className="dy-main">
        {head}
        {listCard}
      </div>
      {side}
      {sheet?.kind === "find" && <FindSheet onClose={() => setSheet(null)} />}
      {sheet?.kind === "else" && <FindSheet canDraft onDraft={draft} onClose={() => setSheet(null)} />}
      {sheet?.kind === "visits" && <VisitsSheet onClose={() => setSheet(null)} />}
      {sheet?.kind === "offers" && <OffersSheet offers={sheet.offers} onClose={() => setSheet(null)} />}
    </div>
  );
}

// ---------- Your class ----------

const HOW = { user: "you picked him", list: "from your list", scouts: "your scouts' pick" };

export function YourClass() {
  const { league, openPlayer } = useGame();
  const years = classYears(league);
  const [pickYr, setPickYr] = useState(null);
  const [whole, setWhole] = useState(false);
  const year = years.includes(pickYr) ? pickYr : years[0];
  if (!year) return (
    <div className="dy narrow"><div className="dy-main">
      <h1 className="dy-hs">No class yet.</h1>
      <p className="dy-hsub">After the draft, your picks show up here with what your scouts believed. The truth comes out over their first two seasons.</p>
    </div></div>
  );
  const rows = myClassRows(league, year);
  const live = league.phase === "draft" && league.draft?.year === year && !draftDone(league);
  const mineHand = rows.filter((r) => r.how === "user").length;
  const grade = analystsGrade(league, league.userTid, year);
  const matured = classMatured(league, year);
  const headline = live ? "Your class so far." : rows.length && mineHand === rows.length ? "You picked every one." : mineHand ? "Your list picked the rest." : rows.length ? "Your scouts made the picks." : "No picks this year.";
  const sub = live ? "Each pick as your scouts read him on draft day." : mineHand && mineHand < rows.length ? `You made ${mineHand === 1 ? "one pick" : `${mineHand} picks`}. Your scouts took the top name left on your list for the rest.` : "What your scouts believed on draft day. His real ceiling comes out over his first two seasons.";
  return (
    <div className="dy narrow">
      <div className="dy-main">
        <div className="dy-classhead">
          <div><h1 className="dy-hs">{headline}</h1><p className="dy-hsub">{sub}</p></div>
          {years.length > 1 && <span className="dy-chips">{years.slice(0, 4).map((y) => <button key={y} type="button" className={y === year ? "on" : ""} onClick={() => setPickYr(y)}>{y}</button>)}</span>}
        </div>
        <div className="dy-card list">
          {rows.map((r) => {
            const p = league.players[r.pid];
            return (
              <button type="button" key={r.pid} className="dy-li btn" onClick={() => p && openPlayer(r.pid)}>
                <Silhouette size={40} decorative />
                <span className="dy-tx"><b><span className="dy-nm">{r.name}</span><i>{r.age ?? ""}{r.age ? " · " : ""}{r.pos}</i></b>
                  <span>R{r.round} · #{r.overall}{r.how ? ` · ${HOW[r.how]}` : ""}{r.where ? ` · ${r.where}` : ""}</span></span>
                <span className="dy-val"><b>{r.ceiling == null ? "?" : r.est ? `~${r.ceiling}` : r.ceiling}</b><small>{r.ceiling == null ? "not seen" : r.est ? (r.stage > 0 ? "updated read" : "scouts' read") : "ceiling"}</small></span>
              </button>
            );
          })}
          {!rows.length && <div className="dy-empty">You didn't make a pick in the {year} draft.</div>}
        </div>
        <div className="dy-gradeline">
          {grade && <span>Analysts' grade <b>{grade}</b> <i>where each pick went against Central Scouting's ranking</i></span>}
          <button type="button" className="dy-quietlink" onClick={() => setWhole((v) => !v)}>{whole ? "Hide the whole draft" : "The whole draft"}</button>
        </div>
        {whole && <WholeDraft year={year} matured={matured} />}
      </div>
    </div>
  );
}

// Every pick of one draft. On draft day: who went where and the analysts' grades (public). Two
// seasons on, when the truth is out for everyone: the real verdicts and the class ranking.
function WholeDraft({ year, matured }) {
  const { league, openPlayer } = useGame();
  const [round, setRound] = useState(1);
  const rec = useMemo(() => (matured ? draftRecap(league, year) : null), [league, year, matured]);
  const src = league.draft?.year === year && league.draft.slots?.some((s) => s.pid) ? league.draft.slots : (league.draftHistory || []).find((h) => h.year === year)?.picks || [];
  const picks = src.filter((s) => s.pid && s.round === round);
  const grades = matured ? null : analystsGrades(league, year);
  const verdict = (pid) => rec?.rows.find((r) => r.pid === pid);
  const me = league.userTid;
  return (
    <div className="dy-card list">
      <div className="dy-listhead">
        <span className="dy-lbl">{matured ? "Two seasons on" : "Every pick"}</span>
        <span className="dy-chips">{Array.from({ length: 7 }, (_, i) => i + 1).map((r) => <button key={r} type="button" className={r === round ? "on" : ""} onClick={() => setRound(r)}>R{r}</button>)}</span>
      </div>
      {picks.map((s) => {
        const p = league.players[s.pid];
        const t = league.teams[s.owner];
        const v = verdict(s.pid);
        return (
          <button type="button" key={s.overall} className={`dy-mini btn${s.owner === me ? " me" : ""}`} onClick={() => p && openPlayer(s.pid)}>
            <span className="n">#{s.overall}</span><TeamBadge team={t} size={20} decorative />
            <span className="t">{p?.name || s.name} <i>{p?.pos || s.pos}</i></span>
            <span className="p">{v ? <span style={{ color: (VERDICT[v.verdict] || VERDICT.solid)[1] }}>{(VERDICT[v.verdict] || VERDICT.solid)[0].replace(/^[^A-Za-z]+/, "")}</span> : s.grade ? <span title={pickTake(s.grade, s.overall, s.csr)}>{s.grade}</span> : ""}</span>
          </button>
        );
      })}
      {grades && grades.length > 0 && round === 1 && (
        <div className="dy-grades">
          <div className="dy-optsh">Analysts' class grades</div>
          <div className="dy-gradegrid">{grades.map((g) => <span key={g.tid} className={g.tid === me ? "me" : ""}><TeamBadge team={league.teams[g.tid]} size={18} decorative />{league.teams[g.tid].abbr} <b>{g.g}</b></span>)}</div>
        </div>
      )}
      {rec && round === 1 && (
        <div className="dy-grades">
          <div className="dy-optsh">How each class turned out</div>
          <div className="dy-gradegrid">{rec.grades.filter((g) => g.picks.length).sort((a, b) => a.rank - b.rank).map((g) => <span key={g.tid} className={g.tid === me ? "me" : ""}><TeamBadge team={league.teams[g.tid]} size={18} decorative />{league.teams[g.tid].abbr} <b>{g.grade}</b></span>)}</div>
        </div>
      )}
    </div>
  );
}

export { potGrade, PlayerName };
