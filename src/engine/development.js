import {stream,clamp,hashStr} from "./rng.js";
import {isGoalie,isDefense} from "./constants.js";
import {defaultArchetype,computeOvr} from "./ratings.js";
import {syncLines,autoLines} from "./lines.js";
import {callUp,sendDown,canSendDown,capSpace,counts,logTx} from "./roster.js";
import {verifiedRating} from "./verifiedData.js";
import {rollDev,DEV_RANK,primeEnd,growBy} from "./players.js";

export function createAssistant(key,role) {
  const r=stream(key);return {id:key,role,name:`${r.pick(["Pat","Chris","Alex","Daniel","Johan","Mikko"])} ${r.pick(["Mercer","Wilson","Larsson","Roy","Campbell","Lehtinen"])}`,development:r.int(62,92),specialTeams:r.int(62,92),goaltending:r.int(62,92)};
}
export function ensureDevelopment(lg) {
  lg.assistantMarket ||= ["assistant","goalie"].flatMap(role=>Array.from({length:4},(_,i)=>createAssistant(`${lg.year}|${role}|${i}`,role)));
  for(const t of lg.teams){t.staff ||= {assistant:createAssistant(`${t.id}|assistant|initial`,"assistant"),goalie:createAssistant(`${t.id}|goalie|initial`,"goalie")};t.lineExperience ||= {};}
  // Real players get their deliberate development traits once (new leagues and older saves).
  if((lg.devTraitsVersion || 0)<1){assignRealDevTraits(lg);lg.devTraitsVersion=1;}
}

