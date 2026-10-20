// The Stanley Cup and awards night: the Cup-winning moment, the awards ceremony and ring night.
// Moments are plain data (see moments.js): tid, pid and small player snapshots, never live objects.
//
// The order after the Final, as in Gridiron:
//   clinching game → Cup moment (only when your club wins; queued by playoffs.js as the Final ends)
//   → the Cup paper (SeriesPaper, which waits for the moment) → awards night (queued when the paper
//   closes) → the Legacy Hall. finishPlayoffs calls cupMoments as a fallback with the same keys, so a
//   save from before this existed still gets its ceremony and nothing is ever shown twice.
// Opening night of the next season: last season's All-Star honourees get their gain and the
// defending champions get ring night (openingNight, called when the regular season starts).
import { connSmythe, allStarTeams, allStarById, allStarGain, applyAllStarGains } from "./awards.js";
import { queueMoment } from "./moments.js";
import { CUP_HISTORY } from "../data/cupHistory.js";

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
const ordinal = (n) => ORD[n] || `${n}${[, "st", "nd", "rd"][(n % 100 >> 3) ^ 1 && n % 10] || "th"}`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// A small player snapshot for a moment card: enough for Headshot (or the sweater) and a name line.
export const snapPlayer = (p) => (p ? { name: p.name, pos: p.pos, number: p.number ?? null, ...(p.nhlId ? { nhlId: p.nhlId } : {}) } : null);

// The calendar years a franchise has won the Cup: real NHL history, then this league
// (the season that starts in year Y ends with the Cup in June of Y+1).
export function cupYears(league, tid, exceptSeason = null) {
  const abbr = league.teams[tid]?.abbr;
  const real = CUP_HISTORY.filter((c) => c.abbr === abbr).map((c) => c.year);
  const ours = (league.history || []).filter((h) => h.champion === tid && h.year !== exceptSeason).map((h) => h.year + 1);
  return [...new Set([...real, ...ours])].sort((a, b) => a - b);
}

// What a title means: the franchise's count with this one, the streak, the drought it ended.
export function titleMeaning(league, tid, season = league.year) {
  const won = season + 1;
  const before = cupYears(league, tid, season).filter((y) => y < won);
  const titles = before.length + 1;
  let streak = 1;
  while (before.includes(won - streak)) streak++;
  const last = before.at(-1) ?? null;
  const gap = last != null ? won - last : null;
  const what = streak >= 3 ? `${cap(WORDS[streak] || String(streak))} straight Stanley Cups. A dynasty.`
    : streak === 2 ? "Back-to-back Stanley Cup champions."
    : titles === 1 ? "The first Stanley Cup in franchise history."
    : gap >= 10 ? `The first Stanley Cup in ${gap} years. The franchise's ${ordinal(titles)}.`
    : `The franchise's ${ordinal(titles)} Stanley Cup.`;
  return { titles, streak, last, gap, what };
}

// The Final in numbers, from the champion's side.
export function finalSummary(s) {
  if (!s || s.winner == null) return null;
  const champ = s.winner, opp = champ === s.top ? s.bot : s.top;
  const wins = champ === s.top ? s.wTop : s.wBot, losses = champ === s.top ? s.wBot : s.wTop;
  const g = s.games.at(-1);
  const us = g ? (g.h === champ ? g.hs : g.as) : null, them = g ? (g.h === champ ? g.as : g.hs) : null;
  return { champ, opp, wins, losses, game: s.games.length, us, them, ot: g?.ot || null, home: g ? g.h === champ : null };
}

const smythe = (league, champ) => {
  const cs = (league.awards?.connSmythe?.tid === champ && league.awards.connSmythe) || connSmythe(league, champ);
  if (!cs) return null;
  const p = league.players[cs.pid];
  return { pid: cs.pid, tid: cs.tid, name: cs.name, why: cs.why, p: snapPlayer(p) || { name: cs.name } };
};

// The moment your club wins the Cup. Returns null when somebody else won it.
export function cupWinMoment(league, s) {
  const f = finalSummary(s);
  if (!f || f.champ !== league.userTid) return null;
  const meaning = titleMeaning(league, f.champ, league.year);
  return {
    kind: "cupWin", key: `cup-${league.year}`, tid: f.champ, stop: true, season: league.year,
    ...f, titles: meaning.titles, streak: meaning.streak, what: meaning.what, mvp: smythe(league, f.champ),
  };
}

// The trophies opened on awards night, in order: the Conn Smythe first.
export const ENVELOPES = ["connSmythe", "hart", "vezina", "norris", "calder", "selke", "artRoss", "rocket", "tedLindsay"];

