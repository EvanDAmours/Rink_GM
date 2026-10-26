// The contract section of the player card (Gridiron 1.68 / 1.72 / 1.91 / 2.21 / 2.87): cap hit and
// years, what he is when it ends, salary and bonus by year, what a buyout costs, the pending
// extension, and the Extend button (or why it isn't available). Contract-year players and holdouts
// get their decision right here.
import React, { useState } from "react";
import { useGame, money } from "./common.jsx";
import { marketValue } from "../engine/players.js";
import { salaryYears } from "../engine/capAccounting.js";
import { statusAtExpiry, buyoutCost } from "../engine/capOverview.js";
import { extensionStatus } from "../engine/extensions.js";
import { isLoyal, tenure, perfNote } from "../engine/contractValue.js";
import { contractYearAsks, contractYearNote, playItOut, holdFirm } from "../engine/contractYear.js";
import ContractModal from "./ContractModal.jsx";
import { RoleTag } from "./ContractBits.jsx";
import "./contracts.css";

const season = (y) => `${y}-${String(y + 1).slice(2)}`;

export default function PlayerContract({ p, hidden }) {
  const { league, commit, toast } = useGame();
  const [talk, setTalk] = useState(null);
  const mine = p.tid === league.userTid;
  const offseason = ["resign", "freeagency"].includes(league.phase);
  const first = offseason ? league.year + 1 : league.year;
  const signed = p.signed !== false && p.yrs > 0;
  const rights = mine && !signed && p.signed !== false && (league.teams[p.tid]?.rfaRights || []).includes(p.id);
  const status = signed ? statusAtExpiry(league, p) : null;
  const years = signed && !hidden ? salaryYears(p) : [];
  const buy = signed && p.cap > 0 && !hidden ? buyoutCost(league, p) : null;
  const ext = mine ? extensionStatus(league, p) : null;
  const perf = mine && !hidden ? perfNote(league, p, "resign") : null;
  const cyNote = mine ? contractYearNote(league, p) : null;
  const asking = mine && contractYearAsks(league).some((x) => x.id === p.id);
  const loyal = isLoyal(league, p);
  const act = (r) => { if (r?.msg) toast(r.msg, 4500); commit(); };
  return (
    <section className="gg-pc-panel"><div className="gg-pc-k contract">Contract</div>
      <div className="ct-pc-tags">
        <RoleTag p={p} />
        {status && <span className={`ct-tag ${status === "RFA" ? "rfa" : "ufa"}`} title={`When this deal ends he is a ${status === "RFA" ? "restricted free agent: qualify him and you keep his rights" : "unrestricted free agent: anyone can sign him"}.`}>{status} WHEN IT ENDS</span>}
        {p.clause?.type && <span className="ct-tag clause" title={p.clause.type === "NMC" ? "No-movement clause: he can't be traded, waived or sent down without his consent." : "No-trade clause: he can block trades to the clubs on his list."}>{p.clause.type}</span>}
        {p.elc && signed && <span className="ct-tag">ENTRY-LEVEL</span>}
        {loyal && <span className="ct-tag loyal" title={`${tenure(league, p)} seasons with you: he takes about 10% less to re-sign or extend.`}>LOYAL −10%</span>}
        {p.holdout && <span className="ct-tag hold">HOLDOUT</span>}
        {cyNote && <span className="ct-tag up" title={cyNote}>CONTRACT YEAR</span>}
      </div>
      <div className="gg-pc-kv"><span>Cap hit</span><b>{p.signed === false ? "Unsigned draft pick" : signed ? `${money(p.cap)} × ${p.yrs} yr${p.yrs > 1 ? "s" : ""}` : rights ? `Unsigned RFA · QO ${money(p.qualified?.aav || p.holdout?.qo || 0)}` : "None"}</b></div>
      {signed && <div className="gg-pc-kv"><span>Through</span><b>{season(first + p.yrs - 1)}{p.tid >= 0 && p.yrs <= 1 ? ` · ${status} next summer` : ""}</b></div>}
      {p.extension && <div className="gg-pc-kv"><span>Next deal</span><b style={{ color: "#c4b5fd" }}>{money(p.extension.aav)} × {p.extension.yrs} from {season(p.extension.start)}</b></div>}
      <div className="gg-pc-kv"><span>Market value</span><b>{hidden ? "Needs an NHL evaluation" : `${money(marketValue(p, league.year))} / yr`}</b></div>
      {years.length > 0 && <table className="ct-pc-years"><thead><tr><th>Season</th><th>Salary</th><th>Bonus</th><th>Cap hit</th></tr></thead><tbody>
        {years.map((y, i) => <tr key={i}><td>{season(first + i)}</td><td>{money(y.base)}</td><td>{y.signing ? money(y.signing) : "—"}</td><td>{money(p.cap)}</td></tr>)}
      </tbody></table>}
      {years.some((y) => y.estimated) && <div className="dim small" style={{ marginTop: 3 }}>Salary by year is estimated from his cap hit (no published schedule).</div>}
      {buy && buy.total > 0 && <div className="gg-pc-kv"><span>Buyout</span><b className="ct-dead" title={buy.rows.map((r) => `${season(first + (r.offset || 0))}: ${money(r.amt)}`).join("\n")}>{money(buy.total)} over {buy.years} season{buy.years === 1 ? "" : "s"}{buy.saves > 0 ? ` · saves ${money(buy.saves)} now` : ""}</b></div>}
      {perf && <div className={`ct-pc-note ${perf.tone}`}>{perf.text}</div>}
      {cyNote && <div className="ct-pc-note up">{cyNote}</div>}
      {p.holdout && <div className="ct-pc-note hold">He won't sign his {money(p.holdout.qo)} qualifying offer and sits until he gets a market deal (about {money(p.holdout.ask)} × {p.holdout.yrs}).{p.holdout.firm ? " You're holding firm." : ""} December 1 is the signing deadline.</div>}
      {mine && !hidden && (p.holdout ? (
        <div className="ct-pc-act"><button className="small ct-ext hold" onClick={() => setTalk(p)}>Talk contract</button>{!p.holdout.firm && <button className="small ghost" onClick={() => act(holdFirm(league, p.id))}>Hold firm</button>}</div>
      ) : asking ? (
        <div className="ct-pc-act"><button className="small ct-ext" onClick={() => setTalk(p)}>Talk extension</button><button className="small ghost" onClick={() => act(playItOut(league, p.id))}>Let him play it out</button></div>
      ) : p.extension ? null : ext?.ok ? (
        <div className="ct-pc-act"><button className="small ct-ext" onClick={() => setTalk(p)}>Extend</button><span className="ct-why">New deal from {season(ext.start)} · {money(ext.room)} of room under that cap.</span></div>
      ) : ext && signed ? (
        <div className="ct-pc-act"><button className="small" disabled title={ext.why}>Extend</button><span className="ct-why">{ext.why}</span></div>
      ) : null)}
      {talk && league.players[talk.id] && <ContractModal p={league.players[talk.id]} onClose={() => setTalk(null)} />}
    </section>
  );
}
