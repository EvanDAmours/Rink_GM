import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLeague,restoreLeague,startRegularSeason} from '../src/engine/league.js';
import {setInjuriesEnabled} from '../src/engine/injuries.js';
import {ensureUniforms,setNumber} from '../src/engine/uniforms.js';
import {verifiedRating,EA_TO_ATTR,upgradeVerifiedData} from '../src/engine/verifiedData.js';
import {refreshLeagueSchedule} from '../src/engine/scheduleRefresh.js';
import {automaticallyHandleRoster} from '../src/engine/autoRoster.js';
import {counts} from '../src/engine/roster.js';
import {createGame,simToEnd,applyResult} from '../src/engine/sim.js';
import {generatePlayer} from '../src/engine/players.js';
import snapshot from '../src/data/schedule2026.json' with {type:'json'};
const make=()=>createLeague({userAbbr:'EDM',seed:123});
test('all 300 published EA profiles retain exact attributes and official OVR',()=>{
 const l=make(),ps=Object.values(l.players).filter(p=>p.ratingData);assert.equal(ps.length,300);
 for(const p of ps){const r=verifiedRating(p);assert.equal(p.ovr,r.ovr);for(const [key,value] of Object.entries(r.stats))if(EA_TO_ATTR[key])assert.equal(p.attrs[EA_TO_ATTR[key]],value,`${p.name}: ${key}`);}
 const m=ps.find(p=>p.name==='Connor McDavid');assert.equal(m.number,97);assert.equal(m.attrs.spw,92);
 assert.ok(Object.values(l.players).filter(p=>p.numberData).length>=680);
});
test('numbers reserve real player slots before generated depth and preserve manual changes',()=>{
 const l=make(),t=l.teams[l.userTid],m=Object.values(l.players).find(p=>p.name==='Connor McDavid');const d=l.players[t.prospects[0]];d.number=97;delete d.numberData;ensureUniforms(l);assert.equal(m.number,97);assert.notEqual(d.number,97);
 const unused=Array.from({length:98},(_,i)=>i+1).find(n=>![...t.roster,...t.prospects].some(id=>l.players[id].number===n));assert.ok(setNumber(l,m.id,unused).ok);restoreLeague(l);assert.equal(m.number,unused);
});
test('established saves and custom ratings are not reset by migration',()=>{
 const l=make(),m=Object.values(l.players).find(p=>p.name==='Connor McDavid');delete m.ratingData;m.attrs.spw=87;m.ovr=96;l.phase='regular';m.stats.gp=10;restoreLeague(l);assert.equal(m.attrs.spw,87);assert.equal(m.ovr,96);
 m.ratingsEdited=true;upgradeVerifiedData(l,{replaceRatings:true});assert.equal(m.attrs.spw,87);
 delete m.ratingsEdited;upgradeVerifiedData(l,{replaceRatings:true});assert.equal(m.attrs.spw,92);
});
test('injuries disabled before creation and during a save heal all players and clear LTIR',()=>{
 const off=createLeague({userAbbr:'EDM',seed:123,injuries:false});assert.ok(Object.values(off.players).every(p=>!p.injury));
 const l=make(),ps=Object.values(l.players);ps[0].injury=25;ps[0].ltir={day:0,gp:0};ps[0].injuryNote='knee';l.teams[ps[0].tid].ltirUnused=5;
 assert.ok(setInjuriesEnabled(l,false)>0);assert.ok(ps.every(p=>!p.injury && !p.ltir && !p.injuryNote));assert.ok(l.teams.every(t=>t.ltirUnused==null));
 const s=createGame(l,l.teams[0],l.teams[1]);simToEnd(s);applyResult(l,s);assert.ok(ps.every(p=>!p.injury));
 const restored=restoreLeague(JSON.parse(JSON.stringify(l)));assert.equal(restored.settings.injuries,false);setInjuriesEnabled(restored,true);assert.equal(restored.settings.injuries,true);
});
test('auto roster demotes lowest eligible excess while maintaining healthy positional depth',()=>{
 const l=createLeague({userAbbr:'EDM',injuries:false,seed:123}),t=l.teams[l.userTid];
 const p=generatePlayer('LW',45,19,l.year,{tid:t.id});p.cap=.95;p.yrs=2;p.signed=true;l.players[p.id]=p;t.roster.push(p.id);
 assert.ok(counts(l,t).active>23);const r=automaticallyHandleRoster(l,t);assert.ok(r.moved.includes(p.name));assert.ok(t.prospects.includes(p.id));const h=counts(l,t,{healthyOnly:true});assert.ok(h.F>=12 && h.D>=6 && h.G>=2);assert.ok(counts(l,t).active<=23);
});
test('schedule refresh uses validated server data and labels blocked-network fallback honestly',async()=>{
 const l=make();const r=await refreshLeagueSchedule(l,{protocol:'https:',fetcher:async()=>({ok:true,json:async()=>snapshot})});assert.ok(r.live);assert.equal(l.scheduleInfo.kind,'official');
 const f=make();const before=JSON.stringify(f.schedule);const result=await refreshLeagueSchedule(f,{protocol:'file:',fetcher:async()=>{throw Error('CORS')}});assert.ok(result.ok);assert.equal(result.live,false);assert.equal(f.scheduleInfo.kind,'snapshot');assert.match(result.msg,/not a live update/);assert.equal(JSON.stringify(f.schedule),before);
 startRegularSeason(f);assert.equal((await refreshLeagueSchedule(f)).ok,false);
});

test('automatic handling can settle approved non-exempt assignments without skipping fixtures',()=>{
 const l=make(),t=l.teams[l.userTid];setInjuriesEnabled(l,false);const before=l.schedule.map(g=>g.played),day=l.day;const m=Object.values(l.players).find(p=>p.name==='Connor McDavid');
 const r=automaticallyHandleRoster(l,t,{allowWaivers:true});assert.ok(r.ok);assert.equal(counts(l,t).active,23);assert.equal(l.day,day);assert.deepEqual(l.schedule.map(g=>g.played),before);assert.ok(t.roster.includes(m.id));assert.ok(r.moved.length>=1);assert.ok(l.waivers.some(w=>w.done));
});
