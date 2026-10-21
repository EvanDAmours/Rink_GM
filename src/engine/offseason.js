import {closeCapYear} from './capAccounting.js';
import {recruitmentOrder} from './teamPlanning.js';
// Offseason flow: contract expiry and re-signing, free agency, and the
// rollover into a new season (aging, development, retirements, new schedule).
import { clamp, chance, shuffle, randInt, gauss } from "./rng.js";
import {archiveRetirement} from "./dynasty.js";
import { contractAsk, developPlayer, blankStats, marketValue, generatePlayer, isRFA, round2 } from "./players.js";
import { capForYear, capFloorForYear, minSalaryForYear, maxSalaryForYear, DIFFICULTY, FA_DAYS, SCOUT_POINTS_START, isGoalie, isDefense, isForward, MAX_ROSTER } from "./constants.js";
import { payroll, capSpace, counts, signPlayer, releasePlayer, callUp, sendDown, canSendDown, logTx, ensureMinimums, hasRoomFor } from "./roster.js";
import { teamRatings, autoLines, syncLines } from "./lines.js";
import { buildSeasonSchedule } from "./schedule.js";
import { generateDraftClass, createDraftPicks, releaseProspect } from "./draft.js";
import { marketOffseasonDay } from "./market.js";
import { isFranchiseGoalie } from "./trade.js";
import { blankRecord } from "./sim.js";

import { ensureHockeyRules, contractCount, qualifyingAmount, ownedIds } from "./hockeyRules.js";
import { settleNegotiations, processOfferSheets, aiOfferSheets } from "./negotiations.js";
import { processWaivers } from "./operations.js";
import { holdQualifiedRFA } from "./operations.js";
import {usageGrowth} from "./development.js";
import { archiveFarmSeasons } from "./prospectWatch.js";
import { applyTrainingYear } from "./franchise.js";
import { queueMoment } from "./moments.js";
import { signingMoment, legendMoment } from "./momentsSeason.js";
import { applyAllStarGains } from "./awards.js";
import { rolePay, perfFactor, loyalDiscount, veteranTerm, isFranchisePlayer, depthValue as youthEdge, stampPerformance } from "./contractValue.js";
import { retireChance } from "./retirement.js";
import { aiMarketDay, aiDepthDay, decidingToday } from "./faMarket.js";
import { settleRFARights } from "./contractYear.js";
import { termWindow } from "./contracts.js";

const diff = (league) => DIFFICULTY[league.settings.difficulty] || DIFFICULTY.normal;

function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

export function playerMood(league, p) {
  const t = league.teams[p.tid];
  if (!t) return 0.5;
  const pct = t.rec.gp ? t.rec.pts / (2 * t.rec.gp) : 0.5;
  const mates = t.roster.map((id) => league.players[id]).filter((x) => x && (isGoalie(x.pos) === isGoalie(p.pos)) && (isDefense(x.pos) === isDefense(p.pos)));
  const rank = mates.filter((x) => x.ovr > p.ovr).length;
  const roleCut = isGoalie(p.pos) ? 1 : isDefense(p.pos) ? 4 : 6;
  let m = 0.42 + (pct - 0.5) * 1.3 + (rank < roleCut ? 0.12 : -0.08) + (p.age >= 32 ? 0.1 : 0) + (hash01(p.id + league.year) - 0.5) * 0.35;
  return clamp(m, 0, 1);
}

// What one of your own players asks to stay (re-signing or an extension). Priced like the open
// market (rating, age, role: contractValue.js), then his last season counts (a big year costs more,
// a down year means a cheaper long deal or a prove-it year) and a loyal player takes 10% less.
// Veterans 32 and older want one or two years. start: the first season of the deal (next season by
// default; this season for an in-season holdout).
export function resignAsk(league, p, yrs, { start } = {}) {
  const year = start ?? league.year + 1;
  const base = contractAsk(p, year, { mood: p.mood ?? 0.5, mult: diff(league).faAskMult * rolePay(p) });
  const pref = veteranTerm(p, base.yrs);
  const term = Math.min(7, yrs ?? pref);
  const aav = round2(clamp(base.aav * (1 + 0.025 * Math.abs(term - pref)) * perfFactor(league, p, term, "resign") * loyalDiscount(league, p, "resign"), minSalaryForYear(year), maxSalaryForYear(year)));
  return { aav, yrs: term, prefYrs: pref };
}

export function expiringPlayers(league, team) {
  return [...team.roster, ...team.prospects].map((id) => league.players[id]).filter((p) => p && p.signed !== false && p.yrs === 0);
}

