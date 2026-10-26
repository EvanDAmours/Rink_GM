// The development system (round 3): one focus player, a camp priority and prospect placements,
// made in the preseason and locked for the season; old saves move onto it once.
import test from "node:test";
import assert from "node:assert/strict";
import * as L from "../src/engine/league.js";
import { createPlayer, developPlayer } from "../src/engine/players.js";
import { seed } from "../src/engine/rng.js";
import { developmentWeek } from "../src/engine/development.js";
import { playExhibition } from "../src/engine/camp.js";
import { prospectReport, prospectReportNote } from "../src/engine/prospectWatch.js";
import {
  ensureDevPlan, setFocus, setCampPriority, setPlacement, lockPlan, developmentPlanWeek, focusExpected, focusChance,
  summerPlanBonus, campBonus, gamble, statusWord, placementSummer, placementOptions, projectSummer, sinceCamp,
  worthKnowing, FOCUS_WEEKS, DEV_SYSTEM_VERSION, ROLL_WEEK,
} from "../src/engine/developmentPlan.js";

const league = (s = 7) => { const lg = L.createLeague({ userAbbr: "EDM", seed: s, injuries: false }); return lg; };
const user = (lg) => lg.teams[lg.userTid];
let n = 0;
// A test player on a club (roster or prospects).
function add(lg, t, o = {}, farm = false) {
  const p = createPlayer({ name: `Test Player ${++n}`, pos: "C", ovr: 75, pot: 88, age: 21, tid: t.id, dev: "normal", ...o }, lg.year);
  p.signed = o.signed ?? true; p.yrs = 2; p.cap = 0.9; p.injury = 0;
  if (farm) p.assignment = o.assignment || "ahl";
  lg.players[p.id] = p;
  (farm ? t.prospects : t.roster).push(p.id);
  return p;
}
// One season of focus weeks for the plan's focus player.
function focusSeason(lg) {
  for (let w = 1; w <= FOCUS_WEEKS + 1; w++) { lg.day = w * 7; developmentPlanWeek(lg); }
}

test("focus player: the expected boost over a season follows the trait table (one player only)", () => {
  const lg = league();
  const t = user(lg);
  L.startRegularSeason(lg);
  // Expected by spring at 23 and under (the design table), and a 30-year-old Normal.
  const table = [["normal", 21, 1.7], ["star", 21, 2.2], ["superstar", 21, 2.9], ["generational", 20, 3.7], ["late", 22, 2.2], ["normal", 31, 0.3]];
  for (const [dev, age, want] of table) {
    let sum = 0;
    const runs = 120;
    for (let i = 0; i < runs; i++) {
      const p = add(lg, t, { dev, age, ovr: 74, pot: 90 });
      const plan = ensureDevPlan(lg);
      plan.focus = p.id; plan.focusWeek = 0; plan.gained = 0;
      const others = Object.fromEntries([...t.roster, ...t.prospects].filter((id) => id !== p.id).map((id) => [id, lg.players[id].ovr]));
      const start = p.ovr;
      focusSeason(lg);
      sum += p.ovr - start;
      assert.equal(plan.gained, p.ovr - start);
      assert.ok(p.pot >= p.ovr, "his ceiling rises with him");
      // Nobody else on the club moved: the focus is one player.
      for (const [id, o] of Object.entries(others)) assert.equal(lg.players[id].ovr, o, "only the focus player gains");
      t.roster = t.roster.filter((x) => x !== p.id);
      lg.day = 0;
    }
    const mean = sum / runs;
    assert.ok(Math.abs(mean - want) <= 0.45, `${dev} at ${age}: ${mean.toFixed(2)} vs ${want}`);
    assert.ok(Math.abs(focusExpected({ dev, age, ovr: 74 }) - want) <= 0.1, `${dev} at ${age}: the sheet shows ${focusExpected({ dev, age, ovr: 74 }).toFixed(2)}`);
  }
  // The last points come hard: nothing at 99, about +0.3 for a 96 Superstar of 31.
  assert.equal(focusChance({ dev: "generational", age: 29, ovr: 99 }), 0);
  assert.ok(Math.abs(focusExpected({ dev: "superstar", age: 31, ovr: 96 }) - 0.33) < 0.05);
});

