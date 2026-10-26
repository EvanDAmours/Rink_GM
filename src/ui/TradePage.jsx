import React, { useEffect, useMemo, useState } from "react";
import Select from "./Select.jsx";
import { useGame, TeamBadge, PlayerName, money, POS_ORDER } from "./common.jsx";
import { evaluateTrade, executeTrade, suggestBalance, tradingClosed, assetValue, pickValue } from "../engine/trade.js";
import { noteUserTrade, tradeLabels, onBlock, deadlineActive, fmtClock } from "../engine/market.js";
import { pickLabel, shownRatings } from "../engine/draft.js";
import { capSpace } from "../engine/roster.js";
import { dayToDate } from "../engine/schedule.js";
import { isGoalie } from "../engine/constants.js";
import AbilityChip from "./AbilityChip.jsx";

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

function fairness(ratio, blocked) {
  if (blocked && ratio >= 1) return ["BLOCKED · SEE BELOW", "#f97316"];
  if (ratio >= 1.35) return ["YOU'RE OVERPAYING", "#60a5fa"];
  if (ratio >= 1) return ["THEY'D ACCEPT", "#22c55e"];
  if (ratio >= 0.85) return ["CLOSE · ADD A LITTLE", "#eab308"];
  if (ratio >= 0.6) return ["NOT ENOUGH", "#f97316"];
  return ["NO CHANCE", "#ef4444"];
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
            <span className="dim small">You get</span><PosBadge pos={q.pos} /><b>{q.name}<AbilityChip p={q} /></b><b style={{ color: ovrColor(q.ovr) }}>{q.ovr}</b>
            <span className="dim">⇄</span>
            <span className="dim small">You send</span><PosBadge pos={p.pos} /><b>{p.name}<AbilityChip p={p} /></b><b style={{ color: ovrColor(p.ovr) }}>{p.ovr}</b>
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
  const [tab, setTab] = useState("roster");
  const [pos, setPos] = useState("all");
  const [q, setQ] = useState("");
  const toggle = (arr, set, id) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const match = (p) => (pos === "all" || (pos === "F" ? ["C", "LW", "RW"].includes(p.pos) : pos === "D" ? ["LD", "RD"].includes(p.pos) : p.pos === pos)) && (!q || p.name.toLowerCase().includes(q.toLowerCase()));
  const roster = team.roster.map((id) => league.players[id]).filter(Boolean).filter(match).sort((a, b) => b.ovr - a.ovr || POS_ORDER[a.pos] - POS_ORDER[b.pos]);
  const minors = team.prospects.map((id) => league.players[id]).filter(Boolean).filter(match).sort((a, b) => (mine ? b.pot - a.pot : shownRatings(b).pot - shownRatings(a).pot));
  const picks = league.draftPicks.filter((p) => p.owner === team.id).sort((a, b) => a.year - b.year || a.round - b.round);
  const row = (p, minor) => {
    const r = minor && !mine ? shownRatings(p) : { ovr: p.ovr, pot: p.pot };
    const on = sel.includes(p.id);
    return (
      <div key={p.id} role="checkbox" aria-checked={on} tabIndex={0} className={`gg-trow${on ? " on" : ""}`} onClick={() => toggle(sel, setSel, p.id)} onKeyDown={(e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), toggle(sel, setSel, p.id))}>
        <span className="gg-tcheck">{on ? "✓" : ""}</span>
        <PosBadge pos={p.pos} />
        <span className="gg-tname"><b>{p.name}<AbilityChip p={p} /></b>{p.injury > 0 && <span className="inj"> +{p.injury}</span>}{onBlock(league, p.id) && <span className="gg-tag">BLOCK</span>}<small>{p.age}y · {minor && !p.signed ? "unsigned" : `${money(p.cap)} × ${p.yrs}`}{minor ? ` · POT ${r.pot}` : ""}</small></span>
        <b className="gg-tovr" style={{ color: ovrColor(r.ovr) }}>{r.ovr}</b>
        <span className="gg-tv">{tvOf(assetValue(league, p.id, viewer))}</span>
      </div>
    );
  };
  const counts = { roster: team.roster.length, minors: team.prospects.length, picks: picks.length };
  return (
    <div className="gg-side">
      <div className="gg-side-h" style={{ "--c": color }}><TeamBadge team={team} size={30} decorative /><div><b>{title}</b><small>{team.city} {team.name} · cap space {money(capSpace(league, team))}</small></div></div>
      <div className="gg-side-tabs">
        {[["roster", "Roster"], ["minors", "Prospects"], ["picks", "Picks"]].map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l} <span>{counts[k]}</span></button>)}
      </div>
      {tab !== "picks" && (
        <div className="gg-side-filter">
          <div className="gg-chips">{["all", "F", "D", "G"].map((x) => <button key={x} className={pos === x ? "on" : ""} onClick={() => setPos(x)}>{x === "all" ? "All" : x}</button>)}</div>
          <input placeholder="Search…" aria-label={`Search ${team.abbr} players`} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}
      <div className="gg-tlist">
        {tab === "roster" && roster.map((p) => row(p, false))}
        {tab === "minors" && (minors.length ? minors.map((p) => row(p, true)) : <div className="dim small" style={{ padding: 8 }}>No prospects.</div>)}
        {tab === "picks" && (picks.length ? (
          <div className="gg-pickgrid">
            <div className="gg-pickgrid-h"><span>Year</span>{[1, 2, 3, 4, 5, 6, 7].map((r) => <span key={r}>R{r}</span>)}</div>
            {[...new Set(picks.map((p) => p.year))].sort().map((year) => (
              <div key={year} className="gg-pickgrid-row"><b>{year}</b>
                {[1, 2, 3, 4, 5, 6, 7].map((round) => {
                  const mine = picks.filter((p) => p.year === year && p.round === round);
                  if (!mine.length) return <span key={round} className="gg-pickcell empty">—</span>;
                  return <span key={round} className="gg-pickcell-wrap">{mine.map((pk) => { const on = selPicks.includes(pk.id); return <button key={pk.id} type="button" aria-pressed={on} className={`gg-pickcell${on ? " on" : ""}${pk.orig !== team.id ? " via" : ""}`} title={`${pickLabel(league, pk)} · value ${tvOf(pickValue(league, pk))}${pk.orig !== team.id ? ` · from ${league.teams[pk.orig].abbr}` : ""}`} onClick={() => toggle(selPicks, setSelPicks, pk.id)}>{pk.orig !== team.id ? league.teams[pk.orig].abbr : "own"}<small>{tvOf(pickValue(league, pk))}</small></button>; })}</span>;
                })}
              </div>
            ))}
            <div className="dim small" style={{ padding: "6px 4px" }}>Tap a pick to add it. Darker cells came from another club. The small number is its trade value.</div>
          </div>
        ) : <div className="dim small" style={{ padding: 8 }}>No picks.</div>)}
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
  // Deal values are linear (the engine's units ×10) so they add up correctly;
  // a player's TV badge stays on the OVR scale for quick reading.
  const giveTV = Math.round(ev.valIn * 10), getTV = Math.round(ev.valOut * 10);
  const [fairLab, fairCol] = fairness(ev.ratio, !ev.accept && ev.problems.some((x) => x !== "Add something to the deal."));
  const closed = tradingClosed(league);
  const empty = !give.length && !get.length && !givePicks.length && !getPicks.length;

  const chip = (id, side) => { const p = league.players[id]; return p ? <span key={`${side}${id}`} className="gg-deal-chip"><PosBadge pos={p.pos} /> {p.name} <b style={{ color: ovrColor(p.ovr) }}>{p.ovr}</b><i onClick={() => (side === "give" ? setGive(give.filter((x) => x !== id)) : setGet(get.filter((x) => x !== id)))} aria-label={`Remove ${p.name}`}>✕</i></span> : null; };
  const pickChip = (id, side) => { const pk = league.draftPicks.find((p) => p.id === id); return pk ? <span key={`${side}p${id}`} className="gg-deal-chip pick">{pickLabel(league, pk)}<i onClick={() => (side === "give" ? setGivePicks(givePicks.filter((x) => x !== id)) : setGetPicks(getPicks.filter((x) => x !== id)))} aria-label="Remove pick">✕</i></span> : null; };
  const retainables = [...give.map((id) => ({ id, side: "give" })), ...get.map((id) => ({ id, side: "get" }))].filter((x) => league.players[x.id]?.yrs > 0);
  const protectable = givePicks.map((id) => league.draftPicks.find((p) => p.id === id)).filter((p) => p?.round === 1 && p.orig === user.id);
  return (
    <div className="stack gg-trade">
      <div className="gg-pagehead">
        <div><h2>Trade Center</h2><div className="gg-status">{league.phase === "regular" ? `Deadline ${dayToDate(league.year, league.deadlineDay, league.scheduleStart)} · ` : ""}pick a partner, tap assets on both sides, then check the deal bar</div></div>
        <div className="gg-chips"><button className={finder ? "on" : ""} onClick={() => setFinder(!finder)} aria-expanded={finder}>Trade Finder</button></div>
      </div>
      {closed && <div className="notice warn">Trading is frozen until the playoffs end.</div>}
      {deadlineActive(league) && <div className="notice">Trade Deadline Day: it's {fmtClock(league.deadline.minute)} ET. Deals close at 3:00 PM. <span className="link" onClick={() => go("deadline")}>Back to the deadline desk →</span></div>}
      {finder && <TradeFinder league={league} user={user} onLoad={(tid, pid, qid) => { setPartner(tid); setGive([pid]); setGet([qid]); setGivePicks([]); setGetPicks([]); setFinder(false); }} />}

      <div className="gg-partner">
        <div className="gg-partner-pick">
          <span className="gg-k" style={{ margin: 0 }}>Trade partner</span>
          <Select value={String(partner)} onChange={(e) => pickTeam(Number(e.target.value))} aria-label="Trade partner" style={{ minWidth: 240 }}>
            {["East", "West"].map((c) => <optgroup key={c} label={`${c}ern Conference`}>{others.filter((t) => t.conf === c).sort((a, b) => a.city.localeCompare(b.city)).map((t) => <option key={t.id} value={t.id}>{t.city} {t.name} ({t.abbr}) · {t.rec.w}-{t.rec.l}-{t.rec.otl}</option>)}</optgroup>)}
          </Select>
          <div className="gg-partner-logos" role="radiogroup" aria-label="Trade partner quick pick">
            {others.map((t) => <button key={t.id} role="radio" aria-checked={t.id === partner} aria-label={`${t.city} ${t.name}`} className={t.id === partner ? "on" : ""} style={{ "--c1": t.colors[0] }} onClick={() => pickTeam(t.id)} title={`${t.city} ${t.name}`}><TeamBadge team={t} size={24} decorative /><small className="gg-pl-abbr">{t.abbr}</small><small className="gg-pl-rec">{t.rec.w}-{t.rec.l}-{t.rec.otl}</small><small className="gg-pl-cap" style={{ color: capSpace(league, t) < 0 ? "#ef4444" : "#22c55e" }}>{money(capSpace(league, t))}</small></button>)}
          </div>
        </div>
        <div className="gg-partner-card" style={{ "--c1": ai.colors[0], "--c2": ai.colors[1] }}>
          <TeamBadge team={ai} size={56} decorative />
          <div className="gg-partner-info"><b>{ai.city} {ai.name}</b><small>{ai.rec.w}-{ai.rec.l}-{ai.rec.otl} · cap space {money(capSpace(league, ai))} · {ev.contending ? "contending: values proven players" : "rebuilding: values youth & picks"}</small><div className="gg-partner-mood">GM: <b>“{ev.mood}”</b></div></div>
          <div className="gg-partner-needs"><span className="gg-k" style={{ margin: 0 }}>Your needs</span><div className="row" style={{ gap: 4 }}>{needs.map((n) => <span key={n.k} className="gg-need" style={{ borderColor: GRADE_C[n.g] }}>{n.k} <b style={{ color: GRADE_C[n.g] }}>{n.g}</b></span>)}</div></div>
        </div>
      </div>

      <div className={`gg-dealbar${empty ? " empty" : ""}`}>
        <div className="gg-deal-cols">
          <div className="gg-deal-col"><span className="gg-k" style={{ margin: 0, color: "#86efac" }}>You send · {giveTV}</span><div className="gg-deal-chips">{give.map((id) => chip(id, "give"))}{givePicks.map((id) => pickChip(id, "give"))}{!give.length && !givePicks.length && <span className="dim small">Tap players or picks on the left</span>}</div></div>
          <div className="gg-deal-mid"><span className={`gg-deal-net ${getTV - giveTV >= 0 ? "good" : "bad"}`}>{getTV - giveTV >= 0 ? "+" : ""}{getTV - giveTV}</span>{!empty && <span className="gg-tag" style={{ color: fairCol, borderColor: fairCol }}>{fairLab}</span>}<div className="gg-bar" style={{ height: 6, width: 120 }}><i style={{ width: `${Math.min(100, (ev.ratio / 1.4) * 100)}%`, background: ev.accept ? "#22c55e" : ev.ratio > 0.85 ? "#eab308" : "#ef4444" }} /></div></div>
          <div className="gg-deal-col"><span className="gg-k" style={{ margin: 0, color: "#93c5fd" }}>You get · {getTV}</span><div className="gg-deal-chips">{get.map((id) => chip(id, "get"))}{getPicks.map((id) => pickChip(id, "get"))}{!get.length && !getPicks.length && <span className="dim small">Tap players or picks on the right</span>}</div></div>
        </div>
        {!empty && ev.problems.filter((p) => p !== "Add something to the deal.").map((p) => <div key={p} className="small bad">{p}</div>)}
        {(retainables.length > 0 || protectable.length > 0) && (
          <div className="gg-deal-opts">
            {protectable.map((p) => <label className="row small" key={p.id}><input type="checkbox" checked={protections.some((c) => c.pickId === p.id)} onChange={(e) => setProtections(e.target.checked ? [...protections, { pickId: p.id, top: 10 }] : protections.filter((c) => c.pickId !== p.id))} /> Top-10 protect {pickLabel(league, p)}</label>)}
            {retainables.map(({ id, side }) => <label className="row small" key={id}>Retain {league.players[id].name.split(" ").at(-1)} <Select aria-label={`Retain salary for ${league.players[id].name}`} value={String((side === "give" ? giveRetention : getRetention)[id] || 0)} onChange={(e) => (side === "give" ? setGiveRetention({ ...giveRetention, [id]: Number(e.target.value) }) : setGetRetention({ ...getRetention, [id]: Number(e.target.value) }))} style={{ minWidth: 80 }}>{[0, 25, 50].map((v) => <option key={v} value={v}>{v}%</option>)}</Select></label>)}
          </div>
        )}
        <div className="gg-deal-actions">
          <button className="primary" disabled={!ev.accept} onClick={propose}>{ev.accept ? "✓ Execute Trade" : "They'd decline"}</button>
          <button onClick={balance} disabled={!get.length && !getPicks.length}>What would it take?</button>
          <button className="ghost" onClick={reset} disabled={empty}>Clear</button>
          <span className="dim small">Values (TV) are on the OVR scale from {ai.abbr}'s point of view.</span>
        </div>
      </div>

      <div className="gg-sides">
        <Side title="You send" color="#22c55e" team={user} viewer={ai} mine sel={give} setSel={setGive} selPicks={givePicks} setSelPicks={setGivePicks} />
        <Side title="You get" color="#3b82f6" team={ai} viewer={ai} sel={get} setSel={setGet} selPicks={getPicks} setSelPicks={setGetPicks} />
      </div>

      {league.tradeHistory?.length > 0 && (
        <div className="gg-card">
          <div className="gg-k">Trade history</div>
          {league.tradeHistory.slice(0, 10).map((t, i) => (
            <div className="small gg-news" key={i}><span className="dim">{t.year}</span> <TeamBadge team={league.teams[t.a]} size={16} /> {league.teams[t.a].abbr} sent {t.aSends} → <TeamBadge team={league.teams[t.b]} size={16} /> {league.teams[t.b].abbr} for {t.bSends}</div>
          ))}
        </div>
      )}
    </div>
  );
}
