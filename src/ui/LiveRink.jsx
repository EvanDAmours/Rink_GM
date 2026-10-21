// The live rink: the ice, boards, sweaters and players moving by role for the game on screen.
// LiveGame.jsx runs the game and the broadcast around it; this file only draws the rink.
//
// Props
//   s, home, away       the game state (engine/sim.js) and the two clubs; home is the club in its own building
//   stepInfo, clockRef  LiveGame's step timing (players glide between steps) and the scorebug clock element
//   banner              LiveGame's goal / period banner ({ kind, title, sub, color, n }), shown over the ice;
//                       a goal also lights the goal light behind the net it went in
//   final               true for a Stanley Cup Final game: Final ice, centre medallion, both clubs' logos
//                       painted in their ends and Final boards
// Optional
//   variant             "tv" for the full-width TV view: no frame, edge to edge (default: the framed rink)
//   arena               the building's name when it isn't the home club's own (a neutral-site game's venue)
//   year                the season's first year (2026 for 2026-27); defaults to s.year
//   wordmarks           false leaves the home club's name off the ice behind the nets (default true)
//
// Size: the rink fills its container's width at RINK_ASPECT (width / height). The painted ice and the
// moving players are two layers with one viewBox, so in a box of any other shape they letterbox together
// and stay lined up. Players scale up a little in narrow containers (live-rink.css) so phones can read them.
// The painted ice is static and memoised; only the players' layer repaints while the game runs.
import React, { useEffect, useId, useMemo, useRef } from "react";
import { skatersForDisplay, skaterCount, clockLabel } from "../engine/sim.js";
import { liveSweaters, luminance } from "../engine/uniforms.js";
import { arenaFor } from "../data/arenas.js";
import { teamLogoUrl } from "./logos.js";
import { trophyUrl } from "./trophies.js";
import "./live-rink.css";

// Seconds of game time per sim step; LiveGame steps the game at this rate and the rink interpolates.
export const STEP_SEC = 10;

// The ice is 200 x 85 (feet); the frame adds the boards, the glass and a strip of crowd. The far boards
// are seen a little from the front (the camera sits above the near boards), so their face and its ads show.
const VB = { x: -5.5, y: -12.5, w: 211, h: 103 };
export const RINK_ASPECT = VB.w / VB.h;
const VIEWBOX = `${VB.x} ${VB.y} ${VB.w} ${VB.h}`;

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

// ---- The painted ice, the boards and the glass (static) ----

