import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlayer} from '../src/engine/players.js';
import {generateAttributes} from '../src/engine/ratings.js';
import {createLeague,serializeLeague,deserializeLeague} from '../src/engine/league.js';
import {shownRatings} from '../src/engine/draft.js';
import {cloudSave,cloudLoad,cloudDelete,cloudMeta} from '../src/platform.js';
test('players do not share mutable imported attributes, draft records or statistics',()=>{
 const input={name:'Isolation',pos:'C',ovr:80,attrs:generateAttributes(80,'TWF','C'),draft:{year:2027,pick:10,round:1,tid:0}};
 const a=createPlayer(input,2026),b=createPlayer(input,2026),original=structuredClone(input);
 a.attrs.spd=40;a.draft.pick=1;a.stats.g=99;
 assert.deepEqual(input,original);assert.notEqual(b.attrs.spd,40);assert.equal(b.draft.pick,10);assert.equal(b.stats.g,0);
});
test('two leagues and saved copies own independent player records and verified-rating metadata',()=>{
 const a=createLeague({seed:77,userAbbr:'EDM'}),id=Object.values(a.players).find(p=>p.name==='Connor McDavid').id;
 const before=structuredClone(a.players[id]),b=createLeague({seed:77,userAbbr:'EDM'});Object.values(b.players).find(p=>p.name==='Connor McDavid').attrs.spw=40;
 assert.deepEqual(a.players[id],before);
 const c=deserializeLeague(serializeLeague(a));c.players[id].stats.g=99;c.players[id].ratingData.keys.push('test');
 assert.equal(a.players[id].stats.g,0);assert.ok(!a.players[id].ratingData.keys.includes('test'));
});
test('missing or partial scouting records never fall back to hidden exact ratings',()=>{
 for(const scout of [undefined,{}, {base:{}},{lvl:1,eOvr:70,ePot:80}]){
  const p={ovr:99,pot:99,scout};const shown=shownRatings(p);assert.notEqual(shown.ovr,99);assert.notEqual(shown.pot,99);assert.equal(shown.exact,false);
 }
});
test('cloud saves stay scoped to the current account and refuse to move a bound league across accounts',async()=>{
 let account='account-A';const docs=new Map();
 const ref=path=>({set:async data=>{docs.set(path,structuredClone(data));},get:async()=>({exists:docs.has(path),data:()=>structuredClone(docs.get(path))}),delete:async()=>docs.delete(path),collection:name=>({doc:id=>ref(`${path}/${name}/${id}`)})});
 globalThis.window={claude:{use:async name=>name==='db'?{doc:ref}:name==='user'?{id:async()=>account}:null}};
 const league=tag=>({userTid:0,teams:[{city:tag,name:'Team'}],year:2026,phase:'regular',marker:tag});
 const a=league('PRIVATE_A');assert.equal(await cloudSave(a),true);
 account='account-B';assert.equal(await cloudLoad(),null);assert.equal(await cloudSave(a),false);
 const b=league('PRIVATE_B');assert.equal(await cloudSave(b),true);assert.equal((await cloudLoad()).marker,'PRIVATE_B');
 account='account-A';assert.equal((await cloudLoad()).marker,'PRIVATE_A');await cloudDelete();assert.equal(await cloudLoad(),null);
 account='account-B';assert.equal((await cloudLoad()).marker,'PRIVATE_B');
 account='account-C';docs.set('data/users/account-C/save',{game:'gridiron-gm',team:'Dallas Cowboys',n:1,saveId:'foreign'});
 assert.equal(await cloudMeta(),null);assert.equal(await cloudLoad(),null);
 const {default:LZString}=await import('lz-string'),legacy=league('LEGACY_HOCKEY'),packed=LZString.compressToBase64(JSON.stringify(legacy));
 docs.set('data/users/account-C/save',{team:'Edmonton Oilers',n:1,saveId:'legacy'});docs.set('data/users/account-C/save/chunks/c0',{saveId:'legacy',i:0,s:packed});
 const restored=await cloudLoad();assert.equal(restored.marker,'LEGACY_HOCKEY');assert.equal(await cloudSave(restored),true);assert.ok(docs.has('data/users/account-C/rink-gm/save'));
 assert.ok([...docs.keys()].every(k=>k.startsWith('data/users/account-')));
 delete globalThis.window;
});

test('a stale player selection cannot release, assign, recall or sign another team’s player',async()=>{
 const {releasePlayer,sendDown,callUp,signPlayer,addToRoster}=await import('../src/engine/roster.js');
 const lg=createLeague({mode:'random',seed:779}),a=lg.teams[0],b=lg.teams[1],p=lg.players[b.roster[0]],before=JSON.stringify(lg);
 assert.equal(releasePlayer(lg,a,p.id),false);assert.equal(sendDown(lg,a,p.id),false);assert.equal(callUp(lg,a,p.id),false);assert.equal(signPlayer(lg,a,p,1,1),false);assert.equal(addToRoster(lg,a,p),false);
 assert.equal(JSON.stringify(lg),before);
});

test('foreign-game and malformed saves are rejected while genuine legacy hockey saves migrate',()=>{
 const lg=createLeague({mode:'random',seed:449});
 assert.equal(deserializeLeague(JSON.stringify({...lg,game:'gridiron-gm'})),null);
 const foreign=structuredClone(lg);delete foreign.game;Object.values(foreign.players)[0].pos='QB';assert.equal(deserializeLeague(JSON.stringify(foreign)),null);
 const legacy=structuredClone(lg);delete legacy.game;assert.equal(deserializeLeague(JSON.stringify(legacy)).game,'rink-gm');
 const broken=structuredClone(lg);broken.teams[0].id=99;assert.equal(deserializeLeague(JSON.stringify(broken)),null);
});

test('legacy trade headlines cannot keep exposing an opponent prospect’s hidden exact rating',()=>{
 const lg=createLeague({mode:'random',seed:448}),t=lg.teams.find(t=>t.id!==lg.userTid),p=lg.players[t.prospects[0]];delete lg.newsVisibilityVersion;
 lg.wire=[{text:`A club acquires ${p.name} (${p.pos}, 99) in a trade.`,aGets:[`${p.name} (${p.pos}, 99, $1M×2)`]}];
 const restored=deserializeLeague(serializeLeague(lg));assert.ok(!restored.wire[0].text.includes(', 99'));assert.ok(!restored.wire[0].aGets[0].includes(', 99'));assert.ok(restored.wire[0].text.includes(p.name));
});

test('undrafted players and released prospects retain their identities, records and contract accounting',async()=>{
 const {finishDraft,releaseProspect}=await import('../src/engine/draft.js');
 const lg=createLeague({seed:951}),t=lg.teams[lg.userTid],id=lg.draftClass[0],p=lg.players[id],name=p.name;
 finishDraft(lg);assert.equal(lg.players[id],p);assert.equal(p.name,name);assert.equal(p.tid,-1);assert.ok(lg.freeAgents.includes(id));assert.equal(p.moveHistory.at(-1).kind,'undrafted free agent');
 const pick=lg.players[t.prospects[0]],career=structuredClone(pick.career);pick.signed=true;pick.yrs=2;pick.cap=3;pick.age=22;
 assert.equal(releaseProspect(lg,pick.id),true);assert.equal(lg.players[pick.id],pick);assert.deepEqual(pick.career,career);assert.ok(lg.freeAgents.includes(pick.id));assert.ok(!t.prospects.includes(pick.id));assert.ok(t.deadCap.length>0);
 assert.equal(releaseProspect(lg,pick.id),false);assert.equal(lg.freeAgents.filter(x=>x===pick.id).length,1);
});
