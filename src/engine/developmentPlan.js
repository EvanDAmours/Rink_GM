// The development system (round 3): one season plan of three decisions, made in the preseason and
// locked when the season starts, and the plain read-outs the Development screens show.
//  (a) One focus player. Each week of the regular season he has a chance of +1 OVR (Gridiron's
//      focusChance, base 0.05 a week over about 26 weeks), scaled by his development trait, his age
//      and how close to the top of the scale he already is.
//  (b) One camp priority (Youth, Forwards, Defence or Goalies): a small bonus to next summer's
//      development mean for the players it covers, on your club only.
//  (c) Where each prospect plays (level x role). The level and role set a bar; his rating against it
//      sets the odds he thrives, holds steady or struggles. The outcome is rolled at week 4, shapes his
//      farm stats, and replaces his farm-minutes growth at the summer rollover.
// Nothing here touches the AI clubs: their development is the engine's age curve, usage and farm work.
import { isGoalie, isDefense } from "./constants.js";
import { TRAINING } from "./franchise.js";
import { usageGrowth } from "./development.js";
import { DEV_TRAITS, ageCurve as baseCurve, expectedWall, ageSpread, growBy } from "./players.js";
import { stream, clamp } from "./rng.js";
import { gameLines } from "./lines.js";
import { assignProspect } from "./operations.js";
import { SEASON_MILESTONES } from "./awards.js";

// One-time reshape of older saves (see migrateDevSystem).
export const DEV_SYSTEM_VERSION = 1;

// The age curve developPlayer uses (players.js), for the age he plays next season, less the
// wall's average toll.
export function ageCurve(p) {
  const next = { ...p, age: p.age + 1 };
  return baseCurve(next) - expectedWall(next);
}
// His weakest skill group (in-season growth works on it).
export function groupAverages(p) {
  return Object.entries(TRAINING).filter(([k]) => isGoalie(p.pos) === (k === "goaltending")).map(([k, g]) => { const ks = g.keys.filter((x) => Number.isFinite(p.attrs[x])); return { focus: k, name: g.name, avg: ks.length ? ks.reduce((s, x) => s + p.attrs[x], 0) / ks.length : 0 }; }).sort((a, b) => a.avg - b.avg);
}
export function weakestGroup(p) { return groupAverages(p)[0]?.focus; }

const mine = (league, t = league.teams[league.userTid]) => [...t.roster, ...t.prospects].map((id) => league.players[id]).filter(Boolean);
const isUser = (league, t) => t && t.id === league.userTid;
const weekOf = (league) => Math.floor((league.day || 0) / 7);

// ---------- (a) The focus player ----------
export const FOCUS_WEEKS = 26;
const F_TRAIT = { generational: 2.2, superstar: 1.7, star: 1.3, normal: 1 };
// Late bloomers switch at 22, where Rink's late surge starts.
export const focusTrait = (p) => (p.dev === "late" ? (p.age >= 22 ? 1.3 : 0.8) : F_TRAIT[p.dev] || 1);
export const focusAge = (age) => (age <= 23 ? 1.3 : age <= 26 ? 1 : age <= 29 ? 0.6 : 0.25);
// The last few points come hard.
export const focusCeiling = (ovr) => (ovr >= 97 ? 0.3 : ovr >= 93 ? 0.6 : 1);
// Chance each week that the focus player gains a point of OVR.
export function focusChance(p) {
  if (!p || p.ovr >= 99) return 0;
  return Math.min(0.6, 0.05 * focusTrait(p) * focusAge(p.age) * focusCeiling(p.ovr));
}
// Expected OVR from the focus over the weeks left (a whole season by default).
export function focusExpected(p, weeks = FOCUS_WEEKS) {
  return p ? Math.max(0, Math.min(99 - p.ovr, weeks * focusChance(p))) : 0;
}
// Weeks of focus work left: 26 over a season (a week's chance is rolled each Sunday of the schedule).
export function weeksLeft(league) {
  if (league.phase === "preseason") return FOCUS_WEEKS;
  if (league.phase !== "regular") return 0;
  return Math.max(0, FOCUS_WEEKS - weekOf(league));
}
// The players worth focusing on, best expected boost first.
export function focusCandidates(league, t = league.teams[league.userTid]) {
  return mine(league, t).filter((p) => p.ovr < 99)
    .map((p) => ({ p, boost: focusExpected(p) }))
    .sort((a, b) => b.boost - a.boost || b.p.pot - a.p.pot || (t.roster.includes(b.p.id) ? 1 : 0) - (t.roster.includes(a.p.id) ? 1 : 0) || b.p.ovr - a.p.ovr);
}

