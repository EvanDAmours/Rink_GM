import test from "node:test";
import assert from "node:assert/strict";
import { createLeague, startRegularSeason } from "../src/engine/league.js";
import { startPlayoffs } from "../src/engine/playoffs.js";
import { lineupIds, gameLines, syncLines } from "../src/engine/lines.js";
import { readyCheck, applyPrepFix, nextMatchup, opponentReport, PLAN_KEYS } from "../src/engine/gamePrep.js";
import { matchupPlan } from "../src/engine/teamPlanning.js";
import { slotFit, slotName, slotOf, injurySlot, injuredRegulars, replacementOptions, chooseReplacement, rememberSlots, OFF_POSITION } from "../src/engine/injuries.js";
import { injuryReturn, outPhrase, weeklyInjuryReport, closeInjuryReport, reportBaseline } from "../src/engine/injuryReport.js";
import { applyNewGameOptions } from "../src/engine/newGameOptions.js";
import { REAL_PROSPECTS } from "../src/data/realProspects.js";
import { PATCH_NOTES } from "../src/data/patchNotes.js";

const season = (seed = 11, abbr = "EDM") => {
  const l = createLeague({ userAbbr: abbr, seed });
  startRegularSeason(l);
  // A clean slate: nobody hurt, so each test sets up exactly the injuries it needs.
  for (const p of Object.values(l.players)) { p.injury = 0; delete p.ltir; delete p.injuryNote; }
  for (const t of l.teams) syncLines(l, t);
  return l;
};
const hurt = (p, games, note = "knee") => { p.injury = games; p.injuryEpisode = `test-${p.id}-${games}`; p.injuryNote = note; };
const item = (items, key) => items.find((x) => x.key === key);

test("ready check: an injured regular waits on a replacement until one is chosen", () => {
  const l = season();
  const t = l.teams[l.userTid];
  const centre = l.players[t.lines.F[0][1]];
  hurt(centre, 6);
  let items = readyCheck(l);
  const open = item(items, `inj${centre.id}`);
  assert.ok(open && !open.ok, "the hurt first-line centre is an open item");
  assert.equal(open.fix.kind, "replace");
  assert.equal(open.fix.pid, centre.id);
  assert.match(open.text, /\(1C\) is out 6 games/);
  assert.ok(!item(items, "inj"), "no all-clear line while someone is waiting");
  const r = applyPrepFix(l, open.fix);
  assert.ok(r.ok, r.msg);
  assert.ok(!lineupIds(t.lines).includes(centre.id), "the injured centre left the saved lines");
  items = readyCheck(l);
  assert.ok(item(items, "inj")?.ok, "nothing left to choose");
  assert.ok(lineupIds(gameLines(l, t)).every((id) => l.players[id].injury <= 0), "everyone dressed tonight is healthy");
});

test("ready check: the season plan, game plan and an empty lineup spot each have a fix", () => {
  // The three focus slots became one season plan that locks on opening night: the preseason
  // check offers to lock it in, and in season there is nothing left to set.
  const pre = createLeague({ userAbbr: "EDM", seed: 12 });
  assert.equal(item(readyCheck(pre), "focus").ok, false, "an unlocked plan is flagged in the preseason");
  assert.ok(applyPrepFix(pre, item(readyCheck(pre), "focus").fix).ok);
  assert.equal(item(readyCheck(pre), "focus").ok, true, "the fix locks in the staff's plan");
  const l = season(12);
  const t = l.teams[l.userTid];
  let items = readyCheck(l);
  assert.ok(!item(items, "focus"), "nothing to set once the season is on");

  // A plan that doesn't fit this opponent: Use it switches to the best fit.
  const mu = nextMatchup(l);
  const best = matchupPlan(l, t, mu.opp);
  t.autoPlan = false;
  t.gamePlan = { forecheck: best.forecheck === "aggressive" ? "balanced" : "aggressive", neutral: best.neutral, attack: best.attack };
  items = readyCheck(l, mu);
  assert.equal(item(items, "plan").ok, false);
  assert.match(item(items, "plan").text, /forecheck/);
  assert.ok(applyPrepFix(l, item(items, "plan").fix, mu).ok);
  for (const [k] of PLAN_KEYS) assert.equal(t.gamePlan[k], best[k]);
  assert.equal(item(readyCheck(l, mu), "plan").ok, true);
  t.autoPlan = true;
  assert.equal(item(readyCheck(l, mu), "plan").ok, true, "the coaches' automatic pick is always fine");

  // Every forward on the NHL roster hurt but nine: three spots stay empty tonight.
  const fwds = t.roster.map((id) => l.players[id]).filter((p) => !["LD", "RD", "G"].includes(p.pos));
  fwds.slice(9).forEach((p) => hurt(p, 5));
  items = readyCheck(l, mu);
  assert.equal(item(items, "lines").ok, false, "an empty spot is flagged");
  assert.equal(item(items, "lines").fix.kind, "fill");
  const r = applyPrepFix(l, item(items, "lines").fix, mu);
  assert.ok(typeof r.msg === "string" && r.msg.length > 0);
});

