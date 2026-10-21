import {stream} from "./rng.js";
import {randomNameWith} from "./names.js";
import {REAL_PROSPECTS} from "../data/realProspects.js";
import {makeBio,rankClass,prospectRead,csRank,plantHiddenTalent,resetHiddenTalent} from "./scouting.js";
import {createPlayer} from "./players.js";
import {defaultArchetype} from "./ratings.js";
import {evaluateTrade,executeTrade,pickValue} from "./trade.js";
import {currentSlot,visibleRatings} from "./draft.js";

export function ensureFutureClasses(lg) {
  lg.futureClasses ||= {};
  for(let year=lg.year+2;year<=lg.year+3;year++)if(!lg.futureClasses[year]){
    lg.futureClasses[year]=Array.from({length:60},(_,i)=>{const r=stream(`${lg.startYear}|future|${year}|${i}`),n=randomNameWith(r);const real=lg.mode==="real"?REAL_PROSPECTS[year]?.[i]:null;
      return {id:`watch-${year}-${i}`,name:real?.name || n.name,nat:real?.nat || n.nat,pos:real?.pos || r.pick(["C","LW","RW","LD","RD","G"]),lg:real?.lg || r.pick(["OHL","WHL","QMJHL","NCAA","Liiga","SHL"]),team:real?.team || "Club to be confirmed",source:real?.source || null,rank:i+1};});
  }
}
export function seedDraftIdentities(lg,ids,year) {
  const watch=lg.futureClasses?.[year],real=lg.mode==="real"?REAL_PROSPECTS[year] || []:[];
  const records=watch || real;
  for(let i=0;i<Math.min(records.length,ids.length);i++){
    const identity=records[i],old=lg.players[ids[i]];
    if(Object.values(lg.players).some(p=>p.id!==old.id && p.name===identity.name && p.tid!==-2))continue;
    const p=createPlayer({id:old.id,name:identity.name,nat:identity.nat,pos:identity.pos,type:defaultArchetype(identity.pos),ovr:old.ovr,pot:old.pot,age:old.age,src:"draft",tid:-2},lg.year);
    Object.assign(p,{signed:false,rookie:true,consensus:old.consensus,dev:old.dev,scout:old.scout});
    p.bio=makeBio(p);p.bio.lg=identity.lg;p.bio.team=identity.team;p.realIdentity=!!identity.source;p.identitySource=identity.source;
    lg.players[p.id]=p;
  }
  rankClass(lg,ids);
  ensureFutureClasses(lg);
}
export function importDraftClass(lg,rows) {
  if(lg.phase!=="preseason" || lg.draftClass.some(id=>lg.players[id]?.scout?.lvl))return {ok:false,msg:"Import a draft class in preseason before scouting reports are filed."};
  if(!Array.isArray(rows) || !rows.length || rows.length>280)return {ok:false,msg:"Import 1–280 prospect records."};
  const seen=new Set();
  for(const r of rows){if(!r.name || seen.has(r.name) || !["C","LW","RW","LD","RD","G"].includes(r.pos) || !Number.isFinite(r.ovr) || !Number.isFinite(r.pot) || r.ovr<40 || r.ovr>99 || r.pot<r.ovr || r.pot>99)return {ok:false,msg:"Each prospect needs a unique name, hockey position, OVR and POT (40–99)."};if(Object.values(lg.players).some(p=>p.name===r.name && p.tid!==-2))return {ok:false,msg:`${r.name} already belongs to the league.`};seen.add(r.name);}
  rows.forEach((r,i)=>{const old=lg.players[lg.draftClass[i]],p=createPlayer({id:old.id,name:r.name,nat:r.nat || "",pos:r.pos,ovr:r.ovr,pot:r.pot,age:r.age || 18,tid:-2,src:"draft"},lg.year);p.signed=false;p.consensus=old.consensus;p.scout={lvl:0,base:{...old.scout.base}};p.bio=makeBio(p);if(r.lg)p.bio.lg=r.lg;if(r.team)p.bio.team=r.team;p.identitySource=r.source || "User-imported class";p.realIdentity=true;lg.players[p.id]=p;});
  rankClass(lg,lg.draftClass);
  // The imported class gets its own hidden gems and red flags, planted after the board is set.
  resetHiddenTalent(lg,lg.draftClass);plantHiddenTalent(lg,lg.draftClass,lg.draftClassYear);
  return {ok:true,msg:`Imported ${rows.length} prospect identities. Unfilled slots retain fictional depth.`};
}
export function tradeUpOffers(lg) {
  const current=currentSlot(lg);if(!current || current.owner===lg.userTid || lg.draft.stage!=="live")return [];
  const target=lg.draftPicks.find(p=>p.year===lg.draft.year && p.orig===current.orig && p.round===current.round && p.owner===current.owner);if(!target)return [];
  const own=lg.draftPicks.filter(p=>p.owner===lg.userTid && p.year>=lg.draft.year).sort((a,b)=>pickValue(lg,b)-pickValue(lg,a));
  const offer={from:lg.userTid,to:current.owner,give:[],get:[],givePicks:[],getPicks:[target.id]};
  for(const p of own){offer.givePicks.push(p.id);if(evaluateTrade(lg,offer).accept)return [{...offer,overall:current.overall}];if(offer.givePicks.length>=3)break;}
  return [];
}
export function acceptTradeUp(lg,o) {
  const available=tradeUpOffers(lg).find(x=>JSON.stringify(x.givePicks)===JSON.stringify(o.givePicks) && JSON.stringify(x.getPicks)===JSON.stringify(o.getPicks));
  if(!available)return {ok:false,msg:"The trade-up package is no longer available."};
  const done=executeTrade(lg,available);return {ok:!!done,msg:done?`Moved up to pick #${available.overall}.`:"Trade failed revalidation."};
}
export function compareProspects(lg,ids) {
  return ids.slice(0,3).map(id=>lg.players[id]).filter(Boolean).map(p=>({pid:p.id,name:p.name,pos:p.pos,rank:csRank(p),league:p.bio?.lg,team:p.bio?.team,read:prospectRead(lg,p),skills:p.scout?.skills || {},combine:p.combine || null}));
}
export function draftOutcomes(lg,tid) {
  return (lg.draftHistory || []).map(d=>({year:d.year,picks:d.picks.filter(s=>s.owner===tid).map(s=>{const p=lg.players[s.pid];const career=p?.career || [];return {...s,currentOvr:p?visibleRatings(lg,p).ovr:null,status:p?(p.tid===tid?"In organization":p.tid>=0?lg.teams[p.tid].abbr:"Unsigned"):"Left league",games:(p?.stats.gp || 0)+career.reduce((n,c)=>n+(c.s?.gp || 0),0),points:(p?.stats.pts || 0)+career.reduce((n,c)=>n+(c.s?.pts || (c.s?.g || 0)+(c.s?.a || 0)),0)};})}));
}
export function pickLocked(lg,id) {return (lg.offerSheets || []).some(s=>!s.done && s.picks.includes(id)) || (lg.conditions || []).some(c=>!c.done && (c.pickId===id || c.deferId===id));}
export function protectionIssue(lg,offer) {
  for(const c of offer.protections || []){
    const p=lg.draftPicks.find(p=>p.id===c.pickId),defer=lg.draftPicks.find(q=>q.orig===p?.orig && q.year===p.year+1 && q.round===1 && q.owner===offer.from);
    if(!p || !offer.givePicks.includes(p.id) || p.round!==1 || p.orig!==offer.from || !defer || pickLocked(lg,p.id) || pickLocked(lg,defer.id) || ![3,5,10].includes(c.threshold))return "Pick protection needs an original first-round pick and the following year's unencumbered first.";
  }
  return null;
}
export function stampProtections(lg,o) {
  for(const c of o.protections || []){const p=lg.draftPicks.find(p=>p.id===c.pickId),defer=lg.draftPicks.find(q=>q.orig===p.orig && q.year===p.year+1 && q.round===1);lg.conditions.push({...c,year:p.year,from:o.from,to:o.to,deferId:defer.id,done:false});}
}
export function resolveProtections(lg,order,year) {
  for(const c of (lg.conditions || []).filter(c=>!c.done && c.year===year)){
    const p=lg.draftPicks.find(p=>p.id===c.pickId),defer=lg.draftPicks.find(p=>p.id===c.deferId);const slot=order.indexOf(p?.orig)+1;
    if(!p || !defer){c.done=true;c.result="Unavailable";continue;}
    if(slot>0 && slot<=c.threshold){p.owner=c.from;defer.owner=c.to;c.result=`Protected at #${slot}; next year's first conveyed`;}else c.result=`Pick conveyed at #${slot}`;
    c.done=true;
  }
}
