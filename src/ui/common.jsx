import React, { createContext, useContext, useMemo, useState, useRef, useId } from "react";
import {teamLogoUrl} from "./logos.js";
import {useDialogFocus} from "./accessibility.js";
import Icon from "./Icon.jsx";
import Jersey from "./Jersey.jsx";
import Headshot from "./Headshot.jsx";
import { ratingTier } from "../engine/ratings.js";
import { fmtMoney } from "../engine/players.js";

export const GameCtx = createContext(null);
export const useGame = () => useContext(GameCtx);

export function TeamBadge({team,size=28,className="",decorative=false}){
  const [failed,setFailed]=useState(false);if(!team)return null;const src=teamLogoUrl(team.abbr);
  return <span className={`teambadge ${className}`} title={`${team.city} ${team.name}`} style={{width:size,height:size}}>{src && !failed?<img src={src} width={size} height={size} alt={decorative?"":`${team.city} ${team.name} logo`} onError={()=>setFailed(true)} draggable="false"/>:<span className="logo-fallback" style={{background:team.colors?.[0] || '#263644',fontSize:Math.max(8,size*.25)}}>{team.abbr}</span>}</span>;
}
export function PlayerCell({p,team}){return <div className="player-cell"><span className="roster-sweater">{team?<Headshot team={team} p={p} size={38} decorative/>:<span className="player-number">{p.pos}</span>}</span><div><PlayerName p={p}/><span className="player-detail">{p.pos} · {p.age} years{p.rookie?' · Rookie':''}</span></div></div>;}

export function Ovr({ v, src, title }) {
  return (
    <span className="nowrap" title={title}>
      <span className={`ovr ${ratingTier(v)}`}>{v}</span>
      {src === "ea27" && <span className="src ea" title="Official EA SPORTS NHL 27 rating">EA</span>}
      {src === "est" && <span className="src est" title="Estimated rating (not yet verified against EA's NHL 27 database)">EST</span>}
    </span>
  );
}

export function PlayerName({ p, showInj = true }) {
  const { openPlayer } = useGame();
  if (!p) return <span className="dim">—</span>;
  return (
    <span className="nowrap">
      <button type="button" className="link player-link" onClick={() => openPlayer(p.id)}>{p.name}</button>
      {showInj && p.injury > 0 && <span className="inj" title={`${p.injuryNote || "injury"} — out ${p.injury} games`}> +{p.injury}</span>}
    </span>
  );
}

export function TeamName({ tid, short = false }) {
  const { league, openTeam } = useGame();
  const t = league.teams[tid];
  if (!t) return <span className="dim">FA</span>;
  return (
    <button type="button" className="link nowrap team-link" onClick={() => openTeam(tid)}>
      {short ? t.abbr : `${t.city} ${t.name}`}
    </button>
  );
}

export const money = fmtMoney;

export function Modal({ title, onClose, children, head, bare = false, className = "" }) {
  const ref=useRef(null),id=useId();useDialogFocus(ref,onClose);
  return (
    <div className="modalbg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}>
        {bare ? <><span id={id} className="sr-only">{title}</span><button className="close ghost gg-bare-close" aria-label="Close dialog" onClick={onClose}><Icon name="close"/></button></> : <div className="mhead">
          {head}
          <div id={id} className="modal-title">{title}</div>
          <button className="close ghost" aria-label="Close dialog" onClick={onClose}><Icon name="close"/></button>
        </div>}
        <div className="mbody">{children}</div>
      </div>
    </div>
  );
}

// Sortable table. columns: [{ key, label, render(row), sort(row) -> value, num, title }]
export function Table({ columns, rows, initialSort, rowClass, limit, empty = "Nothing to show.", dense }) {
  const [sort, setSort] = useState(initialSort || null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col || !col.sort) return rows;
    const arr = [...rows];
    arr.sort((a, b) => {
      const va = col.sort(a);
      const vb = col.sort(b);
      const cmp = typeof va === "string" ? va.localeCompare(vb) : va - vb;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sort, columns]);
  const shown = limit ? sorted.slice(0, limit) : sorted;
  return (
    <div className="tablewrap" tabIndex={0} role="region" aria-label="Scrollable data table">
      <table className="t" style={dense ? { fontSize: 12 } : undefined}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                title={c.title}
                tabIndex={c.sort?0:undefined}
                aria-sort={sort?.key===c.key?(sort.dir==="desc"?"descending":"ascending"):undefined}
                onKeyDown={e=>{if(c.sort && ["Enter"," "].includes(e.key)){e.preventDefault();setSort(s=>({key:c.key,dir:s?.key===c.key && s.dir==="desc"?"asc":"desc"}));}}}
                className={`${c.num ? "num" : ""} ${c.sort ? "sortable" : ""} ${sort?.key === c.key ? "sorted" : ""}`}
                onClick={() => c.sort && setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === "desc" ? "asc" : "desc" }))}
              >
                {c.label}
                {sort?.key === c.key ? (sort.dir === "desc" ? " ▾" : " ▴") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={r.id ?? i} className={rowClass ? rowClass(r, i) : ""}>
              {columns.map((c) => (
                <td key={c.key} className={c.num ? "num" : ""}>
                  {c.render ? c.render(r, i) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
          {!shown.length && (
            <tr>
              <td colSpan={columns.length} className="muted center" style={{ padding: 18 }}>{empty}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Bar({ v, max = 99, color }) {
  const pct = Math.max(0, Math.min(100, (v / max) * 100));
  const c = color || (v >= 90 ? "#f5c542" : v >= 85 ? "#34d399" : v >= 80 ? "#60a5fa" : v >= 70 ? "#64748b" : "#475569");
  return (
    <div className="bar">
      <i style={{ width: pct + "%", background: c }} />
    </div>
  );
}

export function recordStr(rec) {
  return `${rec.w}-${rec.l}-${rec.otl}`;
}

export function pct(x, digits = 3) {
  if (!isFinite(x)) return "-";
  const s = x.toFixed(digits);
  return s.startsWith("0") ? s.slice(1) : s;
}

export function signed(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

export const POS_ORDER = { C: 0, LW: 1, RW: 2, LD: 3, RD: 4, G: 5 };

// OVR tier colours shared by the Gridiron-style screens.
export const ovrColor = (o) => (o >= 85 ? "#22c55e" : o >= 79 ? "#84cc16" : o >= 73 ? "#eab308" : o >= 67 ? "#f97316" : "#ef4444");
