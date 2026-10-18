// Premium trophy sprites (stylised 3D renders, transparent WebP), bundled inline.
const files = import.meta.glob("../assets/trophies/*.webp", { eager: true, query: "?url", import: "default" });
const byId = Object.fromEntries(Object.entries(files).map(([path, url]) => [path.split("/").pop().replace(".webp", ""), url]));
// Award keys used by the engine → sprite ids.
export const TROPHY_SPRITE = {
  stanley: "stanley-cup", hart: "hart", artRoss: "art-ross", rocket: "rocket-richard", norris: "norris", vezina: "vezina", calder: "calder",
  selke: "selke", ladyByng: "lady-byng", tedLindsay: "ted-lindsay", jennings: "jennings", jackAdams: "jack-adams", connSmythe: "conn-smythe",
  masterton: "masterton", kingClancy: "king-clancy", messier: "mark-messier", jimGregory: "jim-gregory", willieORee: "willie-oree",
  presidents: "presidents", princeOfWales: "prince-of-wales", campbellBowl: "campbell-bowl",
};
export const trophyUrl = (kind) => byId[TROPHY_SPRITE[kind] || kind] || null;
export const TROPHY_ORDER = ["stanley", "connSmythe", "hart", "tedLindsay", "artRoss", "rocket", "norris", "vezina", "calder", "selke", "ladyByng", "jennings", "masterton", "kingClancy", "messier", "jackAdams", "jimGregory", "willieORee", "presidents", "princeOfWales", "campbellBowl"];
