// Special games (Gridiron 3.71's holiday games, translated): the Winter Classic, the Stadium Series,
// the Heritage Classic, Hockey Day in Canada, the Thanksgiving Showdown, New Year's Eve and Halloween.
// Nothing is stored on the schedule: a game is special because of its date (from scheduleStart and
// its day), so old saves and imported schedules get them for free. Only your club's games get the
// cards: a title card the evening before (shown only if you stop there) and a result card after.
// Both are ordinary moments, so they queue during a sim and never stop it.
const CANADIAN = new Set(["MTL", "TOR", "OTT", "WPG", "CGY", "EDM", "VAN"]);

export const SPECIAL_EVENTS = {
  halloween: { name: "Halloween", eyebrow: "Holiday game", line: "Costumes in the stands, candy in the concourse.", art: "🎃", pog: "The treat goes to", head: ["Treats", "for the home crowd"], lose: ["A real", "fright"] },
  heritage: { name: "Heritage Classic", eyebrow: "Outdoors in Canada", line: "Wool toques, a stadium rink and the game the way it started.", art: "🍁", pog: "Player of the game", head: ["Heritage", "night"], lose: ["Cold", "night out"], outdoor: true },
  thanksgiving: { name: "Thanksgiving Showdown", eyebrow: "The day after the turkey", line: "Hockey and family: the whole country is watching.", art: "🦃", pog: "The drumstick goes to", head: ["A Showdown", "to remember"], lose: ["Hard to", "digest"] },
  nye: { name: "New Year's Eve", eyebrow: "Holiday game", line: "One more game before the ball drops.", art: "🎆", pog: "Player of the game", head: ["Out with", "a bang"], lose: ["A rough way", "to end the year"] },
  winterclassic: { name: "Winter Classic", eyebrow: "Outdoors on New Year's Day", line: "A rink under the sky, the whole league tuned in.", art: "❄️", pog: "Player of the game", head: ["Classic", "win"], lose: ["Frozen", "out"], outdoor: true },
  hockeyday: { name: "Hockey Day in Canada", eyebrow: "Coast to coast", line: "Every Canadian club on the ice, one long Saturday of hockey.", art: "🏒", pog: "Player of the game", head: ["A day", "to remember"], lose: ["Not this", "Saturday"] },
  stadium: { name: "Stadium Series", eyebrow: "Outdoors under the lights", line: "A football stadium, a sheet of ice and a sold-out crowd.", art: "🏟️", pog: "Player of the game", head: ["Under", "the lights"], lose: ["Lights", "out"], outdoor: true },
};

const dateOf = (league, day) => new Date(Date.parse((league.scheduleStart || `${league.year}-10-07`) + "T12:00:00Z") + day * 86400000);
// The n-th weekday (0 Sun … 6 Sat) of a month, as day of month.
const nth = (y, m, wd, n) => { const first = new Date(Date.UTC(y, m, 1)).getUTCDay(); return 1 + ((wd - first + 7) % 7) + (n - 1) * 7; };
const lastSunday = (y, m) => { const d = new Date(Date.UTC(y, m + 1, 0)); return d.getUTCDate() - d.getUTCDay(); };

// Which special game `g` is, or null. Outdoor games are one game on their date (the first listed).
export function specialFor(league, g) {
  if (!g || !league?.teams) return null;
  const d = dateOf(league, g.day);
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), dd = d.getUTCDate();
  const ab = (tid) => league.teams[tid]?.abbr;
  const sameDay = () => (league.schedule || []).filter((x) => x.day === g.day).sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  const firstOf = (pred) => sameDay().find(pred)?.id;
  const same = (a, b) => String(a) === String(b);
  if (m === 9 && dd === 31) return "halloween";
  if (m === 9 && dd === lastSunday(y, 9)) {
    const can = (x) => CANADIAN.has(ab(x.h)) && CANADIAN.has(ab(x.a));
    const id = firstOf(can) ?? firstOf((x) => CANADIAN.has(ab(x.h)));
    if (id != null && same(id, g.id)) return "heritage";
  }
  if (m === 10 && dd === nth(y, 10, 4, 4) + 1) return "thanksgiving";
  if (m === 11 && dd === 31) return "nye";
  if (m === 0 && dd === 1 && same(firstOf(() => true), g.id)) return "winterclassic";
  if (m === 1 && dd === nth(y, 1, 6, 2) && (CANADIAN.has(ab(g.h)) || CANADIAN.has(ab(g.a)))) return "hockeyday";
  if (m === 2 && dd === nth(y, 2, 6, 1) && same(firstOf(() => true), g.id)) return "stadium";
  return null;
}

const introKey = (league, g) => `sp-in|${league.year}|${g.id}`;

// The title card for your next game, when it is special.
export function specialIntro(league, g) {
  const ev = specialFor(league, g);
  if (!ev) return null;
  return { kind: "special-intro", key: introKey(league, g), ev, gid: g.id, h: g.h, a: g.a, tid: league.userTid };
}

// The result card for your finished special game: the score, a short headline and the player of
// the game (your first star, else the game's first star).
export function specialResult(league, g) {
  const ev = specialFor(league, g);
  if (!ev) return null;
  const ut = league.userTid, home = g.h === ut;
  const us = home ? g.hs : g.as, them = home ? g.as : g.hs;
  const stars = (g.stars || []).map((pid) => league.players[pid]).filter(Boolean);
  const star = stars.find((p) => p.tid === ut) || null;
  const pog = star ? { pid: star.id, name: star.name, pos: star.pos, num: star.number ?? star.num ?? null, tid: star.tid } : null;
  return { kind: "special-result", key: `sp-res|${league.year}|${g.id}`, ev, gid: g.id, h: g.h, a: g.a, hs: g.hs, as: g.as, ot: g.ot || null, won: us > them, home, pog, tid: ut };
}

// End of a day: the result card for today's special game (its unseen title card is dropped), and
// the title card for tomorrow's, if your club plays a special game then.
export function specialDayMoments(league, games) {
  if (league.phase !== "regular") return [];
  const ut = league.userTid, out = [];
  const g = (games || []).find((x) => x.played && (x.h === ut || x.a === ut));
  if (g) {
    league.moments = (league.moments || []).filter((m) => !(m.kind === "special-intro" && String(m.gid) === String(g.id)));
    const r = specialResult(league, g);
    if (r) out.push(r);
  }
  const next = (league.schedule || []).find((x) => x.day === league.day + 1 && !x.played && (x.h === ut || x.a === ut));
  const intro = next && specialIntro(league, next);
  if (intro) out.push(intro);
  return out;
}
