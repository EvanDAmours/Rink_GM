// What's ahead before the puck drops: the opener, the points line, marquee dates and the
// toughest stretch of the schedule. Mirrors the football game's season-preview card.
import { teamRatings } from "./lines.js";
import { dayToDate } from "./schedule.js";

const fmt = (league, day) => dayToDate(league.year, day, league.scheduleStart);

export function seasonPreview(league) {
  const user = league.teams[league.userTid];
  const ratings = league.teams.map((t) => ({ tid: t.id, ovr: teamRatings(league, t).ovr }));
  const ranked = [...ratings].sort((a, b) => b.ovr - a.ovr);
  const rank = ranked.findIndex((r) => r.tid === user.id) + 1;
  const games = league.schedule.filter((g) => !g.played && (g.h === user.id || g.a === user.id)).sort((a, b) => a.day - b.day);
  if (!games.length) return null;
  const oppOf = (g) => league.teams[g.h === user.id ? g.a : g.h];
  const home = (g) => g.h === user.id;
  const opener = games[0];
  // Points line: the roster's rank across the league maps onto a wins band.
  const pts = Math.round((70 + ((32 - rank) / 31) * 48) * 2) / 2 + 0.5;
  const tier = rank <= 4 ? "a Cup favourite" : rank <= 10 ? "a contender" : rank <= 18 ? "in the playoff mix" : rank <= 26 ? "a long shot" : "a rebuilding club";
  // Marquee: the first visit from each rival, then the first meeting with the top-rated clubs.
  const rivals = user.rivals || [];
  const marquee = [];
  const seen = new Set();
  for (const g of games) { const o = oppOf(g); if (rivals.includes(o.id) && !seen.has(o.id)) { seen.add(o.id); marquee.push({ g, o, why: "rivalry" }); } if (marquee.length >= 2) break; }
  for (const r of ranked.slice(0, 3)) { if (r.tid === user.id || seen.has(r.tid)) continue; const g = games.find((x) => oppOf(x).id === r.tid); if (g) { seen.add(r.tid); marquee.push({ g, o: oppOf(g), why: `No. ${ranked.indexOf(r) + 1} roster` }); } if (marquee.length >= 4) break; }
  marquee.sort((a, b) => a.g.day - b.g.day);
  // Toughest stretch: the six-game window with the strongest opponents.
  const W = Math.min(6, games.length);
  let best = { i: 0, avg: -1 };
  for (let i = 0; i + W <= games.length; i++) {
    const avg = games.slice(i, i + W).reduce((s, g) => s + ratings[oppOf(g).id].ovr, 0) / W;
    if (avg > best.avg) best = { i, avg };
  }
  const stretch = games.slice(best.i, best.i + W);
  const goal = user.owner?.goal?.year === league.year ? user.owner.goal.label : null;
  return {
    year: league.year, team: user, rank, tier, pts, goal,
    opener: { day: opener.day, date: fmt(league, opener.day), home: home(opener), opp: oppOf(opener) },
    marquee: marquee.map(({ g, o, why }) => ({ day: g.day, date: fmt(league, g.day), home: home(g), opp: o, why })),
    stretch: { from: best.i + 1, to: best.i + W, start: fmt(league, stretch[0].day), end: fmt(league, stretch.at(-1).day), opps: [...new Set(stretch.map((g) => oppOf(g).abbr))], avg: Math.round(best.avg) },
    gp: games.length,
  };
}

// Results by week for the season rail: a chip is green when a week was winning, red when losing.
export function weekResults(league) {
  const user = league.userTid, out = {};
  for (const g of league.schedule) {
    if (!g.played || (g.h !== user && g.a !== user)) continue;
    const w = Math.floor(g.day / 7) + 1, r = (out[w] ||= { w: 0, l: 0, otl: 0, games: [] });
    const mine = g.h === user ? g.hs : g.as, theirs = g.h === user ? g.as : g.hs, opp = league.teams[g.h === user ? g.a : g.h]?.abbr;
    const won = mine > theirs;
    if (won) r.w++; else if (g.ot) r.otl++; else r.l++;
    r.games.push(`${won ? "W" : g.ot ? "OTL" : "L"} ${mine}-${theirs} ${g.h === user ? "vs" : "@"} ${opp}`);
  }
  return out;
}
