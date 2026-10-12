// Repeatable, home/away-balanced Monte Carlo audit; no results are applied to saves.
import assert from 'node:assert/strict';
import {createLeague} from '../src/engine/league.js';
import {createGame,simToEnd} from '../src/engine/sim.js';
import {seed} from '../src/engine/rng.js';
import {SKATER_KEYS,GOALIE_KEYS} from '../src/engine/ratings.js';
import {autoLines} from '../src/engine/lines.js';
import {isGoalie} from '../src/engine/constants.js';
import {writeFileSync} from 'node:fs';
const count=Number(process.env.NHL_AUDIT_GAMES || 1000);
const base=createLeague({mode:'random',injuries:false,seed:34027});
function setup(left=82,right=82,goalies=[82,82]){
 const lg=structuredClone(base);
 for(const [i,t] of lg.teams.slice(0,2).entries()){
  t.strategy='balanced';t.restPct=0;t.lineExperience={};t.coach.specialTeams=78;t.staff={assistant:{specialTeams:78},goalie:{goaltending:78}};
  for(const id of [...t.roster,...t.prospects]){const p=lg.players[id],r=isGoalie(p.pos)?goalies[i]:i?right:left;p.attrs=Object.fromEntries((isGoalie(p.pos)?GOALIE_KEYS:SKATER_KEYS).map(k=>[k,r]));p.ovr=r;p.injury=0;delete p.ltir;delete p.ovrOffset;if(!isGoalie(p.pos)){p.attrs.fgt=45;p.type=['LD','RD'].includes(p.pos)?'TWD':'TWF';}}
  autoLines(lg,t);
 }
 return lg;
}
function series(name,lg,star=null,pair=lg.teams.slice(0,2)){
 const [a,b]=pair,tot={name,games:count,wins:0,gf:0,ga:0,sf:0,sa:0,ot:0,regulationTies:0,starGoals:0,starShots:0,starToi:0,teammateGoals:0,teammateShots:0,teammateToi:0,guardFallbacks:0};
 for(let i=0;i<count;i++){
  seed(910007+i*7919);const swap=i%2,side=swap?'a':'h',op=swap?'h':'a';
  const s=createGame(lg,swap?b:a,swap?a:b);simToEnd(s);
  assert.equal(s.phase,'final');assert.notEqual(s.score.h,s.score.a);assert.ok(s.steps<5000);tot.wins+=s.winner===side;
  tot.gf+=s.goals.filter(g=>g.side===side).length;tot.ga+=s.goals.filter(g=>g.side===op).length;tot.sf+=s.shots[side];tot.sa+=s.shots[op];tot.ot+=Boolean(s.endedIn);
  if(star){const x=s.box[star],mates=a.lines.F[0].filter(id=>id!==star);tot.starGoals+=x.g;tot.starShots+=x.sog;tot.starToi+=x.toi;for(const id of mates){tot.teammateGoals+=s.box[id].g;tot.teammateShots+=s.box[id].sog;tot.teammateToi+=s.box[id].toi;}}
 }
 const out={name,games:count,winRate:+(tot.wins/count).toFixed(4),goalsFor:+(tot.gf/count).toFixed(3),goalsAgainst:+(tot.ga/count).toFixed(3),shotsFor:+(tot.sf/count).toFixed(2),shotsAgainst:+(tot.sa/count).toFixed(2),overtimeRate:+(tot.ot/count).toFixed(4),savePct:+(1-tot.ga/tot.sa).toFixed(4)};
 if(star)Object.assign(out,{starGoalsPer60:+(tot.starGoals/tot.starToi*3600).toFixed(3),teammateGoalsPer60:+(tot.teammateGoals/tot.teammateToi*3600).toFixed(3),starShotsPer60:+(tot.starShots/tot.starToi*3600).toFixed(3),teammateShotsPer60:+(tot.teammateShots/tot.teammateToi*3600).toFixed(3)});
 console.log(JSON.stringify(out));return out;
}
const results=[];
results.push(series('Equal 82-rated clubs',setup()));
results.push(series('86 vs 80 skaters / equal goalies',setup(86,80)));
results.push(series('92 vs 72 complete clubs',setup(92,72,[92,72])));
results.push(series('95 vs 70 goalies / equal skaters',setup(82,82,[95,70])));
const accuracy=setup();for(const t of accuracy.teams.slice(0,2))for(const id of t.roster){const p=accuracy.players[id];if(!isGoalie(p.pos)){p.attrs.sac=t.id?60:95;p.attrs.wac=t.id?60:95;}}
results.push(series('95 vs 60 shooting accuracy',accuracy));
const power=setup();for(const t of power.teams.slice(0,2))for(const id of t.roster){const p=power.players[id];if(!isGoalie(p.pos)){p.attrs.spw=t.id?60:95;p.attrs.wpw=t.id?60:95;}}
results.push(series('95 vs 60 shooting power',power));
const star=setup(),id=star.teams[0].lines.F[0][1],p=star.players[id];for(const key of ['wac','wpw','sac','spw','dek','hey','puc','pas','oaw','spd','acc','agi'])p.attrs[key]=97;
results.push(series('Elite first-line scorer vs 82-rated linemates',star,id));
// Real roster matchup, fixed rosters and no accumulating injuries or development.
const real=createLeague({userAbbr:'TBL',seed:34027,injuries:false});
results.push(series('Published TBL vs PIT roster',real,null,[real.teams.find(t=>t.abbr==='TBL'),real.teams.find(t=>t.abbr==='PIT')]));
const checks={balanced:results[0].winRate>.43&&results[0].winRate<.57,moderate:results[1].winRate>.55,strong:results[2].winRate>.75,goalies:results[3].winRate>.60,accuracy:results[4].winRate>.55,power:results[5].winRate>.55,star:results[6].starGoalsPer60>results[6].teammateGoalsPer60*1.3,scoring:results[0].goalsFor>2&&results[0].goalsFor<4.3,shots:results[0].shotsFor>24&&results[0].shotsFor<37};
const report={date:new Date().toISOString(),games:results.length*count,perScenario:count,results,checks};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.log('Checks',checks);if(Object.values(checks).some(x=>!x))process.exitCode=1;
