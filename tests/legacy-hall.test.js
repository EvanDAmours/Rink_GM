// The Legacy Hall section (r19): the Stanley Cup shelf, the Player awards shelf (only what your
// players won with you as GM), the awards seasons and their one-stat tiles, and the hero counts.
import test from "node:test";
import assert from "node:assert/strict";
import { createLeague } from "../src/engine/league.js";
import { cupShelf, playerAwardShelf, awardSeasons, awardStat, legacyCounts, AWARD_ROWS } from "../src/engine/legacyHall.js";
import fs from "node:fs";
const sprites = fs.readFileSync(new URL("../src/ui/trophies.js", import.meta.url), "utf8");

const mtl = createLeague({ userAbbr: "MTL", seed: 1919 });
const sea = createLeague({ userAbbr: "SEA", seed: 1919 });

test("the Stanley Cup shelf holds the club's real Cups, oldest first, then the ones won in your league", () => {
  const cups = cupShelf(mtl);
  assert.equal(cups.length, 24, "Montreal's 24 Cups");
  assert.equal(cups.at(-1).plaque, "1993");
  assert.ok(cups.every((c, i) => !i || c.sort >= cups[i - 1].sort));
  assert.equal(cupShelf(sea).length, 0, "Seattle has none yet");
  const l = createLeague({ userAbbr: "SEA", seed: 7 });
  l.history = [{ year: l.year, champion: l.userTid, runnerUp: 0, presidents: 1, awards: {} }];
  const won = cupShelf(l);
  assert.equal(won.length, 1);
  assert.equal(won[0].plaque, `${l.year}–${String(l.year + 1).slice(2)}`);
  assert.match(won[0].line, /with you as GM/);
});

test("Player awards: one trophy per award with a count, only seasons you ran the club, never team trophies", () => {
  const l = createLeague({ userAbbr: "MTL", seed: 3 });
  const me = l.userTid, other = (me + 1) % 32;
  const y = l.year;
  const hart = (tid, name, pid) => ({ hart: { pid, name, tid, why: "50G 70A 120P" } });
  l.history = [
    { year: y + 1, champion: me, awards: { ...hart(me, "B", 2), stanley: { tid: me, team: true, name: "Club" }, vezina: { pid: 3, name: "G", tid: me, why: "40 W, .920 SV%" } } },
    { year: y, champion: other, awards: { ...hart(me, "A", 1), norris: { pid: 4, name: "D", tid: other } } },
    { year: y - 1, champion: other, awards: hart(me, "Before you", 9) },
  ];
  l.awards = null;
  const shelf = playerAwardShelf(l);
  assert.deepEqual(shelf.map((a) => a.kind), ["hart", "vezina"], "the Hart and Vezina; the Cup and another club's Norris don't count");
  assert.equal(shelf[0].n, 2, "two Harts, one badge");
  assert.deepEqual(shelf[0].winners.map((w) => w.name), ["B", "A"], "newest first; the season before you took over is left out");
  // a GM who moved clubs: only the years at this club
  l.career = { jobs: [{ tid: other, start: y - 1, end: y }, { tid: me, start: y + 1 }] };
  assert.equal(playerAwardShelf(l)[0].n, 1);
});

test("League awards: every season newest first, old saves get their Cup back, one stat per tile", () => {
  const l = createLeague({ userAbbr: "EDM", seed: 11 });
  l.history = [{ year: l.year - 1, champion: 5, runnerUp: 6, presidents: 7, awards: { hart: { pid: 1, name: "X", tid: 5, why: "50G 75A 125P" } } }];
  const s = awardSeasons(l);
  assert.equal(s.length, 1);
  assert.equal(s[0].awards.stanley.tid, 5);
  assert.equal(s[0].awards.presidents.tid, 7);
  assert.equal(awardStat("stanley", s[0].awards.stanley, s[0], l), `Beat ${l.teams[6].abbr} in the Final`);
  assert.equal(awardStat("stanley", {}, { runnerUp: 6, final: { wins: 4, losses: 2 } }, l), `Beat ${l.teams[6].abbr} 4-2`);
  assert.equal(awardStat("hart", { why: "50G 75A 125P" }), "125 pts");
  assert.equal(awardStat("vezina", { why: "49 W, .923 SV%, 2.13 GAA" }), ".923 SV%");
  assert.equal(awardStat("rocket", { why: "53 goals" }), "53 goals");
  assert.equal(awardStat("jennings", { why: "198 team goals against" }), "198 GA");
  assert.equal(awardStat("selke", { why: "+48, 49G 64A 113P" }), "+48");
  assert.equal(awardStat("jimGregory", { why: "122 points, up 41 on last season" }), "+41 pts");
  assert.equal(awardStat("willieORee", { why: "1 season of community work in Columbus" }), "1 season here");
  // the four rows cover every trophy the league hands out
  assert.equal(AWARD_ROWS.flatMap(([, , k]) => k).length, 21);
  for (const k of AWARD_ROWS.flatMap(([, , ks]) => ks)) assert.match(sprites, new RegExp(`\\b${k}: "`), `${k} has trophy art`);
});

test("the section hero counts Cups, retired numbers, Hall of Famers and seasons as GM", () => {
  const n = legacyCounts(mtl);
  assert.equal(n.cups, 24);
  assert.ok(n.numbers >= 15 && n.hof >= 10);
  assert.equal(n.seasons, 0, "a new GM has no seasons yet");
  assert.equal(legacyCounts(sea).cups, 0);
});
