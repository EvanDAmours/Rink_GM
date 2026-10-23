// Line chemistry: how well a forward line, a defence pair or a special-teams unit fits together.
// Kept small and readable. Each factor adds or takes away "points" (about -1 to +2); the sim adds
// a line's points to its attack (forwards) or defence (pairs), so the effect stays modest.
// Factors: archetype mix, shooting hands, games played together (familiarity), shared nationality,
// and the coaching staff (head coach style and leadership, assistant's special teams).
import { slotRating } from "./roles.js";
import { isDefense, isForward, isGoalie } from "./constants.js";
import { autoLines, specialTeams, dressedSkaters, healthy } from "./lines.js";

// Short archetype tags shown on player cards.
export const ARCH_ABBR = { SNP: "SNP", PLY: "PLY", PWF: "PWF", TWF: "2WY", GRN: "GRN", ENF: "ENF", OFD: "OFD", DFD: "DFD", TWD: "2WD", END: "ENF", HYB: "HYB", BFY: "BUT", STD: "STD" };
export const ARCH_LEGEND = [["SNP", "Sniper"], ["PLY", "Playmaker"], ["PWF", "Power forward"], ["2WY", "Two-way forward"], ["GRN", "Grinder"], ["ENF", "Enforcer"], ["OFD", "Offensive D"], ["DFD", "Shutdown D"], ["2WD", "Two-way D"], ["HYB", "Hybrid G"], ["BUT", "Butterfly G"], ["STD", "Stand-up G"]];
export const archAbbr = (p) => (p ? ARCH_ABBR[p.type] || "" : "");

const SKILL = new Set(["SNP", "PLY", "OFD"]);
const CHECK = new Set(["TWF", "GRN", "ENF", "DFD", "TWD", "END"]);
const FINISH = new Set(["SNP", "PWF"]);
const r1 = (v) => Math.round(v * 100) / 100;

// Weeks a group has played together (developmentWeek counts them; old saves start at 0).
export const chemKey = (ids) => [...ids].filter(Boolean).sort().join("|");
export function familiarity(t, ids) {
  const ex = t.lineExperience || {};
  return Math.max(ex[chemKey(ids)] || 0, ex[ids.join("|")] || 0);
}

// kind: "F" (line), "D" (pair), "PP", "PK".
export function chemistry(lg, t, ids, kind = "F") {
  const ps = (ids || []).map((id) => lg.players[id]).filter((p) => p && !isGoalie(p.pos));
  const reasons = [];
  const add = (v, text) => { if (v) reasons.push({ v: r1(v), text }); };
  if (ps.length < 2) return grade(0, reasons);
  const types = ps.map((p) => p.type);
  const n = (set) => types.filter((x) => set.has(x)).length;
  const has = (x) => types.includes(x);
  const distinct = new Set(types).size;

  if (kind === "F") {
    if (has("PLY") && types.some((x) => FINISH.has(x))) add(0.7, "Playmaker feeding a finisher");
    else if (!has("PLY")) add(-0.2, "No playmaker to move the puck");
    if (distinct === 3) add(0.3, "Three different styles complement each other");
    if (distinct === 1) add(-0.4, `Three of the same type (${ARCH_ABBR[types[0]] || types[0]})`);
    if (n(CHECK) >= 2) add(0.2, "Responsible two-way/checking core");
  } else if (kind === "D") {
    const sk = types.filter((x) => x === "OFD").length, sh = types.filter((x) => x === "DFD" || x === "END").length;
    if (sk && sh) add(0.7, "Puck-mover paired with a shutdown D");
    else if (has("TWD")) add(0.4, "Two-way D balances the pair");
    if (sk === 2) add(-0.3, "Two puck-movers leave the pair exposed");
    if (sh === 2) add(-0.1, "Two stay-at-home D struggle to break out");
  } else if (kind === "PP") {
    if (has("PLY") && has("SNP")) add(0.6, "Quarterback and a shooter on the unit");
    if (ps.some((p) => isDefense(p.pos) && p.type === "OFD")) add(0.3, "Offensive D running the point");
    if (n(CHECK) >= 2) add(-0.3, "Too many checkers on the power play");
  } else if (kind === "PK") {
    const c = n(CHECK);
    if (c >= 3) add(0.6, "Defensive specialists killing penalties");
    else if (c <= 1) add(-0.3, "Few defensive specialists on the kill");
  }

  // Shooting hands: a mix of lefties and righties opens up one-timers and breakouts.
  const L = ps.filter((p) => p.shoots === "L").length, R = ps.filter((p) => p.shoots === "R").length;
  if (kind === "D") { if (L && R) add(0.3, "Left and right shot on their strong sides"); else add(-0.2, "Both shoot the same way"); }
  else if (L && R) add(0.2, "Mix of left and right shots");

  // Familiarity: up to +0.8 after a full half-season together.
  if (kind === "F" || kind === "D") {
    const wk = familiarity(t, ids);
    if (wk > 0) add(Math.min(0.8, wk / 26 * 0.8), `${wk} week${wk === 1 ? "" : "s"} together`);
  }

  // Shared nationality: small comfort bonus.
  const nat = {}; for (const p of ps) if (p.nat) nat[p.nat] = (nat[p.nat] || 0) + 1;
  if (Object.values(nat).some((c) => c >= 2)) add(0.1, "Countrymen on the same unit");

  // Coaching staff.
  for (const c of coachEffects(t, ps, kind)) add(c.v, c.text);

  const pts = Math.max(-1, Math.min(2, reasons.reduce((s, r) => s + r.v, 0)));
  return grade(pts, reasons);
}

