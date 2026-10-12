// End-of-season trophies, voted from season stats.
import { isGoalie, isDefense } from "./constants.js";
import { savePct, gaa } from "./players.js";

function rostered(league) {
  return Object.values(league.players).filter((p) => p.tid >= 0 && league.teams[p.tid]?.roster.includes(p.id));
}

export function computeAwards(league) {
  const ps = rostered(league);
  const skaters = ps.filter((p) => !isGoalie(p.pos) && p.stats.gp >= 20);
  const goalies = ps.filter((p) => isGoalie(p.pos) && p.stats.gp >= 25);
  const teamPts = (p) => league.teams[p.tid].rec.pts;
  const best = (arr, f) => arr.reduce((b, p) => (!b || f(p) > f(b) ? p : b), null);
  const pack = (p, why) => (p ? { pid: p.id, name: p.name, tid: p.tid, why } : null);

  const artRoss = best(skaters, (p) => p.stats.pts * 1000000 + p.stats.g * 1000 - p.stats.gp);
  const rocket = best(skaters, (p) => p.stats.g * 1000 + p.stats.pts);
  const hartSkater = best(skaters, (p) => p.stats.pts * 1.0 + p.stats.g * 0.4 + p.stats.pm * 0.2 + teamPts(p) * 0.25 + p.ovr * 0.3);
  const hartGoalie = best(goalies, (p) => p.stats.w * 1.7 + (savePct(p.stats)-0.88)*900 + p.stats.so*3 + teamPts(p)*0.3);
  const hart = hartGoalie && (!hartSkater || hartGoalie.stats.w*1.7+(savePct(hartGoalie.stats)-0.88)*900+hartGoalie.stats.so*3+teamPts(hartGoalie)*0.3 > hartSkater.stats.pts+hartSkater.stats.g*0.4+hartSkater.stats.pm*0.2+teamPts(hartSkater)*0.25+hartSkater.ovr*0.3) ? hartGoalie : hartSkater;
  const norris = best(skaters.filter((p) => isDefense(p.pos)), (p) => p.stats.pts * 1.0 + p.stats.pm * 0.4 + p.stats.blk * 0.05 + p.ovr * 0.6);
  const vezina = best(goalies, (p) => savePct(p.stats) * 1000 + p.stats.w * 0.35 - gaa(p.stats) * 3 + p.stats.so);
  const calder = best(skaters.filter((p) => p.rookie).concat(goalies.filter((p) => p.rookie)), (p) => (isGoalie(p.pos) ? p.stats.w * 1.2 + savePct(p.stats) * 100 - 80 : p.stats.pts * 1.1 + p.stats.g * 0.3));
  const selke = best(skaters.filter((p) => !isDefense(p.pos)), (p) => p.attrs.daw * 0.6 + p.attrs.stk * 0.3 + p.stats.pm * 0.5 + p.stats.pts * 0.15 + (p.stats.fow - p.stats.fol) * 0.01);

  const ladyByng = best(skaters, (p) => p.stats.pts - p.stats.pim*0.8);
  const tedLindsay = best(skaters, (p) => p.stats.pts + p.stats.g*0.35);
  const jenningsTeam = [...league.teams].filter(t=>goalies.some(p=>p.tid===t.id)).sort((a,b)=>a.rec.ga-b.rec.ga)[0];
  const jenningsGoalies = goalies.filter(p=>p.tid===jenningsTeam?.id);
  const jackTeam = [...league.teams].sort((a,b)=>(b.rec.pts-(b.roster.reduce((n,id)=>n+(league.players[id]?.ovr || 0),0)/Math.max(1,b.roster.length)-75)*6)-(a.rec.pts-(a.roster.reduce((n,id)=>n+(league.players[id]?.ovr || 0),0)/Math.max(1,a.roster.length)-75)*6))[0];
  const fmt = (p) => p && `${p.stats.g}G ${p.stats.a}A ${p.stats.pts}P`;
  return {
    hart: pack(hart, hart && (isGoalie(hart.pos) ? `${hart.stats.w} wins` : fmt(hart))),
    tedLindsay: pack(tedLindsay, fmt(tedLindsay)),
    ladyByng: pack(ladyByng, ladyByng && `${ladyByng.stats.pts} PTS, ${ladyByng.stats.pim} PIM`),
    jennings: jenningsGoalies.length ? {pid:jenningsGoalies[0].id,pids:jenningsGoalies.map(p=>p.id),name:jenningsGoalies.map(p=>p.name).join(" & "),tid:jenningsTeam.id,shared:jenningsGoalies.length>1,why:`${jenningsTeam.rec.ga} team goals against`} : null,
    jackAdams: jackTeam ? {name:jackTeam.coach?.name || "Head coach",tid:jackTeam.id,why:`${jackTeam.rec.pts} points; performance above roster expectations`} : null,
    artRoss: pack(artRoss, artRoss && `${artRoss.stats.pts} points`),
    rocket: pack(rocket, rocket && `${rocket.stats.g} goals`),
    norris: pack(norris, fmt(norris)),
    vezina: pack(vezina, vezina && `${vezina.stats.w} W, ${savePct(vezina.stats).toFixed(3).slice(1)} SV%, ${gaa(vezina.stats).toFixed(2)} GAA`),
    calder: pack(calder, calder && (isGoalie(calder.pos) ? `${calder.stats.w} W` : fmt(calder))),
    selke: pack(selke, selke && `${selke.stats.pm >= 0 ? "+" : ""}${selke.stats.pm}, ${fmt(selke)}`),
  };
}

export function connSmythe(league, champTid) {
  const ps = rostered(league).filter((p) => p.tid === champTid);
  let best = null;
  let bestV = -Infinity;
  for (const p of ps) {
    const s = p.pstats;
    const v = isGoalie(p.pos) ? (s.gp ? savePct(s) * 120 - 100 + s.w * 1.6 : -99) : s.pts * 1.2 + s.g * 0.5 + s.pm * 0.2;
    if (v > bestV) { bestV = v; best = p; }
  }
  if (!best) return null;
  const s = best.pstats;
  return { pid: best.id, name: best.name, tid: best.tid, why: isGoalie(best.pos) ? `${s.w} W, ${savePct(s).toFixed(3).slice(1)} SV%` : `${s.g}G ${s.a}A ${s.pts}P` };
}

export const AWARD_NAMES = {
  tedLindsay: "Ted Lindsay Award",
  ladyByng: "Lady Byng Trophy",
  jennings: "William M. Jennings Trophy",
  jackAdams: "Jack Adams Award",
  hart: "Hart Trophy (MVP)",
  artRoss: "Art Ross Trophy (points)",
  rocket: "Rocket Richard Trophy (goals)",
  norris: "Norris Trophy (top defenseman)",
  vezina: "Vezina Trophy (top goalie)",
  calder: "Calder Trophy (top rookie)",
  selke: "Selke Trophy (top defensive forward)",
  connSmythe: "Conn Smythe Trophy (playoff MVP)",
};
