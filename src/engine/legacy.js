// Legacy: Hall of Fame scores, accolades, franchise career boards, Record Watch, the GM's career
// and the five-season era documentary (Gridiron GM's history.js, gmLegacy.js and documentary.js,
// in hockey terms). Pure functions over the league; nothing here changes the sim.
import { isGoalie } from "./constants.js";
import { FRANCHISE_CAREER } from "../data/franchiseCareer.js";
import { HISTORICAL_RECORDS as H } from "../data/historicalRecords.js";

// ---------- Hall of Fame ----------
// The NHL waits three years. A league-era player needs a legacy of 100 and a peak of 88; the real
// veterans who opened the league get in at 80 on the strength of what they did before it.
export const HOF_LINE = 100, HOF_PEAK = 88, HOF_PRE = 40, HOF_PRE_LINE = 80, HOF_WAIT = 3;
// What the established greats had already done before 2026 (Cups, Harts, Art Rosses, Vezinas), as
// legacy points. Everyone else who was on the opening rosters is credited by NHL games and level.
export const PRE_LEAGUE_RESUME = {
  "Alex Ovechkin": 90, "Sidney Crosby": 90, "Connor McDavid": 75, "Evgeni Malkin": 65, "Patrick Kane": 55,
  "Nathan MacKinnon": 50, "Leon Draisaitl": 50, "Nikita Kucherov": 50, "Steven Stamkos": 45, "Victor Hedman": 40,
  "Auston Matthews": 40, "Andrei Vasilevskiy": 40, "Anze Kopitar": 45, "Drew Doughty": 40, "Erik Karlsson": 40,
  "Cale Makar": 35, "Marc-Andre Fleury": 45, "Jonathan Quick": 30, "Brad Marchand": 35, "Sergei Bobrovsky": 35,
  "John Tavares": 30, "Kris Letang": 30, "Connor Hellebuyck": 35, "David Pastrnak": 30, "Artemi Panarin": 30,
  "Igor Shesterkin": 20, "Mikko Rantanen": 20, "Aleksander Barkov": 30, "Quinn Hughes": 20, "Jamie Benn": 20,
};
const AWARD_PTS = { hart: 25, tedLindsay: 12, connSmythe: 15, artRoss: 12, rocket: 10, vezina: 18, norris: 18, selke: 8, calder: 5, ladyByng: 2, masterton: 2, jennings: 4, kingClancy: 2, messier: 3, allNHL1: 6, allNHL2: 3, asg: 1 };
const level = (ovr) => (ovr >= 92 ? 4 : ovr >= 88 ? 3 : ovr >= 84 ? 2 : ovr >= 80 ? 1 : 0);
// p: a player (or a retired clone); tot: career totals in this league; extra.startYear.
export function legacyOf(p, { startYear = 2026 } = {}) {
  const g = isGoalie(p.pos);
  const seasons = (p.career || []).filter((c) => c.s?.gp);
  const peak = Math.max(p.peak || 0, p.ovr || 0, ...seasons.map((c) => c.o || 0));
  const tot = seasons.reduce((a, c) => { for (const k of ["gp", "g", "a", "w", "so"]) a[k] += c.s[k] || 0; return a; }, { gp: 0, g: 0, a: 0, w: 0, so: 0 });
  const real = p.src !== "gen" && !(p.draft?.year >= startYear);
  const prior = real ? p.service?.priorGames || 0 : 0;
  const pre = real ? (PRE_LEAGUE_RESUME[p.name] ?? Math.min(35, (prior / 82) * level(seasons[0]?.o ?? p.ovr) * 0.9)) : 0;
  const stats = g ? tot.w / 12 + tot.so / 2 : (tot.g / 18 + tot.a / 30);
  const honours = (p.honours || []).reduce((s, h) => s + (AWARD_PTS[h.kind] || 0), 0);
  const peakYears = seasons.reduce((s, c) => s + level(c.o || 0), 0);
  const legacy = Math.round(pre + stats * 2 + honours + peakYears + (p.cups || 0) * 6);
  return { legacy, pre: Math.round(pre), peak, tot };
}
export const hofWorthy = (L) => (L.legacy >= HOF_LINE && L.peak >= HOF_PEAK) || (L.legacy >= HOF_PRE_LINE && L.pre >= HOF_PRE);

