// Game Prep (Gridiron 3.34 Week Prep): everything for your next game on one screen. This module
// builds the opponent report (record, form, top line and pair, goalie, PP/PK rank, key matchups)
// and the Ready Check: hurt regulars still in your lines, an empty spot in the lineup, a tired
// goalie or the back half of a back-to-back, a game plan that doesn't fit this opponent, and
// empty development focus slots. Each open item carries a fix the screen can apply in one tap.
import { gameLines, syncLines, lineupIds } from "./lines.js";
import { composites } from "./ratings.js";
import { isGoalie, isDefense } from "./constants.js";
import { winProbability, teamStrength } from "./matchup.js";
import { matchupPlan } from "./teamPlanning.js";
import { divisionTable } from "./standings.js";
import { userSeries, nextGame } from "./playoffs.js";
import { savePct, gaa } from "./players.js";
import { ensureDevPlan, lockPlan } from "./developmentPlan.js";
import { callUp } from "./roster.js";
import { isOut, injuredRegulars, eachSlot, slotName, replacementOptions, chooseReplacement } from "./injuries.js";
import { injuryReturn, outPhrase } from "./injuryReport.js";

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const ORD = (n) => n + (["st", "nd", "rd"][((n + 90) % 100 - 10) % 10 - 1] || "th");
const last = (name) => String(name || "").split(" ").slice(1).join(" ") || name;
export const PLAN_KEYS = [["forecheck", "forecheck"], ["neutral", "neutral zone"], ["attack", "attack"]];
const PLAN_DEFAULT = { forecheck: "balanced", neutral: "balanced", attack: "balanced" };

// Your next game: { opp, home, day, game (schedule entry) } in the season, { opp, home, series,
// gameNo } in the playoffs, or null when there's no game to prepare for.
export function nextMatchup(league) {
  const t = league.teams[league.userTid];
  if (league.phase === "playoffs") {
    const s = userSeries(league);
    if (!s) return null;
    const g = nextGame(league, s);
    return { opp: league.teams[s.top === t.id ? s.bot : s.top], home: g.home === t.id, series: s, gameNo: s.games.length + 1 };
  }
  if (!["preseason", "regular"].includes(league.phase)) return null;
  const g = (league.schedule || []).filter((x) => !x.played && (x.h === t.id || x.a === t.id)).sort((a, b) => a.day - b.day)[0];
  if (!g) return null;
  return { opp: league.teams[g.h === t.id ? g.a : g.h], home: g.h === t.id, day: g.day, game: g };
}

// The last n results for a club: "W", "L" or "O" (lost in overtime or a shootout).
export function form(league, team, n = 5) {
  return (league.schedule || []).filter((g) => g.played && (g.h === team.id || g.a === team.id)).sort((a, b) => a.day - b.day).slice(-n).map((g) => {
    const home = g.h === team.id, us = home ? g.hs : g.as, them = home ? g.as : g.hs;
    return us > them ? "W" : g.ot ? "O" : "L";
  });
}

// Special-teams strength for every club, from its dressed PP and PK units (the first unit counts
// most), ranked 1-32. Ranks by the units a club dresses tonight, so injuries move them.
function unitScore(league, ids, key) {
  const ps = (ids || []).map((id) => league.players[id]).filter((p) => p && !isGoalie(p.pos));
  return ps.length ? avg(ps.map((p) => composites(p)[key] * 0.7 + p.ovr * 0.3)) : 0;
}
export function specialTeamsRanks(league) {
  const rows = league.teams.map((t) => {
    const L = gameLines(league, t);
    return { id: t.id, pp: unitScore(league, L.PP?.[0], "off") * 0.65 + unitScore(league, L.PP?.[1], "off") * 0.35, pk: unitScore(league, L.PK?.[0], "def") * 0.65 + unitScore(league, L.PK?.[1], "def") * 0.35 };
  });
  const rank = (k) => Object.fromEntries([...rows].sort((a, b) => b[k] - a[k]).map((r, i) => [r.id, i + 1]));
  return { pp: rank("pp"), pk: rank("pk"), n: rows.length };
}
const ppGoals = (league, team) => team.roster.reduce((s, id) => s + (league.players[id]?.stats?.ppg || 0), 0);

