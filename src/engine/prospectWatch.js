// Prospect watch: how the players you drafted are coming along in junior, college,
// Europe and the AHL, and in their first NHL years. Development itself is driven by
// the existing engine (age curve, farm work, focus training, usage). This adds:
//  - in-season growth ticks, so a prospect's rating moves during the year instead of
//    only at the summer rollover (the summer step subtracts what was already gained)
//  - per-season farm lines archived at rollover, so a kid's junior and AHL years are
//    readable later
//  - a report per prospect (level, league, season line, trend, pace, next step)
//  - a monthly "prospect report" for your inbox
import { isGoalie, isDefense } from "./constants.js";
import { computeOvr } from "./ratings.js";
import { TRAINING } from "./franchise.js";
import { weakestGroup, ageCurve } from "./developmentPlan.js";
import { stream, clamp } from "./rng.js";
import { savePct } from "./players.js";

const CHL = new Set(["OHL", "WHL", "QMJHL"]);
export function leagueLabel(p, farm = true) {
  if (!farm) return "NHL";
  const a = p.assignment || "ahl", lg = p.bio?.lg;
  if (a === "ahl") return "AHL";
  if (a === "junior") return lg && (CHL.has(lg) || /U20|U18|USHL|J20/.test(lg)) ? lg : "Junior";
  if (a === "college") return lg && /NCAA|Hockey East|Big Ten|NCHC|ECAC|CCHA|Atlantic Hockey/.test(lg) ? lg : "NCAA";
  if (a === "europe") return lg && !CHL.has(lg) && !/NCAA/.test(lg) ? lg : "Europe";
  return a.toUpperCase();
}
export const WATCH_AGE = 24;
export const isProspectWatch = (league, t, p) => t.prospects.includes(p.id) || (p.age <= WATCH_AGE && (p.draft?.year >= league.year - 3 || p.rookie || (p.career?.length || 0) <= 2));

// Season line for a farm player (this year's farm stats) or an NHL player (NHL stats).
export function seasonLine(p, farm) {
  const s = farm ? p.farmStats || {} : p.stats || {};
  if (isGoalie(p.pos)) return { gp: s.gp || 0, w: s.w || 0, svpct: s.sa ? (s.sa - (s.ga || 0)) / s.sa : null, text: s.gp ? `${s.gp} GP · ${s.w || 0} W · ${s.sa ? `.${Math.round(((s.sa - (s.ga || 0)) / s.sa) * 1000).toString().padStart(3, "0")}` : "—"}` : "No games yet" };
  const g = s.g || 0, a = s.a || 0;
  return { gp: s.gp || 0, g, a, pts: g + a, text: s.gp ? `${s.gp} GP · ${g} G · ${a} A · ${g + a} PTS` : "No games yet" };
}

// Rating at the start of this season, from the weekly history or last summer's archive.
export function seasonStartOvr(league, p) {
  const h = (p.progress || []).filter((x) => x.year === league.year);
  if (h.length) return h[0].from;
  const d = (p.developmentHistory || []).find((x) => x.year === league.year);
  if (d) return d.ovr;
  const r = (p.ratingHistory || []).at(-1);
  return r ? r.ovr + (p.lastChange || 0) : p.ovr;
}

// Rating path this season for a sparkline: weekly points, de-duplicated.
export function ratingPath(league, p) {
  const pts = (p.developmentHistory || []).filter((x) => x.year === league.year).map((x) => ({ week: x.week, ovr: x.ovr }));
  const out = [];
  for (const x of pts) if (!out.length || out.at(-1).week !== x.week) out.push(x);
  if (!out.length) out.push({ week: Math.floor((league.day || 0) / 7), ovr: p.ovr });
  if (out.at(-1).ovr !== p.ovr) out.push({ week: Math.floor((league.day || 0) / 7), ovr: p.ovr });
  return out;
}

const NHL_READY = 76;
export function etaText(p) {
  if (p.ovr >= NHL_READY) return "Now";
  if (p.pot < 74) return "Depth ceiling";
  const gap = NHL_READY - p.ovr;
  const pace = Math.max(0.8, ageCurve(p));
  const yrs = Math.ceil(gap / pace);
  return yrs <= 1 ? "Next season" : `~${yrs} years`;
}

