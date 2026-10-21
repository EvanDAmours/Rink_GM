// End-of-season trophies, decided from season statistics the way the real
// voting tends to go: production and rate, team success, and position.
// Every player award names the most deserving player; team trophies go to the
// clubs that earned them. Nothing here changes a player's ratings.
import { isGoalie, isDefense } from "./constants.js";
import { savePct, gaa } from "./players.js";
import { progressAttributes } from "./ratings.js";

function rostered(league) {
  return Object.values(league.players).filter((p) => p.tid >= 0 && league.teams[p.tid]?.roster.includes(p.id));
}
const per60 = (p, v) => (p.stats.toi ? (v * 3600) / p.stats.toi : 0);
const pack = (p, why) => (p ? { pid: p.id, name: p.name, tid: p.tid, why } : null);
const best = (arr, f) => arr.reduce((b, p) => (!b || f(p) > f(b) ? p : b), null);
const fmt = (p) => p && `${p.stats.g}G ${p.stats.a}A ${p.stats.pts}P`;

export function computeAwards(league) {
  const ps = rostered(league);
  const gp = Math.max(1, ...league.teams.map((t) => t.rec.gp), ...ps.map((p) => p.stats.gp || 0));
  const minGp = Math.round(gp * 0.5), minG = Math.round(gp * 0.3);
  const skaters = ps.filter((p) => !isGoalie(p.pos) && p.stats.gp >= minGp);
  const goalies = ps.filter((p) => isGoalie(p.pos) && p.stats.gp >= minG);
  const teamPts = (p) => league.teams[p.tid].rec.pts;
  const teamPct = (p) => (league.teams[p.tid].rec.gp ? teamPts(p) / (2 * league.teams[p.tid].rec.gp) : 0.5);
  const topPts = Math.max(1, ...skaters.map((p) => p.stats.pts));

  // Scoring titles: points and goals, ties broken by goals then fewer games.
  const artRoss = best(skaters, (p) => p.stats.pts * 1e6 + p.stats.g * 1e3 - p.stats.gp);
  const rocket = best(skaters, (p) => p.stats.g * 1e6 + p.stats.pts * 1e3 - p.stats.gp);
  // Hart: value to his team. Points relative to the leader, goals, plus/minus
  // and how good his club was; a dominant goalie can win it.
  const hartScore = (p) => isGoalie(p.pos)
    ? (p.stats.gp >= gp * 0.55 && savePct(p.stats) >= 0.92 ? (savePct(p.stats) - 0.9) * 1400 + p.stats.w * 0.9 + p.stats.so * 2 + teamPct(p) * 40 - 22 : -99)
    : (p.stats.pts / topPts) * 60 + p.stats.g * 0.25 + Math.max(-10, Math.min(15, p.stats.pm)) * 0.5 + teamPct(p) * 40 + (isDefense(p.pos) ? 4 : 0);
  const hart = best([...skaters, ...goalies], hartScore);
  const tedLindsay = best(skaters, (p) => p.stats.pts * 1.0 + p.stats.g * 0.4 + per60(p, p.stats.pts) * 6);
  const norris = best(skaters.filter((p) => isDefense(p.pos)), (p) => p.stats.pts * 1.0 + Math.max(-10, Math.min(20, p.stats.pm)) * 0.6 + p.stats.blk * 0.06 + p.stats.toi / 3600 * 0.4 + teamPct(p) * 15);
  const vezina = best(goalies.filter((p) => p.stats.gp >= gp * 0.45), (p) => (savePct(p.stats) - 0.9) * 1500 - gaa(p.stats) * 6 + p.stats.w * 0.5 + p.stats.so * 1.5 + Math.min(p.stats.gp, 65) * 0.15);
  const rookies = [...skaters.filter((p) => p.rookie), ...goalies.filter((p) => p.rookie && p.stats.gp >= gp * 0.4)];
  const calder = best(rookies, (p) => (isGoalie(p.pos) ? (savePct(p.stats) - 0.9) * 1200 + p.stats.w * 1.1 + p.stats.so : p.stats.pts * 1.1 + p.stats.g * 0.35 + Math.max(-10, Math.min(15, p.stats.pm)) * 0.3 + (isDefense(p.pos) ? p.stats.toi / 3600 * 0.3 : 0)));
  // Selke: the best defensive forward. Defensive awareness, stick checking, shorthanded work,
  // blocks, faceoffs and plus/minus; scoring counts only a little and the top scorers rarely win it.
  const selke = best(skaters.filter((p) => !isDefense(p.pos) && p.stats.gp >= gp * 0.6), (p) => p.attrs.daw * 1.1 + p.attrs.stk * 0.4 + p.attrs.blk * 0.3 + Math.max(-10, Math.min(20, p.stats.pm)) * 0.5 + Math.min(p.stats.pts, 70) * 0.06 + (p.stats.fow - p.stats.fol) * 0.03 + p.stats.blk * 0.15 + p.stats.shg * 3 + p.stats.hit * 0.03);
  const ladyByng = best(skaters.filter((p) => p.stats.pim <= Math.max(12, gp * 0.3)), (p) => p.stats.pts - p.stats.pim * 1.2);
  const jenningsTeam = [...league.teams].filter((t) => goalies.some((p) => p.tid === t.id)).sort((a, b) => a.rec.ga - b.rec.ga || b.rec.gp - a.rec.gp)[0];
  const jenningsGoalies = goalies.filter((p) => p.tid === jenningsTeam?.id && p.stats.gp >= 25);
  // Jack Adams: the coach whose club most outperformed its roster.
  const expectation = (t) => { const r = t.roster.map((id) => league.players[id]?.ovr || 0).sort((a, b) => b - a).slice(0, 18); return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 75; };
  const jackTeam = [...league.teams].filter((t) => t.rec.gp).sort((a, b) => (b.rec.pts - (expectation(b) - 80) * 7) - (a.rec.pts - (expectation(a) - 80) * 7))[0];
  // Masterton: perseverance. A player who came back from a long injury to
  // produce, or a veteran who lifted his game well beyond last season.
  const lastPts = (p) => { const c = p.career?.at(-1); return c?.s ? (c.s.pts ?? (c.s.g || 0) + (c.s.a || 0)) : null; };
  const mastertonScore = (p) => {
    const back = (p.injuryHistory || []).some((i) => i.games >= 20 && i.year === league.year) || (p.longInjuryYear === league.year);
    const prev = lastPts(p);
    const jump = prev != null && p.age >= 27 ? (p.stats.pts - prev) : 0;
    return (back ? 25 + p.stats.pts * 0.6 : 0) + Math.max(0, jump) * 0.8 + (p.age >= 33 ? p.stats.pts * 0.25 : 0);
  };
  const masterton = best(skaters.filter((p) => mastertonScore(p) > 0), mastertonScore);
  // King Clancy (leadership and community): a respected veteran on a good club.
  const kingClancy = best(skaters.filter((p) => p.age >= 29 && p !== hart), (p) => (p.career?.length || 0) * 2 + p.stats.pts * 0.3 + teamPct(p) * 30 + (p.attrs.lea || p.attrs.oaw || 70) * 0.2 + Math.min(p.stats.gp, gp) * 0.1);
  // Mark Messier Leadership: the captain-type who carried a contender.
  const messier = best(skaters.filter((p) => p.age >= 26 && teamPct(p) >= 0.55 && p !== hart && p !== kingClancy), (p) => p.stats.pts * 0.5 + Math.max(0, p.stats.pm) * 0.5 + (league.teams[p.tid].rec.pts) * 0.3 + (p.attrs.lea || p.attrs.oaw || 70) * 0.3);
  // Jim Gregory GM of the Year: the club that improved most on last season's points.
  const lastYear = league.history?.[0]?.year === league.year - 1 ? league.seasonArchive?.find((s) => s.year === league.year - 1) : league.seasonArchive?.find((s) => s.year === league.year - 1);
  const improvement = (t) => { const prev = lastYear?.teams.find((x) => x.tid === t.id)?.rec.pts; return prev != null ? t.rec.pts - prev : t.rec.pts - 92; };
  const gregoryTeam = [...league.teams].filter((t) => t.rec.gp).sort((a, b) => (b.rec.pts * 0.5 + improvement(b)) - (a.rec.pts * 0.5 + improvement(a)))[0];
  // Willie O'Ree Community Hero: a long-serving player with deep roots in his city.
  const tenure = (p) => (p.career || []).filter((c) => c.t === league.teams[p.tid]?.abbr).length;
  const oree = best(ps.filter((p) => p.stats.gp >= minG), (p) => tenure(p) * 3 + p.age * 0.3 + Math.min(p.stats.gp, gp) * 0.05 + (p.attrs.lea || 70) * 0.1);
  // Team trophies.
  const presidents = [...league.teams].filter((t) => t.rec.gp).sort((a, b) => b.rec.pts - a.rec.pts || b.rec.rw - a.rec.rw)[0];

  const teamAward = (t, why) => (t ? { name: `${t.city} ${t.name}`, tid: t.id, team: true, why } : null);
  return {
    hart: pack(hart, hart && (isGoalie(hart.pos) ? `${hart.stats.w} W, ${savePct(hart.stats).toFixed(3).slice(1)} SV%` : fmt(hart))),
    tedLindsay: pack(tedLindsay, fmt(tedLindsay)),
    artRoss: pack(artRoss, artRoss && `${artRoss.stats.pts} points`),
    rocket: pack(rocket, rocket && `${rocket.stats.g} goals`),
    norris: pack(norris, fmt(norris)),
    vezina: pack(vezina, vezina && `${vezina.stats.w} W, ${savePct(vezina.stats).toFixed(3).slice(1)} SV%, ${gaa(vezina.stats).toFixed(2)} GAA`),
    calder: pack(calder, calder && (isGoalie(calder.pos) ? `${calder.stats.w} W, ${savePct(calder.stats).toFixed(3).slice(1)} SV%` : fmt(calder))),
    selke: pack(selke, selke && `${selke.stats.pm >= 0 ? "+" : ""}${selke.stats.pm}, ${fmt(selke)}`),
    ladyByng: pack(ladyByng, ladyByng && `${ladyByng.stats.pts} PTS, ${ladyByng.stats.pim} PIM`),
    jennings: jenningsGoalies.length ? { pid: jenningsGoalies[0].id, pids: jenningsGoalies.map((p) => p.id), name: jenningsGoalies.map((p) => p.name).join(" & "), tid: jenningsTeam.id, shared: jenningsGoalies.length > 1, why: `${jenningsTeam.rec.ga} team goals against` } : null,
    masterton: pack(masterton, masterton && `${fmt(masterton)} · perseverance and dedication`),
    kingClancy: pack(kingClancy, kingClancy && `leadership on and off the ice · ${fmt(kingClancy)}`),
    messier: pack(messier, messier && `led a ${league.teams[messier.tid].rec.pts}-point club · ${fmt(messier)}`),
    jackAdams: jackTeam ? { name: jackTeam.coach?.name || "Head coach", tid: jackTeam.id, why: `${jackTeam.rec.pts} points, well above roster expectations` } : null,
    jimGregory: gregoryTeam ? { name: gregoryTeam.id === league.userTid ? "You" : `${gregoryTeam.abbr} general manager`, tid: gregoryTeam.id, why: `${gregoryTeam.rec.pts} points${improvement(gregoryTeam) > 0 ? `, up ${improvement(gregoryTeam)} on last season` : ""}` } : null,
    willieORee: pack(oree, oree && `${Math.max(1, tenure(oree))} season${Math.max(1, tenure(oree)) === 1 ? "" : "s"} of community work in ${league.teams[oree.tid].city}`),
    presidents: teamAward(presidents, presidents && `${presidents.rec.pts} points, best regular season`),
  };
}

