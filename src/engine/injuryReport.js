// When an injured player is back, in words (Gridiron 3.41, its injuries.js backText). Injuries count
// down one game at a time: a team game in the regular season, and every playoff day for a club
// still alive (it heals on its rest days too). So the games left on an injury become "out 3
// games", "back for game 5", "out for the series", "back for round 2, game 3", "back for the
// Conference Final" or "out for the season", from the schedule and the bracket.
// Every injury tag and list uses this one formatter: the player card, the player modal, the
// weekly injury report and Game Prep.
import { isOut, injuredRegulars, replacementOptions, slotName } from "./injuries.js";
import { onIR } from "./roster.js";

const ROUND = ["round 1", "round 2", "the Conference Final", "the Stanley Cup Final"];
const ROUND_SHORT = ["R1", "R2", "CF", "SCF"];
export const ROUND_TITLE = ["First Round", "Second Round", "Conference Final", "Stanley Cup Final"];
const MAX_GAMES = 7; // best of seven
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

// Where `left` games after the end of round `r` (0-based) land in the bracket, assuming each later
// round runs its full length (the healing clock keeps running while other series finish).
function laterRounds(r, left) {
  let round = r + 1, g = Math.max(0, left);
  while (round <= 3 && g >= MAX_GAMES) { g -= MAX_GAMES; round++; }
  if (round > 3) return { over: true };
  return { round, game: g + 1 };
}
const backFor = ({ round, game }) => `back for ${ROUND[round]}${game > 1 ? `, game ${game}` : ""}`;
const shortFor = ({ round, game }) => `${ROUND_SHORT[round]}${game > 1 ? ` G${game}` : ""}`;

// { games, text, short, when, playoff, seasonOver, list }
//   text: the full phrase ("out 3 games", "out for the series · back for round 2, game 3")
//   short: a compact chip ("3g", "back G5", "R2 G3", "season")
//   list: "IR", "LTIR" or null
export function injuryReturn(league, p) {
  if (!p || !isOut(p)) return null;
  const n = Math.max(0, Math.round(p.injury || 0));
  const list = p.ltir ? "LTIR" : onIR(p) ? "IR" : null;
  const base = { games: n, list, playoff: false, seasonOver: false };
  if (n <= 0) return { ...base, text: "on LTIR, healthy enough to activate", short: "LTIR", when: "ready to activate" };
  const team = league?.teams?.[p.tid];
  const phase = league?.phase;
  if (!team || !["regular", "playoffs"].includes(phase)) return { ...base, text: `out ${plural(n, "game")}`, short: `${n}g`, when: `back in ${plural(n, "game")}` };

  if (phase === "regular") {
    const left = (league.schedule || []).filter((g) => !g.played && (g.h === team.id || g.a === team.id)).length;
    if (n < left || !left) return { ...base, text: `out ${plural(n, "game")}`, short: `${n}g`, when: n === 1 ? "misses the next game" : `misses the next ${n} games` };
    // He misses the rest of the regular season: the playoffs, if his club gets there.
    const after = n - left;
    if (after === 0) return { ...base, playoff: true, text: "out for the regular season · back for the playoffs", short: "playoffs", when: "back for the playoffs" };
    const at = after < MAX_GAMES ? { round: 0, game: after + 1 } : laterRounds(0, after - MAX_GAMES);
    if (at.over) return { ...base, playoff: true, seasonOver: true, text: "out for the season", short: "season", when: "out for the season" };
    return { ...base, playoff: true, text: `out for the regular season · ${backFor(at)}`, short: shortFor(at), when: backFor(at) };
  }

  // Playoffs: his club's series, or the round it's waiting on.
  const po = league.playoffs;
  const round = po?.rounds?.[po.round] || [];
  const r = po?.round ?? 0;
  const mine = round.find((s) => s.top === team.id || s.bot === team.id);
  const alive = po && po.champion == null && mine && (mine.winner == null || mine.winner === team.id);
  if (!alive) return { ...base, playoff: true, seasonOver: true, text: "out for the season", short: "season", when: "out for the season" };
  if (mine.winner == null) {
    const played = mine.games.length;
    const back = played + n + 1;
    if (back <= MAX_GAMES) return { ...base, playoff: true, text: `back for game ${back}`, short: `back G${back}`, when: `back for game ${back}` };
    const at = laterRounds(r, n - (MAX_GAMES - played));
    if (at.over) return { ...base, playoff: true, seasonOver: true, text: "out for the playoffs", short: "playoffs", when: "out for the playoffs" };
    return { ...base, playoff: true, text: `out for the series · ${backFor(at)}`, short: "out for series", when: backFor(at) };
  }
  // His club has won its series and waits for the round to end.
  const wait = Math.max(0, MAX_GAMES - Math.min(...round.filter((s) => s.winner == null).map((s) => s.games.length), MAX_GAMES));
  const at = laterRounds(r, n - wait);
  if (at.over) return { ...base, playoff: true, seasonOver: true, text: "out for the playoffs", short: "playoffs", when: "out for the playoffs" };
  return { ...base, playoff: true, text: backFor(at), short: shortFor(at), when: backFor(at) };
}

