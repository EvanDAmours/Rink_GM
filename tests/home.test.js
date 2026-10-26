// Home screen logic (engine/home.js): the Needs Attention list and its one-tap fixes, the matchup's
// star players and puck-drop line, and the off-season board.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../src/engine/league.js";
import { needsAttention, runFix, sortAttention, topPlayer, kickoffText, primeTime, offseasonBoard, signedForNextSeason, TONE_RANK } from "../src/engine/home.js";
import { ensureDevPlan } from "../src/engine/developmentPlan.js";
import { capSpace, counts } from "../src/engine/roster.js";
import { teamNeeds } from "../src/engine/teamPlanning.js";
import { MAX_ROSTER } from "../src/engine/constants.js";

const league = () => L.createLeague({ userAbbr: "EDM", seed: 4242 });
const userTeam = (lg) => lg.teams[lg.userTid];
const isSorted = (items) => items.every((it, i) => i === 0 || TONE_RANK[items[i - 1].tone] <= TONE_RANK[it.tone]);

test("Needs Attention: urgent first, then decisions, then news, keeping the order within each", () => {
  const raw = [
    { key: "a", tone: "info" }, { key: "b", tone: "action" }, { key: "c", tone: "urgent" },
    { key: "d", tone: "action" }, { key: "e", tone: "urgent" }, { key: "f", tone: "info" },
  ];
  assert.deepEqual(sortAttention(raw).map((x) => x.key), ["c", "e", "b", "d", "a", "f"]);

});

// Batch x2: the sidebar only lists what would stop the sim or cause a real problem. Nags (Gazette,
// development focus, camp, game plan, contract years, expiring deals) are gone; a healthy club is "All set".
test("Needs Attention: a legal club in the preseason has nothing on the list (no nags)", () => {
  const lg = league();
  const t = userTeam(lg);
  (lg.papers ||= []).push({ id: "preview:2026:1", edition: "SEASON PREVIEW", headline: "The season starts", seen: false });
  const items = needsAttention(lg);
  for (const k of ["paperpreview:2026:1", "devfocus", "camp", "plan", "expiring"]) assert.ok(!items.some((x) => x.key === k), `${k} is a nag`);
  assert.ok(!items.some((x) => /^cy/.test(x.key)), "no contract-year nags");
  // r12: the only non-blockers are the reminder board's rows (tests/reminders.test.js).
  for (const it of items) assert.ok(it.tone === "urgent" || /^rm/.test(it.key), `${it.key} is not a blocker or a reminder`);
});

test("Needs Attention: over the cap is one urgent item, not two", () => {
  const lg = league();
  const t = userTeam(lg);
  const star = t.roster.map((id) => lg.players[id]).sort((a, b) => b.cap - a.cap)[0];
  delete star.salarySchedule;
  for (let i = 0; i < 5 && capSpace(lg, t) >= 0; i++) star.cap += 15;
  assert.ok(capSpace(lg, t) < 0, "the club is over the cap");
  const items = needsAttention(lg);
  assert.equal(items[0].key, "cap");
  assert.equal(items[0].tone, "urgent");
  assert.equal(items.filter((x) => /cap/i.test(x.title)).length, 1, "the roster issue doesn't repeat the cap item");
});

// The old "fill the focus slots" fix now locks in the staff's season plan (one focus player).
test("one-tap fix: the old development fix locks in the staff's season plan (not listed any more)", () => {
  const lg = league();
  lg.phase = "preseason";
  assert.ok(!needsAttention(lg).some((x) => x.key === "devfocus"), "an unlocked plan is not a blocker");
  const r = runFix(lg, "autoFocus");
  assert.ok(r.ok);
  const plan = ensureDevPlan(lg);
  assert.ok(plan.locked);
  assert.equal(lg.players[plan.focus]?.tid, userTeam(lg).id, "the staff picked one of your players");
});

test("one-tap fix: an injured regular without coach lines offers Auto-set lines, and it fills his spot", () => {
  const lg = league();
  L.startRegularSeason(lg);
  lg.settings.coachLines = false;
  const t = userTeam(lg);
  const lines = t.lines;
  const hurt = lg.players[lines.F[0][1]];
  assert.ok(hurt.ovr >= 80, "a first-line center is a regular");
  hurt.injury = 8;
  hurt.injuryNote = "upper-body injury";
  const item = needsAttention(lg).find((x) => x.key === `inj${hurt.id}`);
  assert.ok(item, "the injured regular is listed");
  assert.equal(item.tone, "action");
  assert.match(item.sub, /Upper-body injury/);
  assert.deepEqual(item.fixes.map((f) => f.fix), ["autoLines"]);
  runFix(lg, "autoLines");
  assert.ok(!t.lines.F.flat().includes(hurt.id), "the injured player is out of the saved lines");
  assert.equal(t.lines.F.flat().filter(Boolean).length, 12, "every forward slot is filled");
  // With the head coach setting the lines, a covered injury is news for the weekly injury card,
  // not a to-do (Gridiron 3.70).
  lg.settings.coachLines = true;
  assert.equal(needsAttention(lg).find((x) => x.key === `inj${hurt.id}`), undefined);
});

