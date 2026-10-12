import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import * as L from '../src/engine/league.js';
import {simPlayoffDay} from '../src/engine/playoffs.js';
import {simDraftToUser,draftDone} from '../src/engine/draft.js';
import {simFADay} from '../src/engine/offseason.js';
import {contractCount,reserveCount,ownedIds} from '../src/engine/hockeyRules.js';
import {qualifyRFA} from '../src/engine/operations.js';
import {isRFA} from '../src/engine/players.js';
import {counts} from '../src/engine/roster.js';
let lg=L.createLeague({userAbbr:'EDM',seed:151});
for(let n=0;n<5;n++){
 L.startRegularSeason(lg);L.simRestOfSeason(lg);L.endRegularSeason(lg);
 while(lg.playoffs.champion==null)simPlayoffDay(lg);
 L.finishPlayoffs(lg);if(n===0 && process.env.NHL_QA_DIR){simDraftToUser(lg);writeFileSync(process.env.NHL_QA_DIR+"/draft-save.txt",L.serializeLeague(lg));}simDraftToUser(lg,{all:true});assert.ok(draftDone(lg));L.completeDraft(lg);
 for(const id of lg.teams[lg.userTid].roster){const p=lg.players[id];if(p.yrs===0 && isRFA(p))qualifyRFA(lg,id);}
 L.goToFreeAgency(lg);while(!simFADay(lg)){}L.beginNextSeason(lg);
 const seen=new Set();for(const t of lg.teams){for(const id of ownedIds(t)){assert.ok(lg.players[id],`Dangling ${id}`);assert.equal(lg.players[id].tid,t.id);assert.ok(!seen.has(id),'Player on two reserve lists');seen.add(id);}assert.ok(contractCount(lg,t)<=50,`${t.abbr}: ${contractCount(lg,t)} contracts`);assert.ok(reserveCount(lg,t)<=90,`${t.abbr}: ${reserveCount(lg,t)} rights`);if(t.id!==lg.userTid){const c=counts(lg,t);assert.ok(c.active<=23 && c.F>=12 && c.D>=6 && c.G>=2,`${t.abbr} invalid roster ${JSON.stringify(c)}`);}}
 assert.equal(lg.history.length,n+1);assert.equal(lg.celebrations.length,n+1);
 lg=L.deserializeLeague(L.serializeLeague(lg));assert.ok(lg);
 console.log(`${lg.year} preseason: ${lg.history.length} archived seasons, ${Object.keys(lg.players).length} players, ${lg.retirementArchive?.length || 0} archived retirees; ownership/caps/save reload passed`);
}
