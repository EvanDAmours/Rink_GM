import { pulseAfterPlayoffDay } from "./clubPulse.js";
import {recordReport} from './matchReports.js';
// Stanley Cup Playoffs: 16 teams, four best-of-seven rounds, fixed bracket.
import { playoffPicture, compareTeams } from "./standings.js";
import { createGame, simToEnd, applyResult } from "./sim.js";
import { healInjuries } from "./roster.js";
import { allStarTeams, connSmythe } from "./awards.js";
import { queueMoment } from "./moments.js";
import { cupWinMoment, titleMeaning } from "./momentsCup.js";

const HOME_PATTERN = [true, true, false, false, true, false, true]; // 2-2-1-1-1 from the top seed's view

function series(league, round, a, b, conf) {
  // Higher regular-season finish gets home ice.
  const [top, bot] = compareTeams(league.teams[a], league.teams[b]) <= 0 ? [a, b] : [b, a];
  return { round, conf, top, bot, wTop: 0, wBot: 0, games: [], winner: null };
}

export function startPlayoffs(league) {
  const r1 = [];
  for (const conf of ["East", "West"]) {
    const pic = playoffPicture(league, conf);
    const [d1, d2] = pic.order;
    const w1 = pic.divs[d1][0];
    const w2 = pic.divs[d2][0];
    const [wc1, wc2] = pic.wildcards;
    // The better division winner faces the lower wild card.
    const d1Better = compareTeams(w1, w2) <= 0;
    const opp1 = d1Better ? wc2 : wc1;
    const opp2 = d1Better ? wc1 : wc2;
    r1.push(series(league, 0, w1.id, opp1.id, conf));
    r1.push(series(league, 0, pic.divs[d1][1].id, pic.divs[d1][2].id, conf));
    r1.push(series(league, 0, w2.id, opp2.id, conf));
    r1.push(series(league, 0, pic.divs[d2][1].id, pic.divs[d2][2].id, conf));
  }
  league.playoffs = { rounds: [r1], round: 0, champion: null, seeds: seedMap(league, r1) };
  // The regular season is over: the First and Second All-Star Teams and the All-Rookie Team are picked now.
  try { league.allNHL = allStarTeams(league); } catch (e) { console.error("All-Star teams failed", e); }
  for (const t of league.teams) t.playoffResult = null;
  for (const s of r1) {
    league.teams[s.top].playoffResult = "R1";
    league.teams[s.bot].playoffResult = "R1";
  }
  return league.playoffs;
}

function seedMap(league, r1) {
  const m = {};
  for (const s of r1) {
    m[s.top] = true;
    m[s.bot] = true;
  }
  return m;
}

export const ROUND_NAMES = ["First Round", "Second Round", "Conference Final", "Stanley Cup Final"];

export function currentRound(league) {
  const po = league.playoffs;
  return po ? po.rounds[po.round] : [];
}

export function seriesHome(s) {
  const gameNo = s.games.length;
  return HOME_PATTERN[gameNo] ? s.top : s.bot;
}

// Next unplayed game of a series, as { home, away }.
export function nextGame(league, s) {
  if (s.winner != null) return null;
  const home = seriesHome(s);
  const away = home === s.top ? s.bot : s.top;
  return { home, away };
}

