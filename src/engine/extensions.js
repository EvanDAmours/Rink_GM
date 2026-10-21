import { resignAsk } from "./offseason.js";
import { capForYear, minSalaryForYear, maxSalaryForYear } from "./constants.js";
import { logTx } from "./roster.js";

// Extensions (Gridiron GM 1.72 and 1.91, NHL rules): a player in the last year of his deal can sign
// an extension from July 1 of that season (the free-agency window) through the playoffs. The new
// deal starts when the current one ends, so it has to fit under that season's cap; his cap hit
// today is unchanged.
export const EXT_PHASES = new Set(["freeagency", "preseason", "regular", "playoffs"]);
// The first season an extension signed now covers. From July 1 contracts have already rolled over,
// so a player with one year left is in next season's last year and the new deal begins after it.
export const extStart = (league) => (league.phase === "freeagency" ? league.year + 2 : league.year + 1);

// Money already committed to the season an extension would start in.
export function futurePayroll(league,team) {
  return [...team.roster,...team.prospects].reduce((s,id)=>{const p=league.players[id];return s+(p?.extension?.aav || (p?.signed!==false && p?.yrs>1?p.cap:0));},0)+(team.retained || []).filter(d=>d.yrs>1).reduce((s,d)=>s+d.amt,0)+team.deadCap.filter(d=>d.offset===1 || !d.offset && d.yrs>1).reduce((s,d)=>s+d.amt,0);
}

// Can you extend him right now? { ok, why, start, room }: `why` says, in plain words, what stands
// in the way (not his final year, the wrong time of year, talks broke off, no cap room next season).
export function extensionStatus(league, p) {
  const t = league.teams[league.userTid];
  const money = (n) => `$${n.toFixed(2)}M`;
  if (!p || p.tid !== t.id) return { ok: false, why: "Only your own players can be extended." };
  if (p.signed === false) return { ok: false, why: "Unsigned draft pick: he signs an entry-level deal first." };
  if (p.extension) return { ok: false, why: `Already extended: ${money(p.extension.aav)} × ${p.extension.yrs} from ${p.extension.start}-${String(p.extension.start + 1).slice(2)}.` };
  if (p.holdout) return { ok: false, why: "He's holding out: talk a new deal from his card or Needs Attention." };
  if (!(p.yrs > 0)) return { ok: false, why: league.phase === "resign" ? "His deal is up: re-sign him in this window." : "He has no contract to extend." };
  const lastYear = league.phase === "draft" ? p.yrs <= 1 : p.yrs === 1;
  if (league.phase === "draft" && p.yrs <= 1) return { ok: false, why: "His deal is up after this season: re-sign him in the re-sign window." };
  if (!lastYear) {
    const left = league.phase === "draft" ? p.yrs - 1 : p.yrs;
    return { ok: false, why: `Not in his final year: ${left} years left on his deal. Extensions open on July 1 of his last season.` };
  }
  if (!EXT_PHASES.has(league.phase)) return { ok: false, why: "Extensions open on July 1, when free agency starts." };
  const n = league.negotiations?.[p.id];
  if (n?.year === league.year && (n.status === "walked" || n.talk === "walked")) return { ok: false, why: "Talks broke off this season. His agent will listen again next season." };
  const start = extStart(league);
  const room = Math.round((capForYear(start) - futurePayroll(league, t)) * 100) / 100;
  if (room < minSalaryForYear(start)) return { ok: false, why: `No cap room in ${start}-${String(start + 1).slice(2)}: ${money(room)} left under the projected cap.`, start, room };
  return { ok: true, why: "", start, room };
}

export function extendPlayer(league,pid,aav,years,{agreed=false}={}) {
  const p=league.players[pid],t=league.teams[league.userTid];
  if(!p || p.tid!==t.id || p.signed===false || p.yrs!==1 || p.extension)return {ok:false,msg:"Extensions are available in the final year of a signed contract."};
  if(!EXT_PHASES.has(league.phase))return {ok:false,msg:"Extensions open on July 1 of his final season. Use re-signing for expired contracts."};
  const start=extStart(league);
  if(!Number.isInteger(years) || years<1 || years>7 || !Number.isFinite(aav) || aav<minSalaryForYear(start) || aav>maxSalaryForYear(start))return {ok:false,msg:"Enter a legal 1–7 year contract and a valid AAV."};
  const ask=resignAsk(league,p,years);
  if(!agreed && aav<ask.aav)return {ok:false,msg:`${p.name} asks for $${ask.aav.toFixed(2)}M AAV on that term.`};
  if(futurePayroll(league,t)+aav>capForYear(start))return {ok:false,msg:"That extension exceeds the projected cap for the season it starts."};
  p.extension={aav,yrs:years,start};
  logTx(league,`${t.abbr} extend ${p.name}: ${years} years at $${aav.toFixed(2)}M, starting ${start}-${String(start+1).slice(2)}`,[t.id]);
  return {ok:true,msg:`${p.name} extended. His current cap hit is unchanged until the deal begins.`};
}