// Awards night: every envelope with its winner, the Final, and the All-Star teams with your honourees.
export function awardsNightMoment(league) {
  const po = league.playoffs;
  const final = po?.rounds?.[3]?.[0];
  const f = finalSummary(final);
  const champ = po?.champion ?? f?.champ;
  if (champ == null || !league.awards) return null;
  const aw = { ...league.awards, connSmythe: league.awards.connSmythe || connSmythe(league, champ) };
  const envelopes = ENVELOPES.filter((k) => aw[k]?.name).map((k) => {
    const a = aw[k], p = a.pid != null ? league.players[a.pid] : null;
    return { k, pid: a.pid ?? null, tid: a.tid ?? null, name: a.name, why: a.why || "", p: snapPlayer(p) };
  });
  const rec = ensureAllNHL(league);
  const best = allStarById(rec);
  const mine = Object.entries(best).map(([pid, team]) => ({ pid, team, p: league.players[pid] })).filter((x) => x.p && x.p.tid === league.userTid)
    .sort((a, b) => ["first", "second", "rookie"].indexOf(a.team) - ["first", "second", "rookie"].indexOf(b.team))
    .map(({ pid, team, p }) => ({ pid, team, name: p.name, pos: p.pos, ovr: p.ovr, gain: allStarGain(team, p.ovr) }));
  return {
    kind: "awardsNight", key: `awards-${league.year}`, tid: champ, season: league.year,
    champ, opp: f?.opp ?? null, wins: f?.wins ?? null, losses: f?.losses ?? null,
    envelopes, allNHL: { first: rec.first, second: rec.second, rookie: rec.rookie }, mine,
  };
}

// The season's All-Star teams: chosen when the regular season ends (startPlayoffs), made here for
// saves that reached the playoffs before the teams existed.
export function ensureAllNHL(league) {
  if (league.allNHL?.year !== league.year) league.allNHL = allStarTeams(league);
  return league.allNHL;
}

// finishPlayoffs: the season's All-Star teams and the Final go into the history entry (so later
// screens can show them), the honourees get the selection on their record, and the Cup moment and
// awards night are queued if they have not been shown already.
export function cupMoments(league, champ) {
  const rec = ensureAllNHL(league);
  const final = league.playoffs?.rounds?.[3]?.[0];
  const h = league.history?.[0];
  if (h && h.year === league.year) {
    h.allNHL = { first: rec.first, second: rec.second, rookie: rec.rookie };
    const f = finalSummary(final);
    if (f) h.cupFinal = { wins: f.wins, losses: f.losses, us: f.us, them: f.them, ot: f.ot, game: f.game };
  }
  for (const [pid, team] of Object.entries(allStarById(rec))) {
    const p = league.players[pid];
    if (!p) continue;
    p.allNHL ||= [];
    if (!p.allNHL.some((x) => x.year === league.year)) p.allNHL.push({ year: league.year, team, slot: [...rec.first, ...rec.second, ...rec.rookie].find((e) => String(e.pid) === String(pid))?.slot });
  }
  return [champ === league.userTid ? cupWinMoment(league, final) : null, awardsNightMoment(league)].filter(Boolean);
}

// Ring night: the home opener after your club won the Cup. Banner up, rings handed out.
export function ringNightMoment(league) {
  const h = league.history?.[0];
  if (!h || h.champion !== league.userTid || h.year !== league.year - 1) return null;
  const t = league.teams[league.userTid];
  // Who gets a ring: the Cup roster (the dynasty log keeps it), the ones still here first.
  const cupRoster = (league.celebrations || []).find((c) => c.year === h.year && c.tid === h.champion)?.roster?.map((r) => r.pid) || [];
  const here = t.roster.map((id) => league.players[id]).filter(Boolean);
  const names = (cupRoster.length ? here.filter((p) => cupRoster.includes(p.id)) : here).sort((a, b) => b.ovr - a.ovr).slice(0, 8).map((p) => p.name);
  const cf = h.cupFinal || {};
  return {
    kind: "ringNight", key: `rings-${h.year}`, tid: league.userTid, season: h.year, opp: h.runnerUp ?? null,
    wins: cf.wins ?? null, losses: cf.losses ?? null, us: cf.us ?? null, them: cf.them ?? null, ot: cf.ot ?? null,
    titles: titleMeaning(league, h.champion, h.year).titles, names,
    mvp: h.awards?.connSmythe?.tid === h.champion ? h.awards.connSmythe.name : null,
  };
}

// Opening night (called as the regular season starts): last season's All-Star gains, then ring night.
export function openingNight(league) {
  try {
    const rec = league.allNHL;
    if (rec && !rec.applied && rec.year < league.year) {
      const mine = applyAllStarGains(league, rec).filter((x) => x.tid === league.userTid && x.gain > 0);
      if (mine.length) (league.inbox ||= []).push({ year: league.year, day: league.day, text: `🏅 All-Star honours pay off: ${mine.map((x) => `${x.name} +${x.gain} OVR`).join(", ")}.` });
    }
    const m = ringNightMoment(league);
    if (m) queueMoment(league, m);
  } catch (e) {
    // Never block the season from starting.
    console.error("Opening night failed", e);
  }
}
