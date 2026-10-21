import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ES_SHARE, PP_SHARE, PK_SHARE, iceShare, goalieShare, lastName, firstName, listName, nameSize, RINK, FOOT, esSpots, esTags, esBand, stSpots, stTags, offPosition, planWords } from "../src/ui/linesView.js";

const sum = (a) => a.reduce((s, x) => s + x, 0);

test("ice-time shares match the bench rotation in the sim and add up", () => {
  const sim = fs.readFileSync(new URL("../src/engine/sim.js", import.meta.url), "utf8");
  const m = /const F_SHARE = \[([^\]]+)\], D_SHARE = \[([^\]]+)\]/.exec(sim);
  assert.ok(m, "sim.js still defines F_SHARE and D_SHARE");
  assert.deepEqual(m[1].split(",").map(Number), ES_SHARE.F);
  assert.deepEqual(m[2].split(",").map(Number), ES_SHARE.D);
  const pp = /ppTime\[k\] % (\d+) < (\d+)/.exec(sim);
  assert.ok(pp, "sim.js still splits the power play by ppTime");
  assert.equal(PP_SHARE[0], Number(pp[2]) / Number(pp[1]));
  assert.match(sim, /Math\.floor\(s\.ppTime\[other\(k\)\] \/ \d+\) % 2/, "the kill still alternates two units evenly");
  assert.deepEqual(PK_SHARE, [0.5, 0.5]);
  for (const k of ["F", "D", "PP", "PK"]) {
    const n = k === "F" ? 4 : k === "D" ? 3 : 2;
    const shares = Array.from({ length: n }, (_, i) => iceShare(k, i));
    assert.ok(Math.abs(sum(shares) - 100) <= 1, `${k} shares add to 100 (${shares})`);
    assert.ok(shares.every((x, i) => i === 0 || x <= shares[i - 1]), `${k}: the top unit plays the most`);
  }
  assert.equal(iceShare("F", 0), 32);
  assert.equal(iceShare("PP", 0), 57);
  assert.equal(iceShare("F", 9), 0);
  assert.deepEqual(goalieShare(0.2), [80, 20]);
  assert.deepEqual(goalieShare(0), [100, 0]);
  assert.deepEqual(goalieShare(undefined), [100, 0]);
});

test("names: surname under a spot, full name (or initial) in the list", () => {
  assert.equal(lastName("Connor McDavid"), "McDavid");
  assert.equal(lastName("Martin St. Louis"), "St. Louis");
  assert.equal(lastName("Tim Stützle Jr."), "Stützle");
  assert.equal(lastName("Ryan Nugent-Hopkins"), "Nugent-Hopkins");
  assert.equal(lastName("Pele"), "Pele");
  assert.equal(lastName(""), "");
  assert.equal(firstName("Connor McDavid"), "Connor");
  assert.equal(firstName("Pele"), "");
  assert.equal(listName("Connor McDavid"), "Connor McDavid");
  assert.equal(listName("Alexander Mukhamadullin", 16), "A. Mukhamadullin");
  assert.equal(nameSize("Draisaitl"), "");
  assert.equal(nameSize("Kapanen"), "");
  assert.equal(nameSize("Formenton1"), "m");
  assert.equal(nameSize("Mukhamadullin"), "s");
});

// Every spot is a box: its column width across, ring top to name bottom down. No two boxes
// may touch and every box stays on the ice, at the narrowest and widest size each layout is drawn.
const SIZES = { land: [640, 560], port: [344, 440] };
function boxes(spots, o, W) {
  const H = o === "land" ? (W * RINK.land.h) / RINK.land.w : RINK.port.h;
  return spots.map((s) => {
    const [x, y, w] = s[o];
    const f = s.small ? FOOT[o].small : FOOT[o];
    const cx = (x * W) / 100, cy = (y * H) / 100, half = (w * W) / 200;
    return { key: s.key, l: cx - half, r: cx + half, t: cy - f.up, b: cy + f.down, W, H };
  });
}
function tagBoxes(tags, o, W) {
  const H = o === "land" ? (W * RINK.land.h) / RINK.land.w : RINK.port.h;
  const [tw, th] = o === "land" ? [56, 18] : [38, 30];
  return tags.map((t) => { const cx = (t[o][0] * W) / 100, cy = (t[o][1] * H) / 100; return { key: t.key, l: cx - tw / 2, r: cx + tw / 2, t: cy - th / 2, b: cy + th / 2, W, H }; });
}
const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
function assertClear(list, label) {
  for (const a of list) {
    assert.ok(a.l >= 0 && a.r <= a.W && a.t >= 0 && a.b <= a.H, `${label}: ${a.key} stays on the ice (${a.l.toFixed(0)},${a.t.toFixed(0)})-(${a.r.toFixed(0)},${a.b.toFixed(0)}) in ${a.W.toFixed(0)}x${a.H.toFixed(0)}`);
  }
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    assert.ok(!hit(list[i], list[j]), `${label}: ${list[i].key} and ${list[j].key} overlap`);
  }
}

