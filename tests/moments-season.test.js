// Season beats (Gridiron 3.0 / 3.2 / 3.49): clinch math and marks, and each trigger queueing one
// moment for your club and none for AI-only events.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../src/engine/league.js";
import { clinchState, clinchStatus, playoffTeams, divisionTable, conferenceTable, leagueTable } from "../src/engine/standings.js";
import { seasonDayMoments, signingMoment, legendMoment } from "../src/engine/momentsSeason.js";
import { evaluateTrade, executeTrade } from "../src/engine/trade.js";
import { settleNegotiations, negotiate } from "../src/engine/negotiations.js";
import { announceRetirements, letWalk } from "../src/engine/offseason.js";
import { archiveRetirement, inductHall } from "../src/engine/dynasty.js";
import { counts, signPlayer } from "../src/engine/roster.js";

const byAbbr = (lg, a) => lg.teams.find((t) => t.abbr === a);

// A standings snapshot: every club's points (default `base`), with only the listed games still to play.
function table(lg, pts, unplayed = [], base = 80) {
  const left = {};
  for (const [h, a] of unplayed) { left[h] = (left[h] || 0) + 1; left[a] = (left[a] || 0) + 1; }
  for (const t of lg.teams) {
    const p = pts[t.abbr] ?? base, gp = 82 - (left[t.abbr] || 0), w = Math.floor(p / 2) - (t.id % 3), otl = p - 2 * w;
    t.rec = { ...t.rec, gp, w, l: gp - w - otl, otl, pts: p, rw: w - 4, row: w - 2, gf: 200 + w, ga: 200 + (gp - w), last10: "", streak: null };
  }
  lg.schedule = unplayed.map(([h, a], i) => ({ id: i, day: 200, h: byAbbr(lg, h).id, a: byAbbr(lg, a).id, played: false }));
}

// Every way the remaining games can go (regulation or OT/SO either way), with the final picture.
function* outcomes(lg) {
  const games = lg.schedule.filter((g) => !g.played);
  const base = lg.teams.map((t) => ({ ...t.rec }));
  const res = [[2, 0, 1], [2, 1, 0], [1, 2, 0], [0, 2, 1]]; // [home pts, away pts, regulation?]
  for (let code = 0; code < 4 ** games.length; code++) {
    lg.teams.forEach((t, i) => { t.rec = { ...base[i] }; });
    let c = code;
    for (const g of games) {
      const [hp, ap, reg] = res[c % 4]; c = Math.floor(c / 4);
      for (const [tid, p, won] of [[g.h, hp, hp === 2], [g.a, ap, ap === 2]]) {
        const r = lg.teams[tid].rec;
        r.gp++; r.pts += p; r.gf += won ? 3 : 2; r.ga += won ? 2 : 3;
        if (won) { r.w++; r.row++; if (reg) r.rw++; } else if (p === 1) r.otl++; else r.l++;
      }
    }
    yield;
  }
  lg.teams.forEach((t, i) => { t.rec = base[i]; });
}

test("clinch math is never wrong: brute force over every way the last games can go", () => {
  const lg = L.createLeague({ userAbbr: "EDM", seed: 21 });
  table(lg, { EDM: 110, VGK: 100, LAK: 96, VAN: 94, SEA: 92, CGY: 91, ANA: 80, SJS: 70, COL: 112, DAL: 101, WPG: 99, MIN: 95, STL: 93, UTA: 92, NSH: 85, CHI: 72 },
    [["EDM", "COL"], ["VGK", "LAK"], ["LAK", "VAN"], ["SEA", "CGY"], ["MIN", "STL"], ["UTA", "WPG"], ["DAL", "VAN"]]);
  const west = lg.teams.filter((t) => t.conf === "West");
  const st = clinchState(lg);
  const always = Object.fromEntries(west.map((t) => [t.id, { in: true, out: true, div: true, conf: true, pres: true }]));
  for (const _ of outcomes(lg)) {
    const inPO = playoffTeams(lg);
    const lead = leagueTable(lg)[0].id;
    for (const t of west) {
      const a = always[t.id];
      if (!inPO.has(t.id)) a.in = false; else a.out = false;
      if (divisionTable(lg, t.div)[0].id !== t.id) a.div = false;
      if (conferenceTable(lg, t.conf)[0].id !== t.id) a.conf = false;
      if (lead !== t.id) a.pres = false;
    }
  }
  for (const t of west) {
    const s = st[t.id], a = always[t.id];
    if (s.berth) assert.ok(a.in, `${t.abbr} marked clinched but can miss`);
    if (s.out) assert.ok(a.out, `${t.abbr} marked eliminated but can still make it`);
    if (s.div) assert.ok(a.div, `${t.abbr} division`);
    if (s.conf) assert.ok(a.conf, `${t.abbr} conference`);
    if (s.pres) assert.ok(a.pres, `${t.abbr} Presidents' Trophy`);
  }
  const E = st[byAbbr(lg, "EDM").id];
  assert.ok(E.berth && E.div, "Edmonton has clinched the Pacific");
  assert.ok(!E.conf, "Colorado can still pass Edmonton for first in the West");
  assert.ok(st[byAbbr(lg, "NSH").id].out && st[byAbbr(lg, "CHI").id].out && st[byAbbr(lg, "SJS").id].out, "the clubs out of reach are eliminated");
  const VAN = st[byAbbr(lg, "VAN").id];
  assert.ok(!VAN.berth && !VAN.out, "Vancouver is still alive and not in");
  assert.equal(clinchStatus(lg)[byAbbr(lg, "EDM").id], "y");
  assert.equal(clinchStatus(lg)[byAbbr(lg, "CHI").id], "e");
});