export function startResign(league) {
  ensureHockeyRules(league);
  if (league.expiryAppliedYear===league.year) return;
  league.expiryAppliedYear=league.year;
  // The season just played prices the re-sign and extension asks (contractValue.js).
  stampPerformance(league);
  closeCapYear(league);
  announceRetirements(league);
  for (const id in league.players) {
    const p = league.players[id];
    if (p.tid >= 0 && p.extension?.start === league.year + 1) {
      delete p.salarySchedule; p.contractSigningAge=p.age; p.prevCap=p.cap; p.cap=p.extension.aav; p.yrs=p.extension.yrs; delete p.extension;
      continue;
    }
    if (p.tid >= 0 && p.signed !== false && p.yrs > 0) {
      if (p.elc && p.age<=19 && p.stats.gp<10) {p.elc.slides=(p.elc.slides || 0)+1;continue;}
      if(p.salarySchedule?.length===p.yrs)p.salarySchedule.shift();
      p.yrs--;
      if (p.yrs === 0) {
        p.prevCap = p.cap;
        p.cap = 0;delete p.clause;
      }
    }
  }
  for (const t of league.teams) {
    t.retained=t.retained.map(d=>({...d,yrs:d.yrs-1})).filter(d=>d.yrs>0);
    t.deadCap = t.deadCap.map(d => d.offset>0 ? {...d,offset:d.offset-1} : {...d,yrs:d.yrs-1}).filter(d=>d.yrs>0);
    for (const p of expiringPlayers(league, t)) {
      p.mood = playerMood(league, p);
      p.willing = isRFA(p) || p.mood >= 0.2;
    }
  }
  league.phase = "resign";
}

export function resignPlayer(league, pid, yrs) {
  const p = league.players[pid];
  if (!p || p.tid !== league.userTid || p.yrs !== 0 || p.signed === false || league.phase !== "resign") return {ok:false,msg:"Choose one of your expiring contracts during re-signing."};
  if (!Number.isInteger(yrs) || yrs < 1 || yrs > 7) return {ok:false,msg:"Re-signings allow a 1–7 year term."};
  const team = league.teams[p.tid];
  if(p.offerSheetPending)return {ok:false,msg:"Resolve the pending offer sheet first."};
  if (!p.willing) return { ok: false, msg: `${p.name} wants to test free agency.` };
  const ask = resignAsk(league, p, yrs);
  if (ask.aav > capSpace(league, team)) return { ok: false, msg: `Not enough cap space for ${p.name} ($${ask.aav.toFixed(2)}M).` };
  if(contractCount(league,team)>=50)return {ok:false,msg:"No available contract slot."};
  p.cap = ask.aav;
  p.yrs = ask.yrs;
  delete p.qualified;
  logTx(league, `${team.abbr} re-sign ${p.name} — ${ask.yrs} yr${ask.yrs > 1 ? "s" : ""}, $${ask.aav.toFixed(2)}M AAV`, [team.id]);
  return { ok: true };
}

export function letWalk(league, pid) {
  const p = league.players[pid];
  const team = league.teams[p.tid];
  if (!team || p.offerSheetPending) return false;
  team.roster = team.roster.filter((x) => x !== pid);
  team.prospects = team.prospects.filter((x) => x !== pid);
  team.rfaRights=team.rfaRights.filter(id=>id!==pid);delete p.qualified;delete p.offerSheetPending;
  syncLines(league, team);
  // The club he leaves, so a later signing can say "leaving the …" or "comes back to".
  (p.moveHistory ||= []).push({ year: league.year, day: league.day, from: team.id, to: -1, kind: "free agent" });
  p.tid = -1;
  p.yrs = 0;
  p.cap = 0;
  if (!league.freeAgents.includes(pid)) league.freeAgents.push(pid);
}

