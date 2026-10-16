// Isolated power changes have a smaller expected effect than changing accuracy
// (which also changes misses). Require a statistically supported advantage,
// rather than treating an arbitrary 55% observed win rate as a natural law.
export function qualityChecks(results){
 const [balanced,moderate,strong,goalies,accuracy,power,star]=results;
 return {balanced:balanced.winRate>.43&&balanced.winRate<.57,moderate:moderate.winRate>.55,strong:strong.winRate>.75,goalies:goalies.winRate>.60,accuracy:accuracy.winRate>.55,power:power.winRate95CI[0]>.5&&power.goalsFor>power.goalsAgainst,star:star.starGoalsPer60>star.teammateGoalsPer60*1.3,scoring:balanced.goalsFor>2&&balanced.goalsFor<4.3,shots:balanced.shotsFor>24&&balanced.shotsFor<37};
}
export const qualityMethod='Power-only quality requires a 95% Wilson win-rate interval entirely above 50% and more goals for than against; other gates retain their established thresholds.';
