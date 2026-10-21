// Development beats: your players' breakout summers, cornerstone seasons, big seasons paying off, and a
// young Generational talent arriving. Built at rollover (offseason.js startNewSeason) for your club;
// drawn by ui/moments/development.jsx. Each builder returns a plain moment (see moments.js) or null.
import { snap } from "./momentsSeason.js";
import { DEV_TRAITS } from "./players.js";

const traitName = (d) => DEV_TRAITS[d]?.name || d;

// A breakout summer: +1 to +3 out of nowhere.
export function breakoutMoment(league, p, { from, to, gain }) {
  if (!p || p.tid !== league.userTid || !gain) return null;
  return {
    kind: "dev-breakout", key: `dev-breakout-${league.year}-${p.id}`, tid: p.tid, p: snap(p), from, to, gain,
    kicker: "BREAKOUT SUMMER", title: `${String(p.name).split(" ").slice(-1)[0].toUpperCase()} TAKES A LEAP`,
    sub: gain >= 3 ? "Nobody saw this coming. He's come back to camp a different player." : gain === 2 ? "A big summer of work. He's taken a clear step forward." : "His work ethic paid off: a step ahead of where anyone expected.",
    lines: [["RATING", `${from} → ${to} OVR`], ["AGE", `${p.age}`], ["DEVELOPMENT", traitName(p.dev)]],
  };
}

// A cornerstone season: led the league by a landslide.
export function cornerstoneMoment(league, p, { from, to, notes, devFrom }) {
  if (!p || p.tid !== league.userTid) return null;
  const lines = [["RATING", `${from} → ${to} OVR`], ["CEILING", `${p.pot}`]];
  if (devFrom) lines.push(["DEVELOPMENT", `${traitName(devFrom)} → ${traitName(p.dev)}`, "#fde68a"]);
  return {
    kind: "dev-cornerstone", key: `dev-cornerstone-${league.year}-${p.id}`, tid: p.tid, p: snap(p), from, to, party: true,
    kicker: "A CORNERSTONE SEASON", title: String(p.name).toUpperCase(),
    sub: notes.find((n) => n.includes("landslide")) ? `He ${notes.find((n) => n.includes("landslide"))}. Seasons like that build franchises.` : "A season that builds a franchise.",
    lines, notes,
  };
}

// Big seasons paying off: every milestone or league lead on your club in one card.
export function rewardsMoment(league, rows) {
  const mine = (rows || []).filter((r) => r.tid === league.userTid);
  if (!mine.length) return null;
  return {
    kind: "dev-rewards", key: `dev-rewards-${league.year}`, tid: league.userTid,
    kicker: "BIG SEASONS PAY OFF", title: `THE ${league.year - 1}-${String(league.year).slice(2)} SEASON`,
    sub: "Milestones and league-leading seasons carry into the summer.",
    rows: mine.slice(0, 6).map((r) => ({ p: r.p, from: r.from, to: r.to, notes: r.notes, devFrom: r.devFrom, dev: r.dev })),
  };
}

// A young Generational talent joins (or is) your club.
export function generationalMoment(league, p) {
  if (!p || p.tid !== league.userTid || p.dev !== "generational" || p.age > 21) return null;
  return {
    kind: "dev-generational", key: `dev-gen-${p.id}`, tid: p.tid, p: snap(p), pot: p.pot, party: true,
    kicker: "A GENERATIONAL TALENT", title: String(p.name).toUpperCase(),
    sub: "Once a decade a player like this comes along. He'll grow faster than anyone, keep raising his ceiling, and stay at the top longer.",
    lines: [["AGE", `${p.age}`], ["RATING", `${p.ovr} OVR`], ["CEILING", `${p.pot}`, "#f9a8d4"]],
  };
}
