// The contract year and holdouts (Gridiron GM 2.21, 1.28 and 1.54, translated to hockey).
//
// Contract-year drama: before the season your good players (78+) in the last year of their deals
// want to know where they stand. Extend them now, at today's price, or let them play it out. A
// player who plays it out is betting on himself: over the season he can gain (or lose) a point or
// two of OVR, and his asking price follows the year he has (contractValue.js perf). A star playing
// out his deal on a losing team gets restless and can ask for a trade. A player you never answer
// simply plays out his deal once 15 games are gone (no bet: the window has closed).
//
// Holdouts: your qualified RFA who is worth far more than his qualifying offer doesn't sign it when
// the season starts. He sits (unsigned, out of the lineup) until you meet his market ask, or you hold
// firm and he gives in. The December 1 signing deadline is the hockey twist: an RFA still unsigned
// then signs his qualifying offer to stay eligible for the season, and he isn't happy about it.
//
// AI clubs build around their franchise players: they extend them during the season.
import { stream } from "./rng.js";
import { capForYear, MAX_ROSTER } from "./constants.js";
import { capSpace, counts, signPlayer, logTx } from "./roster.js";
import { contractCount, qualifyingAmount } from "./hockeyRules.js";
import { isRFA } from "./players.js";
import { rescaleToOvr } from "./ratings.js";
import { resignAsk, letWalk } from "./offseason.js";
import { futurePayroll } from "./extensions.js";
import { isFranchisePlayer, veteranTerm } from "./contractValue.js";
import { isFranchiseGoalie } from "./trade.js";

export const CY_MIN_OVR = 78;
export const CY_DECIDE_GP = 15;
const r2 = (x) => Math.round(x * 100) / 100;
const money = (n) => `$${n.toFixed(2)}M`;

// ---------- Contract-year drama ----------
const inWindow = (lg, t) => lg.phase === "preseason" || (lg.phase === "regular" && (t?.rec?.gp || 0) < CY_DECIDE_GP);
export const inContractYear = (p) => !!p && p.signed !== false && p.yrs === 1 && !p.extension;
// Your contract-year players still waiting to hear from you, best first.
export function contractYearAsks(lg) {
  const t = lg.teams[lg.userTid];
  if (!t || !inWindow(lg, t)) return [];
  return t.roster.map((id) => lg.players[id]).filter((p) => inContractYear(p) && p.ovr >= CY_MIN_OVR && !p.holdout && !(p.cyr?.year === lg.year && p.cyr.choice)).sort((a, b) => b.ovr - a.ovr);
}
// He plays it out and bets on himself. (auto: the talk window closed without an answer; he plays out
// his deal without the bet.)
export function playItOut(lg, pid, { auto = false } = {}) {
  const p = lg.players[pid];
  if (!p || p.tid !== lg.userTid || !inContractYear(p)) return { ok: false, msg: "He's no longer in the last year of his deal." };
  p.cyr = auto ? { year: lg.year, choice: "out", auto: true } : { year: lg.year, choice: "bet", gain: 0, asked: false, from: p.ovr };
  return { ok: true, msg: `${p.name} will play out his deal and bet on himself. A big year raises his price; a quiet one lowers it.` };
}
// Where his contract year stands, for the card.
export function contractYearNote(lg, p) {
  const c = p?.cyr;
  if (!c || c.year !== lg.year || c.choice !== "bet" || !inContractYear(p)) return null;
  const g = c.gain || 0;
  return `Betting on himself this season${g ? `: ${g > 0 ? "+" : ""}${g} OVR so far` : ""}. His price follows the year he has.`;
}
// Move his rating by exactly a point: every skill shifts with it (no random noise, so the bet never
// disturbs the league's random stream).
function nudge(p, delta) {
  const before = p.ovr;
  if (before + delta > 99 || before + delta < 40) return 0;
  rescaleToOvr(p, before + delta);
  p.peak = Math.max(p.peak || 0, p.ovr);
  return p.ovr - before;
}
function contractYearWeek(lg, t) {
  const pts = t.rec.gp ? t.rec.pts / (2 * t.rec.gp) : 0.5;
  for (const p of t.roster.map((id) => lg.players[id])) {
    const c = p?.cyr;
    if (!c || c.year !== lg.year || c.choice !== "bet" || !inContractYear(p) || p.injury > 0) continue;
    const r = stream(`${p.id}|cyr|${lg.year}|${lg.day}`);
    // Playing for his next deal: a point or two either way over the season.
    if (r.next() < 0.09) {
      const delta = r.next() < 0.65 ? 1 : -1;
      if (Math.abs((c.gain || 0) + delta) <= 2) {
        const moved = nudge(p, delta);
        if (moved) {
          c.gain = (c.gain || 0) + moved;
          lg.inbox.push({ year: lg.year, day: lg.day, pid: p.id, text: moved > 0 ? `💪 Contract year: ${p.name} (${p.pos}) is playing for his next deal: +1 OVR → ${p.ovr}.` : `📉 Contract year: the pressure is showing on ${p.name} (${p.pos}): −1 OVR → ${p.ovr}.` });
        }
      }
    }
    // A star playing out his deal on a losing team gets restless.
    if (!c.asked && p.ovr >= 85 && t.rec.gp >= 20 && pts <= 0.42 && r.next() < 0.12) {
      c.asked = true;
      p.wantsTrade = true;
      p.relationship = { trust: Math.min(p.relationship?.trust ?? 50, 35), reason: "Playing out his deal on a losing team" };
      lg.inbox.push({ year: lg.year, day: lg.day, pid: p.id, text: `😤 Contract year: ${p.name} (${p.pos} ${p.ovr}), playing out his deal on a ${t.rec.w}-${t.rec.l}-${t.rec.otl} team, has asked for a trade.` });
    }
  }
}

