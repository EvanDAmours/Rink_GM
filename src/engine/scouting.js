// Scouting: your scouting staff (two major and two minor scouts), what they can tell you about
// draft prospects, prospect bios, NHL Central Scouting's rankings (and how they move during the
// season), the Scouting Combine, hidden gems and red flags, scouting checkpoints, the scouts'
// visit list, scouting misses revealed over a draftee's first two seasons, and the analysts'
// instant grades on draft day.
//
// Everything here that's random draws from keyed streams (rng.stream), so a prospect's bio
// or a scout's read never changes between renders and the main game stream is untouched.
import { clamp, stream, hashStr } from "./rng.js";
import { randomNameWith } from "./names.js";
import { lastDay } from "./schedule.js";
import { rollDev } from "./players.js";
import { isGoalie, isDefense, posGroup, COMBINE_INVITES, COMBINE_INTERVIEWS } from "./constants.js";

// ---------- Scouting staff ----------

import { regionOf, REGIONS, DEFAULT_ASSIGN, scoutAssignments, regionsOf, migrateScoutRegions } from "./regions.js";
import { scoutingPaper } from "./papers.js";
import { teamNeeds, roleOf } from "./teamPlanning.js";
import { myDraftSlots, projectedDraftOrder } from "./draft.js";
import { queueMoment } from "./moments.js";
import { revealMoment } from "./momentsScouting.js";

// Every fourth week of the regular season Central Scouting's list moves and one inbox note
// sums up what your scouts filed. Nothing stops the sim.
export const CHECKPOINT_EVERY = 4;
// Reports a scout files in his region each week of the regular season: 2 for an average grade,
// up to 4 for an elite one, 1 for a poor one.
export const reportsPerWeek = (ev) => clamp(Math.round(1 + (ev - 50) / 14), 1, 4);
// Combine week: prospects you bring in for a day get a full workup without the points.
export const PRIVATE_WORKOUTS = 3;

export const SCOUT_GROUPS = { C: "Centers", W: "Wingers", D: "Defensemen", G: "Goalies" };
export const scoutGroup = (pos) => (pos === "C" ? "C" : pos === "LW" || pos === "RW" ? "W" : isDefense(pos) ? "D" : "G");

export const SCOUT_ROLES = {
  major: { name: "Major scout", short: "Major", desc: "Surveys his region in depth: sharp reports, exact ratings after a full workup, and development traits." },
  major2: { name: "Second major scout", short: "Major II", desc: "A second senior scout for deep reports and development traits." },
  minor2: { name: "Second minor scout", short: "Minor II", desc: "A second area scout: rougher reads in his region." },
  minor: { name: "Minor scout", short: "Minor", desc: "Surveys his region more loosely: rougher reports. No development traits." },
};

export const SCOUT_TRAITS = {
  workhorse: { name: "Road warrior", desc: "Files one extra report a week." },
  sharp: { name: "Sharp eye", desc: "His reads are more accurate (+8 evaluation)." },
  projector: { name: "Projector", desc: "Spots development traits a step earlier." },
  combine: { name: "Combine guru", desc: "One extra Combine interview." },
  europe: { name: "Overseas network", desc: "Far more accurate on prospects playing in Europe." },
};

const BACKGROUNDS = [
  (r) => `Former ${r.pick(["OHL", "WHL", "QMJHL", "USHL"])} head coach`,
  (r) => `Ex-NHL ${r.pick(["defenseman", "winger", "center", "goalie"])}, ${r.int(110, 940)} games`,
  (r) => `${r.int(8, 31)} years as an amateur scout`,
  (r) => `Former ${r.pick(["AHL", "ECHL", "USHL"])} general manager`,
  (r) => `Ex-NCAA assistant coach (${r.pick(["Boston University", "Michigan", "North Dakota", "Denver", "Minnesota"])})`,
  (r) => `Former ${r.pick(["Swedish", "Finnish", "Czech", "Swiss", "Canadian", "U.S."])} junior national team coach`,
  () => "Video coach turned scout",
  (r) => `Former ${r.pick(["SHL", "Liiga", "KHL"])} player and coach`,
];

function makeScout(key, group, evalMean = 72) {
  const r = stream(key);
  const { name, nat } = randomNameWith(r);
  return {
    id: `sc${hashStr(key).toString(36)}`,
    name,
    nat,
    age: r.int(36, 67),
    group,
    eval: clamp(Math.round(r.gauss(evalMean, 9)), 50, 95),
    trait: r.chance(0.55) ? r.pick(Object.keys(SCOUT_TRAITS)) : null,
    bg: r.pick(BACKGROUNDS)(r),
  };
}

// Scouts looking for work: two for each position.
export function refreshScoutPool(league) {
  const tag = `${league.year}|${league.phase}|${league.scoutPoolN = (league.scoutPoolN || 0) + 1}`;
  league.scoutPool = ["C", "W", "D", "G", "C", "W", "D", "G"].map((g, i) => makeScout(`${tag}|pool|${i}`, g, i < 4 ? 75 : 68));
  return league.scoutPool;
}

export const SCOUT_SLOTS = ["major", "major2", "minor", "minor2"];
export const roleType = (role) => role.startsWith("major") ? "major" : "minor";
export function defaultScouts(league) {
  return { major: makeScout(`${league.year}|staff|major`, "C", 70), major2: makeScout(`${league.year}|staff|major2`, "W", 68), minor: makeScout(`${league.year}|staff|minor`, "D", 64), minor2: makeScout(`${league.year}|staff|minor2`, "G", 62) };
}

// Staff changes happen in the off-season and preseason, not while the scouts are on the road.
export function staffWindowOpen(league) {
  if (league.phase === "preseason" || league.phase === "resign" || league.phase === "freeagency") return true;
  return league.phase === "draft" && !!league.draft && league.draft.idx >= league.draft.slots.length;
}

const otherRole = (role) => (role === "major" ? "minor" : "major");

export function hireScout(league, scoutId, role) {
  const t = league.teams[league.userTid];
  if (!staffWindowOpen(league)) return { ok: false, msg: "Your scouts are on the road. You can change your staff after the draft or in the preseason." };
  const s = (league.scoutPool || []).find((x) => x.id === scoutId);
  if (!s || !SCOUT_ROLES[role]) return { ok: false, msg: "That scout isn't available." };
  t.scouts ||= { major: null, minor: null };
  // Scouts can share a group: more eyes read it sharper, and leave more of the class to the front office.
  const same = SCOUT_SLOTS.filter((k) => k !== role && t.scouts[k]?.group === s.group).length;
  const old = t.scouts[role];
  t.scouts[role] = s;
  league.scoutPool = league.scoutPool.filter((x) => x.id !== s.id);
  if (old) league.scoutPool.push(old);
  const grp = SCOUT_GROUPS[s.group].toLowerCase();
  return { ok: true, msg: `${s.name} is your new ${SCOUT_ROLES[role].name.toLowerCase()} (${grp}).${same ? ` ${same + 1} of your scouts now work ${grp}: sharper reads there, and fewer groups covered.` : ""}` };
}

export function releaseScout(league, role) {
  const t = league.teams[league.userTid];
  if (!staffWindowOpen(league)) return { ok: false, msg: "Your scouts are on the road. You can change your staff after the draft or in the preseason." };
  const old = t.scouts?.[role];
  if (!old) return { ok: false, msg: "That job is already open." };
  t.scouts[role] = null;
  (league.scoutPool ||= []).push(old);
  return { ok: true, msg: `${old.name} has been let go.` };
}

export function swapScoutRoles(league) {
  const t = league.teams[league.userTid];
  if (!staffWindowOpen(league)) return { ok: false, msg: "Your scouts are on the road. You can change your staff after the draft or in the preseason." };
  const s = t.scouts || {};
  t.scouts = { major: s.minor || null, minor: s.major || null, major2: s.minor2 || null, minor2: s.major2 || null };
  return { ok: true, msg: "Your scouts have switched roles." };
}

// The season's survey (Evan, batch x2: hands-off scouting). No points: each week of the regular
// season every scout files reports on prospects in the region you sent him to (regions.js). Who he
// looks at first is the board's read plus what his eye catches: a high grade spots a late-ranked
// prospect with a real ceiling (a hidden gem) and works him up early; a low grade follows the board
// with noise and misses them. Repeat looks deepen a report into a full workup. Every fourth week
// Central Scouting's list moves and one inbox note sums up the month. Weeks are credited even if
// the sim skips a day.
export function scoutWeek(league) {
  const t = league.teams[league.userTid];
  if (!t) return;
  const week = Math.floor(league.day / 7);
  const paid = t.scoutWeekPaid ?? -1;
  if (league.phase === "regular") {
    for (let w = paid + 1; w <= week; w++) {
      surveyWeek(league, w);
      if (w > 0 && w % 8 === 0) scoutingPaper(league, w);
      if (w > 0 && w % CHECKPOINT_EVERY === 0) { stockWatch(league, w); boardNote(league, t, w); }
    }
  }
  t.scoutWeekPaid = Math.max(paid, week);
  revealDraftees(league);
}

export function surveyWeek(league, w) {
  const t = league.teams[league.userTid];
  const s = t?.scouts || {};
  const pool = classPool(league);
  if (!pool.length) return { filed: 0 };
  const a = scoutAssignments(league, t);
  const log = (t.surveyLog?.year === league.draftClassYear ? t.surveyLog : (t.surveyLog = { year: league.draftClassYear, filed: 0, gems: 0, noted: 0, gemIds: [] }));
  let filed = 0;
  for (const role of SCOUT_SLOTS) {
    const sc = s[role];
    if (!sc) continue;
    // A scout with several regions (r11: 3 / 2 / 1 / 1) files the same number of reports a week as
    // before, shared out between them: the week's first report goes to a different region each
    // week, so over a season each region gets its turn. More ground, not more reports.
    const regs = regionsOf(a[role]);
    if (!regs.length) continue;
    const eye = clamp((sc.eval - 62) / 28, 0, 1);
    const r = stream(`${league.draftClassYear}|${w}|${sc.id}|${role}|survey`);
    const noise = 1.2 + (100 - sc.eval) / 10;
    const n = reportsPerWeek(sc.eval) + (sc.trait === "workhorse" ? 1 : 0);
    const share = Array(regs.length).fill(0);
    for (let i = 0; i < n; i++) share[(w + i) % regs.length]++;
    regs.forEach((reg, ri) => {
      if (!share[ri]) return;
      const cands = pool.filter((p) => regionOf(p) === reg && (p.scout?.lvl || 0) < 2)
        .map((p) => ({ p, s: csScore(p) + eye * 1.8 * gemGap(p) + r.gauss(0, noise) - 2.5 * (p.scout?.lvl || 0) }))
        .sort((x, y) => y.s - x.s);
      for (const { p } of cands.slice(0, share[ri])) {
        fileReport(league, p, (p.scout?.lvl || 0) + 1);
        filed++;
        if (p.scout.notes?.gem && !log.gemIds.includes(p.id)) { log.gemIds.push(p.id); log.gems++; }
      }
    });
  }
  log.filed += filed;
  return { filed };
}

