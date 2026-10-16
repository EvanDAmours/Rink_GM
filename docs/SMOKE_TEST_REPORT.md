# Whole-game smoke and player-data isolation review

Date: 16 October 2026. Scope: the complete existing game, the NHL engine rebuild and the connected franchise-depth changes. This report distinguishes gameplay information leaks, mutable-data contamination and account/save isolation. It does not claim that a browser-only single-player game can hide its simulation state from its owner using developer tools.

## Findings fixed

| Finding | Fix and verification |
| --- | --- |
| Undrafted prospects and farm cuts deleted player records | Undrafted players enter free agency with their scouting/identity data. Released prospects retain their full records and movement trail; signed cuts use the common buyout/cap path. Free-agent membership and unique ownership are checked in the career audit and a regression covers both transitions. |
| Missing or partial scouting data could fall back to true prospect OVR/POT | Unknown values fail closed. Scouting displays read recorded public estimates rather than raw attributes. Missing-record and malformed-record regressions pass. |
| Opponent prospect lists sorted by true potential | Team cards and trade lists sort by visible reads with a stable name tie-break. Changing hidden truth does not change rendered order. |
| Prospect market value and historical OVR exposed hidden ability | Opponent development cards suppress the derived market-value quote, raw attributes, development trait and historical rating column. Observed statistics and contracts remain visible. |
| Offers, trade block, deadline and trade news bypassed card visibility | These paths use the same visible evaluation. Legacy news rating annotations for currently hidden players are sanitized on migration. The trade interest meter communicates coarse negotiation bands instead of exposing a precise internal valuation in an inline width. |
| Imported mutable attributes and draft objects could be shared | Player creation copies them, and verified metadata copies its mutable ability list. Two players, two separately created leagues and reloaded saves remain independent under mutation. |
| Stale selection could modify another team's player | Signing, releasing, assignment, recall and roster insertion validate ownership. Rejected actions leave the league unchanged; valid offer-sheet transfers continue to pass integration tests. |
| Cloud namespace/account context could persist across an identity change | Each operation rechecks identity; an already-bound league cannot silently save under another account. Rink GM uses a game-specific namespace. Recognized old hockey backups remain readable and migrate forward. Mocked account-switch, foreign metadata and legacy compatibility tests pass. |
| Save format lacked an explicit hockey identity gate | New saves identify Rink GM. Genuine old hockey saves migrate; foreign-game tags, football positions and malformed team identities are rejected. |
| New-season roster building could budget against the following year | The new season enters preseason before roster construction. Cap-floor rounding was tightened; both floor and ceiling are checked in the long-career audit. |
| Role commitments could confuse relief appearances, healthy scratches and injuries | Reviews count goalie starts, subtract unavailable team games, penalize healthy benching, defer small samples and reset the review window correctly across seasons. |
| A growing career save exceeded the conservative 5 MiB budget in season 19 | Lossless schema packing removes repeated record keys before LZ compression. Full player/history values remain intact; old UTF-16 and portable saves still load. Dedicated precision/array/prototype-key/legacy tests pass. The complete career audit was rerun after the fix. |
| Buyout confirmation still described the old flat one-third rule | Both release confirmations now display the calculated year-by-year schedule; future dead-cap entries are labelled with their starting season. |

## Automated and rendered checks

The final regression count and all outcomes are recorded in `ENGINE_VALIDATION.json`. Tests exercise NHL scoring/manpower/stat conservation, live/rapid equivalence, exact match recovery after intervening random activity, result idempotence, positional skill, injuries/healing, schedules, trades, clauses, waivers, RFAs/offer sheets, drafts/scouting, extensions, cap accounting, development, commitments, history, settings and save migrations.

`npm run test:visibility` is a metamorphic rendered-HTML test. It changes hidden OVR/POT, development traits and individual attributes to extreme values while holding public reports and production fixed. It checks complete HTML, including order, tooltips, classes and inline values, for the draft board/profile/comparison lab, opponent card, team card, trade list, inbound offer, trade block and deadline listing. Player statistics, public rankings and legitimate GM negotiation responses are allowed game information; they are not promised to be statistically uninformative.