export function connSmythe(league, champTid) {
  const ps = rostered(league).filter((p) => p.tid === champTid);
  let bestP = null, bestV = -Infinity;
  for (const p of ps) {
    const s = p.pstats;
    const v = isGoalie(p.pos) ? (s.gp >= 8 ? (savePct(s) - 0.9) * 1200 + s.w * 1.6 + s.so * 2 : -99) : s.pts * 1.2 + s.g * 0.5 + Math.max(-5, Math.min(12, s.pm)) * 0.3;
    if (v > bestV) { bestV = v; bestP = p; }
  }
  if (!bestP) return null;
  const s = bestP.pstats;
  return { pid: bestP.id, name: bestP.name, tid: bestP.tid, why: isGoalie(bestP.pos) ? `${s.w} W, ${savePct(s).toFixed(3).slice(1)} SV%` : `${s.g}G ${s.a}A ${s.pts}P in the playoffs` };
}

// Conference champions, decided once the Final is set.
export function conferenceTrophies(league) {
  const final = league.playoffs?.rounds?.[3]?.[0];
  if (!final) return {};
  const t = (tid) => league.teams[tid];
  const east = [final.top, final.bot].find((id) => t(id).conf === "East"), west = [final.top, final.bot].find((id) => t(id).conf === "West");
  const award = (tid) => (tid != null ? { name: `${t(tid).city} ${t(tid).name}`, tid, team: true, why: "conference champions" } : null);
  return { princeOfWales: award(east), campbellBowl: award(west) };
}

