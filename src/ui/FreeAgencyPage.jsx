import { negotiate } from "../engine/negotiations.js";
import React, { useMemo, useState } from "react";
import { useGame, PlayerName, money, Modal, ovrColor } from "./common.jsx";
import Select from "./Select.jsx";
import ContractModal from "./ContractModal.jsx";
import { faAsk, offerContract, expiringPlayers, resignAsk, resignPlayer, letWalk } from "../engine/offseason.js";
import { capSpace, counts, capYear } from "../engine/roster.js";
import { MAX_ROSTER, FA_DAYS, ARCHETYPES, capForYear } from "../engine/constants.js";
import { isRFA } from "../engine/players.js";
import { POS_COLOR } from "./TradePage.jsx";

const PosBadge = ({ pos }) => <span className="gg-pos" style={{ background: POS_COLOR[pos] || "#64748b" }}>{pos}</span>;
const POS = ["C", "LW", "RW", "LD", "RD", "G"];

function OfferModal({ p, onClose }) { return <ContractModal p={p} kind="fa" onClose={onClose} />; }

function ResignView() {
  const { league, commit, toast } = useGame();
  const user = league.teams[league.userTid];
  const expiring = expiringPlayers(league, user).sort((a, b) => b.ovr - a.ovr);
  const [terms, setTerms] = useState({});
  const [talk, setTalk] = useState(null);
  const termFor = (p) => terms[p.id] ?? resignAsk(league, p).prefYrs;
  const doSign = (p) => { const r = resignPlayer(league, p.id, termFor(p)); if (!r.ok) toast(r.msg, 4500); commit(); };
  const walk = (p) => { if (p.offerSheetPending) { toast("Resolve the pending offer sheet in Hockey Operations."); return; } letWalk(league, p.id); commit(); };
  const signed = user.roster.map((id) => league.players[id]).filter((p) => p && p.yrs > 0);
  return (
    <section className="gg-card">
      <div className="gg-k">RE-SIGN WINDOW · {expiring.length} EXPIRING</div>
      <div className="dim small" style={{ marginBottom: 8 }}>Re-sign expiring players, or use Hockey Operations to qualify RFAs, negotiate with agents or seek arbitration. {signed.length} players under contract for next season · cap {money(capForYear(capYear(league)))} · space {money(capSpace(league, user))}.</div>
      <div className="gg-falist">
        {expiring.map((p) => {
          const ask = p.willing ? resignAsk(league, p, termFor(p)) : null;
          return (
            <div key={p.id} className="gg-farow">
              <PosBadge pos={p.pos} />
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
                <PosBadge pos={p.pos} />
                <span className="gg-faname"><b><PlayerName p={p} /></b><small>{p.age} yrs · POT {p.pot} · {ARCHETYPES[p.type]?.name}{p.rookie ? " · Rookie" : ""}</small></span>
                <span className="gg-tovr" style={{ color: ovrColor(p.ovr) }}>{p.ovr}</span>
                <span className="gg-faask"><b>{money(ask.aav)}</b><small>× {ask.yrs} yr{ask.yrs > 1 ? "s" : ""}</small></span>
                <button className="small primary" disabled={!open} onClick={() => setOfferFor(p.id)}>Offer</button>
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
