// Head coaches retire at the end of their contract, and tell you first (Gridiron GM 3.7x).
// Each head coach has an exit age, 64 + hash(name) % 9 (64-72), keyed on his NAME so a real coach
// retires at the same age in every new game; real veterans are set by hand. Head-coach contracts
// count down each off-season. When one ends he retires if he is at his exit age, otherwise he
// re-signs for 2-4 years, never past it (AI clubs and yours alike). No random mid-deal retirements.
import { logTx } from "./roster.js";

// Real 2026-27 head coaches: birth year, seasons left on the deal counting 2026-27 (estimates from
// reported terms), and an exit-age override where the hash would be unbelievable (a coach who
// just took a job doesn't retire two years in; a 71-year-old doesn't coach to 80).
// Birth years: NHL.com / Hockey-Reference coach pages. See docs/CONTRACT_MARKET.md.
export const REAL_HC_BIO = {
  "Joel Quenneville": { born: 1958, yrs: 2, exit: 70 },
  "Marco Sturm": { born: 1978, yrs: 2 },
  "Lindy Ruff": { born: 1960, yrs: 1, exit: 67 },
  "Ryan Huska": { born: 1975, yrs: 1 },
  "Rod Brind'Amour": { born: 1970, yrs: 4 },
  "Jeff Blashill": { born: 1974, yrs: 2 },
  "Jared Bednar": { born: 1972, yrs: 2 },
  "Rick Bowness": { born: 1955, yrs: 1, exit: 71 },
  "Glen Gulutzan": { born: 1971, yrs: 2 },
  "Todd McLellan": { born: 1967, yrs: 2 },
  "Mike Babcock": { born: 1963, yrs: 3, exit: 67 },
  "Paul Maurice": { born: 1967, yrs: 2 },
  "Peter Laviolette": { born: 1964, yrs: 2 },
  "John Hynes": { born: 1975, yrs: 2 },
  "Martin St. Louis": { born: 1975, yrs: 2 },
  "Andrew Brunette": { born: 1973, yrs: 1 },
  "Sheldon Keefe": { born: 1980, yrs: 3 },
  "Peter DeBoer": { born: 1968, yrs: 2 },
  "Mike Sullivan": { born: 1968, yrs: 4 },
  "Travis Green": { born: 1970, yrs: 2 },
  "Rick Tocchet": { born: 1964, yrs: 4, exit: 67 },
  "Dan Muse": { born: 1982, yrs: 3 },
  "Ryan Warsofsky": { born: 1987, yrs: 2 },
  "Jim Montgomery": { born: 1969, yrs: 3 },
  "Lane Lambert": { born: 1964, yrs: 2 },
  "Jon Cooper": { born: 1967, yrs: 3 },
  "Jim Hiller": { born: 1969, yrs: 3 },
  "Andre Tourigny": { born: 1974, yrs: 2 },
  "Manny Malhotra": { born: 1980, yrs: 3 },
  "Ryan Craig": { born: 1982, yrs: 3 },
  "Spencer Carbery": { born: 1981, yrs: 3 },
  "Scott Arniel": { born: 1962, yrs: 2, exit: 66 },
};

function hashName(s) {
  let h = 0;
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) >>> 0;
  return h;
}
export const exitAge = (c) => REAL_HC_BIO[c?.name]?.exit ?? 64 + (hashName(c?.name || "") % 9);

const POSTSEASON = new Set(["draft", "resign", "freeagency"]);
// The first season his `age` and `yrs` describe. The off-season tick runs once the Cup is awarded,
// so during the draft, re-sign week and free agency his numbers already describe next season.
export const coachBase = (league, c) => (c?.tickYear === league.year ? league.year + 1 : league.year);

// The final season of his deal if he retires when it ends, else null.
export function retiring(league, c) {
  if (!c || c.interim || !(c.yrs > 0)) return null;
  const final = coachBase(league, c) + c.yrs - 1;
  return c.age + c.yrs - 1 >= exitAge(c) ? final : null;
}
// The most years an extension may add (his deal then ends the season before his exit age).
export function extMax(league, c) {
  if (!c || c.interim || !(c.yrs > 0)) return 0;
  return Math.max(0, exitAge(c) - 1 - (c.age + c.yrs - 1));
}
const renewal = (c, salt) => 2 + (hashName(`${c.name}|${salt}`) % 3);

// Give a coach without a deal one: 2-4 years, never past his exit age.
export function ensureCoachContract(league, c) {
  if (!c || c.interim || c.yrs > 0) return;
  if (league.playoffs?.champion != null && (league.phase === "playoffs" || POSTSEASON.has(league.phase))) c.tickYear ??= league.year;
  const room = Math.max(1, exitAge(c) - c.age + 1);
  c.yrs = Math.min(renewal(c, c.hiredYear ?? league.year), room);
}
// Real coaches' ages and terms, once per league (old saves had random ages): gated by league.hcv.
export function ensureCoachContracts(league) {
  const first = !league.hcv;
  if (first) {
    for (const t of league.teams) {
      const c = t.coach, bio = REAL_HC_BIO[c?.name];
      if (c && c.real && bio && league.year <= 2027) {
        c.age = league.year - bio.born;
        c.yrs = Math.max(1, bio.yrs - (league.year - 2026));
      }
    }
    league.hcv = 1;
  }
  for (const t of league.teams) {
    ensureCoachContract(league, t.coach);
    // A coach already in his last deal when the league starts: the notice shows on the Coaching
    // page and Home, without a wire line.
    const last = retiring(league, t.coach);
    if (first && last != null && t.coach.announced == null) t.coach.announced = last;
  }
}
// Home inbox item in his last two seasons (dismissible).
export function coachRetirementNotice(league) {
  const t = league.teams[league.userTid], c = t?.coach;
  const last = retiring(league, c);
  if (last == null) return null;
  const now = league.playoffs?.champion != null || ["draft", "resign", "freeagency"].includes(league.phase) ? league.year + 1 : league.year;
  if (last - now > 1) return null;
  const key = `${c.name}|${last}`;
  if (league.hcNoteDismissed === key) return null;
  return { key, last, text: coachContractNote(league, c)?.text };
}

