import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/engine/league.js';
import {createPlayer} from '../src/engine/players.js';
import {contractCount,reserveCount,waiverStatus,buriedCap,rawPayroll,qualifyingAmount,retentionIssue,elcTerm} from '../src/engine/hockeyRules.js';
import {signPlayer,sendDown,callUp,capSpace,counts} from '../src/engine/roster.js';
import {placeWaivers,processWaivers,claimWaiver,designateLTIR,activateLTIR,qualifyRFA,acceptQualifying,holdQualifiedRFA,assignProspect} from '../src/engine/operations.js';
import {negotiate,settleNegotiations,pendingSpend,submitOfferSheet,resolveOfferSheet,offerSheetComp} from '../src/engine/negotiations.js';
import {startResign,endResign} from '../src/engine/offseason.js';
import {evaluateTrade,executeTrade} from '../src/engine/trade.js';
import {developmentWeek,requestPosition,hireAssistant,coachingEffects,lineChemistry,usageGrowth,runCampBattles} from '../src/engine/development.js';
import {ensureFutureClasses,resolveProtections,pickLocked,importDraftClass,compareProspects} from '../src/engine/draftExpansion.js';
import {careerReview,takeJob,upgradeArena,arenaWeek,archiveRetirement,inductHall,retireNumber} from '../src/engine/dynasty.js';
import {playShowcase} from '../src/engine/events.js';
import {snapshotRng,rand} from '../src/engine/rng.js';
import {cupGeometry} from '../src/engine/cupGeometry.js';
import {setNumber,ensureUniforms} from '../src/engine/uniforms.js';
import {CUP_HISTORY} from '../src/data/cupHistory.js';
import {createGame,skatersForDisplay} from '../src/engine/sim.js';
const league=()=>L.createLeague({userAbbr:'EDM',seed:51});
function add(lg,tid,opts={}){const p=createPlayer({name:'Rule Test '+Object.keys(lg.players).length,pos:'RW',ovr:70,age:23,tid,...opts},lg.year);p.signed=opts.signed ?? true;lg.players[p.id]=p;lg.teams[tid].prospects.push(p.id);return p;}
function room(lg,t){t.roster.forEach(id=>{lg.players[id].cap=1;lg.players[id].injury=0;delete lg.players[id].ltir;});while(counts(lg,t).active>=23){const id=t.roster.pop();t.prospects.push(id);}}

