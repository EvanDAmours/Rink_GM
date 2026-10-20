// Calder Trophy eligibility for the 2026-27 season, for the players on the bundled roster file
// (src/data/nhl27-rosters.json, updated 2026-10-08). The roster file has no prior NHL games, so
// eligibility was checked by hand on 20 October 2026.
//
// The NHL's rule: a rookie is under 26 on September 15 of the season and has played no more than
// 25 NHL regular-season games in any one preceding season, nor six or more in each of any two
// preceding seasons. (Brad Lambert's 25 games in 2025-26 still leave him a rookie.)
//
// Sources (NHL.com):
// - NHL.com stats, 2026-27 rookies (isRookie): https://api.nhle.com/stats/rest/en/skater/summary
//   and .../goalie/summary with seasonId=20262027, gameTypeId=2, isRookie=1, plus the bios report
//   for birth dates.
// - NHL.com stats, rookies with 6+ games in each season from 2019-20 to 2025-26 (same reports,
//   earlier seasonIds), to rule out players already past the limits.
// - NHL.com player pages (https://api-web.nhle.com/v1/player/{id}/landing) for players who had
//   not yet played in 2026-27: Blomqvist, Lysell, Casey, Kemell, Pickering, Lamoureux, Brunicke,
//   Clarke, Molendyk, Hage, Battaglia and Luchanko qualify; Travis Mitchell (born 1999), Jett Woo,
//   Filip Hallander and Akira Schmid (all born before mid-September 2000) and Nico Daws (25 and 21
//   games in two seasons) do not.
// - NHL.com, "Top NHL prospects for 2026-27" and the preseason Calder Trophy Tracker.
//
// Names are spelled exactly as in the roster file.
export const CALDER_SEASON = 2026;

export const CALDER_ROOKIES_2026 = [
  // ANA
  "Judd Caulfield", "Tyson Hinds", "Noah Warren",
  // BOS
  "James Hagens", "Fabian Lysell",
  // BUF
  "Colten Ellis", "Konsta Helenius",
  // CAR
  "Charles-Alexis Legault",
  // CGY
  "Samuel Honzek",
  // CHI (the roster file lists Roman Kantserov, the Blackhawks' 2023 second-rounder, as "Nikita")
  "Anton Frondell", "Nikita Kantserov",
  // COL
  "T.J. Hughes",
  // DAL
  "Arttu Hyry",
  // DET
  "Anton Johansson", "Michael Brandsegg-Nygard",
  // EDM
  "Josh Samanski", "Owen Michaels",
  // FLA
  "Sandis Vilmanis",
  // LAK
  "Jared Wright",
  // MTL
  "David Reinbacher", "Michael Hage",
  // NJD
  "Seamus Casey",
  // NSH
  "Joakim Kemell", "Tanner Molendyk",
  // NYI
  "Victor Eklund",
  // NYR
  "Dylan Garand", "Jacob Battaglia",
  // OTT
  "Carter Yakemchuk", "Graeme Clarke",
  // PHI
  "Porter Martone", "Alex Bump", "Jett Luchanko",
  // PIT
  "Sergei Murashov", "Joel Blomqvist", "Owen Pickering", "Harrison Brunicke",
  // SJS
  "Ivar Stenberg", "Luca Cagnoni",
  // STL
  "Adam Jiricek", "Theo Lindstein",
  // TOR
  "Gavin McKenna",
  // UTA
  "Sebastian Cossa", "Maveric Lamoureux",
  // VGK
  "Trevor Connelly",
  // WPG
  "Viggo Bjorck", "Brad Lambert", "Tyrel Bauer",
  // WSH
  "Cole Hutson", "Ilya Protas",
];

// Teenagers and other very young players on the bundled rosters who already used up their
// rookie season (more than 25 games in 2024-25 or 2025-26), so the "a teenager is a first-year
// player" fallback below never catches them.
export const CALDER_GRADUATES_2026 = [
  "Macklin Celebrini", "Matthew Schaefer", "Ben Kindel", "Michael Misa", "Beckett Sennecke",
  "Sam Dickinson", "Igor Chernyshov", "Zayne Parekh", "Matvei Gridin", "Berkly Catton",
  "Ivan Demidov", "Will Smith", "Zeev Buium", "Ryan Leonard", "Easton Cowan", "Tom Willander",
  "Emmitt Finnie", "Axel Sandin-Pellikka", "Artyom Levshunov", "Calum Ritchie", "Gabe Perreault",
  "Matthew Wood", "Dalibor Dvorsky", "Daniil But", "Denver Barkey", "Nick Lardis", "Zach Benson",
  "Connor Bedard",
];