// ---------- (b) Camp priority ----------
const F_ = (p) => !isGoalie(p.pos) && !isDefense(p.pos);
export const CAMP_PRIORITY = {
  youth: { name: "Youth", bonus: 0.5, who: "players 23 and under", test: (p) => p.age <= 23 },
  forwards: { name: "Forwards", bonus: 0.3, who: "forwards 26 and under", test: (p) => p.age <= 26 && F_(p) },
  defence: { name: "Defence", bonus: 0.3, who: "defencemen 26 and under", test: (p) => p.age <= 26 && isDefense(p.pos) },
  goalies: { name: "Goalies", bonus: 0.4, who: "goalies 26 and under", test: (p) => p.age <= 26 && isGoalie(p.pos) },
};
export const campCovered = (league, key, t = league.teams[league.userTid]) => mine(league, t).filter((p) => CAMP_PRIORITY[key]?.test(p));
// His camp bonus for next summer (p.age: the age he played the season at).
export function campBonus(league, p, plan = league.teams[league.userTid]?.devPlan) {
  const c = plan && CAMP_PRIORITY[plan.camp];
  return c && p.tid === league.userTid && c.test(p) ? c.bonus : 0;
}

// ---------- (c) Prospect placements ----------
// Average rating of the minutes at each level (the farm-stat model's own levels).
export const LEVELS = { junior: { name: "Junior", avg: 60 }, college: { name: "College", avg: 64 }, europe: { name: "Europe", avg: 66 }, ahl: { name: "AHL", avg: 70 } };
export const ROLES = { top: { name: "top", adj: 4, m: 1.25 }, middle: { name: "middle", adj: 0, m: 1 }, depth: { name: "depth", adj: -4, m: 0.6 } };
export const OUTCOME = { thrive: "Thriving", steady: "Steady", struggle: "Struggling" };
// The odds for one level and role: the bar is the level's average plus the role; his gap to it
// moves the odds 4 points per OVR. A teenager playing up struggles a little more often.
export function gamble(p, level, role) {
  const L = LEVELS[level] || LEVELS.ahl, R = ROLES[role] || ROLES.middle;
  const bar = L.avg + R.adj, gap = p.ovr - bar;
  let th = clamp(0.3 + 0.04 * gap, 0.05, 0.7);
  let st = clamp(0.25 - 0.04 * gap + (p.age <= 19 && level !== "junior" ? 0.05 : 0), 0.05, 0.75);
  if (th + st > 0.95) { const k = 0.95 / (th + st); th *= k; st *= k; }
  th = Math.round(th * 100); st = Math.round(st * 100);
  const sd = 100 - th - st;
  // Too easy: he puts up points but coasts.
  const coast = gap >= 8;
  const eff = { thrive: (coast ? 0.6 : 1.2) * R.m, steady: 0.5 * R.m, struggle: -0.4 * R.m };
  const ev = (th * eff.thrive + sd * eff.steady + st * eff.struggle) / 100;
  return { level, role, bar, gap, th, sd, st, coast, eff, ev };
}
export const placeText = (level, role) => `${LEVELS[level]?.name || "AHL"} · ${ROLES[role]?.name || "middle"} role`;
// Long shot when he struggles half the time or more, Risky from 35%.
export const statusWord = (g) => (g.st >= 50 ? "Long shot" : g.st >= 35 ? "Risky" : "Safe");
const CHL = ["OHL", "WHL", "QMJHL"];
// Where he can play without a contract decision: a signed pro plays in the AHL (a CHL junior only
// from 20), back in junior up to 20, or in Europe; an unsigned pick stays where he is.
export function legalLevels(p) {
  const cur = LEVELS[p.assignment] ? p.assignment : "ahl";
  if (p.signed === false) return [cur];
  const out = [];
  if (!(p.age < 20 && CHL.includes(p.bio?.lg))) out.push("ahl");
  if (p.age <= 20) out.push("junior");
  out.push("europe");
  if (!out.includes(cur)) out.unshift(cur);
  return out;
}
// The staff keep each prospect at his level and slot him like a coach would: top minutes for the
// best few who are within three of that bar, middle minutes for anyone within six of it, depth
// for the rest. Sensible, not always the best bet: that's your call to make.
const ROLE_SLOTS = { F: 3, D: 2, G: 1 };
const grp = (p) => (isGoalie(p.pos) ? "G" : isDefense(p.pos) ? "D" : "F");
export function staffPlacements(league, t = league.teams[league.userTid]) {
  const ps = t.prospects.map((id) => league.players[id]).filter(Boolean);
  const out = {};
  for (const p of ps) {
    const level = LEVELS[p.assignment] ? p.assignment : "ahl";
    const peers = ps.filter((q) => (LEVELS[q.assignment] ? q.assignment : "ahl") === level && grp(q) === grp(p)).sort((a, b) => b.ovr - a.ovr || b.pot - a.pot);
    const avg = LEVELS[level].avg;
    const role = peers.indexOf(p) < ROLE_SLOTS[grp(p)] && p.ovr - (avg + ROLES.top.adj) >= -3 ? "top" : p.ovr - avg >= -6 ? "middle" : "depth";
    out[p.id] = { level, role };
  }
  return out;
}
function place(p, year, level, role, by) {
  const g = gamble(p, level, role);
  p.placement = { year, level, role, by, th: g.th, sd: g.sd, st: g.st, gap: g.gap, outcome: null };
  p.farmRole = role;
  return p.placement;
}
// Every one of your prospects has this season's placement (the staff's, until you change it).
export function ensurePlacements(league, t = league.teams[league.userTid]) {
  if (!t || !["preseason", "regular"].includes(league.phase)) return;
  let staff = null;
  for (const id of t.prospects) {
    const p = league.players[id];
    if (!p) continue;
    const pl = p.placement;
    if (pl && pl.year === league.year) {
      // He moved level some other way (signed, assigned): the placement follows, until it is rolled.
      const level = LEVELS[p.assignment] ? p.assignment : "ahl";
      if (!pl.outcome && pl.level !== level) place(p, league.year, level, pl.role, pl.by);
      continue;
    }
    staff ||= staffPlacements(league, t);
    const s = staff[id] || { level: "ahl", role: "middle" };
    place(p, league.year, s.level, s.role, "staff");
  }
}
// Recommended (best expected growth), Safer (least risk) and Bolder (the biggest jump), and where he is now.
export function placementOptions(p) {
  const opts = legalLevels(p).flatMap((lv) => Object.keys(ROLES).map((rl) => gamble(p, lv, rl)));
  const key = (g) => `${g.level}|${g.role}`;
  const rec = [...opts].sort((a, b) => b.ev - a.ev || a.st - b.st)[0];
  const rest = opts.filter((g) => key(g) !== key(rec));
  const safer = [...rest].sort((a, b) => a.st - b.st || b.ev - a.ev)[0] || null;
  const bolder = rest.filter((g) => !safer || key(g) !== key(safer)).sort((a, b) => b.bar - a.bar || b.th - a.th)[0] || null;
  const cur = p.placement ? gamble(p, p.placement.level, p.placement.role) : null;
  return { rec, safer, bolder, cur, key };
}
export const planOpen = (league, t = league.teams[league.userTid]) => league.phase === "preseason" && !t?.devPlan?.locked;
export function setPlacement(league, pid, level, role) {
  const t = league.teams[league.userTid], p = league.players[pid];
  if (!p || !t.prospects.includes(pid)) return { ok: false, msg: "Choose one of your prospects." };
  if (!planOpen(league, t)) return { ok: false, msg: league.phase === "preseason" ? "Your plan is locked in. Unlock it to make changes." : "Placements are set for the season. Call-ups stay open." };
  if (!LEVELS[level] || !ROLES[role] || !legalLevels(p).includes(level)) return { ok: false, msg: `${p.name} can't play there.` };
  if (level !== (p.assignment || "ahl")) { const r = assignProspect(league, pid, level); if (!r.ok) return r; }
  place(p, league.year, level, role, "you");
  return { ok: true, msg: `${p.name}: ${placeText(level, role)}.` };
}
// The staff's development rating: a strong staff gets a little more out of good minutes.
export function staffFactor(league, t, p) {
  const s = t?.staff?.[isGoalie(p.pos) ? "goalie" : "assistant"]?.development ?? 77;
  const avg = ((t?.coach?.development ?? 77) + s) / 2;
  return clamp(1 + (avg - 77) / 100, 0.85, 1.15);
}
// The summer effect of his placement (replaces the farm-minutes growth); null without an outcome.
export function placementSummer(league, p, year) {
  const pl = p?.placement;
  if (!pl || pl.year !== year || !pl.outcome) return null;
  const R = ROLES[pl.role] || ROLES.middle;
  const base = pl.outcome === "thrive" ? (pl.gap >= 8 ? 0.6 : 1.2) : pl.outcome === "steady" ? 0.5 : -0.4;
  const v = base * R.m;
  return v > 0 ? v * staffFactor(league, league.teams[p.tid], p) : v;
}
function rollPlacement(league, p, week) {
  const pl = p.placement;
  const r = stream(`${p.id}|place|${pl.level}|${pl.role}|${pl.year}`).next() * 100;
  pl.outcome = r < pl.th ? "thrive" : r < pl.th + pl.sd ? "steady" : "struggle";
  pl.week = week;
  return pl.outcome;
}
export const ROLL_WEEK = 4;