// ---------- Accolades ----------
const ACCOLADES = [["stanley", "🏆", "Stanley Cup"], ["hart", "🏅", "Hart Trophy"], ["connSmythe", "🏟️", "Conn Smythe"], ["tedLindsay", "⭐", "Ted Lindsay"], ["artRoss", "🎯", "Art Ross"], ["rocket", "🚀", "Rocket Richard"], ["vezina", "🧤", "Vezina"], ["norris", "🛡️", "Norris"], ["selke", "🔒", "Selke"], ["calder", "🌱", "Calder"], ["jennings", "🥅", "Jennings"], ["ladyByng", "🤝", "Lady Byng"], ["masterton", "💪", "Masterton"], ["kingClancy", "❤️", "King Clancy"], ["messier", "📣", "Messier Leadership"], ["allNHL1", "🥇", "First All-Star Team"], ["allNHL2", "🥈", "Second All-Star Team"], ["asg", "✨", "All-Star Game"]];
// Every honour he won in this league, with years: [{ k, icon, label, years }].
export function accoladesOf(league, p) {
  if (!p) return [];
  const got = {};
  const add = (k, y) => { if (y != null && !(got[k] ||= []).includes(y)) got[k].push(y); };
  for (const h of p.honours || []) add(h.kind, h.year);
  // Cups: the champion's club in a season he finished there.
  for (const h of league.history || []) { const ab = league.teams[h.champion]?.abbr; if (ab && (p.career || []).some((c) => c.y === h.year && c.t === ab && c.s?.gp)) add("stanley", h.year); }
  return ACCOLADES.filter(([k]) => got[k]?.length).map(([k, icon, label]) => ({ k, icon, label, years: got[k].sort((a, b) => a - b) }));
}
export const accoladeText = (a) => (a.years.length >= 3 ? `${a.years.length}× ${a.label}` : `${a.label} ${a.years.map((y) => `${y}-${String(y + 1).slice(2)}`).join(", ")}`);

// ---------- Franchise career boards ----------
export const CAREER_BOARDS = [["g", "Goals", 2], ["a", "Assists", 3], ["pts", "Points", 4], ["gp", "Games", 1], ["pim", "Penalty minutes", 5], ["ppg", "Power-play goals", 6], ["gwg", "Game-winning goals", 7]];
export const GOALIE_BOARDS = [["w", "Goalie wins", 2], ["so", "Shutouts", 3], ["ggp", "Goalie games", 1]];
export const normName = (n) => String(n || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]+/g, " ").trim();
const SIM_KEY = { g: "g", a: "a", pts: "pts", gp: "gp", pim: "pim", ppg: "ppg", gwg: "gwg", w: "w", so: "so", ggp: "gp" };
// His real pre-2026 totals with a club (0 when he isn't in the data).
export function realClubTotal(name, abbr, key) {
  const F = FRANCHISE_CAREER[abbr]; if (!F) return 0;
  const goalie = GOALIE_BOARDS.some(([k]) => k === key);
  const row = (goalie ? F.gl : F.sk).find((r) => normName(r[0]) === normName(name));
  if (!row) return 0;
  return row[(goalie ? GOALIE_BOARDS : CAREER_BOARDS).find(([k]) => k === key)[2]] || 0;
}
// Simulated totals with a club (finished seasons plus this one if he's there).
export function simClubTotal(p, abbr, key, curAbbr) {
  const k = SIM_KEY[key];
  const v = (s) => (s?.[k] ?? (k === "pts" ? (s?.g || 0) + (s?.a || 0) : 0)) || 0;
  return (p.career || []).filter((c) => c.t === abbr).reduce((s, c) => s + v(c.s), 0) + (curAbbr === abbr ? v(p.stats) : 0);
}
// A club's all-time top n in a stat: real history merged with everything done in this league.
export function franchiseBoard(league, abbr, key, n = 10) {
  const goalie = GOALIE_BOARDS.some(([k]) => k === key);
  const rows = new Map();
  const F = FRANCHISE_CAREER[abbr];
  if (F) { const idx = (goalie ? GOALIE_BOARDS : CAREER_BOARDS).find(([k]) => k === key)[2]; for (const r of goalie ? F.gl : F.sk) rows.set(normName(r[0]), { name: r[0], value: r[idx] || 0, real: true }); }
  else { // the top-3 lists from records.nhl.com
    const R = H.franchises[abbr]; const list = { g: R?.careerSkater?.goals, a: R?.careerSkater?.assists, pts: R?.careerSkater?.points, w: R?.careerGoalie?.wins, so: R?.careerGoalie?.shutouts }[key] || [];
    for (const r of list) rows.set(normName(r.name), { name: r.name, value: r.value, real: true });
  }
  const t = league.teams.find((x) => x.abbr === abbr);
  const people = [...Object.values(league.players), ...(league.retirementArchive || []).map((r) => r.player).filter(Boolean)];
  for (const p of people) {
    if (isGoalie(p.pos) !== goalie || p.tid === -2) continue;
    const cur = p.tid >= 0 ? league.teams[p.tid]?.abbr : null;
    const sim = simClubTotal(p, abbr, key, cur);
    if (!sim) continue;
    const k = normName(p.name), was = rows.get(k);
    const base = was?.real ? was.value : realClubTotal(p.name, abbr, key);
    rows.set(k, { name: p.name, pid: p.id, value: base + sim, active: !!league.players[p.id] && p.tid === t?.id, real: false });
  }
  return [...rows.values()].filter((r) => r.value > 0).sort((a, b) => b.value - a.value).slice(0, n);
}
// "#7 in Oilers goals": where a player stands with his current club.
export function franchiseRanks(league, p) {
  const t = league.teams[p.tid]; if (!t) return [];
  const out = [];
  for (const [key, label] of isGoalie(p.pos) ? GOALIE_BOARDS : CAREER_BOARDS.slice(0, 4)) {
    const b = franchiseBoard(league, t.abbr, key, 10);
    const i = b.findIndex((r) => normName(r.name) === normName(p.name));
    if (i >= 0) out.push({ key, label, rank: i + 1, value: b[i].value, club: t.name });
  }
  return out;
}
// Weekly: someone took over his club's all-time lead. league.careerLeads remembers the leader.
export function checkFranchiseLeaders(league) {
  league.careerLeads ||= {};
  const out = [];
  for (const t of league.teams) for (const [key, label] of [...CAREER_BOARDS.slice(0, 3), ...GOALIE_BOARDS.slice(0, 2)]) {
    const top = franchiseBoard(league, t.abbr, key, 1)[0]; if (!top) continue;
    const id = `${t.abbr}:${key}`, prev = league.careerLeads[id];
    league.careerLeads[id] = { name: top.name, value: top.value };
    if (!prev || normName(prev.name) === normName(top.name) || !top.active) continue;
    const text = `${top.name} passes ${prev.name} for the ${t.city} ${t.name} all-time lead in ${label.toLowerCase()} (${top.value.toLocaleString("en-US")}).`;
    (league.news ||= []).unshift({ year: league.year, day: league.day, type: "record", pid: top.pid, text });
    if (t.id === league.userTid) (league.inbox ||= []).push({ year: league.year, day: league.day, text: `🏒 ${text}`, open: { tab: "league", sub: "records", label: "Open the Record Book" } });
    out.push({ tid: t.id, key, ...top, prev });
  }
  return out;
}

