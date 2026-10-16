import test from 'node:test';
import assert from 'node:assert/strict';
import LZString from 'lz-string';
import {packLeague,unpackLeague} from '../src/engine/savePacking.js';
import {createLeague,serializeLeague,deserializeLeague,exportLeagueText} from '../src/engine/league.js';
test('schema packing losslessly preserves arrays, numeric precision and arbitrary property names',()=>{
 const value=JSON.parse('{"array":[[],[1,2],null,{"__proto__":{"safe":true}}],"precise":0.12345678901234567,"empty":{},"text":"rinkgmPacked"}');
 assert.deepEqual(unpackLeague(JSON.parse(JSON.stringify(packLeague(value)))),value);assert.equal({}.safe,undefined);
 assert.throws(()=>unpackLeague({rinkgmPacked:1,schemas:[['a']],data:[0,1,2]}));
});
test('packed saves and portable exports retain full history and legacy compressed saves still load',()=>{
 const lg=createLeague({seed:381,userAbbr:'EDM'}),p=Object.values(lg.players)[0];p.career=[{y:2026,t:'EDM',s:{gp:84,toi:1234.567,g:40,a:60,pts:100}}];
 for(const raw of [serializeLeague(lg),exportLeagueText(lg),LZString.compressToUTF16(JSON.stringify(lg)),JSON.stringify({rinkgm:lg.version,league:LZString.compressToBase64(JSON.stringify(lg))})]){
 const restored=deserializeLeague(raw);assert.ok(restored);assert.deepEqual(restored.players[p.id].career,p.career);assert.deepEqual(restored.players[p.id].attrs,p.attrs);
 }
 const plain=LZString.compressToUTF16(JSON.stringify(lg));assert.ok(serializeLeague(lg).length<plain.length*.9,'Repeated player records should use substantially less storage');
});