function coachEffects(t, ps, kind) {
  const out = [], hc = t.coach, st = t.staff?.assistant?.specialTeams;
  const types = ps.map((p) => p.type), skill = types.filter((x) => SKILL.has(x)).length, check = types.filter((x) => CHECK.has(x)).length;
  const who = hc?.name ? hc.name.split(" ").slice(-1)[0] : "The coach";
  if (kind === "F" || kind === "D") {
    if (hc?.style === "attack" && skill >= 2) out.push({ v: 0.3, text: `${who}'s up-tempo system suits skill players` });
    if (hc?.style === "defend" && check >= 2) out.push({ v: 0.3, text: `${who}'s defensive structure suits checkers` });
    if (hc?.style === "balanced" && skill && check) out.push({ v: 0.15, text: `${who}'s balanced system likes a skill/checking mix` });
    if (hc?.leadership >= 85) out.push({ v: 0.1, text: `${who}'s leadership keeps the room together` });
  } else if (st != null) {
    const v = Math.round((st - 78) * 0.02 * 100) / 100;
    if (Math.abs(v) >= 0.05) out.push({ v, text: `Assistant's special-teams coaching (${st})` });
  }
  return out;
}

export const chemLabel = (pts) => (pts >= 1.2 ? "Great" : pts >= 0.6 ? "Good" : pts >= 0 ? "Fair" : "Poor");
function grade(pts, reasons) {
  return { pts: r1(pts), score: Math.round(Math.max(0, Math.min(100, 40 + pts * 30))), label: chemLabel(pts), reasons };
}

// A short note on what this staff values, for the Lines screen.
export function staffNote(t) {
  const hc = t.coach, who = hc?.name || "Your head coach";
  const s = hc?.style === "attack" ? `${who} runs an up-tempo system: lines with two or more skill players (SNP, PLY, OFD) get a chemistry boost.`
    : hc?.style === "defend" ? `${who} values defensive structure: lines and pairs with two or more checkers (2WY, GRN, DFD, 2WD) get a chemistry boost.`
    : `${who} runs a balanced system: lines that mix a skill player with a checker get a small chemistry boost.`;
  const st = t.staff?.assistant?.specialTeams;
  return st != null ? `${s} Your assistant's special-teams rating (${st}) ${st >= 78 ? "lifts" : "drags on"} power-play and penalty-kill chemistry.` : s;
}

// ---- Autofill ----
const FW = [0.36, 0.3, 0.21, 0.13], DW = [0.42, 0.34, 0.24];
const CHEM_W = 4; // one chemistry point is worth about four rating points
const F_POS = ["LW", "C", "RW"], D_POS = ["LD", "RD"];

