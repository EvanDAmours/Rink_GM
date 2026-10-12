// Area scouting is breadth; position scouts still provide the deepest reports.
import { stream, clamp } from "./rng.js";

export const REGIONS = {
  OHL: { name: "OHL", family: "CHL", leagues: ["OHL"], note: "Ontario and the U.S. Midwest" },
  WHL: { name: "WHL", family: "CHL", leagues: ["WHL"], note: "Western Canada and the U.S. Northwest" },
  QMJHL: { name: "QMJHL", family: "CHL", leagues: ["QMJHL"], note: "Québec and Atlantic Canada" },
  NCAA: { name: "NCAA", family: "College", leagues: ["NCAA"], note: "U.S. college hockey" },
  USA: { name: "USHL & NTDP", family: "U.S. junior", leagues: ["USHL", "USNTDP"], note: "U.S. junior and national development programs" },
  Liiga: { name: "Liiga & Finland", family: "Europe", leagues: ["Liiga", "U20 SM-sarja", "Mestis"], note: "Finnish professional and U20 hockey" },
  Sweden: { name: "SHL & Sweden", family: "Europe", leagues: ["SHL", "J20 Nationell", "HockeyAllsvenskan"], note: "Swedish professional and junior hockey" },
  Russia: { name: "KHL & Russia", family: "Europe", leagues: ["KHL", "MHL", "VHL"], note: "Russian professional and junior hockey" },
  Europe: { name: "Central Europe", family: "Europe", leagues: ["Czechia", "Czechia U20", "Slovakia", "Slovakia U20", "NL", "U20-Elit", "DEL", "DNL U20"], note: "Czechia, Slovakia, Switzerland and Germany" },
};
export const AREA_START = 8, AREA_WEEKLY = 2, TRIP_COST = 2, MAX_TRIPS = 4;
export const regionOf = (p) => Object.keys(REGIONS).find((k) => REGIONS[k].leagues.includes(p.bio?.lg)) || "Europe";

export function ensureAreaScouting(league) {
  const t = league.teams[league.userTid];
  if (!t.area || t.area.year !== league.draftClassYear) t.area = { year: league.draftClassYear, points: AREA_START, trips: {}, paid: 0 };
  return t.area;
}
export function creditAreaWeeks(league) {
  const a = ensureAreaScouting(league);
  const w = Math.floor(league.day / 7);
  if (w > a.paid) { a.points += (w - a.paid) * AREA_WEEKLY; a.paid = w; }
}
export function scoutRegion(league, key) {
  if (!REGIONS[key]) return { ok: false, msg: "Choose a scouting region." };
  if (["freeagency", "resign"].includes(league.phase) || league.phase === "draft" && league.draft?.stage !== "combine") return { ok: false, msg: "Regional visits close when the draft starts." };
  const a = ensureAreaScouting(league);
  if ((a.trips[key] || 0) >= MAX_TRIPS) return { ok: false, msg: "Your area scouts know this region inside out." };
  if (a.points < TRIP_COST) return { ok: false, msg: `A regional visit costs ${TRIP_COST} area points.` };
  a.points -= TRIP_COST; a.trips[key] = (a.trips[key] || 0) + 1;
  return { ok: true, msg: `Visit ${a.trips[key]} to ${REGIONS[key].name} completed. Reports improved across this region.` };
}
export function regionRead(league, p) {
  const a = league.teams[league.userTid]?.area;
  const trips = a?.year === league.draftClassYear ? a.trips[regionOf(p)] || 0 : 0;
  if (!trips) return null;
  const sd = [0, 7, 5, 3.5, 2.5][trips];
  const r = stream(`${p.id}|area|${trips}`);
  const pot = clamp(p.pot + clamp(r.gauss(0, sd), -1.6 * sd, 1.6 * sd), 40, 99);
  return { pot, trips, sd, sleeper: trips >= 3 && pot >= 84 && (p.cs?.final ?? p.cs?.mid ?? 999) > 64 };
}