test("with every game played the marks follow the final table and its tiebreakers", () => {
  const lg = L.createLeague({ userAbbr: "TOR", seed: 22 });
  const pts = {};
  lg.teams.forEach((t, i) => { pts[t.abbr] = 70 + ((i * 37) % 41); });
  pts.WPG = pts.MIN = 96; // a tie for points
  table(lg, pts, []);
  const st = clinchState(lg), inPO = playoffTeams(lg), marks = clinchStatus(lg);
  for (const t of lg.teams) {
    assert.equal(st[t.id].berth, inPO.has(t.id), `${t.abbr} berth`);
    assert.equal(st[t.id].out, !inPO.has(t.id), `${t.abbr} out`);
    assert.equal(st[t.id].div, divisionTable(lg, t.div)[0].id === t.id, `${t.abbr} div`);
    assert.ok(marks[t.id], `${t.abbr} carries a mark`);
  }
  assert.equal(Object.values(marks).filter((m) => m === "p").length, 1, "one Presidents' Trophy");
  assert.equal(Object.values(marks).filter((m) => m === "z").length, 1, "the other conference's winner");
  assert.equal(Object.values(marks).filter((m) => m === "e").length, 16);
  // Before a game is played nobody has a mark.
  const fresh = L.createLeague({ userAbbr: "TOR", seed: 22 });
  assert.deepEqual(clinchStatus(fresh), {});
});

test("clinch moments: one card for your club's biggest new clinch, never for an AI club's", () => {
  const lg = L.createLeague({ userAbbr: "EDM", seed: 23 });
  lg.phase = "regular";
  lg.clinched = { year: lg.year, tid: lg.userTid }; // a season under way with nothing locked up yet
  // Colorado has clinched; Edmonton hasn't: nothing for you.
  table(lg, { COL: 140, EDM: 90 }, [["EDM", "CGY"], ["EDM", "VAN"], ["CGY", "VAN"]], 95);
  assert.ok(clinchState(lg)[byAbbr(lg, "COL").id].berth);
  assert.ok(!clinchState(lg)[lg.userTid].berth);
  assert.deepEqual(seasonDayMoments(lg, new Set(), []), []);
  // Now Edmonton locks up the division (and with it a berth) on a night off.
  table(lg, { COL: 140, EDM: 120 }, [["EDM", "CGY"], ["COL", "DAL"]], 95);
  const [m, ...rest] = seasonDayMoments(lg, new Set(), []);
  assert.equal(rest.length, 0);
  assert.equal(m.kind, "clinch");
  assert.equal(m.level, "div");
  assert.equal(m.tid, lg.userTid);
  assert.equal(m.title, "PACIFIC DIVISION CHAMPIONS");
  assert.ok(m.stop && m.party);
  assert.deepEqual(m.lines.find(([k]) => k === "ALSO LOCKED UP"), ["ALSO LOCKED UP", "a playoff berth"]);
  assert.deepEqual(seasonDayMoments(lg, new Set(), []), [], "the same clinch never comes twice");
  // The Presidents' Trophy, with the result of the clinching game.
  table(lg, { EDM: 150 }, [["EDM", "CGY"]], 95);
  lg.schedule.push({ id: 99, day: lg.day, h: lg.userTid, a: byAbbr(lg, "VAN").id, played: true, hs: 4, as: 2, ot: "" });
  const [p] = seasonDayMoments(lg, new Set([lg.userTid]), [lg.schedule.at(-1)]);
  assert.equal(p.level, "pres");
  assert.equal(p.title, "THE ROAD GOES THROUGH EDMONTON");
  assert.match(p.lines.find(([k]) => k === "CLINCHED")[1], /4-2 win over the Canucks/);
  assert.equal(p.lines.find(([k]) => k === "ALSO LOCKED UP")[1], "first in the conference");
  // An older save loaded mid-season stays quiet about what was already locked up.
  delete lg.clinched;
  assert.deepEqual(seasonDayMoments(lg, new Set(), []), []);
});

