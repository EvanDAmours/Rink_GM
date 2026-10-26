import {releasePlayer} from './roster.js';
import {teamNeeds,orgDepth,roleNeeds,roleFit} from './teamPlanning.js';
// Entry draft: prospect classes, the two-draw lottery, and AI picks. Scouting lives in
// scouting.js.
//
// Exports other screens and agents rely on (names are stable):
//   generateDraftClass(league, year)   a new class: Central Scouting's board, then the hidden gems
//                                      and red flags (scouting.plantHiddenTalent), which the board
//                                      never sees
//   projectedDraftOrder(league)        THE draft order (Gridiron 2.69), used by pick labels, the
//                                      mock draft, Scouting HQ, the checkpoints, the weekly paper and
//                                      trade values: the live draft's first round once the order is
//                                      set; in season non-playoff and playoff clubs by points
//                                      percentage (worst first); during the playoffs clubs out of them
//                                      first, then playoff clubs by the round they went out in, the
//                                      champion last; before any game last draft's order (or null)
//   pickSlot(league, pk) / pickLabel   where a pick falls ({ overall, projected })
//   myDraftSlots(league, tid?)         a club's remaining picks in the coming (or running) draft as
//                                      overall numbers, earliest first
//   aiChoose(league, tid)              an AI club's pick: the public read (blind to gems and red
//                                      flags) blended with Central Scouting, org depth by position
//                                      (roster + prospects), the NHL positional-value curve, team
//                                      needs (teamPlanning.teamNeeds) and role needs
//   aiPickScore(league, tid, p, ctx?)  the score behind aiChoose, for draft-day explanations
//   makePick(league, pid)              records the pick; your own picks get their draft-day POT
//                                      read (scouting.tagDraftee) for the scouting-miss reveals
//   visibleRatings(lg, p)              what the user sees: other clubs' prospects fail closed to the
//                                      public read; your own unrevealed draftees show POT as "~84"
//                                      (potEst: true) until the reveal checkpoints
import {seedDraftIdentities,resolveProtections} from "./draftExpansion.js";
import { gauss, clamp, rand, randInt, chance, weighted } from "./rng.js";
import { generatePlayer } from "./players.js";
import { DRAFT_ROUNDS, isGoalie, isDefense, isForward, MAX_PROSPECTS } from "./constants.js";
import { compareTeams } from "./standings.js";
import { defaultArchetype } from "./ratings.js";
import { rollDev } from "./players.js";
import { rankClass, csRank, csScore, pickGrade, openDraftFloor, plantHiddenTalent, publicPot, prospectRead, tagDraftee, believedPot } from "./scouting.js";

const CLASS_SIZE = 280; // Seven rounds, plus an undrafted pool.
const POS_MIX = [["C", 25], ["LW", 17], ["RW", 17], ["LD", 14], ["RD", 14], ["G", 8]];
const LOTTERY_ODDS = [18.5, 13.5, 11.5, 9.5, 8.5, 7.5, 6.5, 6.0, 5.0, 3.5, 3.0, 2.5, 2.0, 1.5, 0.5, 0.5];

function randomPos() {
  return weighted(POS_MIX, (x) => x[1])[0];
}

export function generateDraftClass(league, draftYear) {
  const ids = [];
  for (let i = 0; i < CLASS_SIZE; i++) {
    const pos = randomPos();
    const tier = i / CLASS_SIZE;
    let pot = Math.round(clamp(93 - 21 * Math.sqrt(tier) + gauss(0, 2.5), 60, 97));
    if (i === 0 && chance(0.35)) pot = Math.max(pot, 95);
    const age = chance(0.8) ? 18 : 19;
    const gap = i < 6 ? randInt(9, 15) : randInt(13, 24);
    const ovr = clamp(pot - gap + (age - 18) * 2, 45, 82);
    const p = generatePlayer(pos, ovr, age, league.year, { type: defaultArchetype(pos), src: "draft" });
    p.pot = Math.max(pot, p.ovr);
    p.tid = -2;
    p.signed = false;
    p.rookie = true;
    p.consensus = gauss(0, 3);
    p.dev = rollDev(p.id, p.pot);
    // The public, consensus read used wherever a prospect you never scouted shows up later.
    p.scout = { lvl: 0, base: estimate(p, 4, 5) };
    league.players[p.id] = p;
    ids.push(p.id);
  }
  league.draftClass = ids;
  league.draftClassYear = draftYear;
  rankClass(league, ids);
  seedDraftIdentities(league,ids,draftYear);
  // After the board is set (seedDraftIdentities re-ranks), so Central Scouting never sees them.
  plantHiddenTalent(league, ids, draftYear);
  return ids;
}