export const AWARD_NAMES = {
  hart: "Hart Memorial Trophy", tedLindsay: "Ted Lindsay Award", artRoss: "Art Ross Trophy", rocket: "Maurice “Rocket” Richard Trophy",
  norris: "James Norris Memorial Trophy", vezina: "Vezina Trophy", calder: "Calder Memorial Trophy", selke: "Frank J. Selke Trophy",
  ladyByng: "Lady Byng Memorial Trophy", jennings: "William M. Jennings Trophy", masterton: "Bill Masterton Memorial Trophy",
  kingClancy: "King Clancy Memorial Trophy", messier: "Mark Messier Leadership Award", jackAdams: "Jack Adams Award",
  jimGregory: "Jim Gregory General Manager of the Year", willieORee: "Willie O’Ree Community Hero Award",
  connSmythe: "Conn Smythe Trophy", presidents: "Presidents’ Trophy", princeOfWales: "Prince of Wales Trophy", campbellBowl: "Clarence S. Campbell Bowl", stanley: "Stanley Cup",
};
export const AWARD_BLURB = {
  hart: "Most valuable to his team", tedLindsay: "Most outstanding player, voted by the players", artRoss: "Scoring leader", rocket: "Goal-scoring leader",
  norris: "Top defenseman", vezina: "Top goaltender", calder: "Top rookie", selke: "Best defensive forward", ladyByng: "Skill and sportsmanship",
  jennings: "Goalies on the club with the fewest goals against", masterton: "Perseverance and dedication", kingClancy: "Leadership and community",
  messier: "Leadership on and off the ice", jackAdams: "Coach of the year", jimGregory: "General manager of the year", willieORee: "Community hero",
  connSmythe: "Playoff MVP", presidents: "Best regular-season record", princeOfWales: "Eastern Conference champions", campbellBowl: "Western Conference champions", stanley: "Champions",
};

