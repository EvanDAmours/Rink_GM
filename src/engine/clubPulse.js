// Club pulse: the franchise "feel" layer carried over from Gridiron GM and adapted to hockey —
// Season Points (SP), team morale and chemistry, GM reputation, press conferences, locker-room
// speeches, power rankings, playoff odds and roster grades.
//
// Morale and chemistry exist for every club (the game engine reads them symmetrically, with small
// bounded effects); SP, reputation and the media prompts belong to the user's front office.
// Everything random here draws from keyed streams so it never disturbs the game's main stream.
import { stream, clamp } from "./rng.js";
import { teamRatings } from "./lines.js";
import { isGoalie } from "./constants.js";

export const MORALE_NEUTRAL = 50;
export const CHEM_NEUTRAL = 75;
export const SP_WEEKLY = 2;

export const REP_TIERS = [
  { min: 90, label: "LEGEND", color: "#f59e0b" },
  { min: 75, label: "ELITE", color: "#a78bfa" },
  { min: 60, label: "RESPECTED", color: "#22c55e" },
  { min: 40, label: "VETERAN", color: "#60a5fa" },
  { min: 0, label: "ROOKIE", color: "#94a3b8" },
];

export function repTier(rep) {
  const i = REP_TIERS.findIndex((t) => rep >= t.min);
  const tier = REP_TIERS[i];
  const next = REP_TIERS[i - 1];
  return { ...tier, next: next ? next.min : 100, nextLabel: next?.label || null, pct: next ? (rep - tier.min) / (next.min - tier.min) : 1 };
}
export const moraleLabel = (m) => (m >= 65 ? "HIGH" : m >= 40 ? "MED" : "LOW");
export const tierColor = (v, hi = 65, mid = 40) => (v >= hi ? "#22c55e" : v >= mid ? "#eab308" : "#ef4444");

export function ensurePulse(league) {
  league.gm ||= {};
  const gm = league.gm;
  gm.sp ??= 10;
  gm.rep ??= 50;
  gm.spWeek ??= -1;
  gm.ledger ||= [];
  gm.lastDay ??= -1;
  gm.pressLog ||= [];
  gm.power ||= null;
  gm.season ??= league.year;
  for (const t of league.teams) {
    t.morale ??= MORALE_NEUTRAL;
    t.chemistry ??= CHEM_NEUTRAL;
    t.pulseRoster ||= [...t.roster];
  }
  return gm;
}

function ledger(league, n, label) {
  const gm = league.gm;
  gm.ledger.unshift({ year: league.year, day: league.day, n, label });
  if (gm.ledger.length > 60) gm.ledger.length = 60;
}
export function earnSP(league, n, label) {
  ensurePulse(league);
  if (!n) return;
  league.gm.sp = Math.max(0, league.gm.sp + n);
  ledger(league, n, label);
}
// Spend Season Points; returns false (and spends nothing) if the club can't afford it.
export function spendSP(league, n, label) {
  ensurePulse(league);
  if (league.gm.sp < n) return false;
  league.gm.sp -= n;
  ledger(league, -n, label);
  return true;
}
export function addRep(league, n) {
  ensurePulse(league);
  league.gm.rep = clamp(Math.round((league.gm.rep + n) * 10) / 10, 0, 100);
}
// Gains shrink near the top and losses near the bottom, so long streaks saturate instead of pinning.
const bump = (t, key, n, neutral) => {
  const v = t[key] ?? neutral;
  const d = n > 0 ? n * (100 - v) / 50 : n * v / 50;
  t[key] = clamp(Math.round((v + d) * 10) / 10, 0, 100);
};

// ---------- Results ----------