// Who to watch on a club: its best healthy scorer, defender and its goalie tonight.
function starOf(league, team, test, key) {
  return team.roster.map((id) => league.players[id]).filter((p) => p && !isOut(p) && test(p)).sort((a, b) => key(b) - key(a))[0] || null;
}
const edge = (a, b) => { const d = a - b; return d >= 3 ? { edge: "EDGE: YOU", tone: "good" } : d <= -3 ? { edge: "EDGE: THEM", tone: "bad" } : { edge: "EVEN", tone: "even" }; };
const goalieLine = (p) => (!p ? "" : p.stats?.gp ? `${savePct(p.stats).toFixed(3).slice(1)} SV% · ${gaa(p.stats).toFixed(2)} GAA` : `${p.ovr} OVR`);

// The scouting report on tonight's opponent.
export function opponentReport(league, team, opp, { home = true } = {}) {
  const L = gameLines(league, opp), mine = gameLines(league, team);
  const get = (id) => league.players[id] || null;
  const topLine = L.F[0].map(get).filter(Boolean), topPair = L.D[0].map(get).filter(Boolean);
  const goalie = get(L.G[0]), myGoalie = get(mine.G[0]);
  const st = specialTeamsRanks(league);
  const divRank = divisionTable(league, opp.div).findIndex((t) => t.id === opp.id) + 1;
  const us = teamStrength(league, team), them = teamStrength(league, opp);
  const prob = winProbability(league, team, opp, { home });
  const off = (p) => composites(p).off, def = (p) => composites(p).def;
  const fwd = (p) => !isGoalie(p.pos) && !isDefense(p.pos), dman = (p) => isDefense(p.pos);
  const myScorer = starOf(league, team, fwd, off), theirD = starOf(league, opp, dman, def);
  const theirScorer = starOf(league, opp, fwd, off), myD = starOf(league, team, dman, def);
  const matchups = [];
  if (myScorer && theirD) matchups.push({ label: "Your top scorer vs their best defender", short: "Top scorer vs their best D", mine: myScorer, theirs: theirD, ...edge(off(myScorer), def(theirD)) });
  if (myD && theirScorer) matchups.push({ label: "Your best defender vs their top scorer", short: "Best D vs their top scorer", mine: myD, theirs: theirScorer, ...edge(def(myD), off(theirScorer)) });
  if (myGoalie && goalie) matchups.push({ label: "Goaltending", short: "Goaltending", mine: myGoalie, theirs: goalie, mineNote: goalieLine(myGoalie), theirsNote: goalieLine(goalie), ...edge(myGoalie.ovr, goalie.ovr) });
  const injured = opp.roster.map(get).filter((p) => isOut(p) && p.ovr >= 78).sort((a, b) => b.ovr - a.ovr).slice(0, 3);
  const lineOvr = Math.round(avg(topLine.map((p) => p.ovr)));
  const ppR = st.pp[opp.id], pkR = st.pk[opp.id];
  // Plain notes, the football game's scouting lines in hockey terms.
  const notes = [];
  if (topLine.length) notes.push({ tone: lineOvr >= 86 ? "watch" : "target", text: `Their top line (${topLine.map((p) => last(p.name)).join(", ")}) averages ${lineOvr}.${lineOvr >= 86 ? " Your best defensive pair should see them." : ""}` });
  if (ppR <= 8) notes.push({ tone: "watch", text: `Their power play ranks ${ORD(ppR)}: stay out of the box.` });
  if (pkR >= 25) notes.push({ tone: "target", text: `Their penalty kill ranks ${ORD(pkR)}: draw penalties and make them pay.` });
  if (goalie && goalie.stats?.gp >= 5 && savePct(goalie.stats) < 0.895) notes.push({ tone: "target", text: `${goalie.name} has a ${savePct(goalie.stats).toFixed(3).slice(1)} save percentage: get pucks on net.` });
  else if (goalie && goalie.ovr >= 86) notes.push({ tone: "watch", text: `${goalie.name} (${goalie.ovr}) is one of the league's best: you'll need traffic in front.` });
  if (injured.length) notes.push({ tone: "target", text: `${injured.map((p) => `${p.name} (${p.pos})`).join(", ")} ${injured.length === 1 ? "is" : "are"} out for them.` });
  return {
    opp, home, record: `${opp.rec.w}-${opp.rec.l}-${opp.rec.otl}`, pts: opp.rec.pts, divRank, form: form(league, opp), myForm: form(league, team),
    topLine, lineOvr, topPair, pairOvr: Math.round(avg(topPair.map((p) => p.ovr))), goalie, goalieNote: goalieLine(goalie),
    pp: { rank: ppR, goals: ppGoals(league, opp) }, pk: { rank: pkR }, myPp: { rank: st.pp[team.id] }, myPk: { rank: st.pk[team.id] }, teams: st.n,
    prob, edges: { off: us.off - them.off, def: us.def - them.def, goalie: us.goalie - them.goalie }, matchups, injured, notes,
  };
}

