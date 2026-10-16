import snapshot from '../data/verifiedPlayerData.json' with {type:'json'};
import roster from '../data/nhl27-rosters.json' with {type:'json'};
import {generateAttributes,computeOvr} from './ratings.js';

const aliases={matthewboldy:'mattboldy',michaelmatheson:'mikematheson',gabevilardi:'gabrielvilardi',christophertanev:'christanev',benjaminkindel:'benkindel',johnjasonpeterka:'jjpeterka'};
export function identity(name){const n=String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');return aliases[n] || n;}
const byName=new Map();
for(const r of snapshot.ratings){const key=identity(r.name);byName.set(key,[...(byName.get(key) || []),r]);}
export const EA_TO_ATTR={acceleration:'acc',agility:'agi',balance:'bal',endurance:'end',speed:'spd',slapshotAccuracy:'sac',slapshotPower:'spw',wristshotAccuracy:'wac',wristshotPower:'wpw',deking:'dek',handeye:'hey',passing:'pas',puckControl:'puc',bodyChecking:'bch',strength:'str',aggression:'agr',durability:'dur',fightingSkill:'fgt',defensiveAwareness:'daw',shotBlocking:'blk',stickChecking:'stk',faceoffs:'fof',discipline:'dsc',offensiveAwareness:'oaw',poise:'poi',glovesideHigh:'glh',glovesideLow:'gll',sticksideHigh:'sth',sticksideLow:'stl',fiveHole:'fiv',angles:'pos',reboundControl:'reb',breakaway:'brk',vision:'vis',pokeCheck:'pok',shotRecover:'rec',puckplayingFrequency:'pfq',aggressiveness:'gag'};
export function verifiedRating(p){const candidates=(byName.get(identity(p.name)) || []).filter(r=>(r.pos==='G')===(p.pos==='G'));return candidates.length===1?candidates[0]:null;}
export function applyVerifiedRating(p){
  const r=verifiedRating(p);if(!r)return false;
  const attrs={...generateAttributes(r.ovr,p.type,p.pos)};
  const keys=[];
  for(const [name,value] of Object.entries(r.stats)){const key=EA_TO_ATTR[name];if(key){attrs[key]=value;keys.push(key);}}
  p.attrs=attrs;p.ovr=r.ovr;p.ovrOffset=r.ovr-computeOvr(attrs,p.type);
  p.src='ea27';p.pot=Math.max(p.pot || r.ovr,r.ovr);
  p.ratingData={edition:snapshot.edition,retrieved:snapshot.retrieved,source:r.source,id:r.id,keys,baseAttrs:{...attrs},baseOvr:r.ovr,abilities:structuredClone(r.abilities)};
  return true;
}
export function verifiedNumber(p,abbr){
  const candidates=(snapshot.numbers[abbr] || []).filter(r=>identity(r.name)===identity(p.name));
  if(candidates.length===1)return {number:candidates[0].number,source:candidates[0].source};
  // Only use an EA number if its published team matches the roster team.
  const rating=verifiedRating(p);
  const original=Object.entries(roster.teams).find(([team,ps])=>team===abbr && ps.some(q=>identity(q.name)===identity(p.name)));
  const teamNames={MTL:'Montreal Canadiens',UTA:'Utah Mammoth'};
  if(rating && original && Number.isInteger(rating.number) && rating.number>=1 && rating.number<=98){
    const names={BOS:'Boston Bruins',BUF:'Buffalo Sabres',DET:'Detroit Red Wings',FLA:'Florida Panthers',OTT:'Ottawa Senators',TBL:'Tampa Bay Lightning',TOR:'Toronto Maple Leafs',CAR:'Carolina Hurricanes',CBJ:'Columbus Blue Jackets',NJD:'New Jersey Devils',NYI:'New York Islanders',NYR:'New York Rangers',PHI:'Philadelphia Flyers',PIT:'Pittsburgh Penguins',WSH:'Washington Capitals',CHI:'Chicago Blackhawks',COL:'Colorado Avalanche',DAL:'Dallas Stars',MIN:'Minnesota Wild',NSH:'Nashville Predators',STL:'St. Louis Blues',WPG:'Winnipeg Jets',ANA:'Anaheim Ducks',CGY:'Calgary Flames',EDM:'Edmonton Oilers',LAK:'Los Angeles Kings',SJS:'San Jose Sharks',SEA:'Seattle Kraken',VAN:'Vancouver Canucks',VGK:'Vegas Golden Knights',...teamNames};
    if(rating.team===names[abbr])return {number:rating.number,source:rating.source};
  }
  return null;
}
export function upgradeVerifiedData(lg,{replaceRatings=false}={}){
  if(lg.mode!=='real')return {ratings:0,numbers:0};
  let ratings=0,numbers=0;
  for(const p of Object.values(lg.players)){
    if(!['ea27','est'].includes(p.src))continue;
    // Preserve imported/custom ratings and evolved dynasties on automatic load.
    const pristine=lg.year===(lg.startYear || 2026) && lg.phase==='preseason' && !p.stats?.gp && !p.career?.length;
    if(!p.ratingsEdited && !p.ratingData && (pristine || replaceRatings) && applyVerifiedRating(p))ratings++;
    if(!p.numberEdited && !p.numberData && p.tid>=0 && !p.career?.length){
      const n=verifiedNumber(p,lg.teams[p.tid].abbr);
      if(n){p.number=n.number;p.numberData={...n,retrieved:snapshot.retrieved,team:lg.teams[p.tid].abbr};numbers++;}
    }
  }
  return {ratings,numbers};
}
export const verifiedDataSummary={ratings:snapshot.ratings.length,numbers:Object.values(snapshot.numbers).flat().length,retrieved:snapshot.retrieved};