// ---------- NHL All-Star Teams (First, Second) and the All-Rookie Team ----------
// Picked when the regular season ends, position by position like the real ballots: a centre, a left
// wing, a right wing, two defencemen and a goalie on each team. What a player did (season stats)
// counts most, how good he is (rating) the rest. Making the First Team is worth +2 OVR the next
// season and the Second Team +1, tapering for players already near the top (Gridiron's All-Pro).
export const ALL_STAR_SLOTS = [
  { slot: "C", n: 1, of: (p) => p.pos === "C" },
  { slot: "LW", n: 1, of: (p) => p.pos === "LW" },
  { slot: "RW", n: 1, of: (p) => p.pos === "RW" },
  { slot: "D", n: 2, of: (p) => isDefense(p.pos) },
  { slot: "G", n: 1, of: (p) => isGoalie(p.pos) },
];
export const ALL_STAR_LABEL = { first: "First All-Star Team", second: "Second All-Star Team", rookie: "All-Rookie Team" };
const ALL_STAR_BOOST = { first: 2, second: 1, rookie: 0 };
// OVR gained next season for a team: nothing at 95+, at most +1 from 92 to 94.
export const allStarGain = (team, ovr) => { const g = ALL_STAR_BOOST[team] || 0; return ovr >= 95 ? 0 : ovr >= 92 ? Math.min(1, g) : g; };