export function recordSeriesGame(league, s, state, result) {
  if (state.seriesRecorded) return;
  state.seriesRecorded = true;
  if (state.h.tid === league.userTid || state.a.tid === league.userTid) recordReport(league,state,`po:${league.year}:${s.round}:${s.top}:${s.bot}:${s.games.length}`);
  const winnerTid = state.winner === "h" ? state.h.tid : state.a.tid;
  s.games.push({ h: state.h.tid, a: state.a.tid, hs: result.hs, as: result.as, ot: result.ot, stars: result.stars });
  if (winnerTid === s.top) s.wTop++;
  else s.wBot++;
  if (s.wTop === 4 || s.wBot === 4) {
    s.winner = s.wTop === 4 ? s.top : s.bot;
    const loser = s.winner === s.top ? s.bot : s.top;
    league.teams[loser].playoffResult = `Lost ${ROUND_NAMES[s.round]}`;
    const next = ["R2", "R3", "Final", "Champion"][s.round];
    league.teams[s.winner].playoffResult = next;
    seriesPaper(league, s);
    // Your club just won the Cup: the celebration plays before the paper (the paper waits for it).
    if (s.round === 3 && s.winner === league.userTid) {
      try { queueMoment(league, cupWinMoment(league, s)); } catch (e) { console.error("Cup moment failed", e); }
    }
  }
}

// Front page for a finished series: headline, story, series MVP and the road so
// far. Written for every series the user's club plays and for the Final.
export function seriesPaper(league, s) {
  const user = league.userTid;
  if (s.top !== user && s.bot !== user && s.round !== 3) return;
  const w = league.teams[s.winner], l = league.teams[s.winner === s.top ? s.bot : s.top];
  const wins = s.winner === s.top ? s.wTop : s.wBot, losses = s.winner === s.top ? s.wBot : s.wTop;
  // Series MVP: three-star points across the series for the winning club.
  const pts = {};
  for (const g of s.games) (g.stars || []).forEach((st, i) => { const pid = st.pid || st.id || st; const p = league.players[pid]; if (p && p.tid === w.id) pts[pid] = (pts[pid] || 0) + [3, 2, 1][i]; });
  let mvpId = Object.entries(pts).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!mvpId) mvpId = w.roster.map((id) => league.players[id]).filter(Boolean).sort((a, b) => (b.pstats?.pts || 0) - (a.pstats?.pts || 0))[0]?.id;
  const mvp = league.players[mvpId];
  const last = s.games[s.games.length - 1];
  const ot = last?.ot ? " in overtime" : "";
  const sweep = losses === 0, seven = losses === 3;
  const round = ROUND_NAMES[s.round];
  // The Final: the Conn Smythe winner leads the front page, and the headline is written from the result.
  const cup = s.round === 3 ? titleMeaning(league, w.id, league.year) : null;
  const cs = s.round === 3 ? connSmythe(league, w.id) : null;
  const csP = cs && league.players[cs.pid];
  const headline = cup ? cupHeadline(w, cup, { sweep, seven, ot: !!last?.ot }) : sweep ? `${w.name.toUpperCase()} SWEEP ${l.name.toUpperCase()}` : seven ? `${w.name.toUpperCase()} SURVIVE GAME SEVEN` : `${w.name.toUpperCase()} OUST ${l.name.toUpperCase()}`;
  const sub = `${w.city} takes the ${round} ${wins}-${losses}${ot}${mvp ? `, as ${mvp.name} is named series MVP` : ""}`;
  const story = [
    `${w.city.toUpperCase()} — The ${w.name} ${s.round === 3 ? "are Stanley Cup champions" : `are moving on`}. In front of a ${last && last.h === w.id ? "roaring home crowd" : "silenced building on the road"}, ${w.city} closed out the ${l.city} ${l.name} ${last ? `${Math.max(last.hs, last.as)}-${Math.min(last.hs, last.as)}` : ""}${ot} to take the series ${wins} games to ${losses}.`,
    mvp ? `${mvp.name}, the ${({C:'centre',LW:'left winger',RW:'right winger',LD:'defenceman',RD:'defenceman',G:'goaltender'})[mvp.pos] || mvp.pos}, ${isGoalieLike(mvp) ? `was the wall in goal, ${mvp.pstats?.w || wins} wins this spring` : `finished the series as the club's engine with ${mvp.pstats?.g || 0} goals and ${mvp.pstats?.a || 0} assists in the playoffs so far`}.` : "",
    cs ? `${String(cs.pid) === String(mvp?.id) ? "He" : cs.name} was voted the Conn Smythe Trophy winner as the most valuable player of the playoffs (${cs.why.replace(/ in the playoffs$/, "")}).` : "",
    cup ? `${cup.what} The parade is set for Tuesday.` : `Next up: the ${["Second Round", "Conference Final", "Stanley Cup Final"][s.round]}.`,
  ].filter(Boolean);
  (league.playoffs.papers ||= []).push({ id: `${league.year}:${s.round}:${s.top}:${s.bot}`, year: league.year, round: s.round, winner: w.id, loser: l.id, wins, losses, headline, sub, story, mvp: mvp ? { pid: mvp.id, name: mvp.name, pos: mvp.pos } : null, ...(cs ? { connSmythe: { pid: cs.pid, name: cs.name, pos: csP?.pos || null, why: cs.why } } : {}), ...(cup ? { titles: cup.titles } : {}), games: s.games.map((g) => ({ h: g.h, a: g.a, hs: g.hs, as: g.as, ot: g.ot })), seen: false });
}
const isGoalieLike = (p) => p.pos === "G";