// A noisy read on a prospect: never wildly off, and the ceiling it reports is never
// below how good the player is today.
function estimate(p, sdOvr, sdPot) {
  const eOvr = Math.round(p.ovr + clamp(gauss(0, sdOvr), -1.8 * sdOvr, 1.8 * sdOvr));
  const ePot = Math.max(eOvr + 1, Math.round(p.pot + clamp(gauss(0, sdPot), -1.8 * sdPot, 1.8 * sdPot)));
  return { eOvr, ePot };
}

// Ratings the user sees for a prospect someone else owns (or hasn't drafted yet): your
// latest scouting report if there is one, otherwise the consensus read.
export function shownRatings(p) {
  const s = p.scout;
  if (!s) return {ovr:"??",pot:"??",exact:false};
  if (s.lvl > 0 && s.eOvr != null) return { ovr: s.eOvr, pot: s.ePot, exact: !!s.exact };
  const b = s.base || s;
  return { ovr: b.eOvr ?? "??", pot: b.ePot ?? "??", exact: false };
}

export function createDraftPicks(league, year) {
  for (const t of league.teams) {
    for (let r = 1; r <= DRAFT_ROUNDS; r++) {
      const id = `${year}-${r}-${t.id}`;
      if (!league.draftPicks.some((p) => p.year === year && p.round === r && p.orig === t.id)) league.draftPicks.push({ id, year, round: r, orig: t.id, owner: t.id });
    }
  }
}

// "2027 R2 (#55)": the year and round, plus the overall slot where it's known. Picks in a
// running draft use the real slot; picks in the coming draft use the projected order from
// the standings; later years have no slot yet. Another club's pick names the club:
// "2027 R1 (BOS #3)".
export function pickLabel(league, pk) {
  if (!pk) return "";
  const orig = league.teams[pk.orig];
  const via = pk.owner !== pk.orig && orig ? orig.abbr : "";
  const slot = pickSlot(league, pk);
  const tag = [via, slot ? `#${slot.overall}` : ""].filter(Boolean).join(" ");
  return `${pk.year} R${pk.round}${tag ? ` (${tag})` : ""}`;
}

// Where a pick falls overall: { overall, projected } or null when it can't be known yet.
export function pickSlot(league, pk) {
  if (!pk) return null;
  const d = league.draft;
  if (d?.year === pk.year && Array.isArray(d.slots)) {
    const s = d.slots.find((x) => x.round === pk.round && x.orig === pk.orig);
    return s ? { overall: s.overall, projected: false } : null;
  }
  if (pk.year !== league.year + 1) return null;
  const order = projectedDraftOrder(league);
  const i = order ? order.indexOf(pk.orig) : -1;
  return i < 0 ? null : { overall: (pk.round - 1) * order.length + i + 1, projected: true };
}

