// The development desk: what each player is likely to do next summer, where his focus
// should go, and how much banked training work he has. Built on the existing mechanics
// (age curve in developPlayer, usage growth, weekly training bank, farm work) so nothing
// about how players actually grow changes; this only makes it visible and easier to steer.
import { isGoalie, isDefense } from "./constants.js";
import { TRAINING, setTraining } from "./franchise.js";
import { usageGrowth } from "./development.js";
import { DEV_TRAITS } from "./players.js";

export const FOCUS_SLOTS = 3;
const DEV_GROWTH = { superstar: 0.9, star: 0.45, normal: 0, late: 0 };

// Mirrors the age curve in developPlayer (mean change per summer).
export function ageCurve(p) {
  const age = isGoalie(p.pos) ? p.age - 3 : isDefense(p.pos) ? p.age - 1 : p.age;
  let mean = age <= 19 ? 3 : age <= 21 ? 2.2 : age <= 23 ? 1.4 : age <= 25 ? 0.6 : age <= 27 ? 0 : age <= 29 ? -0.6 : age <= 31 ? -1.3 : age <= 33 ? -2.2 : -3.2;
  if (p.age <= 25) {
    const gap = p.pot - p.ovr;
    mean += gap > 0 ? Math.min(1.5, gap * 0.12) : gap * 0.3;
    mean += DEV_GROWTH[p.dev] || 0;
    if (p.dev === "late") mean += age <= 21 ? -0.7 : 0.8;
  }
  if (p.ovr >= 88 && mean > 0) mean = Math.max(0, mean - (p.ovr - 86) * 0.3);
  return mean;
}
export function focusWork(league, t, p) {
  const e = t.training?.earned?.[p.id] || {};
  return Object.entries(e).map(([k, w]) => ({ focus: k, name: TRAINING[k]?.name, work: w, gain: Math.min(2.5, w / 18), pct: Math.min(100, Math.round((w / 45) * 100)) }));
}
export function groupAverages(p) {
  return Object.entries(TRAINING).filter(([k]) => isGoalie(p.pos) === (k === "goaltending")).map(([k, g]) => { const ks = g.keys.filter((x) => Number.isFinite(p.attrs[x])); return { focus: k, name: g.name, avg: ks.length ? ks.reduce((s, x) => s + p.attrs[x], 0) / ks.length : 0 }; }).sort((a, b) => a.avg - b.avg);
}
export function weakestGroup(p) { return groupAverages(p)[0]?.focus; }
// Expected OVR change next summer: age curve + usage + banked training.
export function outlook(league, t, p) {
  const age = ageCurve(p);
  const usage = usageGrowth(league, p) || 0;
  const training = focusWork(league, t, p).reduce((s, f) => s + f.gain, 0) * 0.6;
  const total = age + usage + training;
  const label = total >= 2.5 ? "Rising fast" : total >= 1 ? "Improving" : total > -0.5 ? "Holding" : total > -2 ? "Declining" : "Fading";
  return { age, usage, training, total, label, trait: DEV_TRAITS[p.dev]?.name || null };
}
export function focusCandidates(league, t) {
  return [...t.roster, ...t.prospects].map((id) => league.players[id]).filter((p) => p && p.injury <= 0)
    .map((p) => ({ p, score: (p.age <= 25 ? 3 : p.age <= 28 ? 1 : 0) + Math.max(0, p.pot - p.ovr) * 0.4 + (p.dev === "superstar" ? 2 : p.dev === "star" ? 1 : 0) + (t.roster.includes(p.id) ? 0.5 : 0) }))
    .sort((a, b) => b.score - a.score || b.p.ovr - a.p.ovr);
}
// Fill every open focus slot with the best young candidates, each on his weakest group.
export function autoFocus(league) {
  const t = league.teams[league.userTid];
  const a = t.training.assignments;
  let n = 0;
  for (const { p } of focusCandidates(league, t)) {
    if (Object.keys(a).filter((id) => league.players[id]?.tid === t.id).length >= FOCUS_SLOTS) break;
    if (a[p.id]) continue;
    const r = setTraining(league, p.id, weakestGroup(p));
    if (r.ok) n++;
  }
  return { ok: true, msg: n ? `${n} player${n === 1 ? "" : "s"} added to the development plan.` : "Every focus slot is already in use." };
}
