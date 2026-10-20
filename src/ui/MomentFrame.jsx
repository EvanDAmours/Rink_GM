// The shared frame for the big moments (Gridiron 3.0): club colours, logo, kicker, a shining title,
// confetti or fireworks, a body, Continue. Family files (ui/moments/*.jsx) build on these.
import React, { useEffect } from "react";
import { useGame, TeamBadge } from "./common.jsx";
import Headshot from "./Headshot.jsx";
import "./moments.css";

// A readable accent from the club's colours: the secondary unless it's near-black or too close to the primary.
const lum = (hex) => {
  const h = String(hex || "").replace("#", "");
  if (h.length < 6) return 0.5;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export function momentColors(team) {
  const [a = "#1e3a8a", b = "#f59e0b"] = team?.colors || [];
  const clr = lum(a) > 0.8 ? b : a; // a white primary paints badly as a background
  let ac = clr === a ? b : a;
  if (lum(ac) < 0.12 || Math.abs(lum(ac) - lum(clr)) < 0.12) ac = "#fde68a";
  return { clr, ac };
}

const CONFETTI = Array.from({ length: 42 }, (_, i) => ({ left: (i * 37) % 100, delay: (i * 0.13) % 2.4, dur: 2.6 + ((i * 7) % 10) / 10, rot: (i * 47) % 360, size: 6 + (i % 4) * 2 }));
export function Confetti({ colors }) {
  return (
    <div className="mm-confetti" aria-hidden>
      {CONFETTI.map((c, i) => (
        <span key={i} style={{ left: `${c.left}%`, width: c.size, height: c.size * 1.6, background: colors[i % colors.length], transform: `rotate(${c.rot}deg)`, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }} />
      ))}
    </div>
  );
}

const BURSTS = Array.from({ length: 7 }, (_, i) => ({ left: 12 + ((i * 29) % 76), top: 8 + ((i * 17) % 34), delay: (i * 0.55) % 3.2, hue: i }));
export function Fireworks({ colors }) {
  return (
    <div className="mm-fireworks" aria-hidden>
      {BURSTS.map((b, i) => (
        <span key={i} className="mm-burst" style={{ left: `${b.left}%`, top: `${b.top}%`, animationDelay: `${b.delay}s`, "--fw": colors[b.hue % colors.length] }} />
      ))}
    </div>
  );
}

// One label/value row, as Gridiron's moments list facts ("CONTRACT  8 years · $12.5M").
export function MomentLine({ k, v, tone }) {
  return (
    <div className="mm-line">
      <span className="mm-line-k">{k}</span>
      <span className="mm-line-v" style={tone ? { color: tone } : undefined}>{v}</span>
    </div>
  );
}

// A player block: headshot (or sweater plate), name, position, a big number and a caption.
export function MomentPlayer({ p, team, big, caption, children }) {
  return (
    <div className="mm-player">
      <Headshot p={p} team={team} size={88} />
      <div className="mm-player-text">
        {p?.name && <div className="mm-player-name">{p.name}</div>}
        <div className="mm-player-meta">
          {p?.pos && <span className="mm-pos">{p.pos}</span>}
          {caption && <span>{caption}</span>}
        </div>
        {big != null && <div className="mm-big">{big}</div>}
        {children}
      </div>
    </div>
  );
}

// The shared card: club colours, logo, kicker, a shining title, optional confetti/fireworks, body, Continue.
export function MomentFrame({ m, team, kicker, title, sub, party = false, fireworks = false, cta = "CONTINUE →", onClose, children, className = "", wide = false }) {
  const { clr, ac } = momentColors(team);
  useEffect(() => {
    const key = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const colors = [clr, ac, "#fde68a", "#ffffff"];
  return (
    <div className={`mm-overlay ${className}`} onClick={onClose} style={{ "--mm-clr": clr, "--mm-ac": ac }}>
      {party && <Confetti colors={colors} />}
      {fireworks && <Fireworks colors={colors} />}
      <div role="dialog" aria-modal="true" aria-label={kicker || title} className={`mm-card${wide ? " wide" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="mm-head">
          {team && <TeamBadge team={team} size={76} decorative />}
          <div className="mm-head-text">
            {kicker && <div className="mm-kicker">{kicker}</div>}
            {title && <div className="mm-title">{title}</div>}
          </div>
        </div>
        {(sub ?? m?.sub) && <div className="mm-sub">{sub ?? m.sub}</div>}
        {children}
        {m?.lines?.length > 0 && <div className="mm-lines">{m.lines.map(([k, v, tone]) => <MomentLine key={k} k={k} v={v} tone={tone} />)}</div>}
        {m?.note && <div className="mm-note">{m.note}</div>}
        {cta && <button type="button" className="mm-cta" onClick={onClose} autoFocus>{cta}</button>}
      </div>
    </div>
  );
}

// A plain moment for kinds that only need kicker/title/sub/lines (also the fallback for unknown kinds).
export function BasicMoment({ m, onClose }) {
  const { league } = useGame();
  const team = league.teams[m.tid] || league.teams[league.userTid];
  return <MomentFrame m={m} team={team} kicker={m.kicker} title={m.title} party={!!m.party} onClose={onClose} />;
}

