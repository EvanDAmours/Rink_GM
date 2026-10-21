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

// Sweater colours, shared by the sweater artwork (ui/Jersey.jsx) and the live rink (ui/LiveRink.jsx).
// Home sweaters are the club's dark colour; road sweaters are white with the number and trim in the
// club's colours. HOME_SWEATER: clubs whose home sweater isn't their first listed colour.
export const HOME_SWEATER={BOS:'#111111',PIT:'#111111',LAK:'#151719',EDM:'#003876',VAN:'#00205b',SEA:'#001628',VGK:'#333f42',ANA:'#f47a38'};
const TRIM={EDM:'#ff4c00'};
export const ROAD_WHITE='#f4f6f8';
const hex6=h=>{const s=String(h || '').trim().replace('#','');const f=s.length===3?s.split('').map(c=>c+c).join(''):s;return /^[0-9a-f]{6}$/i.test(f)?f:'334155';};
const rgb=h=>{const f=hex6(h);return [0,2,4].map(i=>parseInt(f.slice(i,i+2),16));};
export function colorDist(a,b){const [x,y]=[rgb(a),rgb(b)];return Math.hypot(x[0]-y[0],x[1]-y[1],x[2]-y[2]);}
// Relative luminance (0 black to 1 white).
export function luminance(h){const [r,g,b]=rgb(h).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;}
const shade=(h,k)=>'#'+rgb(h).map(v=>Math.round(Math.max(0,Math.min(255,k<0?v*(1+k):v+(255-v)*k))).toString(16).padStart(2,'0')).join('');
const LIGHT=.35;
// The darkest of a club's colours (for numbers on a light sweater).
const darkest=(team,body)=>(team?.colors || []).filter(c=>luminance(c)<.2 && colorDist(c,body)>=90).sort((a,b)=>luminance(a)-luminance(b))[0] || '#111111';

// One club's sweater. away: the white road sweater. alt: the club's second colour (a colour-clash change
// when the road club isn't in white). Returns { body, trim, number, edge, ring, white }: the sweater,
// its stripes, the number and its outline, the outline around the whole sweater, and whether it's the white.
export function sweaterFor(team,{away=false,alt=false}={}){
  const cols=team?.colors || [];
  let main=HOME_SWEATER[team?.abbr] || cols[0] || '#334155';
  let trim=TRIM[team?.abbr] || cols[1] || '#ffffff';
  if(alt){const second=cols.find(c=>colorDist(c,main)>=60);if(second){trim=main;main=second;}}
  if(colorDist(trim,main)<60)trim=cols.find(c=>colorDist(c,main)>=60) || '#ffffff';
  const nearWhite=c=>luminance(c)>.8;
  if(!away){
    const light=luminance(main)>LIGHT;
    const number=light?darkest(team,main):'#ffffff';
    const edge=light?'#ffffff':nearWhite(trim)?shade(main,-.45):trim;
    return {body:main,trim,number,edge,ring:trim,white:false};
  }
  // On the white: the number in the club's colour (its darkest when the colour is pale), edged in its trim.
  const light=luminance(main)>LIGHT;
  const number=light?darkest(team,main):main;
  const edge=nearWhite(trim)?(light?main:shade(number,-.35)):trim===number?main:trim;
  return {body:ROAD_WHITE,trim:light?number:main,number,edge,ring:light?number:main,white:true};
}

// Both clubs' sweaters for a game: home in colour, the road club in white. If the home sweater is pale
// enough to clash with white (an all-star or national side in white), the road club wears its colour,
// switching to its second colour when the two colours are too close.
export function liveSweaters(home,away){
  const h=sweaterFor(home);
  if(colorDist(h.body,ROAD_WHITE)>=150)return {h,a:sweaterFor(away,{away:true})};
  let a=sweaterFor(away);
  if(colorDist(a.body,h.body)<140)a=sweaterFor(away,{alt:true});
  return {h,a};
}