// How one finished game moves both clubs. `res` is "W", "L" or "OTL" from team t's view.
function applyGame(league, t, res, streak, key) {
  const user = t.id === league.userTid;
  if (res === "W") {
    bump(t, "morale", 4 + (streak >= 3 ? 2 : 0), MORALE_NEUTRAL);
    bump(t, "chemistry", 1.5, CHEM_NEUTRAL);
    if (user) addRep(league, 0.6);
  } else if (res === "OTL") {
    bump(t, "morale", -1.5, MORALE_NEUTRAL);
    if (user) addRep(league, -0.1);
  } else {
    bump(t, "morale", -4 - (streak <= -3 ? 2 : 0), MORALE_NEUTRAL);
    bump(t, "chemistry", -1, CHEM_NEUTRAL);
    if (user) addRep(league, -0.4);
  }
  if (user) offerPrompts(league, res, key);
}

// rec.streak is ["W"|"L"|"O", n]; positive for a win streak, negative for a losing one.
const streakOf = (t) => {
  const s = t.rec?.streak;
  if (!Array.isArray(s)) return 0;
  return s[0] === "W" ? s[1] : s[0] === "L" ? -s[1] : 0;
};

// Regular season: every club that played today. Called from finishDay before the day advances.
export function pulseAfterDay(league) {
  ensurePulse(league);
  if (league.day <= league.gm.lastDay) return pulseWeek(league);
  league.gm.lastDay = league.day;
  for (const g of league.schedule) {
    if (g.day !== league.day || !g.played) continue;
    const H = league.teams[g.h];
    const A = league.teams[g.a];
    const hw = g.hs > g.as;
    applyGame(league, H, hw ? "W" : g.ot ? "OTL" : "L", streakOf(H), `g${g.id}`);
    applyGame(league, A, hw ? (g.ot ? "OTL" : "L") : "W", streakOf(A), `g${g.id}`);
  }
  pulseWeek(league);
}

// Playoffs: any series game not yet counted. Called after each playoff day.
export function pulseAfterPlayoffDay(league) {
  ensurePulse(league);
  const po = league.playoffs;
  if (!po) return;
  po.rounds.forEach((round, r) =>
    round.forEach((s, i) => {
      s.pulseN ??= 0;
      while (s.pulseN < s.games.length) {
        const g = s.games[s.pulseN++];
        const hw = g.hs > g.as;
        const key = `po${league.year}-${r}-${i}-${s.pulseN}`;
        applyGame(league, league.teams[g.h], hw ? "W" : "L", 0, key);
        applyGame(league, league.teams[g.a], hw ? "L" : "W", 0, key);
      }
      if (s.winner != null && !s.pulseDone) {
        s.pulseDone = true;
        if (s.winner === league.userTid) {
          addRep(league, 3);
          earnSP(league, 3, "Won a playoff series");
        } else if (s.top === league.userTid || s.bot === league.userTid) addRep(league, -1);
      }
    })
  );
  checkAchievements(league);
  if (po.champion != null && !po.pulseDone) {
    po.pulseDone = true;
    if (po.champion === league.userTid) {
      addRep(league, 10);
      earnSP(league, 8, "Stanley Cup champions");
    }
  }
}

// Weekly tick: SP income, drift back toward neutral, new faces in the room, power rankings.
export function pulseWeek(league) {
  const gm = ensurePulse(league);
  const week = Math.floor(league.day / 7);
  if (week <= gm.spWeek) return;
  const n = week - gm.spWeek;
  gm.spWeek = week;
  const user = league.teams[league.userTid];
  const fan = user.owner?.fanSupport ?? 60;
  const perWeek = SP_WEEKLY + (gm.rep >= 60 ? 1 : 0) + (gm.rep >= 90 ? 1 : 0) + (fan < 30 ? -1 : fan > 70 ? 1 : 0);
  if (league.phase === "regular" && week > 0) earnSP(league, perWeek * n, `Weekly income (${n} wk)`);
  for (const t of league.teams) {
    for (let i = 0; i < n; i++) {
      t.morale = Math.round((t.morale + (MORALE_NEUTRAL - t.morale) * 0.12) * 10) / 10;
      t.chemistry = Math.round((t.chemistry + (CHEM_NEUTRAL - t.chemistry) * 0.06) * 10) / 10;
    }
    // New faces take time to fit in; a settled room grows together.
    const before = new Set(t.pulseRoster || []);
    const newcomers = t.roster.filter((id) => !before.has(id) && league.players[id]?.ovr >= 70).length;
    if (newcomers) bump(t, "chemistry", -1.5 * Math.min(newcomers, 4), CHEM_NEUTRAL);
    else bump(t, "chemistry", 0.4, CHEM_NEUTRAL);
    t.pulseRoster = [...t.roster];
  }
  if (league.phase === "regular") updatePower(league, week);
  checkAchievements(league);
}

