// Causal position checks: change one set of attributes, keep teammates, dates,
// deployment preferences and alternating home/away matchups fixed.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createLeague} from '../src/engine/league.js';
import {createGame,simToEnd} from '../src/engine/sim.js';
import {autoLines} from '../src/engine/lines.js';
import {SKATER_KEYS,GOALIE_KEYS} from '../src/engine/ratings.js';
import {isGoalie,isDefense} from '../src/engine/constants.js';
import {seed} from '../src/engine/rng.js';
const count=Number(process.env.NHL_POSITION_GAMES || 1000);
const base=createLeague({mode:'random',seed:653029,injuries:false});
for(const t of base.teams.slice(0,2)){
 t.strategy='balanced';t.restPct=0;t.lineExperience={};t.coach.specialTeams=78;
 t.staff={assistant:{specialTeams:78},goalie:{goaltending:78}};
 for(const id of [...t.roster,...t.prospects]){
  const p=base.players[id];p.attrs=Object.fromEntries((isGoalie(p.pos)?GOALIE_KEYS:SKATER_KEYS).map(k=>[k,82]));p.ovr=82;p.injury=0;delete p.ltir;delete p.ovrOffset;
  if(!isGoalie(p.pos)){p.type=isDefense(p.pos)?'TWD':'TWF';p.attrs.fgt=45;}
 }
 autoLines(base,t);
}
const starId=base.teams[0].lines.F[0][1];
function variant(change){const l=structuredClone(base);change(l);return l;}
function run(name,l){
 const totals={star:{g:0,a:0,pts:0,sog:0,toi:0},mates:{pts:0,toi:0},h:{ga:0,sa:0,sf:0,goals:0,xga:0,blocks:0,fow:0,fol:0},a:{ga:0,sa:0,sf:0,goals:0,xga:0,blocks:0,fow:0,fol:0}};
 const [left,right]=l.teams;
 for(let i=0;i<count;i++){
  seed(622199+i*7907);const swap=i%2,k=swap?'a':'h',o=swap?'h':'a';
  const s=createGame(l,swap?right:left,swap?left:right);simToEnd(s);
  const x=s.box[starId];for(const f of Object.keys(totals.star))totals.star[f]+=x[f];
  for(const id of left.lines.F[0].filter(id=>id!==starId)){totals.mates.pts+=s.box[id].pts;totals.mates.toi+=s.box[id].toi;}
  for(const [key,actual,opponent] of [['h',k,o],['a',o,k]]){
   const t=totals[key];t.sf+=s.shots[actual];t.goals+=s.goals.filter(g=>g.side===actual).length;t.xga+=s.xg[opponent];
   for(const id of s[actual].dressed){const b=s.box[id];t.blocks+=b.blk||0;t.fow+=b.fow||0;t.fol+=b.fol||0;}
   for(const [id,g] of Object.entries(s.gbox))if(s[actual].pl[id]){t.ga+=g.ga;t.sa+=g.sa;}
  }
 }
 const per60=(n,t)=>+(n/t*3600).toFixed(3);
 const team=t=>({goalsFor:+(t.goals/count).toFixed(3),goalsAgainst:+(t.ga/count).toFixed(3),shotsAgainst:+(t.sa/count).toFixed(2),xgAgainst:+(t.xga/count).toFixed(3),blocks:+(t.blocks/count).toFixed(2),savePct:+(1-t.ga/t.sa).toFixed(4),faceoffPct:+(t.fow/(t.fow+t.fol)).toFixed(4)});
 const out={name,games:count,forward:{goalsPer60:per60(totals.star.g,totals.star.toi),assistsPer60:per60(totals.star.a,totals.star.toi),pointsPer60:per60(totals.star.pts,totals.star.toi),shotsPer60:per60(totals.star.sog,totals.star.toi),linematePointsPer60:per60(totals.mates.pts,totals.mates.toi)},left:team(totals.h),right:team(totals.a)};
 console.log(JSON.stringify(out));return out;
}
const results=[];
results.push(run('82-rated baseline',base));
results.push(run('Same first-line center upgraded to 97',variant(l=>{const p=l.players[starId];for(const k of SKATER_KEYS)if(!['fgt','dsc','agr'].includes(k))p.attrs[k]=97;p.ovr=97;})));
results.push(run('Same center: only playmaking and puck skills upgraded',variant(l=>{const p=l.players[starId];p.type='PLY';for(const k of ['pas','puc','oaw','dek','hey'])p.attrs[k]=97;})));
results.push(run('Only left defense corps defensive attributes upgraded to 92',variant(l=>{for(const id of l.teams[0].roster){const p=l.players[id];if(isDefense(p.pos))for(const k of ['daw','stk','blk','bch','str'])p.attrs[k]=92;}})));
results.push(run('95 vs 70 goalies, identical 82-rated skaters',variant(l=>{for(const [i,t] of l.teams.slice(0,2).entries())for(const id of t.roster){const p=l.players[id];if(isGoalie(p.pos)){for(const k of GOALIE_KEYS)p.attrs[k]=i?70:95;p.ovr=i?70:95;}}})));
results.push(run('Only center faceoff attributes changed: 99 vs 60',variant(l=>{for(const [i,t] of l.teams.slice(0,2).entries())for(const id of t.roster){const p=l.players[id];if(p.pos==='C')p.attrs.fof=i?60:99;}})));
const [b,f,p,d,g,c]=results;
const checks={forwardScoring:f.forward.goalsPer60>b.forward.goalsPer60*1.25,forwardPoints:f.forward.pointsPer60>b.forward.pointsPer60*1.25,pointsBeyondIceTime:f.forward.pointsPer60>f.forward.linematePointsPer60*1.2,playmaking:p.forward.assistsPer60>b.forward.assistsPer60*1.1,defensiveSuppression:d.left.shotsAgainst<b.left.shotsAgainst&&d.left.goalsAgainst<b.left.goalsAgainst,goalieQuality:g.left.savePct>g.right.savePct+.025,faceoffSpecialists:c.left.faceoffPct>.60};
const report={date:new Date().toISOString(),seedSeries:'622199 + i * 7907',games:count*results.length,perScenario:count,results,checks};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.log('Checks',checks);assert.ok(Object.values(checks).every(Boolean),'Position-specific causal audit failed');
