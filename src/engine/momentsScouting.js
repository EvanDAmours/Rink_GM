// Scouting moments (Gridiron 2.91 / 3.6 / 2.20): plain data the moment system queues and
// ui/moments/scouting.jsx draws.
//   scoutCheckpoint  every fourth week of the regular season: Central Scouting's list moved, your
//                    scouts want eyes on prospects near your pick. stop: true pauses a running sim;
//                    the card offers Keep simming / scout then continue / Stop.
//   scoutReveal      a draftee's real ceiling is out after his second season: a steal or a miss.
// No imports from the game engine: scouting.js builds the data and calls these.

// n: { pid, name, pos, from, to, gap }
export function revealMoment(league, p, n) {
  const steal = n.gap > 0;
  return {
    kind: "scoutReveal",
    key: `scoutrev:${p.id}`,
    tid: league.userTid,
    pid: p.id,
    p: { name: p.name, pos: p.pos, ovr: p.ovr, age: p.age, num: p.number || null },
    steal,
    from: n.from,
    to: n.to,
    draft: p.draft ? { year: p.draft.year, round: p.draft.round, pick: p.draft.pick } : null,
    kicker: steal ? "SCOUTING STEAL" : "SCOUTING MISS",
    title: steal ? `${p.name} is better than anyone thought` : `We missed on ${p.name}`,
  };
}