// New season: carry a little of last year's mood, refresh the room.
export function pulseNewSeason(league) {
  const gm = ensurePulse(league);
  gm.spWeek = -1;
  gm.lastDay = -1;
  gm.power = null;
  gm.season = league.year;
  gm.presser = null;
  gm.speech = null;
  for (const t of league.teams) {
    t.morale = Math.round((MORALE_NEUTRAL + (t.morale - MORALE_NEUTRAL) * 0.4) * 10) / 10;
    t.chemistry = Math.round((CHEM_NEUTRAL + (t.chemistry - CHEM_NEUTRAL) * 0.5) * 10) / 10;
    t.pulseRoster = [...t.roster];
  }
  earnSP(league, 6, "New season budget");
}

// End of the regular season: missing the playoffs costs reputation.
export function pulseSeasonEnd(league) {
  ensurePulse(league);
  const po = league.playoffs;
  const inIt = po?.rounds[0].some((s) => s.top === league.userTid || s.bot === league.userTid);
  if (po && !inIt) addRep(league, -4);
  else if (inIt) {
    addRep(league, 2);
    earnSP(league, 2, "Made the playoffs");
  }
}

// ---------- Morale/chemistry actions bought with SP ----------

export const SP_ACTIONS = {
  meeting: { cost: 1, name: "Team meeting", desc: "Clear the air: +5 morale, +2 chemistry." },
  teamEvent: { cost: 2, name: "Team bonding trip", desc: "A night away together: +6 chemistry." },
  fanNight: { cost: 2, name: "Fan appreciation night", desc: "+5 fan support." },
  ownerLunch: { cost: 2, name: "Lunch with the owner", desc: "+6 owner trust." },
  scoutTrip: { cost: 2, name: "Fund a scouting trip", desc: "+1 scouting point." },
};
export function runAction(league, key) {
  const a = SP_ACTIONS[key];
  const t = league.teams[league.userTid];
  if (!a) return { ok: false, msg: "Unknown action." };
  if (!spendSP(league, a.cost, a.name)) return { ok: false, msg: `Not enough Season Points (${a.cost} SP needed).` };
  if (key === "meeting") {
    bump(t, "morale", 5, MORALE_NEUTRAL);
    bump(t, "chemistry", 2, CHEM_NEUTRAL);
  } else if (key === "teamEvent") bump(t, "chemistry", 6, CHEM_NEUTRAL);
  else if (key === "fanNight") t.owner && (t.owner.fanSupport = clamp((t.owner.fanSupport ?? 60) + 5, 0, 100));
  else if (key === "ownerLunch") t.owner && (t.owner.trust = clamp((t.owner.trust ?? 65) + 6, 0, 100));
  else if (key === "scoutTrip") t.scoutPts = (t.scoutPts || 0) + 1;
  return { ok: true, msg: `${a.name}: ${a.desc}` };
}

// ---------- Press conferences and locker-room speeches ----------