const clampPm = (pm) => Math.max(-15, Math.min(20, pm || 0));
// What a player did this season, on a scale where a big season is around 100.
function production(p) {
  const s = p.stats || {};
  if (isGoalie(p.pos)) return (savePct(s) - 0.9) * 1500 - gaa(s) * 6 + (s.w || 0) * 0.5 + (s.so || 0) * 1.5 + Math.min(s.gp || 0, 65) * 0.15;
  if (isDefense(p.pos)) return (s.pts || 0) + clampPm(s.pm) * 0.6 + (s.blk || 0) * 0.06 + (s.toi || 0) / 3600 * 0.4;
  return (s.pts || 0) + (s.g || 0) * 0.35 + clampPm(s.pm) * 0.25 + (p.pos === "C" ? ((s.fow || 0) - (s.fol || 0)) * 0.01 : 0);
}
const statLine = (p) => (isGoalie(p.pos) ? `${p.stats.w} W, ${savePct(p.stats).toFixed(3).slice(1)} SV%` : `${p.stats.g}G ${p.stats.a}A ${p.stats.pts}P`);
// Ballot score: production and rating, each as a spread above or below the field at the position.
function ballot(field, bonus) {
  const z = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) || 1; return (x) => (x - m) / sd; };
  const zp = z(field.map(production)), zo = z(field.map((p) => p.ovr || 0));
  return field.map((p) => ({ p, score: zp(production(p)) * 0.65 + zo(p.ovr || 0) * 0.35 + (bonus[p.id] || 0) }));
}

// Returns { year, first, second, rookie }: each a list of { slot, pid, name, pos, tid, abbr, line }.
export function allStarTeams(league, awards = league.awards) {
  const ps = rostered(league).filter((p) => p.stats);
  const gp = Math.max(1, ...league.teams.map((t) => t.rec.gp));
  const enough = (p, f) => (p.stats.gp || 0) >= gp * f;
  // The trophy winners lead their position, as the voters' ballots do.
  const bonus = {};
  for (const [k, b] of [["hart", 0.6], ["norris", 0.9], ["vezina", 0.9], ["artRoss", 0.3], ["rocket", 0.3], ["tedLindsay", 0.3]]) if (awards?.[k]?.pid) bonus[awards[k].pid] = Math.max(bonus[awards[k].pid] || 0, b);
  const rookieBonus = awards?.calder?.pid ? { [awards.calder.pid]: 0.9 } : {};
  const entry = (p, slot) => ({ slot, pid: p.id, name: p.name, pos: p.pos, tid: p.tid, abbr: league.teams[p.tid]?.abbr || "", line: statLine(p) });
  const out = { year: league.year, first: [], second: [], rookie: [] };
  for (const sl of ALL_STAR_SLOTS) {
    const field = ps.filter((p) => sl.of(p) && enough(p, isGoalie(p.pos) ? 0.4 : 0.5));
    const ranked = field.length ? ballot(field, bonus).sort((a, b) => b.score - a.score) : [];
    ranked.slice(0, sl.n).forEach((x) => out.first.push(entry(x.p, sl.slot)));
    ranked.slice(sl.n, sl.n * 2).forEach((x) => out.second.push(entry(x.p, sl.slot)));
    // Rookies: the bar drops if a position has too few regulars, never below a quarter of the season.
    let rookies = [];
    for (const f of sl.slot === "G" ? [0.35, 0.2] : [0.4, 0.25]) { rookies = ps.filter((p) => p.rookie && sl.of(p) && enough(p, f)); if (rookies.length >= sl.n) break; }
    if (rookies.length) ballot(rookies, rookieBonus).sort((a, b) => b.score - a.score).slice(0, sl.n).forEach((x) => out.rookie.push(entry(x.p, sl.slot)));
  }
  return out;
}

// The best team each player made: pid -> "first" | "second" | "rookie" (the rookie team counts least).
export function allStarById(rec) {
  const out = {};
  if (!rec) return out;
  for (const e of rec.rookie || []) out[e.pid] = "rookie";
  for (const e of rec.second || []) out[e.pid] = "second";
  for (const e of rec.first || []) out[e.pid] = "first";
  return out;
}

