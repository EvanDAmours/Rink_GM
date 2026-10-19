// The Rink Gazette beyond the playoffs: a trade-deadline recap, a season-in-review
// issue and the All-Star weekend edition. Papers queue on league.papers and are
// shown once; nothing here changes standings, ratings or contracts.
import { place } from "./market.js";
import { isGoalie } from "./constants.js";

export function pushPaper(league, paper) {
  league.papers ||= [];
  if (league.papers.some((p) => p.id === paper.id)) return;
  league.papers.push({ seen: false, ...paper });
  if (league.papers.length > 12) league.papers = league.papers.filter((p) => !p.seen).concat(league.papers.filter((p) => p.seen)).slice(0, 12);
}
export const unseenPaper = (league) => (league.papers || []).find((p) => !p.seen);

const GRADES = ["F", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"];
const playoffStep = (r) => (!r ? 0 : /First/.test(r) ? 0.5 : /Second/.test(r) ? 1 : /Conference/.test(r) ? 1.5 : /Final/.test(r) ? 2 : 0.5);

// Preseason expectations are frozen when the regular season starts so a grade
// compares what a club was supposed to be with what it became.
export function freezeExpectations(league) {
  // Roster talent regardless of who is hurt on opening night: the best twenty on the roster.
  const strength = (t) => { const o = t.roster.map((id) => league.players[id]?.ovr || 0).sort((a, b) => b - a).slice(0, 20); return o.reduce((s, v) => s + v, 0) / Math.max(1, o.length); };
  const ranked = [...league.teams].map((t) => ({ id: t.id, ovr: strength(t) })).sort((a, b) => b.ovr - a.ovr);
  league.preseasonRank = Object.fromEntries(ranked.map((r, i) => [r.id, i + 1]));
}
export function teamGrades(league) {
  const table = [...league.teams].sort((a, b) => b.rec.pts - a.rec.pts || b.rec.w - a.rec.w);
  return table.map((t, i) => {
    const expected = league.preseasonRank?.[t.id] ?? i + 1;
    const actual = i + 1;
    let score = 5.5 + (expected - actual) * 0.35;
    const champion = league.playoffs?.champion === t.id;
    const pr = champion ? "Stanley Cup champions" : t.playoffResult;
    if (champion) score += 3; else if (pr) score += playoffStep(pr); else if (expected <= 16) score -= 0.75;
    if (champion) score = Math.max(score, 10.5);
    const grade = GRADES[Math.max(0, Math.min(GRADES.length - 1, Math.round(score)))];
    const why = expected < actual - 4 ? `expected ${ordinal(expected)}, finished ${ordinal(actual)}` : actual < expected - 4 ? `picked ${ordinal(expected)}, finished ${ordinal(actual)}` : `finished ${ordinal(actual)} overall`;
    return { tid: t.id, grade, score, expected, actual, why, playoff: pr };
  });
}
export const ordinal = (n) => `${n}${[, "st", "nd", "rd"][(n % 100 >> 3) ^ 1 && n % 10] || "th"}`;

const ovrIn = (label) => Number((/, (\d+)/.exec(label) || [])[1] || 0);
const labelValue = (labels) => labels.reduce((s, l) => s + (ovrIn(l) ? Math.max(0, ovrIn(l) - 68) ** 1.5 : /pick/i.test(l) ? 14 : 4), 0);
// Your season's moves, graded on talent in against talent out (trades) and on
// rating per dollar (signings). Best and worst are the two ends of that list.
export function userMoves(league) {
  const user = league.teams[league.userTid];
  const moves = [];
  for (const w of league.wire || []) {
    if (w.kind !== "trade" || !w.mine || w.year !== league.year) continue;
    const got = w.bGets || [], gave = w.aGets || [];
    const delta = labelValue(got) - labelValue(gave);
    moves.push({ kind: "trade", day: w.day, text: `Acquired ${got.join(", ") || "future considerations"} from ${place(league, league.teams[w.a])} for ${gave.join(", ") || "future considerations"}`, score: delta });
  }
  for (const tx of league.transactions || []) {
    if (tx.year !== league.year || !tx.tids?.includes(user.id)) continue;
    const m = /^(\w+) sign (.+?) \((\w+), (\d+)\) — (\d+) yrs?, \$([\d.]+)M AAV/.exec(tx.text);
    if (!m || m[1] !== user.abbr) continue;
    const ovr = Number(m[4]), aav = Number(m[6]);
    const fair = Math.max(0.8, ((ovr - 70) / 20) ** 2 * 9);
    moves.push({ kind: "signing", day: tx.day, text: `Signed ${m[2]} (${m[3]}, ${ovr}) for ${m[5]} yr${m[5] === "1" ? "" : "s"} at $${aav.toFixed(2)}M`, score: (fair - aav) * 6 + (ovr - 76) });
  }
  moves.sort((a, b) => b.score - a.score);
  return { best: moves[0] || null, worst: moves.length > 1 ? moves.at(-1) : null, count: moves.length };
}

const paperDate = (league, dayOffset = 1) => {
  const d = new Date(Date.parse((league.scheduleStart || `${league.year}-09-29`) + "T12:00:00Z") + (league.day + dayOffset) * 86400000);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).toUpperCase();
};

