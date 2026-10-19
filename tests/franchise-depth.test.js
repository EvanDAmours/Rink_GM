import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLeague,startRegularSeason,serializeLeague,deserializeLeague,playScheduledGame} from '../src/engine/league.js';
import {createGame,stepGame,simToEnd,serializeGame,restoreGame,applyResult} from '../src/engine/sim.js';
import {rand,seed} from '../src/engine/rng.js';
import {teamNeeds,needFit,prospectReport,projectedRole} from '../src/engine/teamPlanning.js';
import {startCapLedger,accrueCap,capSummary,buyoutSchedule,setSalarySchedule} from '../src/engine/capAccounting.js';
import {rawPayroll} from '../src/engine/hockeyRules.js';
import {capSpace} from '../src/engine/roster.js';
import {promiseRole,commitmentWeek} from '../src/engine/playerCommitments.js';
import {matchReport} from '../src/engine/matchReports.js';
import {decisionInterrupt} from '../src/engine/decisionInterrupts.js';
import {archiveRetirement} from '../src/engine/dynasty.js';
import {retirementChance,developPlayer} from '../src/engine/players.js';
const base=createLeague({mode:'random',seed:448111,injuries:false});
const fixture=()=>structuredClone(base);
test('live checkpoint restores clock, penalties, fatigue and the exact outcome despite intervening RNG',()=>{
 const lg=fixture(),s=createGame(lg,lg.teams[0],lg.teams[1],{live:true});
 for(let i=0;i<145;i++)stepGame(s);
 const saved=JSON.parse(JSON.stringify(serializeGame(s)));
 lg.activeGame={version:1,spec:{kind:'regular',gid:'fixture',home:0,away:1},state:saved};
 const loaded=deserializeLeague(serializeLeague(lg));assert.ok(loaded.activeGame);
 simToEnd(s);for(let i=0;i<100;i++)rand();
 const resumed=restoreGame(loaded,loaded.activeGame.state);
 assert.equal(resumed.clock,saved.clock);assert.deepEqual(resumed.pen,saved.pen);assert.deepEqual(resumed.h.fatigue,saved.h.fatigue);
 simToEnd(resumed);
 for(const field of ['score','shots','box','gbox','goals','events','decisions','shotLog','rng'])assert.deepEqual(resumed[field],s[field],field);
});
test('report reconciles all shot attempts, SOG, goals, unit time and idempotent result application',()=>{
 const lg=fixture(),s=createGame(lg,lg.teams[0],lg.teams[1]);simToEnd(s);const r=matchReport(s,'test');
 for(const k of ['h','a']){
  const shots=r.shotLog.filter(a=>a.side===k);assert.equal(shots.length,s.attempts[k]);
  assert.equal(shots.filter(a=>['goal','save'].includes(a.result)).length,s.shots[k]);
  assert.equal(shots.filter(a=>a.result==='goal').length,s.goals.filter(a=>a.side===k).length);
  assert.ok(Math.abs(r.units[k].reduce((n,u)=>n+u.minutes*60,0)-s.elapsed)<.001);
 }
 applyResult(lg,s);const before=JSON.stringify(lg);applyResult(lg,s);assert.equal(JSON.stringify(lg),before);
});
test('precise positional needs increase when healthy depth is removed; reads are pure',()=>{
 const lg=fixture(),t=lg.teams[0],p=t.roster.map(id=>lg.players[id]).find(p=>p.pos==='C');
 const before=JSON.stringify(lg),first=teamNeeds(lg,t).find(n=>n.pos==='C').score;
 needFit(lg,t,p);assert.equal(JSON.stringify(lg),before);
 for(const id of t.roster)if(lg.players[id].pos==='C')lg.players[id].injury=20;
 assert.ok(teamNeeds(lg,t).find(n=>n.pos==='C').score>=first);
});
test('daily cap accrues once, preserves accrued spend across payroll changes, and banks underspend',()=>{
 const lg=fixture();startRegularSeason(lg);const t=lg.teams[0],D=Math.max(...lg.schedule.map(g=>g.day))+1;
 const payroll=rawPayroll(lg,t);accrueCap(lg,9);assert.ok(Math.abs(t.capLedger.spent-payroll*10/D)<1e-8);
 const old=t.capLedger.spent;accrueCap(lg,9);assert.equal(t.capLedger.spent,old);
 const read=JSON.stringify(lg);capSummary(lg,t);assert.equal(JSON.stringify(lg),read);
 lg.players[t.roster[0]].cap+=2;accrueCap(lg,10);assert.ok(Math.abs(t.capLedger.spent-old-(payroll+2)/D)<1e-8);
});
test('a club that spent banked cap room at the deadline stays compliant on the final day and in the playoffs',()=>{
 const lg=createLeague({userAbbr:'TOR',seed:3,injuries:false});const t=lg.teams[0],star=lg.players[t.roster[0]];star.cap=1;// cheap for most of the year
 startRegularSeason(lg);const D=Math.max(...lg.schedule.map(g=>g.day))+1;
 accrueCap(lg,Math.floor(D*0.6));
 const cap=capSummary(lg,t).cap,room=capSummary(lg,t).available;assert.ok(room>0);
 star.cap+=Math.min(room,cap-rawPayroll(lg,t)+4);// payroll now above the flat cap, within annualized room
 assert.ok(rawPayroll(lg,t)>cap);assert.ok(capSpace(lg,t)>=0);
 accrueCap(lg,D-1);
 assert.equal(capSummary(lg,t).remainingDays,0);assert.ok(capSpace(lg,t)>=0,'final day: '+capSpace(lg,t));
 lg.phase='playoffs';assert.ok(capSpace(lg,t)>=0,'playoffs: '+capSpace(lg,t));
});
test('buyouts apply age rates, signing bonus protection, deferred charges and actual salary years',()=>{
 const p={name:'Test',age:25,cap:6,yrs:2};let rows=buyoutSchedule(p);assert.equal(rows.length,4);assert.equal(rows[0].amt,1);assert.equal(rows[3].offset,3);
 p.age=30;rows=buyoutSchedule(p);assert.equal(rows[0].amt,2);
 p.salarySchedule=[{base:2,signing:4},{base:4,signing:2}];rows=buyoutSchedule(p);assert.equal(rows[0].amt,5);assert.equal(rows[1].amt,3);assert.equal(rows[2].amt,1);
 const lg=fixture(),t=lg.teams[0];t.deadCap=[{amt:2,yrs:1,offset:0},{amt:9,yrs:1,offset:1}];const a=rawPayroll(lg,t);t.deadCap.pop();assert.equal(rawPayroll(lg,t),a);
});
test('role promises wait for a meaningful sample and sustained misses can lead to a trade request',()=>{
 const lg=fixture(),t=lg.teams[0],p=t.roster.map(id=>lg.players[id]).find(p=>p.pos==='C');promiseRole(lg,p,0,'topLine');
 p.stats.gp=2;p.stats.toi=600;t.rec.gp=10;p.rolePromise.unavailable=8;lg.day=28;commitmentWeek(lg);assert.equal(p.rolePromise.status,'pending');
 for(let i=1;i<=3;i++){p.rolePromise.unavailable=0;p.stats.gp=i*10;p.stats.toi=i*10*7*60;t.rec.gp=i*12;lg.day=i*28;commitmentWeek(lg);}
 assert.equal(p.rolePromise.status,'unhappy');assert.equal(p.wantsTrade,true);
});
test('prospect reports use real modeled minutes and communicate sample confidence',()=>{
 const lg=fixture(),t=lg.teams[0],p=lg.players[t.prospects[0]];p.farmStats={gp:20,g:8,a:12,toi:20*18*60};
 const r=prospectReport(lg,t,p);assert.equal(r.minutes,18);assert.ok(Math.abs(r.points60-60/18)<1e-8);assert.equal(r.confidence,'Moderate');
});
test('retired cards preserve full player snapshots through save/reload',()=>{
 const lg=fixture(),p=lg.players[lg.teams[0].roster[0]];p.moveHistory=[{year:lg.year,from:-1,to:0,kind:'signing'}];
 archiveRetirement(lg,p,{gp:400,g:100,a:200});delete lg.players[p.id];lg.teams[0].roster=lg.teams[0].roster.filter(id=>id!==p.id);
 const loaded=deserializeLeague(serializeLeague(lg)),r=loaded.retirementArchive.find(r=>r.pid===p.id);
 assert.deepEqual(r.player.attrs,p.attrs);assert.deepEqual(r.player.career,p.career);assert.deepEqual(r.player.moveHistory,p.moveHistory);
});
test('sim interruptions are configurable and acknowledged issues do not loop',()=>{
 const lg=fixture();lg.phase='regular';lg.settings.simStops={injuries:false,offers:true,roster:false,promises:false};lg.offers=[{id:'one',give:[],get:[]}];
 assert.match(decisionInterrupt(lg),/offer/);assert.equal(decisionInterrupt(lg),null);lg.offers.push({id:'two'});lg.settings.simStops.offers=false;assert.equal(decisionInterrupt(lg),null);
});
test('productive veterans are less likely to retire and goalie development peaks later',()=>{
 assert.ok(retirementChance({age:38,ovr:88,pos:'G',tid:0})<retirementChance({age:38,ovr:74,pos:'C',tid:-1}));
});