// The coming draft's order as the standings stand (no lottery): clubs out of the playoffs
// by points percentage, lowest first (clubs have played different numbers of games during
// the season), then playoff clubs by the round they went out in, the champion last. Once
// the draft order is set, its first round. Null before anyone has played.
export function projectedDraftOrder(league) {
  if (league.draft?.year === league.year + 1) return league.draft.slots.filter((s) => s.round === 1).map((s) => s.orig);
  if (!league.teams.some((t) => (t.rec?.gp || 0) > 0)) {
    // Before a game is played: last draft's order (last season's standings), as the football game does.
    const last = (league.draftHistory || []).find((d) => d.year === league.year);
    const r1 = last ? last.picks.filter((s) => s.round === 1).map((s) => s.orig) : [];
    return r1.length === league.teams.length && new Set(r1).size === r1.length ? r1 : null;
  }
  const { nonPlayoff, playoff } = standingsGroups(league);
  const pct = (t) => t.rec.pts / Math.max(1, t.rec.gp) || 0;
  const worstFirst = nonPlayoff.map((id) => league.teams[id]).sort((a, b) => pct(a) - pct(b) || -compareTeams(a, b)).map((t) => t.id);
  return [...worstFirst, ...playoff];
}

// A club's remaining picks in the coming draft (or the running one) as overall numbers, earliest
// first: real slots once the order is set, projected ones before (projectedDraftOrder).
export function myDraftSlots(league, tid = league.userTid) {
  const d = league.draft;
  if (d && Array.isArray(d.slots) && d.year === league.year + 1) return d.slots.filter((s) => s.owner === tid && !s.pid).map((s) => s.overall).sort((a, b) => a - b);
  const year = league.year + 1;
  return league.draftPicks.filter((pk) => pk.year === year && pk.owner === tid).map((pk) => pickSlot(league, pk)?.overall).filter(Boolean).sort((a, b) => a - b);
}

// Clubs out of the playoffs, fewest points first; playoff clubs by how far they went.
function standingsGroups(league) {
  const po = league.playoffs;
  const playoffIds = new Set();
  if (po) for (const s of po.rounds[0]) { playoffIds.add(s.top); playoffIds.add(s.bot); }
  const nonPlayoff = league.teams.filter((t) => !playoffIds.has(t.id)).sort((a, b) => -compareTeams(a, b));
  const exitRound = (tid) => {
    if (po.champion === tid) return 5;
    for (let r = po.rounds.length - 1; r >= 0; r--) {
      for (const s of po.rounds[r]) if ((s.top === tid || s.bot === tid) && s.winner != null) return s.winner === tid ? r + 1 : r;
    }
    return 0;
  };
  const playoff = league.teams
    .filter((t) => playoffIds.has(t.id))
    .sort((a, b) => exitRound(a.id) - exitRound(b.id) || -compareTeams(a, b));
  return { nonPlayoff: nonPlayoff.map((t) => t.id), playoff: playoff.map((t) => t.id) };
}

// Non-playoff teams by fewest points, lottery-adjusted; then playoff teams by
// how far they went (Cup winner picks last).
export function draftOrder(league) {
  const { nonPlayoff, playoff } = standingsGroups(league);
  const lottery = runLottery(nonPlayoff);
  return { order: [...lottery.order, ...playoff], lottery };
}

function runLottery(ids) {
  const order = [...ids];
  const odds = LOTTERY_ODDS.slice(0, ids.length);
  const winners = [];
  const draws = [];
  for (let draw = 0; draw < 2 && order.length > 1; draw++) {
    const eligible = ids.map((id, i) => ({ id, w: odds[i] ?? 0 })).filter((x) => !winners.includes(x.id));
    const won = weighted(eligible, (x) => x.w).id;
    winners.push(won);
    const from = order.indexOf(won);
    const to = Math.max(draw, from - 10);
    order.splice(from, 1);
    order.splice(to, 0, won);
    draws.push({ id: won, from: ids.indexOf(won) + 1, to: to + 1 });
  }
  return { order, draws, preLottery: ids };
}

export function startDraft(league) {
  const year = league.year + 1;
  const { order, lottery } = draftOrder(league);
  resolveProtections(league,order,year);
  const slots = [];
  let overall = 1;
  for (let r = 1; r <= DRAFT_ROUNDS; r++) {
    for (const tid of order) {
      const pk = league.draftPicks.find((p) => p.year === year && p.round === r && p.orig === tid);
      slots.push({ round: r, overall: overall++, orig: tid, owner: pk ? pk.owner : tid, pid: null });
    }
  }
  league.draft = { year, slots, idx: 0, lottery };
  return league.draft;
}

