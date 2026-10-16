# Rink GM complete simulation and franchise update — install handoff

This package contains the existing complete React/Vite game, the NHL simulation rebuild, the franchise-depth update and the subsequent whole-game smoke/data-isolation fixes. It is based on the original `EvanDAmours/Rink_GM` commit `a421a967fef034faef7621d55f519cb0ea958a1f` and has been reconciled with the published engine rebuild on main, `7e11cd8fe9849f5553aacbf457f4e534ad679465`.

For step-by-step browser upload and Pages instructions, read **UPLOAD_TO_GITHUB.md**.

GitHub branch creation returned HTTP 403, `Resource not accessible by integration`. No changes were pushed and no deployment was published. The ZIP supplies current source, freshly built desktop/mobile playable entries, a cumulative source patch and validation evidence.

## Play or install

Extract the ZIP and open `Rink-GM/PLAY-RINK-GM.html`. Current self-contained hosting entries are `Rink-GM/prebuilt/index.html` and `Rink-GM/prebuilt/mobile/index.html`. Existing franchises transfer through export/import; local files and a deployed website have different browser storage origins.

Give the package to a coding agent with repository write access:

> Apply this completed update to https://github.com/EvanDAmours/Rink_GM on a new branch. Read ENGINE_REBUILD_HANDOFF.md, docs/SMOKE_TEST_REPORT.md and docs/SIMULATION_AUDIT.md. Use update-from-current-main.patch for published main commit 7e11cd8fe9849f5553aacbf457f4e534ad679465. Only use cumulative franchise-update.patch when starting from original commit a421a967fef034faef7621d55f519cb0ea958a1f; it includes the earlier engine rebuild too. Preserve subsequent unrelated repository work. Use git apply --3way and resolve conflicts; do not recreate the game. Run npm ci, npm test, npm run test:visibility, npm run test:render and npm run build:pages. Review the included audit JSON. Preserve the existing Pages workflow and /mobile/ entry. Open a PR and report actual publication results. Verify both deployment routes before calling the update live.

The patch is source-only: rebuild after applying it. Checked-in original import HTML snapshots are historical; the full downloadable package replaces its playable entries with the current build.

## New behavior

- **Brighter clubhouse:** warm off-white and ice-blue surfaces, navy text and orange accents replace the dark black/teal theme. Club colors stay on uniforms and identity. Larger tables/controls, optional large text and reduced motion, sticky phone shortcuts, a roster-driven illustrated club spotlight, real crowd support and next-action cards improve readability and interaction. Game plans and reports have a direct navigation entry.


- **One match engine:** live, rapid and playoff modes share possession, scoring, penalties, goalie accounting, deployment and player-skill mechanics. Matches own serializable random streams; a live checkpoint restores the exact playing state and resumes paused. Completed fixtures/results have duplicate-application guards.
- **Planning & analysis:** Hockey Operations now shows shared C/LW/RW/LD/RD/G priorities, prospect usage/readiness/confidence, role commitments, daily cap accounting and recent match reports. Shared priorities influence draft choices, free-agent recruitment, trade values/interest and reserve lineup decisions. Draft need weighting is bounded so talent remains central.
- **Coaching:** each opponent receives an automatic scouting-based plan, or the user can set forecheck, neutral-zone and attack preferences. Choices change dump-in recovery, controlled-entry selection, passing risk and shot/cycle decisions. Conservative late regular-season tied play seeks to protect the standings point without forcing a tie or changing an already resolved goal.
- **Postgame reports:** the last 20 user regular/playoff games retain attempt maps, unit minutes/attempts/shots/goals, special teams, goalie results, player production and factual coaching notes. These work for both live and rapid simulation. League statistics add points per 60.
- **Development:** forwards, defensemen and goalies have different age curves. Strong veterans are less likely to retire; being an unsigned 37-year-old or a low-ranked entry in the FA pool no longer forces retirement. Farm minutes, assignment difficulty and role affect weekly development. Assignment history and a sample-size confidence label support prospect decisions.
- **Contracts:** role, security, winning and earned continuity/trust influence negotiations. Accepted roles are reviewed against healthy playing opportunities; goalie promises count starts. Repeated broken promises lower trust and can trigger trade requests. No award grants an automatic overall-rating boost.
- **Cap:** calendar-day accrual and banked acquisition room; no ordinary credit banking on LTIR days; salary/signing-bonus records, explicit performance-bonus targets and earned overages; age-dependent ordinary buyout schedules with future offsets and bonus protection. Next-season budgeting now changes phase before roster construction. Buyout confirmation screens display the actual schedule.
- **Player continuity:** undrafted players enter free agency; farm cuts preserve identity and career records and use the same release/buyout accounting. No drafted player is deleted merely to trim a farm list.
- **History:** future retirements preserve complete player snapshots, annual attributes/ratings, regular and playoff season statistics, awards, draft information and recorded movements. Open cards from Events & legacy. Old summary-only retirees remain labelled as such.
- **Rapid-sim stops:** configurable stops for injuries, offers, roster issues and role disputes occur between completed days, with acknowledgement to avoid repeated alerts for the same issue.
- **Long-career saves:** lossless record-schema packing reduces repeated key overhead before compression, preserving complete player histories and exact numeric values. Legacy compressed saves and exports remain readable. The long-career storage-budget failure found during the smoke test is covered by the rerun.
- **Information isolation:** hidden prospect ratings never fall back to true values when scouting data is missing. Opponent prospect ordering, market values, cards, offers and trade-news labels respect visibility. Imported mutable player records are copied; stale roster actions reject players owned elsewhere. Hockey save identity/schema validation rejects foreign-game data. Cloud saves use a Rink GM namespace and recheck account identity; recognized legacy hockey backups remain readable.

## Evidence and practical limits

Actual results are in `docs/ENGINE_VALIDATION.json`, `docs/SMOKE_TEST_REPORT.md` and the raw audit files. The smoke report distinguishes offline browser tests, modeled career checks and mocked cloud-account tests.

This remains a single-player management simulation. Full engine truth necessarily exists in local memory and exported saves; UI scouting protection is not server-enforced secrecy against somebody editing their own save or inspecting developer tools. Published ratings are preserved and unpublished attributes remain estimates. The shot probability model is hand-calibrated and conditional on a shot reaching the goal; it is not a fitted public all-attempt xG model.

Farm competition is a weekly development abstraction, not a full AHL/CHL/NCAA league. Imported salary/service/bonus details are incomplete; equal annual base salary is explicitly assumed until a schedule is supplied. LTIR eligibility/relief, 35+ exceptions, buyout windows, salary retention/bonus allocation across trades, arbitration and the new playoff dressed-roster cap still have CBA simplifications. Do not describe the game as CBA-complete. All browser storage remains subject to its actual quota; export is retained. Safari, Firefox and physical-device coverage are not claimed.