export function deadlinePaper(league) {
  const dl = league.deadline;
  if (!dl || dl.synthetic || dl.year !== league.year) return;
  const user = league.teams[league.userTid];
  const trades = dl.feed.filter((f) => f.kind === "trade");
  const n = trades.length;
  const mine = trades.filter((f) => f.mine || f.tids?.includes(user.id));
  const star = trades.filter((f) => f.star).sort((a, b) => b.star.ovr - a.star.ovr)[0];
  const activity = {};
  for (const f of trades) for (const tid of [f.a, f.b]) if (tid != null) activity[tid] = (activity[tid] || 0) + 1;
  const busiest = Object.entries(activity).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([tid, c]) => [place(league, league.teams[tid]), `${c} deal${c === 1 ? "" : "s"}`]);
  const headline = star ? `${star.star.name.toUpperCase()} ON THE MOVE` : n ? `${n} DEALS BEFORE THE BELL` : "A QUIET DEADLINE";
  const sub = star ? `${place(league, league.teams[star.star.to ?? star.a])} land the biggest name as ${n} trade${n === 1 ? "" : "s"} beat the 3 p.m. deadline` : n ? "Contenders load up, sellers cash in before 3 p.m." : "Phones ring, nothing moves: general managers hold their rosters.";
  const story = [];
  story.push(n ? `The trade deadline passed at 3 p.m. Eastern with ${n} deal${n === 1 ? "" : "s"} completed across the league.${star ? ` The biggest of them sent ${star.star.name} (${star.star.ovr} overall) to ${place(league, league.teams[star.star.to ?? star.a])}.` : ""}` : "The trade deadline passed at 3 p.m. Eastern without a single deal. Several general managers said the asking prices never came down.");
  if (mine.length) story.push(`In ${user.city}, ${user.name} general manager made ${mine.length} move${mine.length === 1 ? "" : "s"}: ${mine.map((f) => f.text.replace(/\.$/, "")).join("; ")}.`);
  else story.push(`The ${user.name} stood pat. ${user.rec.pts} points through ${user.rec.gp} games leaves them ${user.rec.gp ? ordinal([...league.teams].sort((a, b) => b.rec.pts - a.rec.pts).findIndex((t) => t.id === user.id) + 1) : ""} overall, and the front office chose continuity over a rental.`);
  if (busiest.length) story.push(`${busiest[0][0]} were the busiest club of the day with ${busiest[0][1]}.`);
  story.push(`Rosters are now frozen until the summer. ${Math.max(0, (league.schedule.length ? Math.max(...league.schedule.map((g) => g.day)) : 0) - league.day)} days remain in the regular season.`);
  pushPaper(league, {
    id: `deadline:${league.year}`, kind: "deadline", year: league.year, day: league.day, date: paperDate(league),
    edition: "DEADLINE EXTRA", weather: "Phones down. Clear skies tonight.", headline, sub, story,
    photo: { tid: star ? (star.star.to ?? star.a) : user.id, caption: star ? `${star.star.name} joins ${place(league, league.teams[star.star.to ?? star.a])}, the headline deal of the day.` : `${user.city}: the front office kept its roster intact.` },
    photo2: { tid: user.id, caption: mine.length ? `${user.city} made ${mine.length} deal${mine.length === 1 ? "" : "s"}.` : `${user.city} held.` },
    side: [
      { h: "Every Deal", rows: trades.length ? trades.map((f) => ["", f.text]).slice(0, 14) : [["", "No trades."]] },
      { h: "Busiest Desks", rows: busiest.length ? busiest : [["", "Nobody."]] },
    ],
    foot: "INSIDE · Winners and losers, D2 · Who's left on the block, D5 · Stretch-run schedule, D8",
    button: "Back to the season →",
  });
}

