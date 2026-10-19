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

// Who each trophy is named for, and the club that history ties them to.
export const TROPHY_NAMESAKE = {
  stanley: ["Lord Stanley of Preston, Governor General of Canada", null],
  connSmythe: ["Conn Smythe, Maple Leafs owner and builder", "TOR"],
  hart: ["Dr. David Hart, father of Canadiens coach Cecil Hart", "MTL"],
  tedLindsay: ["Ted Lindsay, Red Wings great and players' association pioneer", "DET"],
  artRoss: ["Art Ross, Bruins coach and general manager", "BOS"],
  rocket: ["Maurice \u201cRocket\u201d Richard, Canadiens legend; the club donated the trophy in 1999", "MTL"],
  norris: ["James Norris, Red Wings owner", "DET"],
  vezina: ["Georges Vezina, Canadiens goaltender", "MTL"],
  calder: ["Frank Calder, the NHL's first president", null],
  selke: ["Frank J. Selke, Canadiens and Maple Leafs executive", "MTL"],
  ladyByng: ["Lady Byng, wife of Canada's Governor General", null],
  jennings: ["William M. Jennings, Rangers president", "NYR"],
  masterton: ["Bill Masterton, Minnesota North Stars forward", "DAL"],
  kingClancy: ["King Clancy, Senators and Maple Leafs legend", "TOR"],
  messier: ["Mark Messier, Oilers and Rangers captain", "EDM"],
  jackAdams: ["Jack Adams, Red Wings coach and general manager", "DET"],
  jimGregory: ["Jim Gregory, Maple Leafs general manager", "TOR"],
  willieORee: ["Willie O'Ree, Bruins winger who broke the NHL's colour barrier", "BOS"],
  presidents: ["The NHL's regular-season champion", null],
  princeOfWales: ["The Prince of Wales, donated in 1924", null],
  campbellBowl: ["Clarence Campbell, NHL president 1946\u201377", null],
};