// ---------- The plan ----------
// t.devPlan = { year, focus, camp, locked, gained, focusWeek, campOvrs, prev }
export function ensureDevPlan(league) {
  const t = league.teams?.[league.userTid];
  if (!t) return null;
  if ((league.devSystemVersion || 0) < DEV_SYSTEM_VERSION) migrateDevSystem(league);
  if (!t.devPlan || t.devPlan.year !== league.year) {
    const old = t.devPlan;
    const prev = old ? { year: old.year, focus: old.focus, name: league.players[old.focus]?.name || null, gained: old.gained || 0, camp: old.camp } : t.devPlanPrev || null;
    t.devPlan = { year: league.year, focus: focusCandidates(league, t)[0]?.p.id ?? null, camp: "youth", locked: league.phase !== "preseason", gained: 0, focusWeek: league.phase === "regular" ? weekOf(league) : 0, campOvrs: null, by: "staff" };
    if (prev) t.devPlanPrev = prev;
    if (league.phase !== "preseason") t.devPlan.campOvrs = snapshot(league, t);
  }
  ensurePlacements(league, t);
  return t.devPlan;
}
const snapshot = (league, t) => Object.fromEntries(mine(league, t).map((p) => [p.id, p.ovr]));
// Older saves: their first focus slot becomes the focus player, the Season Points camp data goes,
// the eight-week position courses end, and prospects get the staff's placements.
export function migrateDevSystem(league) {
  const t = league.teams?.[league.userTid];
  const first = t ? Object.keys(t.training?.assignments || {}).find((id) => league.players[id]?.tid === t.id) : null;
  for (const team of league.teams || []) {
    delete team.training;
    delete team.battlesYear; delete team.battleReport;
    if (team.camp) team.camp = { year: team.camp.year, games: Array.isArray(team.camp.games) ? team.camp.games : [], risk: !!team.camp.risk };
  }
  for (const p of Object.values(league.players || {})) { delete p.positionTraining; delete p.campWork; delete p.campGain; }
  league.devSystemVersion = DEV_SYSTEM_VERSION;
  if (t) {
    delete t.devPlan;
    ensureDevPlan(league);
    if (first) { t.devPlan.focus = first; t.devPlan.by = "you"; t.devPlan.focusSet = true; }
  }
}
export function setFocus(league, pid) {
  const t = league.teams[league.userTid], p = league.players[pid];
  const plan = ensureDevPlan(league);
  if (!p || p.tid !== t.id) return { ok: false, msg: "Choose one of your players." };
  if (!planOpen(league, t)) return { ok: false, msg: "The focus player is set for the season." };
  plan.focus = pid; plan.by = "you"; plan.focusSet = true;
  return { ok: true, msg: `${p.name} is your focus player: about +${focusExpected(p, weeksLeft(league)).toFixed(1)} by spring.` };
}
export function setCampPriority(league, key) {
  const t = league.teams[league.userTid];
  const plan = ensureDevPlan(league);
  if (!CAMP_PRIORITY[key]) return { ok: false, msg: "Choose a camp priority." };
  if (!planOpen(league, t)) return { ok: false, msg: "Camp priority is set for the season." };
  plan.camp = key; plan.by = "you";
  return { ok: true, msg: `Camp priority: ${CAMP_PRIORITY[key].name}.` };
}
export function lockPlan(league) {
  const plan = ensureDevPlan(league);
  if (league.phase !== "preseason") return { ok: false, msg: "The plan is already set for the season." };
  plan.locked = true;
  return { ok: true, msg: "Plan locked in. It starts with the season." };
}
export function unlockPlan(league) {
  const plan = ensureDevPlan(league);
  if (league.phase !== "preseason") return { ok: false, msg: "The plan is set for the season." };
  plan.locked = false;
  return { ok: true, msg: "Plan unlocked." };
}
// Opening night: the plan locks, the odds are read from today's ratings and camp is the baseline.
export function startPlanSeason(league) {
  const t = league.teams[league.userTid];
  const plan = ensureDevPlan(league);
  if (!plan) return;
  plan.locked = true;
  plan.focusWeek = 0;
  plan.campOvrs = snapshot(league, t);
  for (const id of t.prospects) {
    const p = league.players[id], pl = p?.placement;
    if (pl && pl.year === league.year && !pl.outcome) place(p, league.year, pl.level, pl.role, pl.by);
  }
}
// Once a week in the regular season: the focus player's chance, and the placements' week-4 roll.
export function developmentPlanWeek(league) {
  if (league.phase !== "regular") return [];
  const t = league.teams[league.userTid];
  const plan = ensureDevPlan(league);
  if (!plan) return [];
  const week = weekOf(league), out = [];
  if ((plan.focusWeek || 0) < week) {
    const from = plan.focusWeek || 0;
    plan.focusWeek = week;
    const p = league.players[plan.focus];
    for (let w = from + 1; w <= week && w <= FOCUS_WEEKS; w++) {
      if (!p || p.tid !== t.id || p.injury > 0 || p.ovr >= 99) continue;
      if (stream(`${p.id}|focus|${league.year}|${w}`).next() >= focusChance(p)) continue;
      const before = p.ovr, pot = p.pot || p.ovr;
      if (!growBy(p, 1)) continue;
      // His ceiling rises with him (as in Gridiron), so the summer still has room.
      p.pot = Math.min(99, Math.max(pot + (p.ovr - before), p.ovr));
      plan.gained = (plan.gained || 0) + (p.ovr - before);
      (p.progress ||= []).push({ year: league.year, week: w, from: before, to: p.ovr, note: "Focus +1" });
      if (p.progress.length > 40) p.progress.shift();
      out.push({ pid: p.id, from: before, to: p.ovr });
    }
  }
  if (week >= ROLL_WEEK) for (const id of t.prospects) {
    const p = league.players[id], pl = p?.placement;
    if (pl && pl.year === league.year && !pl.outcome) rollPlacement(league, p, week);
  }
  return out;
}
// The summer bonuses for one of your players, read at rollover before he ages: the camp priority,
// and for a prospect his placement's outcome (in place of his farm-minutes growth).
export function summerPlanBonus(league, p, year = league.year - 1) {
  const t = league.teams[league.userTid];
  if (!t || p.tid !== t.id) return null;
  const plan = t.devPlan?.year === year ? t.devPlan : null;
  const camp = plan ? campBonus(league, p, plan) : 0;
  const place = t.prospects.includes(p.id) ? placementSummer(league, p, year) : null;
  return { camp, place };
}

