// NHL game-state rules, separate from the probabilistic hockey model.
// Reference: 2026-27 Official Rules 16, 18, 19, 26, 78, 81, 84 and 87.
export const opposite = k => k === 'h' ? 'a' : 'h';
export const isOpenIce = s => s.threeOnThree || s.phase === 'ot' && !s.playoff;
export const activePenalties = (s, k) => s.pen[k].filter(p => !p.offset && p.left > 0).slice(0, 2);

export function resetOvertimeStrength(s) {
  if (!isOpenIce(s)) { s.otCounts = null; return; }
  const h = activePenalties(s, 'h').length, a = activePenalties(s, 'a').length;
  s.otCounts = {h: 3 + Math.max(0, a - h), a: 3 + Math.max(0, h - a)};
}

export function skaterCount(s, k) {
  if (isOpenIce(s)) {
    if (s.otCounts) return s.otCounts[k];
    return 3 + Math.max(0, activePenalties(s, opposite(k)).length - activePenalties(s, k).length);
  }
  return 5 - activePenalties(s, k).length;
}

export function strengthType(s, k) {
  const diff = skaterCount(s, k) - skaterCount(s, opposite(k));
  return diff > 0 ? 'PP' : diff < 0 ? 'SH' : 'EV';
}

// A double minor is two consecutive 120-second penalties. Goals terminate
// the current segment, not an arbitrary 120 seconds of its remaining duration.
export function releaseOnGoal(s, k) {
  const o = opposite(k);
  if (strengthType(s, k) !== 'PP') return;
  const minors = activePenalties(s, o).filter(p => !p.major)
    .sort((a, b) => segmentLeft(a) - segmentLeft(b));
  const p = minors[0];
  if (!p) return;
  if (p.left > 120) { p.left = 120; p.counted = false; }
  else s.pen[o] = s.pen[o].filter(x => x !== p);
}

const segmentLeft = p => !p.major && p.left > 120 ? p.left - 120 : p.left;

export function nextPenaltyBoundary(s) {
  const times = ['h', 'a'].flatMap(k => [...activePenalties(s, k), ...s.pen[k].filter(p => p.offset && p.left > 0)].map(segmentLeft));
  return times.length ? Math.min(...times) : Infinity;
}

export function tickPenalties(s, seconds) {
  const before = {h: skaterCount(s, 'h'), a: skaterCount(s, 'a')};
  for (const k of ['h', 'a']) {
    const active = activePenalties(s, k);
    let released = 0;
    for (const p of s.pen[k]) {
      if (!p.offset && !active.includes(p)) continue; // third penalty is queued
      const old = p.left;
      p.left = Math.max(0, p.left - seconds);
      if (!p.major && old > 120 && p.left <= 120) p.counted = false;
      if (p.left === 0 && !p.offset) {
        released++;
        // Rule 26: when a queued penalty starts, a substitute stays on the ice;
        // the expired offender waits for a whistle rather than skating out.
        if (s.pen[k].filter(x => !x.offset && x.left > 0).length >= 2) p.hold = true;
      }
    }
    s.pen[k] = s.pen[k].filter(p => p.left > 0 || p.offset || p.hold);
    if (isOpenIce(s) && released) {
      s.otCounts ||= {...before};
      s.otCounts[k] = Math.min(5, before[k] + Math.max(0, active.length - activePenalties(s, k).length));
    }
  }
}

export function notePowerPlays(s) {
  for (const k of ['h', 'a']) {
    if (strengthType(s, k) !== 'PP') continue;
    for (const p of activePenalties(s, opposite(k))) {
      if (!p.counted) { s.special[k].opportunities++; p.counted = true; }
    }
  }
}

export function setStoppage(s, reason, {zone = 0, side = null, icing = null} = {}) {
  const pending = s.delayedPenalty;
  if (pending) {
    settleDelayedPenalty(s);
    if (reason !== 'goal' && reason !== 'period') { reason = 'penalty'; zone = 1; side = opposite(pending.k); icing = null; }
  }
  s.faceoffNext = true;
  s.centerDraw = zone === 0;
  s.stoppage = {reason, zone, side, icing};
  s.carrier = null;
  s.touches = [];
  s.poss = null;
  for (const k of ['h', 'a']) s.pen[k] = s.pen[k].filter(p => p.left > 0);
  resetOvertimeStrength(s);
}

export function delayPenalty(s, k, pid, options = {}) {
  if (s.delayedPenalty || s.pen[k].some(p => p.pid === pid)) return false;
  const nonOffending = s[opposite(k)];
  s.delayedPenalty = {k, pid, options, wasPulled: nonOffending.pulled, previousReason: nonOffending.pulledReason};
  nonOffending.pulled = true;
  nonOffending.pulledReason = 'delayed-penalty';
  return true;
}

export function settleDelayedPenalty(s, {goal = false, minorReleased = false} = {}) {
  const pending = s.delayedPenalty;
  if (!pending) return;
  s.delayedPenalty = null;
  const side = s[opposite(pending.k)];
  side.pulled = pending.wasPulled; side.pulledReason = pending.previousReason;
  let minutes = pending.options.minutes || 2;
  if (goal && !minorReleased && minutes !== 5) minutes -= 2;
  if (minutes > 0) assessPenalty(s, pending.k, pending.pid, {...pending.options, minutes});
}

export function assessPenalty(s, k, pid, {type = 'Tripping', minutes = 2, offset = false} = {}) {
  if (!s.box[pid] || s.pen[k].some(p => p.pid === pid)) return false;
  s.pen[k].push({pid, left: minutes * 60, major: minutes === 5, offset, type, counted: false});
  s.box[pid].pim += minutes;
  setStoppage(s, 'penalty', {zone: 1, side: opposite(k)});
  notePowerPlays(s);
  return true;
}

export function takeTimeout(s, k) {
  const side = s[k];
  if (!s.faceoffNext || side.timeout || s.phase === 'so' || s.phase === 'final' || s.stoppage?.icing === k || s.timeoutAt === s.elapsed) return false;
  side.timeout = true;
  s.timeoutAt = s.elapsed;
  for (const id of side.dressed) side.fatigue[id] = Math.max(0, (side.fatigue[id] || 0) - 30);
  return true;
}
