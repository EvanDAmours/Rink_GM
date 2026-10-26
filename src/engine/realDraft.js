// Draft history for players who joined the league before its first draft: the real NHL record for
// everyone on the shipped NHL 27 rosters (src/data/realDraft.js), and an estimated record for the
// generated depth players and free agents a new league is filled out with. Keeps the shape the
// in-game draft writes ({year, round, pick, tid}); real records also carry the club code as it was
// on draft day (abbr), and estimated ones are flagged est: true. Undrafted players get
// p.undrafted = true and keep draft null. Never touches ratings, and never draws from the game's
// random stream (estimates hash the player id), so a league's ratings and results are unchanged.
import { REAL_DRAFT } from "../data/realDraft.js";
import { stream } from "./rng.js";

export const DRAFT_HISTORY_VERSION = 1;
// Clubs that have moved since: the pick belongs to today's franchise.
const RELOCATED = { ATL: "WPG", PHX: "UTA", ARI: "UTA" };
const REAL_SRC = new Set(["ea27", "est"]);

const BY_NAME = (() => {
  const m = new Map();
  for (const [k, v] of Object.entries(REAL_DRAFT)) {
    const name = k.slice(0, k.lastIndexOf("|"));
    m.set(name, m.has(name) ? null : v); // null marks a shared name: needs the position too
  }
  return m;
})();

export function realDraftRecord(name, pos) {
  const exact = REAL_DRAFT[`${name}|${pos}`];
  if (exact !== undefined) return exact;
  return BY_NAME.get(name) ?? undefined;
}

const tidFor = (lg, abbr) => {
  const code = RELOCATED[abbr] || abbr;
  return lg.teams.find((t) => t.abbr === code)?.id ?? -1;
};

// Real player: returns true when a record was found and applied.
export function applyRealDraft(lg, p) {
  if (!p || p.draft || p.undrafted || !REAL_SRC.has(p.src)) return false;
  const rec = realDraftRecord(p.name, p.pos);
  if (rec === undefined) return false;
  if (rec === 0) { p.undrafted = true; return true; }
  const [year, round, pick, abbr] = rec;
  p.draft = { year, round, pick, tid: tidFor(lg, abbr), abbr };
  return true;
}

// ESTIMATED, not real: a generated player who arrived with the league gets a plausible record —
// drafted the summer he turned 18, round by ceiling, usually by his current club. Some older,
// lower-ceiling players went undrafted, as in the real league.
export function estimateDraft(lg, p) {
  if (!p || p.draft || p.undrafted || p.src !== "gen" || !(p.age >= 19)) return false;
  const r = stream(`draftHistory|${p.id}|${p.name}`);
  const year = lg.year - p.age + 18;
  const pot = p.pot ?? p.ovr ?? 70;
  if (pot < 80 && r.next() < (p.age >= 24 ? 0.35 : 0.2)) { p.undrafted = true; return true; }
  const lo = pot >= 88 ? 1 : pot >= 84 ? 1 : pot >= 80 ? 2 : pot >= 76 ? 3 : 4;
  const hi = pot >= 88 ? 1 : pot >= 84 ? 2 : pot >= 80 ? 3 : pot >= 76 ? 5 : 7;
  const round = lo + Math.floor(r.next() * (hi - lo + 1));
  const per = year >= 2021 ? 32 : year >= 2017 ? 31 : 30;
  const pick = (round - 1) * per + 1 + Math.floor(r.next() * per);
  const own = p.tid >= 0 && r.next() < 0.6;
  const tid = own ? p.tid : Math.floor(r.next() * lg.teams.length);
  p.draft = { year, round, pick, tid, est: true };
  return true;
}

// Fill draft history for everyone already in the league. Runs at league creation and once for
// older saves (gated by lg.draftHistoryVersion). Players still in the upcoming draft class are
// left alone; in-game class members who were passed over are marked undrafted.
export function ensureDraftHistory(lg) {
  if (!lg?.players || (lg.draftHistoryVersion || 0) >= DRAFT_HISTORY_VERSION) return { real: 0, est: 0, undrafted: 0 };
  const inClass = new Set(lg.draftClass || []);
  const n = { real: 0, est: 0, undrafted: 0 };
  for (const p of Object.values(lg.players)) {
    if (!p || p.draft || p.undrafted || inClass.has(p.id) || p.tid === -2) continue;
    if (REAL_SRC.has(p.src)) { if (applyRealDraft(lg, p)) n.real++; }
    else if (p.src === "draft") { p.undrafted = true; n.undrafted++; }
    else if (p.src === "gen" && estimateDraft(lg, p)) n.est++;
  }
  lg.draftHistoryVersion = DRAFT_HISTORY_VERSION;
  return n;
}
