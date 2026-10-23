// Scouting regions and where your scouts spend the season (Evan, batch x2: hands-off scouting).
// Before the season (preseason or the off-season) you send each of your four scouts to survey one
// region. Through the season they file reports there on their own: no points, no trips, no stops.
// A scout's evaluation grade decides how sharp his reads are, how fast his reports deepen into full
// workups and traits, and whether he finds the region's hidden gems (scouting.js scoutWeek).
export const REGIONS = {
  OHL: { name: "OHL", family: "CHL", leagues: ["OHL"], note: "Ontario and the U.S. Midwest" },
  WHL: { name: "WHL", family: "CHL", leagues: ["WHL"], note: "Western Canada and the U.S. Northwest" },
  QMJHL: { name: "QMJHL", family: "CHL", leagues: ["QMJHL"], note: "Québec and Atlantic Canada" },
  USA: { name: "USHL & NTDP", family: "U.S. junior", leagues: ["USHL", "USNTDP"], note: "U.S. junior and national development programs" },
  NCAA: { name: "NCAA", family: "College", leagues: ["NCAA"], note: "U.S. college hockey" },
  Sweden: { name: "SHL & Sweden", family: "Europe", leagues: ["SHL", "J20 Nationell", "HockeyAllsvenskan"], note: "Swedish professional and junior hockey" },
  Liiga: { name: "Liiga & Finland", family: "Europe", leagues: ["Liiga", "U20 SM-sarja", "Mestis"], note: "Finnish professional and U20 hockey" },
  Russia: { name: "KHL & Russia", family: "Europe", leagues: ["KHL", "MHL", "VHL"], note: "Russian professional and junior hockey" },
  Europe: { name: "Czech, Slovak & Central Europe", family: "Europe", leagues: ["Czechia", "Czechia U20", "Slovakia", "Slovakia U20", "NL", "U20-Elit", "DEL", "DNL U20"], note: "Czechia, Slovakia, Switzerland and Germany" },
};
export const regionOf = (p) => Object.keys(REGIONS).find((k) => REGIONS[k].leagues.includes(p.bio?.lg)) || "Europe";

// The four scouting jobs (scouting.js SCOUT_SLOTS) and where they go when you haven't chosen.
export const DEFAULT_ASSIGN = { major: "OHL", major2: "Sweden", minor: "WHL", minor2: "USA" };

// Assignments are set before the season and locked while the scouts are on the road.
export function assignWindowOpen(league) {
  if (league.phase === "regular" || league.phase === "playoffs") return false;
  if (league.phase === "draft" && league.draft && league.draft.idx < league.draft.slots.length) return false;
  return true;
}

export function scoutAssignments(league, t = league.teams[league.userTid]) {
  if (!t) return { ...DEFAULT_ASSIGN };
  const a = t.scoutRegions && typeof t.scoutRegions === "object" ? t.scoutRegions : {};
  for (const k of Object.keys(DEFAULT_ASSIGN)) if (!REGIONS[a[k]]) a[k] = DEFAULT_ASSIGN[k];
  t.scoutRegions = a;
  return a;
}

export function assignScout(league, role, region) {
  if (!REGIONS[region] || !(role in DEFAULT_ASSIGN)) return { ok: false, msg: "Choose a region." };
  if (!assignWindowOpen(league)) return { ok: false, msg: "Your scouts are on the road. Assignments open again after the draft and in the preseason." };
  scoutAssignments(league)[role] = region;
  return { ok: true, msg: `Assigned to ${REGIONS[region].name} for the season.` };
}

// Old saves: drop the area-scout points and trips; every scout gets a region.
export function ensureAreaScouting(league) {
  const t = league.teams[league.userTid];
  if (!t) return null;
  delete t.area;
  return scoutAssignments(league, t);
}
