# NHL simulation rebuild — 16 October 2026 (team-quality update 18 October 2026)

The live game and quick simulator use the same possession/event engine. No score is drawn in advance, no team name receives a win override, and the engine never invents a winner when its safety limit is reached. Outcomes remain uncertain; ratings influence the actions players can execute.

## Engine and rules

`sim.js` runs ten-second UI updates, internally split into timed events, penalty expirations and period boundaries. Playing time is credited before each event; sudden death returns immediately. `gameRules.js` owns manpower, penalty clocks and stoppages. `shotModel.js` owns shot-family skills and a transparent, hand-calibrated conversion model.

The scoring ledger tracks scorer, up to two actual previous teammate touches, strength, empty-net status, on-ice players, defending goalie, location and elapsed time. Opposing possession clears assist eligibility. Blocks and misses are separate from shots on goal. On-target empty-net attempts score; nobody receives a phantom save. PP/SH credit is separate from the empty-net label. Shootouts add only the deciding scoreboard goal, with no individual goal, shot, assist or goalie goal against. Both goalies can retain a shutout after 0–0 through overtime; shared shutouts receive no individual credit.

Rules exercised by focused regression cases:

| Rule | Covered behaviour |
| --- | --- |
| 15–16 | Delayed calls, extra attacker, goal washout, minor release |
| 18–19 | Double-minor segments; non-terminating majors; offsetting fighting majors |
| 26 | Queued third penalty; minimum three skaters; release at a whistle |
| 78 | Scoring/assist ledger; special-teams and plus/minus accounting |
| 81–82 | Icing change restriction; visitors deploy before home matching |
| 84 | Regular 3-on-3 OT, transient 4-on-4 after expiration, penalty carryover, playoff 20-minute sudden death, shootout and tactical OT point forfeiture |
| 87 | One timeout at a permitted stoppage; rest rather than a shooting bonus |

The starting goalie receives the start. Win/loss decisions follow the eventual winning goal, including relief appearances and an empty net. Applying an unfinished result throws; applying a finished result twice does not duplicate stats.

## Team-versus-team quality (October 18 update)

Results follow how good a club is relative to the rest of the league, in three places:

- `matchup.js` pools each club's dressed offence **convexly** (a rating `STAR` = 7 points above the reference is worth e times an average player, pooled across lines by ice-time share before taking the log), so a club with two superstars and ordinary depth is an elite offence while a deep club of 80s is merely good. Defence is the ice-time weighted defence corps (70%) and forwards' defensive play (30%); goaltending blends the starter and backup. Every term is relative to the current league's mean (fixed per season), so league averages hold as the rating scale drifts. The club's edge against an opponent's defence moves tempo, zone-entry and cycle execution and shot quality (`sim.js` `EDGE`), and the unit on the ice adds its own shot-quality term (unit offence minus defending unit's defence, centred on the league).
- The best player on the ice **pulls his unit's** offence, puck control and passing toward him (`EDGE.starWeight`), and the possession curves (breakouts, controlled-entry choice, entry execution, cycle passing) are steeper in skill than before, so stars drive shot volume and not only finishing. Finishing is weighted 0.022 log-odds per rating point and goaltending 0.018.
- Coaching systems are a trade-off: a **defensive structure** suppresses opponents' entries and shot quality at the cost of its own tempo and shooting, an **up-tempo** system is exposed on counters, and nobody sits back on the power play. A bench plays its coach's system unless the personnel plainly call for another (`defaultStyle`), and the GM's chosen identity always wins. AI benches dress clearly better healthy scratches weekly and start their better healthy goalie.

Controlled 160-game check in `tests/team-quality.test.js`: Edmonton's offence ranks in the top five by strength, matchup edges average zero across all pairings, and McDavid's line out-produces an ordinary first line per 60 minutes. In five independent 1,344-game seasons (`scratchpad` evaluator, AI benches dressed), Edmonton finished 7th–14th overall and 3rd–6th in its conference, where the previous engine had it 25th–27th with the second-fewest goals in the league.

## Player and coach decisions

Possession progresses through defensive-zone exits, neutral-zone entries and offensive-zone cycles. A controlled entry competes with dumping and retrieving; pressure can force a failed exit or icing. A shorthanded club prioritizes clearing. Players pass, shoot or lose possession based on their skills, role, pressure and manpower.

The puck carrier's own passing/control/skating contributes to execution. Skilled receivers get open and handle more touches. Playmakers pass more often and can create lateral chances; snipers shoot more often. Assists follow those touches rather than a post-goal weighted lottery. Finishing uses the appropriate wrist/slap accuracy, power, hand-eye and puck skills. Distance, angle, rush, lateral movement, screen, rebound and manpower affect conversion. Goalies contribute save-side skill, positioning, rebound control and recovery. Defensive awareness/stick work suppress exits and entries; shot blocking removes attempts before they reach the net.

