// The live rink: the ice, boards, sweaters and players moving by role for the game on screen.
// LiveGame.jsx runs the game and the broadcast around it; this file only draws the rink.
import React, { useEffect, useRef } from "react";
import { skatersForDisplay, skaterCount, clockLabel } from "../engine/sim.js";

// Seconds of game time per sim step; LiveGame steps the game at this rate and the rink interpolates.
export const STEP_SEC = 10;

function colorDist(a, b) {
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}
const clampX = (x) => Math.max(9, Math.min(191, x));
const clampY = (y) => Math.max(6, Math.min(79, y));

// Skater roles: 0 C, 1 LW, 2 RW, 3 LD, 4 RD, 5 extra attacker. Each dot keeps its role,
// so players glide between spots instead of swapping places when the puck changes hands.
const O_ZONE = [[72, 42.5], [70, 20], [70, 65], [52, 24], [52, 61], [82, 50]];
const D_ZONE = [[70, 42.5], [58, 24], [58, 61], [80, 35], [80, 50], [80, 42.5]];

function skatersOn(s, k) {
  return skaterCount(s, k) + (s[k].pulled ? 1 : 0);
}
function rolesOn(n) {
  if (n >= 6) return [0, 1, 2, 3, 4, 5];
  if (n === 5) return [0, 1, 2, 3, 4];
  if (n === 4) return [0, 1, 3, 4];
  return [0, 3, 4];
}

// Where everyone should be right now, in rink coordinates (200 x 85).
function targetsFor(s, homeRight) {
  const dir = (k) => ((k === "h") === homeRight ? 1 : -1);
  const puck = s.puck || { x: 100, y: 42.5 };
  const P = s.poss || "h";
  const D = P === "h" ? "a" : "h";
  const dP = dir(P) * (puck.x - 100);
  const at = (depth, y) => ({ x: clampX(100 + dir(P) * depth), y: clampY(y) });
  const out = { h: [], a: [] };
  const inZone = dP > 45;
  // Attackers.
  const attHome = inZone
    ? O_ZONE.map(([d, y]) => [d, y])
    : [[dP, puck.y], [dP + 8, 18], [dP + 8, 67], [dP - 18, 30], [dP - 18, 55], [dP + 4, 42.5]];
  const onP = rolesOn(skatersOn(s, P));
  let carrier = onP[0];
  let best = Infinity;
  for (const r of onP) {
    const h = at(...attHome[r]);
    const dd = Math.hypot(h.x - puck.x, h.y - puck.y);
    if (dd < best) { best = dd; carrier = r; }
  }
  for (let r = 0; r < 6; r++) {
    const on = onP.includes(r);
    const p = r === carrier ? { x: clampX(puck.x - dir(P) * 1.6), y: clampY(puck.y + 1.2) } : at(...attHome[r]);
    out[P].push({ ...p, on });
  }
  // Defenders sit between the puck and their own net.
  const onD = rolesOn(skatersOn(s, D));
  const defHome = inZone
    ? D_ZONE.map(([d, y], r) => (r === 0 ? [Math.min(dP + 6, 84), puck.y * 0.7 + 42.5 * 0.3] : [d, y]))
    : [[dP + 8, puck.y], [dP + 14, 22], [dP + 14, 63], [dP + 30, 33], [dP + 30, 52], [dP + 22, 42.5]];
  for (let r = 0; r < 6; r++) {
    const [d, y] = defHome[r];
    out[D].push({ ...at(Math.min(d, 84), y), on: onD.includes(r) });
  }
  const goalie = (k) => {
    const x = 100 - dir(k) * 86;
    const near = dir(k) * (puck.x - 100) < -40;
    return { x, y: 42.5 + (near ? (puck.y - 42.5) * 0.18 : 0), on: !s[k].pulled };
  };
  return { puck, h: out.h, a: out.a, gh: goalie("h"), ga: goalie("a"), netX: (k) => 100 + dir(k) * 89 };
}