export function endResign(league) {
  for (const t of league.teams) {
    const expiring = expiringPlayers(league, t);
    // Franchise players (and a young starting goalie) are the club's first calls, before anyone
    // else uses up the room; then the best players first.
    const franchise = new Set(t.id === league.userTid ? [] : expiring.filter((p) => isFranchisePlayer(p) || isFranchiseGoalie(league, t, p)).map((p) => p.id));
    if (t.id !== league.userTid) expiring.sort((a, b) => franchise.has(b.id) - franchise.has(a.id) || b.ovr - a.ovr);
    for (const p of expiring) {
      if (t.id === league.userTid) {
        if (p.qualified) {holdQualifiedRFA(league,p);continue;}
        letWalk(league, p.id);
        continue;
      }
      let keep = p.ovr >= 86 ? 0.9 : p.ovr >= 82 ? 0.7 : p.ovr >= 78 ? 0.45 : 0.15;
      if (isRFA(p)) keep += 0.2;
      // Clubs under next season's cap floor hang on to more of their own players.
      if (payroll(league, t) < capFloorForYear(league.year + 1)) keep += 0.25;
      if (p.age >= 35) keep *= 0.5;
      const ask = resignAsk(league, p);
      // A franchise player is never let go while the club can fit him: it clears cap room if it
      // has to (burying or buying out depth contracts), and signs him long.
      const deal = franchise.has(p.id) ? franchiseDeal(league, p) : null;
      if (deal && deal.aav > capSpace(league, t)) clearCapFor(league, t, deal.aav, p);
      if (deal && deal.aav <= capSpace(league, t) && contractCount(league,t)<50) {
        p.cap = deal.aav;
        p.yrs = deal.yrs;
      } else if (chance(keep) && ask.aav <= capSpace(league, t) - 1 && contractCount(league,t)<50) {
        p.cap = ask.aav;
        p.yrs = ask.yrs;
      } else {
        if (isRFA(p)) {p.qualified={year:league.year+1,aav:qualifyingAmount(p,league.year+1)};holdQualifiedRFA(league,p);} else letWalk(league, p.id);
      }
    }
  }
  league.phase = "freeagency";
  league.fa = { day: 0 };
  for (const id of league.freeAgents) {
    const p = league.players[id];
    if (p) p.mood = clamp(0.35 + gauss(0, 0.2), 0, 1);
  }
  // Top up a thin market with journeymen.
  while (league.freeAgents.length < 110) {
    const pos = ["C", "LW", "RW", "LD", "RD", "G", "C", "LD"][randInt(0, 7)];
    const p = generatePlayer(pos, randInt(68, 78), randInt(24, 33), league.year);
    p.tid = -1;
    p.signed = true;
    league.players[p.id] = p;
    league.freeAgents.push(p.id);
  }
  // July 1: the market opens, and AI clubs table their first offers (faMarket.js).
  for (const id of league.freeAgents) { const p = league.players[id]; if (p) p.faSince = { year: league.year, day: 0 }; }
  aiMarketDay(league, { perTeam: 2 });
}

// A franchise player's new deal: his ask, on a long term while he's young.
function franchiseDeal(league, p) {
  const win = termWindow(p, "resign");
  const yrs = Math.min(win.hi, 7, Math.max(resignAsk(league, p).yrs, p.age <= 27 ? 6 : 3));
  return resignAsk(league, p, yrs);
}
// Make cap room for a franchise player: send waiver-exempt depth contracts to the farm, then buy
// out the worst-value depth deals. The top six and other franchise players are never touched.
function clearCapFor(league, t, need, keep) {
  const core = new Set(t.roster.map((id) => league.players[id]).filter(Boolean).sort((a, b) => b.ovr - a.ovr).slice(0, 6).map((p) => p.id));
  core.add(keep.id);
  for (let i = 0; i < 5 && capSpace(league, t) < need; i++) {
    const depth = t.roster.map((id) => league.players[id]).filter((p) => p && p.yrs > 0 && p.signed !== false && !core.has(p.id) && !isFranchisePlayer(p) && !p.ltir && !p.waiverPending && !p.offerSheetPending);
    const bury = depth.filter((p) => canSendDown(p) && p.cap > 1).sort((a, b) => b.cap - a.cap)[0];
    if (bury) { sendDown(league, t, bury.id); continue; }
    const cut = depth.filter((p) => p.cap > 1.5 && !p.clause).sort((a, b) => b.cap - marketValue(b, league.year + 1) - (a.cap - marketValue(a, league.year + 1)))[0];
    if (!cut) break;
    releasePlayer(league, t, cut.id);
  }
}

// What a free agent wants right now (asks fall as the summer drags on).
export function faAsk(league, p, yrs) {
  const offseason = league.phase === "freeagency" || league.phase === "resign";
  const year = offseason ? league.year + 1 : league.year;
  // Priced by rating, age and role (the market pays snipers more than grinders: contractValue.js).
  const base = contractAsk(p, year, { mood: p.mood ?? 0.5, mult: diff(league).faAskMult * rolePay(p) });
  // Unsigned players come down a little as free agency drags on, but never to bargain
  // prices: stars hold out near their number.
  const day = offseason ? league.fa?.day || 0 : FA_DAYS + 10;
  const floor = p.ovr >= 88 ? 0.92 : p.ovr >= 82 ? 0.88 : 0.82;
  const decay = Math.max(floor, Math.pow(0.992, day));
  const pref = veteranTerm(p, Math.min(6, base.yrs));
  const term = Math.min(6, yrs ?? pref);
  const aav = round2(clamp(base.aav * decay * (1 + 0.025 * Math.abs(term - pref)), minSalaryForYear(year), maxSalaryForYear(year)));
  return { aav, yrs: term, prefYrs: pref };
}