`npm run test:render` covers all main screens, live play, every Hockey Operations tab and dashboards in regular season, playoffs, draft, re-signing and free agency.

## Browser smoke

A freshly built self-contained game was exercised in headless Chromium at 1440px and 390px, with real interactions:

- Light palette, direct dashboard-to-planning navigation, large-text and reduced-motion settings; larger controls and sticky phone shortcuts. Desktop and phone screenshots were visually reviewed.
- All 32 embedded logos and conference filters; keyboard search, modal focus trapping/Escape; roster filtering and keyboard sorting.
- Every operations tab; camp battles, arena upgrade, opponent-plan controls, role selection and calculated buyout confirmation preview/cancel.
- Major desktop and phone navigation, manual save-slot UI and loading a saved franchise.
- Live game pause/step, jersey labels, reload to the exact clock and paused state, simulation to the final, application of the result, and the stored attempt/unit/goalie report.
- Active draft clock preserved across navigation; active deadline clock advance and opening the Trade Center; real re-signing/free-agency phase fixtures and agent screens.
- WebGL Cup rendering with zero GL errors and the unavailable-GPU fallback.
- No JavaScript page errors, no outer horizontal overflow at 390px, and no HTTP(S) requests in the offline checks. The separately requested schedule-refresh feature can intentionally contact its public NHL schedule service; no private league/player payload is sent by that path.

Browser coverage is Chromium with phone-sized emulation, not a physical-device or Safari/Firefox certification. Cloud isolation checks use a mocked host adapter; no signed-in remote account was used as a destructive test target.

## Simulation and long-career checks

Eight controlled scenarios contain 8,000 games; six positional scenarios contain 6,000 games. Two separately seeded 1,344-game seasons compare scoring, shots, saves, special teams, overtime and shootouts with the official 2025–26 NHL snapshot. All observations and the power-only confidence-interval gate clarification are in `SIMULATION_AUDIT.md` and the raw JSON reports.

The final deterministic run completed **20 seasons**, through 2046 preseason: **26,880 regular-season games and 1,729 playoff games**. All ownership/free-agent membership, AI roster/cap, rating-drift, history and reload checks passed after every season. The largest UTF-16 snapshot was **4,349,304 bytes** (4.15 MiB), below the unchanged 5 MiB test budget. The final league retained 3,665 active/free-agent/draft player records and 1,954 full retirement archive entries. See `career-audit-results.json` and `audit-logs/dynasty.log`.

The career runner advances full regular seasons and every playoff series, completes drafts/re-signing/free agency, develops/ages/retires players and reloads the save after each season. It checks unique reserve-list ownership and missing players, active/contract/reserve limits, AI cap floor/ceiling, rating bounds/drift, seasonal history and a 5 MiB serialized snapshot budget. It is a deterministic single-career integration test, not proof that every possible franchise seed or browser quota will pass forever.

The late-career storage stress check then played another full 1,344-game regular season after the 20-year run. Its full-season save was 4,503,138 UTF-16 bytes (4.29 MiB), compared with 5,878,006 bytes using the old representation of the same world. Player records and the full retirement archive survived portable export/import unchanged. Actual Chromium localStorage write, reload, roster access and autosave flush also passed. See `peak-save-audit-results.json`.

## Remaining boundaries

Full simulation truth exists in local memory and exported saves. This update prevents unintended normal-UI disclosures and accidental record/account mixing; it is not anti-cheat infrastructure. Already observed information cannot be made unknown again. Public NHL ratings remain available; own-organization ratings are intentionally visible after acquisition.

The model is hand-calibrated rather than fitted to tracking data. Overtime/shootout rates are closer to the reference but remain low. Weekly farm competition and confidence are development abstractions. Salary/service histories and unpublished attributes are estimated where not supplied; LTIR, 35+ exceptions, buyout windows, trade bonus allocation, arbitration and playoff dressed-roster cap retain the explicit limits in the install handoff. Browser storage quotas still apply, and export/import remains available.

No GitHub publication is claimed: repository write access was rejected. The downloadable package contains the complete updated source and current builds.
