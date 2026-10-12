# Claude handoff — publish Evan's completed Rink GM

## Copy this prompt into Claude with the ZIP attached

> This ZIP contains my completed NHL franchise game. Import its entire editable source into https://github.com/EvanDAmours/Rink_GM and publish it so I can play from any desktop or phone. Read CLAUDE.md, README.md and this handoff first. Create a working branch, import the package contents into the repository root, run the supplied checks, and finish the GitHub Pages deployment. I want both the main web link and a dedicated /mobile/ link. Preserve all existing gameplay, saves, UI improvements, team logos, sourced EA attributes, injury controls and simulation improvements. The game is already implemented; this is an import/hosting task, not a request for a new prototype. Handle build/deployment problems, verify both published routes, and return the actual working URLs. If repository or Pages authorization blocks an action, tell me the exact required permission.

## Target and current state

- Repository: `EvanDAmours/Rink_GM` (public), default branch `main`.
- GitHub's last observed initial main commit was `315f3258bf216cf7c42daa75402c797129fd4452`. Inspect the current remote before importing; it may have changed.
- Suggested working branch: `claude/rink-gm-launch`. Finish the publication using the user's authorization and the account's available GitHub permissions.
- The final implemented game source commit before this documentation handoff was `2631eb53ecf7a260cd7be7008011a8f922cb769c` in the previous local NHL checkout. This ZIP includes the complete source; that local Git history is not required to run or deploy it.
- No changes reached `Rink_GM` from the prior session. GitHub branch creation returned `403: Resource not accessible by integration` for that connection. The game itself is complete and the new repo is valid.

## ZIP layout

The `Rink-GM/` directory is the project root. Copy its **contents** into the GitHub repository root, retaining hidden `.github/` and `.gitignore` files.

| Path | Purpose |
| --- | --- |
| `README.md` | Human setup, features, deployment and data limitations |
| `CLAUDE.md` | Automatically discovered project instructions for Claude Code |
| `src/` | Complete React UI, hockey engine, assets and data |
| `server/nhlSchedule.js` | Validated NHL schedule backend helper |
| `tests/` | 70 engine/franchise/data/quality regression checks |
| `scripts/` | Builds, data refresh, render and statistical audits |
| `.github/workflows/pages.yml` | Tested build command and Pages publication workflow |
| `package.json`, `package-lock.json`, `vite.config.js`, `index.html` | Reproducible Vite/React project |
| `docs/` | Feature map, data provenance, UI notes and simulation evidence |
| `PLAY-RINK-GM.html` | Ready-to-play single-file game |
| `prebuilt/index.html`, `prebuilt/mobile/index.html` | Ready-built static desktop/mobile website |
| `RELEASE_MANIFEST.json` | File hashes, source provenance and validation record |

Dependencies and Git metadata are excluded. Install dependencies with `npm ci`; no password, token or prior machine state is needed to build the game.

## Publication sequence

1. Clone/open the target repository with an authenticated account that can write code and workflows. Create the working branch from current `main`.
2. Import the project contents into the repository root. Replace the generated placeholder README with this project's README; preserve unrelated additions if the repo has changed.
3. Use Node.js 22+, run `npm ci`, `npm test`, `npm run test:render`, and `npm run build:pages`.
4. Confirm that `dist/index.html`, its assets, and `dist/mobile/index.html` exist. The mobile page is self-contained and does not depend on `../assets` paths.
5. Push the source/branch and complete the authorized PR/merge or main publication workflow. Default-branch publication is configured for `main`; a manually dispatched workflow can also publish a selected ref.
6. In repository Settings → Pages → Build and deployment, select GitHub Actions. The owner may need to do this if your token lacks Pages administration rights. Run/wait for Deploy to GitHub Pages and inspect any failure logs.
7. Open and verify both deployed routes: franchise creation, roster/profile, scouting, settings/injury toggle and navigation. At phone width, verify taps, internal table scrolling, no page-width overflow and the visible banner record.
8. Confirm save/resume on the same browser. Return the actual live URLs and summarize any remaining hosting limitation.

Expected URLs **after deployment**: `https://evandamours.github.io/Rink_GM/` and `https://evandamours.github.io/Rink_GM/mobile/`. GitHub Pages adds the repository path; do not accidentally publish an app that only works at a domain root.

If Actions builds are unavailable, the contents of `prebuilt/` can be deployed as a static Pages site. Keep source code in the repository so future changes can be rebuilt.

## Preserve these implemented changes