function teamAppeal(league, team) {
  const all = league.teams.map((t) => teamRatings(league, t).ovr).sort((a, b) => a - b);
  const mine = teamRatings(league, team).ovr;
  return all.indexOf(mine) / Math.max(1, all.length - 1);
}

export function offerContract(league, pid, aav, yrs) {
  const p = league.players[pid];
  const team = league.teams[league.userTid];
  if (!Number.isInteger(yrs) || yrs < 1 || yrs > 6 || !Number.isFinite(aav) || aav < minSalaryForYear(league.phase === "freeagency" ? league.year+1:league.year) || aav > maxSalaryForYear(league.phase === "freeagency" ? league.year+1:league.year)) return {ok:false,msg:"Free-agent deals allow 1–6 years and a legal AAV."};
  if (!p || p.tid !== -1) return { ok: false, msg: "That player isn't a free agent." };
  if (!hasRoomFor(league, team)) return { ok: false, msg: `Roster is full (${MAX_ROSTER}). Send a player down or release someone first.` };
  if (aav > capSpace(league, team)) return { ok: false, msg: "That offer would put you over the cap." };
  const ask = faAsk(league, p, yrs);
  const appeal = teamAppeal(league, team);
  const needed = round2(ask.aav * (1.04 - 0.08 * appeal));
  if (aav + 1e-6 < needed) return { ok: false, msg: `${p.name} wants at least $${needed.toFixed(2)}M per year on a ${yrs}-year deal.` };
  if (!signPlayer(league, team, p, aav, yrs)) return {ok:false,msg:"No available contract or reserve-list slot."};
  // Signing Day for an 80+ free agent from another club (Gridiron 3.0).
  try { queueMoment(league, signingMoment(league, p, team, { aav, yrs })); } catch (e) { console.error("Signing moment failed", e); }
  return { ok: true, msg: `${p.name} signs with the ${team.name}!` };
}

const TARGET = { F: 13, D: 7, G: 2 };

// The day just played, as Gridiron's market reports it: how many signed and the biggest name,
// your wins and losses (what he took against your offer), and who decides at the end of the new
// day. Kept on league.fa.summary for the Free Agency screen and the Next Day toast.
export function faDaySummary(league, before, res = {}) {
  const signed = before.map((id) => league.players[id]).filter((p) => p && p.tid >= 0);
  const top = [...signed].sort((a, b) => b.ovr - a.ovr)[0];
  const day = league.fa?.day ?? 0;
  const abbr = top ? league.teams[top.tid]?.abbr : null;
  const mine = signed.filter((p) => p.tid === league.userTid).map((p) => p.name);
  const lost = (res.lost || []).map((x) => ({ ...x }));
  const next = league.phase === "freeagency" && day < FA_DAYS ? decidingToday(league) : { count: 0, mine: 0 };
  const bits = [`Day ${day} of free agency: ${signed.length ? `${signed.length} signed${top ? `, led by ${top.name} (${abbr})` : ""}.` : "nobody signed."}`];
  if (mine.length) bits.push(`You signed ${mine.join(", ")}.`);
  for (const x of lost.slice(0, 2)) bits.push(`${x.name} chose ${x.abbr} ($${x.aav.toFixed(2)}M × ${x.yrs}) over your $${x.mineAav.toFixed(2)}M × ${x.mineYrs}.`);
  if (next.count) bits.push(`${next.count} player${next.count === 1 ? "" : "s"} decide${next.count === 1 ? "s" : ""} at the end of today${next.mine ? `, ${next.mine} with your offer` : ""}.`);
  return { day, signed: signed.length, top: top ? { pid: top.id, name: top.name, pos: top.pos, ovr: top.ovr, tid: top.tid, abbr, cap: top.cap, yrs: top.yrs } : null, mine, lost, won: res.won || [], fell: res.fell || [], deciding: next.count, decidingMine: next.mine, text: bits.join(" ") };
}

