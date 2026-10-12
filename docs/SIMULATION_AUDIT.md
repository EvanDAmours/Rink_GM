# Simulation audit — 12 October 2026

Results are stochastic hockey outcomes driven by the dressed players' attributes, roles, ice time, tactics, special teams, chemistry, coaching, goalie selection and endurance. There is no team-name win override or OVR-based forced winner. OVR affects lineup selection; on-ice attributes determine possession, shot generation, misses, blocks, finishing, saves, faceoffs, assists and penalties.

## Changes

- Slap shots use slapshot power/accuracy; wrist shots use their own values. One-timers, tips and backhands also use the appropriate hand-eye and puck skills.
- Goalie save-side attributes and recovery affect saves and rebound opportunities. Passing contributes to chance quality and primary/secondary assist selection.
- Shooter tendencies distinguish snipers and playmakers. Assigned even-strength centers take their team's draws instead of a natural center playing wing automatically taking every draw.
- Longer shifts reduce performance slightly, with higher endurance limiting the penalty. This does not change the saved player ratings.
- Live commentary has a separate random stream. Thirty seeded regression games produce identical scores, shots, box scores and goals in live and quick modes when no user intervention changes tactics.
- The step-limit guard throws an error instead of assigning an arbitrary coin-flip winner to an unfinished game.

## Controlled audit

1,500 games per scenario; home/away alternates; fixed players; no accumulating injuries, development or trades. Fixed seed sequences make the audit repeatable. These are measurements of this game, not predictions for real NHL clubs.

| Scenario | Club A win rate | A goals / game | B goals / game |
| --- | ---: | ---: | ---: |
| Equal 82-rated clubs | 49.3% | 2.64 | 2.66 |
| 86 vs 80 skaters / equal goalies | 77.1% | 3.63 | 1.96 |
| 92 vs 72 complete clubs | 100.0% | 8.50 | 0.61 |
| 95 vs 70 goalies / equal skaters | 80.4% | 3.52 | 1.86 |
| 95 vs 60 shooting accuracy | 78.3% | 3.28 | 1.74 |
| 95 vs 60 shooting power | 66.2% | 3.01 | 2.17 |
| Elite first-line scorer vs 82-rated linemates | 59.7% | 3.10 | 2.59 |
| Published TBL vs PIT roster | 72.9% | 3.31 | 2.17 |

The elite first-line scorer produced 2.29 goals per 60 minutes, compared with 0.61 for his linemates. Equal clubs averaged roughly 27 shots each. A 20-point whole-roster mismatch is an extreme synthetic stress case, not the small strength spread of actual NHL rosters.

## Full-calendar check

A fixed-roster, injury-free 1,344-game season averaged 2.96 scoreboard goals per team/game, 28.4 shots faced by goalies, and 0.899 save percentage. Scoreboard goals include the shootout deciding goal; goalie shots exclude empty-net attempts. McDavid produced 109 points with 62 goals, 47 assists, and 2294 faceoffs. A single season can have unexpected leaders; higher ratings improve probabilities rather than guaranteeing rankings.

## Reproduce

`npm run test:simulation` runs eight matchup scenarios (1,000 games each by default). Set `NHL_AUDIT_GAMES=1500` for the report's sample size. `npm run test:season` runs the fixed-roster full schedule. Both accept a JSON output filename as an extra argument. Engine regression tests run with `npm test`.

## Limits

This is a calibrated probabilistic management simulation, not a physics engine or a claim of perfect NHL prediction. It does not yet model rink-coordinate shot geometry as physical expected goals, historical workload/fatigue between dates, goalie handedness matchups, or every EA ability as a separate gameplay modifier. The pictured rink is a presentation layer. Unpublished EA attributes and many service/contract details remain estimates. Audit coverage establishes broad skill sensitivity, plausible aggregate ranges and reproducibility; it cannot establish perfection for every roster or tactic.

The complete recorded measurements are in `simulation-audit-results.json` and `season-audit-results.json`.