// One quiet inbox line when the board updates (never a pop-up, never a stop).
function boardNote(league, t, w) {
  const log = t.surveyLog;
  if (!log || log.year !== league.draftClassYear) return;
  const n = log.filed - (log.noted || 0);
  if (n <= 0) return;
  const gems = log.gems - (log.notedGems || 0);
  log.noted = log.filed; log.notedGems = log.gems;
  league.inbox?.push({ year: league.year, day: league.day, text: `🔎 Scouting board updated (week ${w}): your scouts filed ${n} report${n === 1 ? "" : "s"}${gems ? ` and flagged ${gems} possible sleeper${gems === 1 ? "" : "s"} 💎` : ""}.` });
}

// ---------- What your scouts know ----------

const EURO_LEAGUES = new Set(["SHL", "J20 Nationell", "HockeyAllsvenskan", "Liiga", "U20 SM-sarja", "Mestis", "KHL", "MHL", "VHL", "Czechia", "Czechia U20", "Slovakia", "Slovakia U20", "NL", "U20-Elit", "DEL", "DNL U20"]);
const OFFICE_EVAL = 60;

// Which of your scouts covers a prospect: "major", "minor", or "office" (nobody in his region,
// so the front office's generalists handle it). Scouts cover the region you assigned them to
// (regions.js). With several scouts on one region the best major scout leads and the rest are
// second opinions (`second` is the next one, `others` all of them).
const assignOf = (league) => { const a = { ...DEFAULT_ASSIGN, ...(league.teams[league.userTid]?.scoutRegions || {}) }; for (const k in a) a[k] = regionsOf(a[k]); return a; };
export function coverage(league, p) {
  const s = league.teams[league.userTid]?.scouts || {};
  const a = assignOf(league), g = regionOf(p);
  const on = SCOUT_SLOTS.filter((k) => s[k] && a[k]?.includes(g)).map((k) => ({ kind: roleType(k), scout: s[k] }))
    .sort((a, b) => (a.kind === b.kind ? scoutEval(b.scout, p) - scoutEval(a.scout, p) : a.kind === "major" ? -1 : 1));
  if (!on.length) return { role: "office", scout: null };
  const others = on.slice(1).map((x) => x.scout);
  return { role: on[0].kind, scout: on[0].scout, ...(others.length ? { second: others[0], others } : {}) };
}

// second: another scout (or a list of them) on the same group. More eyes read better than the
// best one alone (+6, and +2 for each scout past the second), and anyone's specialty counts.
export function scoutEval(scout, p, second) {
  if (!scout) return OFFICE_EVAL;
  const more = [].concat(second || []).filter(Boolean);
  let e = more.length ? Math.max(scout.eval, ...more.map((x) => x.eval)) + 6 + 2 * (more.length - 1) : scout.eval;
  const has = (t) => scout.trait === t || more.some((x) => x.trait === t);
  if (has("sharp")) e += 8;
  if (has("europe") && p && EURO_LEAGUES.has(p.bio?.lg)) e += 12;
  return clamp(e, 40, 99);
}

// A scouting crew: everyone you have on a prospect's position group. Several good scouts on one
// group see through the board: `see` (0..1) is how far past the public read they get before a
// report. One scout alone rarely does; a deep, sharp crew does.
export function crewOf(league, p) {
  const cov = coverage(league, p);
  if (cov.role === "office") return null;
  const n = 1 + (cov.others?.length || 0), ev = scoutEval(cov.scout, p, cov.others);
  return { cov, n, ev, see: clamp((ev - 75) / 24, 0, 1) * Math.min(1, 0.25 + 0.25 * n) };
}

// Crew strength by region, for the Scouts screen and Scouting HQ: who works it, their combined
// evaluation, and what they can see through the board. `group` is the region key.
export function crewStrength(league) {
  const s = league.teams[league.userTid]?.scouts || {};
  const a = assignOf(league);
  return Object.keys(REGIONS).map((g) => {
    const name = REGIONS[g].name;
    const on = SCOUT_SLOTS.filter((k) => s[k] && a[k]?.includes(g)).map((k) => ({ role: k, scout: s[k] }));
    if (!on.length) return { group: g, name, n: 0, ev: OFFICE_EVAL, see: 0, scouts: [], label: "Front office only" };
    const lead = [...on].sort((a, b) => (roleType(a.role) === roleType(b.role) ? b.scout.eval - a.scout.eval : roleType(a.role) === "major" ? -1 : 1));
    const ev = scoutEval(lead[0].scout, null, lead.slice(1).map((x) => x.scout));
    const n = on.length;
    const see = clamp((ev - 75) / 24, 0, 1) * Math.min(1, 0.25 + 0.25 * n);
    const label = n >= 2 ? (see >= 0.4 ? "Deep crew: sees through the board" : see > 0 ? "Crew: sharper reads, early hunches" : "Crew: sharper reads") : roleType(lead[0].role) === "major" ? "One major scout" : "One minor scout";
    return { group: g, name, n, ev, see, scouts: on, label };
  });
}

// How far off a read on POT can be (OVR reads are a bit tighter). Level 0 is the passive
// "general idea" a scout has of everyone at his position; 1 is a scouting report; 2 is a
// full workup. Nobody but the major scout gets to exact numbers.
export function readSd(role, lvl, ev) {
  const a = (100 - ev) / 50;
  if (role === "major") return lvl >= 2 ? 0 : lvl === 1 ? 0.9 + 1.6 * a : 2.2 + 2.6 * a;
  if (role === "minor") return lvl >= 2 ? 1 + 1.4 * a : lvl === 1 ? 1.8 + 2.4 * a : 3.2 + 3 * a;
  return lvl >= 2 ? 2.6 : lvl === 1 ? 4.2 : Infinity;
}

// Reports cost nothing now: your scouts file them on their own through the season.
export function scoutCost() {
  return 0;
}

// Would the next report on this prospect reveal his development trait?
// A sharp major scout (grade 82+) names it from his first report.
function seesDev(cov, lvl, ev = 0) {
  if (cov.role === "major") return lvl >= 2 || ev >= 82 || [cov.scout, ...(cov.others || [])].some((x) => x.trait === "projector");
  if (cov.role === "minor") return lvl >= 2 && cov.scout.trait === "projector";
  return false;
}

// The next report on a prospect, filed by whoever covers his region (the weekly survey uses it; so
// can tests and debugging). No cost.
export function fileScoutReport(league, pid) {
  const p = league.players[pid];
  if (!p || p.tid !== -2 || !p.scout) return { ok: false, msg: "You can only scout prospects in the upcoming draft." };
  if ((p.scout.lvl || 0) >= 2) return { ok: false, msg: `${p.name} is already fully scouted.` };
  fileReport(league, p, (p.scout.lvl || 0) + 1);
  return { ok: true, msg: `${p.scout.who} filed a ${p.scout.lvl >= 2 ? "full workup" : "scouting report"} on ${p.name}.` };
}

// Kept for old callers: reports are filed by your scouts in their regions, not bought one by one.
export function scoutProspect(league, pid) {
  const p = league.players[pid];
  if (!p || p.tid !== -2 || !p.scout) return { ok: false, msg: "You can only scout prospects in the upcoming draft." };
  return { ok: false, msg: `Your scouts file reports on their own through the season. Send a scout to the ${REGIONS[regionOf(p)]?.name || "region"} to cover ${p.name}.` };
}

function fileReport(league, p, lvl) {
  const cov = coverage(league, p);
  const ev = scoutEval(cov.scout, p, cov.others);
  const sd = readSd(cov.role, lvl, ev);
  const r = stream(`${p.id}|${cov.scout?.id || "office"}|${lvl}`);
  const n = (s) => (s ? clamp(r.gauss(0, s), -1.6 * s, 1.6 * s) : 0);
  const eOvr = clamp(Math.round(p.ovr + n(sd * 0.8)), 40, 99);
  const ePot = clamp(Math.max(eOvr + (sd ? 1 : 0), Math.round(p.pot + n(sd))), eOvr, 99);
  const skills = skillReads(p, sd, ePot - eOvr, r);
  const office = cov.role === "office";
  const notes = notesFor(p, skills, r);
  // A report sees what the board can't: the hidden gem's ceiling and the red flag's reason. A
  // sharp scout nearly always does; a poor one often misses it (a workup catches more).
  const eye = stream(`${p.id}|${cov.scout?.id || "office"}|eye`).next() < clamp((ev - 52) / 34 + (lvl >= 2 ? 0.2 : 0), 0.08, 0.97);
  if (!eye) { /* missed it */ } else if (p.bust) notes.flag = `🚩 Red flag: ${p.bust.why}. ${office ? "Our people see" : "Your scout sees"} a high bust risk.`;
  else if (p.gem) notes.gem = `💎 Sleeper: ${p.gem.why}. ${office ? "Our people think" : "Your scout thinks"} he's much better than where Central Scouting has him.`;
  Object.assign(p.scout, {
    lvl,
    eOvr,
    ePot,
    sd,
    exact: sd === 0,
    by: cov.role,
    who: cov.others ? [cov.scout, ...cov.others].map((x) => x.name).join(" & ") : cov.scout?.name || "Your front office",
    dev: seesDev(cov, lvl, ev) ? p.dev : p.scout.dev || null,
    skills,
    notes,
    comp: comparable(league, p, ePot),
  });
}

