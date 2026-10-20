// Season beats (Gridiron 3.0, 3.2, 3.49): clinching a playoff spot, the division, first in the
// conference or the Presidents' Trophy; Signing Day for every free agent you win and every
// notable signing; a blockbuster trade; a franchise legend retiring; a Hockey Hall of Fame
// induction. Each builder returns a plain moment (see moments.js) or null; the engine queues it
// where the event happens (standings each day, trade.js, the signing paths, retirements, the Hall).
// Moments keep a small player snapshot because players retire and move on.
import { clinchState, gamesLeft } from "./standings.js";
import { dayToDate } from "./schedule.js";
import { isGoalie, isDefense } from "./constants.js";
import { fmtMoney as money } from "./players.js";

const LEVELS = ["pres", "conf", "div", "berth"];
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const num = (n) => Number(n || 0).toLocaleString("en-US");
const surname = (name) => String(name || "").split(" ").slice(1).join(" ") || String(name || "");
const recLine = (r) => `${r.w}-${r.l}-${r.otl} · ${r.pts} PTS`;
const andList = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0] || "");

// The snapshot a moment keeps: enough for the card after he has moved on or retired.
export function snap(p) {
  if (!p) return null;
  const s = { name: p.name, pos: p.pos, ovr: p.ovr, age: p.age, num: Number.isInteger(p.number) ? p.number : null };
  if (p.nhlId) s.nhlId = p.nhlId;
  return s;
}

export const peakOvr = (p) => Math.max(p?.peak || 0, p?.ovr || 0, ...(p?.ratingHistory || []).map((r) => r.ovr || 0));
// Seasons he played for a club in this league (the save's own seasons; earlier NHL years aren't known).
export const seasonsWith = (p, abbr) => new Set((p?.career || []).filter((c) => c.t === abbr).map((c) => c.y)).size;

const SHORT_AWARD = { hart: "Hart", tedLindsay: "Ted Lindsay", artRoss: "Art Ross", rocket: "Rocket Richard", norris: "Norris", vezina: "Vezina", calder: "Calder", selke: "Selke", ladyByng: "Lady Byng", masterton: "Masterton", kingClancy: "King Clancy", messier: "Messier", connSmythe: "Conn Smythe", jennings: "Jennings" };
// "2× Hart · Conn Smythe · 3 Stanley Cups" from his honours and the Cup celebrations he was part of.
function honoursLine(league, pid, honours = []) {
  const n = {};
  for (const h of honours) if (SHORT_AWARD[h.kind]) n[h.kind] = (n[h.kind] || 0) + 1;
  const parts = Object.keys(SHORT_AWARD).filter((k) => n[k]).map((k) => `${n[k] > 1 ? `${n[k]}× ` : ""}${SHORT_AWARD[k]}`);
  const cups = (league.celebrations || []).filter((c) => c.roster?.some((r) => r.pid === pid)).length;
  if (cups) parts.push(cups === 1 ? "Stanley Cup" : `${cups} Stanley Cups`);
  return parts.join(" · ");
}
function careerLine(pos, t) {
  if (!t?.gp) return null;
  return isGoalie(pos) ? `${num(t.gp)} GP · ${num(t.w)} W${t.so ? ` · ${num(t.so)} SO` : ""}` : `${num(t.gp)} GP · ${num((t.g || 0) + (t.a || 0))} PTS (${num(t.g)} G, ${num(t.a)} A)`;
}
const careerSum = (p) => (p?.career || []).reduce((a, c) => { for (const k of ["gp", "g", "a", "w", "so"]) a[k] += c.s?.[k] || 0; return a; }, { gp: 0, g: 0, a: 0, w: 0, so: 0 });

// ---------- Clinching ----------