const rr = (x, y, w, h, r) => `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
const ICE = rr(0, 0, 200, 85, 28);
const FACE = rr(0, -5, 200, 85, 28); // the far boards' face, seen from the camera
const KICK = rr(0, -0.8, 200, 85, 28); // the kick plate along its foot
const CAP = rr(-1.3, -1.3, 202.6, 87.6, 29.3); // the top of the boards all the way round
const GLASS = rr(-4.5, -11, 209, 100.5, 32.5);
const RED = "#cf2a30", BLUE = "#1f4fc4", GOLD = "#e3bd57", KICK_YELLOW = "#e9b814";
const rnd = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

// Skate marks: short scratches, thickest where the play is (the dots, the creases, the slot).
const SCUFFS = (() => {
  const spots = [[31, 20.5, 10], [31, 64.5, 10], [169, 20.5, 10], [169, 64.5, 10], [100, 42.5, 12], [17, 42.5, 6], [183, 42.5, 6], [80, 20.5, 5], [80, 64.5, 5], [120, 20.5, 5], [120, 64.5, 5], [55, 42.5, 20], [145, 42.5, 20], [100, 14, 30], [100, 71, 30]];
  const out = [];
  let i = 0;
  for (const [cx, cy, r] of spots) for (let k = 0; k < 7; k++, i++) {
    const a = rnd(i, 1) * Math.PI * 2, d = Math.sqrt(rnd(i, 2)) * r;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.8;
    const len = 2 + rnd(i, 3) * 6, ang = (rnd(i, 4) - 0.5) * 1.6 + (rnd(i, 8) > 0.6 ? Math.PI / 2 : 0), bend = (rnd(i, 5) - 0.5) * 3.2;
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len, mx = (x + x2) / 2 - Math.sin(ang) * bend, my = (y + y2) / 2 + Math.cos(ang) * bend;
    out.push({ d: `M${x.toFixed(1)} ${y.toFixed(1)}Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`, w: (0.1 + rnd(i, 6) * 0.2).toFixed(2), o: (0.14 + rnd(i, 7) * 0.22).toFixed(2), white: rnd(i, 9) > 0.55 });
  }
  return out;
})();

// End-zone circles: the hash marks outside each circle and the L's around the dot.
function EndCircle({ cx, cy }) {
  const hy = Math.sqrt(225 - 2.875 ** 2);
  const ls = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => `M${cx + sx * 2} ${cy + sy * 0.75}h${sx * 4}M${cx + sx * 2} ${cy + sy * 0.75}v${sy * 3}`)).join("");
  const hashes = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => `M${cx + sx * 2.875} ${cy + sy * hy}v${sy * 2}`)).join("");
  return (
    <g>
      <circle cx={cx} cy={cy} r="15" fill="none" stroke={RED} strokeWidth=".35" />
      <path d={hashes + ls} fill="none" stroke={RED} strokeWidth=".3" />
      <Dot cx={cx} cy={cy} />
    </g>
  );
}
// A faceoff dot: red with the white sides of a real one.
function Dot({ cx, cy }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r="1" fill="#fff" stroke={RED} strokeWidth=".18" />
      <rect x={cx - 0.55} y={cy - 0.92} width="1.1" height="1.84" fill={RED} rx=".15" />
    </g>
  );
}
// The net, seen from above: posts and crossbar in red, the mesh behind. Drawn at the left end.
function Net({ id }) {
  const mesh = "M11 39.5L11 45.5L8.6 45.5Q7 45.5 7 43.9L7 41.1Q7 39.5 8.6 39.5Z";
  return (
    <g>
      <path d={mesh} transform="translate(.45 .65)" fill="#0b1626" opacity=".22" />
      <path d={mesh} fill={`url(#${id}mesh)`} stroke={RED} strokeWidth=".3" />
      <line x1="11" y1="39.5" x2="11" y2="45.5" stroke="#c21f24" strokeWidth=".55" strokeLinecap="round" />
    </g>
  );
}

// Dasher board ads (six panels across the far boards' straight run). Nothing here is a real sponsor:
// the arena, the club, the playoffs or the Final.
function boardPanels({ home, sw, final, playoff, yr, arenaName }) {
  const dark = sw.h.body, ink = luminance(dark) > 0.35 ? sw.h.number : "#ffffff";
  const light = "#f7f9fb", text = luminance(dark) > 0.35 ? sw.h.number : dark;
  const name = (home.name || home.abbr || "").toUpperCase();
  if (final) {
    const navy = "#0b1430";
    const cup = { cup: true, t: yr ? String(yr) : "FINAL", bg: light, fg: navy };
    const scf = { t: "STANLEY CUP FINAL", bg: navy, fg: GOLD };
    return [scf, cup, scf, cup, scf, cup];
  }
  const logo = { logo: home.abbr, t: name, bg: light, fg: text };
  const arena = { t: (arenaName || home.city || "").toUpperCase(), bg: dark, fg: ink };
  if (playoff) {
    const po = { t: "STANLEY CUP PLAYOFFS", bg: "#0b1430", fg: "#f1f5f9" };
    return [arena, logo, po, { t: `GO ${name} GO`, bg: dark, fg: ink }, logo, po];
  }
  return [arena, logo, { t: `GO ${name} GO`, bg: dark, fg: ink }, { t: "RINK GM", bg: light, fg: "#0b1430" }, logo, { t: (home.city || name).toUpperCase(), bg: dark, fg: ink }];
}
function Boards({ panels }) {
  const x0 = 28, pw = 24, y = -4.65, h = 3.55, cy = y + h / 2;
  return panels.map((p, i) => {
    const x = x0 + i * pw + 0.2, w = pw - 0.4, cx = x + w / 2;
    const fs = 2.3, room = p.logo || p.cup ? w - 9 : w - 2, long = (p.t || "").length * fs * 0.77 > room;
    const label = p.t && <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={fs} fontWeight="800" letterSpacing=".15" fill={p.fg} textLength={long ? room : undefined} lengthAdjust="spacingAndGlyphs">{p.t}</text>;
    return (
      <g key={i}>
        <rect x={x} y={y} width={w} height={h} rx=".3" fill={p.bg} />
        {p.logo && teamLogoUrl(p.logo) && [x + 1.2, x + w - 4.2].map((lx) => <image key={lx} href={teamLogoUrl(p.logo)} x={lx} y={y + 0.3} width="3" height={h - 0.6} />)}
        {p.cup && trophyUrl("stanley") && [x + 1.6, x + w - 3.6].map((lx) => <image key={lx} href={trophyUrl("stanley")} x={lx} y={y + 0.2} width="2" height={h - 0.4} />)}
        {label}
      </g>
    );
  });
}