// Next season's gain for the All-Star Teams, applied once per record. Returns [{ pid, name, tid, team, gain }].
export function applyAllStarGains(league, rec = league.allNHL) {
  if (!rec || rec.applied) return [];
  rec.applied = true;
  const out = [];
  for (const [pid, team] of Object.entries(allStarById(rec))) {
    const p = league.players[pid];
    if (!p) continue;
    const gain = Math.min(allStarGain(team, p.ovr), 99 - p.ovr);
    const before = p.ovr;
    if (gain > 0) {
      progressAttributes(p, gain);
      // Attribute noise can drift OVR; pull it back to the intended gain (as development does).
      const drift = p.ovr - (before + gain);
      if (Math.abs(drift) >= 1) progressAttributes(p, -drift);
      if ((p.pot || 0) < p.ovr) p.pot = p.ovr;
      p.peak = Math.max(p.peak || 0, p.ovr);
    }
    out.push({ pid: p.id, name: p.name, tid: p.tid, team, gain: p.ovr - before });
  }
  return out;
}

// ---------- Season milestones and league leaders (Gridiron 1.34 / 2.76) ----------
// Found at rollover from the regular season just played; development.js turns them into growth.
// at: the milestone; gap/ratio: how far ahead of the next man a lead must be to be a landslide.
export const SEASON_MILESTONES = [
  { key: "g", at: 40, label: "40 goals", of: (p) => !isGoalie(p.pos) },
  { key: "pts", at: 100, label: "100 points", of: (p) => !isGoalie(p.pos) },
  { key: "a", at: 60, label: "60 assists", of: (p) => !isGoalie(p.pos) },
  { key: "pts", at: 60, label: "60 points by a defenseman", of: (p) => isDefense(p.pos) },
  { key: "w", at: 35, label: "35 wins", of: (p) => isGoalie(p.pos) },
];
export const SEASON_LEADERS = [
  { key: "pts", label: "points", gap: 15, ratio: 1.12, of: (p) => !isGoalie(p.pos) },
  { key: "g", label: "goals", gap: 8, ratio: 1.15, of: (p) => !isGoalie(p.pos) },
  { key: "a", label: "assists", gap: 12, ratio: 1.15, of: (p) => !isGoalie(p.pos) },
  { key: "pts", label: "points by a defenseman", gap: 12, ratio: 1.15, of: (p) => isDefense(p.pos) },
  { key: "svp", label: "save percentage", gap: 0.007, ratio: 1, of: (p) => isGoalie(p.pos), fmt: (v) => v.toFixed(3).slice(1) },
];
export const isLandslide = (l, best, next) => best - next >= l.gap - 1e-9 && best >= next * l.ratio;
// id -> { hits: [labels], leads: [labels], landslides: [labels] } for everyone who earned something.
export function seasonMilestones(league) {
  const all = Object.values(league.players || {}).filter((p) => p && p.tid !== -2 && p.stats?.gp > 0);
  const teamGp = Math.max(1, ...league.teams.map((t) => t.rec?.gp || 0));
  const val = (p, k) => (k === "svp" ? (p.stats.gp >= Math.max(20, teamGp * 0.4) && p.stats.sa ? savePct(p.stats) : 0) : p.stats[k] || 0);
  const out = {};
  const get = (p) => (out[p.id] ||= { hits: [], leads: [], landslides: [] });
  for (const m of SEASON_MILESTONES) for (const p of all) if (m.of(p) && val(p, m.key) >= m.at) get(p).hits.push(m.label);
  for (const l of SEASON_LEADERS) {
    const ranked = all.filter(l.of).map((p) => [p, val(p, l.key)]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (!ranked.length || (ranked[1] && ranked[1][1] === ranked[0][1])) continue; // a tie leads nobody
    const [p, v] = ranked[0], next = ranked[1]?.[1] ?? 0, f = l.fmt || ((x) => x);
    if (isLandslide(l, v, next)) get(p).landslides.push(`led the league in ${l.label} by a landslide (${f(v)}, next best ${f(next)})`);
    else get(p).leads.push(`led the league in ${l.label} (${f(v)})`);
  }
  return out;
}
