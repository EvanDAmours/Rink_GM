# Rink GM franchise expansion — October 2026

Reference: `EvanDAmours/27_Gridiron_GM`, branch `claude/scouting-overhaul`, commit `f0e8f5b7941d79ba334728b6989b5f6de3422932`.
NHL baseline: `d005075a17bbf0a7e65026047764a20b5a1a6913`.

This release implements the next seven gameplay and presentation areas from the previous roadmap, followed by the Arena interface and NHL-logo update described in `UI_REDESIGN.md`. It adapts the football franchise concepts to hockey; it does not merge the NFL simulation, positions, awards or private services into the NHL codebase. The remaining work is primarily data completeness, CBA fidelity, presentation polish and broader platform validation.

## Implemented feature map

| Roadmap area | NHL implementation | Scope |
| --- | --- | --- |
| Schedule | Bundled 2026–27 calendar: 1,344 games, 84 per club, 42 home; dates, times, arenas; NHL refresh and validated JSON import | Snapshot from a pinned calendar repository; future seasons are generated NHL-format schedules |
| Scouting | Four scout jobs; OHL, WHL, QMJHL within CHL, NCAA, USHL/NTDP, Liiga/Finland, Sweden, Russia, Central Europe; area visits and sleeper tracking | Positional reports and regional budgets are separate; estimates stay hidden until appropriate scouting |
| Draft | Seven rounds, 280 prospects, ordered queue, combine/interviews, public mock, trade-up/down packages, comparison cards, pick reveal and saved paused clock | 224 selections; AI and clock expiry use the same draft engine |
| Future classes | Two later-year 60-player watchlists whose identities carry into the generated class; draft-class import | Small verified 2027/2028 identity set; remaining identities fictional; all ratings/rankings simulated |
| Pick conditions | Top-3/5/10 first-round protection, following-year first reserved, automatic lottery resolution; compensation pick locks | Trade UI offers top-10; arbitrary games/points-based conditions are not implemented |
| Contracts | 50 signed contracts, 90 reserve players, age/service RFA status, jurisdiction-based unsigned rights, age-based ELC terms/slides, qualifying offers, arbitration, seven-day offer sheets | Stateful gameplay rules; salary bonuses, precise historical service and exceptional CBA cases are not complete |
| Waivers | Exemption table by first signing age, service and NHL games; next-day claims, standings priority, clearing and assignments; recall delay | Imported service estimates are marked; recall delay approximates an AHL game rather than simulating its calendar |
| Cap transactions | Buried AHL cap charges, retained salary, limits on retaining clubs/slots/percentage, NTC/NMC destination consent, LTIR designation and activation | Flat AAV model; LTIR unused-space offset and minimum absence; no daily cap accrual or full playoff dressed-roster cap model |
| Agents | Counteroffers, four discussion rounds, player preferences, pending bids, AI competition, reserved offer budgets, tracker and withdrawal | Free-agent bidding settles after two simulated FA days; quick re-signing remains available |
| Extensions | Final-year future contracts activate once after the draft; projected future payroll includes retained/dead charges | Current cap hit remains unchanged until activation |
| Coaching | Verified 2026 head-coach names for new real leagues; assistant and goalie coach jobs, hiring, scheme fit, PP/PK/goaltending effects | Coach attributes, ages and assistant identities are estimates/fictional; existing saved coaches are preserved |
| Development | Individual focuses/camps, line familiarity and complementary chemistry, NHL usage-based growth, eight-week position courses, preseason camp battles | Effects deliberately bounded; automatic promotions obey recall/cap/contract rules |
| Farm decisions | AHL, junior, college and Europe assignments, top/middle/depth roles, weekly production and development, seasonal farm archive | Development abstraction; no full AHL/CHL/NCAA league schedule; CHL/NCAA eligibility simplified |
| GM career | Owner personalities/goals/reviews, optional firing, five job offers, offseason club changes, job history, coach tenure and AI carousel | Dismissals off by default; fired GMs must take a job before another season |
| Arena & fans | Separate arena income/cash budget, training/medical/fan facility levels, fan support, division rivals and weekly rivalry/hot-player/owner stories | Facility dollars never change NHL player cap space |
| Awards | Hart, Art Ross, Richard, Norris, Vezina, Calder, Selke, Conn Smythe, Ted Lindsay, Lady Byng, Jennings, Jack Adams, Presidents' Trophy | Simulation-based selection/voting approximations |
| History | Season stat/standings archive, single-game/season/career records, franchise records, named retirement archive, Hall of Fame after three years, retired numbers, Cup newspapers and championship roster | Simulated careers begin at franchise creation; original Ottawa Senators kept separate from current Ottawa |
| Historical championships | Checked 1927–2026 NHL-era Cup winners and selectable franchise banners | Not a complete historical player-stat database or all pre-1927 challenge-era championships |
| Events | Late-December under-20 international round robin; February All-Star national-team 3-on-3 round robin; stored rosters/results | Original showcase formats; known nationalities used, fictional depth labelled; no claim of official IIHF/NHL event rosters or formats |
| Presentation | Interactive WebGL silver Stanley Cup in trophy room/loading overlay, SVG fallback, original team-inspired jerseys and live-rink jersey numbers, animated pick reveals | 32 bundled NHL CDN marks plus original jersey/illustration assets; no real player headshots; reduced motion respected for Cup/reveal |
| Mobile | Grouped shell, phone selector/shortcuts, roster filters, keyboard search, club inbox, table density and accessible dialogs | Chromium desktop and 390px phone viewport tested; Safari/Firefox/native device coverage pending |
| Saves | Existing autosave/export/cloud hooks plus three manual slots; migration adds new systems without replacing played schedules, traded picks or hired staff | Long careers remain subject to browser quota; portable export retained |

