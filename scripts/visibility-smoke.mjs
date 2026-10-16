// Metamorphic smoke test: changing hidden truth must not change rendered HTML,
// including order, tooltips, classes, and inline values. Public scouting records
// and observed production remain fixed throughout each comparison.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(new URL('../package.json',import.meta.url));
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{createServer}=await import('vite');
const server=await createServer({root,optimizeDeps:{entries:[],noDiscovery:true},server:{middlewareMode:true},appType:'custom'});
try{
 const {createLeague}=await server.ssrLoadModule('/src/engine/league.js'),{GameCtx}=await server.ssrLoadModule('/src/ui/common.jsx');
 const lg=createLeague({mode:'random',userAbbr:'EDM',seed:64011,injuries:false}),rival=lg.teams.find(t=>t.id!==lg.userTid),pid=rival.prospects[0];
 const ctx={league:lg,commit(){},toast(){},openPlayer(){},closeModal(){},openTeam(){},go(){},ask:async()=>true};
 const render=async(name,props={})=>{const {default:Screen}=await server.ssrLoadModule(`/src/ui/${name}.jsx`);return renderToStaticMarkup(React.createElement(GameCtx.Provider,{value:ctx},React.createElement(Screen,props)));};
 const change=ids=>{for(const [i,id] of ids.entries()){const p=lg.players[id];p.ovr=i%2?40:99;p.pot=i%2?41:99;p.dev=i%2?'fragile':'late';p.attrs=Object.fromEntries(Object.keys(p.attrs).map(k=>[k,i%2?40:99]));}};
 // Legacy saves must fail closed even when no scouting record survives.
 delete lg.players[pid].scout;
 const card=await render('PlayerModal',{pid});change([pid]);assert.equal(await render('PlayerModal',{pid}),card,'opponent prospect modal exposes hidden truth');
 console.log('Opponent modal: missing scouting data, raw attributes, market value, potential and development protected');
 const team=await render('TeamModal',{tid:rival.id}),trade=await render('TradePage');change(rival.prospects.slice().reverse());
 assert.equal(await render('TeamModal',{tid:rival.id}),team,'opponent prospect ordering exposes hidden truth');assert.equal(await render('TradePage'),trade,'trade list exposes hidden potential');
 console.log('Opponent team and trade lists: hidden potential does not control ordering');
 // An inbound offer and deadline listing must obey the same visibility rule.
 lg.block=[{pid,tid:rival.id,year:lg.year,day:lg.day,reason:'Available',interest:[]}];
 const {OfferCard}=await server.ssrLoadModule('/src/ui/TradeBlockPage.jsx');
 const offer={id:'visibility-offer',tid:rival.id,give:[pid],get:[],givePicks:[],getPicks:[]};
 const renderOffer=()=>renderToStaticMarkup(React.createElement(GameCtx.Provider,{value:ctx},React.createElement(OfferCard,{o:offer})));
 const offerBefore=renderOffer(),block=await render('TradeBlockPage'),deadline=await render('DeadlinePage');
 change([pid]);assert.equal(renderOffer(),offerBefore,'inbound offer exposes hidden ratings');assert.equal(await render('TradeBlockPage'),block,'trade block exposes hidden ratings');assert.equal(await render('DeadlinePage'),deadline,'deadline listings expose hidden ratings');
 console.log('Inbound offers, trade block and deadline listings preserve scouting visibility');
 const before=await render('DraftPage'),profile=await render('PlayerModal',{pid:lg.draftClass[0]}),lab=await render('HockeyOperationsPage',{initialView:'draft'});
 change(lg.draftClass);
 assert.equal(await render('DraftPage'),before,'draft board leaks hidden attributes');assert.equal(await render('PlayerModal',{pid:lg.draftClass[0]}),profile,'draft profile leaks hidden attributes');assert.equal(await render('HockeyOperationsPage',{initialView:'draft'}),lab,'draft lab leaks hidden attributes');
 console.log('Draft board, player profile and comparison lab: hidden truth does not alter public reads');
}finally{await server.close();}