test("focus player: chosen in the preseason, locked when the season starts", () => {
  const lg = league();
  const t = user(lg);
  const p = t.roster.map((id) => lg.players[id]).find((x) => x.age <= 24);
  assert.ok(setFocus(lg, p.id).ok);
  assert.equal(ensureDevPlan(lg).focus, p.id);
  assert.ok(lockPlan(lg).ok);
  assert.equal(setFocus(lg, t.roster[0]).ok, false, "locked in the preseason");
  L.startRegularSeason(lg);
  assert.equal(setFocus(lg, t.roster[0]).ok, false, "locked for the season");
  assert.equal(ensureDevPlan(lg).focus, p.id);
});

test("camp priority: a small summer bonus for the players it covers, on your club only", () => {
  const lg = league();
  const t = user(lg);
  const kid = add(lg, t, { age: 21 }), vet = add(lg, t, { age: 27 }), d = add(lg, t, { pos: "LD", age: 25 }), g = add(lg, t, { pos: "G", age: 24 });
  const ai = lg.teams.find((x) => x.id !== t.id);
  const aiKid = add(lg, ai, { age: 21 });
  const plan = ensureDevPlan(lg);
  assert.equal(plan.camp, "youth", "the staff default");
  assert.equal(campBonus(lg, kid), 0.5);
  assert.equal(campBonus(lg, vet), 0);
  assert.equal(campBonus(lg, aiKid), 0, "AI clubs get nothing");
  assert.ok(setCampPriority(lg, "defence").ok);
  assert.equal(campBonus(lg, d), 0.3); assert.equal(campBonus(lg, kid), 0);
  assert.ok(setCampPriority(lg, "goalies").ok);
  assert.equal(campBonus(lg, g), 0.4);
  assert.ok(setCampPriority(lg, "forwards").ok);
  assert.equal(campBonus(lg, kid), 0.3); assert.equal(campBonus(lg, vet), 0, "26 and under");
  // At the rollover (the plan's year is the season just played).
  lg.year++;
  assert.equal(summerPlanBonus(lg, kid).camp, 0.3);
  assert.equal(summerPlanBonus(lg, aiKid), null);
  lg.year--;
  // The bonus moves his summer mean by about that much (same seeds, room to his ceiling).
  const run = (bonus) => { seed(4242); let s = 0; for (let i = 0; i < 1500; i++) { const c = { ...kid, attrs: { ...kid.attrs }, age: 22, ovr: 70, pot: 90 }; s += developPlayer(c, bonus); } return s / 1500; };
  const diff = run(0.5) - run(0);
  assert.ok(diff > 0.35 && diff < 0.65, `youth camp moved the mean by ${diff.toFixed(2)}`);
});

test("placement gamble: the bar, the odds and the status word", () => {
  // Evan's example: an 18-year-old 58 on the AHL top line.
  const kid = { ovr: 58, age: 18 };
  const g = gamble(kid, "ahl", "top");
  assert.equal(g.bar, 74); assert.deepEqual([g.th, g.sd, g.st], [5, 20, 75]);
  assert.equal(statusWord(g), "Long shot");
  assert.ok(Math.abs(g.ev - -0.175) < 0.01, "about -0.2 expected");
  // Hirvonen, 19 and 68: junior top is the best bet, the AHL top line the gamble.
  const h = { ovr: 68, age: 19 };
  const jt = gamble(h, "junior", "top"), at = gamble(h, "ahl", "top");
  assert.equal(jt.th, 46); assert.ok(Math.abs(jt.ev - 0.9) < 0.1);
  assert.equal(at.th, 6); assert.equal(at.st, 54);
  assert.ok(Math.abs(at.ev - 0.1) < 0.1);
  assert.equal(statusWord({ st: 49 }), "Risky"); assert.equal(statusWord({ st: 35 }), "Risky"); assert.equal(statusWord({ st: 34 }), "Safe");
  // Too easy: he coasts.
  const easy = gamble({ ovr: 74, age: 21 }, "junior", "middle");
  assert.ok(easy.coast); assert.ok(Math.abs(easy.eff.thrive - 0.6) < 1e-9);
  // Typical placements are worth about what farm work was (+0.3 to +0.9); only reckless jumps lose.
  for (const [o, lv, rl] of [[66, "ahl", "middle"], [70, "ahl", "top"], [64, "europe", "middle"], [62, "junior", "top"]]) {
    const ev = gamble({ ovr: o, age: 20 }, lv, rl).ev;
    assert.ok(ev > 0.2 && ev < 1, `${o} ${lv} ${rl}: ${ev.toFixed(2)}`);
  }
});