export default function Rink({ s, home, away, stepInfo, clockRef, banner, final = false }) {
  const clash = colorDist(home.colors[0], away.colors[0]) < 140;
  const color = { h: home.colors[0], a: clash ? away.colors[1] : away.colors[0] };
  const ring = { h: home.colors[1], a: clash ? away.colors[0] : away.colors[1] };
  const els = useRef({ h: [], a: [], gh: null, ga: null, puck: null });
  const pos = useRef(null);

  useEffect(() => {
    let raf;
    let last = performance.now();
    const set = (el, p) => {
      if (!el) return;
      el.setAttribute("transform", `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
      el.style.opacity = p.on === false ? "0" : "1";
    };
    const frame = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const info = stepInfo.current;
      const frac = Math.min(1, (now - info.at) / Math.max(1, info.dur));
      const T = targetsFor(s, s.period % 2 === 1);
      // A shot: the puck goes to the shooter first, then to the net.
      let puckT = T.puck;
      if (info.shot && frac > 0.45) puckT = info.shot;
      if (!pos.current) {
        pos.current = { puck: { ...puckT }, h: T.h.map((p) => ({ ...p })), a: T.a.map((p) => ({ ...p })), gh: { ...T.gh }, ga: { ...T.ga } };
      }
      const P = pos.current;
      const tau = Math.max(0.05, Math.min(0.55, (info.dur / 1000) * 0.42));
      const kS = 1 - Math.exp(-dt / tau);
      const kP = 1 - Math.exp(-dt / (tau * 0.55));
      const ease = (p, t, k) => {
        p.x += (t.x - p.x) * k;
        p.y += (t.y - p.y) * k;
        p.on = t.on;
      };
      ease(P.puck, puckT, kP);
      for (const side of ["h", "a"]) T[side].forEach((t, i) => ease(P[side][i], t, kS));
      ease(P.gh, T.gh, kS);
      ease(P.ga, T.ga, kS);
      const E = els.current;
      for (const side of ["h", "a"]) {P[side].forEach((p, i) => set(E[side][i], s.phase === "so" ? { ...p, on: false } : p));
        const ids=skatersForDisplay(s,side);const roles=rolesOn(ids.length);for(let i=0;i<6;i++){const pid=ids[roles.indexOf(i)];const label=E[side][i]?.querySelector("text");if(label)label.textContent=pid?s[side].pl[pid]?.number || "":"";}}
      set(E.gh, P.gh);
      set(E.ga, P.ga);
      set(E.puck, P.puck);
      // Game clock ticks down smoothly between 10-second steps.
      if (clockRef.current) {
        let txt;
        if (s.phase === "final") txt = "FINAL";
        else if (s.phase === "so") txt = "SO";
        else if (info.periodEnd) txt = "0:00";
        else txt = clockLabel(Math.round(s.clock + STEP_SEC * (1 - (info.paused ? 1 : frac))));
        if (clockRef.current.textContent !== txt) clockRef.current.textContent = txt;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [s, stepInfo, clockRef]);

  const dot = (k, i) => (
    <g key={k + i} ref={(el) => (els.current[k][i] = el)} className="sk">
      <path d="M-1.3 -2.4 L1.3 -2.4 L3 -1.2 L2 .3 L1.3 -.1 L1.5 2.2 L-1.5 2.2 L-1.3 -.1 L-2 .3 L-3 -1.2 Z" fill={color[k]} stroke={ring[k]} strokeWidth=".4"/><path d="M1.8 1 L3.5 3 L4.5 3" stroke="#222" strokeWidth=".35" fill="none"/><text textAnchor="middle" y=".8" fill="#fff" fontSize="1.9" fontWeight="900"/>
    </g>
  );
  return (
    <div className={`rinkwrap${final ? " final" : ""}`}>
      <svg viewBox="-4 -4 208 93">
        <rect x="0" y="0" width="200" height="85" rx="28" fill={final ? "#f3f6fb" : "#eef5fd"} stroke={final ? "#b8860b" : "#2a3a5a"} strokeWidth={final ? "2.2" : "1.6"} />
        {final ? <><text x="100" y="40" textAnchor="middle" fontSize="7" fontWeight="900" fill="#b8860b" opacity="0.45" letterSpacing="1.5">STANLEY CUP</text><text x="100" y="50" textAnchor="middle" fontSize="7" fontWeight="900" fill="#b8860b" opacity="0.45" letterSpacing="1.5">FINAL</text><text x="40" y="12" fontSize="4" fontWeight="800" fill={away.colors[0]} opacity="0.5">{away.abbr}</text><text x="150" y="12" fontSize="4" fontWeight="800" fill={home.colors[0]} opacity="0.5">{home.abbr}</text></> : <text x="100" y="47" textAnchor="middle" fontSize="11" fontWeight="900" fill={home.colors[0]} opacity="0.18">{home.abbr}</text>}
        <line x1="11" y1="2" x2="11" y2="83" stroke="#d33" strokeWidth="0.35" />
        <line x1="189" y1="2" x2="189" y2="83" stroke="#d33" strokeWidth="0.35" />
        <line x1="75" y1="0" x2="75" y2="85" stroke="#2b5cd6" strokeWidth="1.2" />
        <line x1="125" y1="0" x2="125" y2="85" stroke="#2b5cd6" strokeWidth="1.2" />
        <line x1="100" y1="0" x2="100" y2="85" stroke="#d33" strokeWidth="1" strokeDasharray="2 1" />
        <circle cx="100" cy="42.5" r="15" fill="none" stroke="#2b5cd6" strokeWidth="0.4" />
        <circle cx="100" cy="42.5" r="0.8" fill="#2b5cd6" />
        {[[31, 20.5], [31, 64.5], [169, 20.5], [169, 64.5]].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="15" fill="none" stroke="#d33" strokeWidth="0.4" />
            <circle cx={x} cy={y} r="1" fill="#d33" />
          </g>
        ))}
        {[[80, 20.5], [80, 64.5], [120, 20.5], [120, 64.5]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1" fill="#d33" />)}
        <path d="M11 36.5 A6 6 0 0 1 11 48.5 Z" fill="#9ccaf5" opacity="0.7" />
        <path d="M189 36.5 A6 6 0 0 0 189 48.5 Z" fill="#9ccaf5" opacity="0.7" />
        <rect x="7" y="39.5" width="4" height="6" fill="none" stroke="#c33" strokeWidth="0.6" />
        <rect x="189" y="39.5" width="4" height="6" fill="none" stroke="#c33" strokeWidth="0.6" />
        <g ref={(el) => (els.current.gh = el)} className="sk"><circle r="2.7" fill={color.h} stroke="#111" strokeWidth="0.7" /></g>
        <g ref={(el) => (els.current.ga = el)} className="sk"><circle r="2.7" fill={color.a} stroke="#111" strokeWidth="0.7" /></g>
        {[0, 1, 2, 3, 4, 5].map((i) => dot("a", i))}
        {[0, 1, 2, 3, 4, 5].map((i) => dot("h", i))}
        <g ref={(el) => (els.current.puck = el)}><circle r="1.15" fill="#111" /></g>
      </svg>
      {banner && (
        <div className={`rinkbanner ${banner.kind}`} style={{ "--bc": banner.color || "var(--accent2)" }} key={banner.n}>
          <div className="rb-k">{banner.title}</div>
          {banner.sub && <div className="rb-s">{banner.sub}</div>}
        </div>
      )}
    </div>
  );
}