// One free-agency day: the agents due to decide pick the best offer they'd take (faMarket.js),
// offer sheets and waivers run, clubs short of bodies sign depth, and AI clubs table tomorrow's
// offers. Returns true on the last day.
export function simFADay(league) {
  league.fa ||= { day: 0 };
  // A market opened before this version (or a hand-built test league): AI clubs bid first.
  if (league.phase === "freeagency" && league.fa.marketYear !== league.year) aiMarketDay(league, { perTeam: 2 });
  const before = [...league.freeAgents];
  league.fa.day++;
  const last = league.fa.day >= FA_DAYS;
  const res = settleNegotiations(league, { last }) || {};
  processOfferSheets(league);aiOfferSheets(league); processWaivers(league);
  marketOffseasonDay(league);
  aiDepthDay(league);
  if (!last) aiMarketDay(league, { perTeam: 1 });
  league.fa.summary = faDaySummary(league, before, res);
  return last;
}

// Mean OVR of the league's top 600 rostered players; used to keep the rating
// scale anchored to EA's NHL 27 distribution across many seasons.
export function ratingLevel(league) {
  const ovrs = [];
  for (const t of league.teams) for (const id of t.roster) if (league.players[id]) ovrs.push(league.players[id].ovr);
  ovrs.sort((a, b) => b - a);
  const top = ovrs.slice(0, 600);
  return top.reduce((a, b) => a + b, 0) / Math.max(1, top.length);
}

// An AI club still under the cap floor when the season starts signs the best free agents
// left (paying over the ask if it has to) until it gets there, as the CBA requires.
export function meetCapFloor(league, t) {
  const grp = (p) => (isGoalie(p.pos) ? "G" : isDefense(p.pos) ? "D" : "F");
  let guard = 0;
  while (payroll(league, t) < capFloorForYear(league.year) && guard++ < 6) {
    const gap = capFloorForYear(league.year) - payroll(league, t);
    const roster = t.roster.map((id) => league.players[id]).filter(Boolean);
    const fa = league.freeAgents.map((id) => league.players[id]).filter(Boolean).sort(recruitmentOrder(league,t)).find((p) => {
      const worst = roster.filter((x) => grp(x) === grp(p)).sort((a, b) => a.ovr - b.ovr)[0];
      return worst && p.ovr >= worst.ovr && faAsk(league, p).aav <= capSpace(league, t) - 0.5;
    });
    if (!fa) break;
    const worst = roster.filter((x) => grp(x) === grp(fa)).sort((a, b) => a.ovr - b.ovr)[0];
    if (!hasRoomFor(league, t)) {
      if (canSendDown(worst)) sendDown(league, t, worst.id);
      else releasePlayer(league, t, worst.id);
    }
    const ask = faAsk(league, fa);
    const aav = round2(Math.min(capSpace(league, t) - 0.5, Math.max(ask.aav, Math.min(ask.aav * 1.6, ask.aav + gap))));
    signPlayer(league, t, fa, Math.max(ask.aav, aav), ask.yrs);
  }
  // Still short: under the CBA the shortfall is paid out to the club's players, and it
  // counts against the cap for the season.
  const short = round2(capFloorForYear(league.year) - payroll(league, t));
  if (short > 0.005) t.deadCap.push({ name: "Cap floor shortfall (paid to players)", amt: short, yrs: 1 });
}

