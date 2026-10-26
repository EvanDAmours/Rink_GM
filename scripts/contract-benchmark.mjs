// Contract market benchmark (Gridiron GM's "verify, don't trust the tables").
//   node scripts/contract-benchmark.mjs            opening league: real cap hits vs asks by rank
//   HEALTH_SEASONS=6 node scripts/contract-benchmark.mjs   plus a multi-season health run
import { createLeague } from "../src/engine/league.js";
import { marketValue } from "../src/engine/players.js";
import { faAsk } from "../src/engine/offseason.js";
import { MARKET_TABLE, marketGroup } from "../src/engine/marketPay.js";
import { capForYear } from "../src/engine/constants.js";
import { payroll } from "../src/engine/roster.js";
import { seed } from "../src/engine/rng.js";

const f = (x) => x.toFixed(2).padStart(6);
const lg = createLeague({ userAbbr: "EDM", seed: 732027 });
const groups = { C: [], W: [], D: [], G: [] };
for (const t of lg.teams) for (const id of t.roster) { const p = lg.players[id]; if (p) groups[marketGroup(p.pos)].push(p); }
const y = lg.year;
console.log(`Opening league ${y}-${String(y + 1).slice(2)}, cap $${capForYear(y)}M (real table at 2025-26 cap $95.5M, scaled x${(capForYear(y) / 95.5).toFixed(3)})`);
for (const [g, list] of Object.entries(groups)) {
  list.sort((a, b) => b.ovr - a.ovr);
  const real = MARKET_TABLE[g].pay.slice(0, 5).map((v) => v * capForYear(y) / 95.5);
  const asks = list.slice(0, 5).map((p) => `${p.name.split(" ").pop()} ${p.ovr}/${p.age}: ${marketValue(p, y).toFixed(2)}`);
  const at = (r) => list[r - 1] ? `#${r} ${list[r - 1].ovr} ${f(marketValue(list[r - 1], y))} (real ${f(MARKET_TABLE[g].pay[[1, 3, 5, 10, 20, 32].indexOf(r)] * capForYear(y) / 95.5 || 0)})` : "";
  console.log(`\n${g}  real top-5 (scaled): ${real.map((v) => v.toFixed(2)).join(", ")}`);
  console.log(`   top-5 rated asks: ${asks.join(" | ")}`);
  console.log(`   ${at(10)}   ${at(20)}   ${at(32)}   min-ask count: ${list.filter((p) => marketValue(p, y) <= 0.86).length}/${list.length}`);
}
console.log("\nTeam market value vs payroll ($M):");
const rows = lg.teams.map((t) => ({ abbr: t.abbr, mv: t.roster.reduce((s, id) => s + marketValue(lg.players[id], y), 0), pay: payroll(lg, t) }));
console.log(rows.map((r) => `${r.abbr} ${r.mv.toFixed(1)}/${r.pay.toFixed(1)}`).join("  "));
const avg = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
console.log(`average market value ${avg("mv").toFixed(1)} (${(avg("mv") / capForYear(y) * 100).toFixed(0)}% of cap), payroll ${avg("pay").toFixed(1)} (${(avg("pay") / capForYear(y) * 100).toFixed(0)}%)`);
const mcd = Object.values(lg.players).find((p) => p.name === "Connor McDavid");
if (mcd) console.log(`McDavid ${mcd.ovr}/${mcd.age}: market ${marketValue(mcd, y)}, FA ask ${JSON.stringify(faAsk(lg, mcd))}`);

const N = Number(process.env.HEALTH_SEASONS || 0);
if (N > 0) {
  const L = await import("../src/engine/league.js");
  const { simPlayoffDay } = await import("../src/engine/playoffs.js");
  const { simDraftToUser } = await import("../src/engine/draft.js");
  const { simFADay } = await import("../src/engine/offseason.js");
  seed(Number(process.env.HEALTH_SEED || 4242));
  const h = L.createLeague({ userAbbr: "EDM", seed: 151 });
  // The user's club isn't managed by this script (no re-signings), so stats cover AI clubs only.
  const realTop5 = { C: 0, W: 0, D: 0, G: 0 };
  const capY = 95.5;
  for (const g of Object.keys(realTop5)) realTop5[g] = MARKET_TABLE[g].pay.slice(0, 5).reduce((a, b) => a + b, 0) / 5 / capY * 100;
  for (let n = 0; n < N; n++) {
    L.startRegularSeason(h); L.simRestOfSeason(h);
    L.endRegularSeason(h); while (h.playoffs.champion == null) simPlayoffDay(h);
    L.finishPlayoffs(h); simDraftToUser(h, { all: true }); L.completeDraft(h);
    L.goToFreeAgency(h); while (!simFADay(h)) {} L.beginNextSeason(h);
    const cap = capForYear(h.year);
    const ai = h.teams.filter((t) => t.id !== h.userTid);
    const pays = ai.map((t) => payroll(h, t) / cap * 100);
    const gp = { C: [], W: [], D: [], G: [] };
    for (const t of ai) for (const id of t.roster) { const p = h.players[id]; if (p) gp[marketGroup(p.pos)].push(p.cap); }
    const top5 = Object.fromEntries(Object.entries(gp).map(([g, l]) => [g, +(l.sort((a, b) => b - a).slice(0, 5).reduce((a, b) => a + b, 0) / 5 / cap * 100).toFixed(1)]));
    const players = Object.values(h.players).filter((p) => p.tid >= 0);
    console.log(JSON.stringify({ year: h.year, cap, payrollPct: { low: +Math.min(...pays).toFixed(1), avg: +(pays.reduce((a, b) => a + b, 0) / pays.length).toFixed(1), high: +Math.max(...pays).toFixed(1) }, overCap: pays.filter((x) => x > 100.001).length, dist: process.env.DIST ? pays.map((x) => Math.round(x)).sort((a, b) => a - b).join(" ") : undefined, top5SharePct: top5, n90: players.filter((p) => p.ovr >= 90).length }));
  }
  console.log("real 2025-26 top-5 average share %:", JSON.stringify(Object.fromEntries(Object.entries(realTop5).map(([k, v]) => [k, +v.toFixed(1)]))));
}
