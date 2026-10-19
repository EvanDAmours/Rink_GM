// One negotiation model for extensions, re-signings and free-agent offers.
// Players have an agent with a priority (winning, role, security, loyalty), a term window
// that fits their age, and a floor they will not sign under. Offers above the floor on an
// acceptable term are accepted; anything else draws a counter, and four low-balls in a
// season end the talks. A signing bonus is cash from the club's arena account paid up front:
// players like it (interest up, floor a little lower), the club has to have the cash.
import { faAsk, resignAsk } from "./offseason.js";
import { agentPreferences, negotiate } from "./negotiations.js";
import { capSpace, signPlayer, counts, logTx, hasRoomFor } from "./roster.js";
import { contractCount } from "./hockeyRules.js";
import { capForYear, minSalaryForYear, maxSalaryForYear, MAX_ROSTER } from "./constants.js";
import { teamRatings } from "./lines.js";
import { futurePayroll, extendPlayer } from "./extensions.js";
import { projectedRole } from "./teamPlanning.js";
import { roleUtility, promiseRole } from "./playerCommitments.js";
import { clamp } from "./rng.js";

export const BONUS_OPTIONS = [0, 25, 40, 55];
const round2 = (n) => Math.round(n * 100) / 100;
const OFFSEASON = new Set(["resign", "freeagency", "draft"]);