// ---------- AI clubs extend their franchise players ----------
export function aiExtensions(lg) {
  if (!["preseason", "regular"].includes(lg.phase)) return [];
  const done = [];
  for (const t of lg.teams) {
    if (t.id === lg.userTid) continue;
    for (const id of t.roster) {
      const p = lg.players[id];
      if (!inContractYear(p) || !(isFranchisePlayer(p) || isFranchiseGoalie(lg, t, p))) continue;
      if (stream(`${p.id}|aiext|${lg.year}|${lg.day}`).next() > 0.35) continue;
      const yrs = Math.min(7, veteranTerm(p, Math.max(resignAsk(lg, p).yrs, p.age <= 27 ? 6 : 3)));
      const aav = resignAsk(lg, p, yrs).aav;
      if (futurePayroll(lg, t) + aav > capForYear(lg.year + 1)) continue;
      p.extension = { aav, yrs, start: lg.year + 1 };
      logTx(lg, `${t.abbr} extend ${p.name}: ${yrs} years at $${aav.toFixed(2)}M, starting ${lg.year + 1}-${String(lg.year + 2).slice(2)}`, [t.id]);
      (lg.news ||= []).unshift({ year: lg.year, day: lg.day, type: "contract", pid: p.id, text: `The ${t.name} lock up ${p.name}: a ${yrs}-year extension at $${aav.toFixed(2)}M a season.` });
      done.push(p.id);
    }
  }
  return done;
}