// Your goalie situation: back-to-backs and long runs of starts (regular season only).
function goalieCheck(league, team, mu) {
  const L = gameLines(league, team);
  const starter = league.players[L.G[0]], backup = league.players[L.G[1]];
  if (!starter) return null;
  if (league.phase !== "regular" || mu?.day == null) return { key: "goalie", ok: true, text: `${starter.name} is your starter.` };
  const played = (league.schedule || []).filter((x) => x.played && (x.h === team.id || x.a === team.id)).sort((a, b) => a.day - b.day);
  const startedBy = (x) => (x.h === team.id ? x.gl?.h : x.gl?.a);
  let streak = 0;
  for (let k = played.length - 1; k >= 0; k--) { if (String(startedBy(played[k])) === String(starter.id)) streak++; else break; }
  const prev = played.at(-1);
  const b2b = prev && mu.day - prev.day === 1 && String(startedBy(prev)) === String(starter.id);
  if (backup && b2b) return { key: "goalie", ok: false, text: `${starter.name} played last night: this is the back half of a back-to-back. ${backup.name} is rested.`, fix: { kind: "goalie", label: `Start ${last(backup.name)}` } };
  if (backup && streak >= 8) return { key: "goalie", ok: false, text: `${starter.name} has started ${streak} straight. A night off would keep him fresh.`, fix: { kind: "goalie", label: `Start ${last(backup.name)}` } };
  return { key: "goalie", ok: true, text: `${starter.name} is your starter${streak > 1 ? ` (${streak} straight)` : ""}, and he's rested.` };
}

// The Ready Check: [{ key, ok, text, fix?: { kind, label, pid? }, link?: { label, to: [tab, sub] } }].
export function readyCheck(league, mu = nextMatchup(league)) {
  const team = league.teams[league.userTid];
  const items = [];
  if (!team) return items;
  // 1. Injured regulars still sitting in your saved lines (the game covers them, but it's your call).
  const hurt = injuredRegulars(league, team).filter((x) => !x.chosen);
  for (const x of hurt) {
    const r = injuryReturn(league, x.p);
    items.push({ key: `inj${x.p.id}`, ok: false, pid: x.p.id, text: `${x.p.name} (${slotName(x.slot).short}) is ${outPhrase(r)}. ${x.fill ? `${x.fill.name} fills in` : "Nobody healthy is left to fill in"}: pick who plays there.`, fix: { kind: "replace", label: "Choose", pid: x.p.id } });
  }
  if (!hurt.length) items.push({ key: "inj", ok: true, text: "No injured regulars waiting on a replacement." });
  // 2. An empty spot in tonight's lineup.
  const tonight = gameLines(league, team), empty = [];
  eachSlot(tonight, (id, s) => { if (id == null) empty.push(slotName(s).short); });
  if (empty.length) items.push({ key: "lines", ok: false, text: `Your lineup has ${empty.length === 1 ? "an empty spot" : `${empty.length} empty spots`} (${empty.join(", ")}). Call someone up from the AHL.`, fix: { kind: "fill", label: "Fill it" }, link: { label: "Roster", to: ["roster"] } });
  else items.push({ key: "lines", ok: true, text: "Every line, pair and the crease are full." });
  // 3. The goalie.
  const g = goalieCheck(league, team, mu);
  if (g) items.push(g);
  // 4. The game plan against this opponent.
  if (mu?.opp) {
    const best = matchupPlan(league, team, mu.opp);
    if (team.autoPlan !== false) items.push({ key: "plan", ok: true, text: `Game plan: your coaches adapt to ${mu.opp.abbr} (${best.forecheck} forecheck, ${best.neutral === "trap" ? "the trap" : "balanced neutral zone"}, ${best.attack} attack).` });
    else if (!team.gamePlan) items.push({ key: "plan", ok: false, text: "No game plan is set for this game.", fix: { kind: "plan", label: "Use the best fit" } });
    else {
      const cur = { ...PLAN_DEFAULT, ...team.gamePlan };
      const diff = PLAN_KEYS.filter(([k]) => cur[k] !== best[k]);
      if (diff.length) items.push({ key: "plan", ok: false, text: `Your plan isn't the best fit vs ${mu.opp.abbr}: ${diff.map(([k, w]) => `${best[k]} ${w}`).join(", ")} suits them better.`, fix: { kind: "plan", label: "Use it" } });
      else items.push({ key: "plan", ok: true, text: "Game plan: your call, and it fits this matchup." });
    }
  }
  // 5. The season plan (preseason only: it locks on opening night).
  if (league.phase === "preseason") {
    const plan = ensureDevPlan(league);
    const f = league.players[plan?.focus];
    if (plan && !plan.locked) items.push({ key: "focus", ok: false, text: `Your season plan isn't locked in${f ? `: ${f.name} is the focus player` : ""}. Your staff's picks stand if you start the season.`, fix: { kind: "focus", label: "Lock it in" } });
    else if (plan) items.push({ key: "focus", ok: true, text: `Season plan locked in${f ? `: ${f.name} is your focus player` : ""}.` });
  }
  return items;
}

