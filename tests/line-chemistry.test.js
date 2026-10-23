import test from "node:test";
import assert from "node:assert/strict";
import { createLeague, restoreLeague } from "../src/engine/league.js";
import { chemistry, autofillByChemistry, autofillByOverall, teamChemistry, archAbbr, chemKey } from "../src/engine/chemistry.js";
import { lineupIds } from "../src/engine/lines.js";
import { lineChemistry } from "../src/engine/development.js";

const fake = (id, type, pos, shoots, nat = "CAN") => ({ id, type, pos, shoots, nat, ovr: 80, injury: 0, attrs: {} });
function mini(players, coach = { style: "balanced", name: "Pat Roy", leadership: 70 }) {
  const lg = { players: Object.fromEntries(players.map((p) => [p.id, p])) };
  return { lg, t: { coach, staff: { assistant: { specialTeams: 78 } }, lineExperience: {} } };
}

test("archetype mix: playmaker + finisher beats three of a kind", () => {
  const { lg, t } = mini([fake("a", "PLY", "C", "L"), fake("b", "SNP", "LW", "R"), fake("c", "PWF", "RW", "L"), fake("x", "GRN", "C", "L"), fake("y", "GRN", "LW", "L"), fake("z", "GRN", "RW", "L")]);
  const good = chemistry(lg, t, ["b", "a", "c"]), bad = chemistry(lg, t, ["y", "x", "z"]);
  assert.ok(good.pts > bad.pts + 0.8, `${good.pts} vs ${bad.pts}`);
  assert.ok(good.reasons.some((r) => /Playmaker/.test(r.text)));
  assert.ok(bad.reasons.some((r) => /same type/.test(r.text)));
  assert.equal(archAbbr(lg.players.a), "PLY");
});

test("D pair: puck-mover + shutdown with opposite hands is good; familiarity grows chemistry", () => {
  const { lg, t } = mini([fake("o", "OFD", "LD", "L"), fake("d", "DFD", "RD", "R"), fake("o2", "OFD", "RD", "L")]);
  const good = chemistry(lg, t, ["o", "d"], "D"), bad = chemistry(lg, t, ["o", "o2"], "D");
  assert.ok(good.pts > bad.pts);
  t.lineExperience[chemKey(["o", "d"])] = 13;
  assert.ok(chemistry(lg, t, ["o", "d"], "D").pts > good.pts);
});

test("coaching staff style boosts matching lines", () => {
  const ps = [fake("a", "GRN", "C", "L"), fake("b", "TWF", "LW", "R"), fake("c", "PLY", "RW", "L")];
  const def = mini(ps, { style: "defend", name: "A B" }), att = mini(ps, { style: "attack", name: "A B" });
  assert.ok(chemistry(def.lg, def.t, ["b", "a", "c"]).pts > chemistry(att.lg, att.t, ["b", "a", "c"]).pts);
  const st = mini(ps); st.t.staff.assistant.specialTeams = 92;
  assert.ok(chemistry(st.lg, st.t, ["a", "b", "c"], "PK").reasons.some((r) => /special-teams/.test(r.text)));
});

test("autofill by chemistry keeps a legal lineup and raises total chemistry", () => {
  const l = createLeague({ userAbbr: "EDM", seed: 5 });
  const t = l.teams[l.userTid];
  autofillByOverall(l, t);
  const before = teamChemistry(l, t);
  const ids = lineupIds(t.lines);
  autofillByChemistry(l, t);
  const after = lineupIds(t.lines);
  assert.equal(new Set(after).size, after.length, "no duplicates");
  assert.equal(after.length, ids.length);
  assert.ok(teamChemistry(l, t) >= before, `${teamChemistry(l, t)} >= ${before}`);
  assert.equal(t.lines.PP[0].length, 5); assert.equal(t.lines.PK[0].length, 4);
});

test("old saves without familiarity data load and compute chemistry", () => {
  const l = createLeague({ userAbbr: "TOR", seed: 2 });
  for (const t of l.teams) { delete t.lineExperience; }
  const back = restoreLeague(JSON.parse(JSON.stringify(l)));
  assert.ok(back);
  const t = back.teams[back.userTid];
  t.lineExperience ||= {};
  assert.ok(Number.isFinite(lineChemistry(back, t, t.lines.F[0])));
  assert.ok(Number.isFinite(lineChemistry(back, { ...t, lineExperience: undefined }, t.lines.D[0], "D")));
});
