// The section hero's numbers (common.jsx SectionHero): an eyebrow, the section's block title and
// 3–5 big numbers that belong to the screen you're on (Gridiron's Team header: "15-2 RECORD ·
// 53/53 ROSTER · $3.8M CAP SPACE · 1 OUT INJURED"). Pure: reads the league, never writes to it.
// Every stat is [caption, value, tone?] with tone "good" | "bad" | "warn" | "gold".
import { recordStr, money } from "./common.jsx";
import { counts, capSpace, payroll } from "../engine/roster.js";
import { teamRatings } from "../engine/lines.js";
import { chemistry } from "../engine/chemistry.js";
import { coachContractNote } from "../engine/coachContracts.js";
import { COACH_STYLES } from "../engine/franchise.js";
import { headline, focusExpected, weeksLeft, CAMP_PRIORITY, signed } from "../engine/developmentPlan.js";
import { divisionTable, playoffTeams, gamesLeft } from "../engine/standings.js";
import { userSeries } from "../engine/playoffs.js";
import { ROUND_NAMES } from "../engine/playoffs.js";
import { myDraftSlots } from "../engine/draft.js";
import { myList } from "../engine/scouting.js";
import { userOffers } from "../engine/market.js";
import { capOverview } from "../engine/capOverview.js";
import { gmCareer } from "../engine/legacy.js";
import { myOffers } from "../engine/negotiations.js";

const ord = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
const last = (n) => String(n || "").split(" ").slice(-1)[0];
const capStat = (cap) => ["Cap space", cap >= 0 ? money(cap) : `−${money(-cap)}`, cap >= 0 ? "good" : "bad"];
const safe = (f, d = null) => { try { return f(); } catch { return d; } };

function streak(league, user) {
  const mine = league.schedule.filter((g) => g.played && (g.h === user.id || g.a === user.id));
  let k = null, n = 0;
  for (let i = mine.length - 1; i >= 0; i--) {
    const g = mine[i], us = g.h === user.id ? g.hs : g.as, them = g.h === user.id ? g.as : g.hs;
    const r = us > them ? "W" : g.ot ? "OT" : "L";
    if (k == null) k = r;
    if (r !== k) break;
    n++;
  }
  return k ? [`${k}${n}`, k === "W" ? "good" : k === "L" && n >= 3 ? "bad" : undefined] : ["—"];
}

export function heroEyebrow(id, league, user) {
  const yr = `${league.year}-${String(league.year + 1).slice(2)}`;
  if (id === "team") return "Your team";
  if (id === "standings" || id === "season") return `${yr} season`;
  if (id === "development") return "Your players";
  if (id === "draft") return `${league.phase === "draft" && league.draft ? league.draft.year : league.draftClassYear} NHL Draft`;
  if (id === "market") return league.phase === "freeagency" ? "Free agency is open" : league.phase === "resign" ? "Re-signing week" : "The market";
  if (id === "office") return `${user.city} ${user.name}`;
  return "";
}

// key: the screen inside the section (lines, roster, coaching, schedule, playoffs, board, fa...).
export function heroStats(id, key, league, user) {
  return safe(() => statsFor(id, key, league, user), []) || [];
}