function improve(rows, score) {
  // Greedy pairwise swaps until nothing helps (small: 12 forwards or 6 D plus scratches).
  let best = score(rows), better = true, guard = 0;
  const cells = []; rows.forEach((r, i) => r.forEach((_, j) => cells.push([i, j])));
  while (better && guard++ < 40) {
    better = false;
    for (let a = 0; a < cells.length; a++) for (let b = a + 1; b < cells.length; b++) {
      const [i, j] = cells[a], [k, l] = cells[b];
      [rows[i][j], rows[k][l]] = [rows[k][l], rows[i][j]];
      const v = score(rows);
      if (v > best + 1e-9) { best = v; better = true; } else [rows[i][j], rows[k][l]] = [rows[k][l], rows[i][j]];
    }
  }
  return rows;
}

export function autofillByOverall(lg, t) { return autoLines(lg, t); }

export function autofillByChemistry(lg, t) {
  const L = autoLines(lg, t);
  const P = (id) => lg.players[id];
  const lineVal = (ids, pos, kind) => ids.reduce((s, id, j) => s + (P(id) ? slotRating(P(id), pos[j]) : 40), 0) / ids.length + CHEM_W * chemistry(lg, t, ids, kind).pts;
  // Forwards and defence: dressed players plus healthy scratches of that group compete.
  const pool = (grp) => healthy(lg, t).filter((p) => (grp === "F" ? isForward(p.pos) : isDefense(p.pos)));
  for (const [g, pos, w] of [["F", F_POS, FW], ["D", D_POS, DW]]) {
    const rows = L[g].map((r) => [...r]);
    const on = new Set(rows.flat());
    const extra = pool(g).filter((p) => !on.has(p.id)).map((p) => p.id);
    const bench = [extra.slice(0, 3)];
    const all = [...rows, ...bench.filter((b) => b.length)];
    const score = (rs) => rs.slice(0, rows.length).reduce((s, r, i) => s + w[i] * lineVal(r, pos, g), 0);
    improve(all, score);
    L[g] = all.slice(0, rows.length);
  }
  Object.assign(L, specialTeams(dressedSkaters(lg, L.F, L.D)));
  stByChemistry(lg, t, L);
  return L;
}

// Special teams only: keep the dressed lineup, rebuild PP/PK for rating + chemistry.
export function autofillSpecialTeams(lg, t, byChem = true) {
  const L = t.lines;
  Object.assign(L, specialTeams(dressedSkaters(lg, L.F, L.D)));
  if (byChem) stByChemistry(lg, t, L);
  return L;
}

function stByChemistry(lg, t, L) {
  const dressed = dressedSkaters(lg, L.F, L.D);
  const val = (p, k) => (p ? p.ovr : 40);
  for (const [k, w] of [["PP", [0.62, 0.38]], ["PK", [0.6, 0.4]]]) {
    const units = L[k].map((u) => [...u]);
    const on = new Set(units.flat());
    const benchF = dressed.filter((p) => !on.has(p.id) && isForward(p.pos)).sort((a, b) => b.ovr - a.ovr).slice(0, 3).map((p) => p.id);
    const benchD = dressed.filter((p) => !on.has(p.id) && isDefense(p.pos)).sort((a, b) => b.ovr - a.ovr).slice(0, 2).map((p) => p.id);
    const all = [...units, benchF, benchD].filter((r) => r.length);
    const score = (rs) => rs.slice(0, units.length).reduce((s, u, i) => s + w[i] * (u.reduce((a, id) => a + val(lg.players[id], k), 0) / u.length + CHEM_W * chemistry(lg, t, u, k).pts), 0);
    // Only swap like for like (forward with forward, D with D) so units keep their shape.
    const ref = units.map((u) => [...u]);
    const guarded = (rs) => (rs.every((r, i) => i >= ref.length || r.every((id, j) => isDefense(lg.players[id]?.pos) === isDefense(lg.players[ref[i][j]]?.pos))) ? score(rs) : -Infinity);
    improve(all, guarded);
    L[k] = all.slice(0, units.length);
  }
}

// Totals for tests and the UI.
export function teamChemistry(lg, t, L = t.lines) {
  const s = (rows, k) => rows.reduce((a, r) => a + chemistry(lg, t, r, k).pts, 0);
  return r1(s(L.F, "F") + s(L.D, "D"));
}
