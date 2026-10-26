import test from "node:test";
import assert from "node:assert/strict";
import { createLeague } from "../src/engine/league.js";
import { marketValue, contractAsk } from "../src/engine/players.js";
import { marketShare, MARKET_TABLE, agePay, elcAmount, MAX_TERM_RESIGN, MAX_TERM_UFA } from "../src/engine/marketPay.js";
import { termWindow } from "../src/engine/contracts.js";
import { minSalaryForYear } from "../src/engine/constants.js";
import { elcSalary } from "../src/engine/hockeyRules.js";

const at2025 = (g, ovr) => marketShare(g, ovr) * 95.5;
const P = (o) => ({ id: "x1", pos: "C", age: 27, ovr: 90, pot: 90, ...o });

test("top centre (McDavid level) asks the real top cap hit", () => {
  assert.ok(Math.abs(at2025("C", 99) - 14.0) < 0.01);
  const lg = createLeague({ userAbbr: "EDM", seed: 732027 });
  const mcd = Object.values(lg.players).find((p) => p.name === "Connor McDavid");
  assert.equal(mcd.ovr, 99);
  const v = marketValue(mcd, 2025);
  assert.ok(v >= 13.5 && v <= 14.5, `McDavid market ${v}`);
});

test("#10 defenceman sits in the real band; depth sits at the minimum", () => {
  const d10 = MARKET_TABLE.D.ovr[3];
  const v = at2025("D", d10);
  assert.ok(v >= 8.5 && v <= 10.5, `#10 D ${v}`);
  assert.equal(marketValue(P({ ovr: 68, pos: "LD" }), 2026), minSalaryForYear(2026));
  assert.equal(marketValue(P({ ovr: 66, pos: "RW" }), 2026), minSalaryForYear(2026));
});

test("market share never falls with rating and stays within the CBA maximum", () => {
  for (const g of ["C", "W", "D", "G"]) {
    let last = 0;
    for (let o = 60; o <= 105; o += 0.25) {
      const s = marketShare(g, o);
      assert.ok(Number.isFinite(s) && s + 1e-12 >= last, `${g} ${o}`);
      assert.ok(s <= 0.2);
      last = s;
    }
  }
});

test("goalies age two years later than skaters", () => {
  assert.equal(agePay({ pos: "C", age: 31 }), agePay({ pos: "G", age: 33 }));
  assert.ok(agePay({ pos: "G", age: 31 }) > agePay({ pos: "C", age: 31 }));
  assert.ok(agePay({ pos: "C", age: 35 }) <= 0.55);
});

test("term limits: 8 re-signing, 7 on the open market, one year from 35", () => {
  assert.equal(MAX_TERM_RESIGN, 8);
  assert.equal(MAX_TERM_UFA, 7);
  assert.equal(termWindow(P({ age: 22, ovr: 92 }), "resign").max, 8);
  assert.equal(termWindow(P({ age: 22, ovr: 92 }), "fa").max, 7);
  for (let i = 0; i < 40; i++) {
    const id = `p${i}`;
    assert.equal(contractAsk(P({ id, age: 36, ovr: 88 }), 2026).yrs, 1);
    const star = contractAsk(P({ id, age: 22, ovr: 92 }), 2026).yrs;
    assert.ok(star >= 6 && star <= 8);
    const prime = contractAsk(P({ id, age: 28, ovr: 86 }), 2026).yrs;
    assert.ok(prime >= 3 && prime <= 6);
  }
});

test("entry-level deals: the maximum for top picks, less for late picks", () => {
  assert.equal(elcSalary(2026, 1), 1);
  assert.ok(elcSalary(2026, 100) < elcSalary(2026, 20));
  assert.ok(elcAmount(2030, 1.2, 200) >= minSalaryForYear(2030));
});