// ---------- Holdouts ----------
// December 1 of the season, as a schedule day.
export function signingDeadlineDay(lg) {
  const start = Date.parse(`${lg.scheduleStart || `${lg.year}-10-07`}T12:00:00Z`);
  const dec1 = Date.parse(`${lg.year}-12-01T12:00:00Z`);
  return Number.isFinite(start) ? Math.round((dec1 - start) / 86400000) : 55;
}
// Your qualified RFAs who refuse the qualifying offer.
export function holdouts(lg) {
  const t = lg.teams[lg.userTid];
  return (t?.rfaRights || []).map((id) => lg.players[id]).filter((p) => p && p.holdout && p.tid === t.id);
}
// His market ask: a deal that starts this season.
export const holdoutAsk = (lg, p, yrs) => resignAsk(lg, p, yrs, { start: lg.year });
// Would he refuse the qualifying offer? A good young player (76+) whose market ask is a quarter
// above it, more often than not.
export function wouldHoldOut(lg, p, qo) {
  if (!p || p.ovr < 76) return false;
  const ask = holdoutAsk(lg, p).aav;
  return ask >= qo * 1.25 && ask - qo >= 1 && stream(`${p.id}|holdout|${lg.year}`).next() < 0.65;
}
export function startHoldout(lg, p, qo) {
  const ask = holdoutAsk(lg, p);
  p.holdout = { kind: "rfa", year: lg.year, day: lg.day, qo, ask: ask.aav, yrs: ask.yrs, firm: false };
  lg.inbox.push({ year: lg.year, day: lg.day, pid: p.id, text: `✋ ${p.name} won't sign his ${money(qo)} qualifying offer. He's holding out for a market deal (about ${money(ask.aav)} × ${ask.yrs}) and sits until he signs. If he's still unsigned on December 1, he takes the qualifying offer to stay eligible.` });
}
function endHoldout(lg, p, text) {
  delete p.holdout;
  if (text) lg.inbox.push({ year: lg.year, day: lg.day, pid: p.id, text });
}
// He signed (any deal, from the contract table): the holdout is over.
export function holdoutSigned(lg, p) {
  if (!p?.holdout) return;
  endHoldout(lg, p, `✅ ${p.name} ends his holdout and reports.`);
}
// Hold firm: you won't go to his number. Each week he may give in and sign the qualifying offer.
export function holdFirm(lg, pid) {
  const p = lg.players[pid];
  if (!p?.holdout) return { ok: false, msg: "He isn't holding out." };
  p.holdout.firm = true;
  return { ok: true, msg: `You're holding firm with ${p.name}. He sits until he gives in, or until the December 1 deadline.` };
}
// He signs his qualifying offer (gives in, or the December 1 deadline). Needs cap and roster room.
function takeQualifying(lg, t, p, why) {
  const qo = p.holdout?.qo || p.qualified?.aav || qualifyingAmount(p, lg.year);
  if (capSpace(lg, t) < qo || contractCount(lg, t) >= 50 || counts(lg, t).active >= MAX_ROSTER) return false;
  if (!signPlayer(lg, t, p, r2(qo), 1)) return false;
  p.relationship = { trust: Math.max(0, (p.relationship?.trust ?? 50) - (why === "deadline" ? 20 : 15)), reason: "Signed his qualifying offer after a holdout" };
  endHoldout(lg, p, why === "deadline" ? `⏰ December 1: ${p.name} signed his ${money(qo)} qualifying offer to stay eligible this season. He isn't happy about how it went.` : `✋ ${p.name} gives in: he signs his ${money(qo)} qualifying offer for one year and reports.`);
  return true;
}
function holdoutWeek(lg, t) {
  const deadline = signingDeadlineDay(lg);
  for (const p of holdouts(lg)) {
    p.holdout.weeks = (p.holdout.weeks || 0) + 1;
    if (lg.day >= deadline) { if (takeQualifying(lg, t, p, "deadline")) continue; }
    else if (p.holdout.firm && stream(`${p.id}|givein|${lg.year}|${lg.day}`).next() < 0.25) takeQualifying(lg, t, p, "gives in");
  }
}

// At the start of a new season: qualified RFAs sign their qualifying offer when the club has cap
// and contract room (otherwise the rights lapse and he hits the open market), except your RFA who
// holds out.
export function settleRFARights(league) {
  for (const t of league.teams) for (const id of [...(t.rfaRights || [])]) {
    const p = league.players[id];
    if (!p) continue;
    if (!isRFA(p)) { letWalk(league, id); continue; }
    const aav = p.qualified?.aav || qualifyingAmount(p, league.year);
    if (t.id === league.userTid && !p.holdout && wouldHoldOut(league, p, aav)) { startHoldout(league, p, aav); continue; }
    if (p.holdout) continue;
    const ok = capSpace(league, t) >= aav && contractCount(league, t) < 50 && signPlayer(league, t, p, aav, 1);
    if (ok) { t.rfaRights = t.rfaRights.filter((x) => x !== id); delete p.qualified; if (t.id === league.userTid) league.inbox.push({ year: league.year, day: 0, text: `${p.name} signed his one-year qualifying offer ($${aav.toFixed(2)}M).` }); }
    else letWalk(league, id);
  }
}

// Once a day in the season (playerCommitments.commitmentWeek): undecided contract-year players play
// it out after 15 games; once a week the bets move, holdouts are reviewed, and AI clubs extend
// their franchise players.
export function contractYearDay(lg) {
  if (lg.phase !== "regular") return;
  const t = lg.teams[lg.userTid];
  if (!t) return;
  if (t.rec.gp >= CY_DECIDE_GP) {
    for (const p of t.roster.map((id) => lg.players[id])) {
      if (!inContractYear(p) || p.ovr < CY_MIN_OVR || p.holdout || (p.cyr?.year === lg.year && p.cyr.choice)) continue;
      // Quietly (Evan, r12): no inbox nag. The Home reminder board carries the key deals.
      playItOut(lg, p.id, { auto: true });
    }
  }
  const w = lg.contractWeek;
  if (w?.year === lg.year && lg.day - w.day < 7) return;
  lg.contractWeek = { year: lg.year, day: lg.day };
  contractYearWeek(lg, t);
  holdoutWeek(lg, t);
  aiExtensions(lg);
}