export function dealKind(league, p) {
  if (p.tid === -1) return "fa";
  if (league.phase === "resign" && p.yrs === 0) return "resign";
  return "extension";
}
// First season the new deal covers.
export function dealStart(league, kind) {
  return kind === "fa" && !OFFSEASON.has(league.phase) && league.phase !== "preseason" ? league.year : league.year + 1;
}
export function askFor(league, p, yrs, kind) {
  return kind === "fa" ? faAsk(league, p, yrs) : resignAsk(league, p, yrs);
}
// The term a player will even discuss: veterans stop at two or three years, young stars
// want a real commitment.
export function termWindow(p, kind) {
  const max = kind === "fa" ? 6 : 7;
  const age = p.age + (kind === "fa" ? 0 : 1);
  let lo = 1, hi = max;
  if (age >= 35) hi = 1; else if (age >= 33) hi = 2; else if (age >= 31) hi = 3; else if (age >= 29) hi = 5;
  if (age <= 25 && p.ovr >= 85) lo = 3; else if (age <= 27 && p.ovr >= 80) lo = 2;
  return { lo, hi: Math.max(lo, hi), max };
}
export function priorityModifier(league, t, p, yrs, prefs) {
  const role = projectedRole(league, t, p);
  const continuity = Math.min(6, (p.career || []).filter((c) => c.t === t.abbr).length);
  const trust = p.relationship?.trust ?? 50;
  if (prefs.priority === "winning") return teamRatings(league, t).ovr >= 85 ? 0.97 : 1.05;
  if (prefs.priority === "role") return 1 - roleUtility(league, t, p, role) * 0.05;
  if (prefs.priority === "security") return 1 + Math.max(-0.04, Math.min(0.06, (prefs.preferredTerm - yrs) * 0.015));
  if (prefs.priority === "loyalty" && p.tid === t.id) return 1 - Math.max(0, Math.min(0.06, continuity * 0.005 + (trust - 50) * 0.0004));
  return 1;
}
export function evaluateOffer(league, p, { aav, yrs, bonusPct = 0, kind }) {
  kind ||= dealKind(league, p);
  const t = league.teams[league.userTid];
  const prefs = agentPreferences(p);
  const win = termWindow(p, kind);
  const ask = askFor(league, p, yrs, kind);
  const start = dealStart(league, kind);
  const modifier = priorityModifier(league, t, p, yrs, prefs);
  const bonusDiscount = 1 - (bonusPct / 100) * 0.08;
  const floor = round2(Math.max(ask.aav * modifier * bonusDiscount, p.qualified?.aav || 0, minSalaryForYear(start)));
  const reasons = [];
  const termOk = yrs >= win.lo && yrs <= win.hi;
  if (!termOk) reasons.push(yrs < win.lo ? `Wants at least ${win.lo} years of security.` : `Won't commit past ${win.hi} year${win.hi > 1 ? "s" : ""} at his age.`);
  const testing = kind === "resign" && p.willing === false;
  if (testing) reasons.push("He wants to test free agency this summer.");
  const ratio = aav / floor;
  let interest = 0.5 + (ratio - 1) * 4 + (bonusPct / 100) * 0.15;
  if (prefs.priority === "security") interest += yrs >= prefs.preferredTerm ? 0.08 : -0.05 * (prefs.preferredTerm - yrs);
  if (prefs.priority === "winning") interest += teamRatings(league, t).ovr >= 85 ? 0.1 : -0.08;
  if (prefs.priority === "loyalty" && p.tid === t.id) interest += 0.08;
  if (p.mood != null) interest += (p.mood - 0.5) * 0.25;
  if (!termOk) interest -= 0.35;
  if (testing) interest = Math.min(interest, 0.15);
  interest = clamp(interest, 0, 1);
  const bonusCash = round2(aav * yrs * (bonusPct / 100));
  const cash = round2(t.arena?.cash ?? 0);
  const capOk = kind === "extension" ? futurePayroll(league, t) + aav <= capForYear(league.year + 1) + 1e-6 : aav <= capSpace(league, t) + 1e-6;
  // The 23-man limit is an in-season rule; over the summer the reserve list (90) and contract count (50) are the limits.
  const inSeason = league.phase === "regular" || league.phase === "playoffs";
  const roomOk = kind !== "fa" || !inSeason || hasRoomFor(league, t);
  const slotOk = contractCount(league, t) < 50 || (kind !== "fa" && p.tid === t.id);
  const cashOk = bonusCash <= cash + 1e-6;
  const n = league.negotiations?.[p.id];
  const rounds = n?.year === league.year ? n.rounds || 0 : 0;
  const walked = n?.year === league.year && n.status === "walked";
  if (!capOk) reasons.push(kind === "extension" ? "This would exceed next season's projected cap." : "This would put you over the cap.");
  if (!roomOk) reasons.push(`Roster is full (${MAX_ROSTER}).`);
  if (!slotOk) reasons.push("No contract slot available (50).");
  if (!cashOk) reasons.push(`The club can't cover a ${bonusPct}% bonus in cash.`);
  if (walked) reasons.push("His agent ended talks for this season.");
  const counterYrs = termOk ? yrs : clamp(yrs, win.lo, win.hi);
  const cAsk = askFor(league, p, counterYrs, kind);
  const counter = { aav: round2(Math.max(cAsk.aav * priorityModifier(league, t, p, counterYrs, prefs) * bonusDiscount, p.qualified?.aav || 0, minSalaryForYear(start))), yrs: counterYrs };
  const accept = termOk && !testing && aav + 1e-6 >= floor;
  return { interest, accept: accept && capOk && roomOk && slotOk && cashOk && !walked, agree: accept, floor, counter, reasons, termWindow: win, capOk, cashOk, roomOk, slotOk, bonusCash, cash, prefs, ask, rounds, walked, start, lowball: ratio < 0.9, kind };
}

// Cap room for the next four seasons with (or without) a deal in place.
export function capRoomByYear(league, t, deal) {
  const offseason = OFFSEASON.has(league.phase);
  const base = offseason ? league.year + 1 : league.year;
  const first = deal?.start ?? base;
  const out = [];
  for (let k = 0; k < 4; k++) {
    const y = first + k;
    let committed = 0;
    for (const id of [...t.roster, ...t.prospects]) {
      const p = league.players[id];
      if (!p || p.signed === false || (deal && p.id === deal.pid)) continue;
      const last = base + p.yrs - 1;
      if (y <= last) committed += p.cap;
      else if (p.extension && y >= p.extension.start && y < p.extension.start + p.extension.yrs) committed += p.extension.aav;
    }
    const off = y - base;
    committed += (t.retained || []).filter((d) => d.yrs > off).reduce((s, d) => s + d.amt, 0);
    committed += (t.deadCap || []).filter((d) => (d.offset || 0) <= off && (d.offset || 0) + d.yrs > off).reduce((s, d) => s + d.amt, 0);
    if (deal && y >= deal.start && y < deal.start + deal.yrs) committed += deal.aav;
    out.push({ year: y, cap: capForYear(y), room: round2(capForYear(y) - committed) });
  }
  return out;
}

