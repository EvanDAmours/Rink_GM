// All-Star Weekend: rosters by division revealed in late January, a skills
// competition on Saturday and a 3-on-3 tournament on Sunday. Exhibition only:
// nothing here touches standings, statistics, injuries or ratings.
import { seed, snapshotRng, restoreRng, stream } from "./rng.js";
import { isGoalie, isDefense } from "./constants.js";
import { createGame, simToEnd, blankRecord } from "./sim.js";
import { autoLines } from "./lines.js";
import { DIVISIONS } from "./teams.js";
import { allStarPaper } from "./papers.js";
import { logTx } from "./roster.js";

const calendarDate = (lg) => new Date(Date.parse((lg.scheduleStart || `${lg.year}-09-29`) + "T12:00:00Z") + lg.day * 86400000);
// Due on the first simulated day on or after February 1, before the deadline.
export const allStarDue = (lg) => lg.phase === "regular" && lg.allStar?.year !== lg.year && calendarDate(lg).getTime() >= Date.UTC(lg.year + 1, 1, 1) && lg.day < lg.deadlineDay;

export function allStarRosters(lg) {
  const divs = Object.values(DIVISIONS).flat();
  const value = (p) => p.ovr * 0.6 + (isGoalie(p.pos) ? (p.stats.w || 0) * 0.8 + (p.stats.so || 0) * 2 : (p.stats.pts || 0) * 0.55);
  return divs.map((division) => {
    const pool = Object.values(lg.players).filter((p) => p.tid >= 0 && lg.teams[p.tid]?.div === division && lg.teams[p.tid].roster.includes(p.id) && !p.injury && !p.ltir).sort((a, b) => value(b) - value(a));
    const picked = [];
    const need = { F: 6, D: 3, G: 2 };
    const grp = (p) => (isGoalie(p.pos) ? "G" : isDefense(p.pos) ? "D" : "F");
    const perTeam = {};
    for (const pass of [1, 2]) for (const p of pool) {
      if (picked.includes(p)) continue;
      const g = grp(p);
      if (need[g] <= 0) continue;
      // Every club gets a representative first; stars fill the rest.
      if (pass === 1 && perTeam[p.tid]) continue;
      picked.push(p); need[g]--; perTeam[p.tid] = (perTeam[p.tid] || 0) + 1;
    }
    const captain = picked.filter((p) => !isGoalie(p.pos)).sort((a, b) => (b.stats.pts || 0) - (a.stats.pts || 0))[0];
    return { division, players: picked.map((p) => ({ pid: p.id, name: p.name, pos: p.pos, tid: p.tid, abbr: lg.teams[p.tid].abbr, ovr: p.ovr, captain: p === captain })) };
  });
}

function skillsCompetition(lg, rosters, r) {
  const all = rosters.flatMap((rr) => rr.players.map((x) => lg.players[x.pid]).filter(Boolean));
  const sk = all.filter((p) => !isGoalie(p.pos)), gs = all.filter((p) => isGoalie(p.pos));
  const pick = (list, f) => list.map((p) => ({ p, v: f(p) + r.next() * 6 })).sort((a, b) => b.v - a.v)[0];
  const who = (p) => ({ pid: p.id, name: p.name, abbr: lg.teams[p.tid].abbr, tid: p.tid });
  const fastest = pick(sk, (p) => (p.attrs.spd || 70) * 0.7 + (p.attrs.acc || 70) * 0.3);
  const hardest = pick(sk, (p) => (p.attrs.spw || 70) * 0.8 + (p.attrs.str || 70) * 0.2);
  const accuracy = pick(sk, (p) => (p.attrs.wac || 70) * 0.6 + (p.attrs.sac || 70) * 0.4);
  const stick = pick(sk, (p) => (p.attrs.dek || 70) * 0.6 + (p.attrs.puc || 70) * 0.4);
  const goalie = gs.length ? pick(gs, (p) => p.ovr) : null;
  const lapTime = (v) => (13.9 - (v - 85) * 0.035).toFixed(3);
  return [
    { key: "fastest", label: "Fastest Skater", winner: who(fastest.p), result: `${lapTime(fastest.v)} s` },
    { key: "hardest", label: "Hardest Shot", winner: who(hardest.p), result: `${(96 + (hardest.v - 88) * 0.45).toFixed(1)} mph` },
    { key: "accuracy", label: "Accuracy Shooting", winner: who(accuracy.p), result: `4 targets in ${(7.2 - (accuracy.v - 85) * 0.08).toFixed(2)} s` },
    { key: "stick", label: "Stickhandling", winner: who(stick.p), result: `${(23.5 - (stick.v - 85) * 0.1).toFixed(2)} s` },
    ...(goalie ? [{ key: "saves", label: "Save Streak", winner: who(goalie.p), result: `${Math.round(8 + (goalie.v - 80) * 0.35)} straight saves` }] : []),
  ];
}

