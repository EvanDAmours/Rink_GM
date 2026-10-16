import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync,readFileSync,existsSync} from 'node:fs';
if(process.env.NHL_QA_DIR)mkdirSync(process.env.NHL_QA_DIR,{recursive:true});
import * as L from '../src/engine/league.js';
import {simPlayoffDay} from '../src/engine/playoffs.js';
import {simDraftToUser,draftDone} from '../src/engine/draft.js';
import {simFADay} from '../src/engine/offseason.js';
import {contractCount,reserveCount,ownedIds} from '../src/engine/hockeyRules.js';
import {qualifyRFA} from '../src/engine/operations.js';
import {isRFA} from '../src/engine/players.js';
import {ratingLevel} from '../src/engine/offseason.js';
import {counts,payroll,capSpace} from '../src/engine/roster.js';
import {capFloorForYear} from '../src/engine/constants.js';
const checkpoint=process.env.NHL_QA_DIR && process.env.NHL_QA_DIR+'/career-checkpoint.txt',reportPath=process.env.NHL_QA_DIR && process.env.NHL_QA_DIR+'/career-audit.json';
let lg=process.env.DYNASTY_RESUME && checkpoint && existsSync(checkpoint)?L.deserializeLeague(readFileSync(checkpoint,'utf8')):L.createLeague({userAbbr:'EDM',seed:151});
assert.ok(lg && lg.phase==='preseason','Career audit must start from a preseason checkpoint');
let results=process.env.DYNASTY_RESUME && reportPath && existsSync(reportPath)?JSON.parse(readFileSync(reportPath,'utf8')).seasons:[];
for(let n=lg.history.length;n<Number(process.env.DYNASTY_SEASONS || 20);n++){
 L.startRegularSeason(lg);L.simRestOfSeason(lg);const regularGames=lg.schedule.filter(g=>g.played).length;L.endRegularSeason(lg);
 while(lg.playoffs.champion==null)simPlayoffDay(lg);
 const playoffGames=lg.playoffs.rounds.flatMap(r=>r.series || r).reduce((sum,s)=>sum+(s.wTop || 0)+(s.wBot || 0),0);
 L.finishPlayoffs(lg);if(n===0 && process.env.NHL_QA_DIR){simDraftToUser(lg);writeFileSync(process.env.NHL_QA_DIR+"/draft-save.txt",L.serializeLeague(lg));}simDraftToUser(lg,{all:true});assert.ok(draftDone(lg));L.completeDraft(lg);
 for(const id of lg.teams[lg.userTid].roster){const p=lg.players[id];if(p.yrs===0 && isRFA(p))qualifyRFA(lg,id);}
 L.goToFreeAgency(lg);while(!simFADay(lg)){}L.beginNextSeason(lg);
 const seen=new Set();for(const t of lg.teams){for(const id of ownedIds(t)){assert.ok(lg.players[id],`Dangling ${id}`);assert.equal(lg.players[id].tid,t.id);assert.ok(!seen.has(id),'Player on two reserve lists');seen.add(id);}assert.ok(contractCount(lg,t)<=50,`${t.abbr}: ${contractCount(lg,t)} contracts`);assert.ok(reserveCount(lg,t)<=90,`${t.abbr}: ${reserveCount(lg,t)} rights`);if(t.id!==lg.userTid){assert.ok(payroll(lg,t)>=capFloorForYear(lg.year)-.02,`${t.abbr} below cap floor`);assert.ok(capSpace(lg,t)>=-.02,`${t.abbr} exceeds cap: ${capSpace(lg,t)}`);const c=counts(lg,t);assert.ok(c.active<=23 && c.F>=12 && c.D>=6 && c.G>=2,`${t.abbr} invalid roster ${JSON.stringify(c)}`);}}
 for(const p of Object.values(lg.players)){if(p.tid>=0)assert.ok(seen.has(p.id),`Owned player missing from reserve list: ${p.id}`);assert.ok(Number.isFinite(p.ovr)&&p.ovr>=40&&p.ovr<=99,`Invalid OVR: ${p.id}`);}
 assert.equal(new Set(lg.freeAgents).size,lg.freeAgents.length,'Duplicate free-agent identities');
 for(const id of lg.freeAgents){assert.ok(lg.players[id],`Missing free agent ${id}`);assert.equal(lg.players[id].tid,-1);assert.ok(!seen.has(id),'Owned player listed as a free agent');}
 for(const p of Object.values(lg.players))if(p.tid===-1)assert.ok(lg.freeAgents.includes(p.id),`Unlisted free agent ${p.id}`);
 assert.ok(Math.abs(ratingLevel(lg)-lg.ratingAnchor)<5,'Long-career rating drift exceeds five points');
 assert.equal(lg.history.length,n+1);assert.equal(lg.celebrations.length,n+1);
 const packed=L.serializeLeague(lg);if(process.env.NHL_QA_DIR)writeFileSync(process.env.NHL_QA_DIR+"/career-checkpoint.txt",packed);assert.ok(packed.length*2<5*1024*1024,`Save exceeds a 5 MiB localStorage budget: ${packed.length*2}`);lg=L.deserializeLeague(packed);assert.ok(lg);
 results.push({year:lg.year,seasons:lg.history.length,players:Object.keys(lg.players).length,retired:lg.retirementArchive?.length || 0,saveBytes:packed.length*2,regularGames,playoffGames});if(reportPath)writeFileSync(reportPath,JSON.stringify({seed:151,seasons:results,completed:results.length===Number(process.env.DYNASTY_SEASONS || 20)},null,2));
 console.log(`${lg.year} preseason: ${lg.history.length} archived seasons, ${Object.keys(lg.players).length} players, ${lg.retirementArchive?.length || 0} archived retirees; ownership/caps/save reload passed`);
}