// ---------- Hidden gems and red flags ----------
// Every class has a few sleepers (Kucherov went 58th, Point 79th, Pavelski 205th): players far
// better than Central Scouting's read, each with a hockey reason the board missed. And a few
// red flags: prospects the board loves (rounds 1-2) whose real ceiling is 8-15 lower. The public
// (Central Scouting, the analysts, the AI clubs) only ever sees the public read; your reports,
// a deep crew, area trips and Combine interviews can see through it.
//   p.gem  = { gap, why, kind }  his real ceiling is `gap` above the public read
//   p.bust = { gap, why, kind }  his real ceiling is `gap` below the public read
// p.pot is always the truth (development grows toward it); publicPot() is what the board sees.
export const GEM_WHY = {
  size: "Undersized: teams worry a forward his size won't hold up against NHL defensemen",
  young: "A late birthday: one of the youngest players in the class, still growing into his frame",
  overseas: "Buried on a men's team overseas: fourth-line minutes, so his numbers undersell him",
  injury: "Missed most of his draft year hurt, so there's little recent tape",
  raw: "A late starter: only two seasons of elite hockey, but the flashes are special",
  quiet: "Played behind older linemates in a market few scouts visit",
  goalie: "A goalie on a bad team: the save percentage hides how much rubber he faced",
};
export const BUST_WHY = {
  overage: "Overage one-year wonder: his big season came as a 19-year-old against kids",
  pp: "Power-play merchant: most of his points came on the man advantage",
  concussion: "Concussion history: two this season, and his club played them down",
  ethic: "Work-ethic concerns: coaches question his compete away from the puck",
  combine: "Workout warrior: tests off the charts, but it doesn't show up on the ice",
  linemate: "Rode a star linemate: his production fell off whenever they were split up",
  shelter: "Sheltered behind a stacked team: his numbers came from the skaters in front of him",
};
export const gemGap = (p) => p?.gem?.gap || 0;
export const bustGap = (p) => p?.bust?.gap || 0;
// What the public (Central Scouting, the analysts, the AI clubs) thinks his ceiling is.
export const publicPot = (p) => p.pot - gemGap(p) + bustGap(p);
// A read that sees `see` of the way through the board (0: the public read, 1: the truth).
export const seenPot = (p, see) => p.pot + (bustGap(p) - gemGap(p)) * (1 - see);

const MEN_EURO = new Set(["SHL", "HockeyAllsvenskan", "Liiga", "Mestis", "KHL", "VHL", "Czechia", "Slovakia", "NL", "DEL"]);
// Plant this class's gems and red flags once, after Central Scouting's board is set, so the board
// never sees them. Deterministic for the class (keyed stream). Prospects you've already filed a
// report on are left alone (an old save mid-season).
export function plantHiddenTalent(league, ids, year = league.draftClassYear) {
  const cls = (ids || []).map((id) => league.players[id]).filter((p) => p && p.tid === -2);
  if (!cls.length || cls.some((p) => p.gem || p.bust) || league.hiddenSeeded === year) return { gems: [], busts: [] };
  league.hiddenSeeded = year;
  const r = stream(`hidden|${year}|${cls.length}|${cls[0].id}`);
  const rank = (p) => p.cs?.mid ?? 999;
  const gems = [], busts = [];
  // 4-6 gems from the back of the board (round 3 on) with a modest public ceiling.
  const nG = 4 + (r.chance(0.5) ? 1 : 0) + (r.chance(0.25) ? 1 : 0);
  const gPool = cls.filter((p) => !(p.scout?.lvl > 0) && rank(p) > 72 && p.pot < 84 && p.ovr >= 50);
  for (let i = 0; i < nG && gPool.length; i++) {
    const p = gPool.splice(Math.floor(r.next() * gPool.length), 1)[0];
    const target = clamp(Math.max(p.pot + r.int(10, 17), r.int(82, 88)), p.pot + 6, 93);
    const kinds = isGoalie(p.pos) ? ["goalie"] : ["size", "size", "young", "injury", "raw", "quiet", ...(MEN_EURO.has(p.bio?.lg) ? ["overseas", "overseas"] : [])];
    const kind = r.pick(kinds);
    if (kind === "size" && p.bio && !p.realIdentity) { p.bio.ht = r.int(67, 69); p.bio.wt = r.int(158, 172); }
    if (kind === "young") p.age = 18;
    const x = r.next();
    p.dev = x < 0.25 ? "superstar" : x < 0.75 ? "star" : "late";
    p.gem = { gap: target - p.pot, why: GEM_WHY[kind], kind };
    p.pot = target;
    gems.push(p.id);
  }
  // 3-5 red flags the board has in rounds 1-2.
  const nB = 3 + (r.chance(0.5) ? 1 : 0) + (r.chance(0.25) ? 1 : 0);
  const bPool = cls.filter((p) => !p.gem && !(p.scout?.lvl > 0) && rank(p) <= 64 && rank(p) > 2);
  for (let i = 0; i < nB && bPool.length; i++) {
    const p = bPool.splice(Math.floor(r.next() * bPool.length), 1)[0];
    const target = Math.max(p.ovr + 2, p.pot - r.int(8, 15));
    if (p.pot - target < 5) continue;
    const kinds = isGoalie(p.pos) ? ["shelter", "shelter", "concussion", "ethic"] : ["pp", "concussion", "ethic", "ethic", "combine", "linemate", ...(p.age >= 19 ? ["overage", "overage"] : [])];
    const kind = r.pick(kinds);
    p.dev = r.chance(0.3) ? "late" : "normal";
    p.bust = { gap: p.pot - target, why: BUST_WHY[kind], kind };
    p.pot = target;
    busts.push(p.id);
  }
  return { gems, busts };
}

// Undo a class's gems and red flags (an imported class replants its own): back to the public read.
export function resetHiddenTalent(league, ids) {
  for (const id of ids || []) {
    const p = league.players[id];
    if (!p || p.tid !== -2 || !(p.gem || p.bust)) continue;
    p.pot = Math.max(p.ovr, publicPot(p));
    delete p.gem;
    delete p.bust;
  }
  league.hiddenSeeded = null;
}

// The general idea your scouts have of every prospect in their group, without a report. One
// scout has the public read of a sleeper and now and then a hunch. A deep, sharp crew on one
// group (several good scouts all working it) sees through the board: it flags that group's
// sleepers and red flags, and spots Star and Superstar traits early, before you spend a point.
// Without a scout on the group it's only what your area scouts have (or nothing).
export function generalIdea(league, p) {
  const crew = crewOf(league, p);
  if (!crew) return null;
  const { cov, n, ev, see } = crew;
  const sd = readSd(cov.role, 0, ev);
  const r = stream(`${p.id}|${cov.scout.id}|gen`);
  // Anchored on the public read filed with the class (scout.base), so a general idea never reads the
  // live hidden ratings; a crew sees `see` of the way to a gem's or red flag's real ceiling.
  const pub = p.scout?.base?.ePot ?? publicPot(p);
  const pot = clamp(pub + see * (gemGap(p) - bustGap(p)) + clamp(r.gauss(0, sd), -1.6 * sd, 1.6 * sd), 40, 99);
  const s = league.teams[league.userTid]?.scouts || {};
  const staffHas = (t) => SCOUT_SLOTS.some((k) => s[k]?.trait === t);
  // A hunch: your scouts think there's more to him than the board says (now and then they're wrong).
  const h = stream(`${p.id}|${cov.scout.id}|hunch`).next();
  const knack = Math.min(0.97, (cov.role === "major" ? 0.5 : 0.3) + 0.12 * (n - 1) + clamp((ev - 80) / 50, 0, 0.3) + (staffHas("europe") && EURO_LEAGUES.has(p.bio?.lg) ? 0.3 : 0) + (staffHas("sharp") ? 0.1 : 0));
  const hunch = p.gem ? h < knack : (p.cs?.mid ?? 0) > 90 && h < 0.02 / n;
  // A red flag before a report: a deep crew sometimes catches what the board missed.
  const flag = !!p.bust && see >= 0.4 && stream(`${p.id}|${cov.scout.id}|flag`).next() < knack;
  // A crew that sees through the board says so outright: "he's a sleeper".
  const sleeper = !!p.gem && hunch && see >= 0.5;
  // Star and Superstar traits, spotted early by a crew (two or more good scouts on the group).
  const spot = n >= 2 && ["superstar", "star"].includes(p.dev) && stream(`${p.id}|crew|dev`).next() < clamp((ev - 76) / 19, 0, 1) * Math.min(0.95, 0.2 + 0.22 * n);
  return { pot, grade: potGrade(pot), tier: projection(p.pos, pot), by: cov.role, sd, who: n > 1 ? `Your ${n} scouts in the ${REGIONS[regionOf(p)]?.name || "region"}` : cov.scout.name, hunch, sleeper, flag, dev: spot ? p.dev : null, crew: n };
}

// Everything the UI shows about a prospect, from your point of view.
export function prospectRead(league, p) {
  const s = p.scout || { lvl: 0 };
  const cov = coverage(league, p);
  const has = s.lvl > 0 && s.eOvr != null;
  const gen0 = has ? null : generalIdea(league, p);
  const reg = null; // area-scout trips are gone: region coverage is your assigned scouts
  // The sharper of your position scouts' general idea and your area scouts' regional read.
  const either = (k) => !!(gen0?.[k] || reg?.[k]);
  const gen = gen0 && reg
    ? { ...gen0, ...(reg.sd < gen0.sd ? { pot: reg.pot, who: reg.who, regional: true } : {}), hunch: either("hunch"), sleeper: either("sleeper"), flag: either("flag") }
    : gen0 || (reg && { ...reg, grade: potGrade(reg.pot), tier: projection(p.pos, reg.pot), by: "region", regional: true, dev: null });
  const potV = has ? s.ePot : gen ? gen.pot : null;
  const regOvr = !has && reg?.ovr != null ? reg.ovr : null;
  const flagWhy = s.notes?.flag || s.intv?.flag || (gen?.flag && p.bust ? `🚩 ${p.bust.why}.` : null);
  const sleeper = !!(s.notes?.gem || gen?.sleeper);
  return {
    lvl: s.lvl || 0,
    cov: cov.role,
    scout: cov.scout,
    second: cov.second || null,
    others: cov.others || [],
    crew: 1 + (cov.others?.length || 0),
    trips: reg?.trips || 0,
    region: regionOf(p),
    regional: !!gen?.regional,
    ovr: has ? (s.exact ? `${s.eOvr}` : `~${s.eOvr}`) : regOvr != null ? `~${regOvr}` : "??",
    pot: has ? (s.exact ? `${s.ePot}` : `~${s.ePot}`) : gen ? potGrade(gen.pot) : "??",
    ovrV: has ? s.eOvr : regOvr,
    potV,
    exact: !!s.exact,
    general: !!gen,
    hunch: !sleeper && !!gen?.hunch,
    sleeper,
    gemWhy: s.notes?.gem || (gen?.sleeper && p.gem ? `💎 ${p.gem.why}.` : null),
    flag: !!flagWhy,
    flagWhy,
    devEarly: !s.dev && !!gen?.dev,
    grade: potV != null ? potGrade(potV) : null,
    tier: potV != null ? projection(p.pos, potV) : null,
    dev: s.dev || gen?.dev || null,
    role: roleOf(p),
    sd: has ? s.sd ?? null : null,
    by: s.by || null,
    who: s.who || gen?.who || null,
    cost: scoutCost(p),
  };
}

