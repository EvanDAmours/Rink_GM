// Draft Day (r16, concept 2 "Your list is the draft"): the numbers behind the one Draft screen.
//
//   availabilityOdds(league, ids, overall, opts)  chance each prospect is still there at a pick (E3):
//                     a Monte Carlo that replays the engine's own AI pick rule (draft.aiPickScore plus
//                     the same N(0, 1.2) noise as aiChoose) for every pick before it; your own picks in
//                     between go by the one rule for picks made for you (scouting.scoutsPick: Your
//                     list, then your scouts' board). Fixed seed and cached per pick, so the numbers
//                     don't jitter between renders. Read-only: the league is never touched.
//   scoutOptions(league, overall)  your scouts' three options for one of your picks (E4): best fit,
//                     best available (or the next best), and a need or upside call, each with one
//                     plain sentence and, for a pick still to come, the chance he's there.
//   listOdds(league, overall, n)   odds for the top n names left on Your list at a pick.
//   myClassRows(league, year)      Your class: every pick you made with what your scouts believed
//                     (never the hidden truth until the reveal), where he plays next and how he got
//                     picked (slot.how: "user" by you, "list" from Your list, "scouts" their board).
//   analystsGrade(league, tid, year)  the one class grade (E7): the analysts' instant grade
//                     (scouting.teamDraftGrade), public information only. classMatured: two seasons on,
//                     when the recap's true verdicts may show.
import { stream } from "./rng.js";
import { aiPickScore, aiPickContext, currentSlot, draftDone } from "./draft.js";
import { classPool, myBoard, myScore, myListIds, prospectRead, believedPot, csRank, teamDraftGrade, userNeeds, projection, potGrade, REVEAL } from "./scouting.js";
import { teamNeeds } from "./teamPlanning.js";

const cache = new WeakMap();
const NOISE = 1.2; // aiChoose's noise
const CUT = NOISE * 4.5; // a prospect this far below the slot's best can't win it (p < 1e-5)

function cacheFor(league) {
  let c = cache.get(league);
  if (!c) { c = new Map(); cache.set(league, c); }
  return c;
}

// Your preference order for picks made for you: Your list, then the scouts' board.
function userPref(league, pool) {
  const avail = new Set(pool.map((p) => p.id));
  const listed = myListIds(league).filter((id) => avail.has(id));
  const seen = new Set(listed);
  const ranks = myBoard(league, pool);
  const rest = pool.filter((p) => !seen.has(p.id)).sort((a, b) => ranks.get(a.id) - ranks.get(b.id)).map((p) => p.id);
  return [...listed, ...rest];
}