// The off-season tick, once per finished season (after the Cup): deals count down; an expiring
// coach retires at his exit age or re-signs; then everyone is a year older, and a coach whose
// current deal will be his last announces it (once).
export function coachOffseason(league) {
  if (league.hcTick === league.year) return;
  ensureCoachContracts(league);
  league.hcTick = league.year;
  league.news ||= [];
  for (const t of league.teams) {
    let c = t.coach;
    if (!c || c.interim || c.tickYear === league.year) continue;
    c.yrs -= 1;
    if (c.yrs <= 0) {
      if (c.age >= exitAge(c)) {
        retireCoach(league, t, c);
        c = t.coach;
        if (!c || c.interim) continue;
      } else {
        c.yrs = Math.min(renewal(c, league.year), exitAge(c) - c.age);
        logTx(league, `${t.abbr} re-sign head coach ${c.name} (${c.yrs} yr${c.yrs > 1 ? "s" : ""})`, [t.id]);
      }
    }
    if (c.tickYear !== league.year) { c.age += 1; c.tickYear = league.year; }
    const last = retiring(league, c);
    if (last != null && c.announced == null) {
      c.announced = last;
      const when = `${last}-${String(last + 1).slice(2)}`;
      league.news.unshift({ year: league.year, day: league.day, type: "coach", text: `${t.city} head coach ${c.name} will retire after the ${when} season, when his contract ends.` });
      if (t.id === league.userTid) league.inbox?.push({ year: league.year, day: league.day, open: { tab: "coaching", sub: "coaching" }, text: `👔 ${c.name} plans to retire after the ${when} season, when his contract ends. Line up his successor on the Coaching page.` });
    }
  }
}

function retireCoach(league, t, c) {
  league.news.unshift({ year: league.year, day: league.day, type: "coach", text: `${t.city} head coach ${c.name} retires at ${c.age} as his contract ends.` });
  logTx(league, `${t.abbr} head coach ${c.name} retires`, [t.id]);
  if (t.id === league.userTid) {
    const left = { year: league.year, day: league.day, open: { tab: "coaching", sub: "coaching" }, text: `👔 ${c.name} has retired. His assistant runs the bench on an interim basis until you hire a head coach on the Coaching page.` };
    t.coach = { id: `${league.year}|interim|${t.id}`, name: interimName(t, league), style: c.style, development: Math.max(50, c.development - 12), specialTeams: Math.max(50, (c.specialTeams ?? 78) - 10), leadership: Math.max(50, (c.leadership ?? 70) - 8), age: 40 + (hashName(t.abbr + league.year) % 15), interim: true, hiredYear: league.year, tenure: [] };
    league.inbox?.push(left);
    return;
  }
  const next = (league.coachMarket || []).find((m) => !league.teams.some((o) => o.coach?.id === m.id));
  if (next) {
    league.coachMarket = league.coachMarket.filter((m) => m.id !== next.id);
    t.coach = { ...next, hiredYear: league.year + 1, tenure: [] };
    delete t.coach.yrs; delete t.coach.announced; delete t.coach.tickYear;
    t.coach.tickYear = league.year;
    ensureCoachContract(league, t.coach);
    logTx(league, `${t.abbr} hire ${next.name} as head coach`, [t.id]);
  } else {
    // No one on the market: the top assistant takes over on a short deal.
    t.coach = { ...c, id: `${league.year}|hc|${t.id}`, name: interimName(t, league), age: 45, yrs: 3, tickYear: league.year, tenure: [], real: false };
    delete t.coach.announced;
  }
}
const interimName = (t, league) => ["Alex Mercer", "Marc Larsson", "Daniel Bennett", "Ryan Moreau", "Chris Sullivan", "Pat Campbell"][hashName(t.abbr + league.year) % 6];

// Extend your head coach: never past the season before his exit age.
export function extendCoach(league, years) {
  const t = league.teams[league.userTid], c = t?.coach;
  if (!c || c.interim) return { ok: false, msg: "Hire a head coach first." };
  const max = extMax(league, c);
  if (retiring(league, c) != null || max <= 0) return { ok: false, msg: `${c.name} plans to retire when his contract ends.` };
  const n = Math.max(1, Math.min(max, Math.round(years) || 1));
  c.yrs += n;
  logTx(league, `${t.abbr} extend head coach ${c.name} (${n} yr${n > 1 ? "s" : ""})`, [t.id]);
  return { ok: true, msg: `${c.name} extended ${n} more year${n > 1 ? "s" : ""}.` };
}
// Plain words for his deal: "Signed through 2028-29", with the retirement notice when it applies.
export function coachContractNote(league, c) {
  if (!c || c.interim || !(c.yrs > 0)) return null;
  const final = coachBase(league, c) + c.yrs - 1, when = `${final}-${String(final + 1).slice(2)}`;
  const ret = retiring(league, c) != null;
  const current = final === league.year && c.tickYear !== league.year;
  return { final, when, retiring: ret, max: extMax(league, c), text: ret ? `${c.name} ${current ? "is retiring" : "plans to retire"} after the ${when} season, when his contract ends.` : `Signed through ${when}.` };
}
