// Repairs a loaded save so one bad entry can't crash every screen, as the football game
// does: drops roster, prospect and free-agent ids that point at nobody, removes duplicates
// (a player listed twice, or by two clubs), fixes broken ratings and ages, clears
// development traits the game doesn't know and fills in fields every screen expects.
// Mutates the league and returns a short list of what it fixed (empty for a healthy save).
// It never rewrites a sound player's ratings: an OVR is only recomputed when it's missing.
import LZString from "lz-string";
import { unpackLeague } from "./savePacking.js";
import { restoreLeague } from "./league.js";
import { DEV_TRAITS, rollDev, blankStats } from "./players.js";
import { computeOvr, generateAttributes, defaultArchetype } from "./ratings.js";
import { POSITIONS, minSalaryForYear } from "./constants.js";

const num = (v) => typeof v === "number" && Number.isFinite(v);
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

function fixPlayer(league, p, fixes) {
  const who = typeof p.name === "string" && p.name ? p.name : `player ${p.id}`;
  if (typeof p.name !== "string" || !p.name.trim()) { p.name = "Unknown Player"; fixes.push(`named a nameless player (${p.id})`); }
  if (!p.attrs || typeof p.attrs !== "object") {
    p.type ||= defaultArchetype(p.pos);
    p.attrs = generateAttributes(num(p.ovr) ? p.ovr : 60, p.type, p.pos);
    fixes.push(`rebuilt the missing ratings of ${who}`);
  }
  if (!num(p.ovr)) {
    const ovr = computeOvr(p.attrs, p.type || defaultArchetype(p.pos)) + (num(p.ovrOffset) ? p.ovrOffset : 0);
    p.ovr = num(ovr) ? Math.max(40, Math.min(99, Math.round(ovr))) : 60;
    fixes.push(`fixed the overall rating of ${who}`);
  }
  if (!num(p.pot)) { p.pot = p.ovr; fixes.push(`fixed the potential of ${who}`); }
  if (!num(p.age)) { p.age = num(p.born) ? league.year - p.born : 25; fixes.push(`fixed the age of ${who}`); }
  if (p.dev == null || !DEV_TRAITS[p.dev]) { const had = p.dev != null; p.dev = rollDev(p.id, p.pot); if (had) fixes.push(`replaced an unknown development trait on ${who}`); }
  if (!num(p.injury)) p.injury = 0;
  if (!num(p.cap)) { p.cap = num(p.tid) && p.tid >= 0 ? minSalaryForYear(league.year) : 0; fixes.push(`fixed the contract of ${who}`); }
  if (!num(p.yrs)) p.yrs = 0;
  if (!p.stats || typeof p.stats !== "object") p.stats = blankStats(p.pos);
  if (!p.pstats || typeof p.pstats !== "object") p.pstats = blankStats(p.pos);
  if (!Array.isArray(p.career)) p.career = [];
}

// Keep the ids that point at a real player, once each.
function cleanIds(league, list, where, fixes) {
  if (!Array.isArray(list)) { fixes.push(`rebuilt ${where}`); return []; }
  const seen = new Set();
  let missing = 0, dupes = 0;
  const out = list.filter((id) => {
    if (!league.players[id]) { missing++; return false; }
    if (seen.has(id)) { dupes++; return false; }
    seen.add(id);
    return true;
  });
  if (missing) fixes.push(`removed ${plural(missing, "missing player")} from ${where}`);
  if (dupes) fixes.push(`removed ${plural(dupes, "duplicate")} from ${where}`);
  return out;
}

const textItems = (list) => (Array.isArray(list) ? list : []).filter((x) => x && typeof x === "object" && typeof x.text === "string");

