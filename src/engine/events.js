import {seed,snapshotRng,restoreRng} from "./rng.js";
import {isGoalie,isDefense} from "./constants.js";
import {createGame,simToEnd,blankRecord} from "./sim.js";
import {autoLines} from "./lines.js";
import {generatePlayer} from "./players.js";

// Known nationalities supplement roster rows without a country. Unknowns are excluded.
const NATIONALITY={"Connor McDavid":"CAN","Nathan MacKinnon":"CAN","Cale Makar":"CAN","Sidney Crosby":"CAN","Brad Marchand":"CAN","Mitch Marner":"CAN","Sam Reinhart":"CAN","Brayden Point":"CAN","Jordan Binnington":"CAN","Darcy Kuemper":"CAN","Logan Thompson":"CAN","Stuart Skinner":"CAN","Auston Matthews":"USA","Jack Eichel":"USA","Jack Hughes":"USA","Quinn Hughes":"USA","Matthew Tkachuk":"USA","Brady Tkachuk":"USA","Adam Fox":"USA","Connor Hellebuyck":"USA","Jake Oettinger":"USA","Thatcher Demko":"USA","Sebastian Aho":"FIN","Mikko Rantanen":"FIN","Aleksander Barkov":"FIN","Miro Heiskanen":"FIN","Esa Lindell":"FIN","Juuse Saros":"FIN","Kevin Lankinen":"FIN","William Nylander":"SWE","Elias Pettersson":"SWE","Victor Hedman":"SWE","Erik Karlsson":"SWE","Rasmus Dahlin":"SWE","Linus Ullmark":"SWE","Jacob Markstrom":"SWE","Filip Gustavsson":"SWE","Nikita Kucherov":"RUS","Alex Ovechkin":"RUS","Igor Shesterkin":"RUS","Andrei Vasilevskiy":"RUS","Sergei Bobrovsky":"RUS","Leon Draisaitl":"GER","Tim Stutzle":"GER"};
export function eventRoster(lg,country,junior=false){
  const ps=Object.values(lg.players).filter(p=>!p.injury && !p.ltir && (junior?p.age<=20:p.tid>=0));
  const fits=p=>{const nat=p.nat || NATIONALITY[p.name];return country==="World"?nat && !["CAN","USA","SWE","FIN"].includes(nat):nat===country;};
  const pool=ps.filter(fits).sort((a,b)=>b.ovr-a.ovr);const ids=[];
  for(const [group,n] of [["F",12],["D",6],["G",2]])ids.push(...pool.filter(p=>(isGoalie(p.pos)?"G":isDefense(p.pos)?"D":"F")===group).slice(0,n).map(p=>p.id));
  return ids;
}
export function playShowcase(lg,kind){
  if(!["allstar","juniors"].includes(kind))return {ok:false,msg:"Choose an event."};
  lg.showcases ||= [];if(lg.showcases.some(e=>e.year===lg.year && e.kind===kind))return {ok:false,msg:"This season's event is complete."};
  if(lg.phase!=="regular")return {ok:false,msg:"Exhibitions take place during the regular season."};
  const calendarDate=new Date(Date.parse((lg.scheduleStart || `${lg.year}-09-29`)+"T12:00:00Z")+lg.day*86400000);
  const opens=kind==="juniors"?Date.UTC(lg.year,11,26):Date.UTC(lg.year+1,1,6);
  if(calendarDate.getTime()<opens)return {ok:false,msg:kind==="juniors"?"The junior showcase opens December 26.":"The All-Star showcase opens February 6."};
  const rng=snapshotRng(),junior=kind==="juniors",countries=junior?["CAN","USA","SWE","FIN"]:["CAN","USA","SWE","FIN","World"];
  try{
    seed(lg.year*100+(junior?1:2));
    const copy={year:lg.year,day:0,settings:lg.settings,players:{},teams:[],inbox:[],transactions:[]};
    countries.forEach((country,id)=>{
      const ids=eventRoster(lg,country,junior),t={id,abbr:country,city:country,name:junior?"Juniors":"All-Stars",roster:[],prospects:[],lines:null,rec:blankRecord(),colors:country==="CAN"?["#df2639","#fff"]:country==="USA"?["#234e89","#df2639"]:country==="SWE"?["#f0cb32","#295da3"]:country==="FIN"?["#fff","#2d5da5"]:["#171f32","#cfac5c"],autoGoalie:false};
      for(const pid of ids){const p=structuredClone(lg.players[pid]);p.tid=id;p.injury=0;delete p.ltir;copy.players[pid]=p;t.roster.push(pid);}
      for(const [group,n] of [["F",12],["D",6],["G",2]])while(t.roster.filter(pid=>(isGoalie(copy.players[pid].pos)?"G":isDefense(copy.players[pid].pos)?"D":"F")===group).length<n){const p=generatePlayer(group==="G"?"G":group==="D"?"LD":"C",junior?60:74,junior?18:24,lg.year,{tid:id,nat:country});p.exhibitionOnly=true;copy.players[p.id]=p;t.roster.push(p.id);}
      copy.teams.push(t);autoLines(copy,t);
    });
    const results=[],table=countries.map((country,tid)=>({country,tid,w:0,gf:0,ga:0}));
    for(let i=0;i<countries.length;i++)for(let j=i+1;j<countries.length;j++){
      const s=createGame(copy,copy.teams[i],copy.teams[j],{exhibition:true,threeOnThree:!junior});simToEnd(s);
      results.push({h:countries[i],a:countries[j],hs:s.score.h,as:s.score.a});table[i].gf+=s.score.h;table[i].ga+=s.score.a;table[j].gf+=s.score.a;table[j].ga+=s.score.h;table[s.score.h>s.score.a?i:j].w++;
    }
    table.sort((a,b)=>b.w-a.w || (b.gf-b.ga)-(a.gf-a.ga));
    const event={kind,year:lg.year,winner:table[0].country,table,results,rosters:copy.teams.map(t=>({country:t.abbr,players:t.roster.map(id=>({pid:id,name:copy.players[id].name,fictional:!!copy.players[id].exhibitionOnly}))}))};
    lg.showcases.unshift(event);return {ok:true,msg:`${table[0].country} win the ${junior?"junior international":"All-Star 3-on-3"} showcase. NHL stats and injuries are unchanged.`};
  }finally{restoreRng(rng);}
}
