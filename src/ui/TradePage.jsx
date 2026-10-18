import React, { useEffect, useMemo, useState } from "react";
import { useGame, TeamBadge, PlayerName, money, POS_ORDER } from "./common.jsx";
import { evaluateTrade, executeTrade, suggestBalance, tradingClosed, assetValue, pickValue } from "../engine/trade.js";
import { noteUserTrade, tradeLabels, onBlock, deadlineActive, fmtClock } from "../engine/market.js";
import { pickLabel, shownRatings } from "../engine/draft.js";
import { capSpace } from "../engine/roster.js";
import { dayToDate } from "../engine/schedule.js";
import { isGoalie } from "../engine/constants.js";

// Trade Center in the Gridiron GM layout: positional needs, Trade Finder, a logo team picker,
// two columns (YOU SEND / YOU GET) with trade values, draft picks and a trade analyzer.

// Trade value on the OVR scale: an average contract at OVR x is worth about TV x.
export const tvOf = (v) => Math.max(1, Math.min(99, Math.round(70 + 6.2 * Math.log(Math.max(v, 0.01)))));
export const POS_COLOR = { C: "#e74c3c", LW: "#3498db", RW: "#f39c12", LD: "#2ecc71", RD: "#1abc9c", G: "#9b59b6" };
const PosBadge = ({ pos }) => <span className="gg-pos" style={{ background: POS_COLOR[pos] || "#64748b" }}>{pos}</span>;
const ovrColor = (o) => (o >= 85 ? "#22c55e" : o >= 79 ? "#84cc16" : o >= 73 ? "#eab308" : o >= 67 ? "#f97316" : "#ef4444");

const GROUPS = [["C", ["C"], 3], ["LW", ["LW"], 3], ["RW", ["RW"], 3], ["LD", ["LD"], 2], ["RD", ["RD"], 2], ["G", ["G"], 1]];
// Letter grade per position: your top players there vs the league average.
function positionalNeeds(league, team) {
  const avgFor = (t, ps, n) => {
    const top = t.roster.map((id) => league.players[id]).filter((p) => p && ps.includes(p.pos)).sort((a, b) => b.ovr - a.ovr).slice(0, n);
    return top.length ? top.reduce((s, p) => s + p.ovr, 0) / n : 60;
  };
  return GROUPS.map(([k, ps, n]) => {
    const mine = avgFor(team, ps, n);
    const lg = league.teams.reduce((s, t) => s + avgFor(t, ps, n), 0) / league.teams.length;
    const d = mine - lg;
    const g = d >= 3.5 ? "A" : d >= 1.2 ? "B" : d >= -1.2 ? "C" : d >= -3.5 ? "D" : "F";
    return { k, g, d };
  }).sort((a, b) => a.d - b.d);
}
const GRADE_C = { A: "#22c55e", B: "#60a5fa", C: "#eab308", D: "#f97316", F: "#ef4444" };

function fairness(ratio) {
  if (ratio >= 1.35) return ["LOPSIDED (for you)", "#22c55e"];
  if (ratio >= 1) return ["FAIR", "#22c55e"];
  if (ratio >= 0.85) return ["SLIGHT EDGE (them)", "#eab308"];
  if (ratio >= 0.6) return ["UNEVEN", "#f97316"];
  return ["LOPSIDED", "#ef4444"];
}

function TradeFinder({ league, user, onLoad }) {
  const ideas = useMemo(() => {
    const out = [];
    const mine = user.roster.map((id) => league.players[id]).filter((p) => p && p.injury <= 0).sort((a, b) => b.ovr - a.ovr).slice(2, 16);
    for (const t of league.teams) {
      if (t.id === user.id) continue;
      const theirs = t.roster.map((id) => league.players[id]).filter((p) => p && p.ovr >= 76 && p.injury <= 0).sort((a, b) => b.ovr - a.ovr).slice(1, 6);
      for (const q of theirs) {
        const qv = tvOf(assetValue(league, q.id, t));
        const cand = mine.filter((p) => Math.abs(tvOf(assetValue(league, p.id, t)) - qv) <= 3 && isGoalie(p.pos) === isGoalie(q.pos)).slice(0, 2);
        for (const p of cand) {
          const ev = evaluateTrade(league, { from: user.id, to: t.id, give: [p.id], get: [q.id], givePicks: [], getPicks: [] });
          if (ev.accept) out.push({ t, p, q, ratio: ev.ratio, gain: q.ovr - p.ovr });
        }
      }
    }
    return out.sort((a, b) => b.gain - a.gain || b.q.ovr - a.q.ovr).slice(0, 5);
  }, [league, user, league.day]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="gg-finder">
      {ideas.map(({ t, p, q, ratio }) => {
        const [lab, col] = fairness(ratio);
        return (
          <div key={`${p.id}-${q.id}`} className="gg-idea">
            <TeamBadge team={t} size={22} />
            <span className="dim small">YOU GET</span><PosBadge pos={q.pos} /><b>{q.name}</b><b style={{ color: ovrColor(q.ovr) }}>{q.ovr}</b>
            <span className="dim">⇄</span>
            <span className="dim small">YOU SEND</span><PosBadge pos={p.pos} /><b>{p.name}</b><b style={{ color: ovrColor(p.ovr) }}>{p.ovr}</b>
            <span className="gg-tag" style={{ color: col, borderColor: col }}>{lab}</span>
            <button className="small" onClick={() => onLoad(t.id, p.id, q.id)}>Load →</button>
          </div>
        );
      })}
      {!ideas.length && <div className="dim small">No clean one-for-one deals right now. Try building a package below.</div>}
    </div>
  );
}