- All 32 official NHL CDN SVG team logos and local font files; standalone pages embed them.
- Bright polished-silver WebGL Cup with accessible SVG fallback. No rotation button on the title or simulation overlay.
- Shared higher-quality sweater artwork with sourced numbers, nameplates, shading, seams and stripes.
- Improved text size/contrast, larger banner record and prominent scouting/area-point budgets; head-coach ages removed from display.
- Main-menu and in-game injury controls. Turning injuries off immediately heals every player and clears LTIR, while normal roster/cap limits remain.
- Automatic roster handling by low OVR/positional surplus with minimum healthy depth. Required waivers are shown for review; approved automatic handling resolves claims without skipping fixtures. Never silently waive NMC players or remove stars to solve a contract-count limit.
- Data migration, manual save slots, export/import, compressed browser storage and error handling.
- The expanded draft, scouting, trade, agent, rules, development, coaching, career, finance, event, history and trophy systems listed in `docs/FEATURE_PARITY.md`.

## Ratings and number acceptance checks

The bundled EA snapshot contains all 300 published profiles available when checked on 12 October 2026, not official individual ratings for all 797 roster identities. ESPN provided 810 numbers across 32 team rosters; approximately 690 matched numbers are usable in this game's roster after identity/team/conflict checks. Other values remain estimated or game-assigned.

A new real-roster Edmonton franchise must show Connor McDavid at number 97, 99 OVR and slapshot power 92. Published values must remain exact before franchise development. Unpublished attributes, fictional prospects and contracts should not be presented as official EA/real-world values. Existing developed/custom saves should not be silently reset.

The optional EA ability names are stored as data; not every EA ability is implemented as a separate simulation modifier. Source and refresh instructions are in `docs/PLAYER_DATA.md`.

## Simulation work already completed

The live and quick engine is attribute-driven. Shooting families use their own power/accuracy; goalies use save/recovery skills; passing affects chance quality and assist credit; endurance affects long shifts; assigned centers take even-strength draws. Live commentary uses a separate random stream, verified over 30 identical seeded live/quick games. Unfinished games do not receive an arbitrary coin-flip winner.

The final regression suite passed 70 tests. The recorded controlled audit ran 1,500 games in each of eight scenarios (12,000 total), with alternating home/away and fixed rosters:

- Equal 82-rated clubs: approximately 49%/51% wins.
- 86 vs 80 skaters with equal goalies: approximately 77% wins for the stronger club.
- Better goalie, shooting-accuracy and shooting-power scenarios each produced clear advantages.
- Elite first-line scorer: approximately 2.29 goals/60 vs 0.61 for his linemates.

A separate fixed-roster 1,344-game season averaged 2.96 scoreboard goals and 28.4 goalie shots per team/game, with a .899 save percentage. Scoreboard goals include the shootout deciding goal; goalie shots exclude empty-net attempts. This is evidence of skill sensitivity and plausible aggregate output, not a promise of perfect prediction. The extreme 92-vs-72 synthetic roster test is not a typical NHL team matchup.

Reproduce the documented statistical checks if gameplay changes are necessary:

```bash
NHL_AUDIT_GAMES=1500 npm run test:simulation
npm run test:season
```

Read `docs/SIMULATION_AUDIT.md` and both JSON reports before changing balance. Do not replace the audited engine with independent random scores or make simulation changes solely to work around a deployment problem.

## Important hosting boundary: NHL refresh

The Vite dev/preview middleware can run `GET /api/nhl/schedule?season=2026`, backed by `server/nhlSchedule.js`. A real production server/Worker can run the same helper to avoid NHL browser-CORS restrictions. **Static GitHub Pages cannot execute that endpoint.**

On static Pages, the existing game tries the NHL API directly, then explicitly labels its bundled 2026–27 calendar fallback when access fails. That is playable but not a guaranteed live refresh. User-imported or previously verified calendars survive failures.

If the user's desired website requires reliable live refresh, also deploy the helper to a compatible server/Worker, implement a validated endpoint and explicitly configure the frontend's service URL/CORS for this Pages origin. Test an actual live response plus the blocked-upstream path; preserve a clear fallback message. No database or franchise-upload endpoint is required for this game. Do not claim the dev-only middleware is hosted by GitHub Pages.

## Saves and cross-device expectations

The main and mobile routes share browser localStorage on the same origin. Different devices do not share localStorage. Export/import transfers a save. `src/platform.js` contains optional platform cloud-save hooks, which may be unavailable on ordinary GitHub Pages; do not describe them as automatic GitHub cloud synchronization. A new account/database service would be separate work requiring explicit design and authentication.

## Validation before reporting completion

- Publish the completed program rather than a generated replacement/demo.
- Pass engine tests, screen rendering and a fresh source build after any source changes.
- Verify the real GitHub Pages URLs and inspect the resulting workflow status.
- Check a new Edmonton franchise, McDavid's baseline data, injury-off healing, roster handling, visible scouting points and phone layouts.
- Report any blocked repository/Pages authorization and any remaining live-refresh limitation plainly.