// A club's name painted across the ice behind a net, reading up the boards (left) or down (right).
function Wordmark({ team, sw, side }) {
  const x = side < 0 ? 3.9 : 196.1, name = (team.name || team.abbr || "").toUpperCase();
  const fs = name.length > 9 ? 3.5 : 4.1, room = 23, long = name.length * fs * 0.78 > room;
  const pale = luminance(sw.body) > 0.35;
  return (
    <text x={x} y="42.5" transform={`rotate(${side < 0 ? -90 : 90} ${x} 42.5)`} textAnchor="middle" dominantBaseline="central" fontSize={fs} fontWeight="800" fontStyle="italic" letterSpacing=".3"
      fill={sw.white ? sw.number : sw.body} stroke={pale ? sw.number : "#ffffff"} strokeWidth=".5" paintOrder="stroke" strokeLinejoin="round" opacity=".9"
      textLength={long ? room : undefined} lengthAdjust="spacingAndGlyphs">{name}</text>
  );
}

function Surface({ id, home, away, sw, final, playoff, yr, arenaName, wordmarks }) {
  const u = (k) => `url(#${id}${k})`;
  const homeLogo = teamLogoUrl(home.abbr), awayLogo = teamLogoUrl(away.abbr), cup = trophyUrl("stanley");
  const trim = final ? u("gold") : KICK_YELLOW;
  const panels = boardPanels({ home, sw, final, playoff, yr, arenaName });
  const crowdTint = sw.h.body;
  const goalY = Math.round((28 - Math.sqrt(28 ** 2 - 17 ** 2)) * 100) / 100;
  return (
    <svg className="lr-ice" viewBox={VIEWBOX} role="img" aria-label={`${home.city} ${home.name} home ice${final ? ", dressed for the Stanley Cup Final" : ""}${arenaName ? `, ${arenaName}` : ""}`}>
      <defs>
        <clipPath id={`${id}iceclip`}><path d={ICE} /></clipPath>
        <clipPath id={`${id}glassclip`}><path d={GLASS} /></clipPath>
        <linearGradient id={`${id}ice`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ccd7e2" /><stop offset=".12" stopColor="#dde6ee" /><stop offset=".55" stopColor="#ebf1f6" /><stop offset="1" stopColor="#e1e8ef" />
        </linearGradient>
        <radialGradient id={`${id}pool`} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#ffffff" stopOpacity=".7" /><stop offset="1" stopColor="#ffffff" stopOpacity="0" /></radialGradient>
        <linearGradient id={`${id}shadow`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0a1a30" stopOpacity=".3" /><stop offset="1" stopColor="#0a1a30" stopOpacity="0" /></linearGradient>
        <linearGradient id={`${id}sheen`} x1="0" y1="0" x2="1" y2=".55">
          <stop offset=".3" stopColor="#fff" stopOpacity="0" /><stop offset=".42" stopColor="#fff" stopOpacity=".22" /><stop offset=".5" stopColor="#fff" stopOpacity="0" />
          <stop offset=".62" stopColor="#fff" stopOpacity="0" /><stop offset=".68" stopColor="#fff" stopOpacity=".12" /><stop offset=".74" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}face`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f6f8fa" /><stop offset="1" stopColor="#d8dee6" /></linearGradient>
        <linearGradient id={`${id}glass`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#bfe1ff" stopOpacity=".2" /><stop offset=".5" stopColor="#bfe1ff" stopOpacity=".08" /><stop offset="1" stopColor="#bfe1ff" stopOpacity=".18" /></linearGradient>
        <radialGradient id={`${id}arena`} cx=".5" cy=".55" r=".62"><stop offset=".55" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".55" /></radialGradient>
        <linearGradient id={`${id}gold`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff1b8" /><stop offset=".35" stopColor="#e8c45a" /><stop offset=".65" stopColor="#a8822a" /><stop offset="1" stopColor="#f5d77a" /></linearGradient>
        <radialGradient id={`${id}medal`} cx=".5" cy=".4" r=".65"><stop offset="0" stopColor="#1e2a44" /><stop offset="1" stopColor="#070b16" /></radialGradient>
        <pattern id={`${id}crowd`} width="2.6" height="2.2" patternUnits="userSpaceOnUse">
          <rect width="2.6" height="2.2" fill="#0b101b" />
          <circle cx=".6" cy=".55" r=".46" fill="#2a3346" /><circle cx="1.9" cy=".95" r=".46" fill={crowdTint} opacity=".55" /><circle cx="1.15" cy="1.75" r=".46" fill="#3a4458" />
        </pattern>
        <pattern id={`${id}crowd2`} width="3.7" height="2.9" patternUnits="userSpaceOnUse">
          <circle cx="2.4" cy="1.5" r=".42" fill="#c9cfd8" opacity=".22" /><circle cx=".7" cy="2.4" r=".42" fill={crowdTint} opacity=".35" />
        </pattern>
        <pattern id={`${id}mesh`} width=".7" height=".7" patternUnits="userSpaceOnUse">
          <rect width=".7" height=".7" fill="#f2f5f8" /><path d="M0 0L.7 .7M.7 0L0 .7" stroke="#8d99a8" strokeWidth=".07" />
        </pattern>
        {/* the ice's grain: fine streaks along the length, the way skates leave it */}
        <filter id={`${id}grain`} x="0" y="0" width="200" height="85" filterUnits="userSpaceOnUse">
          <feTurbulence type="fractalNoise" baseFrequency=".3 1.5" numOctaves="2" seed="11" />
          <feColorMatrix type="matrix" values="0 0 0 0 .45  0 0 0 0 .55  0 0 0 0 .68  0 0 0 1.5 -.62" />
        </filter>
        {/* painted under the ice: a thin white border around each logo */}
        <filter id={`${id}paint`} x="-10%" y="-10%" width="120%" height="120%">
          <feMorphology in="SourceAlpha" operator="dilate" radius=".45" result="d" />
          <feFlood floodColor="#fff" result="w" /><feComposite in="w" in2="d" operator="in" result="edge" />
          <feMerge><feMergeNode in="edge" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <path id={`${id}arcTop`} d="M89.8 42.5A10.2 10.2 0 0 1 110.2 42.5" />
        <path id={`${id}arcBot`} d="M88.3 42.5A11.7 11.7 0 0 0 111.7 42.5" />
      </defs>

      {/* the building: the crowd beyond the glass, darker away from the lights */}
      <rect x={VB.x} y={VB.y} width={VB.w} height={VB.h} fill={u("crowd")} />
      <rect x={VB.x} y={VB.y} width={VB.w} height={VB.h} fill={u("crowd2")} />
      <rect x={VB.x} y={VB.y} width={VB.w} height={VB.h} fill={u("arena")} />
      {/* the glass, its stanchions and the light on it */}
      <path d={GLASS} fill={u("glass")} />
      <g clipPath={u("glassclip")}>
        {[34, 41, 96, 104, 150, 158].map((x, i) => <path key={i} d={`M${x} -11h${i % 2 ? 1.6 : 3}l-2.4 6h-${i % 2 ? 1.6 : 3}z`} fill="#fff" opacity={i % 2 ? 0.05 : 0.08} />)}
      </g>
      <g stroke="#dce8f4" strokeOpacity=".35" strokeWidth=".25">
        {[...Array(13)].map((_, i) => <line key={i} x1={28 + i * 12} y1="-11" x2={28 + i * 12} y2="-5" />)}
        {[...Array(13)].map((_, i) => <line key={`b${i}`} x1={28 + i * 12} y1="86.3" x2={28 + i * 12} y2="89.5" />)}
        {[30, 42.5, 55].flatMap((y) => [<line key={`l${y}`} x1="-4.5" y1={y} x2="-1.3" y2={y} />, <line key={`r${y}`} x1="201.3" y1={y} x2="204.5" y2={y} />])}
      </g>
      <path d={GLASS} fill="none" stroke="#e6f3ff" strokeOpacity=".45" strokeWidth=".3" />
      {/* the goal lights on the glass behind each net */}
      {[-3.9, 202.3].map((x) => <rect key={x} x={x} y="41.6" width="1.6" height="1.8" rx=".35" fill="#4a1414" stroke="#000" strokeWidth=".12" />)}
      {/* the boards: the top cap all round, the far boards' face with its ads, the kick plate */}
      <path d={CAP} fill="#cfd6df" stroke="#7a8696" strokeWidth=".3" />
      <path d={FACE} fill={u("face")} stroke={final ? u("gold") : "#566173"} strokeWidth=".55" />
      <Boards panels={panels} />
      <path d={KICK} fill={trim} />
      {/* the ice */}
      <path d={ICE} fill={u("ice")} />
      <g clipPath={u("iceclip")}>
        {/* painted under the ice: wordmarks behind the nets, the Final's club logos in their own ends */}
        {final ? <>
          <Wordmark team={home} sw={sw.h} side={-1} />
          <Wordmark team={away} sw={sw.a} side={1} />
          {homeLogo && <image href={homeLogo} x="48" y="33.5" width="18" height="18" opacity=".88" filter={u("paint")} />}
          {awayLogo && <image href={awayLogo} x="134" y="33.5" width="18" height="18" opacity=".88" filter={u("paint")} />}
        </> : wordmarks && <>
          <Wordmark team={home} sw={sw.h} side={-1} />
          <Wordmark team={home} sw={sw.h} side={1} />
        </>}
        {/* the far boards' ads reflected in the ice */}
        <g opacity=".11" transform="scale(1 -1)"><Boards panels={panels} /></g>
        {/* the lines: goal lines, trapezoids, creases, blue lines, the centre red line, circles and dots */}
        <g opacity=".92">
          <path d={`M11 ${goalY}V${85 - goalY}M189 ${goalY}V${85 - goalY}`} stroke={RED} strokeWidth=".35" />
          <path d="M11 31.5L0 28.5M11 53.5L0 56.5M189 31.5L200 28.5M189 53.5L200 56.5" stroke={RED} strokeWidth=".3" />
          <path d="M11 38.5H15.5A6 6 0 0 1 15.5 46.5H11ZM189 38.5H184.5A6 6 0 0 0 184.5 46.5H189Z" fill="#7cc0f0" fillOpacity=".62" stroke={RED} strokeWidth=".3" />
          <rect x="74.5" y="0" width="1" height="85" fill={BLUE} />
          <rect x="124.5" y="0" width="1" height="85" fill={BLUE} />
          <rect x="99.5" y="0" width="1" height="85" fill={RED} />
          <line x1="100" y1="0" x2="100" y2="85" stroke="#fff" strokeWidth=".26" strokeDasharray="1.2 1.6" opacity=".9" />
          <circle cx="100" cy="42.5" r="15" fill="none" stroke={BLUE} strokeWidth=".35" />
          <path d="M90 85A10 10 0 0 1 110 85" fill="none" stroke={RED} strokeWidth=".3" />
          {[[31, 20.5], [31, 64.5], [169, 20.5], [169, 64.5]].map(([x, y]) => <EndCircle key={`${x}${y}`} cx={x} cy={y} />)}
          {[[80, 20.5], [80, 64.5], [120, 20.5], [120, 64.5]].map(([x, y]) => <Dot key={`${x}${y}`} cx={x} cy={y} />)}
        </g>
        {/* centre ice: the home club's logo, or the Final's medallion with the Cup */}
        {final ? <g>
          <circle cx="100" cy="42.8" r="14.1" fill="#000" opacity=".16" />
          <circle cx="100" cy="42.5" r="13.5" fill={u("medal")} stroke={u("gold")} strokeWidth="1.1" />
          <circle cx="100" cy="42.5" r="9.5" fill="none" stroke={u("gold")} strokeWidth=".3" strokeOpacity=".85" />
          <text fill={u("gold")} fontSize="2.15" fontWeight="800" letterSpacing=".32"><textPath href={`#${id}arcTop`} startOffset="50%" textAnchor="middle">STANLEY CUP FINAL</textPath></text>
          {yr && <text fill="#fde68a" fontSize="2.1" fontWeight="800" letterSpacing=".5"><textPath href={`#${id}arcBot`} startOffset="50%" textAnchor="middle">{String(yr)}</textPath></text>}
          {[88.6, 111.4].map((x) => <circle key={x} cx={x} cy="42.5" r=".38" fill={u("gold")} />)}
          {cup && <image href={cup} x="95.2" y="34.8" width="9.6" height="15.4" preserveAspectRatio="xMidYMid meet" />}
        </g> : homeLogo && <image href={homeLogo} x="88" y="30.5" width="24" height="24" opacity=".95" filter={u("paint")} />}
        {!final && <circle cx="100" cy="42.5" r=".55" fill={BLUE} />}
        {/* the surface: grain, skate marks, snow along the boards, the boards' shadow, the lights */}
        <rect x="0" y="0" width="200" height="85" filter={u("grain")} opacity=".55" />
        <g fill="none" strokeLinecap="round">{SCUFFS.map((c, i) => <path key={i} d={c.d} stroke={c.white ? "#ffffff" : "#8299b0"} strokeWidth={c.w} opacity={c.o} />)}</g>
        <path d={ICE} fill="none" stroke="#fff" strokeOpacity=".22" strokeWidth="7" />
        <path d={ICE} fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="2.4" />
        <rect x="0" y="0" width="200" height="7" fill={u("shadow")} />
        {[[100, 42.5, 62, 40], [36, 42.5, 40, 34], [164, 42.5, 40, 34]].map(([cx, cy, rx, ry]) => <ellipse key={cx} cx={cx} cy={cy} rx={rx} ry={ry} fill={u("pool")} opacity=".45" />)}
        <rect x="0" y="0" width="200" height="85" fill={u("sheen")} />
      </g>
      <path d={ICE} fill="none" stroke={trim} strokeWidth=".4" />
      <Net id={id} />
      <g transform="matrix(-1 0 0 1 200 0)"><Net id={id} /></g>
    </svg>
  );
}

