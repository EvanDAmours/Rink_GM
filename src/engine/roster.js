import {capSummary, buyoutSchedule} from './capAccounting.js';
// Team management: payroll, roster limits, signing, releasing, call-ups.
import { capForYear, maxSalaryForYear, capFloorForYear, MAX_ROSTER, MIN_FORWARDS, MIN_DEFENSE, MIN_GOALIES, isForward, isDefense, isGoalie, ELC_SALARY, minSalaryForYear } from "./constants.js";
import { generatePlayer, marketValue, round2 } from "./players.js";
import { randInt, pick } from "./rng.js";
import { syncLines, lineupIds } from "./lines.js";

import {ensureUniforms} from "./uniforms.js";
import { contractCount, reserveCount, waiverStatus, rawPayroll, buriedCap, ltirRelief, elcTerm, elcSalary } from "./hockeyRules.js";

const GROUP_NAME = { G: "goalies", D: "defensemen", F: "forwards" };
export const IR_GAMES = 4; // NHL injured reserve is a week minimum, about four games; players out this long don't count against the 23-man limit

// During the re-sign and free-agency phases teams are budgeting for next season.
export function capYear(league) {
  return league.phase === "resign" || league.phase === "freeagency" ? league.year + 1 : league.year;
}

export function payroll(league, team) {
  return rawPayroll(league,team,capYear(league));
}

export function capSpace(league, team) {
  // Through the playoffs and the draft the season's ledger still rules: a club that spent banked
  // room at the deadline is compliant until next season's cap takes over at re-sign week.
  return round2(['regular','playoffs','draft'].includes(league.phase) && team.capLedger?.year === league.year ? capSummary(league,team).available : capForYear(capYear(league)) - payroll(league, team) + ltirRelief(league,team));
}