test("one-tap fix: too many players on the NHL roster are sent down without waivers", () => {
  const lg = league();
  const t = userTeam(lg);
  const extra = t.prospects.map((id) => lg.players[id]).filter((p) => p.signed !== false).slice(0, 3);
  for (const p of extra) { t.prospects = t.prospects.filter((id) => id !== p.id); t.roster.push(p.id); p.assignment = "nhl"; }
  if (counts(lg, t).active <= MAX_ROSTER) return; // the club had room: nothing to fix
  const item = needsAttention(lg).find((x) => /active players/.test(x.title));
  assert.ok(item, "the roster limit is on the list");
  assert.deepEqual(item.fixes.map((f) => f.fix), ["sendDown"]);
  const before = counts(lg, t).active;
  const r = runFix(lg, "sendDown");
  assert.ok(typeof r.msg === "string" && r.msg.length);
  assert.ok(counts(lg, t).active <= before);
  assert.equal(lg.waivers?.filter((w) => !w.done && lg.players[w.pid]?.tid === t.id).length || 0, 0, "the one-tap fix never puts anyone on waivers");
});

test("the matchup shows each club's best healthy player, and McDavid keeps his published rating", () => {
  const lg = league();
  const t = userTeam(lg);
  const best = topPlayer(lg, t);
  assert.equal(best.name, "Connor McDavid");
  assert.equal(best.ovr, 99);
  assert.equal(best.number, 97);
  best.injury = 5;
  const next = topPlayer(lg, t);
  assert.notEqual(next.id, best.id, "an injured star doesn't headline the matchup");
  assert.ok(next.ovr <= best.ovr);
});

test("puck drop: the fixture's start time in Eastern, or the date and a local time when there is none", () => {
  const lg = league();
  const g = lg.schedule.find((x) => x.startTimeUTC && x.date);
  if (g) assert.match(kickoffText(lg, g), /^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2} · \d{1,2}:\d{2} [AP]M ET$/);
  const plain = { ...lg.schedule[0], startTimeUTC: undefined };
  assert.match(kickoffText(lg, plain), /7:00 PM local$/);
  // A start time that doesn't match the fixture's date (a moved game) falls back too.
  if (g) assert.match(kickoffText(lg, { ...g, date: "1999-01-01" }), /local$/);
  // Saturday night with a Canadian club is Hockey Night in Canada; the afternoon game and two U.S. clubs aren't.
  const id = (abbr) => lg.teams.find((x) => x.abbr === abbr).id;
  const sat = { h: id("TOR"), a: id("BOS"), date: "2026-10-03", startTimeUTC: "2026-10-03T23:00:00Z" };
  assert.equal(primeTime(lg, sat), "Hockey Night in Canada");
  assert.equal(primeTime(lg, { ...sat, startTimeUTC: "2026-10-03T19:00:00Z" }), null);
  assert.equal(primeTime(lg, { ...sat, h: id("NYR") }), null);
  assert.equal(primeTime(lg, { ...sat, startTimeUTC: undefined }), null);
});

test("off-season board: biggest needs with reasons beside the deals ending, each row going where you act", () => {
  const lg = league();
  const t = userTeam(lg);
  lg.phase = "draft";
  const b = offseasonBoard(lg);
  const needs = teamNeeds(lg, t).filter((n) => n.score >= 20);
  assert.equal(b.needs.length, Math.min(4, needs.length));
  b.needs.forEach((n, i) => {
    assert.equal(n.pos, needs[i].pos, "neediest first");
    assert.ok(n.why.length > 0, "every need says why");
    assert.deepEqual(n.to, ["draft"]);
  });
  assert.equal(b.kind, "expiring");
  assert.equal(b.title, "DEALS ENDING");
  for (const r of b.list) {
    assert.equal(r.p.yrs, 1);
    assert.ok(t.roster.includes(r.p.id));
    assert.deepEqual(r.to, ["frontoffice", "contracts"]);
  }
  assert.ok(b.list.every((r, i) => i === 0 || b.list[i - 1].p.ovr >= r.p.ovr), "best players first");

  // Re-sign week: the deals that just ran out, and a way to the re-sign screen.
  lg.phase = "resign";
  const ending = b.list.map((r) => r.p);
  for (const p of ending) p.yrs = 0;
  const rb = offseasonBoard(lg);
  assert.equal(rb.kind, "expiring");
  assert.ok(rb.list.length > 0 && rb.list.every((r) => r.p.yrs === 0 && r.to[0] === "freeagency"));
  assert.ok(rb.needs.every((n) => n.to[0] === "freeagency"));

  // Once free agency opens: the young core instead, toward the development screens.
  lg.phase = "freeagency";
  const fb = offseasonBoard(lg);
  assert.equal(fb.kind, "young");
  assert.equal(fb.title, "YOUR YOUNG CORE");
  assert.ok(fb.list.every((r) => r.p.age <= 23 && r.to[0] === "development"));
});

test("a short NHL roster in free agency is on the list (counting only players signed for next season)", () => {
  const lg = league();
  const t = userTeam(lg);
  lg.phase = "freeagency";
  lg.fa = { day: 0 };
  // Twelve players gone: the club is far below the 23 it needs.
  t.roster = t.roster.slice(0, 11);
  const item = needsAttention(lg).find((x) => x.key === "short");
  assert.ok(item);
  assert.equal(signedForNextSeason(lg, t), 11);
  assert.match(item.title, /^11 of 23 /);
  assert.equal(item.tone, "action");
  lg.fa.day = 28; // the last days of free agency make it urgent
  assert.equal(needsAttention(lg).find((x) => x.key === "short").tone, "urgent");
  // Re-sign week: a deal that just ran out doesn't count as signed.
  lg.phase = "resign";
  lg.players[t.roster[0]].yrs = 0;
  delete lg.players[t.roster[0]].extension;
  assert.match(needsAttention(lg).find((x) => x.key === "short").title, /^10 of 23 /);
});
