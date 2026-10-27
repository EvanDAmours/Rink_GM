// Desktop and phone navigation, pure (no React), so tests can check every section and route.
// DeskNav.jsx draws the bar from sectionsFor(); App.jsx's go() lands through route().

// Each screen: [label, tab, sub (the hub section it opens), subs it covers (for "which tab is on")].
// Contracts is its own section (the contracts list, and the Re-sign screen in re-sign week);
// the playoffs live inside Standings; League folds the teams, the history and the retired.
export function sectionsFor(league, { deadlineOpen, frenzyOpen }) {
  const resign = league.phase === "resign";
  return [
    { id: "home", label: "Home", screens: [["Home", "dashboard"]] },
    { id: "team", label: "Team", screens: [["Lines", "lines", "lines", ["lines"]], ["Roster", "lines", "roster", ["roster"]], ["Coaching", "coaching"]] },
    { id: "standings", label: "Standings", screens: [["Standings", "standings", "table", ["table"]], ["Playoffs", "standings", "playoffs", ["playoffs"]]] },
    { id: "season", label: "Season", screens: [["Schedule", "schedule"], ["Stats", "stats"]] },
    { id: "development", label: "Development", screens: [["Overview", "development", "overview", ["overview"]], ["Season plan", "development", "plan", ["plan"]], ["Prospects", "development", "prospects", ["prospects"]]] },
    { id: "draft", label: "Draft", screens: [["Scouting", "draft", "hq", ["hq", "board", "list", "myscouts", "scouts", "regions"]], ["Draft", "draft", "floor", ["floor", "combine"]], ["Draft Recap", "draft", "recap", ["recap"]]] },
    { id: "market", label: "Trades & FA", screens: [["Trade", "trade", "trade", ["trade"]], ["Trade Block", "trade", "block", ["block"]], ["Free Agency", "trade", "fa", ["fa"]], ...(deadlineOpen ? [["Deadline Day", "trade", "deadline", ["deadline"]]] : []), ...(frenzyOpen ? [["July 1 Frenzy", "trade", "frenzy", ["frenzy"]]] : [])] },
    { id: "contracts", label: "Contracts", screens: [...(resign ? [["Re-sign", "contracts", "resign", ["resign"]]] : []), ["Contracts", "contracts", "contracts", ["contracts"]]] },
    { id: "office", label: "Front Office", screens: [["Front Office", "frontoffice"], ["League", "league", "teams", ["teams", "awards", "retired"]], ["Franchise History", "legacy", "club", ["club", "case", "gm"]], ["Record Book", "league", "records", ["records"]], ["Transactions", "league", "tx", ["tx"]], ["Legacy Hall", "legacy", "hall", ["hall", "trophies", "awards"]]] },
  ];
}
// Default sub of a hub when none was picked yet (mirrors the hubs' own defaults). Standings opens
// on the bracket while the playoffs are on; Contracts on the Re-sign screen in re-sign week.
const DEFAULT_SUB = { lines: "lines", trade: "trade", league: "teams", legacy: "hall", development: "overview", standings: "table", contracts: "contracts" };
export function defaultSubs(league) {
  return { standings: league?.phase === "playoffs" ? "playoffs" : "table", contracts: league?.phase === "resign" ? "resign" : "contracts" };
}
export function screenOn(scr, tab, sub) {
  const [, t, , subs] = scr;
  if (t !== tab) return false;
  if (!subs) return true;
  const v = sub[t] || DEFAULT_SUB[t];
  // Development's old screens (the desk and the pipeline) open its overview and prospects.
  return subs.includes(t === "development" ? ({ development: "overview", pipeline: "prospects" }[v] || (["overview", "plan", "prospects"].includes(v) ? v : "overview")) : v);
}
export function sectionOf(sections, tab, sub) {
  for (const s of sections) for (const scr of s.screens) if (screenOn(scr, tab, sub)) return { section: s, screen: scr };
  return null;
}

// Which body the one player sheet (PlayerSheet.jsx) draws for a pid.
export function playerSheetKind(league, pid) {
  const p = league.players?.[pid];
  if (p) return p.tid === -2 ? "prospect" : "live";
  if ((league.retirementArchive || []).some((r) => r.pid === pid)) return "archived";
  return "missing";
}

// Where go(id, k) lands: [tab, sub]. Old screen ids (used by the home screen, search, inbox links
// and saved links) map onto the sections. Contracts left Front Office for its own section (and in
// re-sign week "free agency" means the Re-sign screen there); Standings holds the playoffs; the
// phone's old Season hub opens the matching screen. Pure, so tests can check every route.
export const ALIAS = {
  roster: ["lines", "roster"], playoffs: ["standings", "playoffs"], analysis: ["coaching", "plan"],
  operations: ["frontoffice", "ops"], block: ["trade", "block"], freeagency: ["trade", "fa"], deadline: ["trade", "deadline"], frenzy: ["trade", "frenzy"],
  trophies: ["legacy"], records: ["league", "records"], trade: ["trade", "trade"], pipeline: ["development", "prospects"],
};

export function route(id, k, phase) {
  if (id === "freeagency" && phase === "resign") return ["contracts", "resign"];
  if (id === "resign") return route("contracts", "resign", phase);
  if (id === "contracts") return ["contracts", k === "resign" && phase !== "resign" ? "contracts" : k];
  if (id === "frontoffice" && k === "contracts") return ["contracts", "contracts"];
  if (id === "league" && (k === "standings" || k === "playoffs")) return ["standings", k === "playoffs" ? "playoffs" : "table"];
  if (id === "league" && !k) return ["league", "teams"];
  if (id === "season") return k === "stats" ? ["stats"] : k === "schedule" ? ["schedule"] : ["standings", k === "playoffs" ? "playoffs" : k ? "table" : undefined];
  const a = ALIAS[id];
  if (a) return a[0] === id ? [id, k || a[1]] : a;
  return [id, k];
}
