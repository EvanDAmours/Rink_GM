import { coachRetirementNotice } from "./coachContracts.js";
// Home screen logic (the football game's HomeScreen and inbox, translated to hockey): the Needs
// Attention list, the one-tap fixes it offers, the matchup's star players and kickoff line, and
// the off-season board. Pure functions of the league, so the screen and the tests share them.
import { capSpace, rosterIssues, counts, ensureMinimums } from "./roster.js";
import { MAX_ROSTER, FA_DAYS, isGoalie } from "./constants.js";
import { hireCoach } from "./franchise.js";
import { lockPlan } from "./developmentPlan.js";
import { talkDown, shopPlayer } from "./tradeRequests.js";
import { teamNeeds } from "./teamPlanning.js";
import { headCoachLines } from "./lines.js";
import { automaticallyHandleRoster } from "./autoRoster.js";
import { dayToDate } from "./schedule.js";
import { holdouts, playItOut, holdFirm } from "./contractYear.js";
import { isRFA } from "./players.js";
import { elcMax } from "./hockeyRules.js";
import { staffWindowOpen, SCOUT_SLOTS } from "./scouting.js";
import * as Regions from "./regions.js";

// Urgent first, then decisions, then news; the order items are added in breaks ties.
export const TONE_RANK = { urgent: 0, action: 1, info: 2 };
export const sortAttention = (items) => items.map((it, i) => ({ it, i })).sort((a, b) => (TONE_RANK[a.it.tone] ?? 3) - (TONE_RANK[b.it.tone] ?? 3) || a.i - b.i).map((x) => x.it);

