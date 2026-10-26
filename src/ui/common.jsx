import React, { createContext, useContext, useMemo, useState, useRef, useId } from "react";
import { createPortal } from "react-dom";
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

// Every popup is drawn at the top of the page (a portal to document.body), so one opened inside a
// transformed or sticky block still sits over everything. The wrapper keeps the app's classes
// (display: contents, so it adds no box) and the stylesheets' ".app …" rules still reach it.
export function Portal({ children }) {
  if (typeof document === "undefined") return children;
  const root = document.querySelector(".app:not(.rk-portal)");
  const cls = `app rk-portal${document.documentElement.classList.contains("rk-phone") ? " rk-phone-app" : ""}`;
  return createPortal(<div className={cls} style={{ display: "contents" }} data-density={root?.dataset.density} data-text-size={root?.dataset.textSize} data-motion={root?.dataset.motion}>{children}</div>, document.body);
}

// On phones (760px and narrower) a dialog is a bottom sheet that slides up; drag its grip or
// header down to close it (sheet={false} keeps it a centred dialog, as search does). On a computer
// it is a centred dialog over a blurred backdrop. No onClose: it has to be answered (no X, no tap-out).
export function Modal({ title, onClose, children, head, bare = false, className = "", sheet = true }) {
  const close = onClose || (() => {});
  const ref=useRef(null),id=useId();useDialogFocus(ref,close);
  const drag=useRef(null);
  const grip=sheet && onClose?{
    onTouchStart:(e)=>{drag.current={y:e.touches[0].clientY,dy:0};},
    onTouchMove:(e)=>{const d=drag.current;if(!d)return;d.dy=Math.max(0,e.touches[0].clientY-d.y);if(ref.current)ref.current.style.transform=d.dy?`translateY(${d.dy}px)`:"";},
    onTouchEnd:()=>{const d=drag.current;drag.current=null;if(ref.current)ref.current.style.transform="";if(d && d.dy>70)onClose();},
  }:{};
  return (
    <Portal>
    <div className={`modalbg${sheet?" rk-sheetbg":""}`} onMouseDown={(e) => onClose && e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal${sheet?" rk-sheet":""} ${className}`} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}>
        {/* the grip (phones only) carries a bare dialog's close button, so it stays at the top of the sheet */}
        {sheet && <div className="rk-grip" {...grip}><span aria-hidden="true"/>{bare && onClose && <button className="close ghost gg-bare-close" aria-label="Close dialog" onClick={onClose}><Icon name="close"/></button>}</div>}
        {bare ? <><span id={id} className="sr-only">{title}</span>{!sheet && onClose && <button className="close ghost gg-bare-close" aria-label="Close dialog" onClick={onClose}><Icon name="close"/></button>}</> : <div className="mhead" {...grip}>
          {head}
          <div id={id} className="modal-title">{title}</div>
          {onClose && <button className="close ghost" aria-label="Close dialog" onClick={onClose}><Icon name="close"/></button>}
        </div>}
        <div className="mbody">{children}</div>
      </div>
    </div>
    </Portal>
  );
}

// The shared popup frames (from the football game): Sheet is a plain titled popup (560px on a
// computer, 820 with wide), Dialog a decision with an optional line under the title and its
// buttons in one row at the bottom, DBtn those buttons (primary green, danger, gold or quiet).
export function Sheet({ title, onClose, children, wide, className = "" }) {
  return <Modal title={title} onClose={onClose} className={`rk-soft${wide ? " rk-wide" : ""} ${className}`}>{children}</Modal>;
}
export function Dialog({ title, sub, onClose, children, actions, wide, className = "" }) {
  return (
    <Sheet title={title} onClose={onClose} wide={wide} className={className}>
      {sub && <div className="rk-dsub">{sub}</div>}
      {children}
      {actions && <div className="rk-dactions">{actions}</div>}
    </Sheet>
  );
}
export function DBtn({ kind = "quiet", onClick, disabled, children, title, grow = true, style, autoFocus }) {
  return <button type="button" className={`rk-dbtn ${kind}${grow ? " grow" : ""}`} onClick={onClick} disabled={disabled} title={title} style={style} autoFocus={autoFocus}>{children}</button>;
}
export const softBox = { background: "#ffffff0d", borderRadius: 14, padding: "12px 14px" };

// The one page header every section uses (the Lineup / Development look): a row of quiet
// section pills, then a big plain sentence-case title with one grey line under it and the
// screen's own buttons on the right. pills: [[key, label, on, badge?]].
export function SectionPills({ pills = [], onPick, label = "Section" }) {
  if (pills.length < 2) return null;
  return (
    <nav className="rk-pills" aria-label={label}>
      {pills.map(([k, l, on, badge]) => <button key={k} type="button" className={on ? "on" : ""} aria-current={on ? "page" : undefined} onClick={() => onPick(k)}>{l}{badge && <span className="badge">{badge}</span>}</button>)}
    </nav>
  );
}
export function PageHead({ pills, onPick, label, title, sub, right, className = "" }) {
  return (
    <div className={`rk-pg ${className}`}>
      {pills && <SectionPills pills={pills} onPick={onPick} label={label} />}
      {(title || right) && <div className="rk-pg-row">
        <div className="rk-pg-t">{title && <h1>{title}</h1>}{sub && <div className="rk-pg-s">{sub}</div>}</div>
        {right && <div className="rk-pg-r">{right}</div>}
      </div>}
    </div>
  );
}

// The section hero (Gridiron's Team header): a band in the club's colours with a faint logo, a small
// eyebrow, the section's block title, the screen's 3–5 numbers on the right and the section's
// screens as underline tabs inside the band. One component for every section, desktop and phone
// (compact: eyebrow, title, the first three numbers, tabs that scroll). Numbers: heroStats.js.
const heroLum = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return 0.2;
  const n = parseInt(m[1], 16), f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(n >> 16) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
};
export function heroColor(team) {
  const [a, b] = team?.colors || [];
  // A near-black primary (or a pale one) tints nothing: use the second colour when it has more life.
  const la = heroLum(a), lb = heroLum(b);
  const c = (la < 0.006 || la > 0.6) && b && lb >= 0.006 && lb <= 0.6 ? b : a || "#1e3a8a";
  const l = heroLum(c);
  return { c, a: l > 0.35 ? "66" : l < 0.03 ? "ff" : "b3" };
}
export function SectionHero({ team, eyebrow, title, stats = [], tabs = [], onTab, compact = false }) {
  const { c, a } = heroColor(team);
  const all = stats.filter(Boolean);
  // Phones: three numbers that fit (long values give way to the next ones).
  const shown = compact ? [...all.filter(([, v]) => String(v).length <= 10), ...all.filter(([, v]) => String(v).length > 10)].slice(0, 3) : all;
  return (
    <section className={`keep-dark rk-hero${compact ? " compact" : ""}`} aria-label={title}
      style={{ backgroundImage: `radial-gradient(140% 220% at 0% 0%, ${c}${a} 0%, ${c}2e 46%, transparent 78%)` }}>
      <span aria-hidden="true" className="rk-hero-mark"><TeamBadge team={team} size={compact ? 190 : 300} decorative /></span>
      <div className="rk-hero-top">
        <div className="rk-hero-id">
          {eyebrow && <div className="rk-hero-eye">{eyebrow}</div>}
          <h1 className="rk-hero-title">{title}</h1>
        </div>
        {shown.length > 0 && <div className="rk-hero-stats">
          {shown.map(([l, v, tone]) => <div key={l} className={tone ? `t-${tone}` : undefined}><b>{v}</b><span>{l}</span></div>)}
        </div>}
      </div>
      {tabs.length > 1 ? <nav className="rk-hero-tabs" aria-label={title}>
        {tabs.map(([k, l, on, badge]) => <button key={k} type="button" className={on ? "on" : ""} aria-current={on ? "page" : undefined} onClick={() => onTab(k)}>{l}{badge && <span className="badge">{badge}</span>}</button>)}
      </nav> : <div className="rk-hero-pad" />}
    </section>
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
