# Contract market and head-coach retirements

## Asking prices by league rank (src/engine/marketPay.js)

Each position group (C, W = LW+RW, D, G) is priced by league rank. The game's opening 2026 NHL-roster
ratings at ranks 1, 3, 5, 10, 20, 32, 50, 64, 96, 128, 160, 192 are paired with real 2025-26 cap hits at
the same ranks, stored as shares of the 2025-26 cap ($95.5M) so they scale with any future cap.

| Group | Opening ratings at the ranks | 2025-26 cap hit at the ranks ($M) |
|---|---|---|
| C | 99 96 95 93 89 87 86 85 81 78 77 75 | 14.0 12.6 11.6 9.5 8.25 7.25 5.75 4.75 3.25 2.0 1.35 0.95 |
| W | 97 94 93 91 89 88 86 85 81 79 78 76 | 12.0 11.64 11.25 9.5 8.5 7.5 6.25 5.25 4.0 2.75 1.85 1.15 |
| D | 95 95 93 91 88 87 86 86 85 80 78 77 | 11.5 11.0 9.58 9.25 8.25 7.0 5.5 4.5 3.25 2.25 1.5 1.0 |
| G | 94 92 90 87 85 84 80 79 | 11.5 9.5 8.25 6.0 4.5 3.25 1.8 1.1 |

Sources:
- Ranks 1-10 (and the top of every group): PuckPedia 2025-26 cap hits as published in
  "Who are NHL's highest-paid players?" (AOL/NBC Sports, https://www.aol.com/articles/highest-paid-nhl-players-ranking-120135692.html):
  Draisaitl 14.0, Matthews 13.25, MacKinnon 12.6, McDavid 12.5, Marner/Rantanen 12.0, Panarin 11.64,
  Pettersson 11.6, Karlsson/Nylander/Shesterkin 11.5, Pastrnak 11.25, Doughty/Dahlin 11.0, Bouchard 10.5,
  Barkov/Eichel/Bobrovsky 10.0, Werenski 9.58, many at 9.5, down to 8.5 at #59.
- Ranks 20 and deeper: compiled estimates of the 2025-26 cap-hit distribution (Spotrac/PuckPedia position
  pages could not be fetched from this environment: spotrac.com position rankings were blocked). They are
  calibrated so the table summed over the game's 736 rostered players lands near real league spending.

Rules: ties in the rating list are averaged; above the #1 rating a premium of 1.5% a point (at most 6%,
never over 20% of the cap); below the last anchor a straight decline to the league minimum over 6 points.
The middle of the market is lifted up to 25% (MARKET_LIFT), but never above the price of a player up to
3 points better (less near the top), so the top asks stay at real prices and value never falls with
rating. Without the lift, AI clubs sat at the cap floor (real veterans are paid on deals signed before
they aged, so a bare rank table under-prices the game's rosters).

Age: x0.96 at 30, 0.9 at 31, 0.82 at 32, 0.74 at 33, 0.64 at 34, 0.55 at 35, 0.5 at 36, 0.45 after;
goalies age two years later. Term: 35+ one year; under 76 OVR 1-2; career age 25 or younger 6-8 (88+),
4-7 (82+), else 2-4; 26-29 4-6 (85+), 3-5 (80+), else 2-4; 30-31 2-4 (85+) or 1-3; 32-34 1-2. Maximum
8 years re-signing, 7 on the open market. Entry-level deals: 3/2/1 years by signing age (18-21/22-23/24+),
the ELC maximum for top-10 picks sliding toward the minimum by pick 160.

Nothing cap-dependent is saved: the tables are code, existing contracts are untouched, and no one-time
reshape of old saves is needed for the market.

Verify: `node scripts/contract-benchmark.mjs` (opening league) and `HEALTH_SEASONS=6 node scripts/contract-benchmark.mjs`
(AI payroll % of cap, clubs over the cap, top-5 shares per group vs real, players 90+).

## Head coaches retire at the end of their contract (src/engine/coachContracts.js)

Exit age 64 + hash(name) % 9, with hand-set overrides for veterans (Bowness 71, Quenneville 70, Ruff 67,
Babcock 67, Tocchet 67, Arniel 66). Real coaches' birth years and approximate remaining terms are in
REAL_HC_BIO (birth years from NHL.com / Hockey-Reference coach pages; terms are estimates from reported
deals). Old saves get real ages and terms once, gated by `league.hcv`.
