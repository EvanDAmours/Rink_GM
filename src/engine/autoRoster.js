import {counts,capSpace,sendDown,canSendDown,ensureMinimums,rosterIssues,logTx,capYear} from './roster.js';
import {isGoalie,isDefense,MAX_ROSTER,MIN_FORWARDS,MIN_DEFENSE,MIN_GOALIES} from './constants.js';
import {buriedCap} from './hockeyRules.js';
import {placeWaivers,processWaivers} from './operations.js';
import {lineupIds,syncLines} from './lines.js';
const group=p=>isGoalie(p.pos)?'G':isDefense(p.pos)?'D':'F';
const minimum={F:MIN_FORWARDS,D:MIN_DEFENSE,G:MIN_GOALIES};

export function automaticRosterPlan(league,team=league.teams[league.userTid],{allowWaivers=true}={}){
  const lg=structuredClone(league),t=lg.teams[team.id],moves=[];
  for(let guard=0;guard<50;guard++){
    const tooMany=counts(lg,t).active>MAX_ROSTER,overCap=capSpace(lg,t)<0;if(!tooMany && !overCap)break;
    const h=counts(lg,t,{healthyOnly:true}),onIce=new Set(lineupIds(t.lines));
    const positional=t.roster.map(id=>lg.players[id]).filter(p=>p && !p.injury && !p.ltir);
    const candidates=positional.filter(p=>{
      if(p.clause?.type==='NMC' || p.waiverPending || p.offerSheetPending || h[group(p)]<=minimum[group(p)])return false;
      if(!allowWaivers && !canSendDown(p))return false;
      const same=positional.filter(q=>q.pos===p.pos).length,floor={C:3,LW:2,RW:2,LD:2,RD:2,G:2}[p.pos] || 0;
      if(same<=floor)return false;
      return !overCap || p.cap-buriedCap(p,capYear(lg))>.001;
    });
    candidates.sort((a,b)=>a.ovr-b.ovr || Number(onIce.has(a.id))-Number(onIce.has(b.id)) || (h[group(b)]-minimum[group(b)])-(h[group(a)]-minimum[group(a)]) || b.cap-a.cap || a.id.localeCompare(b.id));
    const p=candidates[0];if(!p)break;
    moves.push({pid:p.id,name:p.name,pos:p.pos,ovr:p.ovr,waivers:!canSendDown(p)});
    t.roster=t.roster.filter(id=>id!==p.id);t.prospects.push(p.id);p.assignment='ahl';
  }
  return {moves,issues:rosterIssues(lg,t)};
}
export function automaticallyHandleRoster(lg,t=lg.teams[lg.userTid],{allowWaivers=false}={}){
  const plan=automaticRosterPlan(lg,t,{allowWaivers}),moved=[],claimed=[];
  for(const move of plan.moves){
    if(move.waivers){
      const r=placeWaivers(lg,move.pid);if(!r.ok)continue;
      const waiver=lg.waivers.find(w=>w.pid===move.pid && !w.done);if(!waiver)continue;
      // This explicit management action compresses the claim window. Resolve all
      // normal AI/human claims without skipping any scheduled hockey games.
      processWaivers(lg,{resolveIds:[waiver.id]});
      const p=lg.players[move.pid];if(p.tid!==t.id)claimed.push(`${p.name} (${lg.teams[p.tid].abbr})`);
      if(!t.roster.includes(move.pid))moved.push(move.name);
    }else if(sendDown(lg,t,move.pid)){moved.push(move.name);logTx(lg,`${t.abbr} automatically assign ${move.name} (${move.pos}, ${move.ovr} OVR) to the AHL`,[t.id]);}
  }
  if(rosterIssues(lg,t).some(i=>i.startsWith('Need')))ensureMinimums(lg,t,{notify:true});
  syncLines(lg,t);const issues=rosterIssues(lg,t);
  return {ok:issues.length===0,moved,claimed,issues,msg:`${moved.length?`Handled: ${moved.join(', ')}.`:'No eligible excess players could be assigned.'}${claimed.length?` Claimed on waivers: ${claimed.join(', ')}.`:''}${issues.length?' Remaining issues require a trade, signing or manual roster decision.':' Your roster is ready.'}`};
}
