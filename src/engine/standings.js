// Standings, NHL tiebreakers and the divisional/wild-card playoff format.
import { DIVISIONS } from "./teams.js";

const ptsPct = (t) => (t.rec.gp ? t.rec.pts / (2 * t.rec.gp) : 0);

export function compareTeams(a, b) {
  return (
    b.rec.pts - a.rec.pts ||
    ptsPct(b) - ptsPct(a) ||
    b.rec.rw - a.rec.rw ||
    b.rec.row - a.rec.row ||
    b.rec.w - a.rec.w ||
    b.rec.gf - b.rec.ga - (a.rec.gf - a.rec.ga) ||
    b.rec.gf - a.rec.gf ||
    a.id - b.id
  );
}

export function divisionTable(league, div) {
  return league.teams.filter((t) => t.div === div).sort(compareTeams);
}

export function conferenceTable(league, conf) {
  return league.teams.filter((t) => t.conf === conf).sort(compareTeams);
}

export function leagueTable(league) {
  return [...league.teams].sort(compareTeams);
}

// Top three in each division plus two wild cards per conference.
export function playoffPicture(league, conf) {
  const [d1, d2] = DIVISIONS[conf];
  const A = divisionTable(league, d1);
  const B = divisionTable(league, d2);
  const top = new Set([...A.slice(0, 3), ...B.slice(0, 3)].map((t) => t.id));
  const wc = conferenceTable(league, conf).filter((t) => !top.has(t.id));
  return { divs: { [d1]: A.slice(0, 3), [d2]: B.slice(0, 3) }, wildcards: wc.slice(0, 2), out: wc.slice(2), order: [d1, d2] };
}

export function playoffTeams(league) {
  const ids = new Set();
  for (const conf of ["East", "West"]) {
    const pic = playoffPicture(league, conf);
    for (const d of pic.order) pic.divs[d].forEach((t) => ids.add(t.id));
    pic.wildcards.forEach((t) => ids.add(t.id));
  }
  return ids;
}

// ---------- Clinching (Gridiron 3.0 / 3.2) ----------
// Worked out the safe way, as Gridiron's clinch.js does: a spot is locked only when nothing the
// remaining games could do takes it away. Points: 2 for a win, 1 for an overtime or shootout loss.
// A rival "can pass" you if, winning out, it could finish above you (ahead on points, or level on
// points while a tiebreaker could still go its way). It is "surely above" you if it stays ahead
// even when you win out. Rivals are treated one at a time (head-to-head games are ignored), so a
// clinch can come a day or two later than the NHL would announce it, but never too early. Once
// every game is played the marks follow the final table and its tiebreakers exactly.

// Regular-season games each club still has to play.
export function gamesLeft(league) {
  const left = {};
  for (const t of league.teams) left[t.id] = 0;
  for (const g of league.schedule || []) {
    if (g.played) continue;
    if (g.h in left) left[g.h]++;
    if (g.a in left) left[g.a]++;
  }
  return left;
}

// { [tid]: { berth, div, conf, pres, out } }: a playoff spot (top three in the division or one of
// the conference's two wild cards), first in the division, first in the conference, first in the
// league (the Presidents' Trophy), and out of the playoffs.
export function clinchState(league) {
  const left = gamesLeft(league);
  const teams = league.teams;
  const pts = (t) => t.rec?.pts || 0;
  const max = (t) => pts(t) + 2 * (left[t.id] || 0);
  const done = (a, b) => !left[a.id] && !left[b.id];
  const canPass = (r, me) => max(r) > pts(me) || (max(r) === pts(me) && !(done(r, me) && compareTeams(me, r) < 0));
  const surelyAbove = (r, me) => pts(r) > max(me) || (pts(r) === max(me) && done(r, me) && compareTeams(r, me) < 0);
  const out = {};
  for (const me of teams) {
    const rivals = teams.filter((t) => t.id !== me.id);
    const conf = rivals.filter((t) => t.conf === me.conf);
    const div = conf.filter((t) => t.div === me.div);
    const other = conf.filter((t) => t.div !== me.div);
    // Worst case: every club that can pass you does. Top three in the division is in; past that,
    // a wild card is yours while at most one non-top-three club could finish above you.
    const dT = div.filter((r) => canPass(r, me)).length;
    const oT = other.filter((r) => canPass(r, me)).length;
    // Best case: only the clubs surely above you are. Three of them in your division and two more
    // non-top-three clubs ahead in the conference leaves no spot.
    const dS = div.filter((r) => surelyAbove(r, me)).length;
    const oS = other.filter((r) => surelyAbove(r, me)).length;
    out[me.id] = {
      berth: dT <= 2 || dT - 3 + Math.max(0, oT - 3) <= 1,
      div: dT === 0,
      conf: dT === 0 && oT === 0,
      pres: rivals.every((r) => !canPass(r, me)),
      out: dS >= 3 && dS - 3 + Math.max(0, oS - 3) >= 2,
    };
  }
  return out;
}

// The NHL's letters: p Presidents' Trophy, z first in the conference, y the division, x a playoff
// spot, e eliminated. The biggest one shows.
export const CLINCH_MARKS = [
  ["p", "Presidents' Trophy"],
  ["z", "Clinched the conference"],
  ["y", "Clinched the division"],
  ["x", "Clinched a playoff spot"],
  ["e", "Eliminated"],
];
export function clinchMark(st) {
  if (!st) return null;
  return st.pres ? "p" : st.conf ? "z" : st.div ? "y" : st.berth ? "x" : st.out ? "e" : null;
}

// Marks for every club: { [tid]: "p" | "z" | "y" | "x" | "e" }. Nothing before a game is played.
export function clinchStatus(league) {
  const status = {};
  if (!league.teams.some((t) => t.rec?.gp)) return status;
  const st = clinchState(league);
  for (const t of league.teams) {
    const m = clinchMark(st[t.id]);
    if (m) status[t.id] = m;
  }
  return status;
}
