import {TEAMS} from './teams.js';
const clubs=new Set(TEAMS.map(t=>t.abbr)),positions=new Set(['C','LW','RW','LD','RD','G']);
export function isHockeyLeague(l){
 if(!l || l.game && l.game!=='rink-gm' || !Array.isArray(l.teams)||l.teams.length!==32||!Number.isInteger(l.userTid)||l.userTid<0||l.userTid>=32||!Array.isArray(l.schedule)||!l.players||typeof l.players!=='object')return false;
 if(l.teams.some((t,i)=>!t||t.id!==i||!clubs.has(t.abbr)||!Array.isArray(t.roster)||!Array.isArray(t.prospects)))return false;
 if(new Set(l.teams.map(t=>t.abbr)).size!==32)return false;
 return Object.entries(l.players).every(([id,p])=>p && p.id===id && positions.has(p.pos) && Number.isFinite(p.ovr) && p.ovr>=40 && p.ovr<=99 && p.attrs && p.stats && p.pstats && Array.isArray(p.career));
}
export const legacyCloudTeam=name=>TEAMS.some(t=>`${t.city} ${t.name}`===name);

// Old trade/news strings were generated before display visibility was enforced.
// Remove rating annotations for currently hidden players; preserve their names,
// transactions, contracts, dates and actual season statistics.
export function sanitizeLegacyNews(lg){
 if(lg.newsVisibilityVersion===1)return;
 const hidden=Object.values(lg.players).filter(p=>p.tid===-2 || p.tid!==lg.userTid && lg.teams[p.tid]?.prospects.includes(p.id));
 const patterns=hidden.map(p=>({name:p.name,re:new RegExp(p.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+' \\((C|LW|RW|LD|RD|G), [4-9]\\d(?=[,)])','g')}));
 const clean=text=>{if(typeof text!=='string')return text;for(const {name,re} of patterns)text=text.replace(re,(_,pos)=>`${name} (${pos}`);return text;};
 for(const entry of [...(lg.transactions||[]),...(lg.wire||[]),...(lg.inbox||[]),...(lg.deadline?.feed||[])]){
  for(const key of ['text','short'])if(entry[key])entry[key]=clean(entry[key]);
  for(const key of ['aGets','bGets'])if(Array.isArray(entry[key]))entry[key]=entry[key].map(clean);
 }
 lg.newsVisibilityVersion=1;
}
