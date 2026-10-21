// Draft night moments (Gridiron 3.4): the stage. When you make a pick he walks up under the
// lights in your sweater, his name across the back and his number on it; first-rounders come
// from the green room. Shown by ui/moments/draftnight.jsx ("draft-stage").
//
// A moment is plain data so it survives a save: the player's draft-day card is snapshotted here.
import { queueMoment } from "./moments.js";
import { ensureUniforms } from "./uniforms.js";
import { skillsFor, pickTake } from "./scouting.js";

// His three best skill groups and the weakest, from his real attributes (he's yours now).
export function topSkills(p) {
  if (!p?.attrs) return { top: [], weak: null };
  const avg = (keys) => keys.reduce((s, k) => s + (p.attrs[k] || 0), 0) / keys.length;
  const groups = Object.values(skillsFor(p.pos)).map((g) => [g.name, Math.round(avg(g.keys))]).sort((a, b) => b[1] - a[1]);
  return { top: groups.slice(0, 3), weak: groups.at(-1) || null };
}

export function stageMoment(league, slot) {
  const p = slot && league.players[slot.pid];
  const team = p && league.teams[slot.owner];
  if (!p || !team) return null;
  // Every player in the organization wears a number; a new draftee gets his now.
  try { ensureUniforms(league, team); } catch (e) { console.error("Sweater numbers failed", e); }
  const year = league.draft?.year ?? league.year + 1;
  const { top, weak } = topSkills(p);
  return {
    kind: "draft-stage",
    key: `draft-stage-${year}-${slot.overall}`,
    tid: slot.owner,
    pid: p.id,
    year,
    round: slot.round,
    overall: slot.overall,
    grade: slot.grade || null,
    csr: slot.csr || null,
    take: slot.grade ? pickTake(slot.grade, slot.overall, slot.csr) : null,
    green: slot.round === 1,
    scouted: p.scout?.lvl || 0,
    p: { name: p.name, pos: p.pos, age: p.age, num: p.number ?? null, ovr: p.ovr, pot: p.pot, dev: p.dev || "normal", lg: p.bio?.lg || "", club: p.bio?.team || "", ht: p.bio?.ht || null, wt: p.bio?.wt || null, nat: p.nat || "" },
    top,
    weak,
  };
}

export function queueStageMoment(league, slot) {
  try {
    const m = stageMoment(league, slot);
    return m ? queueMoment(league, m) : false;
  } catch (e) {
    // A moment must never break the draft.
    console.error("Draft stage moment failed", e);
    return false;
  }
}