// AI teams blend their own scouts' (noisy) read with Central Scouting's rankings, so they
// mostly follow the board and the sleepers your scouts find can still be there. Their read is the
// public one: blind to hidden gems and red flags. On top of the board they weigh (Gridiron 1.999):
//  - the NHL positional-value curve: centres and right-shot defensemen go a little early, goalies
//    rarely in round 1 (they take years and miss often), wingers at their board slot;
//  - organizational depth (roster + prospects): a young starting goalie with a goalie prospect
//    behind him means no early goalie; a deep pipeline at a position counts it down;
//  - team needs (teamPlanning.teamNeeds, the one needs model) and role holes in the lineup.
const DEV_EYE = { generational: 1.8, superstar: 1.2, star: 0.6, late: -0.3 };
const POS_VALUE = { C: [0.8, 0.5, 0.2], RD: [0.5, 0.3, 0.1], LD: [0.2, 0.1, 0], LW: [0, 0, 0], RW: [0, 0, 0], G: [-3, -1.5, -0.4] };
export function aiPickContext(league, tid) {
  const t = league.teams[tid];
  const round = currentSlot(league)?.round ?? 1;
  return { round, needs: Object.fromEntries(teamNeeds(league, t).map((n) => [n.pos, n.score])), depth: orgDepth(league, t), roles: roleNeeds(league, t) };
}
export function aiPickScore(league, tid, p, ctx = aiPickContext(league, tid), noise = 0) {
  const own = (publicPot(p) + (p.consensus || 0)) * 0.78 + p.ovr * 0.22 + (p.gem || p.bust ? 0 : DEV_EYE[p.dev] || 0);
  const base = own * 0.5 + csScore(p) * 0.5;
  const ri = Math.min(2, ctx.round - 1);
  const dep = ctx.depth[p.pos] || {};
  let adj = (POS_VALUE[p.pos] || [0, 0, 0])[ri];
  if (dep.locked && ctx.round <= 3) adj -= 4;
  if ((dep.pipeline || 0) >= 3) adj -= 0.8;
  else if ((dep.nhl || 0) + (dep.pipeline || 0) <= 1 && !isGoalie(p.pos)) adj += 0.5;
  adj += ((ctx.needs[p.pos] || 0) / 100) * 1.6;
  adj += roleFit(p, ctx.roles) * 1.0;
  return base + adj + noise;
}
export function aiChoose(league, tid) {
  const avail = league.draftClass.filter((id) => league.players[id]?.tid === -2);
  const ctx = aiPickContext(league, tid);
  let best = null;
  let bestScore = -Infinity;
  for (const id of avail) {
    const score = aiPickScore(league, tid, league.players[id], ctx, gauss(0, 1.2));
    if (score > bestScore) { bestScore = score; best = id; }
  }
  return best;
}

export function makePick(league, pid) {
  const d = league.draft;
  const slot = d.slots[d.idx];
  const p = league.players[pid];
  if (!slot || !p || p.tid !== -2) return false;
  openDraftFloor(league);
  // Your pick: what your scouts believed on draft day (the truth comes out over two seasons).
  const read = slot.owner === league.userTid ? prospectRead(league, p) : null;
  slot.pid = pid;
  slot.csr = csRank(p);
  slot.grade = pickGrade(slot.overall, slot.csr);
  p.tid = slot.owner;
  p.draft = { year: d.year, round: slot.round, pick: slot.overall, tid: slot.owner };
  p.yrs = 0;
  p.cap = 0;
  p.signed = false;
  p.rightsUntil=d.year+(p.bio?.lg==="NCAA"?4:["OHL","WHL","QMJHL"].includes(p.bio?.lg)?2:4);
  p.assignment=p.bio?.lg==="NCAA"?"college":["OHL","WHL","QMJHL"].includes(p.bio?.lg)?"junior":"europe";
  if (read) { slot.read = { pot: read.pot, potV: read.potV != null ? Math.round(read.potV) : null, lvl: read.lvl, gem: read.sleeper, flag: read.flag }; tagDraftee(league, p, read); }
  const team = league.teams[slot.owner];
  team.prospects.push(pid);
  league.draftPicks = league.draftPicks.filter((pk) => !(pk.year === d.year && pk.round === slot.round && pk.orig === slot.orig));
  d.idx++;
  return true;
}

