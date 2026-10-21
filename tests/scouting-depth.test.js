import test from "node:test";
import assert from "node:assert/strict";
import { createLeague, startRegularSeason, simDay } from "../src/engine/league.js";
import { deadlinePending, skipDeadline } from "../src/engine/market.js";
import { closeMoment, momentStopsSim } from "../src/engine/moments.js";
import {
  classPool, csRank, csScore, publicPot, prospectRead, generalIdea, crewOf, scoutProspect, interviewProspect, runCombine,
  revealDraftees, believedPot, scoutCheckpoint, scoutsShortlist, userPickAround, myBoard, SCOUT_PTS_CAP, scoutWeek,
} from "../src/engine/scouting.js";
import { projectedDraftOrder, pickSlot, myDraftSlots, aiPickScore, aiPickContext, startDraft, makePick, currentSlot, visibleRatings, simDraftToUser } from "../src/engine/draft.js";
import { projectedPickSlot } from "../src/engine/trade.js";
import { mockDraft } from "../src/engine/draftTools.js";
import { teamNeeds, roleNeeds, roleOf } from "../src/engine/teamPlanning.js";

const simDays = (l, n) => { for (let i = 0; i < n; i++) { if (deadlinePending(l)) skipDeadline(l); simDay(l); } };

test("every class seeds 4-6 hidden gems and 3-5 red flags that Central Scouting and the AI can't see", () => {
  for (const seed of [11, 12, 13]) {
    const l = createLeague({ userAbbr: "EDM", seed });
    const cls = classPool(l);
    const gems = cls.filter((p) => p.gem), busts = cls.filter((p) => p.bust);
    assert.ok(gems.length >= 4 && gems.length <= 6, `4-6 gems (got ${gems.length})`);
    assert.ok(busts.length >= 3 && busts.length <= 5, `3-5 red flags (got ${busts.length})`);
    for (const p of gems) {
      assert.ok(p.gem.why && p.gem.gap >= 6, "a gem has a reason and a real gap");
      assert.ok(p.pot > publicPot(p), "his real ceiling is above the public read");
      assert.ok(p.cs.mid > 72, "Central Scouting has him outside the first two rounds");
      assert.ok(p.cs.score < p.pot * 0.78 + p.ovr * 0.22 - 3, "the board's score is built on the public read");
    }
    for (const p of busts) {
      assert.ok(p.bust.why && p.bust.gap >= 5, "a red flag has a reason and a real gap");
      assert.ok(publicPot(p) > p.pot && p.pot > p.ovr, "the public read is inflated; he still has some ceiling");
      assert.ok(p.cs.mid <= 64, "the board has him in rounds 1-2");
    }
    // The AI clubs score him on the public read: the same as a player whose truth is the public read.
    const g = gems[0], ctx = aiPickContext(l, 3);
    const twin = { ...g, gem: null, pot: publicPot(g), dev: "normal" };
    assert.equal(aiPickScore(l, 3, g, ctx), aiPickScore(l, 3, twin, ctx), "no credit for the hidden ceiling or the gem's dev trait");
    // Without a scout on him (no report, no trip) your read doesn't show the gem either.
    const r = prospectRead(l, g);
    assert.equal(r.lvl, 0);
    assert.ok(!r.sleeper || r.crew >= 2, "a lone scout never calls him a sleeper outright before a report");
  }
});

test("a report sees through the board: the gem's ceiling and the red flag's reason", () => {
  const l = createLeague({ userAbbr: "TOR", seed: 21 });
  const t = l.teams[l.userTid];
  t.scoutPts = 40;
  const g = classPool(l).find((p) => p.gem), b = classPool(l).find((p) => p.bust);
  scoutProspect(l, g.id); scoutProspect(l, g.id);
  scoutProspect(l, b.id); scoutProspect(l, b.id);
  const rg = prospectRead(l, g), rb = prospectRead(l, b);
  assert.ok(rg.sleeper && /💎/.test(rg.gemWhy), "💎 marker with the reason once a report is in");
  assert.ok(Math.abs(rg.potV - g.pot) <= 8, "the report reads the real ceiling");
  assert.ok(rb.flag && rb.flagWhy.includes(b.bust.why), "🚩 marker with the reason");
  assert.ok(Math.abs(rb.potV - b.pot) <= 8);
});

test("a work-ethic red flag shows up in a Combine interview", () => {
  const l = createLeague({ userAbbr: "BOS", seed: 22 });
  startDraft(l); l.phase = "draft";
  const p = classPool(l).find((x) => x.bust) || classPool(l)[3];
  p.bust = { gap: 6, why: "Work-ethic concerns: coaches question his compete away from the puck", kind: "ethic" };
  runCombine(l);
  if (!p.combine) p.combine = { tests: {}, pcts: {}, pct: 0.5, grade: "B" };
  const res = interviewProspect(l, p.id);
  assert.ok(res.ok);
  assert.ok(prospectRead(l, p).flag, "the interview raises the flag");
  assert.equal(l.draft.workoutsLeft, 3, "three private workouts for Combine week");
});

