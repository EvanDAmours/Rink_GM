import {packLeague,unpackLeague} from './savePacking.js';
import {isHockeyLeague,sanitizeLegacyNews} from './gameIdentity.js';
// League orchestration: creation from the NHL 27 roster file (or a random
// league), daily simulation, phase transitions and save/load.
import {accrueCap, startCapLedger} from './capAccounting.js';
import {commitmentWeek} from './playerCommitments.js';
import {recordReport} from './matchReports.js';
import {upgradeVerifiedData} from './verifiedData.js';
import {setInjuriesEnabled} from './injuries.js';
import rosterFile from "../data/nhl27-rosters.json" with { type: "json" };
import { CALDER_SEASON, CALDER_ROOKIES_2026, CALDER_GRADUATES_2026 } from "../data/calderRookies2026.js";
import { identity } from "./verifiedData.js";
import LZString from "lz-string";
import { TEAMS } from "./teams.js";
import {snapshotRng,restoreRng} from './rng.js';
import { seed as seedRng, randInt, pick, chance, gauss, clamp } from "./rng.js";
import { createPlayer, generatePlayer, marketValue } from "./players.js";
import { FIRST_SEASON, SCOUT_POINTS_START, SAVE_KEY, SAVE_VERSION, MAX_ROSTER, DRAFT_ROUNDS, isGoalie, isDefense, minSalaryForYear } from "./constants.js";
import { autoLines, linesFromNames, coachLines, headCoachLines } from "./lines.js";
import { freezeExpectations, deadlinePaper, seasonReviewPaper } from "./papers.js";
import { allStarDue, allStarWeekend } from "./allstar.js";
import { checkMilestones } from "./records.js";
import { inSeasonGrowth, prospectReportNote } from "./prospectWatch.js";
import { aiCoachingChanges } from "./franchise.js";
import { buildSeasonSchedule, lastDay } from "./schedule.js";
import { createGame, simToEnd, applyResult, blankRecord } from "./sim.js";
import { generateDraftClass, createDraftPicks, startDraft, finishDraft, draftDone, expandLegacyDraftClass } from "./draft.js";
import { startPlayoffs, simPlayoffDay } from "./playoffs.js";
import { computeAwards, connSmythe, conferenceTrophies } from "./awards.js";
import { ensureMinimums, counts, sendDown, canSendDown, logTx, IR_GAMES, healInjuries, returnCallUps, onIR } from "./roster.js";
import { startResign, endResign, startNewSeason, aiManageRoster, ratingLevel } from "./offseason.js";
import { marketWeek, deadlinePending, skipDeadline, refreshBlock, fitRoster, seedUserRequests, DEADLINE_END } from "./market.js";
import { applyCampGroup } from "./camp.js";
import { ensurePulse, pulseAfterDay, pulseNewSeason, pulseSeasonEnd, migratePulse } from "./clubPulse.js";
import { tradingClosed } from "./trade.js";
import { defaultScouts, refreshScoutPool, scoutWeek, runCombine, migrateScouting } from "./scouting.js";

import {ensureFutureClasses} from "./draftExpansion.js";
import {developmentWeek,resetDevelopment} from "./development.js";
import { ensureHockeyRules } from "./hockeyRules.js";
import { processWaivers } from "./operations.js";
import {ensureDynasty,arenaWeek,careerReview,stampHonours,inductHall} from "./dynasty.js";
import {ensureUniforms} from "./uniforms.js";
import { ensureFranchise, franchiseWeek, reviewOwner, resetFranchiseYear } from "./franchise.js";
import { ensureRecords, updateRecords, archiveSeason } from "./records.js";
import { archiveDraft } from "./draftTools.js";
import { ensureAreaScouting } from "./regions.js";