export function submitOffer(league, pid, { aav, yrs, bonusPct = 0, kind }) {
  const p = league.players[pid];
  const t = league.teams[league.userTid];
  if (!p) return { ok: false, msg: "Player not found." };
  kind ||= dealKind(league, p);
  const start = dealStart(league, kind);
  aav = round2(Number(aav));
  if (!Number.isFinite(aav) || aav < minSalaryForYear(start) || aav > maxSalaryForYear(start) || !Number.isInteger(yrs) || yrs < 1) return { ok: false, msg: "Enter a legal salary and term." };
  const ev = evaluateOffer(league, p, { aav, yrs, bonusPct, kind });
  if (ev.walked) return { ok: false, msg: `${p.name}'s agent has ended talks for this season.`, ev };
  if (!ev.agree) {
    const rounds = ev.rounds + 1;
    const walked = rounds >= 4 || (ev.lowball && rounds >= 3);
    league.negotiations ||= {};
    league.negotiations[pid] = { pid, year: league.year, rounds, status: walked ? "walked" : "counter", counter: ev.counter.aav, term: ev.counter.yrs, preferences: ev.prefs };
    return { ok: false, countered: !walked, walked, counter: ev.counter, msg: walked ? `${p.name}'s agent has walked away from the table.` : `Counter: $${ev.counter.aav.toFixed(2)}M × ${ev.counter.yrs} years.`, ev };
  }
  if (!ev.accept) return { ok: false, msg: ev.reasons[0] || "That deal can't be done right now.", ev };
  const bonus = ev.bonusCash;
  const pay = () => { if (bonus > 0) { t.arena.cash = round2(t.arena.cash - bonus); logTx(league, `${t.abbr} pay ${p.name} a $${bonus.toFixed(2)}M signing bonus`, [t.id]); } };
  if (kind === "extension") {
    const r = extendPlayer(league, pid, aav, yrs, { agreed: true });
    if (r.ok) { pay(); league.negotiations ||= {}; league.negotiations[pid] = { pid, year: league.year, rounds: ev.rounds + 1, status: "signed", aav, yrs, preferences: ev.prefs }; }
    return { ...r, ev };
  }
  if (kind === "resign") {
    if (p.offerSheetPending) return { ok: false, msg: "Resolve the pending offer sheet first." };
    p.cap = aav; p.yrs = yrs; delete p.qualified; delete p.clause; p.contractSigningAge = p.age; delete p.salarySchedule;
    pay();
    promiseRole(league, p, t.id, projectedRole(league, t, p));
    logTx(league, `${t.abbr} re-sign ${p.name} — ${yrs} yr${yrs > 1 ? "s" : ""}, $${aav.toFixed(2)}M AAV`, [t.id]);
    league.negotiations ||= {}; league.negotiations[pid] = { pid, year: league.year, rounds: ev.rounds + 1, status: "signed", aav, yrs, preferences: ev.prefs };
    return { ok: true, msg: `${p.name} agreed: $${aav.toFixed(2)}M × ${yrs}.`, ev };
  }
  // Free agent: in the offseason the agent collects competing bids; in season he signs now.
  if (["freeagency", "resign", "preseason"].includes(league.phase)) {
    const r = negotiate(league, pid, aav, yrs, "", "", { floor: ev.floor, bonusCash: bonus });
    if (r.ok && bonus > 0) { t.arena.cash = round2(t.arena.cash - bonus); }
    return { ...r, ev };
  }
  if (!hasRoomFor(league, t)) return { ok: false, msg: `Roster is full (${MAX_ROSTER}).`, ev };
  if (!signPlayer(league, t, p, aav, yrs)) return { ok: false, msg: "No contract or reserve-list slot available.", ev };
  pay();
  promiseRole(league, p, t.id, projectedRole(league, t, p));
  return { ok: true, msg: `${p.name} signs with the ${t.name}!`, ev };
}