test("two or more scouts on a group tighten its read and can see through the board", () => {
  const l = createLeague({ userAbbr: "NYR", seed: 23 });
  const t = l.teams[l.userTid];
  const cls = classPool(l).filter((p) => p.pos === "C");
  const p = cls[5];
  t.scouts = { major: { id: "a", name: "A", group: "C", eval: 78, trait: null }, major2: null, minor: null, minor2: null };
  const solo = generalIdea(l, p);
  t.scouts.major2 = { id: "b", name: "B", group: "C", eval: 82, trait: null };
  const two = generalIdea(l, p);
  assert.equal(crewOf(l, p).n, 2);
  assert.ok(two.sd < solo.sd, "a second scout narrows the read");
  assert.match(two.who, /2 scouts on centers/);
  // A deep, sharp crew on a gem's group sees him for what he is before a report.
  const gem = classPool(l).find((x) => x.gem && !["G"].includes(x.pos));
  const grp = gem.pos === "C" ? "C" : ["LW", "RW"].includes(gem.pos) ? "W" : "D";
  t.scouts = { major: { id: "c1", name: "C1", group: grp, eval: 95, trait: "sharp" }, major2: { id: "c2", name: "C2", group: grp, eval: 93, trait: null }, minor: { id: "c3", name: "C3", group: grp, eval: 90, trait: null }, minor2: null };
  const deep = generalIdea(l, gem);
  assert.ok(crewOf(l, gem).see >= 0.5);
  assert.ok(deep.hunch, "the crew has a hunch about him");
  assert.ok(deep.pot > publicPot(gem) + 3, "their read is above the public one");
});

test("your scouts' board ranks the class on your reads, Central Scouting where you have none", () => {
  const l = createLeague({ userAbbr: "VAN", seed: 24 });
  l.teams[l.userTid].scoutPts = 20;
  const gem = classPool(l).find((p) => p.gem);
  scoutProspect(l, gem.id); scoutProspect(l, gem.id);
  const board = myBoard(l);
  assert.equal(board.size, classPool(l).length);
  assert.ok(board.get(gem.id) < csRank(gem) - 20, "the scouted gem climbs your board");
});

test("scouting misses: your pick's ceiling is an estimate until the reveal checkpoints", () => {
  const l = createLeague({ userAbbr: "EDM", seed: 25 });
  startDraft(l); l.phase = "draft"; l.draft.stage = "live";
  simDraftToUser(l);
  const gem = classPool(l).find((p) => p.gem) || classPool(l)[0];
  const slot = currentSlot(l);
  assert.equal(slot.owner, l.userTid);
  assert.ok(makePick(l, gem.id));
  assert.ok(gem.potRev && gem.potRev.stage === 0, "tagged with the draft-day read");
  const believed = gem.potRev.from;
  assert.notEqual(believed, gem.pot);
  assert.equal(visibleRatings(l, gem).pot, `~${believed}`, "shows the draft-day read with a ~");
  const rk = gem.draft.year;
  // His first season, before the midpoint: nothing yet.
  Object.assign(l, { year: rk, phase: "regular", day: 10 });
  revealDraftees(l); assert.equal(gem.potRev.stage, 0);
  l.day = 150; revealDraftees(l); assert.equal(gem.potRev.stage, 1, "a first read by the middle of his first season");
  l.phase = "playoffs"; revealDraftees(l); assert.equal(gem.potRev.stage, 2, "most of it by the end of that season");
  assert.ok(/~/.test(String(visibleRatings(l, gem).pot)), "still an estimate");
  const moments0 = (l.moments || []).length;
  Object.assign(l, { year: rk + 1, phase: "regular", day: 40 }); revealDraftees(l); assert.equal(gem.potRev.stage, 2);
  l.phase = "draft"; const news = revealDraftees(l);
  assert.equal(gem.potRev.stage, 3, "all of it after his second season");
  assert.equal(visibleRatings(l, gem).pot, gem.pot);
  assert.equal(believedPot(l, gem).est, false);
  if (Math.abs(gem.pot - believed) >= 4) {
    assert.ok(news.length && /SCOUTING (STEAL|MISS)/.test(l.inbox.at(-1).text));
    assert.ok(l.moments.length > moments0 && l.moments.some((m) => m.kind === "scoutReveal"), "the final reveal is a moment");
  }
});

