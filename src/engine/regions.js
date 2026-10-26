// Scouting regions and where your scouts spend the season (Evan, batch x2: hands-off scouting).
// Before the season (preseason or the off-season) you send each of your four scouts to survey his
// regions (three for the senior scout, two for the second major scout, one for each minor scout).
// Through the season they file reports there on their own: no points, no trips, no stops.
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

// The four scouting jobs (scouting.js SCOUT_SLOTS), how many regions each covers (Evan, r11: the
// senior scout works three, the second major scout two, each minor scout one: 7 of the 9 regions)
// and where they go when you haven't chosen.
export const REGION_SLOTS = { major: 3, major2: 2, minor: 1, minor2: 1 };
export const DEFAULT_ASSIGN = { major: ["OHL", "WHL", "QMJHL"], major2: ["Sweden", "Liiga"], minor: ["USA"], minor2: ["Europe"] };
// Save version of the assignments: 2 = a list of regions per scout (1 = one region each).
export const REGIONS_VERSION = 2;

// A scout's regions as a list (old saves and tests store one region as a string).
export function regionsOf(v) {
  const list = Array.isArray(v) ? v : v ? [v] : [];
  return [...new Set(list.filter((k) => REGIONS[k]))];
}

// Assignments are set before the season and locked while the scouts are on the road.
export function assignWindowOpen(league) {
  if (league.phase === "regular" || league.phase === "playoffs") return false;
  if (league.phase === "draft" && league.draft && league.draft.idx < league.draft.slots.length) return false;
  return true;
}

// { role: [region, ...] } for the user's club (normalised in place; a missing scout job gets its default).
export function scoutAssignments(league, t = league.teams[league.userTid]) {
  if (!t) return Object.fromEntries(Object.entries(DEFAULT_ASSIGN).map(([k, v]) => [k, [...v]]));
  const fresh = !t.scoutRegions || typeof t.scoutRegions !== "object";
  const a = fresh ? {} : t.scoutRegions;
  for (const k of Object.keys(DEFAULT_ASSIGN)) {
    const list = regionsOf(a[k]).slice(0, REGION_SLOTS[k]);
    a[k] = list.length ? list : [...DEFAULT_ASSIGN[k]];
  }
  t.scoutRegions = a;
  if (fresh) t.scoutRegionsV = REGIONS_VERSION;
  return a;
}

// Who covers a region: the scout jobs whose list includes it.
export const rolesOn = (a, region) => Object.keys(REGION_SLOTS).filter((k) => regionsOf(a[k]).includes(region));
// How many of the nine regions at least one (hired) scout works.
export function regionCoverage(league, t = league.teams[league.userTid]) {
  const a = scoutAssignments(league, t), s = t?.scouts || {};
  const on = new Set(Object.keys(REGION_SLOTS).filter((k) => s[k]).flatMap((k) => a[k]));
  return { n: on.size, of: Object.keys(REGIONS).length, regions: on };
}

// Tap a region on a scout's card: add it (when he's full, his oldest region makes room), or drop
// it (he keeps at least one). A region another scout works moves to this one; if that leaves the
// other scout with nothing, he takes the region that just made room (a swap, as before).
export function assignScout(league, role, region) {
  if (!REGIONS[region] || !(role in DEFAULT_ASSIGN)) return { ok: false, msg: "Choose a region." };
  if (!assignWindowOpen(league)) return { ok: false, msg: "Your scouts are on the road. Assignments open again after the draft and in the preseason." };
  const a = scoutAssignments(league);
  const mine = a[role];
  if (mine.includes(region)) {
    if (mine.length <= 1) return { ok: false, msg: "Every scout works at least one region." };
    a[role] = mine.filter((k) => k !== region);
    return { ok: true, msg: `${REGIONS[region].name} dropped.`, dropped: region };
  }
  const cap = REGION_SLOTS[role];
  const freed = mine.length >= cap ? mine[0] : null;
  a[role] = [...mine.filter((k) => k !== freed), region];
  const other = Object.keys(REGION_SLOTS).find((k) => k !== role && a[k].includes(region));
  let swapped = null;
  if (other) {
    a[other] = a[other].filter((k) => k !== region);
    if (!a[other].length) { a[other] = [freed || mine.find((k) => !a[role].includes(k)) || region]; swapped = other; }
  }
  return { ok: true, msg: `Assigned to ${REGIONS[region].name} for the season.`, freed, moved: other || null, swapped };
}

// Old saves (one region per scout): keep each scout's region and fill the new slots with uncovered
// regions, the ones with the most first-rounders in the coming class first. Once per save.
export function migrateScoutRegions(league, pool = []) {
  const t = league.teams?.[league.userTid];
  if (!t || t.scoutRegionsV === REGIONS_VERSION) return false;
  const had = !!t.scoutRegions && typeof t.scoutRegions === "object";
  const a = had ? t.scoutRegions : {};
  for (const k of Object.keys(DEFAULT_ASSIGN)) a[k] = regionsOf(a[k]).slice(0, REGION_SLOTS[k]);
  if (!had) for (const k of Object.keys(DEFAULT_ASSIGN)) a[k] = [...DEFAULT_ASSIGN[k]];
  const r1 = (k) => pool.filter((p) => regionOf(p) === k && (p.cs?.final ?? p.cs?.now ?? p.cs?.mid ?? 999) <= 32).length;
  const size = (k) => pool.filter((p) => regionOf(p) === k).length;
  const keys = Object.keys(REGIONS);
  const open = () => keys.filter((k) => !Object.values(a).some((l) => l.includes(k))).sort((x, y) => r1(y) - r1(x) || size(y) - size(x) || keys.indexOf(x) - keys.indexOf(y));
  for (const k of Object.keys(REGION_SLOTS)) {
    while (a[k].length < REGION_SLOTS[k]) {
      const next = open()[0] || DEFAULT_ASSIGN[k].find((x) => !a[k].includes(x));
      if (!next) break;
      a[k].push(next);
    }
  }
  t.scoutRegions = a;
  t.scoutRegionsV = REGIONS_VERSION;
  return true;
}

// Old saves: drop the area-scout points and trips; every scout gets a region.
export function ensureAreaScouting(league) {
  const t = league.teams[league.userTid];
  if (!t) return null;
  delete t.area;
  return scoutAssignments(league, t);
}