// A legal trade between two clubs that moves an 85+ player from `seller` to `buyer`.
function starTrade(lg, buyer, seller, minOvr = 85) {
  const stars = seller.roster.map((id) => lg.players[id]).filter((p) => p.ovr >= minOvr && !p.clause).sort((a, b) => a.cap - b.cap);
  for (const star of stars) {
    for (const id of buyer.roster) {
      const q = lg.players[id];
      if (q.pos !== star.pos || q.ovr >= 85 || q.clause) continue;
      const offer = { from: buyer.id, to: seller.id, give: [q.id], get: [star.id], givePicks: [], getPicks: [] };
      if (!evaluateTrade(lg, offer).problems.length) return { offer, star };
    }
  }
  return null;
}

test("a blockbuster card when your club lands or moves an 85+ player, none for AI deals", () => {
  const lg = L.createLeague({ userAbbr: "EDM", seed: 24 });
  const me = lg.teams[lg.userTid];
  const ai = lg.teams.filter((t) => t.id !== me.id);
  let deal = null, from = null;
  for (const t of ai) { deal = starTrade(lg, me, t); if (deal) { from = t; break; } }
  assert.ok(deal, "found a legal star trade");
  const before = lg.moments.length;
  assert.ok(executeTrade(lg, deal.offer));
  const added = lg.moments.slice(before);
  assert.equal(added.length, 1);
  assert.equal(added[0].kind, "trade");
  assert.equal(added[0].got, true);
  assert.equal(added[0].other, from.id);
  assert.equal(added[0].p.name, deal.star.name);
  assert.match(added[0].title, /^OILERS LAND /);
  // Two AI clubs swapping a star: no card.
  let aiDeal = null;
  for (const a of ai) { for (const b of ai) if (a !== b && !aiDeal) aiDeal = starTrade(lg, a, b); if (aiDeal) break; }
  assert.ok(aiDeal, "found an AI star trade");
  const n = lg.moments.length;
  assert.ok(executeTrade(lg, aiDeal.offer, { record: false }));
  assert.equal(lg.moments.length, n, "AI-only trades queue nothing");
});

test("Signing Day: every market win gets a card (comes back to a former club), AI signings none", () => {
  const lg = L.createLeague({ userAbbr: "EDM", seed: 25 });
  const me = lg.teams[lg.userTid];
  me.roster.forEach((id) => { lg.players[id].cap = 1; lg.players[id].injury = 0; });
  while (counts(lg, me).active >= 23) me.prospects.push(me.roster.pop());
  lg.phase = "freeagency"; lg.fa = { day: 0 };
  // One of yours walked last summer and comes back; a depth player picks you; an AI club wins a third.
  const own = lg.players[me.roster.find((id) => lg.players[id].ovr < 80 && lg.players[id].pos !== "G")];
  own.yrs = 0; letWalk(lg, own.id);
  const fas = lg.freeAgents.map((id) => lg.players[id]).filter((p) => p && p.id !== own.id && p.ovr < 80).slice(0, 2);
  for (const p of [own, fas[0]]) assert.ok(negotiate(lg, p.id, 5, 2).ok);
  const other = byAbbr(lg, "CGY");
  while (counts(lg, other).active >= 23) other.prospects.push(other.roster.pop());
  lg.negotiations[fas[1].id] = { pid: fas[1].id, year: lg.year, rounds: 1, status: "pending", closes: 2, bids: [{ tid: other.id, aav: 1, yrs: 1 }] };
  for (const p of [own, fas[0]]) lg.negotiations[p.id].bids = lg.negotiations[p.id].bids.filter((b) => b.tid === me.id);
  lg.fa.day = 2;
  const before = lg.moments.length;
  settleNegotiations(lg);
  assert.equal(fas[1].tid, other.id);
  const added = lg.moments.slice(before);
  assert.equal(added.length, 2, "a card for each of your two market wins and none for Calgary's");
  assert.ok(added.every((m) => m.kind === "signing" && m.tid === me.id && m.market));
  const back = added.find((m) => m.pid === own.id);
  assert.equal(back.back, true);
  assert.match(back.sub, /comes back to the Oilers/);
  assert.equal(back.tier, "depth");
  assert.match(added.find((m) => m.pid === fas[0].id).sub, /picks the Oilers/);
  assert.ok(added.every((m) => m.lines.find(([k]) => k === "THE DEAL")[1] === "2 years, $10.0M total"));
});