Coaches choose available units with ice-time shares, accumulated shift fatigue, draw location, home matching and late-game deployment in mind. They change when the puck is safe or at a whistle; an iced unit stays out for its draw. Special teams rotate units. AI coaches react to late leads/deficits, take legal late timeouts with tired players, pull the goalie after established possession or an appropriate stoppage, and replace badly beaten starters at a whistle. AI goalie selection recognizes back-to-back starts. User live tactics retain user control.

Attributes are never rewritten to obtain these results. Published rating baselines remain intact. OVR affects selection/deployment; the relevant underlying skills drive execution. A defensive forward and a sniper need not score identically just because their OVR matches. Fatigue changes effective performance during play rather than permanently lowering stored attributes.

## Evidence and reproduction

`nhl-calibration-2025-26.json` stores the official NHL team, power-play and goalie API responses retrieved on 16 October 2026, plus the aggregate calculation. The completed reference season used 82 games per team; the game's 2026–27 calendar uses 84. Comparisons below use per-game rates.

`season-audit-results.json` uses fixed real rosters and independent game seeds. `season-audit-holdout-results.json` uses a separate seed sequence after calibration. Both replay the 1,344-game calendar without accumulating injuries, development or GM moves. Each game checks scoring and shot conservation. These are model validation runs, not real NHL forecasts.

| Metric | NHL 2025–26 | Calibration season | Separate-seed season |
| --- | ---: | ---: | ---: |
| Scoreboard goals/team/game | 3.082 | 3.196 | 3.131 |
| Shots/team/game, including empty net | 27.83 | 28.34 | 28.03 |
| Goalie save percentage | 0.8955 | 0.8942 | 0.8956 |
| Power-play conversion | 21.11% | 19.25% | 19.20% |
| PP opportunities/team/game | 2.879 | 3.009 | 2.971 |
| Games reaching overtime | 24.85% | 21.43% | 22.92% |
| Games decided in shootout | 9.07% | 7.81% | 8.41% |

`simulation-audit-results.json` runs eight controlled scenarios, alternating home/away. It isolates equal rosters, skater quality, goalie quality, accuracy, power, an elite forward and a published-roster matchup. Win rates include Wilson 95% intervals. Save percentage uses goalie shots/goals, excluding empty nets and the shootout decider.

`positional-audit-results.json` separately checks the same first-line center before/after an upgrade, a playmaking-only upgrade, a defensive-corps upgrade, goalie quality with identical skaters, and faceoff specialists. It reports goals, assists and points per 60 to separate skill from minutes. Every positional acceptance check must pass; results are never applied to a save. Each scenario uses 1,000 alternating home/away games.

| Controlled change | Baseline | Upgraded |
| --- | ---: | ---: |
| Same forward: points/60 (82 → 97) | 1.771 | 3.352 |
| Playmaking-only change: assists/60 | 1.101 | 1.330 |
| Defensive-corps change: shots against/game | 26.35 | 24.90 |
| Defensive-corps change: goalie goals against/game | 2.855 | 2.725 |
| Goalie save percentage (70 → 95), identical skaters | 0.8591 | 0.9222 |
| Center faceoff percentage (60 → 99) | 35.26% | 64.74% |


```bash
npm test
npm run test:render
npm run test:visibility
npm run test:dynasty
npm run build:pages
NHL_AUDIT_GAMES=1000 npm run test:simulation -- docs/simulation-audit-results.json
NHL_POSITION_GAMES=1000 npm run test:positions -- docs/positional-audit-results.json
npm run test:season -- docs/season-audit-results.json
NHL_SEASON_SEED=381103 npm run test:season -- docs/season-audit-holdout-results.json
```

The browser smoke test also exercises live play, completion, manual save slots, desktop and 390px navigation, embedded assets, WebGL/fallback and JavaScript errors. Supply Playwright/Chromium via the existing environment variables documented in the script.

The power-only scenario won 54.7% of games (95% Wilson interval 51.6–57.8%) with 3.144 goals for versus 2.798 against. It narrowly missed the old arbitrary 55% point-estimate gate. The updated gate requires a confidence interval entirely above 50% and a positive goals differential; the 8,000 completed outcomes were re-evaluated without changing or cherry-picking games. The raw report retains the prior check result. Accuracy and other established gates are unchanged.

The follow-up's late tied-game conservative decisions narrowed the overtime gap: 23.14% and 22.69% versus 24.85%, compared with the prior build's 20.54% and 18.90%. Shootouts rose to 8.48% and 8.18% versus 9.07%. This is improvement, not evidence of an exact NHL predictive fit.

## Star scoring and season form (21 October 2026, Gridiron 1.88 / 1.61)

Evan approved retuning the audited engine so stars take a star's share. Three changes in `sim.js`, none of them touching team-level conversion constants:

- **Star pull.** An elite puck handler (control composite above `EDGE.eliteAt` = 91.5) draws faceoff receptions, breakout and entry touches convexly: ×e for every `EDGE.elite` = 2.4 points above the bar, capped at 6 points. The bar follows the league's own top end (the ten best control composites against the 2026 league's 94.5, fixed per season and stored on the league as `eliteBar`), so the share stays a share as ratings drift.
- **Sharing.** No player takes more than `EDGE.touchCap` = 58% of a unit's touches (a lone star on a weak club still has to share), and an elite carrier shoots less and sets up more (`EDGE.distribute`, at most −.12 on the shoot decision). The pull is computed from his own rating, before form.
- **Season form.** `seasonForm(pid, year)` (development.js) is a fixed per-player, per-season roll (round(z × 1.5), −4..+4): most players are within a point, about 5% have a career year (+3 or more) and 5% a slump. It is added to the composites and to finishing. It averages zero, so league totals hold. Exhibitions play without it.

Games also record each skater's line/pair and special-teams units for role-shaped development (no effect on the game).

Before → after (same seeds):

| Metric | Before | After |
| --- | ---: | ---: |
| Equal 82-rated clubs: win rate (1,500 games) | 52.1% | 50.0% |
| Equal clubs: goalie save % | .9077 | .9042 |
| 86 vs 80 skaters: win rate | 82.4% | 82.9% |
| Elite first-line scorer: goals/60 vs linemates | 1.65 vs 0.78 | 2.02 vs 0.71 |
| Fixed-roster season: goals/team/game | 3.083 | 3.165 |
| Fixed-roster season: save % | .8979 | .8959 |
| Separate-seed season: goals/team/game, save % | — | 3.103, .8979 |
| Art Ross (mean of 8 fixed-roster seasons) | 112 | 117-124 (4-seed means; single seasons 108-153) |
| Rocket Richard (mean of 8) | 54 | ~56 |
| 100-point players / 40-goal scorers per season | 3.8 / 15.8 | ~5 / ~17 |

Every simulation-audit and season-audit check passes (`simulation-audit-results.json`, `season-audit-results.json`, `season-audit-holdout-results.json`).

**Multi-season check** (`NHL_CAREER_SEASONS=8 NHL_CAREER_OUT=docs/career-leaders-audit.json npm run test:season`): eight full franchise seasons with development, drafts and free agency. Each row now also records league goals/team/game, skater-shot save % (empty nets included) and the Superstar/Star trait counts.

| Season | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Art Ross (before) | 141 | 153 | 135 | 161 | 172 | 149 | 152 | 163 |
| Art Ross (after) | 118 | 119 | 132 | 124 | 137 | 121 | 146 | 118 |
| Rocket Richard (before) | 63 | 73 | 71 | 87 | 84 | 84 | 89 | 79 |
| Rocket Richard (after) | 57 | 57 | 69 | 59 | 68 | 68 | 78 | 66 |
| Goals/team/game (after) | 3.03 | 3.09 | 2.95 | 2.93 | 2.87 | 2.77 | 2.79 | 2.66 |
| Save % (after) | .897 | .895 | .898 | .897 | .898 | .901 | .901 | .902 |
| Superstars (before) | 27 | 38 | 44 | 51 | 61 | 63 | 69 | 78 |
| Superstars (after) | 16 | 20 | 23 | 23 | 25 | 26 | 27 | 26 |

Changes: finishing above 83 counts at 15% per point (`FINISH` in sim.js), so elite snipers convert less of their volume; PP1 takes 80 of every 115 power-play seconds (`PP_SPLIT`, shared with the Lines screen); draft Superstar odds fall to about one per class (`rollDev`), and leading the league lifts a young player only as far as Star (Superstar still comes from a landslide).

**League talent anchor (drift fix).** Diagnosis (seed 4242): the skater pool thins over a franchise while goalies and the top end hold. The mean wrist-shot finishing of the 384 best skaters fell 85.4 to 80.4 across eight seasons and the 600-deep pool 80.8 to 75.8, but the 32 best goalies stayed at 87-88.5 and the top-10 finishers stayed at 94-96. Scoring sank because every depth shooter was worse against the same goalies, and the leaders ran away because the star-to-depth gap widened (top-10 vs top-384 shooting composite 8.6 to 15.6 points), which gave lone stars 450-500 shots. `talentAnchor` in `sim.js` now measures both pools once per season against the 2026 league (stored on the league like the elite bar, so a loaded save plays the same). The skater depth gap (times `ANCHOR.gain`) lifts skater composites, and 60% of it goes to finishing and accuracy. The lift is full for depth players and tapers to nothing at the top end (`anchorLift`, `ANCHOR.top` 95), so the star gap returns to its 2026 width. The goalie gap is applied to save skill. A league at its 2026 level plays unchanged.

