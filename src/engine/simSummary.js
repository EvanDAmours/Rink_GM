// A quick-sim recap: what happened to your club between "Sim" and now. The
// snapshot is taken before the run; the summary compares the league against it.
import { leagueTable, conferenceTable, divisionTable } from "./standings.js";
import { isGoalie } from "./constants.js";
import { careerMilestones } from "./records.js";

const rank = (list, tid) => list.findIndex((t) => t.id === tid) + 1;
export function snapshotForSummary(league) {
  const t = league.teams[league.userTid];
  const pts = {};
  for (const id of [...t.roster, ...t.prospects]) { const p = league.players[id]; if (p) pts[id] = { pts: p.stats.pts || 0, g: p.stats.g || 0, w: p.stats.w || 0, so: p.stats.so || 0, gp: p.stats.gp || 0, injury: p.injury > 0 || !!p.ltir, miles: careerMilestones(p).length }; }
  return { year: league.year, day: league.day, phase: league.phase, rec: { ...t.rec }, league: rank(leagueTable(league), t.id), conf: rank(conferenceTable(league, t.conf), t.id), div: rank(divisionTable(league, t.div), t.id), pts, inbox: league.inbox?.length || 0, news: league.news?.length || 0, tx: league.transactions?.length || 0 };
}
export function buildSummary(league, snap) {
  if (!snap || snap.year !== league.year) return null;
  const t = league.teams[league.userTid];
  const r = t.rec, o = snap.rec;
  const span = { gp: r.gp - o.gp, w: r.w - o.w, l: r.l - o.l, otl: r.otl - o.otl, gf: r.gf - o.gf, ga: r.ga - o.ga, pts: r.pts - o.pts };
  if (span.gp <= 0 && league.day === snap.day) return null;
  const games = league.schedule.filter((g) => g.played && g.day >= snap.day && g.day < league.day && (g.h === t.id || g.a === t.id)).map((g) => {
    const home = g.h === t.id, us = home ? g.hs : g.as, them = home ? g.as : g.hs, opp = league.teams[home ? g.a : g.h];
    return { day: g.day, home, opp: opp.abbr, oppTid: opp.id, us, them, ot: g.ot, result: us > them ? "W" : g.ot ? "OTL" : "L" };
  });
  const now = { league: rank(leagueTable(league), t.id), conf: rank(conferenceTable(league, t.conf), t.id), div: rank(divisionTable(league, t.div), t.id) };
  const movement = { league: snap.league - now.league, conf: snap.conf - now.conf, div: snap.div - now.div };
  const roster = [...t.roster, ...t.prospects].map((id) => league.players[id]).filter(Boolean);
  const perf = roster.filter((p) => snap.pts[p.id]).map((p) => { const b = snap.pts[p.id]; return { p, pts: (p.stats.pts || 0) - b.pts, g: (p.stats.g || 0) - b.g, w: (p.stats.w || 0) - b.w, so: (p.stats.so || 0) - b.so, gp: (p.stats.gp || 0) - b.gp }; });
  const topSkaters = perf.filter((x) => !isGoalie(x.p.pos) && x.gp > 0).sort((a, b) => b.pts - a.pts || b.g - a.g).slice(0, 3);
  const topGoalie = perf.filter((x) => isGoalie(x.p.pos) && x.gp > 0).sort((a, b) => b.w - a.w)[0] || null;
  const newInjuries = roster.filter((p) => (p.injury > 0 || p.ltir) && snap.pts[p.id] && !snap.pts[p.id].injury).map((p) => ({ pid: p.id, name: p.name, pos: p.pos, ovr: p.ovr, games: p.injury, note: p.injuryNote }));
  const returned = roster.filter((p) => !(p.injury > 0 || p.ltir) && snap.pts[p.id]?.injury).map((p) => ({ pid: p.id, name: p.name, pos: p.pos, ovr: p.ovr }));
  const milestones = roster.filter((p) => snap.pts[p.id] && careerMilestones(p).length > snap.pts[p.id].miles).map((p) => ({ pid: p.id, name: p.name, label: careerMilestones(p).at(-1)?.label }));
  const coachNotes = (league.inbox || []).slice(snap.inbox).filter((m) => /👔/.test(m.text)).length;
  const headlines = (league.news || []).slice(0, Math.max(0, (league.news?.length || 0) - snap.news)).filter((n) => ["cup", "award", "milestone", "coach", "allstar"].includes(n.type)).slice(0, 4);
  const myTx = (league.transactions || []).slice(0, Math.max(0, (league.transactions?.length || 0) - snap.tx)).filter((x) => x.tids?.includes(t.id) && !/waiver/i.test(x.text)).slice(0, 5);
  const next = league.schedule.filter((g) => !g.played && (g.h === t.id || g.a === t.id)).sort((a, b) => a.day - b.day)[0];
  return { from: snap.day, to: league.day, span, games, now, before: { league: snap.league, conf: snap.conf, div: snap.div }, movement, streak: r.streak, last10: r.last10, topSkaters, topGoalie, newInjuries, returned, milestones, coachNotes, headlines, myTx, next: next ? { day: next.day, home: next.h === t.id, opp: league.teams[next.h === t.id ? next.a : next.h] } : null, phase: league.phase, ended: league.phase !== "regular" || league.schedule.every((g) => g.played) };
}
