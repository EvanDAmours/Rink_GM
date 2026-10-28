// The Legacy Hall (Gridiron's Legacy Hall, translated): what the Banners, Trophies, Hall of Fame,
// Ring of Honour, Records and League awards screens show. Pure: reads the league, never writes.
import { CUP_HISTORY } from "../data/cupHistory.js";
import { RETIRED_NUMBERS, HALL_OF_FAME, LEAGUE_RETIRED } from "../data/hallOfFame.js";
import { computeAwards, conferenceTrophies } from "./awards.js";
import { gmCareer } from "./legacy.js";

export const seasonText = (y) => `${y}–${String(y + 1).slice(2)}`;

// The League awards screen, row by row (Evan's groups).
export const AWARD_ROWS = [
  ["team", "Team trophies", ["stanley", "presidents", "connSmythe", "princeOfWales", "campbellBowl"]],
  ["play", "Scoring and performance", ["hart", "tedLindsay", "artRoss", "rocket", "norris", "vezina", "calder", "selke", "jennings", "ladyByng"]],
  ["lead", "Leadership", ["messier", "kingClancy", "masterton", "willieORee"]],
  ["office", "Front office", ["jackAdams", "jimGregory"]],
];
export const AWARD_SHORT = {
  stanley: "Stanley Cup", presidents: "Presidents' Trophy", connSmythe: "Conn Smythe", princeOfWales: "Prince of Wales", campbellBowl: "Campbell Bowl",
  hart: "Hart", tedLindsay: "Ted Lindsay", artRoss: "Art Ross", rocket: "Rocket Richard", norris: "Norris", vezina: "Vezina", calder: "Calder",
  selke: "Selke", jennings: "Jennings", ladyByng: "Lady Byng", messier: "Mark Messier", kingClancy: "King Clancy", masterton: "Masterton",
  willieORee: "Willie O'Ree", jackAdams: "Jack Adams", jimGregory: "GM of the Year",
};
// Awards won by players (the Trophies screen's Player awards shelf), in the order they stand.
export const PLAYER_AWARDS = ["hart", "connSmythe", "tedLindsay", "artRoss", "rocket", "norris", "vezina", "calder", "selke", "jennings", "ladyByng", "messier", "kingClancy", "masterton", "willieORee"];
const TEAM_KINDS = new Set(["stanley", "presidents", "princeOfWales", "campbellBowl"]);

// Which club the user ran in a season (league.career.jobs, else the club picked at the start).
export function ranAt(league, y) {
  const jobs = league.career?.jobs || [{ tid: league.userTid, start: league.startYear || league.year }];
  return jobs.find((j) => y >= j.start && (j.end == null || y <= j.end))?.tid;
}
const archived = (league) => (league.history || []).some((h) => h.year === league.year);

// Every season's awards, newest first: the finished seasons, then this one once it's decided (or
// the race as it stands, from ten games in). Old saves' seasons get their Cup and Presidents'
// Trophy back from the season's champion fields.
export function awardSeasons(league) {
  const out = [];
  const t = (tid) => league.teams[tid];
  const teamAward = (tid, why) => (tid != null && t(tid) ? { name: `${t(tid).city} ${t(tid).name}`, tid, team: true, why } : null);
  if (!archived(league)) {
    const now = league.awards && Object.keys(league.awards).length > 3 ? { ...league.awards } : null;
    if (now) {
      const po = league.playoffs;
      if (po?.champion != null && !now.stanley) now.stanley = teamAward(po.champion, "Stanley Cup champions");
      if (po?.rounds?.[3]?.[0]) for (const [k, a] of Object.entries(conferenceTrophies(league))) if (a && !now[k]) now[k] = a;
      const f = po?.champion != null ? po.rounds?.[3]?.[0] : null;
      out.push({ year: league.year, awards: now, projected: false, runnerUp: f ? (f.top === po.champion ? f.bot : f.top) : null, final: f ? { wins: Math.max(f.wTop, f.wBot), losses: Math.min(f.wTop, f.wBot) } : null });
    } else if (["regular", "playoffs"].includes(league.phase) && (league.teams[league.userTid]?.rec?.gp || 0) >= 10) {
      try { out.push({ year: league.year, awards: computeAwards(league), projected: true }); } catch { /* no race yet */ }
    }
  }
  for (const h of league.history || []) {
    const a = { ...(h.awards || {}) };
    if (!a.stanley && h.champion != null) a.stanley = teamAward(h.champion, "Stanley Cup champions");
    if (!a.presidents && h.presidents != null) a.presidents = teamAward(h.presidents, "Best regular-season record");
    out.push({ year: h.year, awards: a, projected: false, final: h.cupFinal || null, runnerUp: h.runnerUp });
  }
  return out;
}

