// The live rink's pure helpers: sweater colours (engine/uniforms.js) and club arenas (data/arenas.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { sweaterFor, liveSweaters, colorDist, luminance, ROAD_WHITE, HOME_SWEATER } from "../src/engine/uniforms.js";
import { ARENAS, arenaFor, arenaLabel } from "../src/data/arenas.js";
import { TEAMS } from "../src/engine/teams.js";
import schedule from "../src/data/schedule2026.json" with { type: "json" };

const team = (abbr) => TEAMS.find((t) => t.abbr === abbr);
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test("home sweaters are the club's colour; road sweaters are white with the number in club colours", () => {
  const edm = sweaterFor(team("EDM")), edmRoad = sweaterFor(team("EDM"), { away: true });
  assert.equal(edm.body, HOME_SWEATER.EDM);
  assert.equal(edm.number, "#ffffff");
  assert.equal(edm.edge, "#ff4c00");
  assert.equal(edm.white, false);
  assert.equal(edmRoad.body, ROAD_WHITE);
  assert.equal(edmRoad.number, HOME_SWEATER.EDM);
  assert.equal(edmRoad.edge, "#ff4c00");
  assert.equal(edmRoad.white, true);
  // A club with no special home colour wears its first colour at home.
  assert.equal(sweaterFor(team("NYR")).body, team("NYR").colors[0]);
});

test("every club's numbers stand out from its sweater, home and road", () => {
  for (const t of TEAMS) for (const away of [false, true]) {
    const sw = sweaterFor(t, { away });
    assert.ok(contrast(sw.number, sw.body) >= 2.4, `${t.abbr} ${away ? "road" : "home"} number ${sw.number} on ${sw.body}`);
    // Stripes never vanish into the sweater.
    assert.ok(colorDist(sw.trim, sw.body) >= 60, `${t.abbr} ${away ? "road" : "home"} trim`);
  }
  // Pale home sweaters (Nashville gold) get dark numbers.
  const nsh = sweaterFor(team("NSH"));
  assert.ok(luminance(nsh.number) < 0.2);
  assert.equal(nsh.number, "#041E42");
});

test("the road club wears white unless the home sweater is white; then the colour-clash change applies", () => {
  for (const [h, a] of [["EDM", "VAN"], ["MIN", "WSH"], ["CAR", "NJD"], ["NSH", "BOS"]]) {
    const sw = liveSweaters(team(h), team(a));
    assert.equal(sw.h.white, false);
    assert.equal(sw.a.white, true, `${a} at ${h}`);
    assert.equal(sw.a.body, ROAD_WHITE);
  }
  // A home side in white (a national team): the visitors wear their colour...
  const fin = { abbr: "FIN", colors: ["#fff", "#2d5da5"] }, usa = { abbr: "USA", colors: ["#234e89", "#df2639"] };
  const vsUsa = liveSweaters(fin, usa);
  assert.equal(vsUsa.a.white, false);
  assert.equal(vsUsa.a.body, "#234e89");
  // ...and their second colour when their first is too close to the home sweater.
  const pale = { abbr: "PAL", colors: ["#f8f8f8", "#c8102e"] };
  const vsPale = liveSweaters(fin, pale);
  assert.equal(vsPale.a.body, "#c8102e");
  assert.ok(colorDist(vsPale.a.body, vsPale.h.body) >= 140);
  // Short hex colours are understood.
  assert.equal(colorDist("#fff", "#ffffff"), 0);
});

test("every club has its home arena, matching the bundled NHL schedule", () => {
  const venues = {};
  for (const g of schedule.games) (venues[g.h] ||= {})[g.venue] = (venues[g.h][g.venue] || 0) + 1;
  for (const t of TEAMS) {
    const a = arenaFor(t);
    assert.ok(a?.name && a.city, `${t.abbr} arena`);
    const usual = Object.entries(venues[t.abbr]).sort((x, y) => y[1] - x[1])[0][0];
    assert.equal(a.name, usual, `${t.abbr} plays at ${usual}`);
  }
  assert.equal(Object.keys(ARENAS).length, 32);
  assert.deepEqual(arenaFor("EDM"), { name: "Rogers Place", city: "Edmonton" });
  assert.equal(arenaLabel(team("EDM")), "ROGERS PLACE · EDMONTON");
  // A neutral-site game shows its own venue; all-star and national sides have no arena.
  assert.equal(arenaLabel(team("CAR"), "Veikkaus Arena"), "VEIKKAUS ARENA");
  assert.equal(arenaFor({ abbr: "CAN" }), null);
  assert.equal(arenaLabel({ abbr: "CAN" }), "");
});
