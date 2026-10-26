import test from "node:test";
import assert from "node:assert/strict";
import { createLeague, serializeLeague, deserializeLeague } from "../src/engine/league.js";
import { ensureDraftHistory, realDraftRecord } from "../src/engine/realDraft.js";
import { REAL_DRAFT } from "../src/data/realDraft.js";
import { snapshotRng } from "../src/engine/rng.js";

const byName = (lg, name) => Object.values(lg.players).find((p) => p.name === name);
const abbr = (lg, tid) => lg.teams[tid]?.abbr;

test("real draft data covers every shipped roster player", () => {
  assert.equal(Object.keys(REAL_DRAFT).length, 797);
  assert.deepEqual(realDraftRecord("Connor McDavid", "C"), [2015, 1, 1, "EDM"]);
});

test("a new real league carries real draft records", () => {
  const lg = createLeague({ seed: 7 });
  const mc = byName(lg, "Connor McDavid");
  assert.deepEqual({ ...mc.draft, tid: abbr(lg, mc.draft.tid) }, { year: 2015, round: 1, pick: 1, tid: "EDM", abbr: "EDM" });
  assert.equal(mc.ovr, 99); assert.equal(mc.number, 97);
  const checks = { "Leon Draisaitl": [2014, 1, 3, "EDM"], "Zach Hyman": [2010, 5, 123, "FLA"], "Mark Stone": [2010, 6, 178, "OTT"],
    "Auston Matthews": [2016, 1, 1, "TOR"], "Nikita Kucherov": [2011, 2, 58, "TBL"], "Kirill Kaprizov": [2015, 5, 135, "MIN"] };
  for (const [name, [year, round, pick, club]] of Object.entries(checks)) {
    const p = byName(lg, name);
    assert.deepEqual([p.draft.year, p.draft.round, p.draft.pick, abbr(lg, p.draft.tid)], [year, round, pick, club], name);
  }
  // Relocated franchise: Kane went first overall to Atlanta; the pick belongs to Winnipeg now.
  const kane = byName(lg, "Evander Kane");
  if (kane) { assert.equal(kane.draft.abbr, "ATL"); assert.equal(abbr(lg, kane.draft.tid), "WPG"); }
  for (const name of ["Artemi Panarin", "Mats Zuccarello", "Sergei Bobrovsky"]) {
    const p = byName(lg, name);
    assert.equal(p.draft, null, name); assert.equal(p.undrafted, true, name);
  }
  // Every real player has a record; generated depth players get an estimate (flagged) or undrafted.
  const real = Object.values(lg.players).filter((p) => ["ea27", "est"].includes(p.src));
  assert.ok(real.length > 700);
  assert.ok(real.every((p) => p.draft?.year || p.undrafted), "real players without draft info");
  const gen = Object.values(lg.players).filter((p) => p.src === "gen" && p.tid !== -2);
  assert.ok(gen.length > 0 && gen.every((p) => (p.draft?.est && p.draft.year === lg.year - p.age + 18) || p.undrafted));
  assert.ok(lg.draftClass.every((id) => !lg.players[id].draft && !lg.players[id].undrafted), "upcoming class untouched");
});

test("draft history never draws from the game's random stream", () => {
  const lg = createLeague({ seed: 11 });
  for (const p of Object.values(lg.players)) { delete p.draft; delete p.undrafted; }
  lg.draftHistoryVersion = 0;
  const before = JSON.stringify(snapshotRng());
  const ratings = JSON.stringify(Object.values(lg.players).map((p) => [p.id, p.ovr, p.pot]));
  ensureDraftHistory(lg);
  assert.equal(JSON.stringify(snapshotRng()), before);
  assert.equal(JSON.stringify(Object.values(lg.players).map((p) => [p.id, p.ovr, p.pot])), ratings);
});

test("an older save gets draft history once on load", () => {
  const lg = createLeague({ seed: 3 });
  for (const p of Object.values(lg.players)) { if (!lg.draftClass.includes(p.id)) { p.draft = null; delete p.undrafted; } }
  delete lg.draftHistoryVersion;
  const loaded = deserializeLeague(serializeLeague(lg));
  assert.ok(loaded);
  assert.equal(loaded.draftHistoryVersion, 1);
  assert.equal(byName(loaded, "Connor McDavid").draft.pick, 1);
  assert.equal(byName(loaded, "Artemi Panarin").undrafted, true);
  // Once only: a later edit survives another load.
  byName(loaded, "Connor McDavid").draft = null;
  const again = deserializeLeague(serializeLeague(loaded));
  assert.equal(byName(again, "Connor McDavid").draft, null);
});