// ---- The players (redrawn every frame) ----

const SWEATER = "M-1.3 -2.4L1.3 -2.4L3 -1.2L2 .3L1.3 -.1L1.5 2.2L-1.5 2.2L-1.3 -.1L-2 .3L-3 -1.2Z";
// The stripes on a sweater, by the club's uniform style (engine/uniforms.js UNIFORM_STYLES).
function Stripes({ sw, style }) {
  const t = sw.trim;
  return (
    <>
      {style === 1 && <path d="M-3 -1.2L-1.3 -2.4L1.3 -2.4L3 -1.2L2.75 -.85Q0 -2 -2.75 -.85Z" fill={t} />}
      {style === 2 && <rect x="-3" y="-1.75" width="6" height=".45" fill={t} />}
      {style !== 1 && <path d="M-2.55 -1.5L-1.55 0M2.55 -1.5L1.55 0" stroke={t} strokeWidth=".38" />}
      {style === 3 ? <><rect x="-3" y=".75" width="6" height=".3" fill={t} /><rect x="-3" y="1.45" width="6" height=".3" fill={t} /></> : <rect x="-3" y="1.2" width="6" height=".42" fill={t} />}
      <path d="M-.75 -2.4L0 -1.75L.75 -2.4" fill="none" stroke={t} strokeWidth=".3" />
    </>
  );
}
function SkaterArt({ id, sw, style }) {
  return (
    <g className="lr-art">
      <ellipse cx=".5" cy="2.75" rx="3.1" ry=".95" fill="#0a1626" opacity=".24" />
      <path d="M1.8 1L3.6 3.1L4.7 3.1" stroke="#1b1f27" strokeWidth=".4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.75 3.1L4.7 3.1" stroke="#f1f5f9" strokeWidth=".4" strokeLinecap="round" />
      <path d={SWEATER} fill={sw.body} />
      <g clipPath={`url(#${id}sw)`}><Stripes sw={sw} style={style} /></g>
      <path d={SWEATER} fill="none" stroke={sw.ring} strokeWidth=".36" strokeLinejoin="round" />
      <text className="lr-num" textAnchor="middle" y=".85" fontSize="2" fontWeight="900" fill={sw.number} stroke={sw.edge} strokeWidth=".32" paintOrder="stroke" />
    </g>
  );
}
function GoalieArt({ id, sw, style, number }) {
  const pad = sw.white ? "#f8fafc" : "#f1f4f7";
  return (
    <g className="lr-art">
      <ellipse cx=".4" cy="3.6" rx="3.8" ry="1.15" fill="#0a1626" opacity=".26" />
      <rect x="-2.55" y=".5" width="2.3" height="3.5" rx=".85" fill={pad} stroke={sw.ring} strokeWidth=".3" />
      <rect x=".25" y=".5" width="2.3" height="3.5" rx=".85" fill={pad} stroke={sw.ring} strokeWidth=".3" />
      <path d="M-2.55 2.6h2.3M.25 2.6h2.3" stroke={sw.white ? sw.trim : sw.body} strokeWidth=".4" />
      <rect x="-4.3" y="-1.7" width="1.5" height="2.1" rx=".35" fill={sw.body} stroke={sw.ring} strokeWidth=".28" />
      <circle cx="3.55" cy="-.75" r="1.1" fill={sw.body} stroke={sw.ring} strokeWidth=".28" />
      <g transform="scale(1.12)">
        <path d={SWEATER} fill={sw.body} />
        <g clipPath={`url(#${id}sw)`}><Stripes sw={sw} style={style} /></g>
        <path d={SWEATER} fill="none" stroke={sw.ring} strokeWidth=".34" strokeLinejoin="round" />
      </g>
      <circle cx="0" cy="-2.95" r=".95" fill="#e9eef3" stroke={sw.ring} strokeWidth=".3" />
      <path d="M-.55 -3.05h1.1M-.55 -2.7h1.1" stroke="#5b6675" strokeWidth=".14" />
      {number != null && <text textAnchor="middle" y="1" fontSize="1.9" fontWeight="900" fill={sw.number} stroke={sw.edge} strokeWidth=".3" paintOrder="stroke">{number}</text>}
    </g>
  );
}