export function createLeague({ userAbbr = "TOR", mode = "real", difficulty = "normal", injuries = true, seed } = {}) {
  if (seed != null) seedRng(seed);
  const year = FIRST_SEASON;
  const league = {
    version: SAVE_VERSION,
    game: "rink-gm",
    newsVisibilityVersion: 1,
    mode,
    year,
    startYear: year,
    phase: "preseason",
    day: 0,
    settings: { difficulty, injuries, coachLines: true },
    teams: TEAMS.map((t, i) => ({
      id: i,
      ...t,
      roster: [],
      prospects: [],
      lines: null,
      rec: blankRecord(),
      deadCap: [],
      scoutPts: SCOUT_POINTS_START,
      autoGoalie: true,
      playoffResult: null,
    })),
    players: {},
    freeAgents: [],
    draftPicks: [],
    draftClass: [],
    schedule: [],
    playoffs: null,
    draft: null,
    awards: null,
    history: [],
    retired: [],
    transactions: [],
    inbox: [],
    userTid: 0,
    calderVersion: 1,
  };
  const user = league.teams.find((t) => t.abbr === userAbbr) || league.teams[0];
  league.userTid = user.id;
  user.scouts = defaultScouts(league);
  refreshScoutPool(league);

  if (mode === "real") loadRealRosters(league);
  else generateRandomRosters(league);
  upgradeVerifiedData(league);

  for (const t of league.teams) {
    const real = mode === "real" ? rosterFile.lines?.[t.abbr] : null;
    addMinorLeaguers(league, t);
    ensureMinimums(league, t);
    trimToLimit(league, t, real ? namedPlayers(league, t, real) : new Set());
    if (real) linesFromNames(league, t, real);
    else autoLines(league, t);
  }
  seedFreeAgents(league);
  league.ratingAnchor = ratingLevel(league);
  for (let y = year + 1; y <= year + 5; y++) createDraftPicks(league, y);
  generateDraftClass(league, year + 1);
  league.schedule = buildSeasonSchedule(league);
  league.deadlineDay = Math.floor(lastDay(league.schedule) * 0.78);
  ensureHockeyRules(league);
  ensureFranchise(league);
  ensureDynasty(league);ensureUniforms(league);
  ensureRecords(league);
  ensureAreaScouting(league);
  refreshBlock(league);
  seedUserRequests(league);
  ensurePulse(league);
  return league;
}

function loadRealRosters(league) {
  for (const t of league.teams) {
    const entries = rosterFile.teams[t.abbr] || [];
    for (const e of entries) {
      const p = createPlayer({ ...e, age: league.year - e.born, tid: t.id }, league.year);
      p.signed = true;
      markRealRookie(league, p);
      league.players[p.id] = p;
      t.roster.push(p.id);
    }
    // Players who have asked to be traded.
    for (const name of rosterFile.lines?.[t.abbr]?.requests || []) {
      const p = t.roster.map((id) => league.players[id]).find((x) => x.name === name);
      if (p) p.wantsTrade = true;
    }
    // Players reported injured (or otherwise unavailable) at the start of the season.
    for (const o of rosterFile.lines?.[t.abbr]?.out || []) {
      const p = t.roster.map((id) => league.players[id]).find((x) => x.name === o.name);
      if (!p || league.settings.injuries === false) continue;
      p.injury = o.games;
      p.injuryNote = o.note;
    }
  }
}

// First-season rookies are the real 2026-27 Calder-eligible players (src/data/calderRookies2026.js).
// Anyone else on the bundled rosters is an established player, unless he is a teenager the
// list doesn't know (a roster refreshed after it was checked). Established players stay
// ineligible in later seasons too, since their earlier NHL games aren't in the game.
const CALDER_ROOKIES = new Set(CALDER_ROOKIES_2026.map(identity));
const CALDER_GRADUATES = new Set(CALDER_GRADUATES_2026.map(identity));
export function isRealRookie(name, age) {
  const key = identity(name);
  if (CALDER_ROOKIES.has(key)) return true;
  return !CALDER_GRADUATES.has(key) && age <= 19;
}
function markRealRookie(league, p) {
  if (league.year !== CALDER_SEASON) { p.rookie = p.age <= 19; return; }
  p.rookie = isRealRookie(p.name, p.age);
  if (p.rookie) delete p.calderIneligible;
  else if (p.age <= 25) p.calderIneligible = true;
}
// Saves made before the Calder list flagged everyone 20 or younger as a rookie. Repair real
// players in a league that is still in its first season; later seasons are left alone.
export function repairFirstSeasonRookies(l) {
  if ((l.calderVersion || 0) >= 1) return 0;
  l.calderVersion = 1;
  if (l.mode !== "real" || l.year !== (l.startYear ?? FIRST_SEASON) || l.year !== CALDER_SEASON) return 0;
  let changed = 0;
  for (const p of Object.values(l.players || {})) {
    if (!p || !["ea27", "est"].includes(p.src) || p.tid === -2) continue;
    const was = !!p.rookie;
    markRealRookie(l, p);
    if (was !== !!p.rookie) changed++;
  }
  return changed;
}