const CLINCH = {
  pres: { kicker: () => "PRESIDENTS' TROPHY CLINCHED", title: (t) => `THE ROAD GOES THROUGH ${t.city.toUpperCase()}`, sub: () => "Nobody in the league can catch you. The Presidents' Trophy is yours, and home ice with it for as long as you're still playing.", also: "the Presidents' Trophy" },
  conf: { kicker: () => "CONFERENCE CLINCHED", title: (t) => `FIRST IN THE ${t.conf.toUpperCase()}`, sub: (t) => `Nobody in the ${t.conf}ern Conference can catch you. First place means home ice through the first three rounds.`, also: "first in the conference" },
  div: { kicker: () => "DIVISION CLINCHED", title: (t) => `${t.div.toUpperCase()} DIVISION CHAMPIONS`, sub: (t) => `The ${t.div} is yours. Home ice in the first round is guaranteed, and a division banner goes up in the rafters.`, also: "the division" },
  berth: { kicker: () => "PLAYOFF BERTH CLINCHED", title: (t) => `${t.name.toUpperCase()} ARE PLAYOFF BOUND`, sub: (t, y) => `You're in the ${y + 1} Stanley Cup Playoffs. Now go get seeded.`, also: "a playoff berth" },
};

// One card for the biggest thing locked up today ("ALSO LOCKED UP" lists the rest).
export function clinchMoment(league, t, levels, games = []) {
  const lvl = levels[0];
  const c = CLINCH[lvl];
  const left = gamesLeft(league)[t.id] || 0;
  const g = games.find((x) => x.played && (x.h === t.id || x.a === t.id));
  let how = "";
  if (g) {
    const home = g.h === t.id, us = home ? g.hs : g.as, them = home ? g.as : g.hs, opp = league.teams[home ? g.a : g.h];
    const extra = g.ot === "SO" ? "shootout " : g.ot ? "overtime " : "";
    how = `, with a ${Math.max(us, them)}-${Math.min(us, them)} ${extra}${us > them ? "win over" : "loss to"} the ${opp?.name || "opposition"}`;
  } else if (left) how = ", on a night off";
  const date = dayToDate(league.year, league.day, league.scheduleStart);
  const when = left ? date : `${date}, the last day of the season`;
  return {
    kind: "clinch", key: `clinch-${league.year}-${lvl}`, tid: t.id, level: lvl, party: true, stop: true,
    kicker: c.kicker(t), title: c.title(t), sub: c.sub(t, league.year),
    lines: [
      ["RECORD", recLine(t.rec)],
      ["CLINCHED", `${when}${how}`],
      ...(left ? [["STILL TO PLAY", plural(left, "game")]] : []),
      ...(levels.length > 1 ? [["ALSO LOCKED UP", andList(levels.slice(1).map((k) => CLINCH[k].also))]] : []),
    ],
  };
}

// Called at the end of every regular-season day. `ids`: clubs that played; `games`: today's finished games.
export function seasonDayMoments(league, ids, games) {
  if (league.phase !== "regular") return [];
  const me = league.teams[league.userTid];
  if (!me) return [];
  const st = clinchState(league)[me.id];
  let had = league.clinched;
  if (!had || had.year !== league.year || had.tid !== me.id) {
    // A save from before clinch cards, loaded mid-season: what's already locked up stays quiet.
    const quiet = !had && (me.rec?.gp || 0) > 1;
    had = league.clinched = { year: league.year, tid: me.id };
    if (quiet) { for (const k of LEVELS) if (st[k]) had[k] = true; return []; }
  }
  const fresh = LEVELS.filter((k) => st[k] && !had[k]);
  if (!fresh.length) return [];
  for (const k of fresh) had[k] = true;
  return [clinchMoment(league, me, fresh, games)];
}

// ---------- Signing Day ----------

// Clubs he has played for in this league before the deal just signed, and the one he last left.
function pastClubs(league, p, team) {
  const hist = p.moveHistory || [];
  const before = hist.at(-1)?.to === team.id ? hist.slice(0, -1) : hist;
  const clubs = new Set();
  for (const m of before) { if (m.from >= 0) clubs.add(m.from); if (m.to >= 0) clubs.add(m.to); }
  for (const c of p.career || []) { const t = league.teams.find((x) => x.abbr === c.t); if (t) clubs.add(t.id); }
  const left = [...before].reverse().find((m) => m.to === -1 && m.from >= 0);
  return { clubs, from: left ? left.from : null };
}

