import {capSummary, buyoutSchedule} from './capAccounting.js';
// Team management: payroll, roster limits, signing, releasing, call-ups.
import { capForYear, maxSalaryForYear, capFloorForYear, MAX_ROSTER, MIN_FORWARDS, MIN_DEFENSE, MIN_GOALIES, isForward, isDefense, isGoalie, ELC_SALARY, minSalaryForYear } from "./constants.js";
import { generatePlayer, marketValue, round2 } from "./players.js";
import { randInt, pick } from "./rng.js";
import { syncLines, lineupIds } from "./lines.js";

import {ensureUniforms} from "./uniforms.js";
import { contractCount, reserveCount, waiverStatus, rawPayroll, buriedCap, ltirRelief, elcTerm, elcSalary } from "./hockeyRules.js";

export const IR_GAMES = 7; // players out this long don't count against the 23-man limit

// During the re-sign and free-agency phases teams are budgeting for next season.
export function capYear(league) {
  return league.phase === "resign" || league.phase === "freeagency" ? league.year + 1 : league.year;
}

export function payroll(league, team) {
  return rawPayroll(league,team,capYear(league));
}

export function capSpace(league, team) {
  return round2(league.phase === 'regular' && team.capLedger?.year === league.year ? capSummary(league,team).available : capForYear(capYear(league)) - payroll(league, team) + ltirRelief(league,team));
}

// One game's worth of recovery for everyone on the given teams. A player back from injury
// who'd lost his spot is considered for the lineup again.
export function healInjuries(league, tids) {
  for (const id in league.players) {
    const p = league.players[id];
    if (p.injury > 0 && tids.has(p.tid)) {
      p.injury--;
      const t = p.injury === 0 && league.teams[p.tid];
      if (t && t.lines && !lineupIds(t.lines).includes(p.id)) (t.linesNew ||= []).push(p.id);
    }
  }
}

export function counts(league, team, { healthyOnly = false } = {}) {
  const c = { F: 0, D: 0, G: 0, total: 0, active: 0 };
  for (const id of team.roster) {
    const p = league.players[id];
    if (!p) continue;
    if (healthyOnly && (p.injury > 0 || p.ltir)) continue;
    c.total++;
    if (p.injury < IR_GAMES && !p.ltir) c.active++;
    if (isGoalie(p.pos)) c.G++;
    else if (isDefense(p.pos)) c.D++;
    else c.F++;
  }
  return c;
}

export function rosterIssues(league, team) {
  const issues = [];
  const h = counts(league, team, { healthyOnly: true });
  const all = counts(league, team);
  if (h.F < MIN_FORWARDS) issues.push(`Need ${MIN_FORWARDS} healthy forwards (have ${h.F}).`);
  if (h.D < MIN_DEFENSE) issues.push(`Need ${MIN_DEFENSE} healthy defensemen (have ${h.D}).`);
  if (h.G < MIN_GOALIES) issues.push(`Need ${MIN_GOALIES} healthy goalies (have ${h.G}).`);
  if (all.active > MAX_ROSTER) issues.push(`Roster has ${all.active} active players (max ${MAX_ROSTER}). Send someone to the minors or release.`);
  if (contractCount(league,team)>50) issues.push("Over the 50-contract limit.");
  if (reserveCount(league,team)>90) issues.push("Over the 90-player reserve list limit.");
  if (capSpace(league, team) < 0) issues.push(`Over the salary cap by $${(-capSpace(league, team)).toFixed(2)}M.`);
  return issues;
}

// How far a team's payroll is under the cap floor (0 if it's above it).
export function capFloorGap(league, team) {
  return round2(Math.max(0, capFloorForYear(capYear(league)) - payroll(league, team)));
}

export function hasRoomFor(league, team, extra = 1) {
  return counts(league, team).active + extra <= MAX_ROSTER;
}

function ownedElsewhere(league,team,p){
 const owner=league.teams[p.tid];
 return owner && owner.id!==team.id && [...owner.roster,...owner.prospects,...(owner.rfaRights||[])].includes(p.id);
}
export function addToRoster(league, team, p) {
  if (!p || ownedElsewhere(league,team,p)) return false;
  if (p.tid !== team.id) (p.moveHistory ||= []).push({year:league.year,day:league.day,from:p.tid,to:team.id,kind:'signed/acquired'});
  p.tid = team.id;
  p.assignment="nhl";
  team.rfaRights=(team.rfaRights || []).filter(id=>id!==p.id);
  team.prospects = team.prospects.filter((x) => x !== p.id);
  if (!team.roster.includes(p.id)) team.roster.push(p.id);
  ensureUniforms(league,team);
  queueForLines(league, team, [p.id]);
}