// One prospect's report card.
export function prospectReport(league, t, p) {
  const farm = t.prospects.includes(p.id);
  const line = seasonLine(p, farm);
  const start = seasonStartOvr(league, p);
  const delta = p.ovr - start;
  const path = ratingPath(league, p);
  const recent = path.length >= 3 ? p.ovr - path[Math.max(0, path.length - 9)].ovr : delta;
  const level = leagueLabel(p, farm);
  const role = p.farmRole || "middle";
  const gp = line.gp;
  // Production relative to the level: is he dominating, holding his own, or drowning?
  let prod = null;
  if (gp >= 5) {
    if (isGoalie(p.pos)) prod = line.svpct == null ? null : line.svpct >= 0.915 ? "dominant" : line.svpct >= 0.9 ? "solid" : "struggling";
    else { const ppg = line.pts / gp, bar = isDefense(p.pos) ? 0.45 : 0.85; prod = ppg >= bar * 1.3 ? "dominant" : ppg >= bar * 0.7 ? "solid" : "struggling"; }
  }
  const flags = [];
  let next = null;
  if (farm) {
    if (p.ovr >= NHL_READY && p.signed !== false) { flags.push("NHL ready"); next = { kind: "callup", label: "Ready for a call-up" }; }
    else if (prod === "dominant" && role !== "top") { flags.push("Dominating"); next = { kind: "role", label: "Give him a top role" }; }
    else if (prod === "dominant" && p.assignment !== "ahl" && p.signed !== false && !(p.age < 20 && CHL.has(p.bio?.lg))) { flags.push("Dominating"); next = { kind: "assign", label: "Move him up to the AHL" }; }
    else if (prod === "struggling" && role === "top") { flags.push("Struggling"); next = { kind: "role", label: "Ease him into a middle role" }; }
    else if (p.signed === false && p.age >= 22) { flags.push("Unsigned"); next = { kind: "sign", label: "Sign him or lose his rights" }; }
    else if (delta <= 0 && gp >= 20 && p.age >= 22) { flags.push("Stalled"); next = { kind: "focus", label: "Put him in the development plan" }; }
  } else {
    if (p.stats.gp >= 10 && p.stats.toi / Math.max(1, p.stats.gp) < 600 && p.age <= 21 && t.prospects.length) { flags.push("Low minutes"); next = { kind: "senddown", label: "Minutes in the AHL would help" }; }
    else if (delta >= 2) flags.push("Rising");
  }
  if (p.injury > 0) { flags.unshift(`Injured ${p.injury}g`); }
  const trend = delta >= 3 ? "surging" : delta >= 1 ? "up" : delta <= -1 ? "down" : "flat";
  return { p, farm, level, line, start, delta, recent, trend, prod, flags, next, eta: etaText(p), path, role, drafted: p.draft ? `${p.draft.year} R${p.draft.round} #${p.draft.pick}` : null, focus: t.training?.assignments?.[p.id] || null };
}
export function prospectWatch(league, t = league.teams[league.userTid]) {
  return [...t.prospects, ...t.roster].map((id) => league.players[id]).filter((p) => p && isProspectWatch(league, t, p)).map((p) => prospectReport(league, t, p))
    .sort((a, b) => (b.farm === a.farm ? b.p.pot - a.p.pot || b.p.ovr - a.p.ovr : a.farm ? -1 : 1));
}