const titleCase = (s) => String(s || "").toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
const plural = (n, w, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;
const inSeasonPhase = (lg) => lg.phase === "preseason" || (lg.phase === "regular" && !lg.schedule.every((g) => g.played));

// The best coach on the market by the same measure the AI clubs hire with.
function bestCoach(lg) {
  return [...(lg.coachMarket || [])].filter((c) => !lg.teams.some((o) => o.coach?.id === c.id))
    .sort((a, b) => (b.development + b.specialTeams + b.leadership) - (a.development + a.specialTeams + a.leadership))[0] || null;
}
const canHire = (lg, t) => !!t.coach?.interim || ["preseason", "resign", "freeagency"].includes(lg.phase);

// Players under contract for next season (re-sign week and free agency, after the old deals ran out).
export const signedForNextSeason = (lg, t) => t.roster.map((id) => lg.players[id]).filter((p) => p && p.signed !== false && (p.yrs > 0 || p.extension)).length;

// Needs Attention: only what would stop the sim or cause a real problem (an illegal roster, over
// the cap, a hole in the lineup, a contract decision with a deadline). Nags and news (development
// focus, game plan, contract-year talks, camp, the Gazette, trade requests) live on their own
// pages. An empty list means "All set". Each item: { key, icon, tone, title, sub, cta, to, fixes, dismiss }.
// `to` says where the item's button goes: ["screen", "section"], { player }, { paper } or { lab: true }.
// `fixes` are one-tap answers run by runFix(): [{ label, fix }].
export function needsAttention(lg) {
  const t = lg.teams[lg.userTid];
  if (!t) return [];
  const items = [];
  const add = (it) => items.push(it);
  const roster = t.roster.map((id) => lg.players[id]).filter(Boolean);
  const room = capSpace(lg, t);
  const inSeason = inSeasonPhase(lg);
  const games = lg.phase === "preseason" || lg.phase === "regular" || (lg.phase === "playoffs" && lg.playoffs?.champion == null);

  if (room < 0) add({ key: "cap", icon: "💸", tone: "urgent", title: `Over the cap by $${(-room).toFixed(2)}M`, sub: "Trade, release or send down players to get under the cap.", cta: "Roster", to: ["roster"] });
  // Roster limits matter while games are still being played; once the Cup is awarded they wait for the summer.
  if (games) rosterIssues(lg, t).filter((i) => !/salary cap/i.test(i)).forEach((i, n) => {
    const fixes = /^Need /.test(i) ? [{ label: "Call up from the AHL", fix: "callUps" }] : /active players/.test(i) ? [{ label: "Send down automatically", fix: "sendDown" }] : [];
    add({ key: `issue${n}`, icon: "⚠️", tone: "urgent", title: i.replace(/\.$/, ""), sub: "Fix it on the Roster screen before the next game.", cta: "Roster", to: ["roster"], fixes });
  });

  // Injured regulars: covered by the head coach, or a one-tap re-set of the lines around them.
  const covered = lg.settings?.coachLines !== false;
  // Covered injuries live on the weekly injury report card (Gridiron 3.70); only a hole you must fill stays here.
  if (!covered) roster.filter((p) => p.injury > 0 && p.ovr >= 80).sort((a, b) => b.ovr - a.ovr).forEach((p) => add({ key: `inj${p.id}`, icon: "🚑", tone: covered ? "info" : "action",
    title: `${p.name} (${p.pos} ${p.ovr}) out ${plural(p.injury, "game")}${covered ? " · coach covered" : ""}`,
    sub: `${p.injuryNote ? `${p.injuryNote[0].toUpperCase()}${p.injuryNote.slice(1)}. ` : ""}${covered ? "Your head coach filled the hole with the best healthy scratch." : "Set your lines around him, or let the staff fill the hole."}`,
    cta: "Lines", to: ["lines"], fixes: covered || !games ? [] : [{ label: "Auto-set lines", fix: "autoLines" }] }));

  // Contract years and holdouts (contractYear.js): talk now, or let him bet on himself.
  holdouts(lg).forEach((p) => add({ key: `ho${p.id}`, icon: "✋", tone: "urgent", title: `${p.name} (${p.pos} ${p.ovr}) is holding out`,
    sub: `He won't sign his $${p.holdout.qo.toFixed(2)}M qualifying offer and sits until he gets a market deal (about $${p.holdout.ask.toFixed(2)}M × ${p.holdout.yrs}). ${p.holdout.firm ? "You're holding firm: he may give in any week." : "Meet his ask, or hold firm and wait him out."} December 1 is the signing deadline.`,
    cta: "Talk contract", to: { player: p.id }, fixes: p.holdout.firm ? [] : [{ label: "✋ Hold firm", fix: `holdFirm:${p.id}` }] }));
  const sheets = lg.offerSheets?.filter((s) => !s.done && s.from === t.id).length || 0;
  if (sheets) add({ key: "sheets", icon: "📝", tone: "action", title: `${plural(sheets, "offer sheet")} awaiting a decision`, sub: "Match it or take the compensation.", cta: "Review", to: ["operations"] });
  const keyDeals = contractReminder(lg);
  if (lg.phase === "resign") {
    const left = [...t.roster, ...t.prospects].map((id) => lg.players[id]).filter((p) => p && p.signed !== false && p.yrs === 0).length;
    // The grouped key-player reminder below says the same thing with names; one row, not two.
    if (left && !keyDeals) add({ key: "resign", icon: "✍️", tone: "action", title: `${plural(left, "expiring contract")}: the re-sign window is open`, sub: "Only you can talk to them this week. Anyone you don't re-sign reaches free agency.", cta: "Re-sign", to: ["freeagency"] });
  }
  // A short roster in the off-season (the football game's Build Your 53).
  const signed = signedForNextSeason(lg, t);
  if (["resign", "freeagency"].includes(lg.phase) && signed < MAX_ROSTER) add({ key: "short", icon: "🧩", tone: lg.phase === "freeagency" && (lg.fa?.day ?? 0) >= FA_DAYS - 5 ? "urgent" : "action", title: `${signed} of ${MAX_ROSTER} NHL spots signed for next season`, sub: `${plural(MAX_ROSTER - signed, "spot")} to fill. ${lg.phase === "freeagency" ? "Sign free agents, trade, or let camp fill them from the farm." : "Re-sign your own players first; free agency opens next."}`, cta: lg.phase === "freeagency" ? "Free agency" : "Re-sign", to: ["freeagency"] });
  // His head coach's last two seasons before he retires (coachContracts.js): a dismissible note.
  const hc = coachRetirementNotice(lg);
  if (hc) add({ key: "hcRetire", icon: "👔", tone: "info", title: `${t.coach.name} retires after ${hc.last}-${String(hc.last + 1).slice(2)}`, sub: `${hc.text} Line up his successor on the Coaching page.`, cta: "Coaching", to: ["frontoffice", "coaching"], dismiss: "hcNote" });
  // The reminder board (Evan, r12): the few things a GM forgets, each gone once it's done.
  reminders(lg, keyDeals).forEach(add);
  return sortAttention(items);
}

// ---------- Reminders ----------
// Calm, essential, below the blockers: the season plan's focus player, open scout jobs and
// regions, and one grouped line for the key contracts. No popups, no inbox; each disappears
// once it's done (the contracts line can also be put off for a month or until the next phase).
export function reminders(lg, keyDeals = contractReminder(lg)) {
  const t = lg.teams[lg.userTid];
  if (!t) return [];
  const out = [];
  // 1. Development: the focus player, while the season plan is still open.
  const plan = t.devPlan;
  if (lg.phase === "preseason" && !(plan?.year === lg.year && (plan.locked || plan.focusSet))) {
    const staff = plan?.year === lg.year ? lg.players[plan.focus] : null;
    out.push({ key: "rmFocus", icon: "🎯", tone: "info", title: "Pick your focus player", sub: staff ? `Staff pick for now: ${staff.name}.` : "One player gets the staff's extra work.", cta: "Season plan", to: ["development", "plan"] });
  }
  // 2. Scouting: open jobs (while you can hire), then scouts without a full set of regions.
  if (staffWindowOpen(lg)) {
    const open = SCOUT_SLOTS.filter((k) => !t.scouts?.[k]).length;
    if (open) out.push({ key: "rmScoutHire", icon: "🔭", tone: "info", title: open === 1 ? "Hire a scout" : `Hire ${open} scouts`, sub: `${plural(open, "scouting job")} open.`, cta: "Scouts", to: ["draft", "scouts"] });
  }
  const unset = scoutsWithoutRegions(lg, t);
  if (unset && Regions.assignWindowOpen(lg)) out.push({ key: "rmScoutRegions", icon: "🗺️", tone: "info", title: "Set your scouts' regions", sub: unset === 1 ? "1 scout still needs a region." : `${unset} scouts still need regions.`, cta: "Assignments", to: ["draft", "regions"] });
  // 3. Contracts: one grouped row for the deals worth acting on.
  if (keyDeals) out.push(keyDeals);
  return out;
}

// A hired scout counts as unset with no region, an empty list, or fewer regions than his slots
// (multi-region scouting gives seats several slots; read the cap if regions.js has one).
const slotCap = (role) => {
  for (const f of ["regionSlots", "regionCap", "scoutRegionSlots", "slotsFor", "regionSlotCount"]) if (typeof Regions[f] === "function") { const n = Number(Regions[f](role)); if (Number.isFinite(n)) return n; }
  for (const c of ["REGION_SLOTS", "SCOUT_REGION_SLOTS", "REGION_CAPS"]) if (Regions[c] && Number.isFinite(Number(Regions[c][role]))) return Number(Regions[c][role]);
  return 1;
};
export function scoutsWithoutRegions(lg, t = lg.teams[lg.userTid]) {
  const raw = t?.scoutRegions && typeof t.scoutRegions === "object" ? t.scoutRegions : {};
  return SCOUT_SLOTS.filter((role) => t?.scouts?.[role]).filter((role) => {
    const v = raw[role];
    const list = Array.isArray(v) ? v.filter((r) => Regions.REGIONS[r]) : Regions.REGIONS[v] ? [v] : [];
    return list.length < Math.max(1, slotCap(role));
  }).length;
}

// The players whose next deal matters: coming off an entry-level deal (RFA next summer), or top
// talent (top-6 forward, top-4 defenseman, the starting goalie, or 85+) whose deal runs out.
export const CONTRACT_SNOOZE_DAYS = 30;
const isElc = (lg, p) => !!p.elc || (p.age <= 24 && isRFA(p) && (p.cap || 0) <= elcMax(lg.year) + 0.001);
export function keyContracts(lg, t = lg.teams[lg.userTid]) {
  const resign = lg.phase === "resign";
  const ending = (p) => p && p.signed !== false && !p.extension && !p.holdout && (resign ? p.yrs === 0 : p.yrs === 1);
  const roster = t.roster.map((id) => lg.players[id]).filter(Boolean);
  const best = (f, n) => roster.filter(f).sort((a, b) => b.ovr - a.ovr).slice(0, n);
  const top = new Set([...best((p) => /^(C|LW|RW)$/.test(p.pos), 6), ...best((p) => isDefenseman(p), 4), ...best((p) => isGoalie(p.pos), 1)].map((p) => p.id));
  const pool = resign ? [...t.roster, ...t.prospects].map((id) => lg.players[id]) : roster;
  return pool.filter(ending).filter((p) => p.ovr >= 85 || top.has(p.id) || (isElc(lg, p) && (p.ovr >= 75 || p.pot >= 82))).sort((a, b) => b.ovr - a.ovr);
}
const isDefenseman = (p) => p.pos === "D" || p.pos === "LD" || p.pos === "RD";
// From the second half (or the trade deadline) through the playoffs and draft, and always in re-sign week.
export function contractReminderDue(lg, t = lg.teams[lg.userTid]) {
  if (lg.phase === "resign" || lg.phase === "playoffs" || lg.phase === "draft") return true;
  return lg.phase === "regular" && ((t?.rec?.gp || 0) >= 41 || (lg.deadlineDay != null && lg.day >= lg.deadlineDay));
}
const snoozed = (lg) => { const s = lg.reminderSnooze?.contracts; return !!s && s.year === lg.year && s.phase === lg.phase && (lg.day || 0) - (s.day || 0) < CONTRACT_SNOOZE_DAYS; };
export function contractReminder(lg) {
  const t = lg.teams[lg.userTid];
  if (!t || !contractReminderDue(lg, t) || snoozed(lg)) return null;
  const ps = keyContracts(lg, t);
  if (!ps.length) return null;
  const last = (p) => p.name.split(" ").slice(1).join(" ") || p.name;
  const names = ps.slice(0, 3).map(last).join(", ") + (ps.length > 3 ? ` +${ps.length - 3}` : "");
  const resign = lg.phase === "resign";
  return { key: "rmContracts", icon: "✍️", tone: resign ? "action" : "info", title: ps.length === 1 ? `${ps[0].name} needs a new deal` : `${ps.length} key players need new deals`, sub: names, cta: resign ? "Re-sign" : "Contracts", to: resign ? ["freeagency"] : ["frontoffice", "contracts"], dismiss: "contractsLater", dismissLabel: "Not now", pids: ps.map((p) => p.id) };
}

// Run a one-tap fix from Needs Attention. Returns { ok, msg }.
export function runFix(lg, fix) {
  const t = lg.teams[lg.userTid];
  // "kind:argument" (the argument may contain colons itself, as paper ids do)
  const str = String(fix), cut = str.indexOf(":");
  const kind = cut < 0 ? str : str.slice(0, cut), arg = cut < 0 ? "" : str.slice(cut + 1);
  // The old "fill the focus slots" fix: the staff's season plan stands, locked in.
  if (kind === "autoFocus" || kind === "lockPlan") return lockPlan(lg);
  if (kind === "autoLines") { const moves = headCoachLines(lg, t); return { ok: true, msg: moves.length ? `Lines re-set: ${plural(moves.length, "change")} around the injuries.` : "Your lines already cover every injury." }; }
  if (kind === "callUps") { ensureMinimums(lg, t, { notify: true }); const left = rosterIssues(lg, t).filter((i) => /^Need /.test(i)); return { ok: !left.length, msg: left.length ? left[0] : "Called up from the AHL: the lineup is full." }; }
  if (kind === "sendDown") return automaticallyHandleRoster(lg, t, { allowWaivers: false });
  if (kind === "hireCoach") return hireCoach(lg, arg);
  if (kind === "hcNote") { const n = coachRetirementNotice(lg); if (n) lg.hcNoteDismissed = n.key; return { ok: true, msg: "" }; }
  if (kind === "contractsLater") { (lg.reminderSnooze ||= {}).contracts = { year: lg.year, phase: lg.phase, day: lg.day || 0 }; return { ok: true, msg: "" }; }
  if (kind === "talkDown") return talkDown(lg, arg);
  if (kind === "shop") return shopPlayer(lg, arg);
  if (kind === "playItOut") return playItOut(lg, arg);
  if (kind === "holdFirm") return holdFirm(lg, arg);
  if (kind === "paper") { const p = (lg.papers || []).find((x) => String(x.id) === arg); if (p) p.seen = true; return { ok: !!p, msg: "" }; }
  return { ok: false, msg: "Nothing to do." };
}

// The club's best healthy player, for the matchup portraits (the football game's highestRatedPlayer).
export function topPlayer(lg, team) {
  const ps = (team?.roster || []).map((id) => lg.players[id]).filter(Boolean);
  const ok = ps.filter((p) => !(p.injury > 0) && !p.ltir);
  return (ok.length ? ok : ps).sort((a, b) => b.ovr - a.ovr || (isGoalie(a.pos) ? 1 : 0) - (isGoalie(b.pos) ? 1 : 0))[0] || null;
}

// "Tue, Oct 20 · 7:00 PM ET" from the fixture's start time; the game's date and a local
// puck drop when the calendar has no time (generated seasons).
export function kickoffText(lg, g) {
  if (g?.startTimeUTC) {
    try {
      const d = new Date(g.startTimeUTC);
      const et = (o) => d.toLocaleString("en-US", { timeZone: "America/New_York", ...o });
      const iso = `${et({ year: "numeric" })}-${String(et({ month: "numeric" })).padStart(2, "0")}-${String(et({ day: "numeric" })).padStart(2, "0")}`;
      if (!isNaN(d) && (!g.date || g.date === iso)) return `${et({ weekday: "short", month: "short", day: "numeric" })} · ${et({ hour: "numeric", minute: "2-digit" })} ET`;
    } catch { /* no time-zone data: fall through */ }
  }
  return g ? `${dayToDate(lg.year, g.day, lg.scheduleStart)} · 7:00 PM local` : "";
}
// Saturday night in Canada, the league's big stage (the football game's prime-time badge).
const CANADA = new Set(["TOR", "MTL", "OTT", "WPG", "CGY", "EDM", "VAN"]);
export function primeTime(lg, g) {
  if (!g?.startTimeUTC) return null;
  const d = new Date(g.startTimeUTC);
  if (isNaN(d)) return null;
  let wd = "", hr = 0;
  try { wd = d.toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short" }); hr = Number(d.toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false })) % 24; } catch { return null; }
  // the evening games (7 and 10 PM ET), not the afternoon ones
  return wd === "Sat" && hr >= 18 && [g.h, g.a].some((id) => CANADA.has(lg.teams[id]?.abbr)) ? "Hockey Night in Canada" : null;
}

// Position names for the needs board.
export const NEED_NAME = { C: "Center", LW: "Left wing", RW: "Right wing", LD: "Left defense", RD: "Right defense", G: "Goalie" };

// The off-season board (and the no-game state in the playoffs): the club's biggest needs with the
// reasons, beside the deals ending (or, once free agency opens, the young core). Every row says
// where you'd act on it: `to` is ["screen", "section"] or { player }.
export function offseasonBoard(lg) {
  const t = lg.teams[lg.userTid];
  const ph = lg.phase;
  const needTo = ph === "resign" || ph === "freeagency" ? ["freeagency"] : ph === "draft" ? ["draft"] : ["trade"];
  const needs = teamNeeds(lg, t).filter((n) => n.score >= 20).slice(0, 4).map((n) => ({
    pos: n.pos, name: NEED_NAME[n.pos] || n.pos, score: n.score, have: n.have, target: n.target,
    why: n.reasons.filter((r) => !/developing replacement/.test(r)).slice(0, 2).join(" · ") || n.role, to: needTo,
  }));
  const roster = t.roster.map((id) => lg.players[id]).filter(Boolean);
  let kind, list;
  if (ph === "freeagency") {
    kind = "young";
    list = [...roster, ...t.prospects.map((id) => lg.players[id]).filter(Boolean)].filter((p) => p.age <= 23).sort((a, b) => b.ovr - a.ovr || b.pot - a.pot).slice(0, 5)
      .map((p) => ({ p, note: `POT ${p.pot}`, to: ["development"] }));
  } else if (ph === "resign") {
    kind = "expiring";
    list = [...t.roster, ...t.prospects].map((id) => lg.players[id]).filter((p) => p && p.signed !== false && p.yrs === 0).sort((a, b) => b.ovr - a.ovr).slice(0, 5)
      .map((p) => ({ p, note: p.willing === false ? "testing the market" : "re-sign now", to: ["freeagency"] }));
  } else {
    kind = "expiring";
    list = roster.filter((p) => p.yrs === 1 && !p.extension).sort((a, b) => b.ovr - a.ovr).slice(0, 5)
      .map((p) => ({ p, note: "deal ends this summer", to: ["frontoffice", "contracts"] }));
    if (!list.length) { kind = "young"; list = roster.filter((p) => p.age <= 23).sort((a, b) => b.ovr - a.ovr).slice(0, 5).map((p) => ({ p, note: `POT ${p.pot}`, to: ["development"] })); }
  }
  return { needs, kind, title: kind === "young" ? "YOUR YOUNG CORE" : "DEALS ENDING", list, signed: ph === "resign" || ph === "freeagency" ? signedForNextSeason(lg, t) : counts(lg, t).active, target: MAX_ROSTER };
}