function Side({ title, color, team, viewer, mine, sel, setSel, selPicks, setSelPicks }) {
  const { league } = useGame();
  const toggle = (arr, set, id) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const roster = team.roster.map((id) => league.players[id]).filter(Boolean).sort((a, b) => b.ovr - a.ovr || POS_ORDER[a.pos] - POS_ORDER[b.pos]);
  const minors = team.prospects.map((id) => league.players[id]).filter(Boolean).sort((a, b) => (mine ? b.pot - a.pot : shownRatings(b).pot - shownRatings(a).pot));
  const picks = league.draftPicks.filter((p) => p.owner === team.id).sort((a, b) => a.year - b.year || a.round - b.round);
  const row = (p, minor) => {
    const r = minor && !mine ? shownRatings(p) : { ovr: p.ovr, pot: p.pot };
    const on = sel.includes(p.id);
    return (
      <div key={p.id} role="checkbox" aria-checked={on} tabIndex={0} className={`gg-trow${on ? " on" : ""}`} onClick={() => toggle(sel, setSel, p.id)} onKeyDown={(e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), toggle(sel, setSel, p.id))}>
        <PosBadge pos={p.pos} />
        <span className="gg-tname">{p.name}{p.injury > 0 && <span className="inj"> +{p.injury}</span>}{onBlock(league, p.id) && <span className="gg-tag">BLOCK</span>}</span>
        <span className="dim small">{p.age}y · {minor && !p.signed ? "unsigned" : `${money(p.cap)}×${p.yrs}`}</span>
        <b className="gg-tovr" style={{ color: ovrColor(r.ovr) }}>{r.ovr}</b>
        <span className="gg-tv">TV:{tvOf(assetValue(league, p.id, viewer))}</span>
      </div>
    );
  };
  return (
    <div className="gg-side">
      <div className="gg-side-h" style={{ color }}><TeamBadge team={team} size={22} />{title}<span className="dim small">{team.abbr} · cap space {money(capSpace(league, team))}</span></div>
      <div className="gg-tlist">{roster.map((p) => row(p, false))}</div>
      {minors.length > 0 && <><div className="gg-sub">PROSPECTS & MINORS</div><div className="gg-tlist short">{minors.map((p) => row(p, true))}</div></>}
      <div className="gg-sub">DRAFT PICKS</div>
      <div className="gg-tlist short">
        {picks.map((pk) => {
          const on = selPicks.includes(pk.id);
          return (
            <div key={pk.id} role="checkbox" aria-checked={on} tabIndex={0} className={`gg-trow pick${on ? " on" : ""}`} onClick={() => toggle(selPicks, setSelPicks, pk.id)} onKeyDown={(e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), toggle(selPicks, setSelPicks, pk.id))}>
              <b>{pickLabel(league, pk)}</b>
              <span className="dim small">from {league.teams[pk.orig].abbr}</span>
              <span className="gg-tv gold">Val:{tvOf(pickValue(league, pk))}</span>
            </div>
          );
        })}
        {!picks.length && <div className="dim small">No picks.</div>}
      </div>
    </div>
  );
}

