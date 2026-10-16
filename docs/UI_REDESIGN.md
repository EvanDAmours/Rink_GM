# October 16 clubhouse follow-up

The current interface supersedes the earlier dark arena palette described below. It uses warm off-white pages, white and ice-blue panels, navy text, orange actions, and each club's real identity colors. The dashboard adds a roster-driven illustrated club spotlight, fan-support pulse and contextual next moves. The illustration uses bundled SVG code and reveals only your own club's known player identity/rating.

Tables and controls have larger type and clearer focus states. Settings offers standard/large text, comfortable/compact density, and reduced motion; system reduced-motion preferences are also honored. Phones keep the full navigation selector and add persistent Home/Roster/Draft/Club office shortcuts. Game plans and reports have their own navigation link. Action feedback uses an accessible live status message.

Whole-screen rendering, keyboard interaction, real desktop/390px browser navigation, no outer phone overflow, live recovery, the settings controls, and offline bundled logos/fonts are covered by the current smoke scripts. The dashboard, planning/report screens, and phone draft were visually reviewed. See `SMOKE_TEST_REPORT.md` and `ENGINE_VALIDATION.json` for actual outcomes and platform limits.

The remainder of this document records the earlier interface milestone.

---

# Rink GM — Arena interface update

This update keeps the existing franchise engine and replaces the presentation and management interface with a coherent arena design system.

## Team identity

All 32 current NHL team marks were downloaded from the NHL's official asset CDN:

`https://assets.nhle.com/logos/nhl/svg/{ABBR}_dark.svg`

Original SVG files and their source URLs, retrieval timestamps and SHA-256 hashes are in `src/assets/team-logos`. All images are embedded into the production bundle and standalone page, with a team abbreviation fallback. Display viewports trim the CDN's unused thumbnail margins while retaining a protective border; the original vector artwork is unchanged on disk. Crop metadata is used only while its hash matches the current asset manifest.

Team marks appear in the franchise chooser, club shell, dashboard, fixtures, standings, brackets, league tables, profiles, search results, and team-inspired jersey illustrations. Utah uses the Mammoth mark. These assets do not make Rink GM an official or endorsed NHL game; NHL/team marks remain their owners' property. The existing fan-game notice is retained and updated.

## Design system

- Midnight arena palette, icy highlights, club accents, restrained championship gold, stronger data contrast and a consistent panel hierarchy.
- Bundled Manrope body typography and Barlow Condensed sports headings; font provenance and OFL licenses are included. Font loading does not require Google Fonts or another network service.
- Original SVG navigation icons, comfortable and compact data spacing, sticky player-name columns, visible keyboard focus and stronger touch controls.
- Shared styling across franchise, scouting, trades, contracts, standings, history, trophies, operations and live games.
- Proper standalone viewport/charset metadata for real phone browsers. Assets remain embedded in the single HTML export.

## Rebuilt flows

**League creation:** a trophy-led introduction, real team crests, East/West filters, roster-strength tiles, selected-club summary, quick franchise creation, roster mode and difficulty controls. New franchises start at the top of their dashboard after creation.

**Clubhouse:** a large club hero, record/division context, executive roster/cap/owner metrics, an opening-night or live match centre, recent/upcoming games, playoff/offseason states, actionable GM briefing, division picture, club leaders, franchise cornerstones and NHL news.

**Shell:** grouped club/competition/market/legacy navigation, phase/date context, active-screen state, a club inbox indicator and responsive phone navigation.

**Quick search:** Command K / Control K or the search button opens players, clubs and screens. Arrow keys select a result; Enter opens it; Escape closes the dialog. Unscouted prospect results show identity, position and draft status without exposing hidden ratings.

**Roster:** a club summary, text and position filters, player identity cells, sortable stats and contract tables, and clearer recall failure feedback. Table density is configurable in Settings and saved with the franchise.

**Activity:** a dedicated news/inbox/transactions screen preserves access to all club messages and transaction history. Search filters updates; relevant inbox items link to management screens. Opening the inbox marks current messages read locally.

**Dialogs:** Escape dismissal, modal labelling, focus trapping and return to the previous control. Sortable table headings support Enter/Space and communicate sort direction.

## Validation

- All 60 existing engine/franchise tests passed; the simulation engine was not changed by this interface update.
- Sixteen major screens, five additional Hockey Operations views and five dashboard season-phase branches rendered: 26 SSR cases.
- The production and standalone builds passed, as did the 797-player roster validator and patch whitespace checks.
- Actual headless Chromium verified all 32 loaded logo images, East/West filters, new-franchise scroll reset, player search, profile opening, modal focus/Escape, roster search and keyboard sorting, club activity, table density, all six operations tabs, camp/facility actions, manual saves, live game completion, saved draft clocks and 3D/SVG Cup fallback.
- A 390px phone viewport was checked for navigation and outer-page overflow. Additional visual checks covered the main roster, lineup, scouting, operations, standings and trophy screens.
- The tested standalone workflow made no HTTP(S) requests: its logos, fonts, styles and scripts were local/embedded. Optional NHL schedule refresh and existing viewer cloud hooks remain explicit connected features.

Run `npm test`, `npm run test:render`, `npm run validate:rosters`, `npm run build:artifact` and, with a separate local Playwright/Chromium installation, `npm run test:browser`.

`npm run refresh:logos` updates CDN assets as a checked batch. If an asset changes, existing crop metadata is ignored for that logo, leaving its original viewport intact until remeasured. No downloaded artwork is recoloured or replaced by a generated approximation.

Browser/device coverage beyond the tested Chromium desktop/phone viewports remains further validation. Existing CBA/data approximations are documented in `FEATURE_PARITY.md`.

## Readability and presentation follow-up

Player jerseys now show original shaded sweater backs with nameplates, stitched seams, hem/sleeve stripes and numbers; generic club jerseys show the chest crest. Smaller roster/line cards reuse the same artwork. Cup lighting now faces the camera and uses bright silver studio reflections with championship-band detail. Title and simulation overlays omit the rotation control. Body/table/control text and status contrast are larger, scouting/area point budgets are dedicated stat cards, and the banner record is a prominent scoreboard. Phone tables scroll internally, without page-width overflow.