// ---------- Record Watch ----------
// Who is on pace for a single-season mark: projects today's total over the club's 82 games.
export function recordPace(league, mark, value, tid) {
  const gp = league.teams[tid]?.rec?.gp || 0;
  if (!gp || !mark) return null;
  const pace = Math.round((value / gp) * 82);
  return { pace, pct: Math.round((value / mark.value) * 100), on: pace >= mark.value };
}
export function recordWatch(league, seasonMark, marks) {
  if (league.phase !== "regular") return [];
  const out = [];
  const players = Object.values(league.players).filter((p) => p.tid >= 0 && p.stats?.gp >= 10);
  for (const d of marks.filter((x) => !x.team)) {
    const m = seasonMark(league, "nhl", d.key);
    const p = players.filter((x) => isGoalie(x.pos) === d.goalie).sort((a, b) => (b.stats[d.stat] || 0) - (a.stats[d.stat] || 0))[0];
    if (!p || !m) continue;
    const pace = recordPace(league, m, p.stats[d.stat] || 0, p.tid);
    if (pace && pace.pace >= m.value * 0.9) out.push({ key: d.key, label: d.label, pid: p.id, name: p.name, tid: p.tid, value: p.stats[d.stat], mark: m, ...pace });
  }
  return out;
}

// ---------- GM legacy ----------
export function gmScore({ seasons = 0, w = 0, l = 0, cups = 0, finals = 0, playoffs = 0, hof = 0, awards = 0 }) {
  return Math.max(0, Math.round(cups * 100 + finals * 30 + playoffs * 15 + (w - l) * 1 + seasons * 4 + hof * 25 + awards * 5));
}
// The greatest NHL general managers, scored the same way (approximate totals for their GM years).
export const GM_GREATS = [
  { name: "Sam Pollock", club: "Canadiens", yrs: "1964–1978", seasons: 14, w: 653, l: 291, cups: 9, finals: 0, playoffs: 13, hof: 8, note: "Nine Cups in fourteen years, and the trades that landed Guy Lafleur." },
  { name: "Glen Sather", club: "Oilers, Rangers", yrs: "1980–2019", seasons: 35, w: 1300, l: 1150, cups: 5, finals: 1, playoffs: 25, hof: 6, note: "Built the Oilers dynasty around Gretzky, Messier and Kurri." },
  { name: "Lou Lamoriello", club: "Devils, Leafs, Islanders", yrs: "1987–2026", seasons: 38, w: 1600, l: 1200, cups: 3, finals: 2, playoffs: 30, hof: 4, note: "Three Cups in New Jersey with Brodeur, Stevens and Niedermayer." },
  { name: "Ken Holland", club: "Red Wings, Oilers", yrs: "1997–2024", seasons: 27, w: 1250, l: 800, cups: 3, finals: 3, playoffs: 23, hof: 3, note: "Found Datsyuk and Zetterberg late in the draft; three Cups in Detroit." },
  { name: "Jim Rutherford", club: "Hurricanes, Penguins", yrs: "1994–2021", seasons: 27, w: 1100, l: 950, cups: 3, finals: 2, playoffs: 15, hof: 1, note: "A Cup in Carolina and back-to-back Cups in Pittsburgh." },
  { name: "Bill Torrey", club: "Islanders, Panthers", yrs: "1972–1993", seasons: 21, w: 850, l: 650, cups: 4, finals: 1, playoffs: 14, hof: 4, note: "Four straight Cups from an expansion club." },
  { name: "Jack Adams", club: "Red Wings", yrs: "1927–1962", seasons: 35, w: 964, l: 732, cups: 7, finals: 6, playoffs: 29, hof: 6, note: "Built the Red Wings of Howe, Lindsay and Sawchuk." },
  { name: "Steve Yzerman", club: "Lightning, Red Wings", yrs: "2010–2026", seasons: 16, w: 650, l: 450, cups: 2, finals: 1, playoffs: 9, hof: 0, note: "Assembled the Lightning core that won back-to-back Cups." },
  { name: "Bill Zito", club: "Panthers", yrs: "2020–2026", seasons: 6, w: 290, l: 140, cups: 2, finals: 1, playoffs: 6, hof: 0, note: "Remade Florida into back-to-back champions." },
  { name: "Joe Sakic", club: "Avalanche", yrs: "2014–2026", seasons: 12, w: 520, l: 380, cups: 1, finals: 0, playoffs: 8, hof: 0, note: "Drafted MacKinnon and Makar; the 2022 Cup." },
].map((g) => ({ ...g, score: gmScore(g) })).sort((a, b) => b.score - a.score);
export const gmRank = (score) => GM_GREATS.filter((g) => g.score > score).length + 1;
export const gmTier = (score, seasons = 0) => (score >= 1200 ? "Greatest of All Time" : score >= 800 ? "Hall of Fame GM" : score >= 500 ? "Legendary Builder" : score >= 300 ? "Respected Executive" : score >= 120 ? "Solid Steward" : seasons >= 6 ? "The Long Rebuild" : "Short Tenure");
// The user's career from the save: every season he ran a club (league.career.jobs).
export function gmCareer(league) {
  const jobs = league.career?.jobs || [{ tid: league.userTid, start: league.startYear || league.year }];
  const ranAt = (y) => jobs.find((j) => y >= j.start && (j.end == null || y <= j.end))?.tid;
  const seasons = [];
  for (const s of league.seasonArchive || []) { const tid = ranAt(s.year); const r = s.teams.find((x) => x.tid === tid)?.rec; if (r) seasons.push({ year: s.year, tid, ...r, playoff: s.teams.find((x) => x.tid === tid)?.playoff }); }
  const cups = (league.history || []).filter((h) => h.champion === ranAt(h.year)).map((h) => h.year);
  const finals = (league.history || []).filter((h) => h.runnerUp === ranAt(h.year)).length;
  const playoffs = seasons.filter((s) => s.playoff && !/miss/i.test(s.playoff)).length;
  const w = seasons.reduce((a, s) => a + (s.w || 0), 0), l = seasons.reduce((a, s) => a + (s.l || 0) + (s.otl || 0), 0);
  const draftees = Object.values(league.players).concat((league.retirementArchive || []).map((r) => r.player).filter(Boolean))
    .filter((p) => p.draft && ranAt(p.draft.year) === p.draft.tid).sort((a, b) => (b.peak || b.ovr) - (a.peak || a.ovr)).slice(0, 6);
  const hof = (league.hallOfFame || []).filter((h) => draftees.some((d) => d.id === h.pid)).length;
  const awards = (league.history || []).reduce((n, h) => n + Object.values(h.awards || {}).filter((a) => a && !a.team && a.tid === ranAt(h.year)).length, 0);
  const c = { seasons: seasons.length, w, l, cups, finals, playoffs, draftees, hof, awards, rows: seasons };
  c.score = gmScore({ ...c, cups: cups.length });
  c.rank = gmRank(c.score); c.tier = gmTier(c.score, c.seasons);
  return c;
}