const AWARD_LABELS = { hart: "Hart Trophy (MVP)", artRoss: "Art Ross Trophy", rocket: "Rocket Richard Trophy", norris: "Norris Trophy", vezina: "Vezina Trophy", calder: "Calder Trophy", selke: "Selke Trophy", ladyByng: "Lady Byng Trophy", tedLindsay: "Ted Lindsay Award", connSmythe: "Conn Smythe Trophy", jackAdams: "Jack Adams Award", jennings: "Jennings Trophy", masterton: "Masterton Trophy", kingClancy: "King Clancy Trophy", messier: "Messier Leadership Award" };

export function seasonReviewPaper(league) {
  const champ = league.teams[league.playoffs?.champion];
  if (!champ) return;
  const user = league.teams[league.userTid];
  const grades = teamGrades(league);
  const mineG = grades.find((g) => g.tid === user.id);
  const moves = userMoves(league);
  const aw = league.awards || {};
  const awardRows = Object.entries(AWARD_LABELS).filter(([k]) => aw[k]?.name).map(([k, label]) => [label, `${aw[k].name}${aw[k].tid != null && league.teams[aw[k].tid] ? ` (${league.teams[aw[k].tid].abbr})` : ""}`]);
  const h = league.history?.find((x) => x.year === league.year);
  const runnerUp = h ? league.teams[h.runnerUp] : null;
  const final = league.playoffs.rounds?.[3]?.[0];
  const score = final ? `${Math.max(final.wTop, final.wBot)}-${Math.min(final.wTop, final.wBot)}` : "";
  const userLine = league.playoffs.champion === user.id ? "won the Stanley Cup" : user.playoffResult ? user.playoffResult.replace(/^Lost /, "lost in the ").replace("the Stanley Cup Final", "the Stanley Cup Final").toLowerCase().replace("lost in the stanley cup final", "lost the Stanley Cup Final") : "missed the playoffs";
  const story = [
    `${champ.city}'s season ended the way every season is supposed to: with the Stanley Cup. The ${champ.name} ${runnerUp ? `beat the ${runnerUp.name} ${score} in the Final` : "won the Final"}${aw.connSmythe ? `, and ${aw.connSmythe.name} was voted the Conn Smythe Trophy winner as playoff MVP` : ""}.`,
    `${aw.hart ? `${aw.hart.name} took the Hart Trophy (${aw.hart.why}).` : ""}${aw.vezina ? ` ${aw.vezina.name} won the Vezina.` : ""}${aw.norris ? ` ${aw.norris.name} was the Norris winner on defence.` : ""}${aw.calder ? ` ${aw.calder.name} is the rookie of the year.` : ""}`.trim(),
    `Report card: the ${user.name} finished ${user.rec.w}-${user.rec.l}-${user.rec.otl} (${user.rec.pts} points) and ${userLine}. Our grade: ${mineG.grade}, ${mineG.why}.`,
    moves.count ? `Best move of the year in ${user.city}: ${moves.best.text}.${moves.worst ? ` Worst: ${moves.worst.text}.` : ""}` : `The ${user.city} front office made no trades or signings of note this season.`,
    `Top of the class: ${grades.filter((g) => g.grade.startsWith("A")).slice(0, 3).map((g) => `${league.teams[g.tid].name} (${g.grade})`).join(", ") || "nobody earned an A"}. Bottom: ${grades.filter((g) => /^[DF]/.test(g.grade)).slice(-3).map((g) => `${league.teams[g.tid].name} (${g.grade})`).join(", ") || "no club failed outright"}.`,
  ].filter(Boolean);
  pushPaper(league, {
    id: `review:${league.year}`, kind: "review", year: league.year, day: league.day, date: paperDate(league, 3),
    edition: "SEASON IN REVIEW", weather: "Sunny. The rinks are melting.", headline: `${champ.name.toUpperCase()}: CHAMPIONS`,
    sub: `The ${league.year}–${String(league.year + 1).slice(2)} season, graded: awards, every club's report card and the best and worst business done in ${user.city}`,
    story,
    photo: { tid: champ.id, trophy: "stanley", caption: `The ${champ.name}, Stanley Cup champions.` },
    photo2: { tid: user.id, caption: `${user.city}: grade ${mineG.grade}.` },
    side: [
      { h: "League Honors", rows: awardRows },
      { h: "Report Card", rows: grades.map((g) => [league.teams[g.tid].abbr, `${g.grade} · ${league.playoffs.champion === g.tid ? "Champions" : g.playoff ? g.playoff.replace("Lost ", "Out: ") : "Missed"}`]) },
      { h: `${user.city} Business`, rows: moves.count ? [["Best", moves.best.text], ...(moves.worst ? [["Worst", moves.worst.text]] : [])] : [["", "No notable moves."]] },
    ],
    foot: "INSIDE · All-NHL teams, D2 · Draft lottery odds, D4 · Free-agent class preview, D6",
    button: "On to the draft →",
  });
}