test("placements: the staff place every prospect, the sheet offers Recommended / Safer / Bolder", () => {
  const lg = league();
  const t = user(lg);
  for (const id of t.prospects) { const p = lg.players[id]; assert.equal(p.placement.year, lg.year); assert.equal(p.placement.by, "staff"); }
  const p = add(lg, t, { age: 19, ovr: 68, pot: 80, pos: "LW" }, true);
  ensureDevPlan(lg);
  const o = placementOptions(p);
  assert.equal(`${o.rec.level}|${o.rec.role}`, "junior|top");
  assert.ok(o.safer.st <= o.rec.st && o.bolder.bar >= o.rec.bar);
  assert.ok(setPlacement(lg, p.id, "junior", "top").ok);
  assert.equal(p.assignment, "junior"); assert.equal(p.farmRole, "top"); assert.equal(p.placement.by, "you");
  assert.equal(setPlacement(lg, p.id, "college", "top").ok, false, "a signed pro can't go to college");
  lockPlan(lg);
  assert.equal(setPlacement(lg, p.id, "ahl", "top").ok, false, "locked");
});

test("placements: the outcome is rolled at week 4, follows the odds, nudges farm stats, and a struggling one can regress", () => {
  const lg = league();
  const t = user(lg);
  const kids = Array.from({ length: 300 }, () => add(lg, t, { age: 20, ovr: 66, pot: 80, pos: "C" }, true));
  ensureDevPlan(lg);
  for (const p of kids) setPlacement(lg, p.id, "ahl", "middle");
  L.startRegularSeason(lg);
  lg.day = 21; developmentPlanWeek(lg);
  assert.ok(kids.every((p) => !p.placement.outcome), "nothing before week 4");
  lg.day = ROLL_WEEK * 7; developmentPlanWeek(lg);
  const g = gamble(kids[0], "ahl", "middle");
  const share = (k) => kids.filter((p) => p.placement.outcome === k).length / kids.length;
  assert.ok(Math.abs(share("thrive") - g.th / 100) < 0.08, `thrive ${share("thrive")} vs ${g.th}%`);
  assert.ok(Math.abs(share("struggle") - g.st / 100) < 0.08, `struggle ${share("struggle")} vs ${g.st}%`);
  // A thriving prospect out-produces a struggling one on the same minutes.
  const pts = (outcome) => { const p = kids.find((x) => x.placement.outcome === outcome); p.farmStats = null; t.farmWeek = 0; return p; };
  const a = pts("thrive"), b = pts("struggle");
  b.ovr = a.ovr; b.farmRole = a.farmRole;
  lg.day = 26 * 7; developmentWeek(lg);
  const rate = (p) => (p.farmStats.g + p.farmStats.a) / Math.max(1, p.farmStats.gp);
  assert.ok(rate(a) > rate(b), `thrive ${rate(a).toFixed(2)} vs struggle ${rate(b).toFixed(2)}`);
  // Summer effects: +1.2 x minutes (0.6 when he coasts), +0.5 steady, -0.4 struggling.
  const p = kids[0];
  p.placement = { ...p.placement, role: "top", outcome: "struggle", gap: -4 };
  assert.ok(Math.abs(placementSummer(lg, p, lg.year) - -0.5) < 1e-9);
  p.placement.outcome = "thrive";
  assert.ok(placementSummer(lg, p, lg.year) > 1.2);
  // A 25-year-old at his ceiling who struggles in a top role is projected to slip, and does more often than not.
  const vet = add(lg, t, { age: 25, ovr: 70, pot: 70, pos: "C" }, true);
  ensureDevPlan(lg);
  vet.placement = { year: lg.year, level: "ahl", role: "top", by: "you", th: 30, sd: 45, st: 25, gap: -4, outcome: "struggle" };
  assert.ok(projectSummer(lg, t, vet) < 0, "projected to regress");
  lg.year++;
  const bonus = summerPlanBonus(lg, vet).place;
  lg.year--;
  assert.ok(bonus < 0);
  seed(77); let down = 0, up = 0, sum = 0;
  for (let i = 0; i < 400; i++) { const c = { ...vet, attrs: { ...vet.attrs }, age: 26 }; const d = developPlayer(c, bonus); sum += d; if (d < 0) down++; if (d > 0) up++; }
  assert.ok(sum < 0 && down > up * 2, `${down} regressed, ${up} improved, mean ${(sum / 400).toFixed(2)}`);
});

