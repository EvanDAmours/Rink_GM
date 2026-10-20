// Big moments (Gridiron 3.0): full-screen beats in your team's colours, queued by the engine and
// shown by the app once the sim stops. Clinching a playoff spot, a record falling, signing a star,
// a blockbuster trade, the Stanley Cup, awards night, a legend's farewell, a Hall of Fame induction.
//
// A moment is plain data so it survives a save and reload:
//   { kind, key, tid, pid?, p?: {name,pos,ovr,age,num}, kicker?, title?, sub?, lines?: [[label, value, tone?]],
//     note?, then?: { type, ... } (a modal the app opens when the moment closes), stop?: true (ends a running sim) }
// `key` makes it one-time: the same key is never queued twice (also after it was seen).
// Each family of moments has its own engine file and screen file:
//   season beats  → engine/momentsSeason.js  + ui/moments/season.jsx
//   Cup and awards → engine/momentsCup.js    + ui/moments/cup.jsx
//   game results and records → engine/momentsResults.js + ui/moments/results.jsx
import { seasonDayMoments } from "./momentsSeason.js";
import { resultDayMoments } from "./momentsResults.js";

const SEEN_CAP = 400;

export function queueMoment(league, m) {
  if (!m || !m.kind) return false;
  league.moments ||= [];
  league.momentsSeen ||= [];
  if (m.key && (league.moments.some((x) => x.key === m.key) || league.momentsSeen.includes(m.key))) return false;
  league.moments.push({ year: league.year, day: league.day, ...m });
  return true;
}

export function currentMoment(league) {
  return league?.moments?.[0] || null;
}

// Close the moment on screen; returns it so the app can open its follow-up (`then`).
export function closeMoment(league) {
  const m = league.moments?.shift() || null;
  if (m?.key) {
    league.momentsSeen ||= [];
    league.momentsSeen.push(m.key);
    if (league.momentsSeen.length > SEEN_CAP) league.momentsSeen.splice(0, league.momentsSeen.length - SEEN_CAP);
  }
  return m;
}

// A running sim stops when a moment that asks for it is waiting.
export function momentStopsSim(league) {
  return !!league?.moments?.some((m) => m.stop);
}

// Called once at the end of every regular-season day (simmed or played live), after results are in.
// `ids`: the clubs that played today. `games`: today's finished games.
export function afterGameDay(league, ids, games) {
  try {
    for (const m of seasonDayMoments(league, ids, games) || []) queueMoment(league, m);
    for (const m of resultDayMoments(league, ids, games) || []) queueMoment(league, m);
  } catch (e) {
    // A moment must never break the sim.
    console.error("Moment hook failed", e);
  }
}

// Old saves: no moments yet.
export function ensureMoments(league) {
  league.moments ||= [];
  league.momentsSeen ||= [];
  return league;
}