test("a direct signing gets a card only for an 80+ player from another club", () => {
  const lg = L.createLeague({ userAbbr: "EDM", seed: 26 });
  const me = lg.teams[lg.userTid];
  const cgy = lg.teams.find((t) => t.id !== me.id && t.roster.some((id) => lg.players[id].ovr >= 88 && lg.players[id].ovr < 95));
  const star = lg.players[cgy.roster.find((id) => lg.players[id].ovr >= 88 && lg.players[id].ovr < 95)];
  const depth = lg.players[cgy.roster.find((id) => lg.players[id].ovr < 80)];
  for (const p of [star, depth]) { p.yrs = 0; letWalk(lg, p.id); }
  me.roster.forEach((id) => { lg.players[id].cap = 0.9; });
  while (counts(lg, me).active >= 23) me.prospects.push(me.roster.pop());
  assert.ok(signPlayer(lg, me, star, 9, 4) && signPlayer(lg, me, depth, 1, 1));
  const m = signingMoment(lg, star, me, { aav: 9, yrs: 4 });
  assert.equal(m.kind, "signing");
  assert.equal(m.from, cgy.id);
  assert.equal(m.tier, "star");
  assert.match(m.sub, new RegExp(`leaving the ${cgy.city} ${cgy.name}`));
  assert.equal(m.num, star.number);
  assert.equal(signingMoment(lg, depth, me, { aav: 1, yrs: 1 }), null, "depth signings wait for the market");
  assert.equal(signingMoment(lg, star, cgy, { aav: 9, yrs: 4 }), null, "only your club");
});

test("a franchise legend's farewell for your retiring star, none for another club's", () => {
  const lg = L.createLeague({ userAbbr: "EDM", seed: 27 });
  const me = lg.teams[lg.userTid], cgy = byAbbr(lg, "CGY");
  const vet = lg.players[me.roster.find((id) => lg.players[id].ovr >= 85 && lg.players[id].ovr < 93)];
  const rival = lg.players[cgy.roster.find((id) => lg.players[id].ovr >= 85)];
  for (const p of [vet, rival]) { p.age = 46; p.peak = 93; p.honours = [{ year: 2026, kind: "hart" }, { year: 2027, kind: "hart" }]; }
  let tries = 0;
  while (lg.players[vet.id] && tries++ < 20) { lg.retirementsYear = null; announceRetirements(lg); }
  assert.ok(!lg.players[vet.id], "he retired");
  const legends = lg.moments.filter((m) => m.kind === "legend");
  assert.ok(legends.every((m) => m.tid === me.id), "only your club's veterans");
  assert.equal(legends.filter((m) => m.pid === vet.id).length, 1);
  assert.ok(!legends.some((m) => m.pid === rival.id));
  const m = legends.find((x) => x.pid === vet.id);
  assert.equal(m.p.peak, 93);
  assert.equal(m.lines.find(([k]) => k === "HONOURS")[1], "2× Hart");
  assert.match(m.lines.find(([k]) => k === "NEXT STOP")[1], /Toronto/);
  // A short, ordinary career with you: no farewell card.
  const plain = lg.players[me.roster.find((id) => lg.players[id] && lg.players[id].ovr < 80)];
  plain.peak = plain.ovr;
  assert.equal(legendMoment(lg, plain), null);
});

test("Hall of Fame: a ceremony for your club's inductee with the Class listed, none for others", () => {
  const lg = L.createLeague({ userAbbr: "EDM", seed: 28 });
  const me = lg.teams[lg.userTid], cgy = byAbbr(lg, "CGY");
  const mine = lg.players[me.roster.find((id) => lg.players[id].pos !== "G")];
  const theirs = lg.players[cgy.roster.find((id) => lg.players[id].pos !== "G")];
  archiveRetirement(lg, theirs, { gp: 1100, g: 400, a: 600, w: 0 });
  lg.year += 3;
  inductHall(lg);
  assert.equal(lg.hallOfFame.length, 1);
  assert.equal(lg.moments.filter((m) => m.kind === "hof").length, 0, "another club's inductee alone: no ceremony");
  lg.year -= 3;
  archiveRetirement(lg, mine, { gp: 1200, g: 500, a: 700, w: 0 });
  archiveRetirement(lg, lg.players[cgy.roster[5]], { gp: 1000, g: 350, a: 500, w: 0 });
  lg.year += 3;
  inductHall(lg);
  const hof = lg.moments.filter((m) => m.kind === "hof");
  assert.equal(hof.length, 1);
  assert.equal(hof[0].pid, mine.id);
  assert.equal(hof[0].cls, lg.year);
  assert.equal(hof[0].classOf.length, 2, "the whole Class of the year");
  assert.equal(hof[0].lines.find(([k]) => k === "CAREER")[1], "1,200 GP · 1,200 PTS (500 G, 700 A)");
  inductHall(lg);
  assert.equal(lg.moments.filter((m) => m.kind === "hof").length, 1, "inducted once");
  const back = L.deserializeLeague(L.serializeLeague(lg));
  assert.equal(back.moments.find((m) => m.kind === "hof").p.name, mine.name, "the card survives a save");
});
