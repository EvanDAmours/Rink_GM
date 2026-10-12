import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLeague} from '../src/engine/league.js';
import {seed} from '../src/engine/rng.js';
import {createGame,simToEnd,shotSkills,shiftEfficiency} from '../src/engine/sim.js';

test('shot families use their published power and accuracy, with hand-eye for tips',()=>{
 const p={attrs:{sac:90,spw:60,wac:80,wpw:95,hey:97,puc:82,str:88,dek:92,oaw:89}};
 assert.equal(shotSkills(p,'slap shot').power,60);assert.equal(shotSkills(p,'slap shot').accuracy,90);
 assert.equal(shotSkills(p,'wrist shot').power,95);assert.equal(shotSkills(p,'wrist shot').accuracy,80);
 const before=shotSkills(p,'slap shot').finishing;p.attrs.spw=92;assert.ok(shotSkills(p,'slap shot').finishing>before);assert.equal(shotSkills(p,'wrist shot').power,95);
 assert.ok(shotSkills(p,'tip-in').accuracy>shotSkills(p,'wrist shot').accuracy);
});
test('endurance limits fatigue within shifts without permanently reducing ratings',()=>{
 assert.equal(shiftEfficiency(70,20),1);assert.ok(shiftEfficiency(95,55)>shiftEfficiency(60,55));assert.ok(shiftEfficiency(60,55)<shiftEfficiency(60,30));assert.ok(shiftEfficiency(20,500)>=.88);
});
test('live commentary and quick sim resolve identical seeded games without user intervention',()=>{
 const lg=createLeague({mode:'random',seed:92411,injuries:false});
 for(let i=0;i<30;i++){
  seed(7331+i);const quick=createGame(lg,lg.teams[0],lg.teams[1]);simToEnd(quick);
  seed(7331+i);const live=createGame(lg,lg.teams[0],lg.teams[1],{live:true});simToEnd(live);
  assert.deepEqual(live.score,quick.score);assert.deepEqual(live.shots,quick.shots);assert.deepEqual(live.box,quick.box);assert.deepEqual(live.gbox,quick.gbox);assert.deepEqual(live.goals,quick.goals);assert.equal(live.winner,quick.winner);
 }
});