// ONE number for a tile: the stat that decided the award. league: names the Cup Final's loser.
export function awardStat(kind, a, season, league) {
  const w = String(a?.why || "");
  const pick = (re) => w.match(re)?.[0] || null;
  const pts = () => { const m = w.match(/(\d+)P\b/) || w.match(/(\d+) (?:points|PTS)/); return m ? `${m[1]} pts` : null; };
  switch (kind) {
    case "stanley": {
      const opp = season?.runnerUp != null ? league?.teams?.[season.runnerUp]?.abbr : null;
      const f = season?.final;
      return opp ? `Beat ${opp}${f?.wins != null ? ` ${f.wins}-${f.losses}` : " in the Final"}` : "Champions";
    }
    case "princeOfWales": return "East champions";
    case "campbellBowl": return "West champions";
    case "presidents": case "jackAdams": return pts() || w.split(",")[0];
    case "jimGregory": { const up = w.match(/up (\d+)/); return up ? `+${up[1]} pts` : pts() || w; }
    case "rocket": return pick(/\d+ goals/) || pts();
    case "artRoss": return pts();
    case "vezina": return pick(/\.\d{3} SV%/) || w.split(",")[0];
    case "jennings": return (pick(/\d+ team goals against/) || w).replace("team goals against", "GA");
    case "selke": return pick(/[+−-]\d+/) || pts();
    case "ladyByng": return pick(/\d+ PIM/) || pts();
    case "willieORee": return pick(/\d+ seasons?/)?.replace(/^(\d+) seasons?$/, (m, n) => `${n} season${n === "1" ? "" : "s"} here`) || w;
    default: return pick(/\.\d{3} SV%/) || pts() || w.split(" · ")[0];
  }
}

// The club's Stanley Cups, oldest first: the real ones (calendar year of the Final) and the ones
// won in your league (this season's counts from the moment the Final ends).
export function cupShelf(league, tid = league.userTid) {
  const club = league.teams[tid];
  const real = CUP_HISTORY.filter((c) => c.abbr === club.abbr).map((c) => ({ key: `r${c.year}`, sort: c.year - 1, plaque: String(c.year), real: true, title: `${c.year} Stanley Cup`, line: "NHL history" }));
  const won = (league.history || []).filter((h) => h.champion === tid).map((h) => ({ key: `s${h.year}`, sort: h.year, plaque: seasonText(h.year), year: h.year, title: `${seasonText(h.year)} Stanley Cup`, line: `Beat the ${league.teams[h.runnerUp]?.name || "—"}${h.cupFinal?.wins != null ? ` ${h.cupFinal.wins}-${h.cupFinal.losses}` : ""}${ranAt(league, h.year) === tid ? " · with you as GM" : ""}` }));
  const po = league.playoffs;
  if (!archived(league) && po?.champion === tid) {
    const f = po.rounds?.[3]?.[0];
    won.push({ key: `s${league.year}`, sort: league.year, plaque: seasonText(league.year), year: league.year, title: `${seasonText(league.year)} Stanley Cup`, line: f ? `Beat the ${league.teams[f.top === tid ? f.bot : f.top]?.name} ${Math.max(f.wTop, f.wBot)}-${Math.min(f.wTop, f.wBot)}` : "Champions" });
  }
  return [...real, ...won].sort((a, b) => a.sort - b.sort);
}

// The trophies your club's players won with you as GM: one per award, most recent winners first.
export function playerAwardShelf(league, tid = league.userTid) {
  const by = new Map();
  for (const s of awardSeasons(league)) {
    if (s.projected || ranAt(league, s.year) !== tid) continue;
    for (const k of PLAYER_AWARDS) {
      const a = s.awards[k];
      if (!a || a.tid !== tid || a.team) continue;
      if (!by.has(k)) by.set(k, []);
      by.get(k).push({ year: s.year, name: a.name, pid: a.pid ?? null });
    }
  }
  return PLAYER_AWARDS.filter((k) => by.has(k)).map((k) => ({ kind: k, n: by.get(k).length, winners: by.get(k).sort((a, b) => b.year - a.year) }));
}

// The section hero's numbers.
export function legacyCounts(league, tid = league.userTid) {
  const club = league.teams[tid];
  const nums = new Set((RETIRED_NUMBERS[club.abbr] || []).map(([n]) => n));
  for (const [n] of LEAGUE_RETIRED) nums.add(n);
  for (const x of league.numberRetirements || []) if (x.tid === tid) nums.add(x.number);
  const hof = (HALL_OF_FAME[club.abbr] || []).length + (league.hallOfFame || []).filter((h) => h.tid === tid).length;
  const g = gmCareer(league);
  const rec = league.teams[league.userTid]?.rec || {};
  const now = !(league.seasonArchive || []).some((x) => x.year === league.year) && (rec.w || 0) + (rec.l || 0) + (rec.otl || 0) > 0;
  return { cups: cupShelf(league, tid).length, numbers: nums.size, hof, seasons: g.seasons + (now ? 1 : 0) };
}

export const isTeamAward = (k) => TEAM_KINDS.has(k);