// "is ___" in a sentence: "out 3 games", "out for the series", "out, back for game 6".
export const outPhrase = (r) => (!r ? "out" : /^back/.test(r.text) ? `out, ${r.text}` : r.text);

// Words for a chip on a player: "🚑 knee · out 3 games", "LTIR · out for the series".
export function injuryLine(league, p) {
  const r = injuryReturn(league, p);
  if (!r) return "";
  return `${r.list ? `${r.list} · ` : ""}${r.text}`;
}

// The report period: the regular-season week, the playoff round, or the phase.
export function reportPeriod(league) {
  if (league.phase === "regular") return { key: `${league.year}:w${Math.floor((league.day || 0) / 7)}`, label: `Week ${Math.floor((league.day || 0) / 7) + 1}` };
  if (league.phase === "playoffs") { const r = league.playoffs?.round ?? 0; return { key: `${league.year}:r${r}`, label: ROUND_TITLE[r] || "Playoffs" }; }
  return { key: `${league.year}:${league.phase}`, label: league.phase === "preseason" ? "Preseason" : "Off-season" };
}

const episode = (p) => String(p.ltir && !(p.injury > 0) ? "ltir" : p.injuryEpisode || p.injuryNote || "out");

// What the report has already shown you: { out: { pid: episode }, period }.
export function reportBaseline(league, team = league.teams[league.userTid]) {
  const out = {};
  for (const id of team.roster) { const p = league.players[id]; if (isOut(p)) out[id] = episode(p); }
  return { out, period: reportPeriod(league).key };
}

// The weekly injury report for your club (Gridiron 3.70): who's newly out and for how long, IR or
// LTIR, who holds each injured regular's spot tonight, who's still out, and who's back. Null when
// there's nothing new since you last closed it (or injuries are off).
//   { period, out: [{ p, ret, isNew, slot, slotName, fill, fillFit, chosen }], still: [...same], back: [p] }
export function weeklyInjuryReport(league) {
  if (!league || league.settings?.injuries === false) return null;
  const team = league.teams[league.userTid];
  if (!team) return null;
  const seen = team.injuryCard || reportBaseline(league, team);
  const regulars = new Map(injuredRegulars(league, team).map((x) => [String(x.p.id), x]));
  const rows = team.roster.map((id) => league.players[id]).filter(isOut).map((p) => {
    const reg = regulars.get(String(p.id));
    const opts = reg ? replacementOptions(league, team, p.id) : null;
    const fit = reg?.fill && opts ? [...opts.roster].find((x) => String(x.p.id) === String(reg.fill.id)) : null;
    return { p, ret: injuryReturn(league, p), isNew: seen.out?.[p.id] !== episode(p), slot: reg?.slot || null, slotName: reg ? slotName(reg.slot) : null, fill: reg?.fill || null, fillFit: fit || null, chosen: !!reg?.chosen };
  }).sort((a, b) => (b.slot ? 1 : 0) - (a.slot ? 1 : 0) || b.p.ovr - a.p.ovr);
  const back = Object.keys(seen.out || {}).map((id) => league.players[id]).filter((p) => p && p.tid === team.id && !isOut(p) && team.roster.includes(p.id));
  const out = rows.filter((r) => r.isNew), still = rows.filter((r) => !r.isNew);
  if (!out.length && !back.length) return null;
  return { period: reportPeriod(league), out, still, back };
}

// Close the report: everything on it now counts as seen.
export function closeInjuryReport(league) {
  const team = league.teams[league.userTid];
  team.injuryCard = reportBaseline(league, team);
}