// One-tap fixes. Each returns { ok, msg }. "replace" with a pid puts the best fit in his spot.
export function applyPrepFix(league, fix, mu = nextMatchup(league)) {
  const team = league.teams[league.userTid];
  if (!fix || !team) return { ok: false, msg: "Nothing to fix." };
  if (fix.kind === "replace") {
    const o = replacementOptions(league, team, fix.pid);
    const pick = o && [...o.roster].sort((a, b) => b.r - a.r)[0];
    if (!pick) return { ok: false, msg: "Nobody healthy on the roster can play there. Call someone up." };
    return chooseReplacement(league, team, fix.pid, pick.p.id);
  }
  if (fix.kind === "goalie") {
    const L = team.lines || syncLines(league, team);
    if (!L.G[1]) return { ok: false, msg: "You don't have a backup goalie dressed." };
    L.G = [L.G[1], L.G[0]];
    const p = league.players[L.G[0]];
    return { ok: true, msg: `${p?.name || "Your backup"} starts tonight. Swap back on Lines when you want.` };
  }
  if (fix.kind === "plan") {
    if (!mu?.opp) return { ok: false, msg: "No game to plan for." };
    const best = matchupPlan(league, team, mu.opp);
    team.autoPlan = false;
    team.gamePlan = { forecheck: best.forecheck, neutral: best.neutral, attack: best.attack };
    return { ok: true, msg: `Game plan: ${best.forecheck} forecheck, ${best.neutral} neutral zone, ${best.attack} attack.` };
  }
  if (fix.kind === "focus") return lockPlan(league);
  if (fix.kind === "fill") {
    syncLines(league, team);
    const need = () => { const n = { F: 0, D: 0, G: 0 }; eachSlot(gameLines(league, team), (id, s) => { if (id == null) n[s.grp]++; }); return n; };
    let n = need(), called = [];
    for (const grp of ["G", "D", "F"]) {
      while (n[grp] > 0) {
        const fits = (p) => (grp === "G" ? isGoalie(p.pos) : grp === "D" ? isDefense(p.pos) : !isGoalie(p.pos) && !isDefense(p.pos));
        const dressed = new Set(lineupIds(gameLines(league, team)).map(String));
        const p = (team.prospects || []).map((id) => league.players[id]).filter((x) => x && !isOut(x) && x.signed !== false && (!x.assignment || x.assignment === "ahl") && fits(x) && !dressed.has(String(x.id))).sort((a, b) => b.ovr - a.ovr)[0];
        if (!p || !callUp(league, team, p.id)) break;
        called.push(p.name);
        (team.linesNew ||= []).push(p.id);
        syncLines(league, team);
        n = need();
      }
    }
    n = need();
    const left = n.F + n.D + n.G;
    if (called.length && !left) return { ok: true, msg: `Called up ${called.join(", ")}. Your lineup is full.` };
    if (called.length) return { ok: true, msg: `Called up ${called.join(", ")}; ${left} spot${left === 1 ? " is" : "s are"} still empty. Make room on the Roster screen.` };
    return left ? { ok: false, msg: "Nobody could be called up: you need a roster spot and the cap room. See the Roster screen." } : { ok: true, msg: "Your lineup is full." };
  }
  return { ok: false, msg: "Nothing to fix." };
}