test("one draft order: pick labels, trade values, the mock draft, Scouting HQ and the paper agree", () => {
  const l = createLeague({ userAbbr: "CHI", seed: 26 });
  startRegularSeason(l);
  simDays(l, 57);
  const order = projectedDraftOrder(l);
  assert.equal(order.length, 32);
  const me = l.userTid, i = order.indexOf(me);
  const own = l.draftPicks.find((p) => p.year === l.year + 1 && p.round === 1 && p.orig === me);
  assert.equal(pickSlot(l, own).overall, i + 1);
  assert.equal(projectedPickSlot(l, own), i + 1, "trade values use the same slot");
  for (const tid of [0, 7, 19]) {
    const pk = l.draftPicks.find((p) => p.year === l.year + 1 && p.round === 1 && p.orig === tid);
    assert.equal(projectedPickSlot(l, pk), order.indexOf(tid) + 1);
  }
  if (own.owner === me) {
    assert.equal(myDraftSlots(l)[0], i + 1);
    assert.equal(userPickAround(l).slot, i + 1, "Scouting HQ and the checkpoints");
  }
  const mock = mockDraft(l);
  assert.deepEqual(mock.map((s) => s.orig), order, "the mock draft walks the same order");
  const paper = (l.papers || []).find((p) => p.kind === "scouting");
  assert.ok(paper, "the week-8 scouting paper is out");
  const at = +paper.sub.match(/picks around #(\d+)/)[1];
  assert.ok(at >= 1 && at <= 32 * 7, "the paper's slot comes from the same projection");
  // One needs model: the goalie of the future is a need when the starter is 33+ with nobody behind him.
  const t = l.teams[me];
  const g = t.roster.map((id) => l.players[id]).filter((p) => p.pos === "G").sort((a, b) => b.ovr - a.ovr)[0];
  g.age = 35;
  for (const id of t.prospects) if (l.players[id].pos === "G") l.players[id].pot = 60;
  const gn = teamNeeds(l, t).find((n) => n.pos === "G");
  assert.ok(gn.score >= 45 && gn.reasons.includes("no goalie of the future"));
});

test("a scouting checkpoint every fourth week stops the sim once, with targets near your pick", () => {
  const l = createLeague({ userAbbr: "MTL", seed: 27 });
  startRegularSeason(l);
  let days = 0;
  while (!momentStopsSim(l) && days < 40) { simDays(l, 1); days++; }
  assert.ok(momentStopsSim(l), "the sim stops");
  const cps = l.moments.filter((m) => m.kind === "scoutCheckpoint");
  assert.equal(cps.length, 1, "one checkpoint");
  const m = cps[0];
  assert.equal(m.week, 4);
  assert.ok(m.stop && m.targetIds.length > 0 && m.news.length > 0, "Scout targets and Central Scouting's moves");
  assert.ok(classPool(l).some((p) => p.cs.now != null), "Central Scouting's list moved");
  while (l.moments.length) closeMoment(l);
  assert.ok(!momentStopsSim(l));
  // The rest of that week (and a second call for the same week) never stops it again.
  scoutCheckpoint(l, 4);
  assert.ok(!l.moments.some((x) => x.kind === "scoutCheckpoint"), "the same checkpoint is never queued twice");
  simDays(l, 5);
  assert.ok(!l.moments.some((x) => x.kind === "scoutCheckpoint" && x.stop), "no new stop inside the same four weeks");
  // Use-or-lose: points never pile up past the cap during the season.
  l.teams[l.userTid].scoutPts = SCOUT_PTS_CAP;
  l.teams[l.userTid].scoutWeekPaid = Math.floor(l.day / 7) - 1;
  scoutWeek(l);
  assert.equal(l.teams[l.userTid].scoutPts, SCOUT_PTS_CAP);
});

test("the scouts' visit list works around your pick with a reason for each name", () => {
  const l = createLeague({ userAbbr: "DAL", seed: 28 });
  startDraft(l); l.phase = "draft";
  runCombine(l);
  const list = scoutsShortlist(l);
  const slots = myDraftSlots(l);
  assert.ok(list.length > 0 && list.length <= 8);
  for (const x of list) {
    assert.ok(x.why.length >= 1 && /CS #\d+/.test(x.why[0]), "each name says why");
    assert.ok(x.interview || x.workout);
    assert.ok(Math.abs(csRank(x.p) - x.slot) <= 24, "around one of your picks");
    assert.ok(slots.includes(x.slot));
  }
});

test("smarter AI drafting: role tags, role needs and org depth feed the pick", () => {
  const l = createLeague({ userAbbr: "COL", seed: 29 });
  const t = l.teams[4];
  const roles = roleNeeds(l, t);
  assert.ok(Object.values(roles).every((v) => v >= 0 && v <= 1));
  assert.equal(roles.ENF, 0, "enforcers are never a need");
  const p = classPool(l).find((x) => x.pos !== "G");
  assert.ok(roleOf(p));
  assert.equal(roleOf(classPool(l).find((x) => x.pos === "G")), null);
  // A club with a young starting goalie and a goalie prospect skips goalies early.
  const goalie = classPool(l).find((x) => x.pos === "G");
  const ctx = aiPickContext(l, 4);
  const before = aiPickScore(l, 4, goalie, ctx);
  ctx.depth.G = { ...ctx.depth.G, locked: true };
  assert.ok(aiPickScore(l, 4, goalie, ctx) <= before - 4);
  // Over a full draft goalies are rare in round 1 and gems mostly slide.
  startDraft(l); l.phase = "draft"; l.draft.stage = "live";
  simDraftToUser(l, { all: true });
  const r1 = l.draft.slots.filter((s) => s.round === 1).map((s) => l.players[s.pid]);
  assert.ok(r1.filter((x) => x.pos === "G").length <= 3);
  assert.ok(csScore(r1[0]) > 0);
});
