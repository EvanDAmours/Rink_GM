import {syncLines, gameLines, lineupIds} from './lines.js';
import {callUp} from './roster.js';
import {isGoalie, isDefense} from './constants.js';

export function setInjuriesEnabled(league, enabled) {
  league.settings ||= {};
  league.settings.injuries = Boolean(enabled);
  let healed = 0;
  if (!enabled) {
    for (const p of Object.values(league.players)) {
      if (p.injury > 0 || p.ltir) healed++;
      p.injury = 0;
      delete p.injuryNote;
      delete p.ltir;
    }
    for (const t of league.teams) {
      delete t.ltirUnused;
      delete t.injSlots;
      if (t.lines) syncLines(league, t);
    }
  }
  return healed;
}

// ---------------------------------------------------------------------------------------------
// Replacements by role (Gridiron 3.33, its injuryCall.js). A regular who gets hurt keeps his spot
// in your saved lines and the game dresses your best healthy scratch there (lines.js gameLines).
// These helpers name that spot (2C, top-pair LD, the starting goalie), rate every healthy option
// for it, with a penalty for playing off position, and put your pick into the lines.

export const isOut = (p) => !!p && (p.injury > 0 || !!p.ltir);
const healthy = (p) => !!p && !isOut(p);

// A spot in the lines: { grp: "F" | "D" | "G", i: line or pair (0-based), j: column }.
const F_COL = ["LW", "C", "RW"], D_COL = ["LD", "RD"];
const F_WORD = ["left wing", "centre", "right wing"], D_WORD = ["left D", "right D"];
const LINE = ["first", "second", "third", "fourth"], PAIR = ["top", "second", "third"];
export const slotKey = (s) => `${s.grp}:${s.i}:${s.j}`;
export function parseSlot(key) {
  const [grp, i, j] = String(key || "").split(":");
  return ["F", "D", "G"].includes(grp) ? { grp, i: +i || 0, j: +j || 0 } : null;
}
// The position a spot is built for.
export const slotPos = (s) => (s.grp === "G" ? "G" : s.grp === "D" ? D_COL[s.j] : F_COL[s.j]);
// short: "2C", "1LD", "G1"; long: "second-line centre", "top-pair left D", "starting goalie".
export function slotName(s) {
  if (!s) return { short: "", long: "" };
  if (s.grp === "G") return { short: `G${s.j + 1}`, long: s.j === 0 ? "starting goalie" : "backup goalie" };
  if (s.grp === "D") return { short: `${s.i + 1}${D_COL[s.j]}`, long: `${PAIR[s.i] || `${s.i + 1}th`}-pair ${D_WORD[s.j]}` };
  return { short: `${s.i + 1}${F_COL[s.j]}`, long: `${LINE[s.i] || `${s.i + 1}th`}-line ${F_WORD[s.j]}` };
}

export function eachSlot(L, fn) {
  if (!L) return;
  (L.F || []).forEach((line, i) => line.forEach((id, j) => fn(id, { grp: "F", i, j })));
  (L.D || []).forEach((pair, i) => pair.forEach((id, j) => fn(id, { grp: "D", i, j })));
  (L.G || []).forEach((id, j) => fn(id, { grp: "G", i: 0, j }));
}
export const slotAt = (L, s) => (!L || !s ? null : s.grp === "G" ? L.G?.[s.j] ?? null : L[s.grp]?.[s.i]?.[s.j] ?? null);
function putAt(L, s, id) {
  if (s.grp === "G") L.G[s.j] = id;
  else L[s.grp][s.i][s.j] = id;
}
export function slotOf(L, pid) {
  let hit = null;
  eachSlot(L, (id, s) => { if (!hit && id != null && String(id) === String(pid)) hit = s; });
  return hit;
}

// How far off his position a player is in a spot. Wingers swap sides easily, a centre plays the
// wing easily, a winger at centre gives up draws (less so with good faceoff skill), a defenceman
// on the wrong side loses a step, and a skater out of his group (D at forward, F on defence) is
// an emergency. Goalies only play goal.
export const OFF_POSITION = { offWing: 1, centreOnWing: 1, wingAtCentre: 4, wingAtCentreGoodDraws: 2, offSide: 2, dAtForward: 8, forwardOnD: 9 };
export function slotFit(p, s) {
  if (!p || !s) return null;
  if (s.grp === "G" || isGoalie(p.pos)) return s.grp === "G" && isGoalie(p.pos) ? { r: p.ovr, pen: 0, note: "" } : null;
  const want = slotPos(s);
  let pen = 0, note = "";
  if (s.grp === "F") {
    if (isDefense(p.pos)) { pen = OFF_POSITION.dAtForward; note = "defenceman at forward"; }
    else if (want === "C" && p.pos !== "C") { pen = (p.attrs?.fof ?? 0) >= 75 ? OFF_POSITION.wingAtCentreGoodDraws : OFF_POSITION.wingAtCentre; note = "winger at centre"; }
    else if (want !== "C" && p.pos === "C") { pen = OFF_POSITION.centreOnWing; note = "centre on the wing"; }
    else if (want !== p.pos) { pen = OFF_POSITION.offWing; note = "off wing"; }
  } else if (!isDefense(p.pos)) { pen = OFF_POSITION.forwardOnD; note = "forward on defence"; }
  else if (p.pos !== want) { pen = OFF_POSITION.offSide; note = "off side"; }
  return { r: p.ovr - pen, pen, note };
}