export function draftDone(league) {
  return !league.draft || league.draft.idx >= league.draft.slots.length;
}

export function currentSlot(league) {
  return league.draft?.slots[league.draft.idx] || null;
}

// AI picks until it's the user's turn (or the draft ends).
export function simDraftToUser(league, { all = false } = {}) {
  openDraftFloor(league);
  while (!draftDone(league)) {
    const slot = currentSlot(league);
    if (!all && slot.owner === league.userTid) return;
    const listed = slot.owner === league.userTid ? (league.myList?.ids || []).find((id) => league.players[id]?.tid === -2) : null;
    if (!makePick(league, listed || aiChoose(league, slot.owner))) throw new Error("Draft class exhausted before all picks were made.");
  }
}

export function finishDraft(league) {
  // Undrafted players remain available; trimming a reserve pool is a release, not deletion.
  for (const id of league.draftClass) {
    const p = league.players[id];
    if (p && p.tid === -2) {
      p.tid=-1;p.assignment='freeagent';p.signed=false;p.yrs=0;p.cap=0;p.undrafted=true;
      (p.moveHistory ||= []).push({year:league.year,day:league.day,from:-2,to:-1,kind:'undrafted free agent'});
      if(!league.freeAgents.includes(id))league.freeAgents.push(id);
    }
  }
  league.draftClass = [];
  for (const t of league.teams) {
    if (t.prospects.length > MAX_PROSPECTS) {
      const sorted = t.prospects.map((id) => league.players[id]).sort((a, b) => a.pot - b.pot);
      const cut = sorted.slice(0, t.prospects.length - MAX_PROSPECTS);
      for (const p of cut) releaseProspect(league, p.id);
    }
  }
}

export function releaseProspect(league, pid) {
  const p = league.players[pid];
  if (!p) return;
  const t = league.teams[p.tid];
  if (!t || !t.prospects.includes(pid)) return false;
  releasePlayer(league,t,pid);
  if(p.tid!==-1)return false;
  p.assignment='freeagent';delete p.rightsUntil;
  return true;
}

export function randomRoundSeed() {
  return rand();
}

// Older four-round saves keep their active draft intact; undrafted future classes
// receive enough additional depth to support seven rounds without losing reports.
export function expandLegacyDraftClass(league) {
  if (league.draft || !league.draftClass?.length || league.draftClass.length >= 280) return;
  const offset=league.draftClass.length, ids=[];
  for(let i=offset;i<280;i++) {
    const p=generatePlayer(randomPos(),randInt(45,62),chance(0.8)?18:19,league.year,{src:"draft"});
    p.tid=-2;p.signed=false;p.rookie=true;p.pot=randInt(65,78);p.scout={lvl:0,base:estimate(p,4,5)};
    league.players[p.id]=p;ids.push(p.id);
  }
  rankClass(league,ids);
  ids.forEach(id=>{league.players[id].cs.mid+=offset;});
  league.draftClass.push(...ids);
}

// Player-facing evaluation; opponents' development players fail closed.
export function visibleRatings(lg,p){
 const hidden=p.tid===-2 || p.tid!==lg.userTid && lg.teams[p.tid]?.prospects.includes(p.id);
 if(hidden)return shownRatings(p);
 // Your own draftee before the scouting-miss reveal: his ceiling is still your scouts' estimate.
 if(p.tid===lg.userTid&&p.potRev&&p.potRev.stage<3){const b=believedPot(lg,p);return {ovr:p.ovr,pot:`~${b.pot}`,potV:b.pot,exact:true,potEst:true};}
 return {ovr:p.ovr,pot:p.pot,exact:true};
}
