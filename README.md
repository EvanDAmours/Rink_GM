# Rink GM — complete NHL franchise game

A brighter hockey clubhouse now uses warm off-white and ice-blue panels, navy text and orange accents, with team-color illustrations, clearer actions, larger text and phone navigation. Text size, density and reduced motion are configurable in Settings.

The NHL simulation and franchise systems were rebuilt on 16 October 2026. Hockey Operations → Planning & analysis adds match reports, shared roster priorities, opponent plans, prospect readiness, commitments and daily cap ledgers. Live games now support exact checkpoint recovery. Read [the whole-game smoke and data-isolation report](docs/SMOKE_TEST_REPORT.md) and [the installation handoff](ENGINE_REBUILD_HANDOFF.md). Read [the simulation audit](docs/SIMULATION_AUDIT.md) for scoring rules, player and coach behaviour, position-specific tests, measured league rates and remaining limits. Editable source, bundled player/team data, tests and deployment setup are included. [CLAUDE_HANDOFF.md](CLAUDE_HANDOFF.md) describes the original import package.

For a no-terminal upload walkthrough, read [UPLOAD_TO_GITHUB.md](UPLOAD_TO_GITHUB.md).

## Play immediately

To play this download, open `PLAY-RINK-GM.html` on your computer. Current desktop/mobile hosting entries are in `prebuilt/`. GitHub Pages automatically tests and builds the editable source after you upload it using the guide. This download includes freshly built `PLAY-RINK-GM.html` and `prebuilt/` desktop/mobile entries with the complete update. The source-only patch requires rebuilding those entries after application. Browser saves are local; export/import a franchise to transfer it between devices.

## Develop and build

Use Node.js 22 or later. Run commands in the directory containing this README and `package.json`:

```bash
npm ci
npm test
npm run test:render
npm run test:visibility
npm run build:pages
npm run dev
```

`npm run build:pages` produces `dist/index.html`, its bundled assets, `dist/rink-gm.html` (one-file game), and `dist/mobile/index.html` (one-file mobile entry). `npm run dev` runs Vite and the local NHL schedule endpoint. Source is in `src/`, with backend schedule logic in `server/`.

## GitHub Pages

The supplied `.github/workflows/pages.yml` installs dependencies, runs the tests, builds desktop/mobile entries and deploys `dist/`. Import the contents of this package into the **repository root**, not inside another `Rink-GM/` wrapper folder. Set the repository's **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. Publish from `main` or run the workflow manually. Keep `.github/` when copying the source.

Expected addresses after a successful deployment:

- Desktop: `https://evandamours.github.io/Rink_GM/`
- Mobile: `https://evandamours.github.io/Rink_GM/mobile/`

These are intended destinations, not a claim that GitHub Pages is already live. Desktop and mobile use the same responsive game and share saved franchises in the same browser on the same origin. They do not automatically sync saves across devices.

For a single-file deployment of the current engine, build first and publish `dist/rink-gm.html` or `dist/mobile/index.html`. GitHub Pages Actions already builds from source.

## Included game

- 32 NHL clubs with official CDN logos and 797 real roster identities, plus fictional-league mode.
- 300 complete public EA NHL 27 ratings profiles, mapped published attributes and approximately 690 usable ESPN jersey numbers; unavailable ratings/numbers remain identified as estimates/game assignments.
- NHL-style 84-game seasons, standings, playoffs, NHL awards, franchise records and historical Cup banners.
- Shared live/quick simulation with attribute-driven possession, shots, saves, faceoffs, assists, penalties, tactics, special teams, goalie rotation, chemistry and shift endurance.
- Seven-round draft with 280 prospects/224 selections, positional and regional scouting, CHL/NCAA/Liiga/European coverage, combine/interviews, watchlists, mock draft, trades and an optional clock.
- Trades, cap management, retained salary, protected picks, contracts, agents, waivers, LTIR, RFA rights, offer sheets, farm assignments and development.
- Coaches, owner reviews, GM careers/jobs, arena finances, Hall of Fame, retired numbers and showcases.
- Autosave, manual slots, export/import, roster filters, search, inbox, responsive phone controls and larger record/scouting displays.
- Bright silver Cup, improved sweater artwork, removed title/loading rotation buttons, hidden head-coach ages and injury controls on the menu/in game. Disabling injuries heals everyone and clears LTIR. Automatic roster handling reviews any required waiver assignments before settlement.