export function allStarPaper(league, ev) {
  const user = league.teams[league.userTid];
  const skills = ev.skills.map((s) => [s.label, `${s.winner.name} (${s.winner.abbr}) · ${s.result}`]);
  const mineCount = ev.rosters.reduce((n, r) => n + r.players.filter((p) => p.tid === user.id).length, 0);
  const story = [
    `${ev.host} hosted All-Star Weekend, and the ${ev.winner} division took the 3-on-3 tournament${ev.mvp ? `, with ${ev.mvp.name} named MVP` : ""}.`,
    `Saturday's skills competition: ${ev.skills.map((s) => `${s.winner.name} won ${s.label.toLowerCase()} (${s.result})`).join("; ")}.`,
    mineCount ? `${user.city} sent ${mineCount} player${mineCount === 1 ? "" : "s"}: ${ev.rosters.flatMap((r) => r.players.filter((p) => p.tid === user.id).map((p) => p.name)).join(", ")}.` : `No ${user.name} player made a roster this year.`,
    `The second half begins ${ev.resumeText}. Standings and statistics are unaffected by the weekend.`,
  ];
  pushPaper(league, {
    id: `allstar:${league.year}`, kind: "allstar", year: league.year, day: league.day, date: paperDate(league, 0),
    edition: "ALL-STAR WEEKEND", weather: "Bright lights, warm arena.", headline: `${ev.winner.toUpperCase()} TAKE THE ALL-STAR CROWN`,
    sub: `${ev.mvp ? `${ev.mvp.name} shines as ` : ""}the ${ev.winner} division wins the 3-on-3 tournament in ${ev.host}`,
    story,
    photo: { tid: ev.mvp?.tid ?? ev.hostTid, caption: ev.mvp ? `${ev.mvp.name}, tournament MVP.` : `${ev.host}, host city.` },
    photo2: { tid: ev.hostTid, caption: `${ev.host} hosted the weekend.` },
    side: [
      { h: "Skills Competition", rows: skills },
      { h: "Tournament", rows: ev.games.map((g) => [g.label, `${g.a} ${g.as} – ${g.hs} ${g.h}`]) },
      ...ev.rosters.map((r) => ({ h: `${r.division} Division`, rows: [["", r.players.map((p) => `${p.name}${p.captain ? " (C)" : ""}`).join(", ")]] })),
    ],
    foot: "INSIDE · Skills results in full, D2 · Second-half storylines, D4 · Deadline preview, D6",
    button: "Back to the season →",
  });
}
