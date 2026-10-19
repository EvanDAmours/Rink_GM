import {capForYear,minSalaryForYear} from './constants.js';
import {rawPayroll,ltirRelief} from './hockeyRules.js';
// Supported schedule refresh/import replaces the calendar array. Match results
// change played flags, never fixture dates; cache its immutable season length.
const calendarEnds=new WeakMap();
const endDay=lg=>{
 const schedule=lg.schedule,hit=calendarEnds.get(schedule);
 if(hit?.length===schedule.length)return hit.day;
 const day=Math.max(0,...schedule.map(g=>g.day));calendarEnds.set(schedule,{length:schedule.length,day});return day;
};
export function startCapLedger(lg,t){t.capLedger={year:lg.year,startDay:lg.day,lastDay:lg.day-1,spent:0,ltirDays:0,lastPayroll:rawPayroll(lg,t),cash:0,players:{},days:[]};return t.capLedger;}
export function accrueCap(lg,through=lg.day){
 if(lg.phase!=='regular')return;
 const D=endDay(lg)+1,cap=capForYear(lg.year);
 for(const t of lg.teams){const c=t.capLedger?.year===lg.year?t.capLedger:startCapLedger(lg,t);const stop=Math.min(through,D-1);if(stop<=c.lastDay)continue;
  const salary=rawPayroll(lg,t),ltir=ltirRelief(lg,t)>0,charge=ltir?Math.max(cap,salary-ltirRelief(lg,t)):salary;
  const n=stop-c.lastDay;
  c.players ||= {}; c.cash ||= 0;
  for(const id of [...t.roster,...t.prospects]){const p=lg.players[id];if(!p||p.yrs<=0)continue;
   const row=salaryYears(p)[0],b=c.players[id] ||= {base:0,signing:0,estimated:row.estimated!==false};
   const base=row.base*n/D,signing=b.signingBooked?0:row.signing;
   b.base+=base;b.signing+=signing;b.signingBooked=true;c.cash+=base+signing;
  }
  c.spent+=charge*n/D;c.ltirDays+=ltir?n:0;c.lastDay=stop;c.lastPayroll=salary;
  c.days.push({through:stop,days:n,payroll:salary,ltir,spent:c.spent});if(c.days.length>30)c.days.shift();
 }
}
export function capSummary(lg,t){
 const cap=capForYear(lg.year),salary=rawPayroll(lg,t),relief=ltirRelief(lg,t),c=t.capLedger;
 if(!['regular','playoffs','draft'].includes(lg.phase)||!c||c.year!==lg.year)return {cap,payroll:salary,bank:0,available:cap-salary+relief,remainingDays:null,spent:0,estimated:true};
 const D=endDay(lg)+1,remaining=Math.max(0,D-c.lastDay-1),budget=cap*(D-c.startDay)/D;
 const bank=Math.max(0,cap*(c.lastDay-c.startDay+1)/D-c.spent);
 // Once every day has accrued (final day and the playoffs), compliance is the season total:
 // a club that used banked space to add salary at the deadline is not "over the cap".
 const available=remaining===0?Math.max(budget-c.spent,cap-salary+relief):relief>0?cap-salary+relief:(budget-c.spent)*D/remaining-salary;
 return {cap,payroll:salary,bank,available,remainingDays:remaining,spent:c.spent,estimated:c.startDay>0,ltirDays:c.ltirDays};
}
export function salaryYears(p){return p.salarySchedule?.length===p.yrs?p.salarySchedule:Array.from({length:Math.max(0,p.yrs)},()=>({base:p.cap||0,signing:0,performance:0,estimated:true}));}
export function setSalarySchedule(lg,p,rows){
 if(!['preseason','resign','freeagency'].includes(lg.phase)||!p||p.tid!==lg.userTid||!Array.isArray(rows)||p.yrs<1||rows.length!==p.yrs)return {ok:false,msg:'Edit an owned contract schedule in preseason or the offseason.'};
 if(rows.some(r=>!r||typeof r!=='object'||!Number.isFinite(r.base)||!Number.isFinite(r.signing)||r.base<minSalaryForYear(lg.year)||r.signing<0||!Number.isFinite(r.performance ?? 0)||(r.performance ?? 0)<0))return {ok:false,msg:'Enter valid base salary and signing bonuses.'};
 if(rows.some(r=>(r.performance||0)>0 && (!Array.isArray(r.targets) || r.targets.some(b=>!['gp','g','a','pts','w','so'].includes(b.stat)||!Number.isFinite(b.minimum)||b.minimum<1||!Number.isFinite(b.amount)||b.amount<0) || r.targets.reduce((n,b)=>n+b.amount,0)>(r.performance||0)+.001)))return {ok:false,msg:'Performance bonuses need explicit stat, minimum and amount targets within their total allowance.'};
 if(rows.some(r=>(r.performance||0)>0) && !(p.elc || p.age>=35 && p.yrs===1))return {ok:false,msg:'Performance bonuses are restricted to entry-level or eligible one-year 35+ contracts in this model.'};
 const avg=rows.reduce((n,r)=>n+r.base+r.signing,0)/rows.length;
 if(Math.abs(avg-p.cap)>.005)return {ok:false,msg:'The salary/bonus schedule must preserve the agreed average cap hit.'};
 p.salarySchedule=rows.map(r=>({...r,estimated:false}));return {ok:true,msg:'Salary and signing-bonus schedule saved. The cap AAV is unchanged.'};
}
export function buyoutSchedule(p){
 const rows=salaryYears(p),n=rows.length;if(!n)return [];
 const rate=p.age<26?1/3:2/3,annual=rows.reduce((v,r)=>v+r.base,0)*rate/(n*2);
 const over35=p.contractSigningAge>=35;
 return Array.from({length:n*2},(_,i)=>({amt:Math.round((i<n?(over35?p.cap:p.cap-rows[i].base+annual):over35?0:annual)*1000)/1000,yrs:1,offset:i,name:p.name,kind:over35?'35+ conservative charge':'buyout'}));
}