test("ready check: the back half of a back-to-back flags the starter, and the fix starts the backup", () => {
  const l = season(13);
  const t = l.teams[l.userTid];
  const mine = l.schedule.filter((g) => g.h === t.id || g.a === t.id).sort((a, b) => a.day - b.day);
  const [g1, g2] = mine;
  // Pretend the first game was played yesterday by the starter, and the next is tonight.
  const starter = gameLines(l, t).G[0], backup = gameLines(l, t).G[1];
  g1.played = true; g1.hs = 3; g1.as = 2; g1.gl = { h: g1.h === t.id ? starter : null, a: g1.a === t.id ? starter : null };
  g2.day = g1.day + 1;
  l.day = g2.day;
  const items = readyCheck(l, nextMatchup(l));
  const g = item(items, "goalie");
  assert.equal(g.ok, false, "a back-to-back is an open item");
  assert.match(g.text, /back-to-back/);
  assert.ok(applyPrepFix(l, g.fix).ok);
  assert.equal(t.lines.G[0], backup, "the backup starts");
  assert.equal(t.lines.G[1], starter);
});

test("opponent report: record, form, top line, goalie, PP/PK ranks and three key matchups", () => {
  const l = season(14);
  const t = l.teams[l.userTid];
  const mu = nextMatchup(l);
  const rep = opponentReport(l, t, mu.opp, { home: mu.home });
  assert.equal(rep.topLine.length, 3);
  assert.equal(rep.topPair.length, 2);
  assert.ok(rep.goalie);
  assert.ok(rep.pp.rank >= 1 && rep.pp.rank <= 32 && rep.pk.rank >= 1 && rep.pk.rank <= 32);
  assert.equal(rep.matchups.length, 3);
  for (const m of rep.matchups) assert.ok(["EDGE: YOU", "EDGE: THEM", "EVEN"].includes(m.edge) && m.label.length > 5);
  assert.ok(rep.prob > 0 && rep.prob < 1);
});

test("replacements are rated for the spot, with an off-position penalty", () => {
  const p = (pos, ovr, fof = 60) => ({ pos, ovr, attrs: { fof } });
  const C1 = { grp: "F", i: 0, j: 1 }, LW2 = { grp: "F", i: 1, j: 0 }, RD1 = { grp: "D", i: 0, j: 1 }, G1 = { grp: "G", i: 0, j: 0 };
  assert.deepEqual(slotName(C1), { short: "1C", long: "first-line centre" });
  assert.equal(slotName(RD1).long, "top-pair right D");
  assert.equal(slotFit(p("C", 82), C1).r, 82, "a centre at centre plays at his rating");
  assert.equal(slotFit(p("LW", 82), C1).r, 82 - OFF_POSITION.wingAtCentre, "a winger at centre gives up draws");
  assert.equal(slotFit(p("LW", 82, 80), C1).r, 82 - OFF_POSITION.wingAtCentreGoodDraws, "less so with good faceoff skill");
  assert.equal(slotFit(p("RW", 80), LW2).r, 80 - OFF_POSITION.offWing);
  assert.equal(slotFit(p("C", 80), LW2).r, 80 - OFF_POSITION.centreOnWing);
  assert.equal(slotFit(p("LD", 80), LW2).r, 80 - OFF_POSITION.dAtForward);
  assert.equal(slotFit(p("LD", 80), RD1).r, 80 - OFF_POSITION.offSide);
  assert.equal(slotFit(p("C", 80), RD1).r, 80 - OFF_POSITION.forwardOnD);
  assert.equal(slotFit(p("G", 85), C1), null, "goalies only play goal");
  assert.equal(slotFit(p("C", 85), G1), null);
  assert.equal(slotFit(p("G", 85), G1).r, 85);

  const l = season(15);
  const t = l.teams[l.userTid];
  rememberSlots(l, t);
  const star = l.players[t.lines.F[0][1]];
  hurt(star, 8);
  const o = replacementOptions(l, t, star.id);
  assert.equal(o.name.short, "1C");
  const dressed = new Set(lineupIds(gameLines(l, t)).map(String));
  assert.ok(o.roster.length > 0);
  assert.equal(String(o.roster[0].p.id), String(o.nowId), "whoever covers tonight is listed first");
  for (const x of o.roster) {
    assert.ok(String(x.p.id) === String(o.nowId) || !dressed.has(String(x.p.id)), "only players not dressed (plus the one in now)");
    assert.equal(x.r, slotFit(x.p, o.slot).r);
    assert.ok(x.p.injury <= 0);
  }
  const best = o.roster.reduce((b, x) => (x.r > b.r ? x : b));
  assert.equal(o.bestId, String(best.p.id) === String(o.nowId) ? null : best.p.id, "BEST FIT only when it isn't the one in now");

  // Put the lowest-rated option in: he takes the spot, the star keeps the memory of it.
  const pick = [...o.roster].sort((a, b) => a.r - b.r)[0];
  assert.ok(chooseReplacement(l, t, star.id, pick.p.id).ok);
  assert.deepEqual(slotOf(t.lines, pick.p.id), { grp: "F", i: 0, j: 1 });
  assert.deepEqual(injurySlot(l, t, star.id), { grp: "F", i: 0, j: 1 });
  const reg = injuredRegulars(l, t).find((x) => x.p.id === star.id);
  assert.ok(reg.chosen && String(reg.fill.id) === String(pick.p.id));
  assert.ok(!readyCheck(l).some((x) => x.key === `inj${star.id}`), "a chosen replacement clears the ready check");
  // Healthy again: the lines work him back in.
  star.injury = 0;
  (t.linesNew ||= []).push(star.id);
  syncLines(l, t);
  assert.ok(lineupIds(t.lines).includes(star.id), "the star is back in the lineup");
  rememberSlots(l, t);
  assert.ok(!injuredRegulars(l, t).some((x) => x.p.id === star.id));
});