// ---------- Your scouts' board ----------
// Everyone ranked on what your scouts think of him: their estimates (reports, a crew's general
// idea, area reads) and the development traits they've seen. Where they have no read, they go
// with Central Scouting. Returns Map id -> your rank (1 = best).
const DEV_BUMP = { generational: 3, superstar: 2, star: 1, late: 0, normal: 0 };
export function myScore(league, p, read = prospectRead(league, p)) {
  if (read.potV == null) return csScore(p);
  const extra = (DEV_BUMP[read.dev] || 0) - (read.flag ? 3 : 0);
  if (read.lvl > 0 && read.ovrV != null) return read.potV * 0.78 + read.ovrV * 0.22 + extra;
  // Only a general idea (a scout's letter grade, an area read): Central Scouting's slot, moved by how
  // far your scouts' ceiling is from the public one. A hunch or a sleeper call counts for more.
  const pub = p.scout?.base?.ePot ?? publicPot(p);
  const w = read.sleeper ? 1 : read.hunch ? 0.8 : 0.4;
  return csScore(p) + w * 0.78 * (read.potV - pub) + extra;
}
export function myBoard(league, ps = classPool(league)) {
  const ranked = ps.map((p) => [p, myScore(league, p)]).sort((a, b) => b[1] - a[1] || csRank(a[0]) - csRank(b[0]));
  return new Map(ranked.map(([p], i) => [p.id, i + 1]));
}

// The Big Board's "Show" filters (Gridiron 1.81), one place for every board: [value, label].
export const SHOW_FILTERS = [
  ["all", "Everyone"], ["covered", "Positions my scouts cover"], ["scouted", "Scouted"], ["unscouted", "Not scouted yet"], ["list", "On my list"],
  ["flagged", "💎 Sleepers & hunches"], ["redflags", "🚩 Red flags (bust risks)"], ["special", "⭐ Star traits spotted"], ["regions", "🗺️ From regions I've scouted"],
];
export function showMatch(league, p, show, read = null) {
  if (show === "all") return true;
  if (show === "scouted") return p.scout?.lvl > 0;
  if (show === "unscouted") return !p.scout?.lvl;
  if (show === "list") return onMyList(league, p.id);
  const r = read || prospectRead(league, p);
  if (show === "covered") return r.cov !== "office";
  if (show === "flagged") return r.sleeper || r.hunch;
  if (show === "redflags") return r.flag;
  if (show === "special") return ["superstar", "star"].includes(r.dev);
  if (show === "regions") return r.trips > 0;
  return true;
}

// ---------- Grades, projections and reports ----------

const LETTERS = [[92, "A+"], [89, "A"], [86, "A-"], [83, "B+"], [80, "B"], [77, "B-"], [74, "C+"], [71, "C"], [68, "C-"], [-Infinity, "D"]];
export function potGrade(v) {
  for (const [min, g] of LETTERS) if (v >= min) return g;
  return "D";
}
export const gradeClass = (g) => (!g ? "" : g[0] === "A" ? "ga" : g[0] === "B" ? "gb" : g[0] === "C" ? "gc" : "gd");

export function projection(pos, pot) {
  if (isGoalie(pos)) return pot >= 90 ? "Franchise goalie" : pot >= 86 ? "Starting goalie" : pot >= 82 ? "1B / tandem goalie" : pot >= 78 ? "NHL backup" : "Long shot";
  if (isDefense(pos)) return pot >= 91 ? "Franchise defenseman" : pot >= 87 ? "Top-pair defenseman" : pot >= 83 ? "Top-four defenseman" : pot >= 79 ? "Third-pair defenseman" : pot >= 75 ? "Depth defenseman" : "Long shot";
  const who = pos === "C" ? "center" : "winger";
  return pot >= 92 ? `Franchise ${who}` : pot >= 88 ? `First-line ${who}` : pot >= 84 ? `Top-six ${who}` : pot >= 80 ? `Middle-six ${who}` : pot >= 76 ? "Bottom-six forward" : "Long shot";
}

export function riskLabel(eOvr, ePot) {
  const gap = ePot - eOvr;
  return gap >= 18 ? "High risk, high reward" : gap >= 13 ? "Some risk" : "Safe bet";
}

const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

export const SKATER_SKILLS = {
  skating: { name: "Skating", keys: ["spd", "acc", "agi", "bal"], hi: ["Explosive first three strides", "Effortless, efficient stride", "Elite edges and lateral quickness", "Pulls away from defenders in open ice"], lo: ["Heavy first step; skating needs work", "Choppy stride limits his pace", "Gets beaten wide by quicker players"] },
  shooting: { name: "Shooting", keys: ["wac", "wpw", "sac", "spw"], hi: ["Quick, deceptive release", "Heavy shot that beats goalies from distance", "Picks corners in stride", "One-timer is already a weapon"], lo: ["Shot doesn't scare goalies yet", "Needs more velocity on his shot", "Release is slow and easy to read"] },
  hands: { name: "Puck skills", keys: ["dek", "hey", "puc"], hi: ["Dangles in a phone booth", "Silky hands at full speed", "Protects the puck like a veteran"], lo: ["Fumbles passes at speed", "Hands don't keep up with his feet", "Coughs it up under pressure"] },
  sense: { name: "Hockey sense", keys: ["pas", "oaw", "poi"], hi: ["Sees plays before they develop", "Threads seam passes through traffic", "Elite hockey IQ in the offensive zone", "Poised with the puck on his stick"], lo: ["Forces passes into traffic", "Decision-making lags behind his tools", "Tunnel vision with the puck"] },
  defense: { name: "Defense", keys: ["daw", "stk", "blk"], hi: ["Reliable in his own end", "Active stick breaks up plays", "Reads the rush and kills plays early", "Fearless shot blocker"], lo: ["Coverage lapses in his own zone", "Puck-watches away from the play", "A long way to go defensively"] },
  compete: { name: "Compete", keys: ["bch", "str", "agr"], hi: ["Wins puck battles along the wall", "Plays bigger than his size", "Punishing open-ice hitter", "Relentless forechecker"], lo: ["Gets pushed off the puck", "Avoids the dirty areas", "Needs to add strength"] },
};
export const GOALIE_SKILLS = {
  positioning: { name: "Positioning", keys: ["pos", "vis"], hi: ["Always square to the shooter", "Calm, economical movement", "Reads plays and gets set early"], lo: ["Drifts out of the blue paint", "Overcommits on lateral plays"] },
  reflexes: { name: "Reflexes", keys: ["sth", "stl", "fiv"], hi: ["Lightning-quick pads", "Elite reflexes in tight", "Seals the ice on low shots"], lo: ["Beaten low too often", "Slow to react to tips and deflections"] },
  glove: { name: "Glove", keys: ["glh", "gll"], hi: ["Snaps up everything glove side", "Highlight-reel glove hand"], lo: ["Glove hand is a weakness up high", "Shooters pick on his glove side"] },
  rebounds: { name: "Rebound control", keys: ["reb", "pok"], hi: ["Swallows pucks and kills rebounds", "Steers rebounds to safe areas"], lo: ["Gives up juicy rebounds", "Rebound control is a work in progress"] },
  athleticism: { name: "Athleticism", keys: ["spd", "agi"], hi: ["Explosive post to post", "Acrobatic second-save ability"], lo: ["Lacks explosiveness side to side", "Struggles to recover on second chances"] },
  composure: { name: "Composure", keys: ["poi", "brk"], hi: ["Unflappable under pressure", "Shakes off bad goals instantly"], lo: ["Loses focus after a bad goal", "Rattled by traffic in front"] },
};
export const skillsFor = (pos) => (isGoalie(pos) ? GOALIE_SKILLS : SKATER_SKILLS);

// Tool grades, projected to his NHL ceiling: today's skill plus the growth the scout expects.
function skillReads(p, sd, growth, r) {
  const out = {};
  for (const [k, sk] of Object.entries(skillsFor(p.pos))) {
    const now = avg(sk.keys.map((x) => p.attrs[x] ?? 50));
    const noise = sd ? clamp(r.gauss(0, sd * 0.9 + 0.8), -6, 6) : 0;
    const v = now + Math.max(0, growth) + noise;
    out[k] = { v: Math.round(v), g: potGrade(v) };
  }
  return out;
}

function notesFor(p, skills, r) {
  const defs = skillsFor(p.pos);
  const order = Object.keys(skills).sort((a, b) => skills[b].v - skills[a].v);
  const strengths = order.slice(0, 2).map((k) => r.pick(defs[k].hi));
  const weaknesses = order.slice(-1).map((k) => r.pick(defs[k].lo));
  return { strengths, weaknesses };
}

