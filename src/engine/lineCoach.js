// The Lineup screen's coach: "the best change right now". Looks at every single move a coach could
// make with the lines as they stand (swap two forwards, swap two D, dress a healthy scratch, or on
// special teams swap two unit players or put a dressed skater on a unit) and scores each with the
// same value the chemistry autofill uses: each line's average slot rating plus four rating points
// per chemistry point, weighted by how much that line plays. Best first. Pure; no React.
import { chemistry, ARCH_LEGEND, ARCH_ABBR } from "./chemistry.js";
import { slotRating } from "./roles.js";
import { isDefense, isForward, isGoalie } from "./constants.js";
import { healthy, syncLines, lineupIds, dressedSkaters } from "./lines.js";

const CHEM_W = 4; // same as autofillByChemistry: one chemistry point is worth about four rating points
const W = { F: [0.36, 0.3, 0.21, 0.13], D: [0.42, 0.34, 0.24], PP: [0.62, 0.38], PK: [0.6, 0.4] };
const POS = { F: ["LW", "C", "RW"], D: ["LD", "RD"] };
const MIN_GAIN = 0.12;

export const unitName = (g, i) => (g === "F" ? `Line ${i + 1}` : g === "D" ? `Pair ${i + 1}` : `${g}${i + 1}`);
const surname = (p) => { const w = String(p?.name || "").trim().split(/\s+/); return w.length > 1 ? w.slice(1).join(" ") : w[0] || ""; };

function unitValue(lg, t, g, ids) {
  const ps = ids.map((id) => lg.players[id]);
  const rate = ps.reduce((s, p, j) => s + (p ? (g === "F" || g === "D" ? slotRating(p, POS[g][j]) : p.ovr) : 40), 0) / Math.max(1, ids.length);
  const c = chemistry(lg, t, ids.filter(Boolean), g);
  return { v: rate + CHEM_W * c.pts, c };
}

// The moves for one strength: "es" (forwards and D) or "pp" / "pk".
function candidates(lg, t, mode) {
  const L = t.lines, P = (id) => lg.players[id];
  const out = (id) => { const p = P(id); return !p || p.injury > 0 || !!p.ltir; };
  const moves = [];
  if (mode === "es") {
    const scr = healthy(lg, t).filter((p) => !new Set(lineupIds(L)).has(p.id) && !isGoalie(p.pos));
    for (const g of ["F", "D"]) {
      const cells = [];
      L[g].forEach((r, i) => r.forEach((id, j) => { if (id && !out(id)) cells.push({ g, i, j }); }));
      for (let a = 0; a < cells.length; a++) for (let b = a + 1; b < cells.length; b++) moves.push({ kind: "swap", a: cells[a], b: cells[b] });
      const fits = g === "F" ? (p) => isForward(p.pos) : (p) => isDefense(p.pos);
      for (const p of scr.filter(fits)) for (const c of cells) moves.push({ kind: "dress", a: c, inId: p.id });
    }
  } else {
    const g = mode.toUpperCase();
    const units = L[g] || [];
    const on = new Set(units.flat());
    const cells = [];
    units.forEach((u, i) => u.forEach((id, j) => { if (id && !out(id)) cells.push({ g, i, j }); }));
    const d = (c) => isDefense(P(L[g][c.i][c.j])?.pos);
    for (let a = 0; a < cells.length; a++) for (let b = a + 1; b < cells.length; b++) if (cells[a].i !== cells[b].i && d(cells[a]) === d(cells[b])) moves.push({ kind: "swap", a: cells[a], b: cells[b] });
    const bench = dressedSkaters(lg, L.F, L.D).filter((p) => !on.has(p.id) && p.injury <= 0 && !p.ltir);
    for (const p of bench) for (const c of cells) if (isDefense(p.pos) === d(c)) moves.push({ kind: "dress", a: c, inId: p.id });
  }
  return moves;
}

// Apply a move to a copy of the affected rows; returns { [g+i]: newIds }.
function after(L, m) {
  const rows = {};
  const row = (c) => { const k = c.g + c.i; if (!rows[k]) rows[k] = { g: c.g, i: c.i, ids: [...L[c.g][c.i]] }; return rows[k]; };
  if (m.kind === "swap") { const ra = row(m.a), rb = row(m.b); const x = ra.ids[m.a.j], y = rb.ids[m.b.j]; ra.ids[m.a.j] = y; rb.ids[m.b.j] = x; }
  else row(m.a).ids[m.a.j] = m.inId;
  return Object.values(rows);
}