// One game's worth of recovery for everyone on the given teams. A player back from injury
// who'd lost his spot is considered for the lineup again.
// A player placed on injured reserve stays off the active count until he is
// healthy, as in the NHL, instead of counting again a few games early.
export const onIR = (p) => !!p && p.injury > 0 && (p.injury >= IR_GAMES || !!p.onIR);
export function healInjuries(league, tids) {
  for (const id in league.players) {
    const p = league.players[id];
    if (p.injury > 0 && tids.has(p.tid)) {
      if (p.injury >= IR_GAMES) p.onIR = true;
      p.injury--;
      if (p.injury === 0) delete p.onIR;
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
    if (!onIR(p) && !p.ltir) c.active++;
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
  // Going down on the strength of a recent waiver clearance is a legal assignment that
  // outlives the 30-day window itself.
  if (p.waiverClear && !waiverStatus(p).exempt) p.waivedDown = {year: league.year, day: league.day};
  p.assignment="ahl";
  p.ahlRecallAfter=(league.day || 0)+2;
  syncLines(league, team);
  return true;
}

// ---------- Call-ups you can act on ----------
// What a recall costs against the cap today: an entry-level deal for an unsigned pick, otherwise
// the part of his cap hit that isn't already buried in the minors.
export function callUpCost(league, p) {
  return p.signed === false ? elcSalary(league.year) : Math.max(0, p.cap - buriedCap(p, capYear(league)));
}

// Why a call-up can't happen right now, in plain words; null when it can.
// code: "notyours" | "room" | "cap" | "recall" | "contracts". `room` and `cap` can be solved by
// sending someone down (see sendDownOptions).
export function callUpBlock(league, team, pid) {
  const p = league.players[pid];
  if (!p || p.tid !== team.id || !team.prospects.includes(pid)) return { code: "notyours", msg: "He isn't in your system's minors." };
  if (p.ahlRecallAfter > league.day && !(isGoalie(p.pos) && counts(league, team, { healthyOnly: true }).G < 2)) {
    const back = p.ahlRecallAfter - league.day;
    return { code: "recall", msg: `${p.name} was just sent down. He can be recalled in ${back} day${back === 1 ? "" : "s"}.` };
  }
  if (p.signed === false && contractCount(league, team) >= 50) return { code: "contracts", msg: `Calling up ${p.name} means signing him, and you're at the 50-contract limit. Release, trade or let a contract go first.` };
  if (league.phase !== "preseason" && counts(league, team).active >= MAX_ROSTER) return { code: "room", msg: `Your NHL roster is full (${MAX_ROSTER} active). Pick someone to send down.` };
  const cost = callUpCost(league, p), room = capSpace(league, team);
  if (room < cost) return { code: "cap", short: round2(cost - room), msg: `He costs $${cost.toFixed(2)}M against the cap and you have $${Math.max(0, room).toFixed(2)}M. Send down a bigger contract to make room.` };
  return null;
}

// Who could go down to make room for `upPid`: everyone on the active roster except LTIR, NMC and
// players already on waivers. Waiver-exempt players go down at once; the rest go on waivers first.
// `works`: sending him down would clear both the roster spot and the cap for the call-up.
export function sendDownOptions(league, team, upPid) {
  const up = league.players[upPid];
  const cost = up ? callUpCost(league, up) : 0;
  const year = capYear(league);
  const room = capSpace(league, team);
  const grp = (q) => (isGoalie(q.pos) ? "G" : isDefense(q.pos) ? "D" : "F");
  return team.roster.map((id) => league.players[id]).filter((q) => q && !q.ltir && !onIR(q) && !q.waiverPending).map((q) => {
    const nmc = q.clause?.type === "NMC";
    const exempt = waiverStatus(q).exempt || !!q.waiverClear;
    const freed = Math.max(0, q.cap - buriedCap(q, year));
    return { p: q, nmc, exempt, waivers: !exempt && !nmc, freed: round2(freed), works: !nmc && room + freed >= cost, samePos: up ? grp(q) === grp(up) : false };
  }).sort((a, b) => (a.nmc - b.nmc) || (b.works - a.works) || (b.exempt - a.exempt) || (b.samePos - a.samePos) || (a.p.ovr - b.p.ovr));
}

// Send `downPid` to the minors and call up `upPid` in one move. Only for a waiver-exempt (or
// recently cleared) player going down; someone who needs waivers goes on waivers first.
export function swapCallUp(league, team, upPid, downPid) {
  const up = league.players[upPid], down = league.players[downPid];
  if (!up || !down) return { ok: false, msg: "Choose two of your players." };
  if (!canSendDown(down)) return { ok: false, msg: down.clause?.type === "NMC" ? `${down.name} has a no-movement clause.` : `${down.name} needs waivers before he can go down.` };
  const block = callUpBlock(league, team, upPid);
  if (block && block.code !== "room" && block.code !== "cap") return { ok: false, msg: block.msg };
  const freed = Math.max(0, down.cap - buriedCap(down, capYear(league)));
  if (capSpace(league, team) + freed < callUpCost(league, up)) return { ok: false, msg: `Sending ${down.name} down doesn't free enough cap for ${up.name}.` };
  if (!sendDown(league, team, downPid)) return { ok: false, msg: `${down.name} can't be sent down right now.` };
  if (!callUp(league, team, upPid)) {
    // Undo the send-down so nothing is half done.
    team.prospects = team.prospects.filter((x) => x !== downPid);
    team.roster.push(downPid);
    delete down.waivedDown; delete down.ahlRecallAfter; down.assignment = "nhl";
    syncLines(league, team);
    return { ok: false, msg: `${up.name} couldn't be called up.` };
  }
  logTx(league, `${team.abbr} recall ${up.name} and assign ${down.name} to the AHL`, [team.id]);
  return { ok: true, msg: `${up.name} is up. ${down.name} goes down to the AHL.` };
}

// Call up from the minors; unsigned draft picks get an entry-level deal.
export function callUp(league, team, pid, {emergency=false}={}) {
  const p = league.players[pid];
  if (!p || p.tid!==team.id || !team.prospects.includes(pid)) return false;
  const cost=p.signed===false?elcSalary(league.year):p.cap-buriedCap(p,capYear(league));
  // Training camp carries more than 23; the roster is cut to 23 when the season starts.
  const camp = league.phase === "preseason";
  if(!emergency && ((!camp && counts(league,team).active>=23) || capSpace(league,team)<cost))return false;
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
  delete p.waivedDown;
  addToRoster(league, team, p);
  return true;
}

export function logTx(league, text, tids = []) {
  league.transactions.unshift({ year: league.year, day: league.day, phase: league.phase, text, tids });
  if (league.transactions.length > 600) league.transactions.length = 600;
}

// Keep a team dressable: promote, sign or generate depth when injuries pile up.
// Your own club is never handed a free agent: the farm comes first, and if nobody there can
// play, the club signs a depth player for one year at the league minimum and tells you, as an
// emergency call-up would. AI clubs may still sign the best affordable free agent.
export function ensureMinimums(league, team, { notify = false } = {}) {
  const mine = team.id === league.userTid;
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
      prospect.emergencyCallUp = league.year;
      if (notify) league.inbox.push({ year: league.year, day: league.day, text: `Emergency call-up: ${prospect.name} (${prospect.pos}, ${prospect.ovr}) joins the roster.` });
      continue;
    }
    const fa = !mine && league.freeAgents.map((id) => league.players[id]).filter((p) => p && fits(p) && p.injury <= 0).sort((a, b) => b.ovr - a.ovr).find((p) => marketValue(p, league.year) <= Math.max(1.0, capSpace(league, team)));
    if (fa && contractCount(league,team)<50) {
      signPlayer(league, team, fa, Math.min(marketValue(fa, league.year), Math.max(minSalaryForYear(league.year), capSpace(league, team))), 1);
      if (notify) league.inbox.push({ year: league.year, day: league.day, text: `Emergency signing: ${fa.name} (${fa.pos}, ${fa.ovr}).` });
      continue;
    }
    if(contractCount(league,team)>=50 || reserveCount(league,team)>=90){
      if (mine) league.inbox.push({ year: league.year, day: league.day, text: `⚠️ Not enough healthy ${GROUP_NAME[grp]} to dress a lineup, and no contract slot for an emergency signing. Call someone up, sign a free agent or make a trade.` });
      break;
    }
    const pos = grp === "G" ? "G" : grp === "D" ? pick(["LD", "RD"]) : pick(["C", "LW", "RW"]);
    const p = generatePlayer(pos, randInt(69, 74), randInt(22, 29), league.year);
    league.players[p.id] = p;
    p.cap = minSalaryForYear(league.year);
    p.yrs = 1;
    p.signed = true;
    if (mine) {
      // A minor-league journeyman on his first NHL deal: no NHL service yet, so he can go
      // back down without waivers when the injured return (see returnCallUps).
      p.service = { firstAge: p.age, years: 0, priorGames: 0, estimated: false };
      p.emergencyCallUp = league.year;
    }
    addToRoster(league, team, p);
    if (mine) {
      logTx(league, `${team.abbr} sign ${p.name} (${p.pos}, ${p.ovr}) — 1 yr, $${p.cap.toFixed(2)}M (emergency depth)`, [team.id]);
      league.inbox.push({ year: league.year, day: league.day, text: `Emergency depth signing: nobody healthy on the farm could fill in, so ${p.name} (${p.pos}, ${p.ovr}) signs for one year at the league minimum ($${p.cap.toFixed(2)}M). He goes to the farm once your injured are back.` });
    } else logTx(league, `${team.abbr} call up ${p.name} (${p.pos}) from the AHL`, [team.id]);
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

// When the injured come back, emergency call-ups who are no longer needed go
// back to the minors on their own (waiver-exempt players only), so a healthy
// club does not sit over the 23-man limit waiting for paperwork.
export function returnCallUps(league, team, { notify = false } = {}) {
  let sent = [];
  let guard = 0;
  while (counts(league, team).active > MAX_ROSTER && guard++ < 6) {
    // Emergency call-ups first, then the lowest-rated waiver-exempt player not in the lineup.
    const inLineup = new Set(team.lines ? [...team.lines.F.flat(), ...team.lines.D.flat(), ...team.lines.G].filter(Boolean) : []);
    const cands = team.roster.map((id) => league.players[id]).filter((p) => p && p.injury <= 0 && canSendDown(p)).sort((a, b) => (b.emergencyCallUp === league.year) - (a.emergencyCallUp === league.year) || inLineup.has(a.id) - inLineup.has(b.id) || a.ovr - b.ovr);
    const p = cands.find((x) => {
      const grp = isGoalie(x.pos) ? "G" : isDefense(x.pos) ? "D" : "F";
      const h = counts(league, team, { healthyOnly: true });
      return (grp === "G" ? h.G > MIN_GOALIES : grp === "D" ? h.D > MIN_DEFENSE : h.F > MIN_FORWARDS);
    });
    if (!p || !sendDown(league, team, p.id)) break;
    delete p.emergencyCallUp;
    sent.push(p.name);
  }
  if (sent.length && notify) league.inbox.push({ year: league.year, day: league.day, text: `Roster move: ${sent.join(", ")} sent to the minors to make room as the injured return.` });
  return sent;
}
