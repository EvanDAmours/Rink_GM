import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(new URL('../package.json',import.meta.url));
const {createServer}=await import('vite');
const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
const server=await createServer({root,optimizeDeps:{entries:[],noDiscovery:true},server:{middlewareMode:true},appType:'custom'});
try {
 const {createLeague}=await server.ssrLoadModule('/src/engine/league.js');
 const {GameCtx}=await server.ssrLoadModule('/src/ui/common.jsx');
 const lg=createLeague({userAbbr:'EDM',seed:777});
 const ctx={league:lg,commit(){},toast(){},go(){},openTeam(){},openPlayer(){},ask:async()=>true};
 for(const name of ['Dashboard','FrontOfficePage','TrophyRoom','RecordBookPage','RegionalScouting','DraftPage','SchedulePage','LeaguePage','LinesPage','SettingsPage','HockeyOperationsPage','ActivityPage','StandingsPage','TradePage','FreeAgencyPage','PlayoffsPage']){
  const {default:Screen}=await server.ssrLoadModule(`/src/ui/${name}.jsx`);
  const html=renderToStaticMarkup(React.createElement(GameCtx.Provider,{value:ctx},React.createElement(Screen,{act:{}})));
  if(html.length<100)throw new Error(name+' returned empty screen');
  console.log(name,html.length,'bytes');
 }
 const {default:Home}=await server.ssrLoadModule('/src/ui/Dashboard.jsx');
 const {startPlayoffs}=await server.ssrLoadModule('/src/engine/playoffs.js');
 const {startDraft}=await server.ssrLoadModule('/src/engine/draft.js');
 for(const phase of ['regular','playoffs','draft','resign','freeagency']){lg.phase=phase;if(phase==='playoffs')startPlayoffs(lg);if(phase==='draft')startDraft(lg);if(phase==='freeagency')lg.fa={day:0};const html=renderToStaticMarkup(React.createElement(GameCtx.Provider,{value:ctx},React.createElement(Home,{act:{}})));if(html.length<100)throw Error('Empty '+phase);console.log('Dashboard:'+phase,html.length,'bytes');}
 const {default:Ops}=await server.ssrLoadModule('/src/ui/HockeyOperationsPage.jsx');
 for(const view of ['agents','development','career','legacy','draft']){const html=renderToStaticMarkup(React.createElement(GameCtx.Provider,{value:ctx},React.createElement(Ops,{initialView:view})));if(html.length<100)throw Error(view);console.log('HockeyOperations:'+view,html.length,'bytes');}
} finally{await server.close();}