// Everyone named in a team's real lines or injury list (protected from roster trimming).
function namedPlayers(league, t, real) {
  const names = new Set([...real.F.flat(), ...real.D.flat(), ...real.G, ...(real.out || []).map((o) => o.name)].filter(Boolean));
  return new Set(t.roster.filter((id) => names.has(league.players[id].name)));
}

function generateRandomRosters(league) {
  const shape = [["C", 4], ["LW", 5], ["RW", 5], ["LD", 4], ["RD", 4], ["G", 2]];
  for (const t of league.teams) {
    const strength = gauss(0, 2.2);
    for (const [pos, n] of shape) {
      for (let i = 0; i < n; i++) {
        const tierTop = pos === "G" ? (i === 0 ? 87 : 79) : 90 - i * (pos.length === 2 && pos[1] === "D" ? 3.2 : 3.4);
        const ovr = Math.round(clamp(tierTop + strength + gauss(0, 2.5), 68, 97));
        const p = generatePlayer(pos, ovr, randInt(20, 34), league.year, { tid: t.id });
        p.signed = true;
        p.cap = marketValue(p, league.year);
        p.yrs = randInt(1, 6);
        league.players[p.id] = p;
        t.roster.push(p.id);
      }
    }
  }
}

function addMinorLeaguers(league, t) {
  const shape = ["C", "LW", "RW", "LD", "RD", "G", pick(["C", "LW", "RW"]), pick(["LD", "RD"])];
  for (const pos of shape) {
    const age = randInt(19, 24);
    const p = generatePlayer(pos, randInt(64, 73), age, league.year, { tid: t.id });
    p.pot = clamp(p.ovr + randInt(2, 12) - Math.max(0, age - 21) * 2, p.ovr, 88);
    p.signed = true;
    p.cap = age <= 23 ? 0.95 : minSalaryForYear(league.year);
    p.yrs = randInt(1, 3);
    league.players[p.id] = p;
    t.prospects.push(p.id);
  }
}

// Send the lowest-rated extras to the minors until the roster fits. Players in the
// real opening-night lineup are kept; so is a third goalie if he's not the weakest.
function trimToLimit(league, t, keep = new Set()) {
  let guard = 0;
  while (counts(league, t).active > MAX_ROSTER && guard++ < 12) {
    const ps = t.roster.map((id) => league.players[id]).filter((p) => !onIR(p)).sort((a, b) => a.ovr - b.ovr);
    const g = ps.filter((p) => isGoalie(p.pos));
    const extras = ps.filter((p) => !keep.has(p.id) && (!isGoalie(p.pos) || g.length > 2));
    const victim = extras[0] || (g.length > 2 ? g[0] : ps.find((p) => !isGoalie(p.pos)));
    if (canSendDown(victim)) sendDown(league, t, victim.id);
    else {
      t.roster = t.roster.filter((x) => x !== victim.id);
      t.prospects.push(victim.id);
    }
  }
}

function seedFreeAgents(league) {
  for (let i = 0; i < 45; i++) {
    const pos = ["C", "LW", "RW", "LD", "RD", "G", "C", "LD", "RW"][i % 9];
    const p = generatePlayer(pos, randInt(70, 79), randInt(25, 34), league.year);
    p.tid = -1;
    p.signed = true;
    p.mood = 0.5;
    league.players[p.id] = p;
    league.freeAgents.push(p.id);
  }
}

// ---------- Regular season ----------

export const gamesOnDay = (league, day) => league.schedule.filter((g) => g.day === day);

export function userGameOnDay(league, day = league.day) {
  return league.schedule.find((g) => g.day === day && !g.played && (g.h === league.userTid || g.a === league.userTid)) || null;
}

