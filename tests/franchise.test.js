import {test} from "node:test";
import assert from "node:assert/strict";
import * as L from "../src/engine/league.js";
import scheduleData from "../src/data/schedule2026.json" with {type:"json"};
import {normalizeSchedule,importSeasonSchedule,dayToDate,generateSchedule} from "../src/engine/schedule.js";
import {REGIONS,regionOf,assignScout} from "../src/engine/regions.js";
import {classPool,prospectRead,csRank,scoutProspect} from "../src/engine/scouting.js";
import {setTraining,trainingCamp,franchiseWeek,applyTrainingYear,hireCoach,reviewOwner} from "../src/engine/franchise.js";
import {extendPlayer,futurePayroll} from "../src/engine/extensions.js";
import {startResign,resignAsk,offerContract,resignPlayer} from "../src/engine/offseason.js";
import {currentSlot,startDraft,makePick,simDraftToUser} from "../src/engine/draft.js";
import {mockDraft,tradeDownOffers,acceptDraftTrade,archiveDraft} from "../src/engine/draftTools.js";
import {recordGame,updateRecords,archiveSeason} from "../src/engine/records.js";
import {computeAwards} from "../src/engine/awards.js";
import {minSalaryForYear} from "../src/engine/constants.js";
const league=()=>L.createLeague({userAbbr:"EDM",seed:123});

