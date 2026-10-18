import {rosterIssues} from './roster.js';
export const INTERRUPT_DEFAULTS={injuries:true,offers:true,roster:true,promises:true};
export function decisionInterrupt(lg){
 if(!lg || lg.phase!=='regular')return null;
 const settings={...INTERRUPT_DEFAULTS,...lg.settings?.simStops},t=lg.teams[lg.userTid],seen=lg.simStopSeen ||= {};
 const candidates=[];
 if(settings.injuries)for(const id of t.roster){const p=lg.players[id];if(p?.injury>1&&p.ovr>=80)candidates.push([`injury:${id}:${lg.year}:${p.injuryEpisode || p.injuryNote}`,`${p.name} is injured. Review the lineup.`]);}
 if(settings.offers)for(const o of lg.offers || [])if(!o.done&&!o.rejected&&!o.accepted)candidates.push([`offer:${o.id}`,`A trade offer needs your review.`]);
 if(settings.roster){const issues=rosterIssues(lg,t);for(const issue of issues)candidates.push([`roster:${issue.replace(/\$[\d.]+M/g,'amount')}`,issue]);}
 if(settings.promises)for(const id of t.roster){const p=lg.players[id];if(p?.rolePromise?.status==='unhappy')candidates.push([`promise:${id}:${p.rolePromise.misses}`,`${p.name} is unhappy about his promised role.`]);}
 const next=candidates.find(([key])=>!Object.hasOwn(seen,key));if(!next)return null;
 seen[next[0]]=lg.day;return `Simulation paused: ${next[1]}`;
}
