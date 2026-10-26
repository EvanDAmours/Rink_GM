import { negotiate, myOffers, bidStanding, withdrawBid, pendingSpend } from "../engine/negotiations.js";
import Headshot from "./Headshot.jsx";
import AbilityChip from "./AbilityChip.jsx";
import React, { useMemo, useState } from "react";
import { useGame, PlayerName, money, Modal, ovrColor } from "./common.jsx";
import Select from "./Select.jsx";
import ContractModal from "./ContractModal.jsx";
import { faAsk, offerContract, expiringPlayers, resignAsk, resignPlayer, letWalk, simFADay } from "../engine/offseason.js";
import { teamNeeds } from "../engine/teamPlanning.js";
import { capSpace, counts, capYear } from "../engine/roster.js";
import { MAX_ROSTER, FA_DAYS, ARCHETYPES, capForYear } from "../engine/constants.js";
import { isRFA } from "../engine/players.js";
import { POS_COLOR } from "./TradePage.jsx";
import { RoleTag, MarketTag, BuildYour23, faStart } from "./ContractBits.jsx";
import { decidingToday } from "../engine/faMarket.js";
import { isLoyal, tenure, perfNote } from "../engine/contractValue.js";

const PosBadge = ({ pos }) => <span className="gg-pos" style={{ background: POS_COLOR[pos] || "#64748b" }}>{pos}</span>;
const MugPos = ({ p, team }) => <span className="gg-mugpos"><Headshot p={p} team={team} size={36} decorative fallback="none" /><PosBadge pos={p.pos} /></span>;
const POS = ["C", "LW", "RW", "LD", "RD", "G"];

function OfferModal({ p, onClose }) { return <ContractModal p={p} kind="fa" onClose={onClose} />; }

// The positions your club needs most right now (Front Office → team needs): the urgent ones,
// up to four, or the top two when nothing is urgent.
const URGENT_NEED = 25;
function urgentNeeds(league, team) {
  const list = teamNeeds(league, team);
  const urgent = list.filter((n) => n.score >= URGENT_NEED).slice(0, 4);
  return urgent.length ? urgent : list.slice(0, 2);
}

