# Rink GM NHL simulation rebuild — install handoff

This is the complete game with the 16 October 2026 simulation rebuild. The source patch is based on `EvanDAmours/Rink_GM` main commit `a421a967fef034faef7621d55f519cb0ea958a1f`.

GitHub branch creation was rejected with HTTP 403, `Resource not accessible by integration`. The repository and published website were not changed. The download provides the complete source, current playable desktop/mobile builds, an apply-ready source patch, and reproducible validation reports.

## Play the downloaded game

Open `Rink-GM/PLAY-RINK-GM.html` in a desktop browser after extracting the ZIP. `Rink-GM/prebuilt/index.html` and `Rink-GM/prebuilt/mobile/index.html` are current self-contained website entries. Saves stay in the browser; export/import transfers an existing franchise. Local files and the deployed website use different browser storage origins.

## Apply to GitHub

Give the ZIP to a coding agent that has write access, with this prompt:

> Apply this completed NHL simulation rebuild to https://github.com/EvanDAmours/Rink_GM on a new branch. Read ENGINE_REBUILD_HANDOFF.md and docs/SIMULATION_AUDIT.md. The patch is based on main commit a421a967fef034faef7621d55f519cb0ea958a1f. Preserve any later unrelated repository work. Apply simulation-rebuild.patch with git apply --3way, or import the supplied Rink-GM source when the repository matches that base. Do not recreate the game. Run npm ci, npm test, npm run test:render and npm run build:pages. Keep the existing Pages workflow and /mobile/ entry. Review the included audit JSON. Open a PR with the changes; publish only within the authorization available in that session. Verify actual deployment URLs before calling the new engine live.

The patch is source-only. If the target repository has changed, inspect conflicts rather than overwriting later work. After applying the patch, rebuild from source; the old repository's standalone/prebuilt HTML files are import snapshots. The **downloaded full package** includes freshly built versions.

## What changed

- Shared event/possession simulation with timed clock and penalty boundaries; no independent final-score lottery.
- NHL scoring and assist ledger, strength/empty-net accounting, minor/double-minor/major handling, queued penalties, delayed calls, regular/playoff OT, shootouts, goalie starts/decisions and idempotent result application.
- Zone exits/entries, dumping and retrieval, cycles, individual passing and puck handling, role-aware shooting, shot-family skills, chance geometry, goalie saves/rebounds, defensive suppression and fatigue.
- Coach deployment, home matching, legal icing changes/timeouts, special-teams units, late tactics, safe goalie pulls, replacement goalies and back-to-back starter selection.
- Live UI uses the engine's manpower and timeout rules. Existing player data, save format, assets and franchise screens remain in place.
- Integration repair for an AI offseason roster blocked from signing a second goalie by a full contract list; core players and movement clauses remain protected.

## Validation and limitations

See `docs/ENGINE_VALIDATION.json` for actual check outcomes and source hashes; `docs/SIMULATION_AUDIT.md` summarizes methods, measured NHL comparisons and remaining gaps. The raw controlled, positional, calibration-season and separate-seed results are included.

Position checks change one attribute group while keeping the surrounding roster fixed and alternating home/away. Points per 60 separate forward skill from minutes. Goalie save percentage excludes empty nets and shootout goals. The current engine still produces fewer overtime/shootout games than the reference season, and it is not a fitted NHL tracking-data or physics model. Published ratings remain unchanged; unpublished ratings remain estimates.
