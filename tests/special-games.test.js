import { test } from "node:test";
import assert from "node:assert/strict";
import { specialFor, specialDayMoments, SPECIAL_EVENTS } from "../src/engine/specialGames.js";

const teams = ["EDM", "CGY", "BOS", "NYR"].map((abbr, id) => ({ id, abbr }));
const lg = (start, schedule) => ({ year: 2026, scheduleStart: start, teams, schedule, phase: "regular", userTid: 0, players: {}, moments: [] });
const dayFor = (start, iso) => Math.round((Date.parse(iso) - Date.parse(start)) / 86400000);

test("special games come from the date: one Winter Classic, every Halloween game", () => {
  const s = "2026-10-07";
  const jan1 = dayFor(s, "2027-01-01"), oct31 = dayFor(s, "2026-10-31");
  const sched = [{ id: 1, day: jan1, h: 2, a: 3 }, { id: 2, day: jan1, h: 0, a: 1 }, { id: 3, day: oct31, h: 0, a: 2 }, { id: 4, day: oct31, h: 1, a: 3 }, { id: 5, day: 3, h: 0, a: 1 }];
  const l = lg(s, sched);
  assert.equal(specialFor(l, sched[0]), "winterclassic");
  assert.equal(specialFor(l, sched[1]), null);
  assert.equal(specialFor(l, sched[2]), "halloween");
  assert.equal(specialFor(l, sched[3]), "halloween");
  assert.equal(specialFor(l, sched[4]), null);
  for (const k of Object.keys(SPECIAL_EVENTS)) assert.ok(SPECIAL_EVENTS[k].name);
});

test("the title card queues the evening before and is dropped once the game is played", () => {
  const s = "2026-10-07";
  const oct31 = dayFor(s, "2026-10-31");
  const g = { id: 9, day: oct31, h: 0, a: 1, played: false };
  const l = lg(s, [g]);
  l.day = oct31 - 1;
  const pre = specialDayMoments(l, []);
  assert.equal(pre.length, 1);
  assert.equal(pre[0].kind, "special-intro");
  l.moments.push(pre[0]);
  l.day = oct31; g.played = true; g.hs = 3; g.as = 2;
  const post = specialDayMoments(l, [g]);
  assert.equal(post[0].kind, "special-result");
  assert.equal(post[0].won, true);
  assert.equal(l.moments.length, 0);
  l.phase = "playoffs";
  assert.deepEqual(specialDayMoments(l, [g]), []);
});
