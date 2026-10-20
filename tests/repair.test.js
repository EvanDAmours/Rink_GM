import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../src/engine/league.js";
import { repairLeague, repairSummary, loadRepaired } from "../src/engine/repair.js";
import { backupSave, backupInfo, loadBackup, dropBackup, restoreBackupRaw, BACKUP_KEY } from "../src/engine/saveSlots.js";
import { SAVE_KEY } from "../src/engine/constants.js";
import { simPlayoffDay } from "../src/engine/playoffs.js";
import { simDraftToUser } from "../src/engine/draft.js";
import { simFADay } from "../src/engine/offseason.js";

const league = () => L.createLeague({ userAbbr: "EDM", seed: 321 });

test("repairLeague leaves a sound league alone, through a whole season and off-season", () => {
  const lg = league();
  const before = JSON.stringify(lg.players);
  assert.deepEqual(repairLeague(lg), [], "new league");
  // A healthy player's record is never rewritten.
  assert.equal(JSON.stringify(lg.players), before);
  L.startRegularSeason(lg);
  for (let i = 0; i < 30; i++) L.simDay(lg);
  assert.deepEqual(repairLeague(lg), [], "mid-season");
  L.simRestOfSeason(lg);
  L.endRegularSeason(lg);
  let guard = 0;
  while (lg.playoffs.champion == null && guard++ < 120) simPlayoffDay(lg);
  assert.deepEqual(repairLeague(lg), [], "after the Final");
  L.finishPlayoffs(lg);
  simDraftToUser(lg, { all: true });
  assert.deepEqual(repairLeague(lg), [], "after the draft");
  L.completeDraft(lg);
  L.goToFreeAgency(lg);
  while (!simFADay(lg)) {}
  assert.deepEqual(repairLeague(lg), [], "free agency");
  L.beginNextSeason(lg);
  assert.deepEqual(repairLeague(lg), [], "next preseason");
});

test("repairLeague fixes dangling ids, duplicates, broken ratings and unknown traits", () => {
  const lg = league();
  const t = lg.teams[lg.userTid], o = lg.teams[(lg.userTid + 1) % 32];
  const [a, b, c, d] = t.roster;
  const mcdavid = Object.values(lg.players).find((p) => p.name === "Connor McDavid");
  t.roster.push("ghost-1", a);                 // a dangling id and a duplicate
  o.roster.push(b);                            // listed by two clubs
  t.prospects.push(c);                         // on the roster and the prospect list
  lg.players[d].ovr = NaN;
  lg.players[d].age = "old";
  lg.players[a].dev = "generational";          // a trait the game doesn't know
  lg.freeAgents.push(b, "ghost-2", lg.freeAgents[0]);
  lg.players.broken = null;
  lg.players.nopos = { id: "nopos", name: "Mystery", pos: "QB" };
  o.lines = { F: "bad" };
  lg.inbox.push({ year: lg.year, day: 0 }, "a plain string");
  lg.news.push(null);
  const fixes = repairLeague(lg);
  assert.ok(fixes.length >= 8, fixes.join(" | "));
  assert.ok(!t.roster.includes("ghost-1"));
  assert.equal(t.roster.filter((id) => id === a).length, 1);
  assert.ok(!o.roster.includes(b) && t.roster.includes(b), "kept by the club his record names");
  assert.ok(!t.prospects.includes(c));
  assert.ok(Number.isFinite(lg.players[d].ovr) && lg.players[d].ovr >= 40 && lg.players[d].ovr <= 99);
  assert.equal(typeof lg.players[d].age, "number");
  assert.ok(["superstar", "star", "normal", "late"].includes(lg.players[a].dev));
  assert.ok(!lg.freeAgents.includes(b) && !lg.freeAgents.includes("ghost-2"));
  assert.equal(new Set(lg.freeAgents).size, lg.freeAgents.length);
  assert.ok(!("broken" in lg.players) && !("nopos" in lg.players));
  assert.equal(o.lines, null, "unreadable lines are rebuilt");
  assert.ok(lg.inbox.every((x) => typeof x.text === "string"));
  assert.ok(lg.inbox.some((x) => x.text === "a plain string"));
  assert.ok(lg.news.every(Boolean));
  // Published ratings are untouched.
  assert.equal(mcdavid.ovr, 99);
  assert.equal(mcdavid.number, 97);
  assert.equal(mcdavid.attrs.spw, 92);
  // A second pass has nothing left to do, and the summary reads as a sentence.
  assert.deepEqual(repairLeague(lg), []);
  assert.match(repairSummary(fixes), /^🔧 Your save was repaired: .+; and \d+ more fixes\.$/);
  // The league still saves and loads.
  assert.ok(L.restoreLeague(JSON.parse(JSON.stringify(lg))));
});

