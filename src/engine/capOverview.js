// The front-office overview: where the money is now, where it is committed for the next
// four seasons, how it splits across the lineup against the league, and what to do about it.
import { capForYear, minSalaryForYear, isGoalie, isDefense } from "./constants.js";
import { capSpace, payroll, counts, canSendDown, capYear } from "./roster.js";
import { rawPayroll, buriedCap, contractCount } from "./hockeyRules.js";
import { deadlinePending } from "./market.js";

const round1 = (n) => Math.round(n * 10) / 10;
const group = (p) => (isGoalie(p.pos) ? "G" : isDefense(p.pos) ? "D" : "F");
export const GROUP_LABELS = { F: "Forwards", D: "Defense", G: "Goalies" };

// Cap charges a club already carries in a future season, offset years from the cap year.
function committedIn(league, t, offset) {
  const year = capYear(league) + offset;
  let total = 0, signed = 0;
  const ending = [];
  for (const id of [...t.roster, ...t.prospects]) {
    const p = league.players[id];
    if (!p || p.signed === false) continue;
    const farm = t.prospects.includes(id);
    const yrsLeft = p.yrs - (capYear(league) > league.year ? 0 : 0);
    if (yrsLeft > offset) {
      total += farm ? buriedCap(p, year) : p.cap; signed++;
      if (yrsLeft === offset + 1 && !p.extension) ending.push(p);
    } else if (p.extension && offset < yrsLeft + p.extension.yrs) {
      total += p.extension.aav; signed++;
      if (offset === yrsLeft + p.extension.yrs - 1) ending.push(p);
    }
  }
  for (const d of t.deadCap || []) if (!(d.offset > 0) && d.yrs > offset) total += d.amt;
  for (const r of t.retained || []) if (r.yrs > offset) total += r.amt;
  return { year, cap: capForYear(year), committed: round1(total), room: round1(capForYear(year) - total), signed, ending: ending.sort((a, b) => b.ovr - a.ovr) };
}

export function capOverview(league, t) {
  const year = capYear(league);
  const roster = t.roster.map((id) => league.players[id]).filter(Boolean);
  const space = capSpace(league, t), cap = capForYear(year);
  const years = [0, 1, 2, 3].map((i) => committedIn(league, t, i));
  const next = years[1];
  const dead = round1((t.deadCap || []).filter((d) => !(d.offset > 0)).reduce((n, d) => n + d.amt, 0) + (t.retained || []).reduce((n, d) => n + d.amt, 0));
  const expiring = roster.filter((p) => p.signed !== false && p.yrs === 1 && !p.extension);
  // Money by lineup group, against the league average of the same thing.
  const mine = { F: 0, D: 0, G: 0 }, avg = { F: 0, D: 0, G: 0 };
  for (const p of roster) if (p.yrs > 0) mine[group(p)] += p.cap;
  for (const q of league.teams) for (const id of q.roster) { const p = league.players[id]; if (p && p.yrs > 0) avg[group(p)] += p.cap / league.teams.length; }
  const groups = ["F", "D", "G"].map((k) => ({ key: k, label: GROUP_LABELS[k], you: round1(mine[k]), avg: round1(avg[k]), vs: avg[k] ? Math.round(((mine[k] - avg[k]) / avg[k]) * 100) : 0 }));
  const total = Math.max(0.01, payroll(league, t));
  const biggest = [...roster].filter((p) => p.yrs > 0).sort((a, b) => b.cap - a.cap).slice(0, 8).map((p) => ({ p, pct: Math.round((p.cap / total) * 100) }));
  // Advice: one card per real situation, most urgent first.
  const advice = [];
  if (space < -0.005) {
    const cand = roster.filter((p) => p.yrs > 0 && canSendDown(p) && p.injury <= 0).sort((a, b) => a.ovr - b.ovr)[0];
    const bury = cand ? Math.min(cand.cap, buriedCap(cand, year) ? cand.cap - buriedCap(cand, year) : minSalaryForYear(year) + 0.375) : 0;
    advice.push({ tone: "bad", title: `You're over the cap by $${(-space).toFixed(1)}M`, text: cand ? `${cand.name} (${cand.pos} ${cand.ovr}) is waiver-exempt: sending him to the farm clears about $${bury.toFixed(2)}M. Otherwise move salary before the next game.` : "Move salary or retain on a trade before the next game; nobody waiver-exempt is left to send down.", go: "roster" });
  }
  const stars = expiring.filter((p) => p.ovr >= 80).sort((a, b) => b.ovr - a.ovr);
  if (stars.length && ["preseason", "regular", "playoffs"].includes(league.phase)) advice.push({ tone: "warn", title: `Extend ${stars[0].name}?`, text: `${stars.length === 1 ? "He is" : `${stars.length} players of 80+ are`} in the last year of ${stars.length === 1 ? "his" : "their"} deal${stars.length === 1 ? "" : "s"}. An extension now beats bidding against 31 clubs in July.`, go: "frontoffice" });
  if (next.room < 6 && expiring.length >= 4) advice.push({ tone: "warn", title: `Next summer is tight: $${next.room.toFixed(1)}M of room`, text: `${expiring.length} contracts end after this season and ${next.signed} players are already signed for ${next.year}-${String(next.year + 1).slice(2)}. Plan which ones walk.`, go: "frontoffice" });
  const nContracts = contractCount(league, t);
  if (nContracts >= 47) advice.push({ tone: "warn", title: `${nContracts} of 50 contract slots used`, text: "Unsigned draft picks and depth signings need a slot each. Let a few rights go or trade bodies for picks.", go: "operations" });
  if (space >= 8 && league.phase === "regular" && league.day < league.deadlineDay && !deadlinePending(league)) advice.push({ tone: "good", title: `$${space.toFixed(1)}M of room is a deadline budget`, text: "Banked space lets you absorb a rental at the deadline without sending salary back. Keep it, or spend it now on the trade market.", go: "trade" });
  if (dead > 0) advice.push({ tone: "info", title: `$${dead.toFixed(1)}M of dead money this season`, text: "Buyouts and retained salary count against the cap even though the players are gone. It rolls off as those schedules end.", go: "frontoffice" });
  const over = groups.find((g) => g.vs >= 35 && g.you >= 10);
  if (over) advice.push({ tone: "info", title: `${over.label} cost ${over.vs}% more than the league average`, text: `$${over.you.toFixed(1)}M against an average of $${over.avg.toFixed(1)}M. That is fine for a contender's strength; it is a problem if the group is not carrying you.`, go: "roster" });
  if (!advice.length) advice.push({ tone: "good", title: "The books are clean", text: "Under the cap, nothing urgent expiring, and room next summer. Spend it where the lineup is thin.", go: "trade" });
  return { year, cap, space, next, dead, expiring: expiring.length, years, groups, biggest, advice, roster: roster.length, active: counts(league, t).active };
}
