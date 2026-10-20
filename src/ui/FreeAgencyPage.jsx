import { negotiate, myOffers, bidStanding, withdrawBid, pendingSpend } from "../engine/negotiations.js";
import Headshot from "./Headshot.jsx";
import React, { useMemo, useState } from "react";
import { useGame, PlayerName, money, Modal, ovrColor } from "./common.jsx";
import Select from "./Select.jsx";
import ContractModal from "./ContractModal.jsx";
import { faAsk, offerContract, expiringPlayers, resignAsk, resignPlayer, letWalk, simFADay } from "../engine/offseason.js";
import { capSpace, counts, capYear } from "../engine/roster.js";
import { MAX_ROSTER, FA_DAYS, ARCHETYPES, capForYear } from "../engine/constants.js";
import { isRFA } from "../engine/players.js";
import { POS_COLOR } from "./TradePage.jsx";

const PosBadge = ({ pos }) => <span className="gg-pos" style={{ background: POS_COLOR[pos] || "#64748b" }}>{pos}</span>;
const MugPos = ({ p, team }) => <span className="gg-mugpos"><Headshot p={p} team={team} size={36} decorative fallback="none" /><PosBadge pos={p.pos} /></span>;
const POS = ["C", "LW", "RW", "LD", "RD", "G"];

function OfferModal({ p, onClose }) { return <ContractModal p={p} kind="fa" onClose={onClose} />; }

// Where a free agent's market stands, as Gridiron's market tags it: your bid and how it is
// going, other clubs' offers, or nobody in yet.
function MarketTag({ p }) {
  const { league } = useGame();
  const st = bidStanding(league, p.id);
  if (st?.status === "pending") return <span className={`gg-bid ${st.standing}`} title={st.says}>{st.label} · {st.daysLeft === 0 ? "decides today" : `${st.daysLeft}d`}</span>;
  if (st?.status === "counter") return <span className="gg-bid counter" title={st.says}>Countered</span>;
  if (st?.status === "walked") return <span className="gg-bid walked" title={st.says}>Talks over</span>;
  if (league.phase !== "freeagency") return null;
  const n = league.negotiations?.[p.id];
  const bids = n?.status === "pending" && n.year === league.year ? n.bids.length : 0;
  if (bids) {
    const d = Math.max(0, (n.closes ?? 0) - (league.fa?.day || 0));
    return <span className="gg-nobids has">{bids} offer{bids > 1 ? "s" : ""} · {d === 0 ? "decides today" : `${d}d`}</span>;
  }
  return <span className="gg-nobids">No offers yet</span>;
}

// The free-agency calendar, like Gridiron's market bar: what day it is, what happened on the
// last one, and the button to move on.
function FaDayBar() {
  const { league, commit, toast } = useGame();
  if (league.phase !== "freeagency" || !league.fa) return null;
  const day = league.fa.day || 0;
  const s = league.fa.summary?.day === day ? league.fa.summary : null;
  const next = () => { simFADay(league); commit(); const sum = league.fa?.summary; if (sum) toast(sum.mine?.length ? `${sum.text} You signed ${sum.mine.join(", ")}.` : sum.text, 4500); };
  return (
    <section className="gg-faday">
      <span className="gg-faday-k">📅 Day {day} of {FA_DAYS}</span>
      <span className="gg-faday-txt">
        {s ? <b>{s.signed ? <>{s.signed} signed{s.top ? <>, led by {s.top.name} ({s.top.abbr})</> : null}.</> : "Nobody signed."} </b> : null}
        Clubs sign players every day. Each agent collects offers for two days, then takes the best one for his client: the money, plus the role, the winning or the term he cares about.
      </span>
      {day < FA_DAYS ? <button className="primary gg-faday-btn" onClick={next}>Next day →</button> : <span className="gg-faday-last">Last day: start the season when you are ready.</span>}
    </section>
  );
}