// { [pid]: 0..1 } for every prospect still on the board: the chance he's still there when pick
// `overall` comes up. owners: { [overall]: tid } to replay a trade (who'd pick where if you said yes).
export function availabilityOdds(league, ids = null, overall, { n, owners = {} } = {}) {
  const d = league.draft;
  const pool = classPool(league);
  const out = {};
  if (!d?.slots || !pool.length || !(overall > 0)) { for (const id of ids || []) out[id] = 0; return out; }
  const idx = d.idx || 0;
  const between = d.slots.slice(idx).filter((s) => !s.pid && s.overall < overall);
  const ownerOf = (s) => (owners[s.overall] ?? s.owner);
  const mineBetween = between.some((s) => ownerOf(s) === league.userTid);
  const pref = mineBetween ? userPref(league, pool) : null;
  const okey = Object.entries(owners).map(([k, v]) => `${k}:${v}`).sort().join(",");
  const key = `${d.year}|${idx}|${overall}|${okey}|${pool.length}|${pref ? pref.slice(0, 40).join(",") : ""}`;
  const c = cacheFor(league);
  let all = c.get(key);
  if (!all) {
    const runs = n || (between.length > 60 ? 120 : between.length > 32 ? 200 : 300);
    const index = new Map(pool.map((p, i) => [p.id, i]));
    // Each AI slot's scores without noise, best first (the noise is added per run).
    const ctxs = new Map();
    const plan = between.map((s) => {
      const tid = ownerOf(s);
      if (tid === league.userTid) return { mine: true };
      const k = `${tid}|${s.round}`;
      if (!ctxs.has(k)) ctxs.set(k, { ...aiPickContext(league, tid), round: s.round });
      const ctx = ctxs.get(k);
      const order = pool.map((p, i) => [i, aiPickScore(league, tid, p, ctx, 0)]).sort((a, b) => b[1] - a[1]);
      return { order };
    });
    const prefIdx = pref ? pref.map((id) => index.get(id)) : null;
    const r = stream(`odds|${key}`);
    const alive = new Float64Array(pool.length);
    const gone = new Uint8Array(pool.length);
    for (let t = 0; t < runs; t++) {
      gone.fill(0);
      for (const sl of plan) {
        let best = -1;
        if (sl.mine) { for (const i of prefIdx) if (!gone[i]) { best = i; break; } }
        else {
          let bs = -Infinity;
          for (const [i, base] of sl.order) {
            if (base + CUT < bs) break;
            if (gone[i]) continue;
            const sc = base + r.gauss(0, NOISE);
            if (sc > bs) { bs = sc; best = i; }
          }
        }
        if (best >= 0) gone[best] = 1;
      }
      for (let i = 0; i < pool.length; i++) if (!gone[i]) alive[i]++;
    }
    all = {};
    pool.forEach((p, i) => { all[p.id] = alive[i] / runs; });
    if (c.size > 60) c.clear();
    c.set(key, all);
  }
  if (!ids) return { ...all };
  for (const id of ids) out[id] = all[id] ?? 0;
  return out;
}

// Your next pick in this draft (on the clock counts), or your first one at the Combine.
export function nextPick(league) {
  const d = league.draft;
  if (!d?.slots || draftDone(league)) return null;
  return d.slots.slice(d.idx).find((s) => s.owner === league.userTid && !s.pid) || null;
}

// Odds for the top `n` names left on Your list at pick `overall`.
export function listOdds(league, overall, n = 30) {
  const ids = myListIds(league).filter((id) => league.players[id]?.tid === -2).slice(0, n);
  return availabilityOdds(league, ids, overall);
}

const POS_WORD = { C: "centre", LW: "left wing", RW: "right wing", LD: "left-side defenceman", RD: "right-side defenceman", G: "goalie" };
const lc = (s) => (s ? s[0].toLowerCase() + s.slice(1) : "");

