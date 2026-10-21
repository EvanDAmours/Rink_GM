// Draft recap (Gridiron 1.69): every pick with what he really is (true OVR, POT and development
// trait on draft day), a verdict against where he went, and a grade for each club's class, ranked
// 1 to 32. Also the steal/reach call against Central Scouting used on draft day (1.9994).
import { shownRatings } from "./draft.js";

// ---------- Steal or reach ----------

// Where a player went against where Central Scouting had him. Positive d: he lasted longer than
// he should have (a steal); a big negative one is a reach.
export function pickValueTag(overall, csr) {
  if (!csr || csr >= 999 || !overall) return null;
  const d = overall - csr;
  if (d >= Math.max(6, Math.round(overall * 0.25))) return { kind: "steal", d };
  if (-d >= Math.max(10, Math.round(overall * 0.4))) return { kind: "reach", d };
  return null;
}

// ---------- Draft-day truth ----------

const DAY = (p) => ({ ovr: p.ovr, pot: p.pot, dev: p.dev || "normal", age: p.age, board: p.scout?.base?.ePot ?? null });

// Stamp each made pick with what he was on draft day, before he develops. It goes on the draft
// slot (the archive copies slots whole) and, during the off-season after the draft, on the
// archived pick too. Returns how many were stamped.
export function stampDraftTruth(league) {
  let n = 0;
  const stamp = (s) => {
    if (!s?.pid || s.tv) return;
    const p = league.players[s.pid];
    if (!p) return;
    s.tv = DAY(p);
    n++;
  };
  const d = league.draft;
  if (league.phase === "draft" && d?.slots) d.slots.forEach(stamp);
  // Nobody develops before the next season starts, so the archived class can still be stamped.
  if (["draft", "resign", "freeagency"].includes(league.phase)) {
    const h = (league.draftHistory || []).find((x) => x.year === league.year + 1);
    h?.picks?.forEach(stamp);
  }
  return n;
}

// ---------- Recap rows ----------

// Every draft with picks: the one under way (or just held) and every archived one, newest first.
export function recapYears(league) {
  const ys = new Set((league.draftHistory || []).filter((h) => h.picks?.some((s) => s.pid)).map((h) => h.year));
  if (league.draft?.slots?.some((s) => s.pid)) ys.add(league.draft.year);
  return [...ys].sort((a, b) => b - a);
}

// One row per pick: { round, overall, owner, orig, pid, name, pos, age, ovr, pot, dev, gem, bust,
// board, grade, csr, live }. Ratings are the draft-day truth when stamped, otherwise his ratings now.
export function recapEntries(league, year) {
  const live = league.draft?.year === year && league.draft.slots?.some((s) => s.pid);
  const src = live ? league.draft.slots : (league.draftHistory || []).find((h) => h.year === year)?.picks || [];
  return src.filter((s) => s.pid).map((s) => {
    const p = league.players[s.pid];
    const tv = s.tv || (p ? DAY(p) : null);
    const flags = p && (p.gem !== undefined || p.redFlag !== undefined || p.bust !== undefined);
    const board = tv?.board ?? (p ? shownRatings(p).pot : null);
    const boardN = Number.isFinite(+board) ? +board : null;
    // Hidden gems and red flags from the scouting engine when it has them; otherwise the truth
    // against the board's read: a ceiling 8+ above it is a gem, 8+ below it in the first two rounds a bust.
    const gem = flags ? !!p.gem : boardN != null && tv && tv.pot - boardN >= 8;
    const bust = flags ? !!(p.bust || p.redFlag) : boardN != null && tv && s.round <= 2 && boardN - tv.pot >= 8;
    return {
      round: s.round, overall: s.overall, owner: s.owner, orig: s.orig, pid: s.pid,
      name: p?.name || s.name || "Unknown", pos: p?.pos || s.pos || "", age: tv?.age ?? p?.age ?? null,
      ovr: tv?.ovr ?? null, pot: tv?.pot ?? null, dev: tv?.dev || "normal", gem: !!gem, bust: !!bust,
      board: boardN, grade: s.grade || null, csr: s.csr || null, stamped: !!s.tv,
    };
  });
}

const DEV_PTS = { superstar: 3, star: 2, late: 1, normal: 0 };

// Verdict on each pick: his trait, and his ceiling against where he went (potRank: where his
// ceiling ranks among the picks; 32+ spots later than that is real value, 48+ earlier a miss).
export function gradePicks(entries) {
  const rows = entries.filter((e) => e && e.pid != null).map((e) => ({ ...e }));
  [...rows].sort((a, b) => (b.pot || 0) - (a.pot || 0) || (b.ovr || 0) - (a.ovr || 0) || a.overall - b.overall).forEach((r, i) => { r.potRank = i + 1; });
  for (const r of rows) {
    const value = r.overall - r.potRank;
    r.value = value;
    r.score = (DEV_PTS[r.dev] || 0) + (value >= 32 ? 1 : value <= -48 && r.round <= 3 ? -1 : 0) + (r.gem ? 1 : 0) - (r.bust ? 2 : 0);
    r.verdict = r.bust ? "bust" : r.gem ? "gem" : r.dev === "superstar" ? "jackpot"
      : r.dev === "star" ? "hit"
      : r.dev === "late" ? "wait"
      : value >= 32 ? "value"
      : value <= -48 && r.round <= 3 ? "miss"
      : "solid";
  }
  return rows.sort((a, b) => a.overall - b.overall);
}

export const VERDICT = {
  bust: ["🚩 Bust", "#ef4444"], gem: ["💎 Hidden gem", "#f472b6"], jackpot: ["⭐ Jackpot", "#f5c542"], hit: ["✅ Hit", "#22c55e"], value: ["💰 Value", "#22c55e"],
  wait: ["⏳ Late bloomer", "#c4b5fd"], solid: ["Solid", "#94a3b8"], miss: ["❌ Miss", "#ef4444"],
};
export const HIT = new Set(["gem", "jackpot", "hit"]);

// Each club's class: picks, hits (Star or better, or a hidden gem), a score per pick plus a little
// for volume, ranked 1-32 (clubs without a pick last) and graded on a curve.
export function classGrades(rows, nTeams = 32) {
  const by = Array.from({ length: nTeams }, (_, tid) => ({ tid, picks: [], score: 0, hits: 0 }));
  for (const r of rows) {
    const t = by[r.owner];
    if (!t) continue;
    t.picks.push(r);
    t.score += r.score;
    if (HIT.has(r.verdict)) t.hits++;
  }
  for (const t of by) t.rating = t.picks.length ? t.score / t.picks.length + t.score * 0.05 : -Infinity;
  const order = [...by].sort((a, b) => b.rating - a.rating || b.hits - a.hits || a.tid - b.tid);
  const graded = order.filter((t) => t.picks.length).length;
  order.forEach((t, i) => {
    t.rank = i + 1;
    const q = i / Math.max(1, graded - 1);
    t.grade = !t.picks.length ? "—" : q < 0.1 ? "A" : q < 0.3 ? "B+" : q < 0.5 ? "B" : q < 0.7 ? "C+" : q < 0.88 ? "C" : "D";
  });
  return by;
}

export const devCounts = (rows) => rows.reduce((m, r) => ({ ...m, [r.dev]: (m[r.dev] || 0) + 1 }), {});

// The whole recap for one draft year: rows with verdicts, class grades, trait counts.
export function draftRecap(league, year) {
  const rows = gradePicks(recapEntries(league, year));
  return { year, rows, grades: classGrades(rows, league.teams.length), counts: devCounts(rows) };
}