test('explicit earned bonuses carry only the excess into the following season and close once',async()=>{
 const {closeCapYear,earnedBonus}=await import('../src/engine/capAccounting.js');
 const {capForYear}=await import('../src/engine/constants.js');
 const lg=fixture();startRegularSeason(lg);const t=lg.teams[0],p=lg.players[t.roster[0]];
 p.yrs=1;p.salarySchedule=[{base:p.cap,signing:0,performance:.5,targets:[{stat:'gp',minimum:10,amount:.5}]}];p.stats.gp=12;
 t.capLedger.spent=capForYear(lg.year)-.1;assert.equal(earnedBonus(p),.5);closeCapYear(lg);
 assert.ok(Math.abs(t.bonusCarry.amount-.4)<1e-8);assert.equal(t.bonusCarry.year,lg.year+1);const n=t.capHistory.length;closeCapYear(lg);assert.equal(t.capHistory.length,n);
});
test('salary editing rejects invalid schedules without mutating the contract',()=>{
 const lg=fixture(),p=lg.players[lg.teams[lg.userTid].roster[0]],before=JSON.stringify(p);
 assert.equal(setSalarySchedule(lg,p,null).ok,false);assert.equal(setSalarySchedule(lg,p,Array.from({length:p.yrs},()=>({base:0,signing:0}))).ok,false);assert.equal(JSON.stringify(p),before);
});

test('healthy scratches breach an important role; extended injuries do not',()=>{
 const lg=fixture(),t=lg.teams[0],p=t.roster.map(id=>lg.players[id]).find(p=>p.pos==='C');promiseRole(lg,p,t.id,'topLine');
 t.rec.gp=12;lg.day=28;p.rolePromise.unavailable=10;commitmentWeek(lg);assert.equal(p.rolePromise.status,'pending');
 p.rolePromise.unavailable=0;commitmentWeek(lg);assert.equal(p.rolePromise.status,'unhappy');
});
test('offseason promises start in the coming season and goalie commitments count starts, not relief appearances',()=>{
 const lg=fixture(),t=lg.teams[0],p=t.roster.map(id=>lg.players[id]).find(p=>p.pos==='G');lg.phase='freeagency';promiseRole(lg,p,t.id,'starter');
 assert.equal(p.rolePromise.year,lg.year+1);lg.year++;lg.phase='regular';lg.day=28;t.rec.gp=12;p.stats.gp=12;p.stats.gs=2;commitmentWeek(lg);assert.equal(p.rolePromise.status,'unhappy');
});
