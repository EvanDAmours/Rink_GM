import {createLeague} from '../src/engine/league.js';
import {createGame,simToEnd,applyResult} from '../src/engine/sim.js';
import {teamRatings} from '../src/engine/lines.js';
import {seed} from '../src/engine/rng.js';
import {writeFileSync} from 'node:fs';
const l=createLeague({userAbbr:'EDM',injuries:false,seed:732027});
const strength=new Map(l.teams.map(t=>[t.id,teamRatings(l,t).ovr]));
// Fixed real rosters: isolate gameplay from trades, aging, injuries and development.
for(const [i,g] of l.schedule.entries()){seed(91000+i*9337);const s=createGame(l,l.teams[g.h],l.teams[g.a]);simToEnd(s);applyResult(l,s);}
const teams=l.teams.map(t=>({abbr:t.abbr,ovr:strength.get(t.id),record:t.rec})).sort((a,b)=>b.record.pts-a.record.pts);
const sk=Object.values(l.players).filter(p=>p.pos!=='G'&&p.stats.gp),leaders=sk.sort((a,b)=>b.stats.pts-a.stats.pts).slice(0,15).map(p=>({name:p.name,ovr:p.ovr,stats:p.stats}));
const goalies=Object.values(l.players).filter(p=>p.pos==='G'&&p.stats.sa),saves=goalies.reduce((a,p)=>a+p.stats.sa-p.stats.ga,0),shots=goalies.reduce((a,p)=>a+p.stats.sa,0);
const report={games:l.schedule.length,goalsPerTeamGame:l.teams.reduce((a,t)=>a+t.rec.gf,0)/(l.schedule.length*2),shotsPerTeamGame:shots/(l.schedule.length*2),savePct:saves/shots,teams,leaders,mcdavid:sk.find(p=>p.name==='Connor McDavid')?.stats};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({games:report.games,goalsPerTeamGame:report.goalsPerTeamGame,shotsPerTeamGame:report.shotsPerTeamGame,savePct:report.savePct,leaders:leaders.slice(0,5).map(p=>({name:p.name,g:p.stats.g,a:p.stats.a,pts:p.stats.pts})),mcdavid:report.mcdavid}));