test("AI clubs are unaffected: no plans, no placements, no focus gains", () => {
  const lg = league();
  const t = user(lg);
  L.startRegularSeason(lg);
  const ai = lg.teams.filter((x) => x.id !== t.id);
  const before = {};
  for (const x of ai) for (const id of [...x.roster, ...x.prospects]) before[id] = lg.players[id].ovr;
  for (let w = 1; w <= 12; w++) { lg.day = w * 7; developmentPlanWeek(lg); }
  for (const x of ai) {
    assert.ok(!x.devPlan, `${x.abbr} has no plan`);
    for (const id of x.prospects) assert.ok(!lg.players[id].placement, "no placements on AI prospects");
    for (const id of [...x.roster, ...x.prospects]) assert.equal(lg.players[id].ovr, before[id]);
  }
  lg.year++;
  for (const x of ai) for (const id of x.prospects) assert.equal(summerPlanBonus(lg, lg.players[id]), null);
});

test("preseason games are for fun and form: no OVR changes", () => {
  const lg = league();
  const t = user(lg);
  const before = Object.fromEntries([...t.roster, ...t.prospects].map((id) => [id, lg.players[id].ovr]));
  for (let i = 0; i < 4; i++) assert.ok(playExhibition(lg).ok);
  for (const [id, o] of Object.entries(before)) assert.equal(lg.players[id].ovr, o);
});

test("the read-outs: up since camp, worth knowing, a monthly inbox line to Development", () => {
  const lg = league();
  L.startRegularSeason(lg);
  const t = user(lg);
  assert.deepEqual(sinceCamp(lg), { n: 0, up: 0, down: 0 });
  L.simDays(lg, 60);
  const s = sinceCamp(lg);
  assert.ok(s.n >= 0 && s.up >= 0);
  const rows = worthKnowing(lg);
  assert.ok(rows.length >= 2 && rows.length <= 5);
  assert.equal(rows[0].pid, ensureDevPlan(lg).focus, "the focus player leads");
  const note = lg.inbox.find((m) => /^📈 Development/.test(m.text));
  assert.ok(note, "a monthly line");
  assert.equal(note.open.tab, "development"); assert.equal(note.open.sub, "overview");
  assert.ok(!/Front Office → Development/.test(note.text));
  assert.ok(lg.moments.every((m) => !/development/i.test(m.kind || "") || lg.phase !== "regular"), "no development popups in season");
  void t;
});