export default function TradePage({ seed }) {
  const { league, commit, toast, go, clearTradeSeed } = useGame();
  const user = league.teams[league.userTid];
  const others = league.teams.filter((t) => t.id !== user.id);
  const [partner, setPartner] = useState(others[0].id);
  const [give, setGive] = useState([]);
  const [get, setGet] = useState([]);
  const [givePicks, setGivePicks] = useState([]);
  const [getPicks, setGetPicks] = useState([]);
  const [protections, setProtections] = useState([]);
  const [giveRetention, setGiveRetention] = useState({}), [getRetention, setGetRetention] = useState({});
  const [finder, setFinder] = useState(false);

  useEffect(() => {
    if (!seed) return;
    // A seed is used once: opening the Trade tab later starts from a clean slate.
    clearTradeSeed();
    if (seed.tid != null && seed.give) {
      setPartner(seed.tid);
      setGive(seed.give.filter((id) => league.players[id]?.tid === user.id));
      setGet(seed.get.filter((id) => league.players[id]?.tid === seed.tid));
      setGivePicks(seed.givePicks || []);
      setGetPicks(seed.getPicks || []);
      return;
    }
    const p = league.players[seed.pid];
    if (p && p.tid !== user.id && p.tid >= 0) {
      setPartner(p.tid); setGet([p.id]); setGive([]); setGivePicks([]); setGetPicks([]);
    } else if (p && p.tid === user.id && seed.tid === user.id) setGive([p.id]);
  }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps

  const ai = league.teams[partner];
  const offer = { from: user.id, to: ai.id, give, get, givePicks, getPicks, giveRetention, getRetention, protections };
  const ev = useMemo(() => evaluateTrade(league, offer), [league, partner, give, get, givePicks, getPicks, giveRetention, getRetention, protections, league.day]); // eslint-disable-line react-hooks/exhaustive-deps
  const needs = useMemo(() => positionalNeeds(league, user), [league, user, league.day]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => { setGive([]); setGet([]); setGivePicks([]); setGetPicks([]); setProtections([]); setGiveRetention({}); setGetRetention({}); };
  const pickTeam = (id) => { setPartner(id); setGet([]); setGetPicks([]); };
  const propose = () => {
    if (!ev.accept) return toast(ev.problems[0] || `${ai.abbr}: "${ev.mood}"`);
    const lbl = tradeLabels(league, offer);
    executeTrade(league, offer);
    noteUserTrade(league, offer, lbl);
    toast(`Trade completed with ${ai.city}!`);
    reset();
    commit();
  };
  const balance = () => {
    const s = suggestBalance(league, offer);
    if (!s) return toast(ev.accept ? "They'd already accept this." : "They don't see anything on your roster that closes the gap.");
    setGive(s.give);
    toast(`${ai.abbr} would want ${league.players[s.give[s.give.length - 1]].name} added.`);
  };
  const giveTV = give.reduce((n, id) => n + tvOf(assetValue(league, id, ai)), 0) + givePicks.map((id) => league.draftPicks.find((p) => p.id === id)).filter(Boolean).reduce((n, pk) => n + tvOf(pickValue(league, pk)), 0);
  const getTV = get.reduce((n, id) => n + tvOf(assetValue(league, id, ai)), 0) + getPicks.map((id) => league.draftPicks.find((p) => p.id === id)).filter(Boolean).reduce((n, pk) => n + tvOf(pickValue(league, pk)), 0);
  const [fairLab, fairCol] = fairness(ev.ratio);
  const closed = tradingClosed(league);
  const empty = !give.length && !get.length && !givePicks.length && !getPicks.length;

  return (
    <div className="stack gg-trade">
      <div className="gg-pagehead"><h2>Trade Center</h2>{league.phase === "regular" && <span className="dim small">Deadline: {dayToDate(league.year, league.deadlineDay, league.scheduleStart)}</span>}</div>
      {closed && <div className="notice warn">Trading is frozen until the playoffs end.</div>}
      {deadlineActive(league) && <div className="notice">⏰ Trade Deadline Day: it's {fmtClock(league.deadline.minute)} ET. Deals close at 3:00 PM. <span className="link" onClick={() => go("deadline")}>Back to the deadline desk →</span></div>}

      <div className="gg-card">
        <div className="gg-k">POSITIONAL NEEDS</div>
        <div className="row" style={{ gap: 6 }}>
          {needs.map((n) => <span key={n.k} className="gg-need" style={{ borderColor: GRADE_C[n.g] }}>{n.k} <b style={{ color: GRADE_C[n.g] }}>{n.g}</b></span>)}
        </div>
      </div>

      <div className="row" style={{ gap: 6 }}>
        <button className={`gg-finder-btn${finder ? " on" : ""}`} onClick={() => setFinder(!finder)} aria-expanded={finder}>🔍 TRADE FINDER {finder ? "▲" : "▼"}</button>
      </div>
      {finder && <TradeFinder league={league} user={user} onLoad={(tid, pid, qid) => { setPartner(tid); setGive([pid]); setGet([qid]); setGivePicks([]); setGetPicks([]); setFinder(false); }} />}

      <div className="gg-teampick" role="radiogroup" aria-label="Trade partner">
        {others.map((t) => (
          <button key={t.id} role="radio" aria-checked={t.id === partner} aria-label={`${t.city} ${t.name}`} className={t.id === partner ? "on" : ""} style={{ "--c1": t.colors[0] }} onClick={() => pickTeam(t.id)} title={`${t.city} ${t.name}`}>
            <TeamBadge team={t} size={22} decorative /><span>{t.abbr}</span>
          </button>
        ))}
      </div>

      <div className="gg-analyzer">
        <div className="row" style={{ gap: 10 }}>
          <span className="gg-k" style={{ margin: 0 }}>TRADE ANALYZER</span>
          <span>Give <b>{giveTV}</b></span><span>Get <b>{getTV}</b></span>
          <span>Net <b style={{ color: getTV - giveTV >= 0 ? "#22c55e" : "#ef4444" }}>{getTV - giveTV >= 0 ? "+" : ""}{getTV - giveTV}</b></span>
          {!empty && <span className="gg-tag" style={{ color: fairCol, borderColor: fairCol }}>{fairLab}</span>}
          <span className="muted small">{ai.abbr} GM: <b style={{ color: "#e2e8f0" }}>“{ev.mood}”</b> · {ev.contending ? "contending, values proven players" : "rebuilding, values youth & picks"}</span>
        </div>
        <div className="gg-bar" style={{ height: 8, margin: "6px 0" }}><i style={{ width: `${Math.min(100, (ev.ratio / 1.4) * 100)}%`, background: ev.accept ? "#22c55e" : ev.ratio > 0.85 ? "#eab308" : "#ef4444" }} /></div>
        {ev.problems.filter((p) => !empty || p !== "Add something to the deal.").map((p) => <div key={p} className="small bad">{p}</div>)}
        <div className="row" style={{ gap: 6, marginTop: 4 }}>
          {givePicks.map((id) => league.draftPicks.find((p) => p.id === id)).filter((p) => p?.round === 1 && p.orig === user.id).map((p) => <label className="row small" key={p.id}><input type="checkbox" checked={protections.some((c) => c.pickId === p.id)} onChange={(e) => setProtections(e.target.checked ? [...protections, { pickId: p.id, threshold: 10 }] : protections.filter((c) => c.pickId !== p.id))} />Top-10 protect {pickLabel(league, p)}</label>)}
          {[...give.map((id) => ({ id, side: "give" })), ...get.map((id) => ({ id, side: "get" }))].filter((x) => league.players[x.id]?.yrs > 0).map(({ id, side }) => <label className="row small" key={id}>Retain {league.players[id].name}<select aria-label={`Retain salary for ${league.players[id].name}`} value={(side === "give" ? giveRetention : getRetention)[id] || 0} onChange={(e) => (side === "give" ? setGiveRetention({ ...giveRetention, [id]: Number(e.target.value) }) : setGetRetention({ ...getRetention, [id]: Number(e.target.value) }))}>{[0, 0.1, 0.25, 0.5].map((v) => <option key={v} value={v}>{Math.round(v * 100)}%</option>)}</select></label>)}
          <button className="primary" disabled={!ev.accept} onClick={propose}>Execute Trade</button>
          <button onClick={balance} disabled={!get.length && !getPicks.length}>What would it take?</button>
          <button className="ghost" onClick={reset}>Clear</button>
        </div>
      </div>

      <div className="gg-sides">
        <Side title="YOU SEND" color="#22c55e" team={user} viewer={ai} mine sel={give} setSel={setGive} selPicks={givePicks} setSelPicks={setGivePicks} />
        <Side title="YOU GET" color="#3b82f6" team={ai} viewer={ai} sel={get} setSel={setGet} selPicks={getPicks} setSelPicks={setGetPicks} />
      </div>

      {league.tradeHistory?.length > 0 && (
        <div className="gg-card">
          <div className="gg-k">📋 TRADE HISTORY</div>
          {league.tradeHistory.slice(0, 10).map((t, i) => (
            <div className="small gg-news" key={i}><span className="dim">{t.year}</span> <TeamBadge team={league.teams[t.a]} size={16} /> {league.teams[t.a].abbr} sent {t.aSends} → <TeamBadge team={league.teams[t.b]} size={16} /> {league.teams[t.b].abbr} for {t.bSends}</div>
          ))}
        </div>
      )}
    </div>
  );
}