## How to use the new systems

- **Hockey Operations → Roster & rights:** waive/assign players, make claims, manage LTIR, qualify RFAs, accept QOs, arbitrate, assign jersey numbers and request clause consent.
- **Agents & offers:** submit/counter contracts, follow pending bids, submit offer sheets, match incoming sheets or decline for compensation.
- **Development:** hire assistant/goalie coaches, review chemistry, start position training, run preseason battles, choose prospect assignment and role. Individual focuses and head-coach hiring remain in Front Office.
- **Career & arena:** enable owner dismissals if desired, choose offseason jobs, review tenure and upgrade facilities using arena cash.
- **Events & legacy:** play date-gated showcases, inspect Hall of Fame/number retirements and read championship editions.
- **Draft lab:** compare up to three prospects, review future identities, outcomes and pick conditions, or import a class before scouting begins.
- **Trade:** choose salary-retention percentages for selected signed players and top-10 protection for an original first with an available following-year first.
- **Trophy Room / Record Book:** switch clubs to inspect historical banners, simulated honours and franchise records.

## Evidence and data limits

- Schedule announcement: https://www.nhl.com/news/nhl-announces-2026-27-regular-season-schedule
- Schedule snapshot: `src/data/schedule2026.json` pins the upstream calendar commit and NHL API provenance. Published opening night is September 29, closing date April 10; matrix is 28 division / 24 other conference / 32 interconference games per club. Official API/PDF access returned 403 during snapshot work. Reschedules require refresh/import; failed refresh preserves fixtures. Deadline remains the game's approximation at 78% of the calendar.
- Head coaches: `src/data/realCoaches.js` includes the primary NHL source. Existing saved generated/hired coaches are not overwritten.
- Verified prospect identities and primary links: `src/data/realProspects.js`. This is six named prospects across two years, not a full verified 280-player real class. Their attributes, rankings, generated biography details and statistical output are fictional. User class import permits a deeper externally sourced dataset.
- Historical Cups: https://www.nhl.com/news/topic/nhl-awards/nhl-stanley-cup-champions-winners-complete-list-287705398
- CBA/MOU: https://www.nhl.com/cba/ and https://cdn.nhlpa.com/img/assets/file/NHLPA-NHL-MOU-June-27-2025.pdf
- Imported roster service, nationalities absent from the source, birth-date exceptions, NHLPA agent representation, real NTC lists and prior career stats are incomplete. The game estimates service, uses deterministic fictional agents, and excludes unknown nationalities from authentic-name showcase selection. Fictional replacement depth is explicitly identified.
- Offer-sheet bands use the published 2026 compensation table; later thresholds are gameplay projections indexed to the cap, not verified annual NHL figures. Arbitration eligibility/outcomes are simplified. QOs use flat AAV as a proxy for salary.
- Buyouts retain the existing simplified one-third dead-cap calculation; detailed salary/bonus schedules, 35+ rules, injured-player buyout windows, daily cap accrual, real arbitration elections/hearings, partial no-trade lists and all CHL/AHL exceptions need additional work before calling the game CBA-complete.
- No optional paid/network/private Madden services were brought over. Core play stays offline. Full real prospect classes, verified service/salary ledgers, event schedules/rosters and ongoing schedule updates remain data work.

