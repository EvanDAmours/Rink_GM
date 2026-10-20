// Game results and records: the postgame result card for your club, and record ceremonies when an
// NHL or franchise single-season record falls.
// Return moment objects (see moments.js); moments.js queues them.
//
// Result card (Gridiron 1.9 / 1.95): after your game, W / L / OTL with the score, your new record
// and division place, the three stars (and your goalie's line) and the night's other scores.
// league.settings.resultCard picks "compact" (default: closes itself), "full" or "off". Only the
// latest result card is ever waiting: a new game replaces the one before, so a week's sim ends
// on one card, not a stack. A game you played live gets no card: the live screen already showed
// the final, the leaders and the saves.
//
// Records (Gridiron 3.40 / 2.10): every day the book takes in any NHL or club single-season mark
// that fell (engine/records.js keeps the new holder). When the holder is yours, a one-time moment:
// the gold ceremony for an NHL record, the team-colour card for a franchise record.
import { divisionTable } from "./standings.js";
import { isGoalie } from "./constants.js";
import { updateSeasonMarks, seasonText, poss } from "./records.js";

export const RESULT_CARD_MODES = ["compact", "full", "off"];
// The player's choice; older saves had only `postgame: false` (no box score after a game).
export function resultCardMode(league) {
  const v = league?.settings?.resultCard;
  if (RESULT_CARD_MODES.includes(v)) return v;
  return league?.settings?.postgame === false ? "off" : "compact";
}

const ORD = (n) => n + (["st", "nd", "rd"][((n + 90) % 100 - 10) % 10 - 1] || "th");
const same = (a, b) => a != null && b != null && String(a) === String(b);

// One player's line from the game report: "2 G, 1 A", or a goalie's "31 saves, .969".
function lineFor(league, rep, g, pid) {
  const p = league.players[pid];
  const gl = rep?.goalies?.find((x) => same(x.pid, pid));
  if (gl || isGoalie(p?.pos)) {
    let sa = gl?.sa, ga = gl?.ga;
    if (sa == null && g.gl) { const side = same(g.gl.h, pid) ? "h" : same(g.gl.a, pid) ? "a" : null; if (side) { sa = g.shots?.[side === "h" ? "a" : "h"]; ga = side === "h" ? g.as : g.hs; } }
    if (sa == null) return "";
    const sv = Math.max(0, sa - ga);
    return `${sv} save${sv === 1 ? "" : "s"}${ga === 0 && sa ? ", shutout" : sa ? `, ${(sv / sa).toFixed(3).replace(/^0/, "")}` : ""}`;
  }
  const b = rep?.players?.find((x) => same(x.pid, pid));
  let G = b?.g, A = b?.a;
  if (b == null && g.goals) { G = g.goals.filter((x) => same(x.p, pid)).length; A = g.goals.filter((x) => (x.a || []).some((y) => same(y, pid))).length; }
  const bits = [];
  if (G) bits.push(`${G} G`);
  if (A) bits.push(`${A} A`);
  if (!bits.length && b) {
    if (b.pm) bits.push(`${b.pm > 0 ? "+" : ""}${b.pm}`);
    if (b.sog) bits.push(`${b.sog} SOG`);
    if (b.blk >= 2) bits.push(`${b.blk} blocks`);
    else if (b.hit >= 3) bits.push(`${b.hit} hits`);
  }
  return bits.join(", ");
}

const who = (league, pid) => {
  const p = league.players[pid];
  return p ? { pid: p.id, name: p.name, pos: p.pos, tid: p.tid } : null;
};

// The card for your game `g` (a played schedule entry), with tonight's other scores.
export function resultCardMoment(league, g, games = []) {
  const ut = league.userTid;
  const t = league.teams[ut];
  const home = g.h === ut;
  const us = home ? g.hs : g.as, them = home ? g.as : g.hs;
  const outcome = us > them ? "W" : g.ot ? "OTL" : "L";
  const rank = divisionTable(league, t.div).findIndex((x) => x.id === ut) + 1;
  const rep = (league.gameReports || []).find((r) => same(r.id, g.id));
  const stars = (g.stars || []).map((pid) => { const w = who(league, pid); return w && { ...w, line: lineFor(league, rep, g, pid) }; }).filter(Boolean);
  // Your goalie's line, when he isn't already one of the stars.
  const myG = g.gl?.[home ? "h" : "a"];
  const goalie = myG != null && !stars.some((s) => same(s.pid, myG)) && who(league, myG) ? { ...who(league, myG), line: lineFor(league, rep, g, myG) } : null;
  const others = games.filter((x) => x !== g && x.played && x.id !== g.id).map((x) => ({ id: x.id, h: x.h, a: x.a, hs: x.hs, as: x.as, ot: x.ot || null }));
  return {
    kind: "result",
    key: `result-${league.year}-${g.id}`,
    tid: ut,
    gid: g.id,
    opp: home ? g.a : g.h,
    home, us, them, outcome,
    ot: g.ot || null,
    gameNo: t.rec.gp,
    rec: { w: t.rec.w, l: t.rec.l, otl: t.rec.otl, pts: t.rec.pts },
    place: rank > 0 ? `${ORD(rank)} in the ${t.div}` : "",
    stars,
    goalie,
    others,
    // Enough of the game for its box score, should the schedule have moved on (a new season).
    game: { id: g.id, day: g.day, h: g.h, a: g.a, hs: g.hs, as: g.as, ot: g.ot || null, shots: g.shots ? { ...g.shots } : null, stars: [...(g.stars || [])], goals: g.goals ? g.goals.map((x) => ({ ...x })) : null },
  };
}