// The NHL player whose game his most resembles, at about the level he projects to.
export function comparable(league, p, ePot) {
  const grp = posGroup(p.pos);
  const keys = Object.keys(p.attrs).filter((k) => k !== "fgt" && k !== "fof");
  const mean = (x) => avg(keys.map((k) => x.attrs[k] ?? 50));
  const mp = mean(p);
  for (const band of [[4, 3], [7, 6]]) {
    let best = null;
    let bestD = Infinity;
    for (const t of league.teams) {
      for (const id of t.roster) {
        const c = league.players[id];
        if (!c || posGroup(c.pos) !== grp || c.ovr < ePot - band[0] || c.ovr > ePot + band[1]) continue;
        const mc = mean(c);
        let d = 0;
        for (const k of keys) {
          const x = (p.attrs[k] ?? 50) - mp - ((c.attrs[k] ?? 50) - mc);
          d += x * x;
        }
        if (c.type !== p.type) d *= 1.25;
        if (grp === "F" && (c.pos === "C") !== (p.pos === "C")) d *= 1.1;
        if (c.src !== "ea27") d *= 1.3;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
    }
    if (best) return { name: best.name, pid: best.id, abbr: league.teams[best.tid]?.abbr || "" };
  }
  return null;
}

// ---------- Prospect bios ----------

const LG = {
  OHL: { f: 1, gp: [58, 68], teams: ["London Knights", "Kitchener Rangers", "Ottawa 67's", "Oshawa Generals", "Sudbury Wolves", "Saginaw Spirit", "Windsor Spitfires", "Barrie Colts", "Brampton Steelheads", "Brantford Bulldogs", "Erie Otters", "Flint Firebirds", "Guelph Storm", "Kingston Frontenacs", "North Bay Battalion", "Owen Sound Attack", "Peterborough Petes", "Sarnia Sting", "Sault Ste. Marie Greyhounds", "Niagara IceDogs"] },
  WHL: { f: 1, gp: [58, 68], teams: ["Medicine Hat Tigers", "Everett Silvertips", "Portland Winterhawks", "Kamloops Blazers", "Calgary Hitmen", "Edmonton Oil Kings", "Saskatoon Blades", "Spokane Chiefs", "Prince Albert Raiders", "Brandon Wheat Kings", "Regina Pats", "Kelowna Rockets", "Red Deer Rebels", "Seattle Thunderbirds", "Vancouver Giants", "Lethbridge Hurricanes", "Moose Jaw Warriors", "Wenatchee Wild", "Tri-City Americans", "Victoria Royals", "Prince George Cougars", "Swift Current Broncos"] },
  QMJHL: { f: 1.02, gp: [56, 66], teams: ["Rimouski Océanic", "Moncton Wildcats", "Halifax Mooseheads", "Drummondville Voltigeurs", "Saint John Sea Dogs", "Sherbrooke Phoenix", "Baie-Comeau Drakkar", "Chicoutimi Saguenéens", "Québec Remparts", "Val-d'Or Foreurs", "Gatineau Olympiques", "Blainville-Boisbriand Armada", "Victoriaville Tigres", "Shawinigan Cataractes", "Rouyn-Noranda Huskies", "Cape Breton Eagles", "Charlottetown Islanders"] },
  USHL: { f: 0.85, gp: [50, 62], teams: ["Sioux City Musketeers", "Chicago Steel", "Green Bay Gamblers", "Waterloo Black Hawks", "Tri-City Storm", "Muskegon Lumberjacks", "Dubuque Fighting Saints", "Youngstown Phantoms", "Lincoln Stars", "Fargo Force", "Sioux Falls Stampede", "Madison Capitols", "Cedar Rapids RoughRiders", "Des Moines Buccaneers"] },
  USNTDP: { f: 0.95, gp: [55, 64], teams: ["U.S. National U18 Team"] },
  NCAA: { f: 0.6, gp: [30, 38], teams: ["Boston University", "Michigan", "Minnesota", "Boston College", "North Dakota", "Denver", "Wisconsin", "Michigan State", "Notre Dame", "Harvard", "Providence", "Penn State", "Quinnipiac", "UMass", "Western Michigan", "Cornell"] },
  SHL: { f: 0.3, gp: [30, 52], teams: ["Frölunda HC", "Djurgårdens IF", "Färjestad BK", "Skellefteå AIK", "Luleå HF", "HV71", "Rögle BK", "Brynäs IF", "Växjö Lakers", "Linköping HC", "Örebro HK", "Leksands IF", "Malmö Redhawks", "Timrå IK"] },
  "J20 Nationell": { f: 0.95, gp: [36, 46], teams: ["Frölunda HC J20", "Djurgårdens IF J20", "Färjestad BK J20", "Skellefteå AIK J20", "Luleå HF J20", "HV71 J20", "Rögle BK J20", "Brynäs IF J20", "Växjö Lakers J20", "Linköping HC J20", "MoDo Hockey J20", "Leksands IF J20"] },
  HockeyAllsvenskan: { f: 0.45, gp: [36, 52], teams: ["MoDo Hockey", "AIK", "IF Björklöven", "Södertälje SK", "Västerås IK", "Mora IK", "Almtuna IS", "Västerviks IK"] },
  Liiga: { f: 0.35, gp: [36, 58], teams: ["Tappara", "Kärpät", "HIFK", "TPS", "Ilves", "JYP", "KalPa", "Lukko", "Pelicans", "HPK", "Jukurit", "SaiPa", "Ässät", "KooKoo", "Sport"] },
  "U20 SM-sarja": { f: 0.95, gp: [36, 48], teams: ["Tappara U20", "Kärpät U20", "HIFK U20", "TPS U20", "Ilves U20", "JYP U20", "KalPa U20", "Lukko U20", "Pelicans U20", "HPK U20", "Jokerit U20"] },
  Mestis: { f: 0.5, gp: [36, 48], teams: ["Jokerit", "TUTO Hockey", "Kiekko-Espoo", "Hermes", "KeuPa HT"] },
  KHL: { f: 0.25, gp: [20, 56], teams: ["SKA St. Petersburg", "CSKA Moscow", "Lokomotiv Yaroslavl", "Ak Bars Kazan", "Avangard Omsk", "Dynamo Moscow", "Metallurg Magnitogorsk", "Traktor Chelyabinsk", "Spartak Moscow", "Salavat Yulaev Ufa"] },
  MHL: { f: 0.9, gp: [40, 58], teams: ["SKA-1946", "Krasnaya Armiya", "Loko Yaroslavl", "Irbis Kazan", "Omskie Yastreby", "MHC Dynamo", "Stalnye Lisy", "Belye Medvedi", "MHC Spartak", "Tolpar Ufa"] },
  VHL: { f: 0.45, gp: [30, 50], teams: ["SKA-Neva", "Zvezda Moscow", "HC Ryazan", "Dynamo St. Petersburg", "Izhstal"] },
  Czechia: { f: 0.33, gp: [30, 52], teams: ["HC Sparta Praha", "HC Oceláři Třinec", "HC Dynamo Pardubice", "Bílí Tygři Liberec", "HC Vítkovice", "HC Kometa Brno", "Rytíři Kladno", "Mountfield HK"] },
  "Czechia U20": { f: 0.95, gp: [36, 46], teams: ["HC Sparta Praha U20", "HC Oceláři Třinec U20", "HC Dynamo Pardubice U20", "Bílí Tygři Liberec U20", "HC Vítkovice U20", "HC Kometa Brno U20"] },
  Slovakia: { f: 0.42, gp: [36, 52], teams: ["HC Slovan Bratislava", "HC Košice", "HK Nitra", "HC '05 Banská Bystrica", "HK Dukla Trenčín", "HKM Zvolen"] },
  "Slovakia U20": { f: 0.95, gp: [36, 46], teams: ["HC Slovan Bratislava U20", "HC Košice U20", "HK Nitra U20", "HK Dukla Trenčín U20"] },
  NL: { f: 0.3, gp: [30, 52], teams: ["ZSC Lions", "HC Davos", "EV Zug", "SC Bern", "HC Lugano", "Genève-Servette HC", "Lausanne HC", "EHC Biel"] },
  "U20-Elit": { f: 0.95, gp: [36, 46], teams: ["ZSC Lions U20", "HC Davos U20", "EV Zug U20", "SC Bern U20", "HC Lugano U20", "Genève-Servette HC U20"] },
  DEL: { f: 0.3, gp: [30, 52], teams: ["Eisbären Berlin", "Adler Mannheim", "EHC Red Bull München", "Kölner Haie", "Augsburger Panther", "ERC Ingolstadt", "Grizzlys Wolfsburg"] },
  "DNL U20": { f: 1, gp: [30, 40], teams: ["Jungadler Mannheim", "Red Bull Akademie München", "Eisbären Juniors Berlin", "Kölner Junghaie"] },
};
const MENS = new Set(["SHL", "HockeyAllsvenskan", "Liiga", "Mestis", "KHL", "VHL", "Czechia", "Slovakia", "NL", "DEL", "NCAA"]);
const NATION_LEAGUES = {
  CAN: [["OHL", 36], ["WHL", 30], ["QMJHL", 20], ["USHL", 6], ["NCAA", 8]],
  USA: [["USNTDP", 20], ["USHL", 32], ["NCAA", 26], ["OHL", 11], ["WHL", 11]],
  SWE: [["J20 Nationell", 50], ["SHL", 30], ["HockeyAllsvenskan", 20]],
  FIN: [["U20 SM-sarja", 50], ["Liiga", 32], ["Mestis", 18]],
  RUS: [["MHL", 55], ["KHL", 25], ["VHL", 20]],
  CZE: [["Czechia", 30], ["Czechia U20", 35], ["OHL", 15], ["WHL", 10], ["QMJHL", 10]],
  SVK: [["Slovakia", 35], ["Slovakia U20", 25], ["OHL", 20], ["QMJHL", 20]],
  SUI: [["NL", 45], ["U20-Elit", 40], ["QMJHL", 15]],
  GER: [["DEL", 45], ["DNL U20", 35], ["OHL", 20]],
};
const TOWNS = {
  CAN: ["Toronto, ON", "Mississauga, ON", "Ottawa, ON", "London, ON", "Sudbury, ON", "Montréal, QC", "Québec City, QC", "Calgary, AB", "Edmonton, AB", "Winnipeg, MB", "Saskatoon, SK", "Regina, SK", "Vancouver, BC", "Kelowna, BC", "Halifax, NS"],
  USA: ["Minneapolis, MN", "Duluth, MN", "Boston, MA", "Detroit, MI", "Chicago, IL", "Buffalo, NY", "St. Louis, MO", "Pittsburgh, PA", "Denver, CO", "Dallas, TX", "Scottsdale, AZ", "Grand Forks, ND"],
  SWE: ["Stockholm", "Göteborg", "Malmö", "Luleå", "Skellefteå", "Karlstad", "Linköping", "Örnsköldsvik", "Jönköping"],
  FIN: ["Helsinki", "Tampere", "Turku", "Oulu", "Espoo", "Jyväskylä", "Kuopio", "Lahti", "Pori"],
  RUS: ["Moscow", "St. Petersburg", "Kazan", "Yaroslavl", "Omsk", "Chelyabinsk", "Magnitogorsk", "Ufa", "Nizhny Novgorod"],
  CZE: ["Prague", "Brno", "Ostrava", "Pardubice", "Plzeň", "Třinec", "Liberec", "Kladno"],
  SVK: ["Bratislava", "Košice", "Nitra", "Trenčín", "Zvolen"],
  SUI: ["Zürich", "Bern", "Davos", "Lugano", "Zug", "Geneva"],
  GER: ["Berlin", "Mannheim", "Munich", "Cologne", "Augsburg", "Ingolstadt"],
};

export function makeBio(p) {
  const r = stream(`${p.id}|bio`);
  const a = p.attrs;
  const opts = NATION_LEAGUES[p.nat] || NATION_LEAGUES.CAN;
  // Men's leagues and college are mostly for older or more developed prospects.
  const ready = (p.age >= 19 ? 1 : 0) + (p.ovr >= 76 ? 1 : 0);
  const lg = r.weighted(opts, ([name, w]) => (MENS.has(name) ? w * [0.45, 1, 1.6][ready] : w))[0];
  const L = LG[lg];
  const g = isGoalie(p.pos);
  const typeAdj = { PWF: 1, ENF: 1.5, END: 1.2, DFD: 0.6, SNP: -0.3, PLY: -0.7 }[p.type] || 0;
  const ht = clamp(Math.round((g ? 74.6 : isDefense(p.pos) ? 73.6 : 72.6) + typeAdj + r.gauss(0, 1.8)), 67, 79);
  const wt = clamp(Math.round(150 + (ht - 66) * 5 + ((a.str ?? 62) - 62) * 0.7 + r.gauss(0, 6)), 152, 235);
  const bio = { lg, team: r.pick(L.teams), town: r.pick(TOWNS[p.nat] || TOWNS.CAN), ht, wt };
  if (g) {
    const gc = avg([a.glh, a.gll, a.sth, a.stl, a.fiv]) * 0.55 + a.pos * 0.25 + a.reb * 0.1 + avg([a.spd, a.agi]) * 0.1;
    const svp = clamp(0.882 + (gc - 65) * 0.0017 + (L.f < 0.7 ? 0.006 : 0) + r.gauss(0, 0.006), 0.862, 0.938);
    const gp = Math.round(L.gp[1] * r.int(55, 85) / 100);
    Object.assign(bio, {
      gp,
      w: Math.round(gp * clamp(0.38 + (gc - 62) * 0.012 + r.gauss(0, 0.06), 0.2, 0.8)),
      svp: Math.round(svp * 1000) / 1000,
      gaa: Math.round(clamp(3.55 - (svp - 0.882) * 30 + r.gauss(0, 0.15), 1.6, 4.4) * 100) / 100,
      so: r.int(0, Math.max(1, Math.round(gp / 12))),
    });
  } else {
    const off = avg([a.wac, a.wpw]) * 0.35 + avg([a.dek, a.hey, a.puc]) * 0.25 + a.oaw * 0.25 + avg([a.spd, a.acc]) * 0.15;
    const x = off * 0.6 + p.ovr * 0.4;
    const ppg = clamp(0.2 + 0.55 * Math.exp((x - 60) / 16), 0.15, 2.7) * (isDefense(p.pos) ? 0.55 : 1) * L.f * (1 + r.gauss(0, 0.12));
    const gp = r.int(L.gp[0], L.gp[1]);
    const pts = Math.max(0, Math.round(ppg * gp));
    const share = isDefense(p.pos) ? (p.type === "OFD" ? 0.27 : 0.22) : { SNP: 0.52, PWF: 0.47, PLY: 0.33, GRN: 0.45, ENF: 0.45 }[p.type] || 0.42;
    const goals = clamp(Math.round(pts * share * (1 + r.gauss(0, 0.1))), 0, pts);
    Object.assign(bio, { gp, g: goals, a: pts - goals, pim: Math.max(2, Math.round(gp * clamp(0.25 + ((a.agr ?? 60) - 55) * 0.02 + ((a.fgt ?? 50) > 70 ? 0.4 : 0), 0.05, 2.2))) });
  }
  return bio;
}

export const fmtHeight = (ht) => `${Math.floor(ht / 12)}'${ht % 12}"`;
export const isEuropean = (p) => EURO_LEAGUES.has(p.bio?.lg);

// How much of the junior season has been played (stats on the board are season-to-date).
export function seasonShare(league) {
  if (league.phase === "preseason") return 0;
  if (league.phase === "regular") return clamp(league.day / Math.max(1, lastDay(league.schedule)), 0.03, 1);
  return 1;
}

export function bioStats(league, p) {
  const b = p.bio;
  if (!b) return null;
  const f = seasonShare(league);
  if (!f) return null;
  const k = (x) => Math.round(x * f);
  if (isGoalie(p.pos)) return { gp: Math.max(1, k(b.gp)), w: k(b.w), svp: b.svp, gaa: b.gaa, so: Math.min(b.so, k(b.so + 0.4)) };
  const g = k(b.g);
  const a = k(b.a);
  return { gp: Math.max(1, k(b.gp)), g, a, pts: g + a, pim: k(b.pim) };
}

// ---------- NHL Central Scouting ----------

// Midterm rankings come out with the class; final rankings after the Combine. The Big Board
// is always in this order, whatever your scouts find.
export function rankClass(league, ids) {
  const ps = ids.map((id) => league.players[id]).filter(Boolean);
  for (const p of ps) {
    p.bio ||= makeBio(p);
    // The public read: blind to hidden gems and red flags.
    p.cs ||= { score: publicPot(p) * 0.78 + p.ovr * 0.22 + stream(`${p.id}|cs`).gauss(0, 2.4) };
  }
  [...ps].sort((a, b) => b.cs.score - a.cs.score).forEach((p, i) => (p.cs.mid = i + 1));
}

// Central Scouting's rank: final after the Combine, otherwise where the in-season moves have
// him now (cs.now), otherwise the midterm rank.
export const csRank = (p) => p.cs?.final ?? p.cs?.now ?? p.cs?.mid ?? 999;
export const csScore = (p) => p.cs?.fscore ?? p.cs?.score ?? publicPot(p) * 0.78 + p.ovr * 0.22;

export function classPool(league) {
  return (league.draftClass || []).map((id) => league.players[id]).filter((p) => p && p.tid === -2);
}

// ---------- Junior stock watch ----------
// At each checkpoint the season moves Central Scouting's list: a handful of prospects rise or
// fall. Half the moves are real (toward what he truly is), half are hype or a bad stretch; only
// your scouts can tell which. The AI clubs lean on the list, so a hype riser goes too early.
const RISE = ["a six-point weekend against the league's best", "a dominant month in his league", "a standout CHL/U.S. Prospects showing", "a breakout stretch after a slow start", "scouts packing the stands for his last few games", "a big World Juniors camp"];
const FALL = ["a quiet stretch against weak competition", "three games missed with a lower-body injury", "questions about his compete level", "a rough outing at the World Juniors camp", "a long scoring drought", "too many turnovers at the blue line"];
export function stockWatch(league, week) {
  const cls = classPool(league);
  if (!cls.length || cls.some((p) => p.cs?.final != null) || cls.some((p) => p.cs?.moves?.some((m) => m.wk === week && m.yr === league.year))) return [];
  const r = stream(`${league.year}|${week}|stock|${cls[0].id}`);
  const pool = cls.filter((p) => p.cs && csRank(p) <= 160);
  const news = [];
  for (let i = 0; i < 6 && pool.length; i++) {
    const p = pool.splice(Math.floor(r.next() * pool.length), 1)[0];
    const truth = p.pot * 0.78 + p.ovr * 0.22 - p.cs.score;
    const real = r.next() < 0.5;
    const dir = real ? (truth >= 0 ? 1 : -1) : r.next() < 0.5 ? 1 : -1;
    const mag = 1.4 + r.next() * 2.4;
    const before = csRank(p);
    p.cs.score += dir * mag;
    p.cs.moves = [...(p.cs.moves || []), { yr: league.year, wk: week, d: dir, real }];
    news.push({ p, dir, before, why: (dir > 0 ? RISE : FALL)[Math.floor(r.next() * RISE.length)] });
  }
  // The list re-ranks (the midterm rank, cs.mid, stays as it was published).
  [...cls].sort((a, b) => b.cs.score - a.cs.score).forEach((p, i) => (p.cs.now = i + 1));
  return news.map((n) => ({ pid: n.p.id, name: n.p.name, pos: n.p.pos, team: n.p.bio?.team || "", lg: n.p.bio?.lg || "", dir: n.dir, from: n.before, to: csRank(n.p), why: n.why }));
}

// Who your scouts want eyes on at a checkpoint: prospects Central Scouting has near your pick (and
// fits for your needs, and this week's movers) that you haven't fully worked up.
export function scoutTargets(league, { pick = 16, needs = [], movers = [], n = 4 } = {}) {
  const near = (p) => Math.abs(csRank(p) - pick);
  return classPool(league).filter((p) => (p.scout?.lvl || 0) < 2 && near(p) <= 24)
    .map((p) => ({ p, s: near(p) - (needs.includes(p.pos) ? 10 : 0) - (movers.includes(p.id) ? 8 : 0) - ((p.scout?.lvl || 0) === 0 ? 3 : 0) }))
    .sort((a, b) => a.s - b.s || csRank(a.p) - csRank(b.p)).slice(0, n).map((x) => x.p);
}

// The positions your club needs most (teamPlanning.teamNeeds, the one needs model): up to n,
// only real needs.
export function userNeeds(league, n = 3, min = 20) {
  const t = league.teams[league.userTid];
  return t ? teamNeeds(league, t).filter((x) => x.score >= min).slice(0, n).map((x) => x.pos) : [];
}

// Where you pick: your earliest remaining pick in the coming draft (projected from the one draft
// order), or where your own record would put you if you've traded it.
export function userPickAround(league) {
  const slots = myDraftSlots(league);
  if (slots.length) return { slot: slots[0], own: true, slots };
  const order = projectedDraftOrder(league);
  const i = order ? order.indexOf(league.userTid) : -1;
  return { slot: i >= 0 ? i + 1 : null, own: false, slots };
}

// ---------- Scouting misses ----------
// A drafted player's ceiling (POT) starts as what was believed on draft day: your scouts' read for
// your own picks (exact only if they nailed him), Central Scouting's public read otherwise. The
// truth comes out over his first two seasons: a first read by the middle of his first season, most
// of it by the end of it, all of it by the end of his second. His real ceiling (p.pot) drives his
// growth the whole time; only what the club believes moves. p.potRev = { from, stage, by }.
export const REVEAL = [0, 0.4, 0.75, 1];
export const PUBLIC_MISS_SD = 4.5;
export function draftedPot(league, p, read) {
  const v = read?.potV;
  if (v != null) return Math.round(v);
  const miss = clamp(stream(`miss|${p.id}`).gauss(0, PUBLIC_MISS_SD), -10, 10);
  return Math.round(publicPot(p) + miss);
}
// Stamp a pick you just made with what's believed. No-op when it's already the truth.
export function tagDraftee(league, p, read) {
  const believed = clamp(draftedPot(league, p, read), p.ovr, 99);
  if (read?.exact || believed === p.pot) return null;
  p.potRev = { from: believed, stage: 0, by: read?.potV != null ? (read.lvl > 0 ? "report" : "read") : "cs", year: p.draft?.year ?? league.year + 1 };
  return p.potRev;
}
// Stage of the reveal right now: his first season is the season that starts the autumn after the
// draft (league.year === draft year).
export function revealStage(league, p) {
  const rk = p.potRev?.year ?? p.draft?.year;
  if (rk == null) return 3;
  const over = league.phase !== "regular" && league.phase !== "preseason";
  const mid = league.phase === "regular" && league.day >= lastDay(league.schedule || []) / 2;
  if (league.year > rk + 1 || (league.year === rk + 1 && over)) return 3;
  if (league.year > rk || (league.year === rk && over)) return 2;
  if (league.year === rk && mid) return 1;
  return 0;
}
// The ceiling the club believes now, and whether it's still an estimate.
export function believedPot(league, p) {
  const r = p.potRev;
  if (!r || r.stage >= 3) return { pot: p.pot, est: false };
  return { pot: clamp(Math.round(r.from + (p.pot - r.from) * REVEAL[r.stage]), p.ovr, 99), est: true, stage: r.stage, from: r.from };
}
// Move your draftees' believed ceilings toward the truth. Mutates; returns the news lines.
export function revealDraftees(league) {
  const t = league.teams[league.userTid];
  if (!t) return [];
  const out = [];
  for (const id of [...t.roster, ...t.prospects]) {
    const p = league.players[id];
    const r = p?.potRev;
    if (!r || r.stage >= 3) continue;
    const st = revealStage(league, p);
    if (st <= r.stage) continue;
    const before = believedPot(league, p).pot;
    r.stage = st;
    const now = believedPot(league, p).pot;
    const gap = p.pot - r.from;
    if (Math.abs(gap) >= 4 && now !== before) {
      const n = { pid: p.id, name: p.name, pos: p.pos, stage: st, from: r.from, to: now, gap };
      out.push(n);
      league.inbox?.push({ year: league.year, day: league.day, text: revealLine(n) });
      if (st >= 3) queueMoment(league, revealMoment(league, p, n));
    }
  }
  return out;
}
export function revealLine({ name, pos, stage, from, to, gap }) {
  const who = `${name} (${pos})`;
  if (stage >= 3) return gap > 0
    ? `💎 SCOUTING STEAL: ${who} is better than anyone thought. His ceiling is ${to}, not the ${from} your draft-day read had.`
    : `📉 SCOUTING MISS: ${who} isn't what the scouts said. His ceiling is ${to}, not the ${from} your draft-day read had.`;
  return gap > 0
    ? `📈 ${who} is showing more than expected: the development staff now see a ceiling around ${to} (draft-day read ${from}).`
    : `⚠️ ${who} isn't developing like the scouts said: the development staff now see a ceiling around ${to} (draft-day read ${from}).`;
}

// ---------- The scouts' visit list ----------
// Combine week: your scouts' shortlist of who to interview and bring in for a private workout,
// the way a real staff builds its visit list. They weigh:
//  - where you pick: prospects Central Scouting has a little ahead of or behind each of your first
//    three picks (wider for later picks). Stars long gone before you pick are left off.
//  - what you need: your thinnest positions first (teamPlanning.teamNeeds).
//  - what they think of him: one they grade above the rest of that range (or a sleeper or hunch)
//    is worth a closer look; one they grade well below it drops off.
//  - Combine fallers: early names who tested poorly. A real concern or a bad day?
//  - what they don't know yet: before a 1st- or 2nd-round pick they want answers on a rough read,
//    a red flag, a poor Combine or a raw project.
// Returns [{ p, slot, why: [..], interview, workout }].
export function scoutsShortlist(league, { max = 8, slots = myDraftSlots(league) } = {}) {
  const cls = classPool(league);
  const needs = userNeeds(league, 3);
  const picks = [...new Set(slots)].filter((s) => s > 0).sort((a, b) => a - b).slice(0, 3);
  const out = [];
  const taken = new Set();
  picks.forEach((slot, k) => {
    const premium = slot <= 64;
    const lo = Math.max(1, slot - (k === 0 ? 8 : 12)), hi = slot + (k === 0 ? 14 : 24);
    const near = cls.filter((p) => !taken.has(p.id) && csRank(p) >= lo && csRank(p) <= hi).map((p) => ({ p, read: prospectRead(league, p) }));
    const pots = near.map((x) => x.read.potV).filter((v) => v != null).sort((a, b) => a - b);
    const mid = pots.length ? pots[Math.floor(pots.length / 2)] : null;
    const pool = near.map(({ p, read }) => {
      const interview = !!p.combine && !p.scout?.intv, workout = read.lvl < 2;
      const need = needs.includes(p.pos), faller = !!p.combine && p.combine.pct < 0.3 && (p.cs?.mid ?? 999) <= 96;
      const flag = read.flag && !p.scout?.intv;
      const rel = read.potV != null && mid != null ? read.potV - mid : 0;
      const likes = read.sleeper || read.hunch || rel >= 3;
      const rough = read.lvl === 0, raw = read.potV != null && read.ovrV != null && read.potV - read.ovrV >= 18;
      const unsure = (rough ? 2 : read.lvl < 2 ? 1 : 0) + (flag ? 3 : 0) + (faller ? 2 : 0) + (raw ? 1 : 0);
      const score = (need ? 6 : 0) + Math.max(-4, Math.min(4, rel / 1.5)) + (read.sleeper ? 3 : read.hunch ? 2 : 0) + unsure * (premium ? 1.2 : 0.6) + (interview ? 1 : 0) - Math.abs(csRank(p) - slot) / 8;
      return { p, slot, read, interview, workout, need, faller, flag, likes, rel, rough, raw, premium, score };
    })
      .filter((x) => (x.interview || x.workout) && !(x.rel <= -4 && !x.need && !x.likes))
      .sort((a, b) => b.score - a.score || csRank(a.p) - csRank(b.p))
      .slice(0, k === 0 ? 4 : 2);
    for (const x of pool) { taken.add(x.p.id); out.push(x); }
  });
  return out.slice(0, max).map(({ p, slot, read, interview, workout, need, faller, flag, likes, rel, rough, raw, premium }) => {
    const r = csRank(p);
    const why = [r <= slot - 3 ? `CS #${r}: could slide to your #${slot}` : r >= slot + 6 ? `CS #${r}: there at #${slot}, maybe later` : `CS #${r}: right around your #${slot}`];
    if (need) why.push(`fills a need (${p.pos})`);
    if (read.sleeper) why.push("your scouts think he's a sleeper");
    else if (read.hunch) why.push("your scouts have a hunch about him");
    else if (likes && read.grade) why.push(`your scouts rate him above the others in this range (${read.grade})`);
    else if (rel <= -3 && read.grade) why.push(`your scouts are lukewarm (${read.grade})`);
    const pickWord = slot <= 32 ? "a 1st" : slot <= 64 ? "a 2nd" : "this pick";
    if (flag) why.push(`red flag: get the story before spending ${pickWord}`);
    else if (faller) why.push("tested poorly: a real concern or a bad day?");
    else if (rough && premium) why.push(`only a rough read so far: know more before spending ${pickWord}`);
    else if (raw && premium) why.push("a raw project: is the work ethic there?");
    else if (!interview && workout) why.push("interviewed; a workout gets his exact ratings");
    return { p, slot, why, interview, workout };
  });
}

// A private workout (Combine week only): a full workup for free.
export function privateWorkout(league, pid) {
  const d = league.draft;
  const p = league.players[pid];
  if (!d || d.stage !== "combine") return { ok: false, msg: "Private workouts happen during Combine week." };
  if (!p || p.tid !== -2 || !p.scout) return { ok: false, msg: "He isn't in this draft." };
  if ((d.workoutsLeft ?? 0) <= 0) return { ok: false, msg: "You've used all your private workouts." };
  if ((p.scout.lvl || 0) >= 2) return { ok: false, msg: `${p.name} is already fully scouted.` };
  d.workoutsLeft--;
  fileReport(league, p, 2);
  return { ok: true, msg: `${p.name} came in for a private workout: ${p.scout.who} has the full read.` };
}

// ---------- Scouting Combine ----------

export const COMBINE_TESTS = [
  { k: "wingate", name: "Wingate peak power", short: "Wingate", unit: "W/kg", dp: 1 },
  { k: "vo2", name: "VO2 max", short: "VO2", unit: "ml/kg/min", dp: 1 },
  { k: "jump", name: "Standing long jump", short: "Jump", unit: "in", dp: 0 },
  { k: "agility", name: "Pro agility", short: "Agility", unit: "s", dp: 2, lowGood: true },
  { k: "bench", name: "Bench press", short: "Bench", unit: "reps", dp: 0 },
  { k: "pullups", name: "Pull-ups", short: "Pull-ups", unit: "", dp: 0 },
];

function combineTests(p) {
  const a = p.attrs;
  const r = stream(`${p.id}|combine`);
  const spd = a.spd ?? 65;
  const acc = a.acc ?? a.agi ?? 65;
  const agi = a.agi ?? 65;
  const end = a.end ?? 75;
  const str = a.str ?? 58 + ((a.dur ?? 75) - 75) * 0.4;
  const rd = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
  return {
    wingate: rd(clamp(12 + ((acc + spd) / 2 - 60) * 0.11 + r.gauss(0, 0.6), 10, 17.5), 1),
    vo2: rd(clamp(47 + (end - 75) * 0.35 + r.gauss(0, 2.2), 40, 62), 1),
    jump: Math.round(clamp(100 + ((spd + acc) / 2 - 60) * 0.55 + r.gauss(0, 3.5), 86, 124)),
    agility: rd(clamp(4.62 - (agi - 60) * 0.009 + r.gauss(0, 0.07), 4.15, 5.05), 2),
    bench: Math.round(clamp(6 + (str - 60) * 0.22 + r.gauss(0, 2), 0, 18)),
    pullups: Math.round(clamp(7 + (str - 60) * 0.2 + r.gauss(0, 2.2), 0, 20)),
  };
}
// A red-flag workout warrior tests like a top-10 pick; it just doesn't show up on the ice.
function warriorTests(t) {
  return { ...t, wingate: Math.min(17.5, Math.round((t.wingate + 1.4) * 10) / 10), vo2: Math.min(62, Math.round((t.vo2 + 4) * 10) / 10), jump: Math.min(124, t.jump + 7), agility: Math.max(4.15, Math.round((t.agility - 0.14) * 100) / 100), bench: Math.min(18, t.bench + 4), pullups: Math.min(20, t.pullups + 4) };
}

const COMBINE_LETTERS = [[0.95, "A+"], [0.85, "A"], [0.75, "A-"], [0.65, "B+"], [0.55, "B"], [0.45, "B-"], [0.35, "C+"], [0.25, "C"], [0.15, "C-"], [-1, "D"]];

// After the Stanley Cup Final: the top prospects test at the Combine, Central Scouting
// publishes its final rankings, and you get interview slots and a little more budget.
export function runCombine(league) {
  const d = league.draft;
  revealDraftees(league);
  const pool = classPool(league);
  if (pool.some((p) => !p.cs)) rankClass(league, pool.map((p) => p.id));
  // Invitations go by where Central Scouting has him now (the in-season moves count).
  pool.sort((a, b) => csRank(a) - csRank(b));
  const invited = pool.slice(0, COMBINE_INVITES);
  for (const p of invited) p.combine = { tests: p.bust?.kind === "combine" ? warriorTests(combineTests(p)) : combineTests(p) };
  for (const test of COMBINE_TESTS) {
    const sorted = [...invited].sort((a, b) => (test.lowGood ? b.combine.tests[test.k] - a.combine.tests[test.k] : a.combine.tests[test.k] - b.combine.tests[test.k]));
    sorted.forEach((p, i) => ((p.combine.pcts ||= {})[test.k] = sorted.length > 1 ? i / (sorted.length - 1) : 0.5));
  }
  for (const p of invited) {
    p.combine.pct = avg(Object.values(p.combine.pcts));
    p.combine.grade = COMBINE_LETTERS.find(([min]) => p.combine.pct >= min)[1];
  }
  for (const p of pool) p.cs.fscore = p.cs.score + (p.combine ? (p.combine.pct - 0.5) * 2.6 : -0.4) + stream(`${p.id}|final`).gauss(0, 0.9);
  [...pool].sort((a, b) => b.cs.fscore - a.cs.fscore).forEach((p, i) => (p.cs.final = i + 1));
  if (d) {
    d.stage = "combine";
    d.interviewsLeft = COMBINE_INTERVIEWS + (SCOUT_SLOTS.some((role) => league.teams[league.userTid]?.scouts?.[role]?.trait === "combine") ? 1 : 0);
    d.workoutsLeft = PRIVATE_WORKOUTS;
    d.buzz = combineBuzz(pool, invited);
  }
  league.inbox?.push({ year: league.year, day: league.day, text: `The Scouting Combine is done: test results and Central Scouting's final rankings are out. You have ${d?.interviewsLeft ?? COMBINE_INTERVIEWS} interview slots and ${PRIVATE_WORKOUTS} private workouts before the draft. Your scouts' visit list is on the Your scouts tab.` });
}

function combineBuzz(pool, invited) {
  const pre = (p) => p.cs.now ?? p.cs.mid;
  const top = pool.filter((p) => pre(p) <= 128 || p.cs.final <= 96);
  const short = (p) => `${p.name} (${p.pos}, ${p.bio?.team || "?"})`;
  const up = [...top].sort((a, b) => pre(b) - b.cs.final - (pre(a) - a.cs.final)).slice(0, 5).filter((p) => pre(p) > p.cs.final);
  const down = [...top].sort((a, b) => pre(a) - a.cs.final - (pre(b) - b.cs.final)).slice(0, 4).filter((p) => p.cs.final > pre(p));
  const buzz = [];
  for (const p of up) buzz.push({ kind: "up", pid: p.id, text: `${short(p)} climbs from #${pre(p)} to #${p.cs.final}${p.combine ? ` after ${p.combine.grade[0] === "A" ? "an eye-opening" : "a solid"} Combine (${p.combine.grade})` : ""}.` });
  for (const p of down) buzz.push({ kind: "down", pid: p.id, text: `${short(p)} slides from #${pre(p)} to #${p.cs.final}${p.combine ? `; his ${p.combine.grade} Combine raised questions` : "; he wasn't invited to the Combine"}.` });
  for (const test of COMBINE_TESTS.slice(0, 4)) {
    const best = [...invited].sort((a, b) => (test.lowGood ? a.combine.tests[test.k] - b.combine.tests[test.k] : b.combine.tests[test.k] - a.combine.tests[test.k]))[0];
    if (best) buzz.push({ kind: "best", pid: best.id, text: `${short(best)} topped the ${test.name.toLowerCase()} (${best.combine.tests[test.k].toFixed(test.dp)}${test.unit ? ` ${test.unit}` : ""}).` });
  }
  return buzz;
}

const INTERVIEW_NOTES = {
  high: ["Rink rat: first on the ice, last off it.", "Obsessed with getting better; already has a summer training plan.", "Mature beyond his years. Teammates rave about him.", "Asked our staff more questions than we asked him."],
  mid: ["Polite, coachable, a little reserved.", "Says the right things; work habits look solid.", "Knows what he needs to improve and has a plan for it."],
  low: ["Coaches question his consistency.", "Needs to grow up away from the rink.", "Struggled to name anything in his game he needs to work on.", "The talent is there; the habits aren't yet."],
};

// A sit-down at the Combine: a read on his work ethic, which tends to go with how fast he develops.
export function interviewProspect(league, pid) {
  const d = league.draft;
  const p = league.players[pid];
  if (!d || d.stage !== "combine") return { ok: false, msg: "Interviews happen at the Scouting Combine, before the draft starts." };
  if (!p || p.tid !== -2 || !p.combine) return { ok: false, msg: "He wasn't invited to the Combine." };
  if (p.scout?.intv) return { ok: false, msg: "You've already interviewed him." };
  if ((d.interviewsLeft ?? 0) <= 0) return { ok: false, msg: "You've used all your interview slots." };
  d.interviewsLeft--;
  const r = stream(`${p.id}|intv`);
  // A work-ethic red flag shows in the room; so does a workout warrior who can't talk the game.
  const ethic = p.bust?.kind === "ethic", warrior = p.bust?.kind === "combine";
  const v = ({ generational: 94, superstar: 90, star: 85, normal: 77, late: 73 }[p.dev] ?? 77) + r.gauss(0, 3.5) - (ethic ? 14 : 0);
  const flag = ethic || warrior ? `🚩 Red flag from the interview: ${p.bust.why}.` : null;
  (p.scout ||= { lvl: 0 }).intv = { grade: potGrade(v), note: ethic ? r.pick(INTERVIEW_NOTES.low) : warrior ? "Couldn't walk us through his own shifts on video. The testing is real; the hockey sense isn't." : r.pick(INTERVIEW_NOTES[v >= 85 ? "high" : v >= 77 ? "mid" : "low"]), ...(flag ? { flag } : {}) };
  return { ok: true, msg: `Interview with ${p.name}: work ethic ${p.scout.intv.grade}.${flag ? " 🚩 Red flag raised: see his profile." : ""}` };
}

export function openDraftFloor(league) {
  if (league.draft && league.draft.stage === "combine") league.draft.stage = "live";
}
export const atCombine = (league) => league.phase === "draft" && league.draft?.stage === "combine";

// ---------- Draft-day grades ----------

const GRADE_ORDER = ["D", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"];

// The analysts' instant grade: where he went against where Central Scouting had him.
export function pickGrade(overall, rank) {
  if (overall <= 3 && rank <= overall) return "A";
  const rel = (overall - rank) / Math.max(3, overall * 0.3);
  return rel >= 1.2 ? "A+" : rel >= 0.45 ? "A" : rel >= 0.1 ? "A-" : rel >= -0.25 ? "B+" : rel >= -0.6 ? "B" : rel >= -1 ? "B-" : rel >= -1.5 ? "C+" : rel >= -2.2 ? "C" : rel >= -3 ? "C-" : "D";
}

export function pickTake(grade, overall, rank) {
  if (grade === "A+") return `Steal. Central Scouting had him #${rank}.`;
  if (grade === "A") return overall <= rank ? `The best player available (Central Scouting #${rank}).` : `Great value at #${overall} (Central Scouting #${rank}).`;
  if (grade === "A-" || grade === "B+") return `About where he was expected to go (Central Scouting #${rank}).`;
  if (grade === "B" || grade === "B-") return `A bit of a reach, but there's plenty to like (Central Scouting #${rank}).`;
  if (grade[0] === "C") return `A reach. Most boards had him around #${rank}.`;
  return `Head-scratcher. Central Scouting ranked him #${rank}.`;
}

export function teamDraftGrade(league, tid) {
  const slots = (league.draft?.slots || []).filter((s) => s.owner === tid && s.pid && s.grade);
  if (!slots.length) return null;
  const i = Math.round(avg(slots.map((s) => GRADE_ORDER.indexOf(s.grade))));
  return GRADE_ORDER[clamp(i, 0, GRADE_ORDER.length - 1)];
}

// ---------- Your list ----------

export function myList(league) {
  const year = league.draftClassYear;
  if (!league.myList || league.myList.year !== year) league.myList = { year, ids: [] };
  return league.myList;
}
export const onMyList = (league, pid) => myList(league).ids.includes(pid);
export function toggleMyList(league, pid) {
  const l = myList(league);
  l.ids = l.ids.includes(pid) ? l.ids.filter((x) => x !== pid) : [...l.ids, pid];
}
export function moveOnMyList(league, pid, dir) {
  const l = myList(league);
  const i = l.ids.indexOf(pid);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= l.ids.length) return;
  [l.ids[i], l.ids[j]] = [l.ids[j], l.ids[i]];
}

// ---------- Old saves ----------

export function migrateScouting(l) {
  const user = l.teams[l.userTid];
  if (user && !("scouts" in user)) user.scouts = defaultScouts(l);
  // Hands-off scouting (batch x2): no scouting points, area points or in-season checkpoints.
  for (const t of l.teams || []) { delete t.scoutPts; delete t.scoutLost; delete t.area; }
  // r11: a scout works several regions (3 / 2 / 1 / 1); old one-region saves fill the new slots.
  if (user) { migrateScoutRegions(l, classPool(l)); scoutAssignments(l, user); }
  if (Array.isArray(l.moments)) l.moments = l.moments.filter((m) => m?.kind !== "scoutCheckpoint");
  if (!Array.isArray(l.scoutPool)) refreshScoutPool(l);
  for (const id in l.players) {
    const p = l.players[id];
    if (!p.dev) p.dev = rollDev(p.id, p.pot);
    if (!p.scout) continue;
    // Old reads: { lvl, eOvr, ePot } with lvl 2 meaning exact.
    if (!p.scout.base) {
      const old = { eOvr: p.scout.eOvr ?? p.ovr, ePot: p.scout.ePot ?? p.pot };
      p.scout.base = old;
      if (!p.scout.lvl) {
        delete p.scout.eOvr;
        delete p.scout.ePot;
      } else {
        p.scout.exact = p.scout.lvl >= 2;
        p.scout.sd = p.scout.lvl >= 2 ? 0 : 2;
        p.scout.by ||= "office";
        p.scout.who ||= "Your front office";
      }
    }
  }
  const cls = (l.draftClass || []).filter((id) => l.players[id]);
  if (cls.some((id) => !l.players[id].cs)) rankClass(l, cls);
  if (l.draft && !l.draft.stage) l.draft.stage = "live";
  // Saves from before hidden gems and red flags: plant them in the coming class (never in one
  // whose draft has started), on prospects you haven't filed a report on.
  if (cls.length && l.hiddenSeeded !== l.draftClassYear && !l.draft && !cls.some((id) => l.players[id].gem || l.players[id].bust)) plantHiddenTalent(l, cls, l.draftClassYear);
  if (l.draft?.stage === "combine" && l.draft.workoutsLeft == null) l.draft.workoutsLeft = PRIVATE_WORKOUTS;
}