// What kind of signing it is, in hockey terms: a star, a regular (top six, top four, a starting
// goalie) or depth.
export function signingTier(p) {
  if (p.ovr >= 88) return "star";
  return p.ovr >= (isGoalie(p.pos) ? 84 : isDefense(p.pos) ? 80 : 81) ? "regular" : "depth";
}
function tierLine(p, tier) {
  const prime = p.age <= 27;
  if (tier === "star") return prime ? "A star in his prime." : "A proven veteran to put you over the top.";
  if (tier === "regular") {
    const role = isGoalie(p.pos) ? "starting goalie" : isDefense(p.pos) ? "top-four defenseman" : "top-six forward";
    return prime ? `A ${role} entering his prime.` : `A proven ${role}.`;
  }
  return "Depth with a spot in the lineup to win.";
}

// Call right after the deal is signed (he's on the club). `market`: he chose you on the open market
// (every one of those gets a card, `rivals` other clubs bid); `sheetFrom`: his club declined to match
// your offer sheet. Otherwise only an 80+ player from another club gets one.
export function signingMoment(league, p, team, { aav, yrs, market = false, rivals = 0, sheetFrom = null } = {}) {
  if (!p || !team || team.id !== league.userTid || !(yrs > 0)) return null;
  const { clubs, from: left } = pastClubs(league, p, team);
  const from = sheetFrom ?? left;
  if (!market && sheetFrom == null && (p.ovr < 80 || from === team.id)) return null;
  const back = clubs.has(team.id);
  const tier = signingTier(p);
  const old = from != null && from !== team.id ? league.teams[from] : null;
  const how = sheetFrom != null && old ? `: the ${old.city} ${old.name} wouldn't match your offer sheet` : `${market && rivals > 0 ? " over the other offers" : ""}${old ? `, leaving the ${old.city} ${old.name}` : ""}`;
  aav = Number(aav ?? p.cap) || 0;
  return {
    kind: "signing", key: `sign-${league.year}-${p.id}`, tid: team.id, pid: p.id, p: snap(p), num: snap(p).num,
    yrs, aav, from: old ? old.id : null, back, market: !!market, sheet: sheetFrom != null, tier,
    sub: `${p.name} ${back ? "comes back to" : "picks"} the ${team.name}${how}. ${tierLine(p, tier)}`,
    lines: [["POSITION", `${p.pos}, ${p.ovr} OVR`], ["THE DEAL", `${plural(yrs, "year")}, ${money(aav * yrs)} total`]],
  };
}

// ---------- Blockbuster trades ----------

const ORD = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th"];
// "2027 1st-round pick", with the original club when it isn't the one sending it.
const pickText = (league, pk, sender) => `${pk.year} ${ORD[pk.round] || `R${pk.round}`}-round pick${pk.orig !== sender && league.teams[pk.orig] ? ` (${league.teams[pk.orig].abbr})` : ""}`;

// Call after the trade has gone through. A card when your club is in it and it moves an 85+
// player, or a big multi-asset deal (two first-round picks, or five-plus pieces around an 82+).
export function tradeMoment(league, offer) {
  const me = league.userTid;
  if (!offer || (offer.from !== me && offer.to !== me)) return null;
  const mine = offer.from === me;
  const gets = (mine ? offer.get : offer.give) || [], sends = (mine ? offer.give : offer.get) || [];
  const getPicks = (mine ? offer.getPicks : offer.givePicks) || [], sendPicks = (mine ? offer.givePicks : offer.getPicks) || [];
  const other = league.teams[mine ? offer.to : offer.from];
  const team = league.teams[me];
  const players = [...gets, ...sends].map((id) => league.players[id]).filter(Boolean);
  const star = [...players].sort((a, b) => b.ovr - a.ovr || a.age - b.age)[0];
  if (!star || !other || !team) return null;
  const pk = (ids) => ids.map((id) => league.draftPicks.find((x) => x.id === id)).filter(Boolean);
  const firsts = [...pk(getPicks), ...pk(sendPicks)].filter((x) => x.round === 1).length;
  const assets = players.length + getPicks.length + sendPicks.length;
  if (!(star.ovr >= 85 || (firsts >= 2 && star.ovr >= 78) || (assets >= 5 && star.ovr >= 82))) return null;
  const got = gets.includes(star.id);
  const side = (ids, picks, sender) => [...ids.map((id) => league.players[id]).filter(Boolean).map((p) => `${p.name} (${p.pos} ${p.ovr})`), ...pk(picks).map((x) => pickText(league, x, sender))].join(", ") || "—";
  const last = surname(star.name).toUpperCase();
  return {
    kind: "trade", key: `trade-${league.year}-${league.phase}-${league.day}-${star.id}`, tid: me, other: other.id, got, pid: star.id, p: snap(star),
    kicker: "BREAKING · BLOCKBUSTER TRADE", title: got ? `${team.name.toUpperCase()} LAND ${last}` : `${last} TRADED`,
    sub: got ? `${star.name} is coming to ${team.city}. The ${other.name} get their price.` : `${star.name} is headed to the ${other.city} ${other.name}. A bold move, and the whole league noticed.`,
    lines: [["YOU GET", side(gets, getPicks, other.id), "#86efac"], ["YOU SEND", side(sends, sendPicks, me), "#fca5a5"]],
  };
}

