# Rink GM — vision and decision log

Read this before building or changing anything. Update it with every change (what and why).
Owner: Evan. If a request conflicts with this file, the newest request wins — then update this file.

## Central tenets (equal weight)

1. **Every screen is polished, clean and sleek, and makes people want to stay.**
   Tests for every screen: *Is it easy on the eyes? Will a new user understand it? Would someone
   stay here, or leave because it's busy?* Never overwhelm with data. Less on screen beats more.
2. **The most comprehensive, real-world simulation possible.** Real NHL player ratings (EA SPORTS
   NHL 27 where published; McDavid 99 / #97 / slapshot 92 via `verifiedData.js`), results that
   match real NHL bands, real-world contracts and trade logic for AI and user clubs alike.

3. **Never cost the player visibility.** "One of our primary goals is to ensure that each new screen, feature or
   re-work of the game does not impact a player's visibility. It should rarely if ever require any additional
   scrolling on the screen unless the player will significantly benefit from it." (Evan, 2026-10-27)
   Check every new screen at 1440×900 and 390×844: the main content and its primary action fit without scrolling.

## Look and feel (the reference screens)

The newest approved screens define the look; match them:
Development (`DevelopmentDesk.jsx`, `dev.css`), Lineup (`LinesPage.jsx`, `lines.css`),
Standings (`StandingsPage.jsx`), Broadcast Home (`Dashboard.jsx`, `broadcast.css`),
negotiation table (`ContractModal.jsx`, `negotiate.css`).

- Soft style: page bg ~#080c14, borderless soft cards (#ffffff0d, radius 18), hairlines #ffffff10,
  sentence-case white headings, no emoji in UI chrome, one green primary (#16a34a) per view,
  quiet buttons (#ffffff14), white/dark selected chips. Tokens in `soft.css`; light mode via
  `scripts/gen-light-css.mjs` (rerun after CSS changes) + `light-fixes.css`.
- One idea per screen. A big plain headline sentence, then a calm list. At most ~3 numbers and
  one coloured element per row. Detail lives one tap away (Sheet), not on the default view.
- Popups: `Sheet` / `Dialog` / `DBtn` in `common.jsx` (portal to body; bottom sheet on phones).
  No popup may stop a sim. Moments queue until the sim ends at the point the user chose.
- Desktop nav: Home · Team · Standings · Season · Development · Draft · Trades & FA · Contracts · Front Office.
- Phone and desktop are separate designs sharing logic; check both every time. One column on
  phones, big touch targets, no sideways scroll, safe areas, dvh.
- Evan dislikes: clutter, dense tables by default, sweater art on the Lineup screen, interruptions,
  pop-ups for routine actions, "Sim day" through empty days, emoji/ALL-CAPS headings.
- Before big layout changes: make 3–5 static mockups (real game data and assets, desktop + phone),
  let Evan pick, then build exactly that.

## Simulation principles

- Calibrate to real data and say what you calibrated to (docs/SIMULATION_AUDIT.md,
  CONTRACT_MARKET.md). Targets: ~2.9–3.1 goals/team/game, save % ~.900–.905, Art Ross ~120–140,
  goal leader ~55–65, AI payrolls 85–100% of the cap, nobody over the cap.
- No user-only inflation: user and AI clubs follow the same rules; user perks stay small.
- Trades: value above replacement (≈72 OVR worth ~0), stars need a real centrepiece, age curve
  after 29, rentals ~0.48 in season, picks 1.35×; pinned against 10 real NHL trades
  (tests/trade-market-real.test.js) plus the Karlsson / O'Reilly rejections.
- Contracts priced by league rank vs real 2025-26 cap hits (marketPay.js), ELCs, 8/7-year limits.
- Saves must always load: gate one-time reshapes with a save-version flag; never store
  cap-dependent values.

## Process

Worktree per batch → full tests (`node --test tests/*.test.js`) + render smoke + screenshots
(desktop 1440×900, phone 390×844) → patch note in `src/data/patchNotes.js` → push to main →
confirm the Pages deploy. Report real outcomes only.

## Decision log (newest last)

- 1.56 Standings section with playoff picture + projected bracket — "the simulation is all for nothing" without it.
- 1.57 Trade values rebuilt — Karlsson for two 71s and O'Reilly for Carrier + a 71 were being accepted.
- 1.58 Hands-off scouting (assign regions preseason; no points, no checkpoints) — scouting kept interrupting sims.
- 1.59 Home sidebar shows only real blockers — too much clutter.
- 1.60 Sims never stop for highlights; start-of-season preview and All-Star Teams screen removed — interruptions.
- 1.61–1.62 Lines readability, chemistry system and archetype tags.
- 1.63–1.68 Gridiron "redo" port: soft style, Sheet/Dialog, six-section bar, Broadcast Home, phone rebuild,
  real-market contracts, coach retirement with notice, negotiation table, special games, real-trade calibration, sweep.
- 1.69 Special-game result card only after a game you played live — simmed ones shouldn't pop up.
- 1.70 Sim goes game to game (skips off days) — pressing Sim day through empty days was tedious.
- 1.71 Standings its own top-bar tab.
- 1.72 Gazette centred again.
- 1.73–1.74 Lineup screen (mock 11, every unit a horizontal row, coach panel); sweater art removed (Evan disliked it).
- 1.75 Team picker grouped by division; tapping a player on Lineup no longer opens a pop-up (move freely).
- 1.76 Development rebuilt (round-3 calm design): own tab; Overview / Season plan / Prospects; one focus player
  (trait-scaled, Gridiron-style), camp priority, prospect placement gamble; SP camp chores removed (user-only inflation).
- 1.77 One look: every section uses the Lineup/Development header (PageHead + SectionPills in common.jsx, page.css);
  team-colour SectionHero removed; one segmented filter style; sentence case, no emoji; dense tables open with key
  columns + "More columns" — Evan asked for consistency across all screens. Still dense (need mockups first):
  Trade Center, Hockey Operations, combine table, team-roster sheet, Game plan.
- 1.78 Lineup coach panel closed by default; one line shows the gap to the optimal lineup (greedy coach run: N changes,
  points short = rating + chemistry weighted by ice time) — Evan felt the endless swap ideas should be opt-in.
- 1.79 Generated sweater art replaced everywhere by an NHL-style grey silhouette (Headshot.jsx Silhouette) when no headshot exists — Evan found the sweaters silly. Jersey.jsx kept only for the uniform designer.
- 1.80 Section hero back as ONE component on every section (club colours, block title, tab-specific numbers, screens as underline tabs; compact on phones) — Evan wanted Gridiron's "character and life" while staying consistent (small-caps captions allowed in the hero). Scouting HQ rebuilt on Gridiron's layout. Scouts cover 3/2/1/1 regions (7 of 9) — 4 of 9 was too little coverage.
- 1.81 Home To do = reminder board: real blockers, then only essential unfinished reminders (focus player, hire scouts, scout regions, one grouped "key players need new deals" from mid-season with Not now). No contract nags/popups — Evan wanted reminders, not clutter.
- 1.82 Special-game cards: no emoji art, no flavour one-liner — Evan disliked both; revisit holiday games later.
- 1.83 Development rows/sheets show position chip, OVR and draft year/round/pick (Who component) — Evan: "so we actually KNOW who we are developing". Real players' draft data still to be imported.
- 1.84 Development rows in Gridiron's format (name + age · POS inline, short status, big OVR + change); Prospects as a grouped 3-column grid on one screen; replaces the 1.83 chip line — Evan wanted it formatted like Gridiron, keeping ONE focus player (football's offence/defence split doesn't apply).
- 1.85 Real draft history for all 797 real players (NHL Stats API; 700 drafted, 97 undrafted; matched by NHL id), estimated (flagged est) for generated depth players without changing ratings — draft info is shown in player details.
- 1.86 Final front page features only the Conn Smythe winner (subhead, story, photo) — it named a different series MVP; papers' headlines wrap.
- 1.87 Contracts its own section (Re-sign first in re-sign week); League = Teams · History · Retired; Playoffs moved into Standings (opens there in the playoffs); phone bar Home · Lineup · Standings · Development · More; ONE player sheet (PlayerSheet.jsx) for every player everywhere — Evan wanted easier navigation and less scrolling. Desktop nav: Home · Team · Standings · Season · Development · Draft · Trades & FA · Contracts · Front Office.
- 1.88 Draft rebuilt as concept 2 "Your list is the draft" (tabs Scouting · Draft · Your class): scouts seed Your list at the Combine (drag, reset) and spend the visits; on the clock three scouts' options with one green Draft; odds from replaying the AI pick rule; one rule for every pick made for you (Your list, then scouts' board); offers as one quiet card; Your class shows believed ceilings + one grade. Old combine table/floor/war room/phone/mock/recap removed; first pick in 2 taps; no scrolling on the clock at 1440×900 or 390×844.
- 1.89 Lineup fits on one screen at 1440×900 and 1280×800 (forwards + defence side by side, goalies + bench tiles in a bottom strip); PP/PK units shaped forwards-over-defence; bench/"not on a unit" as tiles with best-slot hints; coach summary as a tinted callout — applying tenet 3 (no scrolling).
- Playoff study (2026-10-27, no code change): playoffs = same game model + best-of-7 maths, no extra randomness; Presidents' Trophy winner takes the Cup 25.5%, higher seed 61.5%, favourites 57.6% (NHL-like). Open items awaiting Evan: no home ice (51%), overconfident UI win odds, coaching/chemistry near-zero effect, custom PP/PK units reset when a dressed player is out, playoff PP% ~17%; proposed Playoff readiness card + luck check + series verdict.
