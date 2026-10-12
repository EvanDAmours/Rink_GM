// NHL 84-game matrix: division 28, other conference division 24, opposite conference 32.
import realSchedule from "../data/schedule2026.json" with { type: "json" };
import { shuffle, rand, randInt } from "./rng.js";

export function generateSchedule(teams) {
  const games = [];
  const add = (h, a) => games.push({ h, a });
  const byDiv = {};
  for (const t of teams) (byDiv[t.div] ||= []).push(t.id);

  for (const div in byDiv) {
    const ids = shuffle([...byDiv[div]]);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        add(ids[i], ids[j]); add(ids[i], ids[j]);
        add(ids[j], ids[i]); add(ids[j], ids[i]);
      }
    }
  }

  const confs = {};
  for (const t of teams) (confs[t.conf] ||= new Set()).add(t.div);
  for (const conf in confs) {
    const [d1, d2] = [...confs[conf]];
    const A = byDiv[d1];
    const B = byDiv[d2];
    for (let i = 0; i < A.length; i++) {
      for (let j = 0; j < B.length; j++) {
        if ((i + j) % 2 === 0) { add(A[i], B[j]); add(A[i], B[j]); add(B[j], A[i]); }
        else { add(B[j], A[i]); add(B[j], A[i]); add(A[i], B[j]); }
      }
    }
  }

  const east = teams.filter((t) => t.conf === "East").map((t) => t.id);
  const west = teams.filter((t) => t.conf === "West").map((t) => t.id);
  for (const e of east) for (const w of west) { add(e, w); add(w, e); }

  return packDays(games, teams.length);
}


function packDays(games, nTeams) {
  let remaining = shuffle(games.map((g, i) => ({ ...g, id: i })));
  const left = new Array(nTeams).fill(0);
  for (const g of remaining) { left[g.h]++; left[g.a]++; }
  const played = new Array(nTeams).fill(null).map(() => []);
  const out = [];
  let day = 0;
  while (remaining.length) {
    const dow = day % 7;
    const target = dow === 5 || dow === 1 ? randInt(10, 14) : randInt(5, 10);
    const busy = new Set();
    const prio = remaining.map((g) => ({ g, k: left[g.h] + left[g.a] + rand() * 8 })).sort((x, y) => y.k - x.k);
    const today = [];
    for (const { g } of prio) {
      if (today.length >= target) break;
      if (busy.has(g.h) || busy.has(g.a)) continue;
      if (threeInThree(played[g.h], day) || threeInThree(played[g.a], day)) continue;
      today.push(g);
      busy.add(g.h);
      busy.add(g.a);
    }
    const ids = new Set(today.map((g) => g.id));
    for (const g of today) {
      left[g.h]--;
      left[g.a]--;
      played[g.h].push(day);
      played[g.a].push(day);
      out.push({ id: out.length, day, h: g.h, a: g.a, played: false });
    }
    remaining = remaining.filter((g) => !ids.has(g.id));
    day++;
    if (day > 400) throw new Error("schedule packing failed");
  }
  return out;
}

function threeInThree(days, day) {
  const n = days.length;
  return n >= 2 && days[n - 1] === day - 1 && days[n - 2] === day - 2;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function dayToDate(year, day, start = `${year}-09-29`) {
  const d = new Date(Date.parse(start + "T12:00:00Z") + day * 86400000);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
export function lastDay(schedule) {
  return schedule.reduce((m, g) => Math.max(m, g.day), 0);
}

// Pure adapter shared by the bundled fixture snapshot, refreshed NHL API data, and imports.
// Never attach today's real results: a franchise always starts with unplayed games.
export function normalizeSchedule(data, teams, year) {
  const raw = Array.isArray(data) ? data : data?.games;
  if (!Array.isArray(raw)) throw new Error("Schedule must contain a games array.");
  const byAbbr = Object.fromEntries(teams.map((t) => [t.abbr, t.id]));
  const alias = (a) => a === "UTAH" ? "UTA" : a;
  const regular = raw.filter((g) => g.gameType == null || Number(g.gameType) === 2);
  const rows = regular.map((g) => ({
    date: g.gameDate || g.date,
    h: byAbbr[alias(g.homeTeam?.abbrev || g.h)],
    a: byAbbr[alias(g.awayTeam?.abbrev || g.a)],
    nhlId: g.id ?? null,
    startTimeUTC: g.startTimeUTC || null,
    venue: typeof g.venue === "string" ? g.venue : g.venue?.default || "",
  })).sort((a, b) => a.date?.localeCompare(b.date) || (a.startTimeUTC || "").localeCompare(b.startTimeUTC || ""));
  const start = rows[0]?.date;
  const expected = year >= 2026 ? 84 : 82;
  if (rows.length !== teams.length * expected / 2) throw new Error(`Expected ${teams.length * expected / 2} regular-season games; received ${rows.length}.`);
  const counts = new Map(teams.map((t) => [t.id, { gp: 0, home: 0 }]));
  const busy = new Set();
  const ids = new Set();
  const schedule = rows.map((g, id) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(g.date || "") || !Number.isFinite(Date.parse(g.date)) || !g.date.startsWith(String(year)) && !g.date.startsWith(String(year + 1))) throw new Error("Invalid date or wrong season in schedule.");
    if (g.h == null || g.a == null || g.h === g.a) throw new Error("Unrecognized teams in schedule.");
    if (g.nhlId != null && ids.has(g.nhlId)) throw new Error("Duplicate NHL game ID.");
    ids.add(g.nhlId);
    for (const tid of [g.h, g.a]) {
      const key = `${g.date}:${tid}`;
      if (busy.has(key)) throw new Error("A team appears twice on the same game date.");
      busy.add(key); counts.get(tid).gp++;
    }
    counts.get(g.h).home++;
    return { ...g, id, day: Math.round((Date.parse(g.date) - Date.parse(start)) / 86400000), played: false };
  });
  for (const t of teams) if (counts.get(t.id).gp !== expected || counts.get(t.id).home !== expected / 2) throw new Error(`${t.abbr} does not have ${expected} games and ${expected / 2} home games.`);
  return { schedule, startDate: start };
}

export function buildSeasonSchedule(league) {
  if (league.mode === "real" && league.year === realSchedule.season) {
    const { schedule, startDate } = normalizeSchedule(realSchedule, league.teams, league.year);
    league.scheduleStart = startDate;
    league.scheduleInfo = { kind: realSchedule.kind || "snapshot", label: realSchedule.kind === "official" ? "NHL API regular-season schedule" : "2026–27 NHL fixtures · calendar snapshot", source: realSchedule.source, retrieved: realSchedule.retrieved };
    return schedule;
  }
  league.scheduleStart = `${league.year}-09-29`;
  league.scheduleInfo = { kind: "generated", label: "Generated NHL-format schedule" };
  return generateSchedule(league.teams);
}

export function importSeasonSchedule(league, data) {
  if (league.phase !== "preseason" || league.schedule.some((g) => g.played)) return { ok: false, msg: "Replace a schedule before the season starts." };
  try {
    const { schedule, startDate } = normalizeSchedule(data, league.teams, league.year);
    league.schedule = schedule; league.scheduleStart = startDate;
    league.scheduleInfo = { kind: "imported", label: "Imported NHL schedule", source: data.source || "User import" };
    league.day = 0; league.deadlineDay = Math.floor(lastDay(schedule) * 0.78);
    return { ok: true, msg: `Imported ${schedule.length} games. Every team has ${schedule.length * 2 / league.teams.length} games.` };
  } catch (e) { return { ok: false, msg: e.message }; }
}
