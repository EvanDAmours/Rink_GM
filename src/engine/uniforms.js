import {stream} from './rng.js';
export const UNIFORM_STYLES=['Classic stripes','Shoulder yoke','Chest band','Heritage hoops'];
export function ensureUniforms(lg,team=null){
  for(const t of team?[team]:lg.teams){t.uniform ||= {style:t.id%4,home:true};const used=new Set();
    const ids=[...t.roster,...t.prospects];
    // Reserve sourced and manually chosen numbers before assigning depth numbers.
    ids.sort((a,b)=>Number(!!(lg.players[b]?.numberData || lg.players[b]?.numberEdited))-Number(!!(lg.players[a]?.numberData || lg.players[a]?.numberEdited)));
    for(const id of ids){const p=lg.players[id];if(!p)continue;
      const retired=(lg.numberRetirements || []).filter(x=>x.tid===t.id).map(x=>x.number);
      if(!Number.isInteger(p.number) || used.has(p.number) || retired.includes(p.number)){const r=stream(`${id}|jersey`);let n=r.int(1,98);while(used.has(n) || retired.includes(n))n=n%98+1;p.number=n;if(p.numberData)delete p.numberData;}used.add(p.number);
    }
  }
}
export function setNumber(lg,pid,number){const p=lg.players[pid],t=lg.teams[lg.userTid];
  if(!p || p.tid!==t.id || !Number.isInteger(number) || number<1 || number>98)return {ok:false,msg:'Choose a jersey number from 1 to 98.'};
  if([...t.roster,...t.prospects].some(id=>id!==pid && lg.players[id]?.number===number) || lg.numberRetirements.some(x=>x.tid===t.id && x.number===number))return {ok:false,msg:'That number is assigned or retired.'};
  p.number=number;p.numberEdited=true;delete p.numberData;return {ok:true,msg:`${p.name} will wear number ${number}.`};
}