test("fixture snapshot matches published opening night and the 84-game NHL matrix",()=>{
 const lg=league();const sched=lg.schedule;
 assert.equal(sched.length,1344);assert.equal(dayToDate(lg.year,0,lg.scheduleStart),"Sep 29");
 assert.equal(dayToDate(lg.year,193,lg.scheduleStart),"Apr 10");
 const opening=sched.filter(g=>g.day===0).map(g=>`${lg.teams[g.a].abbr}@${lg.teams[g.h].abbr}`).sort();
 assert.deepEqual(opening,["FLA@CAR","MTL@TOR","NYR@BOS","VAN@EDM","CHI@VGK"].sort());
 for(const t of lg.teams){
  assert.equal(sched.filter(g=>g.h===t.id).length,42);
  for(const o of lg.teams.filter(o=>o.id!==t.id)) {
   const games=sched.filter(g=>g.h===t.id&&g.a===o.id || g.a===t.id&&g.h===o.id);
   assert.equal(games.length,t.div===o.div?4:t.conf!==o.conf?2:3,`${t.abbr}/${o.abbr}`);
  }
 }
});
test("schedule import rejects wrong counts, duplicates, and mid-season replacement atomically",()=>{
 const lg=league(),before=JSON.stringify(lg.schedule);
 assert.equal(importSeasonSchedule(lg,{games:scheduleData.games.slice(1)}).ok,false);
 assert.equal(JSON.stringify(lg.schedule),before);
 const bad=structuredClone(scheduleData);bad.games[1]={...bad.games[0]};
 assert.throws(()=>normalizeSchedule(bad,lg.teams,lg.year));
 assert.equal(importSeasonSchedule(lg,scheduleData).ok,true);
 L.startRegularSeason(lg);assert.equal(importSeasonSchedule(lg,scheduleData).ok,false);
});
test("generated future schedules preserve all 84-game counts and matrix",()=>{
 const lg=league();const sched=generateSchedule(lg.teams);
 for(const t of lg.teams){assert.equal(sched.filter(g=>g.h===t.id).length,42);assert.equal(sched.filter(g=>g.a===t.id).length,42);}
});
// Batch x2: area trips and points are gone; a scout assigned to a region covers it.
test("assigning a scout to a region covers it without exposing hidden numbers or changing board order",()=>{
 const lg=league(),t=lg.teams[lg.userTid];
 const p=classPool(lg).find(p=>regionOf(p)==="Liiga");assert.ok(p);
 const before=classPool(lg).sort((a,b)=>csRank(a)-csRank(b)).map(p=>p.id);
 for(const k of ["major","major2","minor","minor2"])assert.ok(assignScout(lg,k,"OHL").ok);
 assert.equal(prospectRead(lg,p).pot,"??");
 assert.ok(assignScout(lg,"minor","Liiga").ok);assert.ok(prospectRead(lg,p).general);
 assert.equal(prospectRead(lg,p).ovr,"??");assert.equal(prospectRead(lg,p).exact,false);
 L.startRegularSeason(lg);assert.equal(assignScout(lg,"minor","WHL").ok,false,"locked in season");
 assert.deepEqual(classPool(lg).sort((a,b)=>csRank(a)-csRank(b)).map(p=>p.id),before);
 assert.deepEqual(Object.keys(REGIONS).slice(0,3),["OHL","WHL","QMJHL"]);
});
test("training weeks are credited once even across skipped days",()=>{
 const lg=league(),t=lg.teams[lg.userTid],p=t.roster.map(id=>lg.players[id]).find(p=>p.pos!=="G" && !p.injury && p.attrs.spd<98);
 assert.ok(setTraining(lg,p.id,"skating").ok);
 lg.day=21;franchiseWeek(lg);
 const work=t.training.earned[p.id].skating;
 franchiseWeek(lg);
 assert.equal(t.training.earned[p.id].skating,work);
 const speed=p.attrs.spd;applyTrainingYear(lg,p);assert.ok(p.attrs.spd>speed);
});
test("training limits, position restrictions, and once-per-year camps are enforced",()=>{
 const lg=league(),t=lg.teams[lg.userTid];const ps=t.roster.map(id=>lg.players[id]).filter(p=>p.pos!=="G" && !p.injury).slice(0,4);
 assert.equal(setTraining(lg,ps[0].id,"goaltending").ok,false);
 for(const p of ps.slice(0,3))assert.ok(setTraining(lg,p.id,"skating").ok);
 assert.equal(setTraining(lg,ps[3].id,"shooting").ok,false);
 assert.ok(trainingCamp(lg).ok);const attrs=JSON.stringify(ps[0].attrs);
 assert.equal(trainingCamp(lg).ok,false);assert.equal(JSON.stringify(ps[0].attrs),attrs);
 assert.equal(t.training.campReport.length,3);
});
test("coaching market obeys staffing windows and team identity drives simulation",async()=>{
 const lg=league(),t=lg.teams[lg.userTid];assert.ok(hireCoach(lg,lg.coachMarket[0].id).ok);
 t.strategy="defend";const {createGame}=await import("../src/engine/sim.js");
 const s=createGame(lg,t,lg.teams[0]);assert.equal(s.h.tactic,"defend");
 L.startRegularSeason(lg);assert.equal(hireCoach(lg,lg.coachMarket[0].id).ok,false);
});
test("extensions preserve this year's cap hit and activate exactly once",()=>{
 const lg=league(),t=lg.teams[lg.userTid];const p=t.roster.map(id=>lg.players[id]).find(p=>p.yrs===1 && p.pos!=="G");assert.ok(p);
 p.mood=0.5;const cap=p.cap,ask=resignAsk(lg,p,3);
 assert.ok(extendPlayer(lg,p.id,ask.aav,3).ok);assert.equal(p.cap,cap);assert.equal(p.yrs,1);
 assert.equal(extendPlayer(lg,p.id,ask.aav,3).ok,false);
 startResign(lg);assert.equal(p.cap,ask.aav);assert.equal(p.yrs,3);assert.equal(p.extension,undefined);
 assert.ok(futurePayroll(lg,t)>0);
});
test("NHL contract limits reject NaN and excess terms",()=>{
 const lg=league(),fa=lg.players[lg.freeAgents[0]];
 assert.equal(offerContract(lg,fa.id,NaN,3).ok,false);
 assert.equal(offerContract(lg,fa.id,2,7).ok,false);
 startResign(lg);const p=Object.values(lg.players).find(p=>p.tid===lg.userTid && p.yrs===0 && p.signed!==false);
 assert.equal(resignPlayer(lg,p.id,8).ok,false);
 assert.deepEqual([2026,2027,2028,2029].map(minSalaryForYear),[.85,.9,.95,1]);
});
test("draft queue, trade-downs and history survive the full 224-pick draft",()=>{
 const lg=league();startDraft(lg);lg.phase="draft";lg.draft.stage="live";
 assert.equal(lg.draft.slots.length,224);assert.equal(lg.draftClass.length,280);
 const upcoming=lg.draft.slots.find(s=>s.owner===lg.userTid);lg.draft.idx=upcoming.overall-1;
 const offers=tradeDownOffers(lg);
 assert.ok(offers.length>0,"at least one legitimate draft trade offer");
 if(offers.length){const before=lg.draft.slots[lg.draft.idx].owner;assert.ok(acceptDraftTrade(lg,offers[0]).ok);assert.notEqual(lg.draft.slots[lg.draft.idx].owner,before);}
 // Fresh draft to check queue and normal completion.
 const fresh=league();startDraft(fresh);fresh.phase="draft";fresh.draft.stage="live";
 simDraftToUser(fresh);
 const queued=fresh.draftClass.filter(id=>fresh.players[id].tid===-2).sort((a,b)=>csRank(fresh.players[b])-csRank(fresh.players[a]))[0];
 fresh.myList={year:fresh.draft.year,ids:[queued]};
 assert.equal(currentSlot(fresh).owner,fresh.userTid);
 const idx=fresh.draft.idx;simDraftToUser(fresh,{all:true});
 assert.equal(fresh.draft.slots[idx].pid,queued);assert.equal(fresh.draft.idx,224);
 archiveDraft(fresh);archiveDraft(fresh);assert.equal(fresh.draftHistory.length,1);
 assert.ok(fresh.draftHistory[0].picks.every(p=>p.name));
});
test("mock draft is public, deterministic, and does not mutate the franchise",()=>{
 const lg=league(),before=JSON.stringify(lg),mock=mockDraft(lg);
 assert.equal(mock.length,32);assert.equal(new Set(mock.map(s=>s.pid)).size,32);assert.equal(JSON.stringify(lg),before);
 assert.deepEqual(mockDraft(lg),mock);
});
test("records retain names after retirement; repeated owner reviews and season archives are idempotent",()=>{
 const lg=league(),p=lg.players[lg.teams[lg.userTid].roster.find(id=>lg.players[id].pos!=="G")];
 p.stats={...p.stats,gp:50,g:55,a:70,pts:125};
 recordGame(lg,{box:{[p.id]:{g:5,a:2,pts:7}}});updateRecords(lg);archiveSeason(lg);archiveSeason(lg);
 assert.equal(lg.recordBook.game.g.value,5);assert.equal(lg.recordBook.season.pts.value,125);assert.equal(lg.seasonArchive.length,1);
 const id=p.id,name=p.name;delete lg.players[id];assert.equal(lg.recordBook.season.pts.name,name);
 reviewOwner(lg);const trust=lg.teams[lg.userTid].owner.trust;reviewOwner(lg);assert.equal(lg.teams[lg.userTid].owner.trust,trust);
});
test("new systems round-trip, and legacy saves keep played schedules and running draft ownership",()=>{
 const lg=league();assignScout(lg,"minor","QMJHL");const round=L.deserializeLeague(L.exportLeagueText(lg));
 assert.equal(round.teams[round.userTid].scoutRegions.minor,"QMJHL");assert.ok(round.teams[round.userTid].coach);assert.ok(round.recordBook);
 const legacy=structuredClone(lg);delete legacy.scheduleStart;delete legacy.scheduleInfo;delete legacy.recordBook;delete legacy.coachMarket;
 legacy.draftPicks=legacy.draftPicks.filter(p=>p.round<=4);legacy.draftClass=legacy.draftClass.slice(0,170);
 for(const id of legacy.draftClass)legacy.players[id].scout.lvl=1;
 const schedule=JSON.stringify(legacy.schedule);const back=L.restoreLeague(legacy);
 assert.equal(JSON.stringify(back.schedule),schedule);assert.equal(back.scheduleStart,"2026-10-07");assert.equal(back.draftClass.length,280);
 assert.equal(back.players[back.draftClass[0]].scout.lvl,1);assert.ok(back.draftPicks.some(p=>p.round===7));
});
test("awards use NHL identities and include goalies with 25 games for Jennings",()=>{
 const lg=league();const t=lg.teams[lg.userTid];const ps=t.roster.map(id=>lg.players[id]);
 for(const p of ps){p.stats.gp=30;if(p.pos==="G"){p.stats.w=20;p.stats.sa=900;p.stats.ga=50;p.stats.toi=108000;}else{p.stats.pts=30;p.stats.g=15;p.stats.a=15;}}
 const a=computeAwards(lg);for(const k of ["hart","artRoss","rocket","norris","vezina","calder","selke","tedLindsay","ladyByng","jennings","jackAdams"])assert.ok(k in a);
 assert.equal(a.jennings.tid,t.id);assert.ok(a.jennings.pids.length>=1);
});

test("manual checkpoints remain independent from autosave and other slots",async()=>{
 const old=globalThis.localStorage,store=new Map();
 globalThis.localStorage={setItem:(k,v)=>store.set(k,v),getItem:k=>store.get(k) || null,removeItem:k=>store.delete(k)};
 try {
  const {saveSlot,loadSlot,listSlots}=await import("../src/engine/saveSlots.js");
  const lg=league();assert.ok(saveSlot(lg,0));lg.day=7;L.saveLeague(lg);assert.ok(saveSlot(lg,1));
  assert.equal(loadSlot(0).day,0);assert.equal(loadSlot(1).day,7);assert.equal(L.loadLeague().day,7);
  assert.equal(listSlots().filter(s=>s.summary).length,2);assert.equal(saveSlot(lg,3),false);
 } finally {if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
});