// ---------- Era documentary ----------
// Every five seasons, the story of your club's era.
export function buildDocumentary(league, from, to, tid = league.userTid) {
  const t = league.teams[tid];
  const era = (league.seasonArchive || []).filter((s) => s.year >= from && s.year <= to).map((s) => ({ year: s.year, ...(s.teams.find((x) => x.tid === tid)?.rec || {}), playoff: s.teams.find((x) => x.tid === tid)?.playoff })).sort((a, b) => a.year - b.year);
  const w = era.reduce((a, s) => a + (s.w || 0), 0), l = era.reduce((a, s) => a + (s.l || 0), 0), otl = era.reduce((a, s) => a + (s.otl || 0), 0);
  const cups = (league.history || []).filter((h) => h.year >= from && h.year <= to && h.champion === tid).map((h) => h.year).sort();
  const byPts = [...era].sort((a, b) => (b.pts || 0) - (a.pts || 0));
  const best = byPts[0], worst = byPts.at(-1);
  const faces = [...Object.values(league.players), ...(league.retirementArchive || []).map((r) => r.player).filter(Boolean)]
    .map((p) => ({ name: p.name, pos: p.pos, n: (p.honours || []).filter((h) => h.year >= from && h.year <= to && h.tid === tid).length }))
    .filter((x) => x.n).sort((a, b) => b.n - a.n).slice(0, 3);
  const pct = w + l + otl ? w / (w + l + otl) : 0;
  const tier = cups.length >= 2 ? "Dynasty" : cups.length ? "Champion" : pct >= 0.6 ? "Contender" : pct >= 0.47 ? "Competitive" : "Building";
  const season = (y) => `${y}-${String(y + 1).slice(2)}`;
  const ch = [`${season(from)} to ${season(to)}: the ${t.city} ${t.name} went ${w}-${l}-${otl}.`];
  ch.push(cups.length ? (cups.length > 1 ? `Stanley Cup champions ${cups.length} times: ${cups.map(season).join(", ")}.` : `Stanley Cup champions in ${season(cups[0])}. Their names are on the Cup forever.`) : "No Stanley Cup yet. The chase goes on.");
  if (best && best !== worst) ch.push(`The high point: ${season(best.year)}, ${best.pts} points.`);
  if (worst && worst !== best) ch.push(`The low point: ${season(worst.year)}, ${worst.pts} points.`);
  if (faces.length) ch.push(`The faces of the era: ${faces.map((f) => `${f.name} (${f.pos}, ${f.n} honour${f.n === 1 ? "" : "s"})`).join("; ")}.`);
  ch.push({ Dynasty: "A dynasty, built to be remembered.", Champion: "A champion's era. The banner hangs forever.", Contender: "Always in the hunt; the next era has to finish the job.", Competitive: "Good, not great. The pieces are there.", Building: "The building years. Every great club has them." }[tier]);
  return { from, to, tid, w, l, otl, cups, tier, faces, chapters: ch, made: league.year };
}
// After a season ends: a documentary for each finished five-season era not yet filmed (backfills old saves).
export function filmDocumentaries(league) {
  const start = league.startYear || 2026;
  league.documentaries ||= [];
  const done = (league.seasonArchive || []).map((s) => s.year);
  const last = done.length ? Math.max(...done) : start - 1;
  const made = [];
  for (let a = start; a + 4 <= last; a += 5) {
    if (league.documentaries.some((d) => d.from === a)) continue;
    const d = buildDocumentary(league, a, a + 4);
    league.documentaries.push(d); made.push(d);
    (league.inbox ||= []).push({ year: league.year, day: league.day, text: `🎬 The documentary of your ${a}-${String(a + 5).slice(2)} era is ready: ${d.tier}. Watch it in the Legacy Hall.`, open: { tab: "legacy", label: "Watch it" } });
  }
  return made;
}