// A tiny localStorage with a size limit, so quota failures can be tested.
function fakeStorage(limit = Infinity) {
  const m = new Map();
  const size = () => [...m].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      const old = m.get(k);
      m.set(k, String(v));
      if (size() > limit) { if (old == null) m.delete(k); else m.set(k, old); const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; }
    },
    removeItem: (k) => m.delete(k),
    get length() { return m.size; },
  };
}

test("phase backups copy the packed autosave, restore it, and fail quietly when storage is full", () => {
  const saved = globalThis.localStorage;
  try {
    const lg = league();
    globalThis.localStorage = fakeStorage();
    assert.equal(backupSave(lg, "the 2026-27 preseason"), false, "nothing to back up before the first save");
    assert.ok(L.saveLeague(lg));
    assert.ok(backupSave(lg, "the 2026-27 preseason"));
    assert.equal(localStorage.getItem(BACKUP_KEY), localStorage.getItem(SAVE_KEY), "the same packed, compressed save");
    const info = backupInfo();
    assert.equal(info.label, "the 2026-27 preseason");
    assert.match(info.team, /Edmonton/);
    assert.ok(info.savedAt > 0);
    // Play on, then go back.
    L.startRegularSeason(lg);
    L.simDay(lg);
    assert.ok(L.saveLeague(lg));
    const back = loadBackup();
    assert.equal(back.phase, "preseason");
    assert.ok(restoreBackupRaw());
    assert.equal(L.loadLeague().phase, "preseason");

    // Storage that can hold the autosave but not a second copy: the backup is skipped,
    // the autosave and the old backup are untouched, nothing throws.
    const raw = localStorage.getItem(SAVE_KEY);
    globalThis.localStorage = fakeStorage(raw.length * 1.5 + 200);
    localStorage.setItem(SAVE_KEY, raw);
    assert.equal(backupSave(lg, "the 2026-27 playoffs"), false);
    assert.equal(localStorage.getItem(SAVE_KEY), raw);
    assert.equal(backupInfo(), null);
    assert.equal(dropBackup(), false);
    // No storage at all (private mode, sandboxed viewer).
    globalThis.localStorage = undefined;
    assert.equal(backupSave(lg, "x"), false);
    assert.equal(backupInfo(), null);
    assert.equal(loadBackup(), null);
    assert.equal(restoreBackupRaw(), false);
    assert.equal(dropBackup(), false);
  } finally {
    globalThis.localStorage = saved;
  }
});

test("a save with one broken player record still loads, repaired, instead of being rejected", () => {
  const lg = league();
  const t = lg.teams[lg.userTid];
  lg.players[t.roster[3]].ovr = NaN;            // saved as null: the league check rejects it
  lg.players.empty = null;
  t.roster.push("ghost");
  const text = L.exportLeagueText(lg);
  assert.equal(L.deserializeLeague(text), null, "the plain loader gives up on it");
  const { league: back, fixes } = loadRepaired(text);
  assert.ok(back, "the repairing loader reads it");
  assert.ok(fixes.some((f) => /overall rating/.test(f)) && fixes.some((f) => /unreadable player record/.test(f)) && fixes.some((f) => /missing player/.test(f)), fixes.join(" | "));
  assert.ok(Number.isFinite(back.players[t.roster[3]].ovr));
  assert.ok(!back.teams[back.userTid].roster.includes("ghost"));
  // Anything that isn't a Rink GM save is still turned away.
  assert.equal(loadRepaired(JSON.stringify({ teams: [], players: {} })).league, null);
  assert.equal(loadRepaired("not a save").league, null);
  assert.equal(loadRepaired(null).league, null);
});