const PRESS = {
  W: [
    { q: "Big win tonight. Is this team a contender?", a: [
      { t: "We're the best team in this league.", fx: { morale: 3, fans: 3, rep: -0.5 }, risk: "Bulletin-board material for the next opponent." },
      { t: "One game at a time. We have work to do.", fx: { chemistry: 2, rep: 0.5 } },
      { t: "Credit to the guys. They earned this one.", fx: { morale: 2, chemistry: 1 } },
    ] },
    { q: "The top line was flying. What's working?", a: [
      { t: "Chemistry. Those three read each other perfectly.", fx: { chemistry: 2 } },
      { t: "Our depth made it possible. Everyone contributed.", fx: { morale: 2, chemistry: 1 } },
      { t: "We'll need more from the bottom six.", fx: { morale: -2, chemistry: -1, rep: 0.5 } },
    ] },
  ],
  L: [
    { q: "Tough loss. What went wrong out there?", a: [
      { t: "That's on me. We'll be better prepared.", fx: { morale: 2, rep: 0.5 } },
      { t: "Some players need to look in the mirror.", fx: { morale: -3, chemistry: -2, fans: 2 } },
      { t: "The bounces didn't go our way. We move on.", fx: { morale: 1 } },
    ] },
    { q: "Fans are restless. Are changes coming?", a: [
      { t: "Everything is on the table.", fx: { morale: -2, fans: 3 } },
      { t: "I believe in this group.", fx: { morale: 3, chemistry: 1, fans: -1 } },
      { t: "We're always looking to improve the roster.", fx: { fans: 1, rep: 0.5 } },
    ] },
  ],
  OTL: [
    { q: "A point earned or a point lost?", a: [
      { t: "We take the point and build on it.", fx: { morale: 2 } },
      { t: "We should have closed that out in regulation.", fx: { morale: -1, chemistry: 1, rep: 0.5 } },
      { t: "Overtime's a coin flip. We played well.", fx: { morale: 1, chemistry: 1 } },
    ] },
  ],
};
const SPEECHES = {
  inspire: { name: "Inspire", desc: "Lift them up." },
  challenge: { name: "Challenge", desc: "Demand more. Risky, can backfire." },
  calm: { name: "Stay calm", desc: "Keep everyone level." },
};

function offerPrompts(league, res, key) {
  const gm = league.gm;
  // Press conferences and speeches are off: the game plays on without prompts.
  if (!league.settings?.prompts) { gm.presser = null; gm.speech = null; return; }
  const r = stream(`${key}|prompt`);
  // Unanswered prompts go stale after a few days; the newest result is what the room cares about.
  if (gm.presser && league.day - (gm.presser.day ?? 0) > 3) gm.presser = null;
  if (gm.speech && league.day - (gm.speech.day ?? 0) > 3) gm.speech = null;
  if (!gm.presser && r.chance(0.22)) {
    const pool = PRESS[res] || PRESS.L;
    gm.presser = { key, res, day: league.day, ...pool[r.int(0, pool.length - 1)] };
  } else if (!gm.speech && r.chance(0.3)) gm.speech = { key, res, day: league.day };
}

function applyFx(league, fx) {
  const t = league.teams[league.userTid];
  if (fx.morale) bump(t, "morale", fx.morale, MORALE_NEUTRAL);
  if (fx.chemistry) bump(t, "chemistry", fx.chemistry, CHEM_NEUTRAL);
  if (fx.fans && t.owner) t.owner.fanSupport = clamp((t.owner.fanSupport ?? 60) + fx.fans, 0, 100);
  if (fx.rep) addRep(league, fx.rep);
}
const fxText = (fx) => Object.entries(fx).filter(([, v]) => v).map(([k, v]) => `${v > 0 ? "+" : ""}${v} ${k === "fans" ? "fan support" : k === "rep" ? "GM rep" : k}`).join(", ");

export function answerPresser(league, i) {
  const gm = ensurePulse(league);
  const p = gm.presser;
  if (!p || !p.a[i]) return { ok: false, msg: "No press conference is waiting." };
  applyFx(league, p.a[i].fx);
  gm.pressLog.unshift({ year: league.year, day: league.day, q: p.q, a: p.a[i].t });
  if (gm.pressLog.length > 20) gm.pressLog.length = 20;
  gm.presser = null;
  return { ok: true, msg: `Press conference: ${fxText(p.a[i].fx)}.` };
}
export function skipPresser(league) {
  ensurePulse(league).presser = null;
}