// The spot an injured player held. While he's still in your saved lines, it's that spot. If the
// head coach (or you) already moved someone into it, it's the spot remembered for him before he
// was hurt (rememberSlots, run by the screens that show injuries).
export function injurySlot(league, team, pid) {
  const here = slotOf(team.lines, pid);
  if (here) return here;
  return parseSlot(team.injSlots?.[pid]);
}

// Bookkeeping: the spot of everyone in the saved lines, and, for players who are hurt now, the spot
// they held when they went down. Kept on the team (old saves simply start without it).
export function rememberSlots(league, team) {
  if (!team?.lines) return false;
  const next = {};
  for (const [pid, key] of Object.entries(team.injSlots || {})) {
    const p = league.players[pid];
    if (p && p.tid === team.id && isOut(p) && parseSlot(key)) next[pid] = key;
  }
  eachSlot(team.lines, (id, s) => { if (id != null && league.players[id] && !next[id]) next[id] = slotKey(s); });
  const before = JSON.stringify(team.injSlots || {}), after = JSON.stringify(next);
  team.injSlots = next;
  return before !== after;
}

// Regulars who are hurt: [{ p, slot, fill }] where fill is who dresses in his spot tonight
// (null when nobody healthy is left), and chosen is true once someone else holds his saved spot.
export function injuredRegulars(league, team) {
  const tonight = gameLines(league, team);
  const out = [];
  for (const id of team.roster) {
    const p = league.players[id];
    if (!isOut(p)) continue;
    const slot = injurySlot(league, team, id);
    if (!slot) continue;
    const held = slotAt(team.lines, slot);
    const fillId = slotAt(tonight, slot);
    out.push({ p, slot, fill: fillId != null && String(fillId) !== String(id) ? league.players[fillId] || null : null, chosen: held != null && String(held) !== String(id) });
  }
  return out.sort((a, b) => b.p.ovr - a.p.ovr);
}

// Everyone who could take an injured regular's spot, rated there: healthy players on the NHL
// roster who aren't dressed tonight (the one filling in now comes first), and healthy signed
// players in the AHL, who need a call-up. bestId marks the best fit when it isn't the one in now.
export function replacementOptions(league, team, pid) {
  const slot = injurySlot(league, team, pid);
  if (!slot) return null;
  const tonight = gameLines(league, team);
  const dressed = new Set(lineupIds(tonight).map(String));
  const nowId = slotAt(tonight, slot);
  const now = nowId != null && String(nowId) !== String(pid) ? String(nowId) : null;
  const rate = (p) => { const f = slotFit(p, slot); return f ? { p, ...f } : null; };
  const roster = team.roster.map((id) => league.players[id])
    .filter((p) => healthy(p) && (!dressed.has(String(p.id)) || String(p.id) === now))
    .map(rate).filter(Boolean)
    .sort((a, b) => (String(b.p.id) === now) - (String(a.p.id) === now) || b.r - a.r || b.p.ovr - a.p.ovr);
  const farm = (team.prospects || []).map((id) => league.players[id])
    .filter((p) => healthy(p) && p.signed !== false && (!p.assignment || p.assignment === "ahl") && !p.waiverPending)
    .map(rate).filter(Boolean)
    .sort((a, b) => b.r - a.r).slice(0, 5);
  const best = roster.reduce((b, x) => (!b || x.r > b.r ? x : b), null);
  return { slot, name: slotName(slot), nowId: now, roster, farm, bestId: best && String(best.p.id) !== now ? best.p.id : null };
}

// Put `inId` into the spot `outId` held. A farm player is called up first. The hurt player keeps
// the memory of his spot, so the report still shows who's covering for him; when he's healthy
// again the lines work him back in (syncLines, linesNew).
export function chooseReplacement(league, team, outId, inId) {
  const out = league.players[outId], p = league.players[inId];
  if (!team.lines) syncLines(league, team);
  const slot = injurySlot(league, team, outId);
  if (!out || !slot) return { ok: false, msg: "He doesn't hold a spot in your lines." };
  if (!p || p.tid !== team.id || !healthy(p)) return { ok: false, msg: "Pick a healthy player from your club." };
  if (!slotFit(p, slot)) return { ok: false, msg: `${p.name} can't play there.` };
  let called = false;
  if (!team.roster.includes(p.id)) {
    if (!(team.prospects || []).includes(p.id) || !callUp(league, team, p.id)) return { ok: false, msg: `${p.name} can't be called up right now: you need a roster spot and the cap room.` };
    called = true;
  }
  const L = team.lines;
  const from = slotOf(L, p.id);
  if (from) putAt(L, from, null);
  putAt(L, slot, p.id);
  (team.injSlots ||= {})[out.id] = slotKey(slot);
  team.linesNew = (team.linesNew || []).filter((id) => String(id) !== String(p.id));
  syncLines(league, team);
  const where = slotName(slot).long;
  return { ok: true, msg: `${called ? `${p.name} is called up and takes` : `${p.name} takes`} ${out.name}'s spot (${where}) while he's out.` };
}