export function seasonOver(league) {
  return league.schedule.every((g) => g.played);
}

export function startRegularSeason(league) {
  league.phase = "regular";
  league.day = 0;
  for (const t of league.teams) startCapLedger(league,t);
  league.deadlineDay = Math.floor(lastDay(league.schedule) * 0.78);
  freezeExpectations(league);
  logTx(league, `${league.year}-${String(league.year + 1).slice(2)} regular season begins`);
}

export function playScheduledGame(league, g, state) {
  if (!g) throw new Error('Scheduled fixture is missing.');
  if (g.played) return {hs:g.hs,as:g.as,ot:g.ot,shots:g.shots,stars:g.stars,goals:g.goals,g:g.gl};
  const result = applyResult(league, state, { playoff: false });
  const mine = g.h === league.userTid || g.a === league.userTid;
  Object.assign(g, { played: true, hs: result.hs, as: result.as, ot: result.ot, shots: result.shots, stars: result.stars, gl: result.g });
  if (mine) { g.goals = result.goals; recordReport(league,state,g.id); }
  return result;
}

// Simulate the current day. If `holdUserGame`, the user's game is left for live play.
export function simDay(league, { holdUserGame = false } = {}) {
  if (league.phase !== "regular") return false;
  // The UI stops for Trade Deadline Day; anything else simulating through it runs it instantly.
  if (deadlinePending(league)) skipDeadline(league);
  const todays = gamesOnDay(league, league.day).filter((g) => !g.played);
  const played = new Set();
  for (const t of league.teams) {
    ensureMinimums(league, t, { notify: t.id === league.userTid });
    if (t.id !== league.userTid) fitRoster(league, t);
    else returnCallUps(league, t, { notify: true });
  }
  for (const g of todays) {
    if (holdUserGame && (g.h === league.userTid || g.a === league.userTid)) continue;
    const state = createGame(league, league.teams[g.h], league.teams[g.a], { userTid: league.userTid });
    simToEnd(state);
    playScheduledGame(league, g, state);
    played.add(g.h);
    played.add(g.a);
  }
  if (holdUserGame && userGameOnDay(league)) return true;
  finishDay(league, played);
  return true;
}

export function finishDay(league, played) {
  accrueCap(league);
  commitmentWeek(league);
  const ids = played || new Set(gamesOnDay(league, league.day).flatMap((g) => [g.h, g.a]));
  healInjuries(league, ids);
  processWaivers(league);
  scoutWeek(league);
  franchiseWeek(league);
  arenaWeek(league);
  developmentWeek(league);
  updateRecords(league);
  pulseAfterDay(league);
  // The deadline recap prints the morning after deadline day.
  if (league.deadline?.done && !league.deadline.synthetic && league.deadline.year === league.year && !league.deadline.papered) { league.deadline.papered = true; deadlinePaper(league); }
  if (allStarDue(league)) allStarWeekend(league);
  // AI rosters adjust to injuries periodically.
  if (league.day % 7 === 0) {
    checkMilestones(league);
    aiCoachingChanges(league);
    prospectReportNote(league, inSeasonGrowth(league));
    for (const t of league.teams) {
      if (t.id === league.userTid) {
        if (league.settings?.coachLines && league.day >= 7) {
          const moves = headCoachLines(league, t).filter((m) => m.out && m.in);
          if (moves.length) league.inbox?.push({ year: league.year, day: league.day, text: `👔 ${t.coach?.name || "The head coach"} adjusted the lines: ${moves.map((m) => `${league.players[m.in]?.name} in for ${league.players[m.out]?.name}`).join("; ")}.` });
        }
        continue;
      }
      aiManageRoster(league, t, { inSeason: true });
      if (league.day >= 7) coachLines(league, t);
    }
    if (league.day < league.deadlineDay) marketWeek(league);
  }
  // Players back from injury or called up: keep AI rosters at 23.
  for (const t of league.teams) if (t.id !== league.userTid) fitRoster(league, t);
  const completedDay = league.day;
  league.day++;
  while (league.day <= lastDay(league.schedule) && !gamesOnDay(league, league.day).length) league.day++;
  if (league.day > completedDay+1) accrueCap(league,league.day-1);
}