## Compatibility

Save version/key remain v1. Migration adds hockey rules, staff, future classes, career, arena, honours and jersey fields while preserving played fixtures, legacy date origins, pending extensions, running draft ownership, scouting reports and already-hired coaches. Pick inventory extends five future seasons to support offer-sheet compensation and protection. A paused pick clock survives navigation and compressed export. Old retirement rows without player IDs are preserved as existing history; they are not fabricated into new Hall candidates.

## Validation

Commands: `npm test`, `npm run test:render`, `npm run validate:rosters`, `npm run build:artifact`, `node scripts/dynasty-smoke.mjs`.

- 60 engine tests: original simulation/deadline/scouting/schedule/extension checks plus contract limits, ELC slides, waivers, burial, LTIR, retention, NMC, RFAs, offer-sheet transfer/matching/locks, compensation, agents/budget, assignments, position training, staff effects, farm growth, chemistry, watchlists/imports, pick protection, arena finances, jobs, Hall/jerseys, exhibition isolation, geometry and save migration.
- Five consecutive seasons reached 2031 preseason with single ownership, valid AI rosters, contract/reserve limits, season/draft/retirement archives and compressed reloads.
- Sixteen major screens, five additional Hockey Operations views and five dashboard phase branches rendered via Vite SSR (26 cases). Production and self-contained builds, original 797-player roster validation and whitespace checks passed.
- Actual headless Chromium: all six operation tabs, camp and facility actions, other major navigation, desktop WebGL rendering with zero GL errors, pause/resume, 390px mobile navigation and zero outer-page overflow, and unavailable-WebGL SVG fallback passed. No JavaScript page errors in the tested flows. Live-game completion with animated jersey numbers, manual save-slot UI, and a seeded draft clock preserved across navigation also passed.
- Broader browsers/devices, visual regression/performance budgets and exhaustive career/player/cap edge cases remain future validation. WebGL has a functional fallback; shader/geometry appearance is an original approximation of the Cup.

## Interface and asset update

See `UI_REDESIGN.md` for the complete design update, 32 logo provenance, bundled typography, interface controls and latest browser checks. The standalone game includes its logos/fonts and proper phone viewport metadata.

## Optional browser checks

`npm run test:browser` runs `scripts/browser-smoke.cjs` against the built standalone artifact. It requires a locally installed Playwright and Chromium browser; they are optional QA tools rather than application dependencies. Run `npm run build:artifact` first. `CHROMIUM_EXECUTABLE_PATH` can point to an existing Chromium installation. Run `NHL_QA_DIR=/absolute/qa-directory npm run test:dynasty` first and reuse that environment variable for browser checks to include the seeded draft-clock scenario. Screenshots/logs are internal test outputs.

Verified here with Playwright 1.62.1 and headless Chromium 138 at 1440×1000 and 390×844. This supplements engine and SSR checks; it does not certify native devices or other browser engines.

## Delivery

The source archive includes the complete project, playable single HTML file and an applyable patch against the original NHL baseline. GitHub write access is still unavailable: branch creation returned `Resource not accessible by integration` (403), and direct Git had no write credentials. No remote branch, pull request, merge or deployment is claimed. Local commits and updated downloadable source are the delivered code.