function ResignView() {
  const { league, commit, toast } = useGame();
  const user = league.teams[league.userTid];
  const expiring = expiringPlayers(league, user).sort((a, b) => b.ovr - a.ovr);
  const [terms, setTerms] = useState({});
  const [talk, setTalk] = useState(null);
  const termFor = (p) => terms[p.id] ?? resignAsk(league, p).prefYrs;
  const doSign = (p) => { const r = resignPlayer(league, p.id, termFor(p)); if (!r.ok) toast(r.msg, 4500); commit(); };
  const walk = (p) => { if (p.offerSheetPending) { toast("Resolve the pending offer sheet under Front Office → Operations."); return; } letWalk(league, p.id); commit(); };
  const signed = user.roster.map((id) => league.players[id]).filter((p) => p && p.yrs > 0);
  return (
    <section className="gg-card">
      <div className="gg-k">RE-SIGN WINDOW · {expiring.length} EXPIRING</div>
      <div className="dim small" style={{ marginBottom: 8 }}>Re-sign expiring players, or use Front Office → Operations to qualify RFAs, negotiate with agents or seek arbitration. {signed.length} players under contract for next season · cap {money(capForYear(capYear(league)))} · space {money(capSpace(league, user))}.</div>
      <div className="gg-falist">
        {expiring.map((p) => {
          const ask = p.willing ? resignAsk(league, p, termFor(p)) : null;
          return (
            <div key={p.id} className="gg-farow resign">
              <MugPos p={p} team={user} />
              <span className="gg-faname"><b><PlayerName p={p} /></b><small>{p.age + 1} next season · POT {p.pot} · was {money(p.prevCap)} · {isRFA(p) ? "RFA" : "UFA"}</small></span>
              <span className="gg-tovr" style={{ color: ovrColor(p.ovr) }}>{p.ovr}</span>
              <span className={`gg-famood ${p.willing ? (p.mood > 0.6 ? "good" : p.mood > 0.35 ? "" : "warn") : "bad"}`}>{p.willing ? (p.mood > 0.6 ? "Happy" : p.mood > 0.35 ? "Open" : "Lukewarm") : "Testing FA"}</span>
              <Select value={termFor(p)} onChange={(e) => setTerms({ ...terms, [p.id]: Number(e.target.value) })} disabled={!p.willing} aria-label={`Term for ${p.name}`} style={{ minWidth: 90 }}>
                {[1, 2, 3, 4, 5, 6, 7].map((y) => <option key={y} value={y}>{y} yr{y > 1 ? "s" : ""}</option>)}
              </Select>
              <span className="gg-faask">{ask ? money(ask.aav) : "—"}</span>
              <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                <button className="small primary" onClick={() => setTalk(p)}>Negotiate</button>
                <button className="small ghost" onClick={() => walk(p)}>Let walk</button>
              </span>
            </div>
          );
        })}
        {!expiring.length && <div className="dim small">No expiring contracts left to decide on.</div>}
      </div>
      {talk && league.players[talk.id] && <ContractModal p={league.players[talk.id]} kind="resign" onClose={() => setTalk(null)} />}
    </section>
  );
}