// ---------- Real players' development traits (Gridiron 1.5) ----------
// Every real player's trait is set on purpose, from his age, his rating, his EA abilities and where he
// was drafted, instead of a coin flip. The once-a-decade talents are Generational by name.
export const GENERATIONAL_NAMES = new Set(["Connor McDavid", "Nathan MacKinnon", "Sidney Crosby", "Alex Ovechkin", "Cale Makar", "Macklin Celebrini", "Connor Bedard", "Matvei Michkov", "Matthew Schaefer"]);
// Real draft slots (year, overall) for the players whose pedigree matters most: the top picks of
// recent drafts and the stars who went late.
export const DRAFT_SLOTS = {
  "Alex Ovechkin": [2004, 1], "Evgeni Malkin": [2004, 2], "Sidney Crosby": [2005, 1], "Steven Stamkos": [2008, 1], "Drew Doughty": [2008, 2],
  "John Tavares": [2009, 1], "Victor Hedman": [2009, 2], "Taylor Hall": [2010, 1], "Tyler Seguin": [2010, 2], "Ryan Nugent-Hopkins": [2011, 1],
  "Gabriel Landeskog": [2011, 2], "Jonathan Huberdeau": [2011, 3], "Mark Scheifele": [2011, 7], "Nikita Kucherov": [2011, 58], "Andrei Vasilevskiy": [2012, 19],
  "Connor Hellebuyck": [2012, 130], "Nathan MacKinnon": [2013, 1], "Aleksander Barkov": [2013, 2], "Seth Jones": [2013, 4], "Jake Guentzel": [2013, 77],
  "Aaron Ekblad": [2014, 1], "Sam Reinhart": [2014, 2], "Leon Draisaitl": [2014, 3], "William Nylander": [2014, 8], "David Pastrnak": [2014, 25],
  "Brayden Point": [2014, 79], "Igor Shesterkin": [2014, 118], "Connor McDavid": [2015, 1], "Jack Eichel": [2015, 2], "Mitch Marner": [2015, 4],
  "Zach Werenski": [2015, 8], "Mikko Rantanen": [2015, 10], "Kyle Connor": [2015, 17], "Sebastian Aho": [2015, 35], "Kirill Kaprizov": [2015, 135],
  "Auston Matthews": [2016, 1], "Matthew Tkachuk": [2016, 6], "Adam Fox": [2016, 66], "Nico Hischier": [2017, 1], "Miro Heiskanen": [2017, 3],
  "Cale Makar": [2017, 4], "Elias Pettersson": [2017, 5], "Martin Necas": [2017, 12], "Nick Suzuki": [2017, 13], "Jason Robertson": [2017, 39],
  "Rasmus Dahlin": [2018, 1], "Andrei Svechnikov": [2018, 2], "Brady Tkachuk": [2018, 4], "Quinn Hughes": [2018, 7], "Evan Bouchard": [2018, 10],
  "Jack Hughes": [2019, 1], "Kaapo Kakko": [2019, 2], "Moritz Seider": [2019, 6], "Matt Boldy": [2019, 12], "Cole Caufield": [2019, 15],
  "Alexis Lafreniere": [2020, 1], "Quinton Byfield": [2020, 2], "Tim Stutzle": [2020, 3], "Lucas Raymond": [2020, 4], "Jake Sanderson": [2020, 5],
  "Owen Power": [2021, 1], "Matty Beniers": [2021, 2], "Mason McTavish": [2021, 3], "Luke Hughes": [2021, 4], "Wyatt Johnston": [2021, 23], "Matthew Knies": [2021, 57],
  "Juraj Slafkovsky": [2022, 1], "Logan Cooley": [2022, 3], "Shane Wright": [2022, 4], "Lane Hutson": [2022, 62],
  "Connor Bedard": [2023, 1], "Leo Carlsson": [2023, 2], "Adam Fantilli": [2023, 3], "Will Smith": [2023, 4], "Matvei Michkov": [2023, 7], "Ryan Leonard": [2023, 8],
  "Macklin Celebrini": [2024, 1], "Artyom Levshunov": [2024, 2], "Beckett Sennecke": [2024, 3], "Ivan Demidov": [2024, 5], "Berkly Catton": [2024, 8], "Zeev Buium": [2024, 12],
  "Matthew Schaefer": [2025, 1], "Michael Misa": [2025, 2], "Anton Frondell": [2025, 3], "Porter Martone": [2025, 6], "James Hagens": [2025, 7],
};
const isReal = (p) => p && (p.src === "ea27" || p.src === "est") && p.tid !== -2;
// How good he is for his age, plus his EA abilities and his draft pedigree, on the OVR scale.
export function devScore(p, { abilities = p.ratingData?.abilities, slot = DRAFT_SLOTS[p.name]?.[1] } = {}) {
  const youth = p.age <= 25 ? (25 - p.age) * 1.4 : 0;
  const ab = Math.min(3, Array.isArray(abilities) ? abilities.length : 0) * 0.6;
  const ped = !slot ? 0 : slot === 1 ? 1.5 : slot <= 3 ? 1 : slot <= 10 ? 0.5 : slot >= 60 ? -0.5 : 0;
  return p.ovr + youth + ab + ped;
}
// His deliberate trait. Superstars are the elite for their age (or 95+ veterans, who keep their prime
// longer); Stars the very good; a young player drafted late who is already an NHLer is a late bloomer.
export function realDevTrait(p, info = {}) {
  if (GENERATIONAL_NAMES.has(p.name)) return "generational";
  const abilities = info.abilities ?? p.ratingData?.abilities ?? verifiedRating(p)?.abilities;
  const slot = info.slot ?? DRAFT_SLOTS[p.name]?.[1];
  const s = devScore(p, { abilities, slot });
  if (p.age <= 22 && s >= 102.5) return "generational";
  if ((p.age <= 27 && s >= 95) || p.ovr >= 95) return "superstar";
  if ((p.age <= 27 && s >= 88.5) || p.ovr >= 90) return "star";
  if (p.age <= 24 && slot >= 50) return "late";
  // Everyone else keeps his own (id-fixed) roll, without the top tiers a deliberate table decides.
  const d = rollDev(p.id, p.pot);
  return DEV_RANK[d] >= DEV_RANK.superstar ? (p.age <= 25 ? "star" : "normal") : d === "star" && p.age > 25 ? "normal" : d;
}
export function assignRealDevTraits(lg) {
  let n = 0;
  for (const p of Object.values(lg.players || {})) {
    if (!isReal(p)) continue;
    const d = realDevTrait(p);
    if (p.dev !== d) { p.dev = d; n++; }
    // A Generational talent's ceiling is the Generational tier; a young Superstar's is above him.
    if (p.age <= 25 && d === "generational") p.pot = Math.max(p.pot || 0, Math.min(99, Math.max(96, p.ovr + 4)));
    else if (p.age <= 25 && d === "superstar") p.pot = Math.max(p.pot || 0, Math.min(99, p.ovr + 2));
  }
  return n;
}