export default function Rink({ s, home, away, stepInfo, clockRef, banner, final = false, variant, arena, year, wordmarks = true }) {
  const id = "lr" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const colorsKey = (t) => `${t.abbr}:${(t.colors || []).join(",")}:${t.uniform?.style ?? ""}:${t.name}:${t.city}`;
  const hk = colorsKey(home), ak = colorsKey(away);
  const sw = useMemo(() => liveSweaters(home, away), [hk, ak]); // eslint-disable-line react-hooks/exhaustive-deps
  const season = Number.isFinite(year) ? year : s.year;
  const yr = Number.isFinite(season) ? season + 1 : null;
  const arenaName = arena || arenaFor(home)?.name || null;
  const surface = useMemo(
    () => <Surface id={id} home={home} away={away} sw={sw} final={final} playoff={!!s.playoff} yr={yr} arenaName={arenaName} wordmarks={wordmarks} />,
    [id, hk, ak, sw, final, s.playoff, yr, arenaName, wordmarks] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const els = useRef({ h: [], a: [], gh: null, ga: null, puck: null });
  const pos = useRef(null);

  useEffect(() => {
    let raf;
    let last = performance.now();
    // Only touch the DOM when something moved: a settled rink costs nothing to keep on screen.
    const set = (el, p) => {
      if (!el) return;
      const tr = `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`;
      if (el.__lrTr !== tr) { el.setAttribute("transform", tr); el.__lrTr = tr; }
      const op = p.on === false ? "0" : "1";
      if (el.__lrOp !== op) { el.style.opacity = op; el.__lrOp = op; }
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
      for (const side of ["h", "a"]) {
        P[side].forEach((p, i) => set(E[side][i], s.phase === "so" ? { ...p, on: false } : p));
        const ids = skatersForDisplay(s, side);
        const roles = rolesOn(ids.length);
        for (let i = 0; i < 6; i++) {
          const pid = ids[roles.indexOf(i)];
          const label = E[side][i]?.querySelector("text");
          const txt = pid ? String(s[side].pl[pid]?.number || "") : "";
          if (label && label.textContent !== txt) label.textContent = txt;
        }
      }
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

  // A goal lights the lamp behind the net it went in.
  const goalEv = banner?.kind === "goal" ? [...s.events].reverse().find((e) => e.t === "goal") : null;
  const netRight = goalEv && (Number.isFinite(goalEv.x) ? goalEv.x >= 100 : (goalEv.side === "h") === (s.period % 2 === 1));
  const lampX = goalEv ? (netRight ? 203.1 : -3.1) : null;
  const style = (t) => t.uniform?.style ?? 0;
  const goalieNo = (k) => { const g = s[k].goalie; return g ? s[k].pl[g]?.number ?? null : null; };
  const skater = (k, i) => (
    <g key={k + i} ref={(el) => (els.current[k][i] = el)} className="sk">
      <SkaterArt id={id} sw={sw[k]} style={style(k === "h" ? home : away)} />
    </g>
  );
  return (
    <div className={`rinkwrap lr${final ? " final" : ""}${variant === "tv" ? " lr-tv" : ""}`}>
      <div className="lr-stage">
        {surface}
        <svg className="lr-play" viewBox={VIEWBOX} aria-hidden="true">
          <defs>
            <clipPath id={`${id}sw`}><path d={SWEATER} /></clipPath>
            <radialGradient id={`${id}lamp`} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#ff3b2f" stopOpacity=".75" /><stop offset=".35" stopColor="#ff2a1a" stopOpacity=".32" /><stop offset="1" stopColor="#ff2a1a" stopOpacity="0" /></radialGradient>
          </defs>
          {lampX != null && (
            <g className="lr-goallight" key={banner.n}>
              <circle cx={lampX} cy="42.5" r="15" fill={`url(#${id}lamp)`} />
              <rect x={lampX - 0.8} y="41.6" width="1.6" height="1.8" rx=".35" fill="#ff4b3a" />
            </g>
          )}
          <g ref={(el) => (els.current.gh = el)} className="sk"><GoalieArt id={id} sw={sw.h} style={style(home)} number={goalieNo("h")} /></g>
          <g ref={(el) => (els.current.ga = el)} className="sk"><GoalieArt id={id} sw={sw.a} style={style(away)} number={goalieNo("a")} /></g>
          {[0, 1, 2, 3, 4, 5].map((i) => skater("a", i))}
          {[0, 1, 2, 3, 4, 5].map((i) => skater("h", i))}
          <g ref={(el) => (els.current.puck = el)}>
            <ellipse cx=".3" cy=".55" rx="1.25" ry=".7" fill="#0a1626" opacity=".3" />
            <circle r="1.05" fill="#0d0f13" stroke="#454b55" strokeWidth=".18" />
            <ellipse cx="-.3" cy="-.35" rx=".45" ry=".24" fill="#fff" opacity=".2" />
          </g>
        </svg>
      </div>
      {banner && (
        <div className={`rinkbanner ${banner.kind}`} style={{ "--bc": banner.color || "var(--accent2)" }} key={banner.n}>
          <div className="rb-k">{banner.title}</div>
          {banner.sub && <div className="rb-s">{banner.sub}</div>}
        </div>
      )}
    </div>
  );
}
