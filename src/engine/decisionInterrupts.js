import {rosterIssues} from './roster.js';
import {automaticallyHandleRoster} from './autoRoster.js';
import {headCoachLines} from './lines.js';
// Injuries no longer stop the sim by default: the weekly injury report card covers them (Gridiron 3.70).
export const INTERRUPT_DEFAULTS={injuries:false,offers:true,roster:true};
export function decisionInterrupt(lg){
 if(!lg || lg.phase!=='regular')return null;
 const settings={...INTERRUPT_DEFAULTS,...lg.settings?.simStops},t=lg.teams[lg.userTid],seen=lg.simStopSeen ||= {};
 const candidates=[];
 if(settings.injuries){
  // Every notable injury since the last pause is one stop, not one per player.
  const hurt=[];for(const id of t.roster){const p=lg.players[id];if(p?.injury>1&&p.ovr>=80){const key=`injury:${id}:${lg.year}:${p.injuryEpisode || p.injuryNote}`;if(!Object.hasOwn(seen,key))hurt.push([key,p]);}}
  if(hurt.length&&lg.settings?.coachLines){
   for(const [key] of hurt)seen[key]=lg.day;
   const moves=headCoachLines(lg,t),who=lg.players,coach=t.coach?.name || 'The head coach';
   const subs=moves.filter(m=>m.out&&m.in).map(m=>`${who[m.in]?.name} in for ${who[m.out]?.name}`);
   lg.inbox?.push({year:lg.year,day:lg.day,text:`👔 ${coach} reset the lines: ${hurt.map(([,p])=>`${p.name} (${p.injury} games)`).join(', ')} out.${subs.length?` ${subs.join('; ')}.`:''}`});
  }
  else if(hurt.length){for(const [key] of hurt)seen[key]=lg.day;const names=hurt.map(([,p])=>`${p.name} (${p.pos} ${p.ovr}, ${p.injury} games)`);return `Simulation paused: ${names.length===1?`${names[0]} is injured.`:`${names.slice(0,-1).join(', ')} and ${names.at(-1)} are injured.`} Review the lineup.`;}
 }
 if(settings.offers)for(const o of lg.offers || [])if(!o.done&&!o.rejected&&!o.accepted)candidates.push([`offer:${o.id}`,`A trade offer needs your review.`]);
 if(settings.roster){
  let issues=rosterIssues(lg,t).filter(x=>!x.startsWith('Need'));
  if(issues.length && lg.settings?.autoRoster!==false){const r=automaticallyHandleRoster(lg,t,{allowWaivers:true});if(r?.moved?.length)lg.inbox?.push({year:lg.year,day:lg.day,text:`🤖 ${r.msg}`});issues=rosterIssues(lg,t).filter(x=>!x.startsWith('Need'));}
  for(const issue of issues)candidates.push([`roster:${issue.replace(/\$[\d.]+M/g,'amount')}`,issue]);
 }
 const next=candidates.find(([key])=>!Object.hasOwn(seen,key));if(!next)return null;
 seen[next[0]]=lg.day;return `Simulation paused: ${next[1]}`;
}