// The free-agency calendar, like Gridiron's market bar: what day of July it is, what happened on the
// last one (who signed, your wins and losses), who decides at the end of today, and the button on.
const julyDate = (day) => `July ${1 + day}`;
function FaDayBar() {
  const { league, commit, toast, go } = useGame();
  if (league.phase !== "freeagency" || !league.fa) return null;
  const day = league.fa.day || 0;
  const s = league.fa.summary?.day === day ? league.fa.summary : null;
  const next = () => { simFADay(league); commit(); const sum = league.fa?.summary; if (sum) toast(sum.text, 5000); };
  const due = decidingToday(league);
  return (
    <section className="gg-faday">
      <span className="gg-faday-k">📅 {day === 0 ? "Opening day" : `Day ${day} of ${FA_DAYS}`} · {julyDate(day)}</span>
      <span className="gg-faday-txt">
        {s ? <b>{s.signed ? <>{s.signed} signed{s.top ? <>, led by {s.top.name} ({s.top.abbr})</> : null}.</> : "Nobody signed."} </b> : null}
        Clubs make offers every day. Each player takes the best one on his day: the money, plus the role, the winning or the term he wants. Depth players take the first fair deal; only a big overpay (20% over his ask) signs anyone else on the spot.
        {s && (s.won.length > 0 || s.lost.length > 0) && <span className="ct-faday-res">{s.won.map((w) => <span key={w.pid}><b className="won">✅ {w.name}</b> signed with you ({money(w.aav)} × {w.yrs}). </span>)}{s.lost.map((x) => <span key={x.pid}><b className="lost">❌ {x.name}</b> chose {x.abbr} ({money(x.aav)} × {x.yrs}) over your {money(x.mineAav)} × {x.mineYrs}. </span>)}</span>}
        {day === 0 && <span className="ct-faday-sub"><span className="link" onClick={() => go("frenzy")}>🔥 Watch July 1 live on the Free Agent Frenzy desk →</span> </span>}
        {day < FA_DAYS && <span className="ct-faday-sub">{due.count ? `${due.count} player${due.count === 1 ? "" : "s"} decide${due.count === 1 ? "s" : ""} at the end of today${due.mine ? `, ${due.mine} with your offer on the table` : ""}.` : "Nobody is due to decide today."}</span>}
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
      <div className="gg-k">Re-sign window · {expiring.length} EXPIRING</div>
      <div className="dim small" style={{ marginBottom: 8 }}>Re-sign expiring players, or use Front Office → Operations to qualify RFAs, negotiate with agents or seek arbitration. {signed.length} players under contract for next season · cap {money(capForYear(capYear(league)))} · space {money(capSpace(league, user))}.</div>
      <div className="gg-falist">
        {expiring.map((p) => {
          const ask = p.willing ? resignAsk(league, p, termFor(p)) : null;
          return (
            <div key={p.id} className="gg-farow resign">
              <MugPos p={p} team={user} />
              <span className="gg-faname"><b><PlayerName p={p} />{isLoyal(league, p) && <span className="ct-tag loyal" title={`${tenure(league, p)} seasons with you: he takes about 10% less to stay.`}>LOYAL −10%</span>}{(() => { const n = perfNote(league, p, "resign"); return n ? <span className={`ct-tag ${n.tone}`} title={n.text}>{n.tone === "up" ? "📈 BIG YEAR" : "📉 DOWN YEAR"}</span> : null; })()}</b><small>{p.age + 1} next season · POT {p.pot} · was {money(p.prevCap)} · {isRFA(p) ? "RFA" : "UFA"}</small></span>
              <span className="gg-tovr" style={{ color: ovrColor(p.ovr) }}>{p.ovr}</span>
              <span className={`gg-famood ${p.willing ? (p.mood > 0.6 ? "good" : p.mood > 0.35 ? "" : "warn") : "bad"}`}>{p.willing ? (p.mood > 0.6 ? "Happy" : p.mood > 0.35 ? "Open" : "Lukewarm") : "Testing FA"}</span>
              <Select value={termFor(p)} onChange={(e) => setTerms({ ...terms, [p.id]: Number(e.target.value) })} disabled={!p.willing} aria-label={`Term for ${p.name}`} style={{ minWidth: 90 }}>
                {[1, 2, 3, 4, 5, 6, 7].map((y) => <option key={y} value={y}>{y} yr{y > 1 ? "s" : ""}</option>)}
              </Select>
              <span className="gg-faask"><small className="gg-ask-k">Asking</small>{ask ? money(ask.aav) : "—"}</span>
              <span className="row gg-faact" style={{ gap: 4, flexWrap: "nowrap" }}>
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
  // Build your 23 on Home opens this screen at one position.
  const [pos, setPos] = useState(() => { const p = faStart.pos; faStart.pos = null; return p || "all"; });
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("ovr");
  const [needOnly, setNeedOnly] = useState(false);
  const user = league.teams[league.userTid];
  const open = league.phase !== "draft" && league.phase !== "resign" && league.phase !== "playoffs";
  const needs = urgentNeeds(league, user);
  const needPos = needs.map((n) => n.pos);
  const fas = useMemo(() => {
    const list = league.freeAgents.map((id) => league.players[id]).filter((p) => p && (pos === "all" || p.pos === pos) && (!needOnly || needPos.includes(p.pos)) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
    const key = sort === "age" ? (p) => -p.age : sort === "pot" ? (p) => p.pot : sort === "ask" ? (p) => -faAsk(league, p).aav : (p) => p.ovr;
    return list.sort((a, b) => key(b) - key(a) || b.ovr - a.ovr);
  }, [league, pos, q, sort, needOnly, needPos.join(), league.freeAgents.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const best = fas[0];
  return (
    <div className="stack gg-fa">
      <div className="gg-pagehead">
        <div><h2>{league.phase === "resign" ? "Re-sign Players" : "Free Agency"}</h2><div className="gg-status">{league.phase === "freeagency" ? `${league.fa.day ? `Day ${league.fa.day} of ${FA_DAYS}` : "Opening day"} · ` : ""}{league.freeAgents.length} available · cap space <b style={{ color: capSpace(league, user) >= 0 ? "#22c55e" : "#ef4444" }}>{money(capSpace(league, user))}</b>{pendingSpend(league, user.id) > 0 && league.phase === "freeagency" ? <> ({money(pendingSpend(league, user.id))} in open offers)</> : null} · roster {counts(league, user).active}/{MAX_ROSTER}</div></div>
        {!open && <span className="gg-phase">Market opens after the draft and re-sign period</span>}
      </div>
      <BuildYour23 onPick={(x) => { setPos(x); setNeedOnly(false); }} foot={false} />
      {league.phase === "resign" && <ResignView />}
      <FaDayBar />
      <MyOffers onRaise={(id) => setOfferFor(id)} />
      <div className="gg-card">
        <div className="gg-fa-tools">
          <div className="gg-chips">{["all", ...POS].map((x) => <button key={x} className={pos === x ? "on" : ""} onClick={() => setPos(x)}>{x === "all" ? "All" : x}</button>)}</div>
          <button className={`gg-needs${needOnly ? " on" : ""}`} aria-pressed={needOnly} onClick={() => setNeedOnly((v) => !v)} title={needs.length ? `Your needs: ${needs.map((n) => `${n.pos}${n.reasons.length ? ` (${n.reasons.join(", ")})` : ""}`).join("; ")}` : "No pressing needs"}>
            <span className="gg-needs-long">Your needs: {needPos.join(", ") || "none"}</span><span className="gg-needs-short">Needs</span>
          </button>
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
                <span className="gg-faname"><b><PlayerName p={p} /><AbilityChip p={p} /><RoleTag p={p} /></b><small>{p.age} yrs · POT {p.pot}{p.rookie ? " · Rookie" : ""}{p.moveHistory?.at(-1)?.from === league.userTid && p.moveHistory.at(-1).year === league.year ? " · your former player" : ""}</small></span>
                <span className="gg-tovr" style={{ color: ovrColor(p.ovr) }}>{p.ovr}</span>
                <span className="gg-faask"><b>{money(ask.aav)}</b><small>× {ask.yrs} yr{ask.yrs > 1 ? "s" : ""}</small><MarketTag p={p} /></span>
                <button className="small primary" disabled={!open} onClick={() => setOfferFor(p.id)}>{bidStanding(league, p.id)?.status === "pending" ? "Raise" : "Offer"}</button>
              </div>
            );
          })}
          {!fas.length && <div className="dim small">{needOnly ? `No free agents at ${needPos.join(", ")} match. Turn off Your needs to see everyone.` : "No free agents match."}</div>}
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
      <div className="gg-k">Your offers <span className="dim" style={{ letterSpacing: 0, textTransform: "none" }}>· {pending} waiting on an answer · each player decides on his own day; your tabled offer always counts</span></div>
      {committed > room + 1e-6 && <div className="gg-offer-warn">Offers out total {money(committed)} against {money(room)} of cap room. Talk to as many agents as you like; if more accept than you can fit, the earliest offers sign first and the rest fall through.</div>}
      <div className="gg-offers">
        {offers.map(({ p, standing: st, n }) => (
          <div key={p.id} className={`gg-offer ${st.status} ${st.standing || ""}`}>
            <MugPos p={p} team={null} />
            <span className="gg-faname"><b><PlayerName p={p} /></b><small>{p.age} yrs · <span style={{ color: ovrColor(p.ovr) }}>{p.ovr}</span> OVR{st.mine ? ` · your offer ${money(st.mine.aav)} × ${st.mine.yrs}` : n.mineAav ? ` · your offer ${money(n.mineAav)} × ${n.mineYrs}` : ""}</small></span>
            <span className={`gg-bid ${st.standing || st.status}`}>{st.label}{st.status === "pending" ? ` · ${st.when}` : ""}</span>
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