const lc = (s) => (s && !/^[A-Z][\w-]*'s /.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const ARCH_PLURAL = { SNP: "snipers", PLY: "playmakers", PWF: "power forwards", "2WY": "two-way forwards", GRN: "grinders", ENF: "enforcers" };
// A reason as a short phrase for the sentence ("gives Line 2 ___" / "breaks up Line 3's ___").
export function phrase(text) {
  const m = /^Three of the same type \((.+)\)$/.exec(text);
  if (m) return `three ${ARCH_PLURAL[m[1]] || `${m[1]}s`}`;
  const map = [
    [/^Three different styles/, "three different styles"], [/^Playmaker feeding/, "a playmaker feeding a finisher"], [/^Responsible/, "a responsible checking core"],
    [/^Mix of left and right/, "a mix of left and right shots"], [/^Puck-mover paired/, "a puck-mover with a shutdown partner"], [/^Two-way D balances/, "a two-way D for balance"],
    [/^Left and right shot/, "a left and right shot"], [/^Countrymen/, "countrymen together"], [/^Quarterback and a shooter/, "a quarterback and a shooter"],
    [/^Offensive D running/, "an offensive D on the point"], [/^Defensive specialists/, "defensive specialists"], [/(structure|system) suits|system likes/, "a better fit for the coach's system"],
    [/^No playmaker/, "missing playmaker"], [/^Two puck-movers/, "two puck-movers"], [/^Two stay-at-home/, "two stay-at-home D"], [/^Both shoot the same way/, "same-side shooting"],
    [/^Too many checkers/, "surplus of checkers"], [/^Few defensive specialists/, "shortage of defensive specialists"], [/weeks? together$/, lc(text)],
  ];
  for (const [re, s] of map) if (re.test(text)) return s;
  return lc(text);
}

// Turn a scored move into what the panel shows.
function describe(lg, t, m, units, gain) {
  const L = t.lines, P = (id) => lg.players[id];
  const idAt = (c) => L[c.g][c.i][c.j];
  const outP = P(idAt(m.a)), inP = m.kind === "swap" ? P(idAt(m.b)) : P(m.inId);
  const g = m.a.g, st = g === "PP" || g === "PK";
  const title = m.kind === "swap" ? `Swap ${surname(outP)} and ${surname(inP)}` : st ? `Put ${surname(inP)} on ${unitName(g, m.a.i)} for ${surname(outP)}` : `Dress ${surname(inP)} for ${surname(outP)}`;
  // Which player joins which unit.
  const joins = (u) => {
    if (m.kind === "dress") return u.i === m.a.i ? inP : null;
    if (m.a.i === m.b.i) return null;
    return u.i === m.a.i ? inP : outP;
  };
  const bits = [];
  for (const u of units) {
    const who = joins(u);
    const before = new Set(u.before.reasons.map((r) => r.text)), aft = new Set(u.after.reasons.map((r) => r.text));
    const gained = u.after.reasons.filter((r) => r.v > 0 && !before.has(r.text)).sort((a, b) => b.v - a.v)[0];
    const fixed = u.before.reasons.filter((r) => r.v < 0 && !aft.has(r.text)).sort((a, b) => a.v - b.v)[0];
    u.gains = u.after.reasons.filter((r) => !before.has(r.text)).map((r) => lc(r.text));
    u.loses = u.before.reasons.filter((r) => !aft.has(r.text)).map((r) => lc(r.text));
    if (!who) continue;
    if (gained) bits.push(`${surname(who)} gives ${u.name} ${phrase(gained.text)}`);
    else if (fixed) bits.push(`${surname(who)} ${/^(Three|Two) /.test(fixed.text) ? "breaks up" : "fixes"} ${u.name}'s ${phrase(fixed.text)}`);
  }
  const up = units.filter((u) => u.after.score > u.before.score), down = units.filter((u) => u.after.score < u.before.score);
  const word = g === "D" ? "pairs" : st ? "units" : "lines";
  let head;
  if (units.length > 1 && up.length === units.length) head = `Both ${word} get better.`;
  else if (up.length && down.length) head = `${up[0].name} gets better and ${down[0].name} gives a little back.`;
  else if (up.length) head = `${up[0].name} gets better.`;
  else head = "Better players where the minutes are.";
  // Rating change where it counts most: the busier unit's slot (or both slots on one line).
  const POSWORD = { LW: "left wing", C: "centre", RW: "right wing", LD: "left D", RD: "right D" };
  let tail = "";
  if (!st) {
    const at = (p, c) => (p ? slotRating(p, posOf(c)) : 0);
    let R, c;
    if (m.kind === "dress") { c = m.a; R = at(inP, c) - at(outP, c); }
    else if (m.a.i === m.b.i) { c = null; R = at(inP, m.a) + at(outP, m.b) - at(outP, m.a) - at(inP, m.b); }
    else { c = m.a.i < m.b.i ? m.a : m.b; const newP = c === m.a ? inP : outP, oldP = c === m.a ? outP : inP; R = at(newP, c) - at(oldP, c); }
    const n = Math.abs(R), pts = `${n === 1 ? "one" : n} rating point${n === 1 ? "" : "s"}`, spot = c ? ` at ${POSWORD[posOf(c)]}${units.length > 1 ? ` on ${unitName(c.g, c.i)}` : ""}` : "";
    if (R < 0) tail = ` You give up ${pts}${spot}.`;
    else if (R > 0) tail = ` You also gain ${pts}${spot}.`;
  }
  const why = `${head}${bits.length ? ` ${bits.join(", and ")}.` : ""}${tail}`;
  const chem = units.reduce((s, u) => s + u.after.score - u.before.score, 0);
  return { ...m, title, why, units, gain: Math.round(gain * 100) / 100, chem, ids: [idAt(m.a), m.kind === "swap" ? idAt(m.b) : m.inId] };
}
const posOf = (c) => (c && POS[c.g] ? POS[c.g][c.j] : null);
// Ideas for a strength ("es", "pp", "pk" or "st" for both special teams), best first.
export function coachIdeas(lg, t, mode = "es", limit = 8) {
  if (!t.lines) syncLines(lg, t);
  const L = t.lines;
  const modes = mode === "st" ? ["pp", "pk"] : [mode];
  const base = {};
  const val = (g, i, ids) => unitValue(lg, t, g, ids);
  const scored = [];
  for (const md of modes) for (const m of candidates(lg, t, md)) {
    const rows = after(L, m);
    let gain = 0;
    const units = rows.map((r) => {
      const k = r.g + r.i;
      if (!base[k]) base[k] = val(r.g, r.i, L[r.g][r.i]);
      const now = val(r.g, r.i, r.ids);
      gain += (W[r.g][r.i] || 0.1) * (now.v - base[k].v);
      return { g: r.g, i: r.i, name: unitName(r.g, r.i), ids: r.ids, before: base[k].c, after: now.c };
    });
    if (gain > MIN_GAIN) scored.push({ m, units, gain });
  }
  scored.sort((a, b) => b.gain - a.gain);
  // One idea per player pair; skip near-duplicates that move the same player again.
  const seen = new Set(), outList = [];
  for (const s of scored) {
    const ids = s.m.kind === "swap" ? [L[s.m.a.g][s.m.a.i][s.m.a.j], L[s.m.b.g][s.m.b.i][s.m.b.j]] : [L[s.m.a.g][s.m.a.i][s.m.a.j], s.m.inId];
    const key = s.m.a.g + ids.slice().sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    outList.push(describe(lg, t, s.m, s.units, s.gain));
    if (outList.length >= limit) break;
  }
  return outList;
}

// Make the move on the club's lines.
export function applyIdea(lg, t, idea) {
  const L = t.lines;
  const { a, b } = idea;
  if (idea.kind === "swap") { const x = L[a.g][a.i][a.j], y = L[b.g][b.i][b.j]; L[a.g][a.i][a.j] = y; L[b.g][b.i][b.j] = x; }
  else L[a.g][a.i][a.j] = idea.inId;
  syncLines(lg, t);
  return L;
}

export { ARCH_LEGEND, ARCH_ABBR };

// How far the lines are from the best the coach can find: follow his best idea, again and again,
// until no move helps (the same greedy run as tapping "Make the swap" each time). Works on a copy
// of the lines; the club's lines are untouched. `moves` is the count of changes, `gain` the total
// value gained in the coach's units (a line's average slot rating plus four per chemistry point,
// weighted by ice time, so about one rating point on an average line), `points` that gain rounded
// for the screen, `chem` the total chemistry-score change across the units touched.
export function lineupGap(lg, t, mode = "es", maxMoves = 40) {
  if (!t.lines) syncLines(lg, t);
  const orig = t.lines;
  const L = JSON.parse(JSON.stringify(orig));
  const steps = [];
  t.lines = L;
  try {
    while (steps.length < maxMoves) {
      const i = coachIdeas(lg, t, mode, 1)[0];
      if (!i) break;
      const { a, b } = i;
      if (i.kind === "swap") { const x = L[a.g][a.i][a.j]; L[a.g][a.i][a.j] = L[b.g][b.i][b.j]; L[b.g][b.i][b.j] = x; }
      else L[a.g][a.i][a.j] = i.inId;
      steps.push({ title: i.title, gain: i.gain, chem: i.chem });
    }
  } finally { t.lines = orig; }
  const gain = Math.round(steps.reduce((s, x) => s + x.gain, 0) * 100) / 100;
  return { moves: steps.length, gain, points: Math.round(gain), chem: steps.reduce((s, x) => s + x.chem, 0), steps, best: L };
}

// The one calm line the closed coach panel shows.
export function gapSummary(gap, word = "lineup") {
  if (!gap || !gap.moves) return `Your ${word} ${/s$/.test(word) ? "are" : "is"} set`;
  const n = gap.moves, p = gap.points;
  const short = p >= 1 ? `${p} point${p === 1 ? "" : "s"} short of your best` : "less than a point short of your best";
  return `${n} change${n === 1 ? "" : "s"} could improve your ${word} · ${short}`;
}