// Bonus targets are explicit contract terms, never awarded randomly. Imported
// contracts have no inferred bonus targets. All amounts are millions.
export function earnedBonus(p,row=salaryYears(p)[0]){
 if(!row)return 0;
 return Math.min(row.performance||0,(row.targets||[]).reduce((n,b)=>n+((p.stats?.[b.stat]||0)>=b.minimum?b.amount:0),0));
}
export function closeCapYear(lg){
 for(const t of lg.teams){
  if(t.capClosedYear===lg.year)continue;
  const contracts=[...t.roster,...t.prospects].map(id=>lg.players[id]).filter(p=>p?.yrs>0);
  const bonuses=contracts.map(p=>({pid:p.id,name:p.name,earned:earnedBonus(p)}));
  const total=bonuses.reduce((n,b)=>n+b.earned,0),c=t.capLedger;
  // Only earned bonuses create carryover; ordinary overspending cannot be hidden
  // in next year's bonus ledger. Midseason imports cannot invent prior spending.
  const overage=c?.year===lg.year?Math.min(total,Math.max(0,c.spent+total-capForYear(lg.year)*(endDay(lg)+1-c.startDay)/(endDay(lg)+1))):0;
  t.bonusCarry={year:lg.year+1,amount:overage};
  (t.capHistory ||= []).push({year:lg.year,spent:c?.spent||0,estimated:!c||c.startDay>0,bonuses,overage,cash:c?.cash||0});
  t.capClosedYear=lg.year;
 }
}
export function buyoutSummary(p,year){
 const rows=buyoutSchedule(p).filter(r=>r.amt!==0);
 return rows.length?'Buyout cap charges: '+rows.map(r=>`${year+(r.offset||0)}: $${r.amt.toFixed(3)}M`).join('; ')+'.':'';
}