// New arrivals are worked into the lineup if they're better than who's there.
export function queueForLines(league, team, ids) {
  team.linesNew = [...(team.linesNew || []), ...ids];
  syncLines(league, team);
}

export function signPlayer(league, team, p, aav, yrs) {
  if(!p || ownedElsewhere(league,team,p) || !Number.isFinite(aav) || aav<minSalaryForYear(capYear(league)) || aav>maxSalaryForYear(capYear(league)) || !Number.isInteger(yrs) || yrs<1 || yrs>(p.tid===team.id?7:6))return false;
  if (contractCount(league,team)>=50 && (p.yrs<=0 || p.signed===false || p.tid!==team.id) || ![...team.roster,...team.prospects,...(team.rfaRights || [])].includes(p.id) && reserveCount(league,team)>=90) return false;
  league.freeAgents = league.freeAgents.filter((x) => x !== p.id);
  if(p.yrs<=0){delete p.clause;delete p.retentionCount;delete p.elc;}
  delete p.salarySchedule; p.contractSigningAge=p.age;
  p.cap = round2(aav);
  p.yrs = yrs;
  p.signed = true;
  p.mood = undefined;
  addToRoster(league, team, p);
  logTx(league, `${team.abbr} sign ${p.name} (${p.pos}, ${p.ovr}) — ${yrs} yr${yrs > 1 ? "s" : ""}, $${p.cap.toFixed(2)}M AAV`, [team.id]);
  delete p.qualified;
  return true;
}

// Release: age-dependent buyout with the remaining base salary and protected bonuses.
export function releasePlayer(league, team, pid) {
  const p = league.players[pid];
  if (!p || p.tid!==team.id || ![...team.roster,...team.prospects,...(team.rfaRights||[])].includes(pid) || p.ltir || p.waiverPending || p.offerSheetPending) return false;
  team.roster = team.roster.filter((x) => x !== pid);
  team.prospects = team.prospects.filter((x) => x !== pid);
  if (p.yrs > 0 && p.cap > 0 && p.signed !== false) {
    team.deadCap.push(...buyoutSchedule(p));
  }
  team.rfaRights=(team.rfaRights||[]).filter(id=>id!==pid);
  (p.moveHistory ||= []).push({year:league.year,day:league.day,from:team.id,to:-1,kind:'released / bought out'});
  delete p.rolePromise;
  p.tid = -1;
  p.yrs = 0;
  p.cap = 0;
  if (!league.freeAgents.includes(pid)) league.freeAgents.push(pid);
  syncLines(league, team);
  logTx(league, `${team.abbr} release ${p.name}`, [team.id]);
}

// Minors: young/cheap players can be sent down; their cap hit leaves the books.
export function canSendDown(p) {
  return !!p && p.clause?.type !== "NMC" && !p.ltir && !p.waiverPending && (waiverStatus(p).exempt || !!p.waiverClear);
}

export function sendDown(league, team, pid) {
  const p = league.players[pid];
  if (!p || p.tid!==team.id || !team.roster.includes(pid) || !canSendDown(p)) return false;
  team.roster = team.roster.filter((x) => x !== pid);
  if (!team.prospects.includes(pid)) team.prospects.push(pid);
  p.assignment="ahl";
  p.ahlRecallAfter=(league.day || 0)+2;
  syncLines(league, team);
  return true;
}

