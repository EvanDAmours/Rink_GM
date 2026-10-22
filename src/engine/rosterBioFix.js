// One-time correction for real-roster bios that shipped wrong (birth years checked against the
// NHL roster API / ESPN rosters, Oct 2026). Saves store ages, so shift each matching unedited real
// player's age by the birth-year correction, and rename the misnamed Kantserov. Runs once per save.
const BORN_FIX = { "Sam Colangelo": [2002, 2001], "Tim Washe": [2002, 2001], "Travis Mitchell": [2003, 1999], "Tyson Hinds": [2002, 2003], "Gage Goncalves": [2000, 2001], "Seamus Casey": [2003, 2004], "Kyle MacLean": [1998, 1999], "Porter Martone": [2007, 2006], "Justin Brazeau": [1997, 1998], "Oliver Moore": [2004, 2005], "T.J. Hughes": [2000, 2001], "Justin Hryckowian": [2003, 2001], "Adam Wilsby": [2001, 2000], "Theo Lindstein": [2004, 2005], "Dmitri Simashev": [2004, 2005], "Viggo Bjorck": [2006, 2008], "Brennan Othmann": [2002, 2003], "Samuel Honzek": [2005, 2004], "Shakir Mukhamadullin": [2001, 2002], "Igor Chernyshov": [2006, 2005], "Ivar Stenberg": [2008, 2007], "Marc Gatcomb": [1996, 1999], "Braeden Bowman": [2004, 2003], "Roman Kantserov": [2001, 2004] };
const RENAME = { "Nikita Kantserov": "Roman Kantserov" };
export function fixRosterBios(lg) {
  if (!lg || lg.mode !== "real" || lg.rosterBioFix >= 1) return 0;
  let n = 0;
  for (const p of Object.values(lg.players || {})) {
    if (!p || !["ea27", "est"].includes(p.src)) continue;
    if (RENAME[p.name]) { p.name = RENAME[p.name]; n++; }
    const fix = BORN_FIX[p.name];
    if (fix && typeof p.age === "number") { p.age += fix[0] - fix[1]; if (typeof p.born === "number") p.born = fix[1]; n++; }
  }
  lg.rosterBioFix = 1;
  return n;
}