// The Cup headline, from what the title means and how the Final went.
function cupHeadline(w, cup, { sweep, seven, ot }) {
  const N = w.name.toUpperCase();
  if (cup.titles === 1) return `${N} WIN THEIR FIRST STANLEY CUP`;
  if (cup.gap >= 25) return `${N} END ${cup.gap}-YEAR WAIT`;
  if (cup.streak >= 3) return `${["", "", "", "THREE", "FOUR", "FIVE"][cup.streak] || cup.streak} STRAIGHT FOR THE ${N}`;
  if (cup.streak === 2) return `${N} DO IT AGAIN`;
  if (seven) return `${N} WIN GAME 7 FOR THE CUP`;
  if (ot) return `${N} WIN THE CUP IN OVERTIME`;
  if (sweep) return `${N} SWEEP TO THE STANLEY CUP`;
  return `${N} WIN THE STANLEY CUP`;
}

// Play one game in every live series of the current round. `skip` lets the UI
// hold back the user's game for live play.
export function simPlayoffDay(league, { skipSeries = null } = {}) {
  const po = league.playoffs;
  if (!po || po.champion != null) return false;
  const round = po.rounds[po.round];
  // Everyone still alive heals a game's worth: teams playing today (the user's live game
  // included) and teams resting after winning their series early.
  const alive = new Set();
  for (const s of round) {
    if (s.winner == null || s === skipSeries) {
      alive.add(s.top);
      alive.add(s.bot);
    } else alive.add(s.winner);
  }
  for (const s of round) {
    if (s.winner != null || s === skipSeries) continue;
    const g = nextGame(league, s);
    const state = createGame(league, league.teams[g.home], league.teams[g.away], { playoff: true, userTid: league.userTid });
    simToEnd(state);
    const result = applyResult(league, state, { playoff: true });
    recordSeriesGame(league, s, state, result);
  }
  healInjuries(league, alive);
  advanceRoundIfDone(league);
  pulseAfterPlayoffDay(league);
  return true;
}

export function advanceRoundIfDone(league) {
  const po = league.playoffs;
  const round = po.rounds[po.round];
  if (round.some((s) => s.winner == null)) return false;
  if (po.round === 3) {
    po.champion = round[0].winner;
    return true;
  }
  const next = [];
  for (let i = 0; i < round.length; i += 2) {
    const a = round[i].winner;
    const b = round[i + 1].winner;
    const conf = po.round === 2 ? "Final" : round[i].conf;
    next.push(series(league, po.round + 1, a, b, conf));
  }
  po.rounds.push(next);
  po.round++;
  return true;
}

export function userSeries(league) {
  const round = currentRound(league);
  return round.find((s) => s.winner == null && (s.top === league.userTid || s.bot === league.userTid)) || null;
}