export function simDays(league, n, { stopAtUserGame = false } = {}) {
  for (let i = 0; i < n && league.phase === "regular" && !seasonOver(league); i++) {
    if (stopAtUserGame && i > 0 && userGameOnDay(league)) break;
    simDay(league);
  }
}

export function simToDeadline(league) {
  while (league.phase === "regular" && !deadlinePending(league) && !seasonOver(league)) simDay(league);
}

export function simRestOfSeason(league) {
  while (league.phase === "regular" && !seasonOver(league)) simDay(league);
}

export function endRegularSeason(league) {
  league.awards = computeAwards(league);
  startPlayoffs(league);
  league.phase = "playoffs";
  pulseSeasonEnd(league);
  applyCampGroup(league);
  const ut = league.teams[league.userTid];
  if (ut) league.inbox.push({ year: league.year, day: league.day, text: ut.playoffResult ? `The ${ut.name} are in the playoffs! First round starts now.` : `The ${ut.name} missed the playoffs this season.` });
}

// ---------- Playoffs → offseason ----------

export function finishPlayoffs(league) {
  const champ = league.playoffs.champion;
  league.awards.connSmythe = connSmythe(league, champ);
  Object.assign(league.awards, conferenceTrophies(league));
  league.awards.stanley = { name: `${league.teams[champ].city} ${league.teams[champ].name}`, tid: champ, team: true, why: "Stanley Cup champions" };
  archiveSeason(league);
  const final = league.playoffs.rounds[3][0];
  league.history.unshift({
    year: league.year,
    champion: champ,
    runnerUp: final.top === champ ? final.bot : final.top,
    presidents: [...league.teams].sort((a, b) => b.rec.pts - a.rec.pts)[0].id,
    awards: league.awards,
    userRec: league.teams[league.userTid] ? { ...league.teams[league.userTid].rec, playoff: league.teams[league.userTid].playoffResult } : null,
  });
  stampHonours(league);
  reviewOwner(league);
  careerReview(league);
  logTx(league, `The ${league.teams[champ].city} ${league.teams[champ].name} win the Stanley Cup!`);
  league.news ||= [];
  league.news.unshift({ year: league.year, day: league.day, type: "cup", text: `${league.teams[champ].city} ${league.teams[champ].name} win the Stanley Cup. ${league.awards.connSmythe ? `${league.awards.connSmythe.name} takes the Conn Smythe as playoff MVP.` : ""}` });
  seasonReviewPaper(league);
  if (league.awards.hart) league.news.unshift({ year: league.year, day: league.day, type: "award", pid: league.awards.hart.pid, text: `${league.awards.hart.name} is the Hart Trophy winner. ${league.awards.vezina ? `${league.awards.vezina.name} takes the Vezina` : ""}${league.awards.norris ? `, ${league.awards.norris.name} the Norris` : ""}${league.awards.calder ? ` and ${league.awards.calder.name} the Calder.` : "."}` });
  startDraft(league);
  league.phase = "draft";
  runCombine(league);
  // Trading reopens after the Final: the block fills up again for the off-season.
  league.offers = [];
  refreshBlock(league);
}

export function completeDraft(league) {
  if (!draftDone(league)) return false;
  const first = Object.values(league.players).filter((p) => p.draft?.year === league.draft?.year && p.tid === league.userTid).sort((a, b) => a.draft.pick - b.draft.pick)[0];
  if (first) (league.news ||= []).unshift({ year: league.year, day: league.day, type: "draft", pid: first.id, text: `${league.teams[league.userTid].name} take ${first.name} (${first.pos}) at #${first.draft.pick} overall. The class heads to the minors.` });
  archiveDraft(league);
  finishDraft(league);
  startResign(league);
  // A new crop of scouts looking for work over the summer.
  refreshScoutPool(league);
  return true;
}

export function goToFreeAgency(league) {
  endResign(league);
  refreshBlock(league);
}

export function beginNextSeason(league) {
  if(league.career?.fired)return false;
  startNewSeason(league);
  inductHall(league);ensureUniforms(league);
  resetFranchiseYear(league);
  resetDevelopment(league);
  ensureAreaScouting(league);
  league.deadlineDay = Math.floor(lastDay(league.schedule) * 0.78);
  league.deadline = null;
  league.offers = [];
  refreshBlock(league);
  pulseNewSeason(league);
}