test("audit fixes: farm goalies win, NHL rookies are graded against NHL scoring", () => {
  const lg = league();
  const t = user(lg);
  const g = add(lg, t, { pos: "G", age: 21, ovr: 72, pot: 80 }, true);
  g.farmRole = "middle";
  ensureDevPlan(lg);
  L.startRegularSeason(lg);
  for (let w = 1; w <= 26; w++) { lg.day = w * 7; developmentWeek(lg); }
  assert.ok(g.farmStats.gp >= 15);
  assert.ok(g.farmStats.w >= 3, `${g.farmStats.w} wins in ${g.farmStats.gp} starts`);
  // Howard: 16 points in 30 NHL games is a solid rookie, not a struggling one.
  const r = add(lg, t, { age: 21, ovr: 76 });
  r.stats.gp = 30; r.stats.g = 6; r.stats.a = 10; r.stats.pts = 16;
  assert.equal(prospectReport(lg, t, r).prod, "solid");
  void prospectReportNote;
});

test("old saves: the first focus slot becomes the focus player, camp SP data goes, prospects are placed (once)", () => {
  const lg = league();
  const t = user(lg);
  const ps = t.roster.map((id) => lg.players[id]).filter((p) => p.pos !== "G").slice(0, 3);
  // What a save from before the overhaul carries.
  delete lg.devSystemVersion; delete t.devPlan; delete t.devPlanPrev;
  for (const id of t.prospects) delete lg.players[id].placement;
  t.training = { assignments: { [ps[1].id]: "skating", [ps[0].id]: "shooting" }, earned: { [ps[1].id]: { skating: 20 } }, paid: 3, campYear: null, campReport: [] };
  for (const x of lg.teams) if (x.id !== t.id) x.training = { assignments: {}, earned: {}, paid: 3 };
  t.camp = { year: lg.year, games: [{ opp: "CGY", us: 3, them: 2 }], risk: true, devCamp: { pid: ps[2].id, name: ps[2].name, before: 70, after: 73 }, focused: [ps[2].id], group: "offense", battles: { C: { winner: "A", loser: "B" } } };
  t.battlesYear = lg.year; t.battleReport = [];
  ps[2].positionTraining = { to: "RD", weeks: 3 }; ps[2].campWork = 1;
  const back = L.deserializeLeague(L.serializeLeague(lg));
  const bt = back.teams[back.userTid];
  assert.equal(back.devSystemVersion, DEV_SYSTEM_VERSION);
  assert.equal(bt.devPlan.focus, ps[1].id, "the first focus slot");
  assert.equal(bt.devPlan.year, back.year);
  assert.ok(!bt.training && back.teams.every((x) => !x.training), "the slots and banked work are gone");
  assert.deepEqual(Object.keys(bt.camp).sort(), ["games", "risk", "year"]);
  assert.equal(bt.camp.games.length, 1, "preseason games stay");
  assert.ok(!bt.battlesYear && !back.players[ps[2].id].positionTraining && !back.players[ps[2].id].campWork);
  for (const id of bt.prospects) assert.equal(back.players[id].placement?.by, "staff");
  // Once only: a later choice survives the next load.
  const other = bt.roster.map((id) => back.players[id]).find((p) => p.id !== ps[1].id && p.ovr < 99);
  assert.ok(setFocus(back, other.id).ok);
  const again = L.deserializeLeague(L.serializeLeague(back));
  assert.equal(again.teams[again.userTid].devPlan.focus, other.id);
  // A mid-season save is locked with today as the camp baseline.
  const mid = league(9);
  L.startRegularSeason(mid); L.simDays(mid, 20);
  delete mid.devSystemVersion; delete mid.teams[mid.userTid].devPlan;
  for (const id of mid.teams[mid.userTid].prospects) delete mid.players[id].placement;
  const m2 = L.deserializeLeague(L.serializeLeague(mid));
  const plan = m2.teams[m2.userTid].devPlan;
  assert.ok(plan.locked && plan.campOvrs);
  assert.deepEqual(sinceCamp(m2), { n: 0, up: 0, down: 0 });
});