export function repairLeague(league) {
  const fixes = [];
  if (!league || !Array.isArray(league.teams) || !league.players || typeof league.players !== "object") return fixes;

  // Player records: an empty slot or one without a known position can't be shown or played.
  let dropped = 0;
  for (const [id, p] of Object.entries(league.players)) {
    if (!p || typeof p !== "object" || !POSITIONS.includes(p.pos)) { delete league.players[id]; dropped++; continue; }
    if (p.id !== id) p.id = id;
    fixPlayer(league, p, fixes);
  }
  if (dropped) fixes.push(`removed ${plural(dropped, "unreadable player record")}`);

  // Rosters and prospect lists: real players only, once each, and each player with one club.
  const owner = new Map(); // id -> index of the club that keeps him
  league.teams.forEach((t, i) => {
    if (!t) return;
    const ab = t.abbr || `team ${i}`;
    t.roster = cleanIds(league, t.roster, `the ${ab} roster`, fixes);
    t.prospects = cleanIds(league, t.prospects, `the ${ab} prospect list`, fixes);
    const both = t.prospects.filter((id) => t.roster.includes(id));
    if (both.length) { t.prospects = t.prospects.filter((id) => !both.includes(id)); fixes.push(`took ${plural(both.length, "player")} on the ${ab} roster off its prospect list`); }
  });
  league.teams.forEach((t, i) => {
    if (!t) return;
    for (const key of ["roster", "prospects"]) {
      t[key] = t[key].filter((id) => {
        const p = league.players[id], prev = owner.get(id);
        if (prev == null) { owner.set(id, i); return true; }
        // Listed by two clubs: he stays with the one his record says he plays for.
        if (p.tid === i) {
          const o = league.teams[prev];
          o.roster = o.roster.filter((x) => x !== id);
          o.prospects = o.prospects.filter((x) => x !== id);
          owner.set(id, i);
          fixes.push(`kept ${p.name} with one club (he was listed by two)`);
          return true;
        }
        fixes.push(`kept ${p.name} with one club (he was listed by two)`);
        return false;
      });
    }
  });
  for (const [id, tid] of owner) {
    const p = league.players[id];
    if (p.tid !== tid) { p.tid = tid; fixes.push(`fixed the club on ${p.name}'s record`); }
  }

  // Free agents and the draft class: real players who aren't on a club.
  league.freeAgents = cleanIds(league, league.freeAgents ?? [], "the free-agent pool", fixes);
  const signed = league.freeAgents.filter((id) => owner.has(id));
  if (signed.length) { league.freeAgents = league.freeAgents.filter((id) => !owner.has(id)); fixes.push(`took ${plural(signed.length, "signed player")} out of the free-agent pool`); }
  for (const id of league.freeAgents) { const p = league.players[id]; if (p.tid !== -1) { p.tid = -1; fixes.push(`fixed the free-agent status of ${p.name}`); } }
  if (Array.isArray(league.draftClass)) league.draftClass = cleanIds(league, league.draftClass, "the draft class", fixes);

  for (const t of league.teams) {
    if (!t) continue;
    // Lines in a shape the lineup code can't read are rebuilt from the roster.
    const L = t.lines;
    if (L && (!Array.isArray(L.F) || !Array.isArray(L.D) || !Array.isArray(L.G) || !L.F.every(Array.isArray) || !L.D.every(Array.isArray))) { t.lines = null; fixes.push(`rebuilt the ${t.abbr} lines`); }
    // A season plan whose focus player is gone keeps running without one.
    if (t.devPlan && t.devPlan.focus != null && !league.players[t.devPlan.focus]) t.devPlan.focus = null;
  }

  // Lists every screen reads as lines of text.
  for (const key of ["inbox", "news", "transactions"]) {
    if (!Array.isArray(league[key])) { if (league[key] != null) fixes.push(`rebuilt the ${key} list`); league[key] = []; continue; }
    const before = league[key].length;
    league[key] = league[key].map((x) => (typeof x === "string" ? { year: league.year, day: league.day ?? 0, text: x } : x));
    league[key] = textItems(league[key]);
    if (league[key].length !== before) fixes.push(`removed ${plural(before - league[key].length, `unreadable ${key === "transactions" ? "transaction" : key} entry`, `unreadable ${key === "transactions" ? "transaction" : key} entries`)}`);
  }
  if (Array.isArray(league.schedule)) {
    const before = league.schedule.length;
    league.schedule = league.schedule.filter((g) => g && typeof g === "object" && league.teams[g.h] && league.teams[g.a]);
    if (league.schedule.length !== before) fixes.push(`removed ${plural(before - league.schedule.length, "broken game")} from the schedule`);
  }
  if (Array.isArray(league.draftPicks)) league.draftPicks = league.draftPicks.filter((pk) => pk && typeof pk === "object");
  if (Array.isArray(league.block)) league.block = league.block.filter((b) => b && league.players[b.pid]);
  if (Array.isArray(league.offers)) league.offers = league.offers.filter((o) => o && Array.isArray(o.give) && Array.isArray(o.get) && [...o.give, ...o.get].every((id) => league.players[id]));
  if (!league.settings || typeof league.settings !== "object") { league.settings = {}; fixes.push("reset the settings"); }
  return fixes;
}

// One line for the toast: "Your save was repaired: removed …; fixed …; and 4 more fixes."
export function repairSummary(fixes, max = 3) {
  if (!fixes?.length) return "";
  const shown = fixes.slice(0, max);
  const more = fixes.length - shown.length;
  return `🔧 Your save was repaired: ${shown.join("; ")}${more ? `; and ${plural(more, "more fix", "more fixes")}` : ""}.`;
}

// Read a stored or exported save (the formats league.js writes) without checking it yet.
export function parseSave(raw) {
  if (!raw) return null;
  if (raw.startsWith("{")) {
    const obj = JSON.parse(raw);
    if (!(obj && typeof obj.league === "string")) return obj;
    const json = LZString.decompressFromBase64(obj.league);
    return json ? unpackLeague(JSON.parse(json)) : null;
  }
  const json = LZString.decompressFromUTF16(raw);
  return json ? unpackLeague(JSON.parse(json)) : null;
}

// Load a save, repairing it on the way in: before the league is checked, so one broken
// player record (a missing rating, an empty slot) doesn't make the whole save unreadable,
// and again after the migrations. Only saves this game wrote are repaired before the check.
// Returns { league, fixes }; league is null when the save can't be read at all.
export function loadRepaired(raw) {
  let obj = null;
  try { obj = parseSave(raw); } catch { return { league: null, fixes: [] }; }
  const fixes = obj && obj.game === "rink-gm" ? repairLeague(obj) : [];
  let league = null;
  try { league = restoreLeague(obj); } catch { league = null; }
  if (!league) return { league: null, fixes: [] };
  return { league, fixes: [...new Set([...fixes, ...repairLeague(league)])] };
}
export function loadRepairedKey(key) {
  try { return loadRepaired(localStorage.getItem(key)); } catch { return { league: null, fixes: [] }; }
}