// ---------- A franchise legend retires ----------

// Call before he is removed from the league. One of your veterans: an 85+ peak or eight seasons with the club.
export function legendMoment(league, p) {
  const team = p && league.teams[p.tid];
  if (!team || team.id !== league.userTid) return null;
  const peak = peakOvr(p), here = seasonsWith(p, team.abbr);
  if (peak < 85 && here < 8) return null;
  const honours = honoursLine(league, p.id, p.honours);
  const career = careerLine(p.pos, careerSum(p));
  return {
    kind: "legend", key: `legend-${p.id}`, tid: team.id, pid: p.id, p: { ...snap(p), peak }, here,
    kicker: "A FRANCHISE LEGEND RETIRES", title: p.name.toUpperCase(),
    sub: `${p.name} hangs it up at ${p.age}${here >= 2 ? ` after ${here} seasons with you` : ""}. One of the greats to wear the ${team.name} sweater.`,
    lines: [
      ["POSITION", `${p.pos}, ${peak} at his peak`],
      ...(career ? [["CAREER", career]] : []),
      ...(honours ? [["HONOURS", honours]] : []),
      ["NEXT STOP", peak >= 90 ? "Toronto, if the voters have any sense" : "The rafters, if you say so", "#fde68a"],
    ],
    ...(p.service?.estimated && career ? { note: "Career totals count the seasons played in this league." } : {}),
  };
}

// ---------- The Hockey Hall of Fame ----------

// The inductees of one year (dynasty.js inductHall) who played for your club: a ceremony each
// (two at most), with the whole Class listed.
export function hallMoments(league, inducted) {
  const team = league.teams[league.userTid];
  if (!team || !inducted?.length) return [];
  const played = (r) => r.tid === team.id || (r.player?.career || []).some((c) => c.t === team.abbr) || (r.player?.moveHistory || []).some((m) => m.from === team.id || m.to === team.id);
  const cls = inducted.map((r) => ({ name: r.name, pos: r.pos, mine: played(r) }));
  return inducted.filter(played).slice(0, 2).map((r) => {
    const here = seasonsWith(r.player, team.abbr);
    const honours = honoursLine(league, r.pid, r.awards);
    const career = careerLine(r.pos, r);
    const year = r.inducted ?? league.year;
    return {
      kind: "hof", key: `hof-${r.pid}`, tid: team.id, pid: r.pid, cls: year, classOf: cls,
      p: { name: r.name, pos: r.pos, num: Number.isInteger(r.number) ? r.number : null, ...(r.player?.nhlId ? { nhlId: r.player.nhlId } : {}), peak: r.peak },
      tagline: here ? `${team.city} ${team.name} · ${plural(here, "season")}` : `${team.city} ${team.name}`,
      sub: `${r.name} is enshrined with the Class of ${year}. His plaque goes up in the Great Hall in Toronto, among the greatest ever to play.`,
      lines: [
        ["PEAK", `${r.peak} OVR`],
        ...(here ? [["WITH YOU", plural(here, "season")]] : []),
        ...(career ? [["CAREER", career]] : []),
        ...(honours ? [["HONOURS", honours]] : []),
        ["RETIRED", `${r.year}`],
      ],
    };
  });
}
