// Season stats by unit (Gridiron 3.25 "By the Numbers") and game-plan usage (2.72), for hockey.
// applyResult (sim.js) hands every regular-season game here once. Everything lives on the team:
//   team.unitSeason { year, gp, units: { "Line 1": {...}, PP: {...}, SH: {...} }, pp: {opp, goals, sec}, pk: {opp, ga, sec} }
//   team.tacticLog  the last game's plan and how it was used (shown on the plan card)
// Both are created on first use, so old saves load as they were.
import { strengthType } from "./gameRules.js";

const UNIT_KEYS = ["Line 1", "Line 2", "Line 3", "Line 4", "PP", "SH"];
const blankUnit = () => ({ sec: 0, cf: 0, ca: 0, sf: 0, sa: 0, gf: 0, ga: 0, xgf: 0, xga: 0 });
export function blankSeason(year) {
  return { year, gp: 0, units: Object.fromEntries(UNIT_KEYS.map((k) => [k, blankUnit()])), pp: { opp: 0, goals: 0, sec: 0 }, pk: { opp: 0, ga: 0, sec: 0 } };
}
export function unitSeason(league, team) {
  if (!team.unitSeason || team.unitSeason.year !== league.year) team.unitSeason = blankSeason(league.year);
  return team.unitSeason;
}
const onTarget = (a) => a.result === "save" || a.result === "goal";

// One finished game: unit minutes, attempts, shots, goals and chance quality for and against,
// power-play and penalty-kill results, and the plan usage.
export function recordGameUnits(league, s) {
  for (const k of ["h", "a"]) {
    const o = k === "h" ? "a" : "h";
    const team = league.teams[s[k].tid];
    if (!team) continue;
    const S = unitSeason(league, team);
    S.gp++;
    for (const [unit, u] of Object.entries(s.unitStats?.[k] || {})) (S.units[unit] ||= blankUnit()).sec += u.seconds || 0;
    for (const a of s.shotLog || []) {
      const mine = a.side === k;
      const unit = mine ? a.unit : a.defendingUnit;
      const U = unit && (S.units[unit] ||= blankUnit());
      if (!U) continue;
      if (mine) { U.cf++; if (onTarget(a)) U.sf++; if (a.result === "goal") U.gf++; U.xgf += a.chance || 0; }
      else { U.ca++; if (onTarget(a)) U.sa++; if (a.result === "goal") U.ga++; U.xga += a.chance || 0; }
    }
    S.pp.opp += s.special?.[k]?.opportunities || 0;
    S.pp.goals += s.special?.[k]?.goals || 0;
    S.pp.sec += s.special?.[k]?.seconds || 0;
    S.pk.opp += s.special?.[o]?.opportunities || 0;
    S.pk.ga += s.special?.[o]?.goals || 0;
    S.pk.sec += s.special?.[o]?.seconds || 0;
    team.tacticLog = tacticUsage(s, k);
  }
}

// How the plan was used in one game, from the sim's decision counts and usage clock.
export function tacticUsage(s, k) {
  const o = k === "h" ? "a" : "h";
  const d = s.decisions?.[k] || {}, od = s.decisions?.[o] || {};
  const share = (a, b) => (a + b ? Math.round((a / (a + b)) * 100) : null);
  const use = s.usage?.[k] || {};
  const total = (use.attack || 0) + (use.defend || 0) + (use.balanced || 0);
  return {
    year: s.year, day: s.day, opp: s[o].tid, plan: { ...(s[k].plan || {}) },
    dumpIns: share(d["dump-and-chase"] || 0, d["controlled-entry"] || 0),
    shoot: share(d.shoot || 0, (d.cycle || 0) + (d["rush-pass"] || 0)),
    oppCarry: share(od["controlled-entry"] || 0, od["dump-and-chase"] || 0),
    pushing: total ? Math.round(((use.attack || 0) / total) * 100) : null,
    sitting: total ? Math.round(((use.defend || 0) / total) * 100) : null,
    units: { ...(s.situational?.[k] || {}) },
  };
}

// Season rates for one unit row: per-60 numbers and shares (null when he hasn't played).
export function unitRates(U) {
  if (!U || U.sec < 60) return null;
  const per60 = (v) => (v * 3600) / U.sec;
  return {
    min: U.sec / 60, cfPct: U.cf + U.ca ? (U.cf / (U.cf + U.ca)) * 100 : null, gfPct: U.gf + U.ga ? (U.gf / (U.gf + U.ga)) * 100 : null,
    xgfPct: U.xgf + U.xga ? (U.xgf / (U.xgf + U.xga)) * 100 : null, gf60: per60(U.gf), ga60: per60(U.ga), sf60: per60(U.sf), sa60: per60(U.sa),
  };
}
// League averages for each unit row and the special teams, for the green/red comparison.
export function leagueUnitAverages(league) {
  const sum = {}, sp = { ppOpp: 0, ppGoals: 0, pkOpp: 0, pkGa: 0 };
  for (const t of league.teams) {
    const S = t.unitSeason;
    if (!S || S.year !== league.year) continue;
    for (const [k, U] of Object.entries(S.units)) { const a = (sum[k] ||= blankUnit()); for (const f in a) a[f] += U[f] || 0; }
    sp.ppOpp += S.pp.opp; sp.ppGoals += S.pp.goals; sp.pkOpp += S.pk.opp; sp.pkGa += S.pk.ga;
  }
  const units = Object.fromEntries(Object.entries(sum).map(([k, U]) => [k, unitRates(U)]));
  return { units, ppPct: sp.ppOpp ? (sp.ppGoals / sp.ppOpp) * 100 : null, pkPct: sp.pkOpp ? (1 - sp.pkGa / sp.pkOpp) * 100 : null };
}
// PP% and PK% for every team this season: [{ tid, ppPct, pp, pkPct, pk }].
export function specialTeamsTable(league) {
  return league.teams.map((t) => {
    const S = t.unitSeason && t.unitSeason.year === league.year ? t.unitSeason : blankSeason(league.year);
    return { tid: t.id, gp: S.gp, ppOpp: S.pp.opp, ppGoals: S.pp.goals, ppPct: S.pp.opp ? (S.pp.goals / S.pp.opp) * 100 : null, pkOpp: S.pk.opp, pkGa: S.pk.ga, pkPct: S.pk.opp ? (1 - S.pk.ga / S.pk.opp) * 100 : null };
  });
}

// Usage clock, called from sim.js playingTime: seconds in each tactic state and in each
// situational unit (OT trio, extra attacker, lead protection, D-zone draw unit).
export function tallyUsage(s, dt) {
  s.usage ||= { h: {}, a: {} };
  s.situational ||= { h: {}, a: {} };
  for (const k of ["h", "a"]) {
    const side = s[k];
    if (strengthType(s, k) === "EV") s.usage[k][side.tactic || "balanced"] = (s.usage[k][side.tactic || "balanced"] || 0) + dt;
    if (side.unitOn) s.situational[k][side.unitOn] = (s.situational[k][side.unitOn] || 0) + dt;
  }
}