// In-season growth: every four weeks a young player with room to his ceiling can
// gain a point, more likely when he plays a lot at a level that challenges him and
// when he has a strong development trait. What he gains now is subtracted from
// next summer's step, so a season's total growth is unchanged; it just arrives
// while you are watching.
export function inSeasonGrowth(league) {
  if (league.phase !== "regular") return [];
  const week = Math.floor(league.day / 7);
  if (week === 0 || week % 4 !== 0) return [];
  league.growthWeek ||= {};
  if (league.growthWeek[league.year] === week) return [];
  league.growthWeek[league.year] = week;
  const moved = [];
  for (const t of league.teams) for (const id of [...t.roster, ...t.prospects]) {
    const p = league.players[id];
    if (!p || p.age > WATCH_AGE || p.ovr >= p.pot || p.injury > 0) continue;
    const farm = t.prospects.includes(id);
    const curve = Math.max(0, ageCurve(p));
    const usage = farm ? clamp((p.farmWork || 0) / (week * 1.2), 0.3, 1.3) : clamp((p.stats.gp ? p.stats.toi / p.stats.gp / (isDefense(p.pos) ? 1200 : 900) : 0.3) + 0.4, 0.4, 1.3);
    const already = p.inSeasonGain?.year === league.year ? p.inSeasonGain.n : 0;
    const expected = curve * 0.55; // roughly half of a summer's growth shows up in season
    const left = Math.max(0, expected - already);
    const chance = clamp(left / 2.2 * usage, 0, 0.75);
    const r = stream(`${id}|grow|${league.year}|${week}`);
    if (r.next() > chance) continue;
    const before = p.ovr;
    const grp = TRAINING[weakestGroup(p)] || TRAINING[isGoalie(p.pos) ? "goaltending" : "skating"];
    for (const k of grp.keys) if (Number.isFinite(p.attrs[k])) p.attrs[k] = clamp(p.attrs[k] + 1, 40, 99);
    p.ovr = Math.min(99, Math.max(40, computeOvr(p.attrs, p.type) + (p.ovrOffset || 0)));
    if (p.ovr <= before) { p.ovrOffset = (p.ovrOffset || 0) + 1; p.ovr = Math.min(99, before + 1); }
    const gain = p.ovr - before;
    if (gain <= 0) continue;
    p.inSeasonGain = { year: league.year, n: already + gain };
    (p.progress ||= []).push({ year: league.year, week, from: before, to: p.ovr, note: `${grp.name} +1` });
    if (p.progress.length > 40) p.progress.shift();
    p.pot = Math.max(p.pot, p.ovr);
    moved.push({ pid: id, tid: t.id, name: p.name, from: before, to: p.ovr, group: grp.name, farm });
  }
  return moved;
}

// Monthly inbox note for your own club: who moved, who is dominating, who needs a decision.
export function prospectReportNote(league, moved = []) {
  const t = league.teams[league.userTid];
  const week = Math.floor(league.day / 7);
  if (league.phase !== "regular" || week === 0 || week % 4 !== 0) return;
  league.prospectNoteWeek ||= {};
  if (league.prospectNoteWeek[league.year] === week) return;
  league.prospectNoteWeek[league.year] = week;
  const rows = prospectWatch(league, t);
  const mine = moved.filter((m) => m.tid === t.id);
  const parts = [];
  if (mine.length) parts.push(`Up this month: ${mine.slice(0, 4).map((m) => `${m.name} ${m.from}→${m.to}`).join(", ")}.`);
  const dom = rows.filter((r) => r.prod === "dominant").slice(0, 2);
  if (dom.length) parts.push(`Dominating: ${dom.map((r) => `${r.p.name} (${r.level}, ${r.line.text})`).join("; ")}.`);
  const decisions = rows.filter((r) => r.next).slice(0, 2);
  if (decisions.length) parts.push(`Decisions: ${decisions.map((r) => `${r.p.name} · ${r.next.label.toLowerCase()}`).join("; ")}.`);
  if (!parts.length) parts.push("Quiet month on the farm; nobody moved.");
  league.inbox?.push({ year: league.year, day: league.day, text: `📈 Prospect report: ${parts.join(" ")} Full picture under Front Office → Development.` });
  league.news ||= [];
  const star = mine.sort((a, b) => b.to - a.to)[0];
  if (star) league.news.unshift({ year: league.year, day: league.day, type: "prospect", pid: star.pid, text: `Prospect watch: ${star.name} is up to ${star.to} overall after a strong month${star.farm ? ` in the ${leagueLabel(league.players[star.pid])}` : ""}.` });
}

// Archive this season's farm line at rollover; called before the year changes.
export function archiveFarmSeasons(league) {
  for (const t of league.teams) for (const id of t.prospects) {
    const p = league.players[id];
    if (!p?.farmStats?.gp) continue;
    (p.farmHistory ||= []).push({ ...p.farmStats, year: league.year, lg: leagueLabel(p), role: p.farmRole || "middle" });
    if (p.farmHistory.length > 12) p.farmHistory.shift();
  }
  for (const p of Object.values(league.players)) {
    if (p.farmStats) p.farmStats = { gp: 0, g: 0, a: 0, w: 0, sa: 0, ga: 0, year: league.year + 1 };
    // Weekly development points only feed this season's prospect sparkline; the per-season
    // line lives in farmHistory. Dropping older weeks keeps saves from growing every year.
    if (p.developmentHistory?.length) p.developmentHistory = p.developmentHistory.filter((x) => x.year >= league.year);
  }
}