// Only the latest result card waits: drop any earlier one.
export function dropResultCards(league) {
  const q = league.moments || [];
  for (let i = q.length - 1; i >= 0; i--) if (q[i]?.kind === "result") q.splice(i, 1);
}

// Which records broken today get a moment: the ones your club or your players now hold. One moment
// a day (an NHL record over a franchise one, points over goals over assists); the rest are listed on it.
const ORDER = { pts: 0, g: 1, a: 2, w: 3, so: 4, tpts: 5, tw: 6, tgf: 7 };
const fmt = (n) => Number(n || 0).toLocaleString("en-US");
const prevText = (pv) => (pv ? `${poss(pv.name)} ${fmt(pv.value)}${pv.season ? ` (${pv.season})` : ""}` : "");
export function recordMoments(league, broken) {
  const ut = league.userTid;
  const user = league.teams[ut];
  const mine = (broken || []).filter((b) => (b.scope === "franchise" ? b.club === user.abbr : true) && (b.pid != null ? league.players[b.pid]?.tid === ut : b.tid === ut));
  if (!mine.length) return [];
  mine.sort((a, b) => (a.scope === "nhl" ? 0 : 10) + (ORDER[a.key] ?? 9) - ((b.scope === "nhl" ? 0 : 10) + (ORDER[b.key] ?? 9)));
  const [b, ...rest] = mine;
  const p = b.pid != null ? league.players[b.pid] : null;
  const nhl = b.scope === "nhl";
  const label = b.label;
  const whose = p ? p.name : `${user.city} ${user.name}`;
  // The rest broken today, one line each ("CLUB GOALS  93, passing Wayne Gretzky's 92 (1981-82)").
  const also = rest.map((r) => [`${r.scope === "nhl" ? "NHL" : "CLUB"} ${r.label.toUpperCase()}`, `${fmt(r.value)}${r.pid != null && !same(r.pid, b.pid) ? ` by ${r.name}` : ""}${r.prev ? `, passing ${prevText(r.prev)}` : ""}`]);
  const base = {
    tid: ut,
    pid: p?.id ?? null,
    p: p ? { name: p.name, pos: p.pos, num: p.number ?? null } : null,
    teamRecord: b.pid == null,
    stat: b.key,
    label,
    value: b.value,
    prev: b.prev || null,
    season: seasonText(league.year),
    also,
    stop: true,
  };
  if (nhl) {
    return [{
      ...base,
      kind: "nhlRecord",
      key: `record-nhl-${league.year}-${b.key}-${b.pid ?? `club${ut}`}`,
      sub: p ? `The ${label.toLowerCase()} record is his: the most in a single NHL season.` : `The most ${label.toLowerCase().replace(/^team /, "")} by any club in a single NHL season.`,
    }];
  }
  return [{
    ...base,
    kind: "franchiseRecord",
    key: `record-fr-${league.year}-${user.abbr}-${b.key}-${b.pid ?? "club"}`,
    kicker: "NEW FRANCHISE RECORD",
    title: whose.toUpperCase(),
    sub: p ? `The most ${label.toLowerCase()} in ${user.city} ${user.name} history.` : `The most ${label.toLowerCase().replace(/^team /, "")} in a season in ${user.city} ${user.name} history.`,
  }];
}

// Called at the end of every regular-season day. `ids`: clubs that played; `games`: today's finished games.
export function resultDayMoments(league, ids, games) {
  const out = [];
  // The record book takes in today's broken marks whatever the card setting.
  out.push(...recordMoments(league, updateSeasonMarks(league)));
  const ut = league.userTid;
  const g = (games || []).find((x) => x.played && (x.h === ut || x.a === ut));
  if (g) {
    dropResultCards(league);
    const spec = league.activeGame?.spec;
    const playedLive = spec?.kind === "regular" && same(spec.gid, g.id);
    if (!playedLive && resultCardMode(league) !== "off") out.push(resultCardMoment(league, g, games));
  }
  return out;
}