// ---------- Read-outs ----------
// Expected change next summer from the engine's own curve: age, trait, ceiling, ice time (or his
// placement), the camp priority, the wall, and the ceiling clamp young players meet.
const Z = Array.from({ length: 25 }, (_, i) => -3 + i * 0.25);
const W = Z.map((z) => Math.exp(-z * z / 2));
const WS = W.reduce((a, b) => a + b, 0);
export function projectSummer(league, t, p) {
  const next = { ...p, age: p.age + 1 };
  const user = isUser(league, t);
  const farm = t.prospects.includes(p.id);
  let usage = usageGrowth(league, p) || 0;
  if (user && farm && p.placement?.year === league.year) {
    const pl = p.placement;
    usage = pl.outcome ? placementSummer(league, p, league.year) : gamble(p, pl.level, pl.role).ev * staffFactor(league, t, p);
  }
  const banked = p.inSeasonGain?.year === league.year ? p.inSeasonGain.n : 0;
  const mean = baseCurve(next) + usage + (user ? campBonus(league, p, t.devPlan) : 0) - banked;
  const sd = ageSpread(next), wall = expectedWall(next);
  const capped = next.age <= 25 && p.dev !== "generational" && p.dev !== "superstar";
  const room = Math.max(0, (p.pot || p.ovr) - p.ovr), over = p.dev === "star" ? 0.4 : 0.25;
  let e = 0;
  for (let i = 0; i < Z.length; i++) {
    let d = mean + Z[i] * sd;
    if (wall) d = Math.min(d, 0) - wall;
    else if (capped && d > room) d = room + over * Math.min(1, d - room);
    e += W[i] * d;
  }
  return Math.max(40 - p.ovr, Math.min(99 - p.ovr, e / WS));
}
export const summerGroup = (v) => (v >= 0.75 ? "grow" : v <= -0.75 ? "decline" : "peak");
export function nextSummer(league, t = league.teams[league.userTid]) {
  const rows = mine(league, t).map((p) => { const v = projectSummer(league, t, p); return { p, v, farm: t.prospects.includes(p.id), group: summerGroup(v) }; });
  return {
    grow: rows.filter((r) => r.group === "grow").sort((a, b) => b.v - a.v),
    peak: rows.filter((r) => r.group === "peak").sort((a, b) => b.p.ovr - a.p.ovr),
    decline: rows.filter((r) => r.group === "decline").sort((a, b) => a.v - b.v),
  };
}
// How far your club has come since opening night (net OVR of the players still here).
export function sinceCamp(league, t = league.teams[league.userTid]) {
  const plan = t.devPlan;
  const base = plan?.year === league.year ? plan.campOvrs : null;
  if (!base) return null;
  let n = 0, up = 0, down = 0;
  for (const p of mine(league, t)) {
    if (base[p.id] == null) continue;
    const d = p.ovr - base[p.id];
    n += d; if (d > 0) up++; if (d < 0) down++;
  }
  return { n, up, down };
}
// Last summer, for the preseason: the net change of the players here now.
export function lastSummer(league, t = league.teams[league.userTid]) {
  const ps = mine(league, t).filter((p) => Number.isFinite(p.lastChange) && (p.ratingHistory || []).some((h) => h.year === league.year - 1));
  if (!ps.length) return null;
  return { n: ps.reduce((s, p) => s + p.lastChange, 0), up: ps.filter((p) => p.lastChange > 0).length, down: ps.filter((p) => p.lastChange < 0).length };
}
const ORD_W = ["first", "second", "third", "fourth"];
const POS_W = { C: "center", LW: "left wing", RW: "right wing" };
// A prospect who out-rates the weakest player dressed at his position: { vs, label } or null.
export function readyFor(league, t, p) {
  if (!t.prospects.includes(p.id) || p.injury > 0 || p.signed === false) return null;
  let L;
  try { L = gameLines(league, t); } catch { return null; }
  const at = [];
  if (isGoalie(p.pos)) { const b = league.players[L.G[1]] || league.players[L.G[0]]; if (b) at.push([b, L.G[1] ? "your backup goalie" : "your starting goalie"]); }
  else if (isDefense(p.pos)) L.D.forEach((pair, i) => pair.forEach((id) => { const q = league.players[id]; if (q) at.push([q, `your ${ORD_W[i] || "third"}-pair defenceman`]); }));
  else L.F.forEach((line, i) => line.forEach((id) => { const q = league.players[id]; if (q && !isDefense(q.pos) && !isGoalie(q.pos)) at.push([q, `your ${ORD_W[i] || "fourth"}-line ${POS_W[q.pos] || "forward"}`]); }));
  const same = at.filter(([q]) => q.pos === p.pos);
  const pool = same.length ? same : at;
  const [vs, label] = pool.sort((a, b) => a[0].ovr - b[0].ovr)[0] || [];
  return vs && p.ovr > vs.ovr ? { vs, label } : null;
}
const NUM_W = { 35: "Thirty-five", 40: "Forty", 60: "Sixty", 100: "A hundred" };
// A big season in reach: { label, pace } for the first milestone he's on pace for.
export function milestonePace(league, p) {
  const gp = p.stats?.gp || 0;
  if (gp < 10 || p.ovr >= 93) return null;
  const teamGp = Math.max(gp, league.teams[p.tid]?.rec?.gp || gp);
  const left = Math.max(0, 82 - teamGp);
  for (const m of SEASON_MILESTONES) {
    if (!m.of(p)) continue;
    const v = p.stats[m.key] || 0;
    const pace = Math.round(v + (v / gp) * left);
    if (v < m.at && pace >= m.at) {
      const what = m.key === "g" ? "goals" : m.key === "a" ? "assists" : m.key === "w" ? "wins" : "points";
      return { pace, text: `On pace for ${pace} ${what}. ${NUM_W[m.at] || m.at} earns a point this summer.` };
    }
  }
  return null;
}
const sgn = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "±0");
// "Worth knowing this month": three to five rows of { pid, name, why, num, tone }.
export function worthKnowing(league, t = league.teams[league.userTid]) {
  const plan = ensureDevPlan(league) || {};
  const rows = [], seen = new Set();
  const add = (p, why, num, tone = "") => { if (!p || seen.has(p.id)) return; seen.add(p.id); rows.push({ pid: p.id, name: p.name, why, num, tone }); };
  const inSeason = ["regular", "playoffs", "draft", "resign", "freeagency"].includes(league.phase) && plan.campOvrs;
  const f = league.players[plan.focus];
  if (f && f.tid === t.id) {
    if (league.phase === "preseason") add(f, `Your focus player. About +${focusExpected(f).toFixed(1)} by spring.`, `+${focusExpected(f).toFixed(1)}`, "up");
    else {
      const pace = Math.round((plan.gained || 0) + focusExpected(f, weeksLeft(league)));
      add(f, league.phase === "regular" ? `Your focus player. On pace for ${sgn(pace)} by spring.` : `Your focus player gained ${sgn(plan.gained || 0)} this season.`, sgn(plan.gained || 0), plan.gained ? "up" : "");
    }
  }
  if (league.phase === "regular" || league.phase === "preseason") {
    const ready = t.prospects.map((id) => league.players[id]).filter(Boolean).map((p) => ({ p, r: readyFor(league, t, p) })).filter((x) => x.r).sort((a, b) => b.p.ovr - a.p.ovr)[0];
    if (ready) add(ready.p, `Ready. He out-rates ${ready.r.label}.`, String(ready.p.ovr));
  }
  // A young player out of the lineup: minutes are what grow him.
  if (league.phase === "regular" || league.phase === "preseason") {
    let dressed = null;
    try { const L = gameLines(league, t); dressed = new Set([...L.F.flat(), ...L.D.flat(), ...L.G.slice(0, 1)].filter(Boolean)); } catch { /* lines not set */ }
    const sat = dressed && t.roster.map((id) => league.players[id]).filter((p) => p && p.age <= 24 && p.injury <= 0 && !dressed.has(p.id) && !isGoalie(p.pos) && (p.pot || 0) - p.ovr >= 3).sort((a, b) => b.pot - a.pot)[0];
    if (sat) add(sat, "Out of the lineup. Regular minutes would speed up his growth.", "+0.7", "up");
  }
  if (league.phase === "regular") {
    const big = t.roster.map((id) => league.players[id]).filter(Boolean).map((p) => ({ p, m: milestonePace(league, p) })).filter((x) => x.m).sort((a, b) => b.m.pace - a.m.pace)[0];
    if (big) add(big.p, big.m.text, "+1", "up");
  }
  if (inSeason) {
    const base = plan.campOvrs || {};
    const risers = mine(league, t).filter((p) => base[p.id] != null && p.ovr - base[p.id] >= 1).sort((a, b) => (b.ovr - base[b.id]) - (a.ovr - base[a.id]) || b.ovr - a.ovr);
    for (const p of risers.slice(0, 2)) add(p, t.prospects.includes(p.id) ? `Up ${p.ovr - base[p.id]} since camp in the ${LEVELS[p.placement?.level]?.name || "AHL"}.` : `Up ${p.ovr - base[p.id]} since camp.`, sgn(p.ovr - base[p.id]), "up");
    const thriving = t.prospects.map((id) => league.players[id]).filter((p) => p?.placement?.year === league.year && p.placement.outcome === "thrive").sort((a, b) => b.ovr - a.ovr)[0];
    if (thriving) { const v = Math.round(projectSummer(league, t, thriving)); add(thriving, `Thriving in the ${LEVELS[thriving.placement.level]?.name} ${ROLES[thriving.placement.role].name} role. He'll grow faster this summer.`, sgn(v), v > 0 ? "up" : ""); }
  } else if (league.phase === "preseason") {
    const rows2 = (league.devReport?.year === league.year ? league.devReport.rows : []).filter((r) => r.tid === t.id && r.kinds.some((k) => k === "breakout" || k === "cornerstone"));
    for (const r of rows2.slice(0, 1)) add(league.players[r.pid], r.kinds.includes("cornerstone") ? "A cornerstone season paid off this summer." : "A breakout summer.", sgn(r.to - r.from), "up");
    const gambleP = t.prospects.map((id) => league.players[id]).filter((p) => p?.placement?.year === league.year && p.placement.st >= 35).sort((a, b) => b.placement.st - a.placement.st)[0];
    if (gambleP) add(gambleP, `${statusWord(gambleP.placement)}: ${placeText(gambleP.placement.level, gambleP.placement.role)} at ${gambleP.age}. ${gambleP.placement.st}% he struggles.`, `${gambleP.placement.st}%`, gambleP.placement.st >= 50 ? "down" : "");
  }
  // The biggest drop coming always makes the list.
  const top = rows.slice(0, 4);
  const drop = nextSummer(league, t).decline.find((r) => !seen.has(r.p.id));
  if (drop && drop.v <= -2) top.push({ pid: drop.p.id, name: drop.p.name, why: `${drop.p.age}. Expect a drop next summer.`, num: sgn(Math.round(drop.v)), tone: "down" });
  return top.slice(0, 5);
}
// The one line Home and the report use: "Up +11 since camp".
export function headline(league, t = league.teams[league.userTid]) {
  ensureDevPlan(league);
  const s = sinceCamp(league, t);
  if (s && league.phase !== "preseason") return { n: s.n, up: s.up, down: s.down, since: "camp", text: `${s.n >= 0 ? "Up" : "Down"} ${sgn(s.n)} since camp` };
  const l = lastSummer(league, t);
  if (l) return { n: l.n, up: l.up, down: l.down, since: "summer", text: `${l.n >= 0 ? "Up" : "Down"} ${sgn(l.n)} since last season` };
  return { n: null, since: null, text: t.devPlan?.locked ? "Plan locked in" : "Plan your season" };
}
export { sgn as signed };
export const traitName = (p) => DEV_TRAITS[p.dev]?.name || "Normal";

// The monthly line for the inbox (it never stops the sim).
export function monthlyNote(league) {
  const t = league.teams[league.userTid];
  const h = headline(league, t);
  const rows = worthKnowing(league, t).slice(0, 3);
  const bits = rows.map((r) => `${r.name} ${r.num}`).join(", ");
  return `📈 Development: ${h.text}.${bits ? ` Worth knowing: ${bits}.` : ""} The full report is under Development.`;
}