// ---------- Save / load ----------

// Saves are LZ-compressed (roughly 8x smaller) so long dynasties fit in localStorage.
export function serializeLeague(league) {
  return LZString.compressToUTF16(JSON.stringify(packLeague({...league,game:"rink-gm",savedRng:snapshotRng()})));
}

// Portable export: a small JSON wrapper around base64-compressed league data.
export function exportLeagueText(league) {
  return JSON.stringify({ rinkgm: SAVE_VERSION, league: LZString.compressToBase64(JSON.stringify(packLeague({...league,game:"rink-gm",savedRng:snapshotRng()}))) });
}

export function deserializeLeague(raw) {
  if (!raw) return null;
  let json;
  if (raw.startsWith("{")) {
    const obj = JSON.parse(raw);
    if (obj && typeof obj.league === "string") json = LZString.decompressFromBase64(obj.league);
    else return restoreLeague(obj);
  } else {
    json = LZString.decompressFromUTF16(raw);
  }
  return restoreLeague(json ? unpackLeague(JSON.parse(json)) : null);
}

// Accept a league object from any source (save slot, league file, cloud backup).
export function restoreLeague(l) {
  if (!l || l.version !== SAVE_VERSION || !isHockeyLeague(l)) return null;
  const restored=migrateLeague(l); restored.game="rink-gm";
  if (restored.savedRng) restoreRng(restored.savedRng);
  return restored;
}

// Bring older saves up to date with features added since they were made.
function migrateLeague(l) {
  l.settings ||= {};
  l.settings.injuries ??= true;
  l.settings.coachLines ??= true;
  if (!l.settings.injuries) setInjuriesEnabled(l, false);
  ensureHockeyRules(l);
  // Preserve played fixtures and running drafts. Only future pick inventories expand.
  l.scheduleStart ||= `${l.year}-10-07`;
  l.scheduleInfo ||= { kind: "legacy", label: "Existing franchise schedule" };
  l.draftPicks ||= [];
  for (let year=l.year+1;year<=l.year+5;year++) {
    if (l.draft?.year===year) continue;
    createDraftPicks(l,year);
  }
  // Trade block and deadline day: a save already past this season's deadline doesn't replay it.
  l.offers = l.offers || [];
  l.wire = l.wire || [];
  const passed = (l.phase === "regular" && l.day > l.deadlineDay) || l.phase === "playoffs";
  if (passed && !l.deadline) l.deadline = { year: l.year, day: l.deadlineDay, minute: DEADLINE_END, done: true, feed: [], trades: 0, synthetic: true };
  if (!Array.isArray(l.block)) {
    l.block = [];
    if (!tradingClosed(l)) refreshBlock(l);
  }
  // Scouting staff, development traits, prospect bios and Central Scouting ranks.
  migrateScouting(l);
  ensureHockeyRules(l);
  ensureFranchise(l);
  ensureDynasty(l);upgradeVerifiedData(l);ensureUniforms(l);
  ensureRecords(l);
  ensureAreaScouting(l);
  ensureFutureClasses(l);
  updateRecords(l);
  expandLegacyDraftClass(l);
  sanitizeLegacyNews(l);
  migratePulse(l);
  repairFirstSeasonRookies(l);
  return l;
}

export function saveSummary(league) {
  const t = league.teams[league.userTid];
  return { team: `${t.city} ${t.name}`, year: league.year, phase: league.phase };
}

export function saveLeague(league, key = SAVE_KEY) {
  league.savedAt = Date.now();
  try {
    localStorage.setItem(key, serializeLeague(league));
    return true;
  } catch (e) {
    console.warn("Save failed", e);
    return false;
  }
}

export function loadLeague(key = SAVE_KEY) {
  try {
    return deserializeLeague(localStorage.getItem(key));
  } catch {
    return null;
  }
}

export function hasSave(key = SAVE_KEY) {
  try {
    return !!localStorage.getItem(key);
  } catch {
    return false;
  }
}

export function deleteSave(key = SAVE_KEY) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export { simPlayoffDay, rosterFile };
