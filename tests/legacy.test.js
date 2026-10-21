import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../src/engine/league.js";
import { legacyOf, hofWorthy, franchiseBoard, franchiseRanks, accoladesOf, accoladeText, checkFranchiseLeaders, gmCareer, GM_GREATS, buildDocumentary, filmDocumentaries, recordPace } from "../src/engine/legacy.js";
import { archiveRetirement, inductHall, retireNumber, stampHonours } from "../src/engine/dynasty.js";
import { RETIRED_NUMBERS, HALL_OF_FAME } from "../src/data/hallOfFame.js";
import { FRANCHISE_CAREER } from "../src/data/franchiseCareer.js";

const lg = L.createLeague({ userAbbr: "EDM", seed: 3 });
const find = (n) => Object.values(lg.players).find((p) => p.name === n);

test("real data: every club has a retired-number and Hall list; career data parses", () => {
  for (const t of lg.teams) { assert.ok(Array.isArray(RETIRED_NUMBERS[t.abbr]), t.abbr); assert.ok(Array.isArray(HALL_OF_FAME[t.abbr]), t.abbr); }
  assert.equal(FRANCHISE_CAREER.EDM.sk[0][0], "Wayne Gretzky");
  assert.ok(RETIRED_NUMBERS.EDM.some(([n]) => n === 99));
});

test("franchise board merges real history with current players' pre-2026 totals", () => {
  const b = franchiseBoard(lg, "EDM", "pts", 10);
  assert.equal(b[0].name, "Wayne Gretzky");
  assert.equal(b.length, 10);
  const mcd = find("Connor McDavid");
  if (mcd) { const r = franchiseRanks(lg, mcd).find((x) => x.key === "pts"); assert.ok(r && r.rank === 2, "McDavid second in Oilers points"); }
  // Clubs without the long list fall back to the top-3 records.
  assert.ok(franchiseBoard(lg, "SEA", "g", 10).length >= 1);
});

test("legacy score counts a real star's pre-league career; Hall waits three years", () => {
  const cros = find("Sidney Crosby");
  const L1 = legacyOf(cros || { name: "Sidney Crosby", pos: "C", ovr: 90, career: [], src: "ea27" });
  assert.ok(L1.pre >= 80 && hofWorthy(L1));
  const gen = legacyOf({ name: "Nobody", pos: "C", ovr: 70, src: "gen", career: [] });
  assert.ok(!hofWorthy(gen));
  if (cros) {
    archiveRetirement(lg, cros, { gp: 0, g: 0, a: 0, w: 0 });
    const y = lg.year; lg.year = y + 2; assert.equal(inductHall(lg).filter((h) => h.pid === cros.id).length, 0);
    lg.year = y + 3; assert.equal(inductHall(lg).filter((h) => h.pid === cros.id).length, 1);
    lg.year = y;
  }
});

test("a star retiring from your club prompts a number retirement", () => {
  const p = find("Connor McDavid") || lg.players[lg.teams[lg.userTid].roster[0]];
  const before = (lg.numberPrompts || []).length;
  archiveRetirement(lg, p, { gp: 0, g: 0, a: 0, w: 0 });
  assert.equal(lg.numberPrompts.length, before + 1);
  lg.teams[lg.userTid].roster = lg.teams[lg.userTid].roster.filter((id) => id !== p.id);
  const r = retireNumber(lg, p.id);
  assert.ok(r.ok, r.msg);
  assert.ok(!lg.numberPrompts.some((x) => x.pid === p.id));
});

test("accolades read honours and All-Star selections", () => {
  const p = lg.players[lg.teams[0].roster[0]];
  lg.allNHL = { year: lg.year, first: [{ pid: p.id, tid: p.tid }], second: [] };
  lg.awards = { hart: { pid: p.id, tid: p.tid, name: p.name } };
  stampHonours(lg);
  const acc = accoladesOf(lg, p);
  assert.ok(acc.some((a) => a.k === "hart") && acc.some((a) => a.k === "allNHL1"));
  assert.match(accoladeText(acc[0]), /\d{4}-\d{2}/);
});

test("franchise leader passing makes news once; record pace; GM legacy; documentary", () => {
  checkFranchiseLeaders(lg);
  const n = (lg.news || []).length;
  checkFranchiseLeaders(lg);
  assert.equal((lg.news || []).length, n);
  const t = lg.teams[0]; t.rec.gp = 41;
  assert.deepEqual(recordPace(lg, { value: 92 }, 46, 0), { pace: 92, pct: 50, on: true });
  const c = gmCareer(lg);
  assert.equal(c.seasons, 0); assert.ok(c.rank >= 1 && c.rank <= GM_GREATS.length + 1);
  lg.seasonArchive = [0, 1, 2, 3, 4].map((i) => ({ year: 2026 + i, teams: [{ tid: lg.userTid, rec: { w: 45, l: 30, otl: 7, pts: 97 + i }, playoff: "R1" }], leaders: [] }));
  const d = buildDocumentary(lg, 2026, 2030);
  assert.equal(d.w, 225); assert.ok(d.chapters.length >= 3);
  lg.startYear = 2026; lg.documentaries = [];
  assert.equal(filmDocumentaries(lg).length, 1); assert.equal(filmDocumentaries(lg).length, 0);
});
