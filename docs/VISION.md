# Rink GM — vision and decision log

Read this before building or changing anything. Update it with every change (what and why).
Owner: Evan. If a request conflicts with this file, the newest request wins — then update this file.

## The two goals (equal weight)

1. **Every screen is polished, clean and sleek, and makes people want to stay.**
   Tests for every screen: *Is it easy on the eyes? Will a new user understand it? Would someone
   stay here, or leave because it's busy?* Never overwhelm with data. Less on screen beats more.
2. **The most comprehensive, real-world simulation possible.** Real NHL player ratings (EA SPORTS
   NHL 27 where published; McDavid 99 / #97 / slapshot 92 via `verifiedData.js`), results that
   match real NHL bands, real-world contracts and trade logic for AI and user clubs alike.

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
- Desktop nav: Home · Team · Standings · Season · Development · Draft · Trades & FA · Front Office.
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
- Pending: whole-game visual consistency pass; Lineup coach suggestions collapsed by default behind
  "N changes could improve your lineup" (gap vs the optimal lineup).
