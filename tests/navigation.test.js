// Navigation (1.86): Contracts is its own section, League folds teams/history/retired, the
// playoffs live in Standings, the phone bar is Home · Lineup · Standings · Development · More, and
// every way of opening a player lands on the one player sheet.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createLeague } from "../src/engine/league.js";
import { sectionsFor, sectionOf, screenOn, defaultSubs, route, playerSheetKind, fitSections } from "../src/ui/navRoute.js";
import { keyContracts, contractReminder } from "../src/engine/home.js";

const lg = createLeague({ userAbbr: "EDM", seed: 4242 });
const labels = (secs) => secs.map((s) => s.label);
const screens = (secs, id) => secs.find((s) => s.id === id).screens.map((x) => x[0]);
const sec = (phase) => sectionsFor({ ...lg, phase }, { deadlineOpen: false, frenzyOpen: false });
const src = (f) => fs.readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("the bar: Contracts is its own section; Season is schedule and stats; Standings holds the playoffs", () => {
  const s = sec("regular");
  assert.deepEqual(labels(s), ["Home", "Team", "Standings", "Season", "Development", "Draft", "Trades & FA", "Contracts", "Front Office", "Legacy Hall"]);
  assert.deepEqual(screens(s, "season"), ["Schedule", "Stats"]);
  assert.deepEqual(screens(s, "standings"), ["Standings", "Playoffs"]);
  assert.deepEqual(screens(s, "contracts"), ["Contracts"]);
  assert.deepEqual(screens(s, "office"), ["Front Office", "League", "Franchise History", "Record Book", "Transactions"]);
  assert.deepEqual(screens(s, "legacy"), ["Banners", "Trophies", "Hall of Fame", "Ring of Honour", "Records", "League awards"]);
  assert.ok(!screens(s, "market").includes("Re-sign"), "re-signing left Trades & FA");
  assert.deepEqual(screens(s, "draft"), ["Scouting", "Draft", "Your class"], "the Draft section: Scouting, the one Draft Day screen, Your class (r16)");
  // Re-sign week: the Re-sign screen comes first in Contracts, and Trades & FA keeps Free Agency.
  const r = sec("resign");
  assert.deepEqual(screens(r, "contracts"), ["Re-sign", "Contracts"]);
  assert.ok(screens(r, "market").includes("Free Agency"));
});

test("League is one tab for teams, history and the retired", () => {
  const s = sec("regular");
  for (const v of ["teams", "awards", "retired"]) assert.equal(sectionOf(s, "league", { league: v }).screen[0], "League", v);
  assert.equal(sectionOf(s, "league", { league: "records" }).screen[0], "Record Book");
  assert.equal(sectionOf(s, "league", { league: "tx" }).screen[0], "Transactions");
  assert.equal(sectionOf(s, "league", {}).screen[0], "League", "League opens on its teams");
});

test("the Legacy Hall is its own section (r19): old links land on its screens, Franchise History stays in Front Office", () => {
  const s = sec("regular");
  const at = (id, k) => { const [t, kk] = route(id, k, "regular"); return sectionOf(s, t, { ...(kk ? { [t]: kk } : {}) }); };
  assert.equal(sectionOf(s, "legacy", {}).screen[0], "Banners", "the Legacy Hall opens on its banners");
  assert.equal(sectionOf(s, "legacy", { legacy: "hall" }).screen[0], "Banners", "the old Rafters & Hall link opens Banners");
  assert.equal(at("trophies").screen[0], "Trophies", "the Cup moment's link opens the trophy shelf");
  assert.equal(at("legacy", "awards").screen[0], "League awards");
  assert.equal(at("legacy", "hof").section.label, "Legacy Hall");
  for (const v of ["club", "case", "gm"]) assert.equal(sectionOf(s, "legacy", { legacy: v }).section.label, "Front Office", v);
  assert.ok(!s.find((x) => x.id === "office").screens.some((x) => x[0] === "Legacy Hall"), "no Legacy Hall screen left in Front Office");
});