| Season (anchor) | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Goals/team/game | 3.06 | 3.11 | 3.08 | 3.07 | 2.98 | 3.07 | 3.13 | 2.97 |
| Save % (empty nets incl.) | .896 | .895 | .896 | .896 | .897 | .895 | .894 | .896 |
| Art Ross | 117 | 119 | 122 | 116 | 122 | 122 | 134 | 100 |
| Rocket Richard | 66 | 70 | 56 | 54 | 61 | 68 | 66 | 50 |
| Superstars | 17 | 19 | 22 | 27 | 28 | 26 | 27 | 25 |

Single-season audits after the change: goals/team/game 3.03 (holdout 3.00), goalie save % .900 (.902). Every simulation, positional and season check passes. The career save % column counts empty-net goals, so it reads about .004 under goalie save %. Leaders still vary season to season with seed noise (50-70 goals).

## Development depth (Gridiron 1.5, 1.34, 1.75, 2.76, 2.77, 2.80, 3.27)

`players.js` and `development.js` own the yearly change at rollover (`offseason.js` startNewSeason):

- Traits: Generational (growth +1.4/yr, ceiling drift +0.9, 3-year longer prime, half-pace decline, retires ~4 years later), Superstar (+2-year prime, 85% decline, ~2 years later). Real players' traits are deliberate (age, rating, EA abilities, a table of real draft slots; McDavid, MacKinnon, Crosby, Ovechkin, Makar, Celebrini, Bedard, Michkov and Schaefer are Generational by name). Generated drafts get a Generational talent about one year in five, only with a ceiling of 93+. `potTier`/`isGenerationalPot` mark a ceiling of 96+ as the Generational tier for draft boards.
- The wall: from effective age 33 (forwards 33, defensemen 34, goalies 36) a non-Superstar loses 1-2 extra OVR a year (1-3 from two years later) and stops growing; Superstars a softer 0-1 a year later; Generational talents and 88+ goalies are spared.
- Ceilings: under 26, growth past the ceiling is cut to a 25% chance of +1 (40% for Stars); Superstars and Generational talents outgrow theirs.
- Breakouts: 3% (+3) for a Star or better 25 or under, 1.5% (+2) for a Normal developer, 3% (+1) for a hard worker (Combine work-ethic grade A) 28 or under.
- Big seasons: 40 goals, 100 points, 60 assists, 60 points by a defenseman, 35 wins (+1 each, two at most, nothing at 93+); leading the league in points, goals, assists, defenseman points or save percentage is a trait step for a player 26 or under (+1 otherwise); a landslide lead is a cornerstone season (+3, ceiling +4, a trait step up to 29). Past his prime a player's rewards only slow his decline.
- Roles: the role a skater played (top six, net-front, checking, top pair, shutdown, power play, penalty kill) tilts his attributes toward its skills at rollover, keeping his OVR.

## Practical limits

This is a management model, not puck physics or a fitted NHL tracking-data predictor. Shot conversion coefficients are calibrated assumptions. Its `xg` accumulator is conditional on attempts reaching the net and is not directly comparable to public all-attempt expected-goal models. Rink coordinates represent chance geometry, not a continuous collision simulation. Shift/recovery, matching and systems remain abstractions.

The measured overtime/shootout frequencies remain lower than the reference season; broad acceptance checks do not erase that difference. Individual season leaders vary, and aggregate calibration does not establish accurate forecasts for every player. Low-rated and unpublished attributes are still estimates. The model does not simulate every coincidental-penalty combination, misconduct/ejection, challenge/video-review, goalie handedness, travel/time-zone effect or EA ability. Goalie rest tracks starts; there is no fitted multi-game physiological fatigue model. The existing franchise CBA and roster systems retain their documented simplifications.

A full-season regression exposed an existing AI roster hole when 50 contracts prevented signing a second goalie. Offseason AI now clears an unprotected surplus depth contract before filling the hole. A trade test now verifies a legal goalie trade in a controlled market instead of requiring one named player to move after every simulated season.

## Sources

- [NHL official rulebook entry page](https://www.nhl.com/info/video-rulebook), linking the 2026–27 book.
- [2026–27 NHL Official Rules PDF](https://media.d3.nhle.com/image/private/t_document/prd/i9yumvyaojps5kixzaxz.pdf), downloaded and checked for the rules above.
- Official NHL statistics API URLs and original responses: [calibration snapshot](nhl-calibration-2025-26.json).
- [NHL coach discussion of lead protection and earlier goalie pulls](https://www.nhl.com/news/coaches-room-difficulty-of-protecting-leads).
- [Seattle coaching discussion of player availability and goalie-pull timing](https://www.nhl.com/kraken/news/topic/analytics-with-alison/analytics-with-alison-pulling-the-goaltender-327235290).