test('50 signed contracts and 90 reserve players are independent limits',()=>{
 const lg=league(),t=lg.teams[lg.userTid];while(contractCount(lg,t)<50)add(lg,t.id,{yrs:2,cap:1});
 const p=add(lg,t.id,{signed:false,yrs:0,cap:0});assert.equal(signPlayer(lg,t,p,1,2),false);
 while(reserveCount(lg,t)<90)add(lg,t.id,{signed:false,yrs:0});const fa=lg.players[lg.freeAgents[0]];assert.equal(signPlayer(lg,t,fa,1,1),false);assert.equal(reserveCount(lg,t),90);
});
test('junior ELC exemption, entry-level terms and slides observe participation thresholds',()=>{
 const lg=league(),t=lg.teams[lg.userTid],p=add(lg,t.id,{age:18,yrs:3,cap:1});p.assignment='junior';p.elc={signedAge:18};const before=contractCount(lg,t);p.stats.gp=11;assert.equal(contractCount(lg,t),before+1);p.stats.gp=9;
 startResign(lg);assert.equal(p.yrs,3);startResign(lg);assert.equal(p.elc.slides,1);assert.deepEqual([elcTerm(20),elcTerm(23),elcTerm(24)],[3,2,1]);
});
test('waiver eligibility uses service and game thresholds, not salary',()=>{
 assert.equal(waiverStatus({age:22,pos:'RW',signed:true,cap:15,stats:{gp:30},career:[],service:{firstAge:20,years:1,priorGames:0}}).exempt,true);
 assert.equal(waiverStatus({age:22,pos:'RW',signed:true,stats:{gp:160},service:{firstAge:20,years:1}}).exempt,false);
 assert.equal(waiverStatus({age:30,pos:'G',signed:true,stats:{gp:1},service:{firstAge:25,years:1}}).exempt,false);
});
test('unclaimed veteran waivers assign to AHL and retain buried cap; recall waits',()=>{
 const lg=league(),t=lg.teams[lg.userTid],p=lg.players[t.roster.find(id=>lg.players[id].pos==='RW')];p.cap=3;p.ovr=50;p.injury=0;p.service={firstAge:20,years:8,priorGames:400};
 assert.equal(sendDown(lg,t,p.id),false);assert.ok(placeWaivers(lg,p.id).ok);assert.ok(t.roster.includes(p.id));lg.day++;processWaivers(lg);assert.ok(t.prospects.includes(p.id));assert.equal(buriedCap(p,lg.year),1.775);assert.equal(callUp(lg,t,p.id),false);lg.day+=2;room(lg,t);assert.equal(callUp(lg,t,p.id),true);
});
test('eligible lowest-standing claim wins after settlement revalidation',()=>{
 const lg=league(),from=lg.teams[lg.userTid],p=lg.players[from.roster.find(id=>lg.players[id].pos==='LW')];p.injury=0;p.cap=1;p.ovr=40;p.service={firstAge:20,years:8,priorGames:400};assert.ok(placeWaivers(lg,p.id).ok);
 const [a,b]=lg.teams.filter(t=>t.id!==from.id).slice(0,2);room(lg,a);room(lg,b);a.rec={...a.rec,gp:10,pts:10};b.rec={...b.rec,gp:10,pts:2};
 assert.ok(claimWaiver(lg,lg.waivers[0].id,a.id).ok);assert.ok(claimWaiver(lg,lg.waivers[0].id,b.id).ok);lg.day=40;processWaivers(lg);assert.equal(p.tid,b.id);assert.equal(from.roster.includes(p.id),false);
});
test('LTIR requires both absence minima and cannot activate over the cap',()=>{
 const lg=league(),t=lg.teams[lg.userTid],p=lg.players[t.roster[0]];room(lg,t);p.cap=10;p.injury=10;assert.ok(designateLTIR(lg,p.id).ok);const after=counts(lg,t).active;p.injury=0;lg.day=23;t.rec.gp=10;assert.equal(activateLTIR(lg,p.id).ok,false);lg.day=24;t.rec.gp=9;assert.equal(activateLTIR(lg,p.id).ok,false);t.rec.gp=10;assert.ok(activateLTIR(lg,p.id).ok);assert.equal(counts(lg,t).active,after+1);
});
test('retained salary follows a traded contract while originating cap remains charged',()=>{
 const lg=league(),from=lg.teams[lg.userTid],to=lg.teams[0];room(lg,from);room(lg,to);const p=lg.players[from.roster.find(id=>lg.players[id].pos==='RW')];p.cap=4;p.yrs=3;const before=rawPayroll(lg,from);
 const offer={from:from.id,to:to.id,give:[p.id],get:[],givePicks:[],getPicks:[],giveRetention:{[p.id]:.5}};assert.deepEqual(evaluateTrade(lg,offer).problems,[]);assert.ok(executeTrade(lg,offer));assert.equal(p.cap,2);assert.equal(from.retained[0].amt,2);assert.equal(rawPayroll(lg,from),before-2);assert.equal(p.tid,to.id);assert.match(retentionIssue(lg,from,p,.6),/50%/);
});
test('no-movement clauses block trades and waivers until destination consent',()=>{
 const lg=league(),from=lg.teams[lg.userTid],to=lg.teams[0];room(lg,from);room(lg,to);const p=lg.players[from.roster.find(id=>lg.players[id].pos==='RW')];p.clause={type:'NMC',blocked:[]};
 const o={from:from.id,to:to.id,give:[p.id],get:[],givePicks:[],getPicks:[]};assert.ok(evaluateTrade(lg,o).problems.some(p=>p.includes('NMC')));assert.equal(placeWaivers(lg,p.id).ok,false);p.clause.waivedTo=[to.id];assert.deepEqual(evaluateTrade(lg,o).problems,[]);
});
test('qualified RFAs remain on reserve list and can accept their one-year QO',()=>{
 const lg=league(),t=lg.teams[lg.userTid],p=lg.players[t.roster[0]];room(lg,t);p.age=24;p.service.years=3;p.yrs=1;p.cap=1.5;startResign(lg);assert.ok(qualifyRFA(lg,p.id).ok);endResign(lg);assert.equal(p.tid,t.id);assert.ok(t.rfaRights.includes(p.id));assert.ok(!lg.freeAgents.includes(p.id));assert.ok(acceptQualifying(lg,p.id).ok);assert.ok(t.roster.includes(p.id));assert.equal(p.yrs,1);
 assert.equal(qualifyingAmount({prevCap:1.74},2027),1.75);
});
test('offer sheets lock compensation picks and transfer player and picks atomically',()=>{
 const lg=league(),t=lg.teams[lg.userTid],old=lg.teams[0];room(lg,t);room(lg,old);lg.phase='freeagency';lg.fa={day:0};const p=add(lg,old.id,{ovr:80,age:23,yrs:0,cap:0});p.qualified={aav:2,year:2027};p.service={firstAge:20,years:3};holdQualifiedRFA(lg,p);
 assert.ok(submitOfferSheet(lg,p.id,8,3).ok);const s=lg.offerSheets[0];assert.equal(s.picks.length,3);assert.ok(s.picks.every(id=>pickLocked(lg,id)));assert.ok(resolveOfferSheet(lg,s.id,false).ok);assert.equal(p.tid,t.id);assert.ok(s.picks.every(id=>lg.draftPicks.find(q=>q.id===id).owner===old.id));assert.ok(!old.rfaRights.includes(p.id));assert.ok(!p.offerSheetPending);
});
test('matching offer sheet keeps ownership and releases compensation picks',()=>{
 const lg=league(),t=lg.teams[lg.userTid],old=lg.teams[0];room(lg,t);room(lg,old);lg.phase='freeagency';lg.fa={day:0};const p=add(lg,old.id,{ovr:78,age:23,yrs:0,cap:0});p.qualified={aav:1};holdQualifiedRFA(lg,p);assert.ok(submitOfferSheet(lg,p.id,7,2).ok);const s=lg.offerSheets[0];const before=s.picks.map(id=>lg.draftPicks.find(q=>q.id===id).owner);assert.ok(resolveOfferSheet(lg,s.id,true).ok);assert.equal(p.tid,old.id);assert.deepEqual(s.picks.map(id=>lg.draftPicks.find(q=>q.id===id).owner),before);assert.ok(!pickLocked(lg,s.picks[0]));
});
test('offer-sheet compensation uses contract total divided by at most five years',()=>{
 const lg=league();assert.equal(offerSheetComp(lg,1,1).rounds.length,0);assert.deepEqual(offerSheetComp(lg,12,6).rounds,[1,1,1,1]);assert.equal(offerSheetComp(lg,12,6).available,true);const pick=lg.draftPicks.find(p=>p.owner===lg.userTid && p.year===2027 && p.round===1);pick.owner=0;assert.equal(offerSheetComp(lg,12,6).available,false);
});
test('agents preserve counteroffers, reserve budget, and resolve pending bids',()=>{
 const lg=league(),t=lg.teams[lg.userTid];room(lg,t);lg.phase='freeagency';lg.fa={day:0};const p=lg.players[lg.freeAgents.find(id=>lg.players[id].ovr<75)];assert.equal(negotiate(lg,p.id,.9,2).ok,false);assert.equal(lg.negotiations[p.id].status,'counter');assert.ok(negotiate(lg,p.id,5,2).ok);assert.equal(pendingSpend(lg,t.id),5);assert.equal(p.tid,-1);lg.fa.day=2;settleNegotiations(lg);assert.equal(p.tid,t.id);assert.equal(pendingSpend(lg,t.id),0);assert.ok(!p.negotiationPending);
});
test('on the open market you can talk to more agents than your cap room covers; the rest fall through at settlement',()=>{
 const lg=league(),t=lg.teams[lg.userTid];room(lg,t);lg.phase='freeagency';lg.fa={day:0};
 const space=capSpace(lg,t);const fas=lg.freeAgents.map(id=>lg.players[id]).filter(p=>p.ovr<75).slice(0,6);
 const aav=Math.min(18,Math.round(space*0.4*100)/100);// a few such offers exceed the room; each fits on its own
 for(const p of fas){const r=negotiate(lg,p.id,aav,2);assert.ok(r.ok,r.msg);}
 assert.ok(pendingSpend(lg,t.id)>space);
 assert.equal(negotiate(lg,fas[0].id,space+5,2).ok,false);// a single offer still has to fit
 lg.fa.day=2;settleNegotiations(lg);
 const mine=fas.filter(p=>p.tid===t.id);assert.ok(mine.length>=2 && mine.length<fas.length);
 assert.ok(capSpace(lg,t)>=-1e-6);
 assert.ok(lg.inbox.some(m=>/left no cap or roster room/.test(m.text)));
});
test('CHL and NCAA development assignments preserve eligibility rules',()=>{
 const lg=league(),t=lg.teams[lg.userTid],p=add(lg,t.id,{age:18,signed:false});p.bio={lg:'OHL'};assert.equal(assignProspect(lg,p.id,'ahl').ok,false);assert.ok(assignProspect(lg,p.id,'junior').ok);p.age=20;assert.ok(assignProspect(lg,p.id,'ahl').ok);assert.equal(p.yrs,3);assert.equal(assignProspect(lg,p.id,'college').ok,false);
});
test('eight healthy weekly position sessions change position and sync old lines',()=>{
 const lg=league(),t=lg.teams[lg.userTid],p=lg.players[t.roster.find(id=>lg.players[id].pos==='LW')];p.injury=0;assert.ok(requestPosition(lg,p.id,'RD').ok);lg.day=49;developmentWeek(lg);assert.equal(p.pos,'LW');p.injury=1;lg.day=56;developmentWeek(lg);assert.equal(p.pos,'LW');p.injury=0;lg.day=63;developmentWeek(lg);assert.equal(p.pos,'RD');assert.ok(!t.lines.F.flat().includes(p.id));assert.ok(!p.positionTraining);
});
test('farm growth rewards role and credits weeks only once; coaching affects special teams',()=>{
 const lg=league(),t=lg.teams[lg.userTid],p=add(lg,t.id,{age:20,yrs:2,cap:1});p.farmRole='top';lg.day=70;developmentWeek(lg);const gp=p.farmStats.gp;assert.ok(gp>0);developmentWeek(lg);assert.equal(p.farmStats.gp,gp);assert.ok(usageGrowth(lg,p)>0);t.staff.assistant.specialTeams=90;const good=coachingEffects(lg,t);t.staff.assistant.specialTeams=60;const bad=coachingEffects(lg,t);assert.ok(good.pp>bad.pp && good.pk>bad.pk);lg.phase='regular';assert.equal(hireAssistant(lg,lg.assistantMarket[0].id).ok,false);
});
test('line familiarity rewards continuity and camp resolves only once',()=>{
 const lg=league(),t=lg.teams[lg.userTid],ids=t.lines.F[0];const before=lineChemistry(lg,t,ids);t.lineExperience[ids.join('|')]=26;assert.ok(lineChemistry(lg,t,ids)>before);assert.ok(runCampBattles(lg).ok);assert.equal(runCampBattles(lg).ok,false);
});
test('future class identities persist; comparisons never consume hidden ratings',()=>{
 const lg=league(),before=JSON.stringify(lg.futureClasses);ensureFutureClasses(lg);assert.equal(JSON.stringify(lg.futureClasses),before);const id=lg.draftClass[0],p=lg.players[id];const a=compareProspects(lg,[id]);p.attrs={};p.ovr=40;p.pot=40;const b=compareProspects(lg,[id]);assert.deepEqual(a,b);
});
test('class import validates all rows before mutation and keeps hidden reads',()=>{
 const lg=league(),before=JSON.stringify(lg.draftClass.map(id=>lg.players[id]));assert.equal(importDraftClass(lg,[{name:'Broken',pos:'QB',ovr:60,pot:80}]).ok,false);assert.equal(JSON.stringify(lg.draftClass.map(id=>lg.players[id])),before);assert.ok(importDraftClass(lg,[{name:'Import Hockey',pos:'C',ovr:65,pot:85,lg:'NCAA'}]).ok);const p=lg.players[lg.draftClass[0]];assert.equal(p.name,'Import Hockey');assert.equal(compareProspects(lg,[p.id])[0].read.exact,false);
});
test('protected first defers to next year only if lottery threshold is met',()=>{
 const lg=league(),from=lg.userTid,to=0,p=lg.draftPicks.find(p=>p.orig===from && p.year===2027 && p.round===1),next=lg.draftPicks.find(p=>p.orig===from && p.year===2028 && p.round===1);p.owner=to;lg.conditions.push({pickId:p.id,deferId:next.id,from,to,year:2027,threshold:10,done:false});assert.ok(pickLocked(lg,next.id));resolveProtections(lg,[from,...lg.teams.filter(t=>t.id!==from).map(t=>t.id)],2027);assert.equal(p.owner,from);assert.equal(next.owner,to);assert.equal(lg.conditions[0].done,true);
});
test('arena spending and weekly revenue do not change player cap room',()=>{
 const lg=league(),t=lg.teams[lg.userTid],before=capSpace(lg,t);assert.ok(upgradeArena(lg,'medical').ok);assert.equal(capSpace(lg,t),before);const cash=t.arena.cash;lg.day=7;arenaWeek(lg);assert.ok(t.arena.cash>cash);const once=t.arena.cash;arenaWeek(lg);assert.equal(t.arena.cash,once);
});
test('dismissals are opt-in and changing clubs preserves league history and separate scouts',()=>{
 const lg=league(),t=lg.teams[lg.userTid];t.owner.trust=10;careerReview(lg);assert.equal(lg.career.fired,false);t.coach.tenure=[];lg.settings.firing=true;careerReview(lg);assert.equal(lg.career.fired,true);assert.equal(L.beginNextSeason(lg),false);lg.phase='draft';const target=lg.career.offers[0].tid;assert.ok(takeJob(lg,target).ok);assert.equal(lg.userTid,target);assert.notEqual(lg.teams[target].scouts,t.scouts);assert.equal(lg.career.jobs.length,2);
});
test('Hall of Fame waits three years and retired jersey conflicts are enforced',()=>{
 const lg=league(),t=lg.teams[lg.userTid],p=lg.players[t.roster.find(id=>lg.players[id].pos!=='G')];archiveRetirement(lg,p,{gp:900,g:300,a:700,w:0});lg.year+=2;inductHall(lg);assert.equal(lg.hallOfFame.length,0);lg.year++;inductHall(lg);assert.equal(lg.hallOfFame.length,1);assert.equal(retireNumber(lg,p.id).ok,false);t.roster=t.roster.filter(id=>id!==p.id);assert.ok(retireNumber(lg,p.id).ok);
});
test('showcases preserve NHL players, standings and random stream',()=>{
 const lg=league();lg.phase='regular';lg.day=150;const players=JSON.stringify(lg.players),teams=JSON.stringify(lg.teams),rng=snapshotRng();assert.ok(playShowcase(lg,'allstar').ok);assert.equal(JSON.stringify(lg.players),players);assert.equal(JSON.stringify(lg.teams),teams);assert.deepEqual(snapshotRng(),rng);assert.equal(lg.showcases[0].results.length,10);assert.equal(playShowcase(lg,'allstar').ok,false);assert.ok(playShowcase(lg,'juniors').ok);
});
test('three-on-three exhibition dresses three skaters and Cup geometry is finite',()=>{
 const lg=league(),s=createGame(lg,lg.teams[0],lg.teams[1],{exhibition:true,threeOnThree:true});assert.equal(skatersForDisplay(s,'h').length,3);const g=cupGeometry();assert.equal(g.positions.length,g.normals.length);assert.ok(g.positions.length>10000);assert.ok([...g.positions,...g.normals].every(Number.isFinite));
});
test('jersey assignments are unique and historic franchises remain distinct',()=>{
 const lg=league(),t=lg.teams[lg.userTid];ensureUniforms(lg);assert.equal(new Set([...t.roster,...t.prospects].map(id=>lg.players[id].number)).size,t.roster.length+t.prospects.length);assert.equal(setNumber(lg,t.roster[0],lg.players[t.roster[1]].number).ok,false);assert.equal(CUP_HISTORY.filter(c=>c.abbr==='EDM').length,5);assert.equal(CUP_HISTORY.filter(c=>c.abbr==='OTT').length,0);assert.equal(CUP_HISTORY.at(-1).year,2026);
});
test('operations and legacy fields round-trip with migration without changing contracts',()=>{
 const lg=league();lg.teams[lg.userTid].arena.medical=2;lg.draft={clock:{overall:1,remaining:42},slots:[],idx:0,year:2027};const before=contractCount(lg,lg.teams[lg.userTid]);const restored=L.deserializeLeague(L.serializeLeague(lg));assert.equal(restored.teams[restored.userTid].arena.medical,2);assert.equal(restored.draft.clock.remaining,42);assert.equal(contractCount(restored,restored.teams[restored.userTid]),before);assert.ok(restored.career && restored.futureClasses);
});

test('offer-sheet targets cannot bypass the matching window with qualifying offers',()=>{
 const lg=league(),t=lg.teams[lg.userTid],p=lg.players[t.roster[0]];lg.phase='freeagency';p.qualified={aav:1};p.yrs=0;p.offerSheetPending='pending';assert.equal(acceptQualifying(lg,p.id).ok,false);assert.equal(p.yrs,0);
});
test('locked and missing original compensation picks reject a second encumbrance',()=>{
 const lg=league(),p=lg.draftPicks.find(p=>p.orig===lg.userTid && p.year===2027 && p.round===2);lg.conditions.push({pickId:p.id,deferId:'other',done:false});assert.equal(offerSheetComp(lg,4,2).available,false);
});
test('signing validation rejects invalid salaries and clears expired contract clauses',()=>{
 const lg=league(),t=lg.teams[lg.userTid],p=lg.players[lg.freeAgents[0]];assert.equal(signPlayer(lg,t,p,NaN,2),false);assert.equal(signPlayer(lg,t,p,1,8),false);p.clause={type:'NMC'};p.retentionCount=2;assert.equal(signPlayer(lg,t,p,1,2),true);assert.ok(!p.clause && !p.retentionCount);
});