test("a section that doesn't fit the bar moves to the menu, last first, never the one you're on", () => {
  assert.deepEqual(fitSections([100, 100, 100], 400, 0), [true, true, true]);
  assert.deepEqual(fitSections([100, 100, 100], 250, 0), [true, true, false]);
  assert.deepEqual(fitSections([100, 100, 100], 250, 2), [true, false, true], "the current section stays");
  assert.deepEqual(fitSections([100, 100, 100], 150, 1), [false, true, false]);
});

test("Standings opens on the playoffs while they're on; Contracts on Re-sign in re-sign week", () => {
  const on = (phase, tab) => sectionOf(sec(phase), tab, defaultSubs({ phase })).screen[0];
  assert.equal(on("regular", "standings"), "Standings");
  assert.equal(on("preseason", "standings"), "Standings");
  assert.equal(on("playoffs", "standings"), "Playoffs");
  assert.equal(on("regular", "contracts"), "Contracts");
  assert.equal(on("resign", "contracts"), "Re-sign");
});

test("every old link lands on the new sections", () => {
  assert.deepEqual(route("playoffs", undefined, "regular"), ["standings", "playoffs"]);
  assert.deepEqual(route("standings", undefined, "regular"), ["standings", undefined]);
  assert.deepEqual(route("league", "standings", "regular"), ["standings", "table"]);
  assert.deepEqual(route("league", "playoffs", "playoffs"), ["standings", "playoffs"]);
  assert.deepEqual(route("league", "awards", "regular"), ["league", "awards"]);
  assert.deepEqual(route("league", undefined, "regular"), ["league", "teams"]);
  assert.deepEqual(route("frontoffice", "contracts", "regular"), ["contracts", "contracts"]);
  assert.deepEqual(route("frontoffice", "owner", "regular"), ["frontoffice", "owner"]);
  assert.deepEqual(route("contracts", "contracts", "regular"), ["contracts", "contracts"]);
  assert.deepEqual(route("contracts", "resign", "regular"), ["contracts", "contracts"], "no Re-sign screen outside re-sign week");
  assert.deepEqual(route("contracts", "resign", "resign"), ["contracts", "resign"]);
  assert.deepEqual(route("freeagency", undefined, "resign"), ["contracts", "resign"], "re-sign week: free agency means re-signing");
  assert.deepEqual(route("freeagency", undefined, "freeagency"), ["trade", "fa"]);
  assert.deepEqual(route("trade", "fa", "regular"), ["trade", "fa"]);
  assert.deepEqual(route("trade", undefined, "regular"), ["trade", "trade"]);
  assert.deepEqual(route("roster", "injured", "regular"), ["lines", "roster"]);
  assert.deepEqual(route("season", "stats", "regular"), ["stats"]);
  assert.deepEqual(route("season", "playoffs", "playoffs"), ["standings", "playoffs"]);
  // Every route lands on a screen of the bar (or a menu screen).
  const s = sec("resign");
  for (const [id, k] of [["playoffs"], ["standings"], ["contracts"], ["freeagency"], ["resign"], ["frontoffice", "contracts"], ["league", "awards"], ["league", "retired"], ["records"], ["operations"], ["block"], ["roster"], ["schedule"], ["stats"]]) {
    const [t, kk] = route(id, k, "resign");
    const sub = { ...defaultSubs({ phase: "resign" }), ...(kk ? { [t]: kk } : {}) };
    assert.ok(sectionOf(s, t, sub), `${id}/${k} → ${t}/${kk} is on the bar`);
  }
});