export function startNewSeason(league) {
  ensureHockeyRules(league);
  const bonus = diff(league).progressionBonus;
  league.ratingAnchor ??= ratingLevel(league);
  const correction = clamp(-0.6 * (ratingLevel(league) - league.ratingAnchor), -1.5, 1.5);
  // The star count is anchored too: when more players sit at 90+ than the league began
  // with, the air at the top gets thinner for everyone already near it.
  const elite = () => Object.values(league.players).filter((p) => p.tid >= 0 && p.ovr >= 90).length;
  league.eliteAnchor ??= elite();
  // More 90+ players than the league started with pulls the top end back harder each summer.
  const eliteCorrection = clamp(-0.12 * (elite() - league.eliteAnchor), -3, 0);
  // Archive stats.
  for (const id in league.players) {
    const p = league.players[id];
    if ((p.stats.gp || p.pstats.gp) && p.tid >= -1) {
      const abbr = league.teams[p.tid]?.abbr || "FA";
      (p.ratingHistory ||= []).push({year:league.year,ovr:p.ovr});
      if (p.ratingHistory.length > 25) p.ratingHistory.shift();
      p.career.push({ y: league.year, t: abbr, o: p.ovr, s: compactStats(p.pos, p.stats), ps: p.pstats.gp ? compactStats(p.pos, p.pstats) : null });
    }
  }
  archiveFarmSeasons(league);
  league.year++;
  league.phase = "preseason"; // budget against the new season, not a second future year
  for (const id of Object.keys(league.players)) {
    const p = league.players[id];
    if (p.tid === -2) continue;
    p.usageGrowth=usageGrowth(league,p);
    p.age++;
    if(p.signed!==false)p.service.years++;
    const before = p.ovr;
    applyTrainingYear(league,p);
    const banked = p.inSeasonGain?.year === league.year - 1 ? p.inSeasonGain.n : 0;
    developPlayer(p, (p.usageGrowth || 0) + correction + (p.ovr >= 88 ? eliteCorrection : 0) + (p.tid === league.userTid ? bonus : 0) - banked);
    p.lastChange = p.ovr - before + banked;
    delete p.inSeasonGain;
    p.injury = 0;
    delete p.ltir; delete p.waiverPending;
    p.stats = blankStats(p.pos);
    p.pstats = blankStats(p.pos);
    p.rookie = calderEligible(p);
  }
  // Last season's All-Star honourees grow in the off-season, as Gridiron's All-Pros do (once only).
  for (const g of applyAllStarGains(league) || []) { const p = league.players[g.pid]; if (p && g.gain) p.lastChange = (p.lastChange || 0) + g.gain; }
  pruneFreeAgents(league);

  // Qualified RFAs sign their qualifying offer (or their rights lapse); yours may hold out.
  settleRFARights(league);

  // Free-agent pool cleanup: unsigned depth players head to Europe or retire.
  const fas = league.freeAgents.map((id) => league.players[id]).filter(Boolean).sort((a, b) => b.ovr - a.ovr);
  fas.forEach((p, i) => {
    if (p.ovr < 68 && p.age >= 28) retire(league, p, true);
    else p.mood = clamp(0.5 + gauss(0, 0.15), 0, 1);
  });

  for (const t of league.teams) {
    t.rec = blankRecord();
    t.scoutPts = SCOUT_POINTS_START;
    t.scoutWeekPaid = -1;
    t.playoffResult = null;
    // Unsigned draft rights lapse at 23.
    for (const id of [...t.prospects]) {
      const p = league.players[id];
      if (!p) continue;
      if (!p.signed && p.rightsUntil && league.year > p.rightsUntil) {
        if (t.id === league.userTid) league.inbox.push({ year: league.year, day: 0, text: `Draft rights to ${p.name} expired — he is now a free agent.` });
        t.prospects = t.prospects.filter((x) => x !== id);
        p.tid = -1;
        p.signed = true;
        league.freeAgents.push(id);
      } else if (t.id !== league.userTid && ((p.age >= 24 && p.ovr < 74) || (p.age >= 22 && p.pot < 74))) {
        releaseProspect(league, id);
      }
    }
    if (t.id !== league.userTid) {
      aiManageRoster(league, t);
      meetCapFloor(league, t);
    }
    // AI coaches start fresh each fall; the user's combinations carry over.
    t.nhlLines = null;
    if (t.id === league.userTid) syncLines(league, t);
    else autoLines(league, t);
  }
  league.schedule = buildSeasonSchedule(league);
  league.day = 0;
  league.phase = "preseason";
  league.playoffs = null;
  league.awards = null;
  league.draft = null;
  league.fa = null;
  generateDraftClass(league, league.year + 1);
  for(let y=league.year+1;y<=league.year+5;y++)createDraftPicks(league,y);
  league.inbox.push({ year: league.year, day: 0, text: `Welcome to the ${league.year}-${String(league.year + 1).slice(2)} season. Set your lines and start the season when ready. The ${league.year + 1} draft class is out: Central Scouting's midterm rankings are on the Big Board, and your scouts bank a point every week of the season. The preseason is your last chance to change scouts until after the draft.` });
}

function compactStats(pos, st) {
  return {...st}; // preserve every simulated season statistic for permanent cards
}

// Unsigned draft picks whose rights ran out and journeymen nobody signed all year leave
// pro hockey quietly, so the free-agent pool and the save don't grow without limit.
function pruneFreeAgents(league) {
  let gone = 0;
  for (const id of [...league.freeAgents]) {
    const p = league.players[id];
    if (!p || p.tid !== -1) continue;
    const playedLastYear = p.career.at(-1)?.y === league.year - 1 && (p.career.at(-1)?.s?.gp || 0) > 0;
    let leave = false;
    if (p.signed === false) leave = p.age >= 22 || (p.age >= 20 && p.pot < 74) || (p.age >= 19 && p.pot < 68);
    else if (!playedLastYear) leave = (p.age >= 31 && p.ovr < 76) || (p.age >= 27 && p.ovr < 70) || p.ovr < 65 ? chance(0.75) : false;
    if (leave) { retire(league, p, true); gone++; }
  }
  if (gone) logTx(league, `${gone} unsigned players leave the league for Europe or retirement`);
}