The exact feature inventory and simplified rules are documented in [FEATURE_PARITY.md](docs/FEATURE_PARITY.md). This is a working management simulation, not a claim of complete real-world CBA fidelity or perfect NHL prediction.

## Gridiron GM look and club pulse

Rink GM uses the presentation and franchise "pulse" of the companion Gridiron GM football game, adapted to hockey:

- A dark, dense layout: a status-line header (record, cap space, Season Points, morale, chemistry, GM reputation, owner), a GM reputation strip, an uppercase tab bar, a season-stage strip (preseason, one box per week, playoffs, combine, draft, re-sign, free agency) and a card-grid **GM Dashboard**.
- **Season Points (SP):** 2 a week during the season, more with a strong reputation and happy fans, plus playoff and Cup bonuses. Spend them on team meetings, bonding trips, fan nights, owner lunches or extra scouting.
- **Morale and chemistry** for every club, moved by results, streaks and roster turnover, and read (with small, bounded effects) by the game engine for both teams.
- **GM reputation** tiers (Rookie, Veteran, Respected, Elite, Legend), **press conferences** and **locker-room speeches** after games, power rankings, playoff odds, roster grades, franchise history and achievements in the **Hub**.
- Settings → Table density: *Compact* is the classic dense look; *Comfortable* gives larger controls.

## Data and simulation documentation

- [PLAYER_DATA.md](docs/PLAYER_DATA.md): EA/ESPN sources, identity matching, estimated coverage and save migration.
- [SIMULATION_AUDIT.md](docs/SIMULATION_AUDIT.md): model changes, repeatable experiments and limitations.
- `docs/simulation-audit-results.json`: 8,000 controlled matchup games, with win-rate confidence intervals.
- `docs/season-audit-results.json` and `docs/season-audit-holdout-results.json`: two separate 1,344-game fixed-roster seasons.
- `docs/positional-audit-results.json`: causal forward, playmaking, defense, goalie and faceoff comparisons.
- `docs/nhl-calibration-2025-26.json`: official NHL API data used for league-rate comparison.
- [UI_REDESIGN.md](docs/UI_REDESIGN.md): visual system, bundled fonts/logos and accessibility.

The current regression results are recorded in `docs/ENGINE_VALIDATION.json`. The rebuilt engine was checked with 14,000 controlled/positional audit games and two 1,344-game season validations. Desktop/390px live gameplay, saves and navigation passed with zero JavaScript errors. Run `npm test` for regression checks and `npm run test:simulation`, `npm run test:positions`, or `npm run test:season` for statistical checks. See the audit for measured results and browser validation. Detailed browser smoke tests require a separately supplied Playwright/Chromium environment; the script supports environment-variable paths. For the phase fixtures, first run `NHL_QA_DIR=tmp/browser-qa DYNASTY_SEASONS=1 npm run test:dynasty`, then `node scripts/prepare-browser-fixtures.mjs`, then `npm run test:browser` with Playwright/Chromium configured. `DYNASTY_RESUME=1` resumes a career audit from its saved checkpoint. Nothing in this package depends on the previous agent's scratch paths at runtime.

## Live NHL schedule access

`server/nhlSchedule.js` downloads and validates league-wide NHL fixtures. Vite serves it at `/api/nhl/schedule?season=2026` in development/preview. A production server can expose the same endpoint to avoid browser CORS restrictions.

**GitHub Pages is static and cannot run this backend.** Its game tries direct NHL access and, if blocked, uses the clearly labelled bundled 2026–27 calendar. That fallback is not a live refresh. User-imported/previously verified calendars are preserved on failed refresh. To guarantee server-mediated live refresh, Claude must also deploy the provided schedule helper on a compatible server/Worker and integrate that endpoint; the frontend should retain its honest fallback. Do not use an untrusted public CORS proxy.

## Refresh source data

```bash
npm run refresh:players  # Python 3 standard library; EA/ESPN access needed
npm run refresh:logos
npm run refresh:schedule
npm run validate:rosters
```

Refreshing is optional for publication. Already bundled data makes the existing build playable offline. Published EA attributes are imported verbatim and retain EA's overall via a baseline offset; the game's generated OVR model is not EA's proprietary formula. Franchise development can subsequently change values. Established saves preserve development/custom edits; Settings offers an explicit baseline update for unsourced real players.

## About this project

The NHL game used the owner's Gridiron GM branch as a feature reference while retaining hockey-specific rules and simulation. It is a separate hockey codebase. This is a non-commercial fan project, not endorsed by the NHL, NHLPA, any club or EA. Team marks, data sources and font licenses are included with attribution.