export default function FreeAgencyPage() {
  const { league } = useGame();
  const [offerFor, setOfferFor] = useState(null);
  const [pos, setPos] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("ovr");
  const user = league.teams[league.userTid];
  const open = league.phase !== "draft" && league.phase !== "resign" && league.phase !== "playoffs";
  const fas = useMemo(() => {
    const list = league.freeAgents.map((id) => league.players[id]).filter((p) => p && (pos === "all" || p.pos === pos) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
    const key = sort === "age" ? (p) => -p.age : sort === "pot" ? (p) => p.pot : sort === "ask" ? (p) => -faAsk(league, p).aav : (p) => p.ovr;
    return list.sort((a, b) => key(b) - key(a) || b.ovr - a.ovr);
  }, [league, pos, q, sort, league.freeAgents.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const best = fas[0];
  return (
    <div className="stack gg-fa">
      <div className="gg-pagehead">
        <div><h2>{league.phase === "resign" ? "Re-sign Players" : "Free Agency"}</h2><div className="gg-status">{league.phase === "freeagency" ? `Day ${league.fa.day} of ${FA_DAYS} · ` : ""}{league.freeAgents.length} available · cap space <b style={{ color: "#22c55e" }}>{money(capSpace(league, user))}</b> · roster {counts(league, user).active}/{MAX_ROSTER}</div></div>
        {!open && <span className="gg-phase">Market opens after the draft and re-sign period</span>}
      </div>
      {league.phase === "resign" && <ResignView />}
      <FaDayBar />
      <MyOffers onRaise={(id) => setOfferFor(id)} />
      <div className="gg-card">
        <div className="gg-fa-tools">
          <div className="gg-chips">{["all", ...POS].map((x) => <button key={x} className={pos === x ? "on" : ""} onClick={() => setPos(x)}>{x === "all" ? "All" : x}</button>)}</div>
          <input className="gg-fa-search" placeholder="Search free agents…" aria-label="Search free agents" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort free agents" style={{ minWidth: 150 }}>
            <option value="ovr">Sort: overall</option><option value="pot">Sort: potential</option><option value="age">Sort: youngest</option><option value="ask">Sort: cheapest</option>
          </Select>
        </div>
        <div className="gg-falist">
          {fas.slice(0, 120).map((p) => {
            const ask = faAsk(league, p);
            return (
              <div key={p.id} className={`gg-farow${p === best ? " top" : ""}`}>
                <MugPos p={p} team={null} />
                <span className="gg-faname"><b><PlayerName p={p} /></b><small>{p.age} yrs · POT {p.pot} · {ARCHETYPES[p.type]?.name}{p.rookie ? " · Rookie" : ""}</small></span>
                <span className="gg-tovr" style={{ color: ovrColor(p.ovr) }}>{p.ovr}</span>
                <span className="gg-faask"><b>{money(ask.aav)}</b><small>× {ask.yrs} yr{ask.yrs > 1 ? "s" : ""}</small><MarketTag p={p} /></span>
                <button className="small primary" disabled={!open} onClick={() => setOfferFor(p.id)}>{bidStanding(league, p.id)?.status === "pending" ? "Raise" : "Offer"}</button>
              </div>
            );
          })}
          {!fas.length && <div className="dim small">No free agents match.</div>}
        </div>
      </div>
      {offerFor && league.players[offerFor] && <OfferModal p={league.players[offerFor]} onClose={() => setOfferFor(null)} />}
    </div>
  );
}

// Every offer you have on the table this summer, and how it is going.
function MyOffers({ onRaise }) {
  const { league, commit, toast } = useGame();
  const offers = myOffers(league);
  if (!offers.length) return null;
  const pending = offers.filter((o) => o.standing.status === "pending").length;
  const user = league.teams[league.userTid];
  const committed = pendingSpend(league, user.id), room = capSpace(league, user);
  return (
    <section className="gg-card gg-myoffers">
      <div className="gg-k">YOUR OFFERS <span className="dim" style={{ letterSpacing: 0, textTransform: "none" }}>· {pending} waiting on an answer · agents decide after two free-agency days</span></div>
      {committed > room + 1e-6 && <div className="gg-offer-warn">Offers out total {money(committed)} against {money(room)} of cap room. Talk to as many agents as you like; if more accept than you can fit, the earliest offers sign first and the rest fall through.</div>}
      <div className="gg-offers">
        {offers.map(({ p, standing: st, n }) => (
          <div key={p.id} className={`gg-offer ${st.status} ${st.standing || ""}`}>
            <MugPos p={p} team={null} />
            <span className="gg-faname"><b><PlayerName p={p} /></b><small>{p.age} yrs · <span style={{ color: ovrColor(p.ovr) }}>{p.ovr}</span> OVR{st.mine ? ` · your offer ${money(st.mine.aav)} × ${st.mine.yrs}` : n.mineAav ? ` · your offer ${money(n.mineAav)} × ${n.mineYrs}` : ""}</small></span>
            <span className={`gg-bid ${st.standing || st.status}`}>{st.label}{st.status === "pending" ? ` · ${st.daysLeft === 0 ? "decides today" : `${st.daysLeft}d`}` : ""}</span>
            <span className="gg-offer-says">{st.says}</span>
            <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
              {(st.status === "pending" || st.status === "counter") && <button className="small primary" onClick={() => onRaise(p.id)}>{st.status === "counter" ? "Reply" : "Raise"}</button>}
              {st.status === "pending" && <button className="small ghost" onClick={() => { const r = withdrawBid(league, p.id); toast(r.msg); commit(); }}>Withdraw</button>}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