export function allStarWeekend(lg) {
  if (lg.phase !== "regular" || lg.allStar?.year === lg.year) return null;
  const rng = snapshotRng();
  try {
    seed(lg.year * 100 + 7);
    const r = stream(`${lg.year}|allstar`);
    const rosters = allStarRosters(lg);
    const host = [...lg.teams].sort((a, b) => stream(`${lg.year}|ashost|${a.id}`).next() - stream(`${lg.year}|ashost|${b.id}`).next())[0];
    const skills = skillsCompetition(lg, rosters, r);
    const copy = { year: lg.year, day: 0, settings: lg.settings, players: {}, teams: [], inbox: [], transactions: [] };
    rosters.forEach((rr, id) => {
      const t = { id, abbr: rr.division.slice(0, 3).toUpperCase(), city: rr.division, name: "All-Stars", div: rr.division, roster: [], prospects: [], lines: null, rec: blankRecord(), colors: ["#1e293b", "#fbbf24"], uniform: { style: 0, home: true } };
      for (const x of rr.players) { const p = structuredClone(lg.players[x.pid]); p.tid = id; p.injury = 0; delete p.ltir; copy.players[p.id] = p; t.roster.push(p.id); }
      copy.teams.push(t); autoLines(copy, t);
    });
    const play = (i, j, label) => {
      const s = createGame(copy, copy.teams[i], copy.teams[j], { exhibition: true, threeOnThree: true }); simToEnd(s);
      const stars = Object.entries(s.box || {}).map(([pid, b]) => ({ pid, pts: (b.g || 0) * 1.5 + (b.a || 0) })).sort((a, b) => b.pts - a.pts);
      return { label, h: copy.teams[i].city, a: copy.teams[j].city, hs: s.score.h, as: s.score.a, winner: s.score.h > s.score.a ? i : j, top: stars[0] };
    };
    const semi1 = play(0, 1, "Semifinal 1"), semi2 = play(2, 3, "Semifinal 2");
    const final = play(semi1.winner, semi2.winner, "Final");
    const games = [semi1, semi2, final];
    const winner = copy.teams[final.winner].city;
    const mvpPid = final.top?.pid || null;
    const mvp = mvpPid && lg.players[mvpPid] ? { pid: mvpPid, name: lg.players[mvpPid].name, tid: lg.players[mvpPid].tid } : null;
    const resume = new Date(calendarDate(lg).getTime() + 2 * 86400000).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
    const ev = { kind: "allstar", year: lg.year, day: lg.day, host: `${host.city}`, hostTid: host.id, rosters, skills, games, winner, mvp, resumeText: resume };
    lg.allStar = ev;
    (lg.showcases ||= []).unshift({ kind: "allstar", year: lg.year, winner, table: copy.teams.map((t) => ({ country: t.city, tid: t.id, w: games.filter((g) => g.winner === t.id).length, gf: 0, ga: 0 })), results: games.map((g) => ({ h: g.h, a: g.a, hs: g.hs, as: g.as })), rosters: rosters.map((rr) => ({ country: rr.division, players: rr.players.map((p) => ({ pid: p.pid, name: p.name, fictional: false })) })) });
    const user = lg.teams[lg.userTid];
    const mine = rosters.flatMap((rr) => rr.players.filter((p) => p.tid === user.id));
    lg.news ||= [];
    lg.news.unshift({ year: lg.year, day: lg.day, type: "allstar", pid: mvp?.pid, text: `All-Star Weekend in ${host.city}: the ${winner} division win the 3-on-3 tournament${mvp ? `, ${mvp.name} is MVP` : ""}. ${skills[0].winner.name} is the fastest skater, ${skills[1].winner.name} has the hardest shot.` });
    lg.inbox?.push({ year: lg.year, day: lg.day, text: mine.length ? `⭐ ${mine.map((p) => p.name).join(", ")} represented ${user.city} at All-Star Weekend.` : `⭐ All-Star Weekend came and went without a ${user.name} player on the rosters.` });
    logTx(lg, `All-Star Weekend in ${host.city}: ${winner} division win the tournament`);
    allStarPaper(lg, ev);
    return ev;
  } finally { restoreRng(rng); }
}