function statsFor(id, key, league, user) {
  const rec = user.rec || { w: 0, l: 0, otl: 0, pts: 0 };
  const gp = rec.w + rec.l + rec.otl;
  const pts = rec.pts ?? rec.w * 2 + rec.otl;
  const cap = capSpace(league, user);
  const c = counts(league, user);
  const injured = user.roster.map((pid) => league.players[pid]).filter((p) => p && p.injury > 0).length;
  const mine = league.schedule.filter((g) => g.played && (g.h === user.id || g.a === user.id));
  const gd = mine.reduce((s, g) => s + (g.h === user.id ? g.hs - g.as : g.as - g.hs), 0);
  const gdStat = ["Goal diff", gd > 0 ? `+${gd}` : String(gd), gd > 0 ? "good" : gd < 0 ? "bad" : undefined];

  if (id === "team" && key === "lines") {
    const r = teamRatings(league, user);
    const L = user.lines || { F: [], D: [] };
    const units = [...(L.F || []).map((ids) => chemistry(league, user, (ids || []).filter(Boolean), "F")), ...(L.D || []).map((ids) => chemistry(league, user, (ids || []).filter(Boolean), "D"))].filter((u) => u && u.score != null);
    const chem = units.length ? Math.round(units.reduce((s, u) => s + u.score, 0) / units.length) : null;
    return [["Team", String(r.ovr)], ["Forwards", String(r.fwd)], ["Defence", String(r.def)], ["Goalie", String(r.g)], chem != null && ["Chemistry", String(chem), chem >= 76 ? "good" : chem < 52 ? "warn" : undefined]].filter(Boolean);
  }
  if (id === "team" && key === "coaching") {
    const hc = user.coach || {};
    const deal = coachContractNote(league, hc);
    const rating = Math.round(((hc.development ?? 70) + (hc.specialTeams ?? 75) + (hc.leadership ?? 70)) / 3);
    return [["Coach rating", String(rating)], ["Development", String(hc.development ?? "—"), (hc.development ?? 0) >= 80 ? "good" : undefined], ["Signed through", hc.interim ? "Interim" : deal ? deal.when : "—", hc.interim || deal?.retiring ? "warn" : undefined], ["Identity", { balanced: "Balanced", attack: "Up-tempo", defend: "Defensive" }[user.strategy || hc.style] || COACH_STYLES[user.strategy || hc.style]?.name || "Balanced"]];
  }
  if (id === "team") {
    return [["Record", recordStr(rec)], ["Roster", `${c.active}/23`, c.active > 23 ? "bad" : undefined], capStat(cap), ["Injured", injured ? `${injured} out` : "None", injured ? "warn" : undefined], ["Prospects", String(user.prospects?.length || 0)]];
  }
  if (id === "development") {
    const h = headline(league, user);
    const plan = user.devPlan || {};
    const f = league.players[plan.focus];
    const pros = (user.prospects || []).map((pid) => league.players[pid]).filter(Boolean);
    const placed = pros.filter((p) => p.placement?.year === league.year);
    const rolled = placed.some((p) => p.placement.outcome);
    const thriving = placed.filter((p) => p.placement.outcome === "thrive").length;
    const exp = f && f.tid === user.id ? focusExpected(f, weeksLeft(league) || undefined) : 0;
    return [
      ["Since " + (h.since === "summer" ? "last season" : "camp"), h.n == null ? "—" : signed(h.n), h.n > 0 ? "good" : h.n < 0 ? "bad" : undefined],
      ["Focus", f ? `${last(f.name)}${plan.gained ? ` ${signed(plan.gained)}` : exp >= 0.5 ? ` +${Math.round(exp)}` : ""}` : "None", f ? undefined : "warn"],
      ["Camp", CAMP_PRIORITY[plan.camp]?.name || "—"],
      ["Prospects", rolled ? `${thriving}/${placed.length} thriving` : String(pros.length), rolled && thriving ? "good" : undefined],
    ];
  }
  if (id === "standings" || (id === "season" && key === "standings")) {
    const div = divisionTable(league, user.div);
    const place = div.findIndex((t) => t.id === user.id) + 1;
    const inNow = gp ? playoffTeams(league).has(user.id) : null;
    return [["Record", recordStr(rec)], ["Points", String(pts)], ["Division", gp ? `${ord(place)} ${user.div}` : user.div], gp ? ["Playoffs", inNow ? "In" : "Out", inNow ? "good" : "bad"] : ["Played", `${gp}/82`], gdStat];
  }
  if (id === "season" && key === "playoffs") {
    const po = league.playoffs;
    const s = po ? userSeries(league) : null;
    if (po) {
      const champ = po.champion != null;
      const won = champ && po.champion === user.id;
      const alive = !!s;
      const usW = s ? (s.top === user.id ? s.wTop : s.wBot) : null;
      const themW = s ? (s.top === user.id ? s.wBot : s.wTop) : null;
      const opp = s ? league.teams[s.top === user.id ? s.bot : s.top] : null;
      return [["Round", champ ? "Done" : ROUND_NAMES[po.round || 0] || "Playoffs"], ["Status", won ? "Champions" : alive ? "Alive" : "Out", won ? "gold" : alive ? "good" : "bad"], opp && ["Opponent", opp.abbr], usW != null && themW != null && ["Series", `${usW}-${themW}`, usW > themW ? "good" : usW < themW ? "warn" : undefined]].filter(Boolean);
    }
    const inNow = gp ? playoffTeams(league).has(user.id) : null;
    const left = gamesLeft(league)[user.id] || 0;
    return [["Record", recordStr(rec)], ["Points", String(pts)], ["Playoffs", gp ? (inNow ? "In" : "Out") : "—", gp ? (inNow ? "good" : "bad") : undefined], ["Games left", String(left)]];
  }
  if (id === "season" && key === "stats") {
    const ps = user.roster.map((pid) => league.players[pid]).filter(Boolean);
    const st = (p) => (league.phase === "playoffs" ? p.pstats : p.stats) || {};
    const ptsOf = (p) => (st(p).g || 0) + (st(p).a || 0);
    const sk = ps.filter((p) => p.pos !== "G");
    const label = league.phase === "playoffs" ? "Playoff " : "";
    const topP = [...sk].sort((a, b) => ptsOf(b) - ptsOf(a))[0];
    const topG = [...sk].sort((a, b) => (st(b).g || 0) - (st(a).g || 0))[0];
    const out = [["Record", recordStr(rec)]];
    if (topP && ptsOf(topP) > 0) out.push([`${label}points leader`.replace(/^p/, "P"), `${last(topP.name)} ${ptsOf(topP)}`]);
    if (topG && (st(topG).g || 0) > 0) out.push(["Goals leader", `${last(topG.name)} ${st(topG).g}`]);
    out.push(["Goals for", String(rec.gf ?? mine.reduce((s, g) => s + (g.h === user.id ? g.hs : g.as), 0))]);
    out.push(gdStat);
    return out;
  }
  if (id === "season") {
    const left = gamesLeft(league)[user.id] || 0;
    const [sv, stone] = streak(league, user);
    return [["Record", recordStr(rec)], ["Played", `${gp}/82`], ["Games left", String(left)], ["Streak", sv, stone], gdStat];
  }
  if (id === "draft") {
    const dy = league.phase === "draft" && league.draft ? league.draft.year : league.draftClassYear;
    const picks = league.draftPicks.filter((p) => p.owner === user.id && p.year === dy);
    const slots = safe(() => myDraftSlots(league), []) || [];
    const reports = user.surveyLog?.year === league.draftClassYear ? user.surveyLog.filed : 0;
    if (key === "recap" && league.draft?.slots) {
      const made = league.draft.slots.filter((s) => s.owner === user.id && s.pid);
      const first = made[0] && league.players[made[0].pid];
      return [["Picks made", String(made.length)], first && ["First pick", `${last(first.name)} #${made[0].overall}`], ["Draft class", String(league.draft.year)]].filter(Boolean);
    }
    if (key === "floor" && league.draft?.slots) {
      const left = league.draft.slots.filter((s) => s.owner === user.id && !s.pid);
      return [["Picks left", String(left.length)], left[0] ? ["Next pick", `#${left[0].overall}`, "gold"] : ["Next pick", "Done"], ["Your list", String(myList(league).ids.length)]];
    }
    return [["Your picks", String(slots.length || picks.length)], ["First pick", slots[0] ? `#${slots[0]}` : picks.length ? "TBD" : "None", slots[0] ? "gold" : undefined], ["Reports filed", String(reports)], ["Your list", String(myList(league).ids.length)]];
  }
  if (id === "market") {
    const fa = league.freeAgents?.length || 0;
    if (key === "fa") {
      const pending = safe(() => myOffers(league).filter((o) => o.standing.status === "pending").length, 0);
      return [capStat(cap), ["Roster spots", String(Math.max(0, 23 - c.active))], ["Free agents", String(fa)], ["Your offers", String(pending)]];
    }
    if (key === "block") {
      const mineOn = (league.block || []).filter((b) => league.players[b.pid]?.tid === user.id).length;
      return [["On your block", String(mineOn)], ["Trade offers", String(userOffers(league).length), userOffers(league).length ? "good" : undefined], capStat(cap)];
    }
    return [capStat(cap), ["Roster", `${c.active}/23`], ["Trade offers", String(userOffers(league).length), userOffers(league).length ? "good" : undefined], ["Free agents", String(fa)]];
  }
  if (id === "office") {
    if (["club", "hall", "records", "awards", "tx", "teams"].includes(key)) {
      const g = gmCareer(league);
      // The season under way counts too (the archive only holds finished ones).
      const now = !(league.seasonArchive || []).some((x) => x.year === league.year) && gp > 0;
      return [["Seasons", String(g.seasons + (now ? 1 : 0))], ["Record", `${g.w + (now ? rec.w : 0)}-${g.l + (now ? rec.l + rec.otl : 0)}`], ["Playoffs", String(g.playoffs)], ["Stanley Cups", String(g.cups.length), g.cups.length ? "gold" : undefined]];
    }
    const ov = capOverview(league, user);
    return [capStat(cap), ["Payroll", money(payroll(league, user))], ["Expiring", String(ov.expiring)], ["Owner trust", String(Math.round(user.owner?.trust ?? 60))], ["Fans", `${Math.round(user.owner?.fanSupport ?? 60)}%`]];
  }
  return [];
}
