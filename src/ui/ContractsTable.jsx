// Front Office → Contracts (Gridiron 1.80 / 1.68 / 2.4 / 1.91): every deal on your books in one
// sortable table. Filters for deals expiring, players you can extend now, retained salary and
// buyouts, and contracts buried on the farm. Each row: cap hit, years left, RFA or UFA when it
// ends, his clause, what a buyout costs and over how many seasons, the pending extension, and the
// Extend button (or why it isn't available). Dead and retained money sit beside the cap space.
import React, { useState } from "react";
import { useGame, money, ovrColor } from "./common.jsx";
import { contractRows, capOverview } from "../engine/capOverview.js";
import { capSpace } from "../engine/roster.js";
import { POS_COLOR } from "./TradePage.jsx";
import ContractModal from "./ContractModal.jsx";
import Select from "./Select.jsx";
import "./contracts.css";

const POS = ["C", "LW", "RW", "LD", "RD", "G"];
const season = (y) => `${y}-${String(y + 1).slice(2)}`;
const SORTS = { cap: ["Cap hit", (r) => -r.cap], ovr: ["Overall", (r) => -r.ovr], age: ["Age", (r) => -r.age], yrs: ["Years left", (r) => r.yrs], buyout: ["Buyout cost", (r) => -r.buyout.total], pos: ["Position", (r) => POS.indexOf(r.pos)], name: ["Name", (r) => r.name] };