// ---------- Season form (Gridiron 1.61) ----------
// Each player's form for a season: most play to their rating, give or take a point; now and then
// one has a career year (or a slump). Fixed per player and season, so a hot year stays hot.
export function seasonForm(id, year) {
  const h = (k) => { let x = hashStr(`${id}|${year}|${k}`); x ^= x >>> 16; x = Math.imul(x, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return ((x >>> 0) + 1) / 4294967297; };
  const z = Math.sqrt(-2 * Math.log(h("a"))) * Math.cos(2 * Math.PI * h("b"));
  return clamp(Math.round(z * 1.5), -4, 4);
}
export const FORM_SHOWN = 3;
// "career year" / "slump" once the season has shown it (ten games in), else null.
export function formLabel(p, year) {
  if (!p || (p.stats?.gp || 0) < 10) return null;
  const f = seasonForm(p.id, year);
  return f >= FORM_SHOWN ? { kind: "hot", text: "Career year", f } : f <= -FORM_SHOWN ? { kind: "cold", text: "Slump", f } : null;
}

// ---------- Role-shaped development (Gridiron 3.27) ----------
// Every regular-season game records where a skater played: his line or pair and his special-teams
// units. At rollover the role he mostly filled tilts his growth: its skills come along faster and the
// ones it never asks of him slower (his overall stays where development put it). Young players adapt most.
export function recordRoles(league, s) {
  for (const k of ["h", "a"]) {
    const L = s[k]?.lines;
    if (!L) continue;
    const at = (rows, id) => (rows || []).findIndex((row) => row?.includes(id));
    for (const id of s[k].dressed || []) {
      const p = league.players[id], b = s.box?.[id];
      if (!p || isGoalie(p.pos) || !(b?.toi > 0)) continue;
      if (p.roles?.y !== league.year) p.roles = { y: league.year, gp: 0, F: [0, 0, 0, 0], D: [0, 0, 0], pp: 0, pk: 0 };
      const r = p.roles;
      r.gp++;
      const f = at(L.F, id), d = at(L.D, id);
      if (f >= 0) r.F[f]++;
      else if (d >= 0) r.D[d]++;
      if (at(L.PP, id) >= 0) r.pp++;
      if (at(L.PK, id) >= 0) r.pk++;
    }
  }
}
export const ROLE_NAME = { top6: "Top-six forward", checking: "Checking-line forward", netfront: "Net-front forward", toppair: "Top-pair defenseman", shutdown: "Shutdown defenseman", pp: "Power play", pk: "Penalty kill" };
export const ROLE_SKILLS = {
  top6: { oaw: 0.25, wac: 0.2, pas: 0.15, puc: 0.15, dek: 0.1, hey: 0.1 },
  netfront: { str: 0.25, hey: 0.25, bal: 0.15, wpw: 0.15, puc: 0.1 },
  checking: { daw: 0.25, stk: 0.2, bch: 0.15, str: 0.1, end: 0.1, fof: 0.1 },
  toppair: { daw: 0.2, pas: 0.2, stk: 0.15, poi: 0.15, oaw: 0.1, puc: 0.1 },
  shutdown: { daw: 0.25, blk: 0.2, stk: 0.15, bch: 0.15, str: 0.15 },
  pp: { pas: 0.25, oaw: 0.25, hey: 0.15, wac: 0.15, spw: 0.1 },
  pk: { daw: 0.3, stk: 0.25, blk: 0.2, dsc: 0.1 },
};
// What he played this season: { role, share (0-1, how settled he was in it), pp, pk } or null.
export function seasonRole(p, year) {
  const r = p?.roles;
  if (!r || (year != null && r.y !== year) || !r.gp || isGoalie(p.pos)) return null;
  const full = Math.min(1, r.gp / 60);
  let role, n;
  if (isDefense(p.pos)) { n = Math.max(r.D[0], r.D[1] + r.D[2]); role = r.D[0] >= r.D[1] + r.D[2] ? "toppair" : "shutdown"; }
  else { const top = r.F[0] + r.F[1], low = r.F[2] + r.F[3]; n = Math.max(top, low); role = top >= low ? (p.type === "PWF" ? "netfront" : "top6") : "checking"; }
  return { role, share: full * (n / r.gp), pp: full * (r.pp / r.gp), pk: full * (r.pk / r.gp), gp: r.gp };
}
// The off-season tilt. Mutates his attributes (keeping his OVR); returns the role he grew into, or null.
export function roleGrowth(p, year, age = p.age) {
  const r = seasonRole(p, year);
  if (!r) return null;
  const adapt = age <= 25 ? 1 : age <= 29 ? 0.7 : 0.35;
  const nudge = {};
  const add = (w, s) => { for (const [k, v] of Object.entries(w)) nudge[k] = (nudge[k] || 0) + adapt * s * v * 6; };
  add(ROLE_SKILLS[r.role], r.share);
  if (r.pp >= 0.5) add(ROLE_SKILLS.pp, r.pp * 0.6);
  if (r.pk >= 0.5) add(ROLE_SKILLS.pk, r.pk * 0.6);
  // The skills the role never asks of him come along a little slower.
  const opposite = r.role === "checking" || r.role === "shutdown" ? ROLE_SKILLS.top6 : ROLE_SKILLS[isDefense(p.pos) ? "shutdown" : "checking"];
  for (const k of Object.keys(opposite)) if (!nudge[k]) nudge[k] = -adapt * r.share * 0.6;
  const before = p.ovr;
  for (const [k, v] of Object.entries(nudge)) if (Number.isFinite(p.attrs[k])) p.attrs[k] = clamp(p.attrs[k] + Math.round(v), 20, 99);
  // Keep his overall: the change is in the shape of his game, not its level.
  const ovrOf = () => clamp(computeOvr(p.attrs, p.type) + (p.ovrOffset || 0), 40, 99);
  const fix = Object.keys(p.attrs).filter((k) => !nudge[k] || nudge[k] < 0.5);
  for (let g = 0, cur = ovrOf(); cur !== before && g < 60; g++, cur = ovrOf()) {
    const k = fix[g % Math.max(1, fix.length)] || "oaw";
    p.attrs[k] = clamp(p.attrs[k] + (cur < before ? 1 : -1), 20, 99);
  }
  p.ovr = ovrOf();
  if (r.share >= 0.5) { p.grewAs = { role: r.role, age, year: year + 1 }; return r.role; }
  return null;
}

// ---------- Big seasons (Gridiron 1.34 and 2.76) ----------
// Season milestones and league leaders (found in awards.js seasonMilestones) pay off at rollover:
// each milestone is worth +1 OVR (two at most); leading the league is a development-trait step for a
// player 26 or under (+1 OVR otherwise); leading it by a landslide makes a cornerstone: +3 OVR, a
// higher ceiling and a better trait up to 29 (a Superstar or older player gets another point instead).
const NEXT_TRAIT = { late: "star", normal: "star", star: "superstar" };
export function awardGrowth(p, award, age = p.age) {
  if (!award) return null;
  let ovr = Math.min(2, award.hits.length), boost = 0, pot = 0, dev = null;
  const notes = [...award.hits];
  if (award.landslides.length) {
    notes.push(...award.landslides, ...award.leads);
    boost = 3; pot = 4;
    if (age <= 29 && NEXT_TRAIT[p.dev]) dev = NEXT_TRAIT[p.dev]; else boost += 1;
  } else if (award.leads.length) {
    notes.push(...award.leads);
    if (age <= 26 && NEXT_TRAIT[p.dev]) dev = NEXT_TRAIT[p.dev]; else ovr += 1;
  }
  return notes.length ? { ovr, boost, pot, dev, notes } : null;
}
// Apply a season's reward. startOvr: his rating before this summer's development. A player past his
// prime has his decline slowed, not reversed (a cornerstone season still counts in full).
export function applyAwardGrowth(p, g, startOvr = p.ovr) {
  const was = { ovr: p.ovr, dev: p.dev };
  // The last points come hard: nothing for a milestone at 93+, one point at most from 90.
  let ovr = p.ovr >= 93 ? 0 : p.ovr >= 90 ? Math.min(1, g.ovr) : g.ovr;
  if (p.age - 1 > primeEnd(p)) ovr = Math.min(ovr, Math.max(0, startOvr - p.ovr));
  if (ovr) growBy(p, ovr);
  if (g.boost) growBy(p, g.boost);
  if (g.pot) p.pot = Math.min(99, Math.max(p.pot || 0, p.ovr) + g.pot);
  if (g.dev && DEV_RANK[g.dev] > DEV_RANK[p.dev]) p.dev = g.dev;
  return { gain: p.ovr - was.ovr, devFrom: p.dev !== was.dev ? was.dev : null };
}
export function hireAssistant(lg,id) {
  if(!["preseason","resign","freeagency"].includes(lg.phase))return {ok:false,msg:"Staff hiring opens in preseason and the offseason."};
  const c=lg.assistantMarket.find(c=>c.id===id),t=lg.teams[lg.userTid];if(!c)return {ok:false,msg:"That coach is unavailable."};
  const old=t.staff[c.role];t.staff[c.role]=c;lg.assistantMarket=lg.assistantMarket.filter(x=>x.id!==id);if(old)lg.assistantMarket.push(old);
  return {ok:true,msg:`${c.name} hired as ${c.role} coach.`};
}
export function schemeFit(p,t) {
  const style=t.strategy || t.coach?.style || "balanced";
  const preferred=style==="attack"?["SNP","PLY","OFD"]:style==="defend"?["TWF","DFD","TWD","GRN"]:["PWF","TWF","TWD"];
  return preferred.includes(p.type)?.7:0;
}
export function lineChemistry(lg,t,ids) {
  const players=ids.map(id=>lg.players[id]).filter(Boolean),types=new Set(players.map(p=>p.type));
  const complementary=types.has("PLY") && types.has("SNP")?1:types.size>=3?.4:0;
  const experience=t.lineExperience[ids.join("|")] || 0;
  return Math.min(2,complementary+experience/26);
}
export function coachingEffects(lg,t) {
  ensureDevelopment(lg);return {pp:1+((t.staff.assistant.specialTeams+(t.coach?.specialTeams ?? 78))/2-78)*.002,pk:1+(t.staff.assistant.specialTeams-78)*.0018,goalie:(t.staff.goalie.goaltending-78)*.03};
}
export function developmentWeek(lg) {
  ensureDevelopment(lg);const week=Math.floor(lg.day/7);
  for(const t of lg.teams){
    if((t.farmWeek || 0)>=week)continue;
    const elapsed=week-(t.farmWeek || 0);t.farmWeek=week;
    for(const line of t.lines?.F || []){const key=line.join("|");t.lineExperience[key]=Math.min(26,(t.lineExperience[key] || 0)+elapsed);}
    for(const id of [...t.roster,...t.prospects]){
      const p=lg.players[id];if(!p)continue;
      if(p.positionTraining && !p.injury){p.positionTraining.weeks+=elapsed;if(p.positionTraining.weeks>=8){
        const to=p.positionTraining.to;p.naturalPos ||= p.pos;p.pos=to;p.type=defaultArchetype(to);delete p.ovrOffset;p.ovr=Math.min(99,Math.max(40,computeOvr(p.attrs,p.type)+(p.ovrOffset || 0)));p.pot=Math.max(p.pot,p.ovr);delete p.positionTraining;
        if(t.lines){t.lines.F=t.lines.F.map(line=>line.map(x=>x===id?null:x));t.lines.D=t.lines.D.map(line=>line.map(x=>x===id?null:x));syncLines(lg,t);}
        logTx(lg,`${p.name} completes position training at ${to}`,[t.id]);
      }}
      if(!t.prospects.includes(id) || p.injury>0)continue;
      if(p.farmStats && p.farmStats.year!==lg.year)p.farmStats=null;const st=p.farmStats ||= {gp:0,g:0,a:0,w:0,sa:0,ga:0,year:lg.year};
      const role=p.farmRole || "middle",usage=role==="top"?1.15:role==="depth"?.7:1;
      const r=stream(`${id}|farm|${lg.year}|${week}`);
      // Games this week at his level: AHL/junior clubs play about twice a week, college
      // closer to once, Europe in between. Goalies share the crease by role.
      const perWeek=p.assignment==="college"?1.2:p.assignment==="europe"?1.6:p.assignment==="junior"?2.3:2;
      const share=isGoalie(p.pos)?(role==="top"?.75:role==="depth"?.25:.5):(role==="depth"?.85:1);
      let games=0;for(let i=0;i<elapsed;i++){const n=perWeek*share*(.7+r.next()*.6);games+=Math.floor(n)+(r.next()<n-Math.floor(n)?1:0);}
      if(games<=0){p.developmentHistory ||= [];p.developmentHistory.push({year:lg.year,week,assignment:p.assignment,role,games:0,minutes:0,ovr:p.ovr});if(p.developmentHistory.length>80)p.developmentHistory.shift();continue;}
      st.gp+=games;
      const minutes=isGoalie(p.pos)?60:role==='top'?(isDefense(p.pos)?24:21):role==='depth'?9:16;
      st.toi=(st.toi || 0)+games*minutes*60;
      const competition=p.assignment==='ahl'?1.1:p.assignment==='college'?1:p.assignment==='europe'?1.05:.9;
      const challenge=p.ovr>=78 && p.assignment==='junior'?.65:1;
      p.developmentHistory ||= [];
      p.developmentHistory.push({year:lg.year,week,assignment:p.assignment,role,games,minutes,ovr:p.ovr});
      if(p.developmentHistory.length>80)p.developmentHistory.shift();
      if(isGoalie(p.pos)){
        // Save percentage tracks how far above the level he is; wins follow it.
        const level=p.assignment==='ahl'?72:p.assignment==='europe'?70:p.assignment==='college'?66:62;
        const sv=clamp(.893+(p.ovr-level)*.0022+(r.next()-.5)*.012,.86,.94);
        const sa=games*(26+Math.round(r.next()*8));st.sa+=sa;st.ga+=Math.round(sa*(1-sv));
        st.w+=Math.round(games*clamp(.3+(sv-.9)*6,.15,.8));
      } else {
        // Points per game against the level he is playing at, then a position/type goal share.
        const level=p.assignment==='ahl'?70:p.assignment==='europe'?68:p.assignment==='college'?64:60;
        const base=isDefense(p.pos)?.35:.75;
        const ppg=clamp(base+(p.ovr-level)*.045*usage,.05,2.2);
        // Fractional carry so a defenceman's goals and a depth forward's points add up
        // over a season instead of rounding away each week.
        st.px=(st.px || 0)+games*ppg*(.7+r.next()*.6);const pts=Math.floor(st.px);st.px-=pts;
        const gShare=isDefense(p.pos)?.28:p.type==='SNP'?.56:p.type==='PWF'?.5:p.type==='PLY'?.36:.44;
        st.gx=(st.gx || 0)+pts*gShare*(.8+r.next()*.4);const goals=Math.min(pts,Math.floor(st.gx));st.gx-=goals;
        st.g+=goals;st.a+=pts-goals;
      }
      p.farmWork=(p.farmWork || 0)+elapsed*usage*competition*challenge*(.6+(t.coach.development+t.staff[isGoalie(p.pos)?"goalie":"assistant"].development)/300+(t.arena?.training || 0)*.05);
    }
  }
}
export function usageGrowth(lg,p) {
  if(p.age>26)return 0;
  const t=lg.teams[p.tid];if(!t)return 0;
  if(t.prospects.includes(p.id))return Math.min(.7,(p.farmWork || 0)/50);
  const s=p.stats;
  const share=isGoalie(p.pos)?s.gp/45:s.gp?Math.min(1,s.toi/s.gp/(isDefense(p.pos)?1200:900)):0;
  return clamp((share-.45)*.65,-.25,.45);
}
export function requestPosition(lg,pid,to) {
  const p=lg.players[pid];if(!p || p.tid!==lg.userTid || p.pos==="G" || !["C","LW","RW","LD","RD"].includes(to) || to===p.pos)return {ok:false,msg:"Choose another skater position."};
  if(p.positionTraining)return {ok:false,msg:"A position course is already in progress."};
  p.positionTraining={to,weeks:0};return {ok:true,msg:`Eight healthy scouting weeks of training started at ${to}.`};
}
export function runCampBattles(lg) {
  const t=lg.teams[lg.userTid];if(lg.phase!=="preseason" || t.battlesYear===lg.year)return {ok:false,msg:"Camp battles run once each preseason."};
  const reports=[];
  for(const pos of ["C","LW","RW","LD","RD","G"]){
    const candidates=[...t.roster,...t.prospects].map(id=>lg.players[id]).filter(p=>p && p.pos===pos && !p.injury && !p.ltir).sort((a,b)=>b.ovr-a.ovr);
    const pair=candidates.filter(p=>p.age<=25).slice(0,2);if(pair.length<2 || Math.abs(pair[0].ovr-pair[1].ovr)>5)continue;
    const scores=pair.map(p=>({p,score:p.ovr+stream(`${p.id}|battle|${lg.year}`).next()*5})).sort((a,b)=>b.score-a.score);
    const winner=scores[0].p;reports.push({pos,winner:winner.id,name:winner.name,other:scores[1].p.name});
    if(t.prospects.includes(winner.id) && counts(lg,t).active<23 && capSpace(lg,t)>=winner.cap)callUp(lg,t,winner.id);
  }
  t.battlesYear=lg.year;t.battleReport=reports;return {ok:true,msg:`Camp resolved ${reports.length} position battles. Promotions respect cap, roster and waiver constraints.`};
}
export function resetDevelopment(lg){for(const t of lg.teams)t.farmWeek=0;for(const p of Object.values(lg.players)){if(p.farmStats){(p.farmHistory ||= []).push(p.farmStats);delete p.farmStats;}p.farmWork=0;}ensureDevelopment(lg);}