test("an AHL player can be called up into the spot", () => {
  const l = season(16);
  const t = l.teams[l.userTid];
  const d = l.players[t.lines.D[0][0]];
  hurt(d, 10);
  const o = replacementOptions(l, t, d.id);
  const farm = o.farm[0];
  assert.ok(farm, "the AHL has a candidate");
  const r = chooseReplacement(l, t, d.id, farm.p.id);
  if (r.ok) {
    assert.ok(t.roster.includes(farm.p.id), "called up to the NHL roster");
    assert.deepEqual(slotOf(t.lines, farm.p.id), { grp: "D", i: 0, j: 0 });
  } else assert.match(r.msg, /called up/);
});

test("playoff return formatter: games, the series, later rounds and the season", () => {
  const l = season(17);
  const t = l.teams[l.userTid];
  const p = l.players[t.lines.F[0][0]];
  // Regular season.
  hurt(p, 3);
  assert.equal(injuryReturn(l, p).text, "out 3 games");
  assert.equal(injuryReturn(l, p).short, "3g");
  hurt(p, 5);
  assert.equal(injuryReturn(l, p).list, "IR", "four games or more is IR");
  // Two games left in his club's regular season.
  const mine = l.schedule.filter((g) => g.h === t.id || g.a === t.id).sort((a, b) => a.day - b.day);
  mine.slice(0, -2).forEach((g) => { g.played = true; });
  hurt(p, 2);
  assert.equal(injuryReturn(l, p).text, "out for the regular season · back for the playoffs");
  hurt(p, 5);
  assert.equal(injuryReturn(l, p).text, "out for the regular season · back for round 1, game 4");
  hurt(p, 11);
  assert.equal(injuryReturn(l, p).text, "out for the regular season · back for round 2, game 3");
  hurt(p, 2 + 7 * 3 + 6);
  assert.equal(injuryReturn(l, p).text, "out for the regular season · back for the Stanley Cup Final, game 7");
  hurt(p, 2 + 28);
  assert.equal(injuryReturn(l, p).text, "out for the season");
  p.injury = 0; p.ltir = { day: 0, gp: 0 };
  assert.match(injuryReturn(l, p).text, /LTIR/);
  delete p.ltir;

  // Playoffs: a series two games in.
  l.phase = "playoffs";
  startPlayoffs(l);
  const round = l.playoffs.rounds[0];
  const s = round[0], q = l.players[l.teams[s.top].roster.find((id) => l.players[id].pos !== "G")];
  s.games = [{}, {}]; s.wTop = 1; s.wBot = 1;
  hurt(q, 2);
  assert.equal(injuryReturn(l, q).text, "back for game 5");
  assert.equal(injuryReturn(l, q).short, "back G5");
  assert.equal(outPhrase(injuryReturn(l, q)), "out, back for game 5", "reads as a sentence");
  hurt(q, 6);
  assert.equal(injuryReturn(l, q).text, "out for the series · back for round 2, game 2");
  assert.equal(injuryReturn(l, q).short, "out for series");
  hurt(q, 40);
  assert.equal(injuryReturn(l, q).text, "out for the playoffs");
  // His club has won and waits for the round (the slowest series is three games in).
  s.winner = s.top; s.wTop = 4; s.games = [{}, {}, {}, {}];
  for (const o of round.slice(1)) { o.games = [{}, {}, {}]; o.wTop = 2; o.wBot = 1; }
  hurt(q, 6);
  assert.equal(injuryReturn(l, q).text, "back for round 2, game 3");
  hurt(q, 3);
  assert.equal(injuryReturn(l, q).text, "back for round 2");
  // The club that lost is done for the season.
  const loser = l.players[l.teams[s.bot].roster.find((id) => l.players[id].pos !== "G")];
  hurt(loser, 4);
  assert.equal(injuryReturn(l, loser).text, "out for the season");
  // A club that missed the playoffs.
  const missed = l.teams.find((x) => !round.some((o) => o.top === x.id || o.bot === x.id));
  const mp = l.players[missed.roster[0]];
  hurt(mp, 2);
  assert.equal(injuryReturn(l, mp).text, "out for the season");
});