const L = { F: [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12]], D: [[13, 14], [15, 16], [17, 18]], G: [19, 20] };

test("the whole dressed lineup fits on the rink without overlapping, both ways round", () => {
  const spots = esSpots(L);
  assert.equal(spots.length, 12 + 6 + 2);
  assert.equal(new Set(spots.map((s) => s.key)).size, spots.length);
  assert.deepEqual(spots.filter((s) => s.g === "F" && s.i === 0).map((s) => s.pos), ["LW", "C", "RW"]);
  assert.equal(spots.find((s) => s.key === "G1").small, true, "the backup is noted, smaller");
  for (const o of ["land", "port"]) for (const W of SIZES[o]) {
    assertClear([...boxes(spots, o, W), ...tagBoxes(esTags(L), o, W)], `${o} ${W}`);
  }
  // left wings sit on the attacker's left: above the centre in landscape, left of him in portrait
  const lw = spots.find((s) => s.key === "F00"), c = spots.find((s) => s.key === "F01"), rw = spots.find((s) => s.key === "F02");
  assert.ok(lw.land[1] < c.land[1] && c.land[1] < rw.land[1]);
  assert.ok(lw.port[0] < c.port[0] && c.port[0] < rw.port[0]);
  // the starting goalie is in the crease end, behind the defence
  const g = spots.find((s) => s.key === "G0");
  assert.ok(spots.filter((s) => s.g !== "G").every((s) => s.land[0] > g.land[0] && s.port[1] < g.port[1]));
});

test("every unit has a highlight band that covers its spots", () => {
  const spots = esSpots(L);
  for (const unit of ["L1", "L2", "L3", "L4", "P1", "P2", "P3", "G"]) {
    const band = esBand(unit);
    assert.ok(band, unit);
    for (const s of spots.filter((x) => x.unit === unit && !x.small)) {
      assert.ok(s.land[0] >= band.land.x && s.land[0] <= band.land.x + band.land.w, `${unit} ${s.key} in its landscape band`);
      assert.ok(s.port[1] >= band.port.y && s.port[1] <= band.port.y + band.port.h, `${unit} ${s.key} in its portrait band`);
    }
  }
  assert.equal(esBand("L9"), null);
  assert.equal(esBand("PP1"), null);
});

test("power-play and penalty-kill units each get a clear half of the rink", () => {
  const units = {
    PP: [[0, 0, 0, 0, 1], [0, 0, 0, 1, 1], [0, 0, 0, 0, 0], [1, 1, 1, 0, 0], [0, 0, 1], []],
    PK: [[0, 0, 1, 1], [0, 0, 0, 1], [1, 1, 1, 1], [0, 0, 0, 0, 1], [1]],
  };
  for (const kind of ["PP", "PK"]) for (const a of units[kind]) for (const b of units[kind]) {
    const spots = [...stSpots(kind, 0, a.map(Boolean)), ...stSpots(kind, 1, b.map(Boolean))];
    assert.equal(spots.length, a.length + b.length);
    for (const o of ["land", "port"]) for (const W of SIZES[o]) {
      assertClear([...boxes(spots, o, W), ...tagBoxes(stTags(kind), o, W)], `${kind} ${a}|${b} ${o} ${W}`);
    }
  }
  // the power play puts its defenceman on the point, the kill puts its defencemen low
  const pp = stSpots("PP", 0, [false, false, false, false, true]);
  assert.equal(pp[4].spot, "P0");
  assert.ok(pp.slice(0, 4).every((s) => s.land[0] < pp[4].land[0]), "forwards are deeper than the point (unit 1 attacks the left end)");
  const pk = stSpots("PK", 1, [false, false, true, true]);
  assert.deepEqual(pk.map((s) => s.spot), ["FL", "FR", "DL", "DR"]);
  assert.ok(pk[2].land[0] > pk[0].land[0], "defencemen sit nearer their own net (unit 2 defends the right end)");
});

test("off-position slots and the plan in a few words", () => {
  assert.equal(offPosition({ pos: "LW" }, "RW"), false, "wingers play either wing");
  assert.equal(offPosition({ pos: "LW" }, "C"), true);
  assert.equal(offPosition({ pos: "LD" }, "RD"), false);
  assert.equal(offPosition({ pos: "C" }, "LD"), true);
  assert.equal(offPosition({ pos: "C" }, "PP"), false);
  assert.equal(offPosition(null, "C"), false);
  assert.equal(planWords({ forecheck: "aggressive", neutral: "trap", attack: "cycle" }), "Aggressive forecheck · Trap · Cycle attack");
  assert.equal(planWords({ forecheck: "balanced", neutral: "balanced", attack: "balanced" }), "Balanced forecheck · Balanced neutral zone · Balanced attack");
  assert.equal(planWords(null), "");
});