export function giveSpeech(league, kind) {
  const gm = ensurePulse(league);
  const s = gm.speech;
  if (!s || !SPEECHES[kind]) return { ok: false, msg: "There's no speech to give right now." };
  const r = stream(`${s.key}|speech|${kind}`);
  const won = s.res === "W";
  let fx;
  if (kind === "inspire") fx = won ? { morale: 2, chemistry: 1 } : { morale: 3 };
  else if (kind === "calm") fx = { chemistry: 2 };
  else fx = r.chance(won ? 0.4 : 0.6) ? { morale: 5, chemistry: 1 } : { morale: -4, chemistry: -2 };
  applyFx(league, fx);
  gm.speech = null;
  return { ok: true, msg: `${SPEECHES[kind].name}: ${fxText(fx) || "no change"}.` };
}
export { SPEECHES };

// ---------- Power rankings, playoff odds, grades ----------

function powerScore(t) {
  const r = t.rec;
  if (!r.gp) return 0;
  const form = (r.last10 || "").split("").filter((c) => c === "W").length;
  return (r.pts / (2 * r.gp)) * 100 + ((r.gf - r.ga) / r.gp) * 8 + form * 0.6;
}
export function updatePower(league, week) {
  const gm = league.gm;
  const order = [...league.teams].sort((a, b) => powerScore(b) - powerScore(a) || teamRatings(league, b).ovr - teamRatings(league, a).ovr);
  const prev = gm.power?.ranks || {};
  gm.power = { week, ranks: Object.fromEntries(order.map((t, i) => [t.id, i + 1])), prev };
}
export function powerRankings(league) {
  ensurePulse(league);
  if (!league.gm.power) updatePower(league, Math.floor(league.day / 7));
  const { ranks, prev } = league.gm.power;
  return league.teams
    .map((t) => ({ t, rank: ranks[t.id], move: prev[t.id] ? prev[t.id] - ranks[t.id] : 0, score: powerScore(t) }))
    .sort((a, b) => a.rank - b.rank);
}

// Projected points vs the projected 8th seed in the conference, turned into a probability.
export function playoffOdds(league) {
  const total = (t) => (league.schedule.filter((g) => g.h === t.id || g.a === t.id).length || 82);
  const out = {};
  for (const conf of ["East", "West"]) {
    const ts = league.teams.filter((t) => t.conf === conf);
    const proj = ts.map((t) => {
      const gp = t.rec.gp;
      const left = Math.max(0, total(t) - gp);
      const pace = gp ? t.rec.pts / gp : 1.12;
      const prior = 0.9 + (teamRatings(league, t).ovr - 80) * 0.035;
      const w = Math.min(1, gp / 40);
      return { t, left, p: t.rec.pts + left * (pace * w + prior * (1 - w)) };
    });
    const cut = [...proj].sort((a, b) => b.p - a.p)[7]?.p ?? 90;
    for (const x of proj) {
      const sd = 2.5 + x.left * 0.11;
      out[x.t.id] = x.left === 0 ? (league.playoffs?.rounds[0].some((s) => s.top === x.t.id || s.bot === x.t.id) ? 1 : x.p >= cut ? 1 : 0) : 1 / (1 + Math.exp(-(x.p - cut) / sd));
    }
  }
  return out;
}

const GRADES = [[0.9, "A+"], [0.75, "A"], [0.6, "B+"], [0.45, "B"], [0.3, "C+"], [0.15, "C"], [0.05, "C-"], [-1, "D"]];
export const gradeColor = (g) => ({ "A+": "#f59e0b", A: "#22c55e", "B+": "#60a5fa", B: "#60a5fa", "C+": "#94a3b8", C: "#94a3b8", "C-": "#94a3b8", D: "#f97316", F: "#ef4444" })[g] || "#94a3b8";
// Letter grades by league percentile for forwards, defense, goaltending and the whole club.
export function rosterGrades(league, tid) {
  const all = league.teams.map((t) => ({ id: t.id, ...teamRatings(league, t) }));
  const pct = (key, v) => all.filter((x) => x[key] < v).length / Math.max(1, all.length - 1);
  const me = all.find((x) => x.id === tid);
  const g = (key) => GRADES.find(([min]) => pct(key, me[key]) >= min)[1];
  return { F: g("fwd"), D: g("def"), G: g("g"), OVR: g("ovr"), ratings: me };
}