export default function ContractsTable() {
  const { league, openPlayer } = useGame();
  const t = league.teams[league.userTid];
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("cap");
  const [talk, setTalk] = useState(null);
  const data = contractRows(league, t);
  const ov = capOverview(league, t);
  const space = capSpace(league, t);
  const F = {
    all: () => true,
    expiring: (r) => r.expiring,
    extend: (r) => r.canExtend,
    retained: () => false,
    buried: (r) => r.kind === "farm",
  };
  const counts = { expiring: data.rows.filter(F.expiring).length, extend: data.rows.filter(F.extend).length, retained: data.dead.length + data.retained.length, buried: data.rows.filter(F.buried).length };
  const key = SORTS[sort][1];
  const rows = data.rows.filter(F[filter]).sort((a, b) => { const x = key(a), y = key(b); return (typeof x === "string" ? x.localeCompare(y) : x - y) || b.cap - a.cap; });
  const books = [...data.retained, ...data.dead];
  const th = (k, label, num) => <th className={`${k ? "sort" : ""}${sort === k ? " on" : ""}${num ? " num" : ""}`} onClick={k ? () => setSort(k) : undefined}>{label}{sort === k ? " ▼" : ""}</th>;
  const extendCell = (r) => r.holdout ? <button className="tiny ct-ext hold" onClick={() => setTalk(r.p)}>✋ Talk contract</button>
    : r.extension ? <span className="ct-next">Next: {money(r.extension.aav)} × {r.extension.yrs} from {season(r.extension.start)}</span>
    : r.canExtend ? <button className="tiny ct-ext" onClick={() => setTalk(r.p)}>✍️ Extend</button>
    : <span className="ct-why" title={r.extendWhy}>{r.extendWhy}</span>;
  const tags = (r) => <>
    {r.loyal && <span className="ct-tag loyal" title="Three seasons with you: about 10% off to re-sign or extend.">LOYAL</span>}
    {r.holdout && <span className="ct-tag hold">HOLDOUT</span>}
    {r.kind === "farm" && <span className="ct-tag">FARM</span>}
    {r.elc && <span className="ct-tag">ELC</span>}
  </>;
  return (
    <div className="ct-screen">
      <div className="ct-tiles">
        <div className="ct-tile"><small>Cap space</small><b style={{ color: space >= 0 ? "#22c55e" : "#ef4444" }}>{money(space)}</b><span>of {money(ov.cap)} · {season(data.year)}</span></div>
        <div className="ct-tile"><small>Dead & retained</small><b style={{ color: data.deadNow + data.retainedNow > 0 ? "#f87171" : "#94a3b8" }}>{money(data.deadNow + data.retainedNow)}</b><span>{money(data.deadNow)} buyouts · {money(data.retainedNow)} retained{data.buriedNow ? ` · ${money(data.buriedNow)} buried` : ""}</span></div>
        <div className="ct-tile"><small>Next season's room</small><b style={{ color: ov.next.room >= 0 ? "#22c55e" : "#ef4444" }}>{money(ov.next.room)}</b><span>{ov.next.signed} signed for {season(ov.next.year)}</span></div>
        <div className="ct-tile"><small>Expiring</small><b>{counts.expiring}</b><span>{counts.extend ? `${counts.extend} you can extend now` : "deals ending after this one"}</span></div>
      </div>
      <div className="ct-bar">
        <div className="gg-chips ct-filters">{[["all", `All (${data.rows.length})`], ["expiring", `Expiring (${counts.expiring})`], ["extend", `Can extend (${counts.extend})`], ["retained", `Retained & dead (${counts.retained})`], ["buried", `Buried (${counts.buried})`]].map(([k, l]) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>)}</div>
        <span className="ct-hint">Tap a column to sort · extend from July 1 of a deal's last season</span>
      </div>
      {filter === "retained" ? (
        <section className="gg-card">
          <div className="gg-k">Retained salary and buyouts <span className="dim" style={{ letterSpacing: 0, textTransform: "none" }}>· money on your cap for players who are gone</span></div>
          {books.length ? <div className="ct-books">{books.map((d) => <React.Fragment key={d.id}><b>{d.name}</b><span className="dim">{d.label}{d.offset ? ` · starts in ${d.offset} season${d.offset > 1 ? "s" : ""}` : ""} · {d.yrs} season{d.yrs === 1 ? "" : "s"}</span><span className="ct-dead">{money(d.amt)}/yr</span></React.Fragment>)}</div> : <div className="ct-empty">No retained salary or buyouts on your books.</div>}
        </section>
      ) : <>
        <div className="ct-wrap">
          <table className="ct-table">
            <thead><tr>{th("name", "Player")}{th("pos", "Pos")}{th("ovr", "OVR", true)}{th("age", "Age", true)}{th("cap", "Cap hit", true)}{th("yrs", "Yrs", true)}<th>Ends as</th><th>Clause</th>{th("buyout", "Buyout", true)}<th>Extension</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.expiring ? "exp" : ""}>
                  <td className="who"><button className="link" onClick={() => openPlayer(r.id)}>{r.name}</button>{tags(r)}</td>
                  <td><span className="gg-pos" style={{ background: POS_COLOR[r.pos] || "#64748b" }}>{r.pos}</span></td>
                  <td className="num" style={{ color: ovrColor(r.ovr), fontWeight: 900 }}>{r.ovr}</td>
                  <td className="num">{r.age}</td>
                  <td className="num">{r.kind === "rights" ? <span className="dim">QO {money(r.qo)}</span> : <><span className="ct-cap">{money(r.cap)}</span>{r.kind === "farm" && <small>{money(r.counts)} counts</small>}</>}</td>
                  <td className="num" style={{ color: r.yrs === 1 ? "#f59e0b" : undefined }}>{r.kind === "rights" ? "—" : r.yrs}{r.through ? <small>to {season(r.through)}</small> : null}</td>
                  <td><span className={`ct-tag ${r.status === "RFA" ? "rfa" : "ufa"}`}>{r.status}</span></td>
                  <td>{r.clause ? <span className="ct-tag clause">{r.clause}</span> : <span className="dim">—</span>}</td>
                  <td className="num">{r.buyout.total ? <><span className="ct-dead">{money(r.buyout.total)}</span><small>over {r.buyout.years} season{r.buyout.years === 1 ? "" : "s"}</small></> : <span className="dim">—</span>}</td>
                  <td>{extendCell(r)}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={10} className="ct-empty">Nobody fits that filter.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="ct-cards">
          <div className="row" style={{ gap: 8, alignItems: "center" }}><span className="dim small">Sort</span><Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort contracts" style={{ flex: 1 }}>{Object.entries(SORTS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></div>
          {rows.map((r) => (
            <div key={r.id} className={`ct-card${r.expiring ? " exp" : ""}`}>
              <div className="ct-card-top"><span className="gg-pos" style={{ background: POS_COLOR[r.pos] || "#64748b" }}>{r.pos}</span><b><button className="link" onClick={() => openPlayer(r.id)}>{r.name}</button>{tags(r)}</b><span style={{ fontSize: 20, fontWeight: 900, color: ovrColor(r.ovr) }}>{r.ovr}</span></div>
              <div className="ct-card-meta">
                <span>Age {r.age}</span>
                {r.kind === "rights" ? <span>Unsigned · QO {money(r.qo)}</span> : <span>Cap hit <b className="ct-cap">{money(r.cap)}</b>{r.kind === "farm" ? ` (${money(r.counts)} counts)` : ""}</span>}
                {r.kind !== "rights" && <span style={{ color: r.yrs === 1 ? "#f59e0b" : undefined }}>{r.yrs} yr{r.yrs === 1 ? "" : "s"} left</span>}
                <span className={`ct-tag ${r.status === "RFA" ? "rfa" : "ufa"}`}>{r.status}</span>
                {r.clause && <span className="ct-tag clause">{r.clause}</span>}
                {r.buyout.total > 0 && <span>Buyout <b className="ct-dead">{money(r.buyout.total)}</b> over {r.buyout.years}</span>}
              </div>
              <div className="ct-card-act">{extendCell(r)}</div>
            </div>
          ))}
          {!rows.length && <div className="ct-empty">Nobody fits that filter.</div>}
        </div>
      </>}
      {talk && league.players[talk.id] && <ContractModal p={league.players[talk.id]} onClose={() => setTalk(null)} />}
    </div>
  );
}
