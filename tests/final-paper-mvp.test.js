import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../src/engine/league.js";
import { simPlayoffDay, startPlayoffs } from "../src/engine/playoffs.js";
import { connSmythe } from "../src/engine/awards.js";

// The Final's front page names one MVP: the Conn Smythe winner, in the subhead, the story and the photo.
test("Final paper: subhead, story and photo all name the Conn Smythe winner", () => {
  const lg = L.createLeague({ userAbbr: "EDM", seed: 11, injuries: false });
  L.startRegularSeason(lg);
  while (!L.seasonOver(lg)) L.simDay(lg);
  startPlayoffs(lg);
  let guard = 0;
  while (lg.playoffs.champion == null && guard++ < 200) simPlayoffDay(lg);
  const paper = (lg.playoffs.papers || []).find((p) => p.round === 3);
  assert.ok(paper, "the Final gets a front page");
  const cs = connSmythe(lg, paper.winner);
  const name = lg.players[cs.pid].name;
  assert.ok(paper.sub.includes(name) && paper.sub.includes("Conn Smythe"), `subhead names ${name}: ${paper.sub}`);
  assert.equal(String(paper.mvp.pid), String(cs.pid), "photo/feature is the Conn Smythe winner");
  assert.ok(!paper.sub.includes("series MVP"), "no competing series MVP in the Final");
});