// Call up from the minors; unsigned draft picks get an entry-level deal.
export function callUp(league, team, pid, {emergency=false}={}) {
  const p = league.players[pid];
  if (!p || p.tid!==team.id || !team.prospects.includes(pid)) return false;
  const cost=p.signed===false?elcSalary(league.year):p.cap-buriedCap(p,capYear(league));
  if(!emergency && (counts(league,team).active>=23 || capSpace(league,team)<cost))return false;
  if (p.ahlRecallAfter>league.day && !(isGoalie(p.pos) && counts(league,team,{healthyOnly:true}).G<2)) return false;
  if (p.signed===false && contractCount(league,team)>=50) return false;
  if (!p.signed) {
    p.cap = p.age <= 24 ? elcSalary(league.year) : minSalaryForYear(league.year);
    p.yrs = elcTerm(p.age);
    p.elc = {signedAge:p.age,year:league.year};
    p.service={firstAge:p.age,years:0,priorGames:0,estimated:false};
    p.signed = true;
    logTx(league, `${team.abbr} sign ${p.name} to an entry-level contract`, [team.id]);
  }
  addToRoster(league, team, p);
  return true;
}

export function logTx(league, text, tids = []) {
  league.transactions.unshift({ year: league.year, day: league.day, phase: league.phase, text, tids });
  if (league.transactions.length > 600) league.transactions.length = 600;
}

// Keep a team dressable: promote, sign or generate depth when injuries pile up.
export function ensureMinimums(league, team, { notify = false } = {}) {
  const need = () => {
    const h = counts(league, team, { healthyOnly: true });
    if (h.G < MIN_GOALIES) return "G";
    if (h.D < MIN_DEFENSE) return "D";
    if (h.F < MIN_FORWARDS) return "F";
    return null;
  };
  let guard = 0;
  let grp;
  while ((grp = need()) && guard++ < 10) {
    const fits = (p) => (grp === "G" ? isGoalie(p.pos) : grp === "D" ? isDefense(p.pos) : isForward(p.pos));
    // Best prospect who fits under the cap (an unsigned pick comes up on an entry-level deal).
    const room = Math.max(capSpace(league, team), ELC_SALARY);
    const ready = team.prospects.map((id) => league.players[id]).filter((p) => p && fits(p) && p.injury <= 0 && p.ovr >= 60 && (!p.ahlRecallAfter || p.ahlRecallAfter<=league.day || isGoalie(p.pos)) && (p.signed!==false || contractCount(league,team)<50)).sort((a, b) => b.ovr - a.ovr);
    const prospect = ready.find((p) => (p.signed === false ? ELC_SALARY : p.cap) <= room) || ready[0];
    if (prospect) {
      if (!callUp(league, team, prospect.id,{emergency:true})) { prospect.ahlRecallAfter = Math.max(prospect.ahlRecallAfter || 0, league.day+1); break; }
      if (notify) league.inbox.push({ year: league.year, day: league.day, text: `Emergency call-up: ${prospect.name} (${prospect.pos}, ${prospect.ovr}) joins the roster.` });
      continue;
    }
    const fa = league.freeAgents.map((id) => league.players[id]).filter((p) => p && fits(p) && p.injury <= 0).sort((a, b) => b.ovr - a.ovr).find((p) => marketValue(p, league.year) <= Math.max(1.0, capSpace(league, team)));
    if (fa && contractCount(league,team)<50) {
      signPlayer(league, team, fa, Math.min(marketValue(fa, league.year), Math.max(minSalaryForYear(league.year), capSpace(league, team))), 1);
      if (notify) league.inbox.push({ year: league.year, day: league.day, text: `Emergency signing: ${fa.name} (${fa.pos}, ${fa.ovr}).` });
      continue;
    }
    if(contractCount(league,team)>=50 || reserveCount(league,team)>=90)break;
    const pos = grp === "G" ? "G" : grp === "D" ? pick(["LD", "RD"]) : pick(["C", "LW", "RW"]);
    const p = generatePlayer(pos, randInt(69, 74), randInt(22, 29), league.year);
    league.players[p.id] = p;
    p.cap = minSalaryForYear(league.year);
    p.yrs = 1;
    p.signed = true;
    addToRoster(league, team, p);
    logTx(league, `${team.abbr} call up ${p.name} (${p.pos}) from the AHL`, [team.id]);
  }
  syncLines(league, team);
}

export function topPlayers(league, team, n = 3) {
  return team.roster.map((id) => league.players[id]).filter(Boolean).sort((a, b) => b.ovr - a.ovr).slice(0, n);
}

export function payrollBreakdown(league, team) {
  return team.roster.map((id) => league.players[id]).filter(Boolean).sort((a, b) => b.cap - a.cap);
}

export { round2 };