// The Calder Trophy rule: under 26 when the season starts, never more than 25 NHL games in one
// season and not six or more in each of two seasons. Real players who were already established
// when the league began carry calderIneligible (their earlier NHL seasons aren't in the game).
export function calderEligible(p) {
  if (!p || p.calderIneligible || p.age > 25) return false;
  const seasons = (p.career || []).map((c) => c.s?.gp || 0);
  return !seasons.some((gp) => gp > 25) && seasons.filter((gp) => gp >= 6).length < 2;
}

// Players in a club's minors can retire from this age (the age he'd be next season).
export const MINORS_RETIRE_AGE = 30;
// Retirements are announced when the season ends, before re-sign week and free agency, so
// nobody re-signs or bids on a player who was about to hang them up. The decision uses the
// age he will be next season; his final season is archived to his card first.
export function announceRetirements(league) {
  if (league.retirementsYear === league.year) return;
  league.retirementsYear = league.year;
  const retiring = [];
  for (const id of Object.keys(league.players)) {
    const p = league.players[id];
    if (p.tid === -2 || p.signed === false) continue;
    // Veterans in a club's minors age out too (from about 30), on the same age-based odds;
    // younger players in the system are still developing and never retire here.
    const inMinors = p.tid >= 0 && !!league.teams[p.tid]?.prospects.includes(p.id);
    if (inMinors && p.age + 1 < MINORS_RETIRE_AGE) continue;
    // Position-specific retirement ages (retirement.js): forwards around 35, defencemen 36,
    // goalies 37, enforcers earlier; stars later, fringe veterans sooner.
    if (chance(retireChance({ ...p, age: p.age + 1 }))) retiring.push(p);
  }
  for (const p of retiring) {
    if ((p.stats.gp || p.pstats.gp) && p.tid >= -1) {
      const abbr = league.teams[p.tid]?.abbr || "FA";
      (p.ratingHistory ||= []).push({ year: league.year, ovr: p.ovr });
      p.career.push({ y: league.year, t: abbr, o: p.ovr, s: compactStats(p.pos, p.stats), ps: p.pstats.gp ? compactStats(p.pos, p.pstats) : null });
    }
    // One of your veterans: the farewell card (Gridiron 3.0), before he leaves the league.
    try { queueMoment(league, legendMoment(league, p)); } catch (e) { console.error("Legend moment failed", e); }
    retire(league, p);
  }
  if (retiring.length) league.news?.unshift?.({ year: league.year, day: league.day, type: "retire", text: `${retiring.length} players announce their retirement as the offseason opens${retiring.filter((p) => p.ovr >= 85).length ? `, including ${retiring.filter((p) => p.ovr >= 85).map((p) => p.name).join(", ")}` : ""}.` });
}

function retire(league, p, quiet = false) {
  const t = league.teams[p.tid];
  if (t) {
    t.roster = t.roster.filter((x) => x !== p.id);
    t.prospects = t.prospects.filter((x) => x !== p.id);
    t.rfaRights=(t.rfaRights || []).filter(id=>id!==p.id);
    if (t.id === league.userTid && !quiet) league.inbox.push({ year: league.year, day: 0, text: `${p.name} has announced his retirement at age ${p.age}.` });
  }
  league.freeAgents = league.freeAgents.filter((x) => x !== p.id);
  const tot = p.career.reduce((a, c) => {
    if (!c.s) return a;
    a.gp += c.s.gp || 0;
    a.g += c.s.g || 0;
    a.a += c.s.a || 0;
    a.w += c.s.w || 0;
    return a;
  }, { gp: 0, g: 0, a: 0, w: 0 });
  if(tot.gp || p.ovr>=80)archiveRetirement(league,p,tot);
  if (!quiet && (tot.gp >= 300 || p.ovr >= 85)) {
    league.retired.unshift({ name: p.name, pos: p.pos, age: p.age, year: league.year, ...tot, peak: p.peak || p.ovr });
    if (league.retired.length > 250) league.retired.length = 250;
    logTx(league, `${p.name} retires (${tot.gp} GP${isGoalie(p.pos) ? `, ${tot.w} W` : `, ${tot.g + tot.a} PTS`})`, t ? [t.id] : []);
  }
  delete league.players[p.id];
}

