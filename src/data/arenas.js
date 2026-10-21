// Each club's home arena for 2026-27 and the city it stands in. Arena names are the home venues in
// the bundled NHL schedule (schedule2026.json; tests/live-rink.test.js checks they still match).
// Used for the Stanley Cup Final ice, the boards and the playoff walkout ("ROGERS PLACE · EDMONTON").
export const ARENAS = {
  ANA: ["Honda Center", "Anaheim"],
  BOS: ["TD Garden", "Boston"],
  BUF: ["KeyBank Center", "Buffalo"],
  CAR: ["Lenovo Center", "Raleigh"],
  CBJ: ["Nationwide Arena", "Columbus"],
  CGY: ["Scotiabank Saddledome", "Calgary"],
  CHI: ["United Center", "Chicago"],
  COL: ["Ball Arena", "Denver"],
  DAL: ["American Airlines Center", "Dallas"],
  DET: ["Little Caesars Arena", "Detroit"],
  EDM: ["Rogers Place", "Edmonton"],
  FLA: ["Amerant Bank Arena", "Sunrise"],
  LAK: ["Crypto.com Arena", "Los Angeles"],
  MIN: ["Grand Casino Arena", "Saint Paul"],
  MTL: ["Centre Bell", "Montréal"],
  NJD: ["Prudential Center", "Newark"],
  NSH: ["Bridgestone Arena", "Nashville"],
  NYI: ["UBS Arena", "Elmont"],
  NYR: ["Madison Square Garden", "New York"],
  OTT: ["Canadian Tire Centre", "Ottawa"],
  PHI: ["Xfinity Mobile Arena", "Philadelphia"],
  PIT: ["PPG Paints Arena", "Pittsburgh"],
  SEA: ["Climate Pledge Arena", "Seattle"],
  SJS: ["SAP Center at San Jose", "San Jose"],
  STL: ["Enterprise Center", "St. Louis"],
  TBL: ["Benchmark International Arena", "Tampa"],
  TOR: ["Scotiabank Arena", "Toronto"],
  UTA: ["Delta Center", "Salt Lake City"],
  VAN: ["Rogers Arena", "Vancouver"],
  VGK: ["T-Mobile Arena", "Las Vegas"],
  WPG: ["Canada Life Centre", "Winnipeg"],
  WSH: ["Capital One Arena", "Washington"],
};

// A club's home arena: { name, city }, or null for a side with no building of its own (all-star and
// national teams). Takes a team object or an abbreviation.
export function arenaFor(team) {
  const abbr = typeof team === "string" ? team : team?.abbr;
  const a = ARENAS[abbr];
  return a ? { name: a[0], city: a[1] } : null;
}

// "ROGERS PLACE · EDMONTON". venue: a game's own venue when it isn't the home club's building (a
// neutral-site game); its city isn't known, so only the name shows then.
export function arenaLabel(home, venue = null) {
  const a = arenaFor(home);
  if (venue && venue !== a?.name) return venue.toUpperCase();
  return a ? `${a.name} · ${a.city}`.toUpperCase() : "";
}