// Best players by position on a club (dashboard and hub "best at" pills).
export function bestAt(league, t) {
  const ps = t.roster.map((id) => league.players[id]).filter(Boolean);
  const best = (f) => ps.filter(f).sort((a, b) => b.ovr - a.ovr)[0];
  return [
    ["C", best((p) => p.pos === "C")],
    ["W", best((p) => p.pos === "LW" || p.pos === "RW")],
    ["D", best((p) => p.pos === "LD" || p.pos === "RD")],
    ["G", best((p) => isGoalie(p.pos))],
  ].filter(([, p]) => p);
}

// ---------- Achievements ----------

// Shares league.achievements ({key, name, year}) with the franchise milestones in franchise.js.
export const ACHIEVEMENTS = [
  { key: "firstWin", icon: "🏒", name: "First win", desc: "Win your first game as GM." },
  { key: "streak5", icon: "🔥", name: "Hot streak", desc: "Win five games in a row." },
  { key: "streak10", icon: "⚡", name: "Unstoppable", desc: "Win ten games in a row." },
  { key: "hundred", icon: "💯", name: "Century club", desc: "Finish a regular season with 100+ points." },
  { key: "fifty", icon: "🎯", name: "50-win season", desc: "Win 50 games in a season." },
  { key: "presidents", icon: "🏅", name: "Presidents' Trophy", desc: "Finish first in the league." },
  { key: "playoffs", icon: "🎟️", name: "Playoff hockey", desc: "Reach the Stanley Cup Playoffs." },
  { key: "sweep", icon: "🧹", name: "Brooms out", desc: "Sweep a playoff series." },
  { key: "cup", icon: "🏆", name: "Stanley Cup champion", desc: "Win the Stanley Cup." },
  { key: "dynasty", icon: "👑", name: "Dynasty", desc: "Win three Stanley Cups." },
  { key: "award", icon: "⭐", name: "Award winner", desc: "One of your players wins an NHL award." },
  { key: "respected", icon: "🤝", name: "Respected", desc: "Reach RESPECTED GM reputation." },
  { key: "legend", icon: "🐐", name: "Legend", desc: "Reach LEGEND GM reputation." },
  { key: "banker", icon: "💰", name: "Banker", desc: "Hold 50 Season Points at once." },
];
export function checkAchievements(league) {
  league.achievements ||= [];
  const t = league.teams[league.userTid];
  const have = new Set(league.achievements.map((a) => a.key));
  const give = (key) => {
    if (have.has(key)) return;
    const def = ACHIEVEMENTS.find((a) => a.key === key);
    have.add(key);
    league.achievements.push({ key, name: def?.name || key, year: league.year });
    league.inbox?.push({ year: league.year, day: league.day, text: `🏅 Achievement unlocked: ${def?.name || key}.` });
  };
  const s = streakOf(t);
  if (t.rec.w >= 1) give("firstWin");
  if (s >= 5) give("streak5");
  if (s >= 10) give("streak10");
  if (league.gm.rep >= 60) give("respected");
  if (league.gm.rep >= 90) give("legend");
  if (league.gm.sp >= 50) give("banker");
  const po = league.playoffs;
  if (po) {
    if (t.rec.pts >= 100) give("hundred");
    if ([...league.teams].sort((a, b) => b.rec.pts - a.rec.pts)[0].id === t.id) give("presidents");
    if (po.rounds.some((r) => r.some((x) => x.winner === t.id && (x.winner === x.top ? x.wBot : x.wTop) === 0))) give("sweep");
  }
}

export function migratePulse(league) {
  ensurePulse(league);
  if (league.phase === "regular") league.gm.spWeek = Math.max(league.gm.spWeek, Math.floor(league.day / 7));
}