// AI: promote ready prospects, fill holes, stay under 23 and under the cap.
// In-season calls skip cap shedding (emergency call-ups ride like LTIR).
// Off-season decisions break near-ties toward young players with upside over end-of-career
// veterans (depthValue, 2.79); in-season injury moves stay on rating alone.
export function aiManageRoster(league, t, { inSeason = false } = {}) {
  const grp = (p) => (isGoalie(p.pos) ? "G" : isDefense(p.pos) ? "D" : "F");
  const depthValue = inSeason ? (p) => p.ovr : youthEdge;
  const rosterOf = () => t.roster.map((id) => league.players[id]).filter(Boolean);
  const ready = t.prospects.map((id) => league.players[id]).filter((p) => p && p.ovr >= 74 && p.age >= 19).sort((a, b) => depthValue(b) - depthValue(a));
  for (const p of ready) {
    const same = rosterOf().filter((x) => grp(x) === grp(p)).sort((a, b) => depthValue(a) - depthValue(b));
    const worst = same[0];
    if (hasRoomFor(league, t) || (worst && depthValue(p) > depthValue(worst) + 1)) {
      if (!hasRoomFor(league, t) && worst) {
        if (canSendDown(worst)) sendDown(league, t, worst.id);
        else releasePlayer(league, t, worst.id);
      }
      callUp(league, t, p.id);
    }
  }
  // Fill positional holes from free agency at a sensible price.
  for (const need of ["G", "D", "F"]) {
    let guard = 0;
    while (rosterOf().filter((p) => grp(p) === need).length < TARGET[need] && guard++ < 4 && hasRoomFor(league, t)) {
      const fa = league.freeAgents.map((id) => league.players[id]).filter((p) => p && grp(p) === need && !p.negotiationPending).sort((a, b) => depthValue(b) - depthValue(a)).find((p) => marketValue(p, league.year) <= capSpace(league, t) - 0.3);
      if (!fa) break;
      signPlayer(league, t, fa, Math.max(minSalaryForYear(league.year), round2(marketValue(fa, league.year) * 0.9)), veteranTerm(fa, randInt(1, 3)));
    }
  }
  // A full contract list must not prevent an AI club from dressing two
  // goalies. Free a surplus depth contract before filling positional holes.
  // Protect the core, movement clauses and positions already at their minimum.
  for (let attempts = 0; !inSeason && attempts < 4 && contractCount(league, t) >= 50; attempts++) {
    const c = counts(league, t, {healthyOnly: true});
    if (c.G >= 2 && c.D >= 6 && c.F >= 12) break;
    const core = new Set(rosterOf().sort((a,b) => b.ovr-a.ovr).slice(0,6).map(p => p.id));
    const surplus = rosterOf().filter(p => !core.has(p.id) && !p.clause && !p.ltir && !p.waiverPending && !p.offerSheetPending && !isFranchiseGoalie(league, t, p)
      && (grp(p) === 'G' ? c.G > 2 : grp(p) === 'D' ? c.D > 6 : c.F > 12)).sort((a,b) => depthValue(a)-depthValue(b))[0];
    if (!surplus) break;
    releasePlayer(league, t, surplus.id);
  }
  ensureMinimums(league, t);
  // Too many bodies: send down or release the lowest-rated extras.
  let guard = 0;
  while (counts(league, t).active > MAX_ROSTER && guard++ < 10) {
    const c = counts(league, t);
    const extras = rosterOf().filter((p) => (grp(p) === "G" ? c.G > 2 : grp(p) === "D" ? c.D > 7 : c.F > 13)).sort((a, b) => depthValue(a) - depthValue(b));
    const cut = extras[0] || rosterOf().sort((a, b) => depthValue(a) - depthValue(b))[0];
    if (canSendDown(cut)) sendDown(league, t, cut.id);
    else releasePlayer(league, t, cut.id);
  }
  if (inSeason) return;
  // Over the cap: bury cheap extras first, then buy out the most overpaid
  // depth contract. The core (top six by OVR) is never cut.
  guard = 0;
  while (capSpace(league, t) < 0 && guard++ < 8) {
    const core = new Set(rosterOf().sort((a, b) => b.ovr - a.ovr).slice(0, 6).map((p) => p.id));
    const c = counts(league, t);
    const extra = rosterOf()
      .filter((p) => !core.has(p.id) && canSendDown(p) && (grp(p) === "G" ? c.G > 2 : grp(p) === "D" ? c.D > 6 : c.F > 12))
      .sort((a, b) => b.cap - a.cap)[0];
    if (extra && extra.cap > 0.9) {
      sendDown(league, t, extra.id);
      continue;
    }
    const overpaid = rosterOf()
      .filter((p) => !core.has(p.id) && p.cap > 1 && !isFranchiseGoalie(league, t, p) && !isFranchisePlayer(p))
      .sort((a, b) => b.cap - marketValue(b, league.year) - (a.cap - marketValue(a, league.year)))[0];
    if (!overpaid) break;
    releasePlayer(league, t, overpaid.id);
    ensureMinimums(league, t);
  }
}

export { payroll, capForYear };