test("the home screen's contract reminders point at the Contracts section", () => {
  const l = createLeague({ userAbbr: "EDM", seed: 99 });
  l.phase = "regular";
  const t = l.teams[l.userTid];
  t.rec.gp = 50;
  for (const id of t.roster.slice(0, 6)) l.players[id].yrs = 1;
  const r = contractReminder(l);
  assert.ok(keyContracts(l).length > 0 && r, "six expiring regulars make a reminder");
  assert.deepEqual(r.to, ["contracts", "contracts"]);
  const [tt, kk] = route(...r.to, l.phase);
  assert.equal(sectionOf(sectionsFor(l, {}), tt, { [tt]: kk }).section.label, "Contracts");
});

test("the phone bar is Home · Lineup · Standings · Development · More with line icons", () => {
  const app = src("App.jsx");
  const nav = /const phoneNav = \[([\s\S]*?)\n  \];/.exec(app);
  assert.ok(nav, "App.jsx builds phoneNav");
  assert.deepEqual([...nav[1].matchAll(/label: "([^"]+)"/g)].map((m) => m[1]), ["Home", "Lineup", "Standings", "Development"]);
  const icons = [...nav[1].matchAll(/icon: "([^"]+)"/g)].map((m) => m[1]);
  const iconSrc = src("ui/Icon.jsx");
  for (const i of icons) assert.match(iconSrc, new RegExp(`\\n ${i}:<`), `icon ${i} is drawn`);
  assert.match(src("ui/MobileShell.jsx"), /label: "More", more: true/);
});

test("ONE player sheet: every way of opening a player resolves to PlayerSheet", () => {
  // the kinds of player it draws
  const pid = lg.teams[lg.userTid].roster[0];
  assert.equal(playerSheetKind(lg, pid), "live");
  assert.equal(playerSheetKind(lg, lg.draftClass[0]), "prospect");
  const gone = { ...lg, retirementArchive: [{ pid: "ret-1", name: "Old Timer", tid: lg.userTid, year: 2026 }] };
  assert.equal(playerSheetKind(gone, "ret-1"), "archived", "retired players open their archived card in the same sheet");
  assert.equal(playerSheetKind(lg, "nobody"), "missing");
  // App draws the player modal with PlayerSheet only, and nothing guards out retired players
  const app = src("App.jsx");
  const playerModals = [...app.matchAll(/modal\?\.type === "player"[^\n]*/g)].map((m) => m[0]);
  assert.equal(playerModals.length, 1);
  assert.match(playerModals[0], /<PlayerSheet pid=\{modal\.id\} context=\{modal\.context\} \/>/);
  assert.ok(!/league\.players\[modal\.id\] &&/.test(playerModals[0]));
  assert.match(app, /openPlayer: \(id, context\) => id != null && setModal\(\{ type: "player", id, context \}\)/);
  // the old popups are gone, and the card bodies are drawn only inside the sheet
  const ui = path.join(path.dirname(new URL(import.meta.url).pathname), "../src/ui");
  assert.ok(!fs.existsSync(path.join(ui, "PlayerModal.jsx")) && !fs.existsSync(path.join(ui, "ArchivedPlayerCard.jsx")));
  const files = [];
  const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.jsx?$/.test(f)) files.push(p); } };
  walk(ui);
  files.push(path.join(ui, "../App.jsx"));
  for (const f of files) {
    const s = fs.readFileSync(f, "utf8"), name = path.basename(f);
    if (name !== "PlayerSheet.jsx") {
      assert.ok(!/<PlayerCardBody\b/.test(s), `${name} draws the card body outside the sheet`);
      assert.ok(!/<ProspectProfile\b/.test(s) || name === "ProspectProfile.jsx", `${name} draws a prospect profile outside the sheet`);
      assert.ok(!/<PlayerSheet\b/.test(s) || name === "App.jsx", `${name} opens its own player sheet`);
    }
    // a screen opens a player only through the game's openPlayer (no private player popups)
    assert.ok(!/type: ?"player"/.test(s) || name === "App.jsx", `${name} sets a player modal itself`);
    assert.ok(!/openPlayer\s*[:=]\s*\(/.test(s) || name === "App.jsx", `${name} defines its own openPlayer`);
  }
});