test("weekly injury report: new injuries, who covers, closing it, and who's back", () => {
  const l = season(18);
  const t = l.teams[l.userTid];
  rememberSlots(l, t);
  t.injuryCard = reportBaseline(l, t);
  assert.equal(weeklyInjuryReport(l), null, "nothing new, no card");
  const c = l.players[t.lines.F[1][1]];
  hurt(c, 4);
  const rep = weeklyInjuryReport(l);
  assert.equal(rep.period.label, "Week 1");
  assert.equal(rep.out.length, 1);
  assert.equal(rep.out[0].p.id, c.id);
  assert.equal(rep.out[0].slotName.short, "2C");
  assert.ok(rep.out[0].fill && rep.out[0].fill.injury <= 0, "someone healthy covers his spot");
  closeInjuryReport(l);
  assert.equal(weeklyInjuryReport(l), null, "closed until something changes");
  c.injury = 0;
  const back = weeklyInjuryReport(l);
  assert.deepEqual(back.back.map((p) => p.id), [c.id], "he's listed as back");
  l.settings.injuries = false;
  assert.equal(weeklyInjuryReport(l), null, "no card with injuries off");
});

test("title-screen options: owner firing and generated draft classes", () => {
  const real = createLeague({ userAbbr: "EDM", seed: 21 });
  applyNewGameOptions(real, { firing: true, realDraft: true });
  assert.equal(real.settings.firing, true);
  const names = new Set(Object.values(REAL_PROSPECTS).flat().map((r) => r.name));
  const realNow = real.draftClass.map((id) => real.players[id]).filter((p) => names.has(p.name));
  assert.ok(realNow.length > 0, "real classes carry the real top prospects");

  const gen = createLeague({ userAbbr: "EDM", seed: 21 });
  applyNewGameOptions(gen, { firing: false, realDraft: false });
  assert.equal(gen.settings.firing, false);
  assert.equal(gen.settings.realDraft, false);
  assert.ok(!gen.draftClass.some((id) => names.has(gen.players[id].name) || gen.players[id].identitySource), "no real prospects in a generated class");
  for (const list of Object.values(gen.futureClasses)) assert.ok(!list.some((w) => names.has(w.name) || w.source), "nor on the watch lists");
  // McDavid's published baseline is untouched by the options.
  const mcd = Object.values(gen.players).find((p) => p.name === "Connor McDavid");
  assert.equal(mcd.ovr, 99);
  assert.equal(mcd.number, 97);
  assert.equal(mcd.attrs.spw, 92);
});

test("patch notes: plain entries, unique versions, oldest first", () => {
  assert.ok(PATCH_NOTES.length >= 35);
  const vs = PATCH_NOTES.map((p) => p.v);
  assert.equal(new Set(vs).size, vs.length);
  for (const p of PATCH_NOTES) {
    assert.match(p.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(p.title && p.notes.length > 0 && p.notes.every((n) => typeof n === "string" && n.length > 5));
  }
  const dates = PATCH_NOTES.map((p) => p.date);
  assert.deepEqual([...dates].sort(), dates, "oldest first");
});