// Your scouts' three options for one of your picks: three different players, each likely to be there.
export function scoutOptions(league, overall) {
  const pool = classPool(league);
  if (!pool.length) return [];
  const cur = currentSlot(league);
  const at = overall ?? nextPick(league)?.overall ?? cur?.overall;
  const onClock = !!cur && cur.overall === at && cur.owner === league.userTid && league.draft?.stage !== "combine";
  const ranks = myBoard(league, pool);
  const byBoard = [...pool].sort((a, b) => ranks.get(a.id) - ranks.get(b.id));
  let cands = byBoard.slice(0, 45);
  let odds = null;
  if (!onClock && at) {
    odds = availabilityOdds(league, cands.map((p) => p.id), at);
    const likely = cands.filter((p) => odds[p.id] >= 0.35);
    cands = likely.length >= 3 ? likely : [...cands].sort((a, b) => odds[b.id] - odds[a.id]).slice(0, 8).sort((a, b) => ranks.get(a.id) - ranks.get(b.id));
  }
  const t = league.teams[league.userTid];
  const need = Object.fromEntries(teamNeeds(league, t).map((x) => [x.pos, x.score]));
  const reads = new Map(cands.map((p) => [p.id, prospectRead(league, p)]));
  const rank0 = new Map(cands.map((p, i) => [p.id, i + 1])); // rank among the candidates
  const fitScore = (p) => -rank0.get(p.id) + (need[p.pos] || 0) / 12 - (reads.get(p.id).flag ? 2 : 0);
  const best = cands[0];
  const fit = [...cands].sort((a, b) => fitScore(b) - fitScore(a))[0];
  const used = new Set([best.id, fit.id]);
  const second = fit.id === best.id ? cands.find((p) => !used.has(p.id)) : null;
  if (second) used.add(second.id);
  // The third: your thinnest spot if neither pick fills it, otherwise the biggest ceiling in range.
  // Goalies take years and miss often: like the AI clubs, your scouts don't push one in round 1.
  const round = league.draft?.slots?.find((x) => x.overall === at)?.round ?? 1;
  const topNeed = userNeeds(league, 2).find((pos) => !(pos === "G" && round === 1) && ![...used].some((id) => league.players[id].pos === pos));
  const needPick = topNeed ? cands.slice(0, 20).find((p) => p.pos === topNeed && !used.has(p.id) && !reads.get(p.id).flag) : null;
  const upside = cands.slice(0, 16).filter((p) => !used.has(p.id) && !reads.get(p.id).flag)
    .sort((a, b) => upsideOf(reads.get(b.id)) - upsideOf(reads.get(a.id)) || ranks.get(a.id) - ranks.get(b.id))[0];
  const third = needPick || upside || cands.find((p) => !used.has(p.id));
  const why = (p, kind) => sentence(league, p, reads.get(p.id), kind, need, rank0.get(p.id));
  const opt = (p, kind, label) => p && { kind, label, pid: p.id, why: why(p, kind), odds: odds ? odds[p.id] ?? availabilityOdds(league, [p.id], at)[p.id] : null };
  const out = fit.id === best.id
    ? [opt(best, "fitbest", "Best fit and best available"), opt(second, "next", "Next best"), third && opt(third, needPick ? "need" : "upside", needPick ? "Fills a need" : "Upside")]
    : [opt(fit, "fit", "Best fit"), opt(best, "best", "Best available"), third && opt(third, needPick ? "need" : "upside", needPick ? "Fills a need" : "Upside")];
  return out.filter(Boolean);
}
const upsideOf = (r) => (r.potV ?? 0) + (r.sleeper ? 3 : r.hunch ? 1.5 : 0) + (["generational", "superstar", "star"].includes(r.dev) ? 1.5 : 0);

function sentence(league, p, read, kind, need, rank) {
  const tier = read.tier ? lc(read.tier) : `${POS_WORD[p.pos] || p.pos} prospect`;
  const needy = (need[p.pos] || 0) >= 25;
  const ceil = read.potV == null ? null : read.exact ? `${Math.round(read.potV)}` : read.lvl > 0 ? `about ${Math.round(read.potV)}` : `a ${read.grade}`;
  if (kind === "fitbest") return `The best player left on your scouts' board${needy ? `, and he fills your need at ${p.pos}` : ""}: a ${tier}.`;
  if (kind === "fit") return `Fills your need at ${p.pos} and sits #${rank} on your scouts' board: a ${tier}.`;
  if (kind === "best") return `The best player left on your scouts' board: a ${tier}${needy ? "" : ", whatever the position"}.`;
  if (kind === "next") return `Next on your scouts' board: a ${tier}${needy ? ` at a position you need (${p.pos})` : ""}.`;
  if (kind === "need") return `Your thinnest spot is ${POS_WORD[p.pos] || p.pos}, and he's the best one your scouts see in this range.`;
  return read.sleeper ? `Your scouts think he's a sleeper: they see a ceiling of ${ceil}, well above where the board has him.`
    : read.hunch ? `Your scouts have a hunch about him: a ceiling of ${ceil} if it comes together.`
      : `The biggest ceiling your scouts see in this range (${ceil}).`;
}

// ---------- Your class ----------

// How sure your scouts were of a ceiling: "93" exact, "~93" with a range, or a letter grade.
export function ceilingText(read) {
  if (!read || read.potV == null) return { big: "?", small: "not seen" };
  if (read.exact) return { big: `${Math.round(read.potV)}`, small: "ceiling" };
  if (read.lvl > 0) {
    const w = Math.max(1, Math.round(read.sd ?? 2));
    return { big: `~${Math.round(read.potV)}`, small: `${Math.round(read.potV) - w}–${Math.min(99, Math.round(read.potV) + w)}` };
  }
  return { big: potGrade(read.potV), small: "rough read" };
}

const PLAYS = { junior: "Back to junior", college: "College", europe: "Stays in Europe", freeagent: "Released" };
const where = (p) => (!p ? "" : p.assignment === "ahl" ? "AHL" : p.tid === -1 ? "Released" : PLAYS[p.assignment] || (p.bio?.lg ? `Stays in the ${p.bio.lg}` : ""));

// Your class for one draft: what your scouts believed on draft day, until the truth comes out
// (scouting.REVEAL: a first read in his first season, all of it by the end of his second).
export function myClassRows(league, year) {
  return classSource(league, year).filter((s) => s.pid && s.owner === league.userTid).map((s) => {
    const p = league.players[s.pid];
    const r = s.read || null;
    const b = p ? believedPot(league, p) : null;
    const ceiling = b ? b.pot : r?.potV ?? null;
    return {
      pid: s.pid, overall: s.overall, round: s.round, grade: s.grade || null, csr: s.csr || null,
      name: p?.name || s.name || "Unknown", pos: p?.pos || s.pos || "", age: p?.age ?? null,
      how: s.how || null, where: where(p),
      // The ceiling as believed now: the draft-day read, moving toward the truth over two seasons.
      ceiling, est: !!b?.est, stage: p?.potRev?.stage ?? 3, draftDay: p?.potRev?.from ?? r?.potV ?? null,
      tier: ceiling != null ? projection(p?.pos || s.pos, ceiling) : null, dev: r?.dev || null,
    };
  });
}
function classSource(league, year) {
  const d = league.draft;
  if (d?.year === year && d.slots?.some((s) => s.pid)) return d.slots;
  return (league.draftHistory || []).find((h) => h.year === year)?.picks || [];
}
// Every draft you can look back on, newest first.
export function classYears(league) {
  const ys = new Set((league.draftHistory || []).filter((h) => h.picks?.some((s) => s.pid)).map((h) => h.year));
  if (league.draft?.slots?.some((s) => s.pid)) ys.add(league.draft.year);
  return [...ys].sort((a, b) => b - a);
}

// The one class grade on draft day (E7): the analysts' instant grade, where each pick went against
// where Central Scouting had him (public information, like real draft-night grades).
const GRADE_ORDER = ["D", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"];
export function analystsGrade(league, tid = league.userTid, year = league.draft?.year) {
  if (league.draft?.year === year && league.phase === "draft") return teamDraftGrade(league, tid);
  const g = classSource(league, year).filter((s) => s.pid && s.owner === tid && s.grade).map((s) => GRADE_ORDER.indexOf(s.grade)).filter((i) => i >= 0);
  if (!g.length) return null;
  return GRADE_ORDER[Math.max(0, Math.min(GRADE_ORDER.length - 1, Math.round(g.reduce((a, b) => a + b, 0) / g.length)))];
}
// Every club's analysts' grade for one draft, best first.
export function analystsGrades(league, year) {
  return league.teams.map((t) => ({ tid: t.id, g: analystsGrade(league, t.id, year) })).filter((x) => x.g).sort((a, b) => GRADE_ORDER.indexOf(b.g) - GRADE_ORDER.indexOf(a.g) || a.tid - b.tid);
}
// Two seasons on, the truth is out for everyone (scouting.REVEAL): the recap's real verdicts can show.
export function classMatured(league, year) {
  return league.year > year + 1 || (league.year === year + 1 && !["regular", "preseason"].includes(league.phase));
}

export { REVEAL, csRank, myScore };
