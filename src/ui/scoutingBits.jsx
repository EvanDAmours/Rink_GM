import React from "react";
import { useGame } from "./common.jsx";
import { DEV_TRAITS } from "../engine/players.js";
import { bioStats, gradeClass, SCOUT_ROLES, SCOUT_GROUPS } from "../engine/scouting.js";
import { ROLE_TAGS, roleOf, roleNeeds } from "../engine/teamPlanning.js";
import { isGoalie } from "../engine/constants.js";
import "./scouting.css";

// One of your reads: "??" (no idea), "B+" (a scout's general idea), "~72" (a report) or "72" (exact).
export function Read({ label, txt, title }) {
  const kind = txt === "??" ? "unk" : txt.startsWith("~") ? "est" : /^[A-D]/.test(txt) ? `gen ${gradeClass(txt)}` : "exact";
  return (
    <span className={`rd ${kind}`} title={title}>
      <span className="rdl">{label}</span>
      <b>{txt}</b>
    </span>
  );
}

export function DevChip({ dev, unknown = "?" }) {
  if (!dev) return <span className="dev unk" title="Development trait unknown. Your major scout reveals it with a full workup.">Dev {unknown}</span>;
  return <span className={`dev ${dev}`} title={DEV_TRAITS[dev].desc}>{DEV_TRAITS[dev].name}</span>;
}

// Who covers him: "Major", "Minor II", "2 scouts" (a crew on his group) or "No scout". Unless
// flags={false}, the scouting flags follow as small icons (💎 sleeper, 👀 hunch, 🚩 red flag,
// ⭐ a Star or Superstar trait a crew spotted early), so every board that shows coverage shows them.
export function CovTag({ read, flags = true }) {
  const role = read.cov;
  const crew = read.scout ? [read.scout, ...(read.others || [])] : [];
  const title = crew.length > 1
    ? `${crew.length} scouts on it: ${crew.map((x) => x.name).join(", ")} all survey his region. A crew reads sharper and can see through Central Scouting's list.`
    : read.scout ? `${SCOUT_ROLES[role].name}: ${read.scout.name} (surveys his region)` : "None of your scouts is assigned to his region, so your front office's generalists file the reports.";
  return (
    <>
      <span className={`cov ${role}${crew.length > 1 ? " crew" : ""}`} title={title}>{role === "office" ? "No scout" : crew.length > 1 ? `${crew.length} scouts` : SCOUT_ROLES[role].short}</span>
      {flags && <ScoutFlags read={read} compact />}
    </>
  );
}

// The scouting flags on a prospect, with the reason in the tooltip (and in full when not compact).
export function ScoutFlags({ read, compact = false }) {
  if (!read) return null;
  const out = [];
  if (read.flag) out.push(<span key="f" className="sc-flag red" title={read.flagWhy || "Your scouts red-flagged him: high bust risk."}>🚩{compact ? "" : " Red flag"}</span>);
  if (read.sleeper) out.push(<span key="s" className="sc-flag gem" title={read.gemWhy || `${read.who || "Your scouts"} see through the board: he's a sleeper, much better than where he's ranked.`}>💎{compact ? "" : " Sleeper"}</span>);
  else if (read.hunch) out.push(<span key="h" className="sc-flag hunch" title={`${read.who || "Your scouts"} have a hunch there's more to him than Central Scouting says. A report will tell.`}>👀{compact ? "" : " Hunch"}</span>);
  if (read.devEarly && ["superstar", "star"].includes(read.dev)) out.push(<span key="d" className={`sc-flag trait ${read.dev}`} title={`${read.who || "Your scouts"} already see a ${DEV_TRAITS[read.dev].name} development trait.`}>⭐{compact ? "" : ` ${DEV_TRAITS[read.dev].name}`}</span>);
  return out.length ? <span className="sc-flags">{out}</span> : null;
}

// His natural role (Gridiron 3.23): SNIPER, NET-FRONT, PP QB, SHUTDOWN... Green with NEED when
// your lineup is thin there. Pass `needs` (teamPlanning.roleNeeds for your club) from a list to
// save the work; otherwise it reads them itself.
export function RoleTag({ p, needs }) {
  const { league } = useGame();
  const k = roleOf(p);
  if (!k) return null;
  const n = (needs || roleNeeds(league, league.teams[league.userTid]))[k] || 0;
  const big = n >= 0.25;
  return <span className={`sc-role${big ? " need" : ""}`} title={big ? `Natural ${ROLE_TAGS[k].name.toLowerCase()}: a role your lineup needs` : `Natural role: ${ROLE_TAGS[k].name.toLowerCase()}`}>{ROLE_TAGS[k].tag}{big ? " · NEED" : ""}</span>;
}

export function scoutLabel(read) {
  return read.lvl === 0 ? "Scout" : read.lvl === 1 ? "Workup" : "Scouted";
}

// Reports are filed by your scouts in their regions (no points): this is a status chip, not a button.
export function ScoutButton({ read, className = "tiny" }) {
  const t = read.lvl >= 2 ? "✓ Full workup" : read.lvl === 1 ? "Report filed" : read.cov === "office" ? "No scout here" : "Not seen yet";
  return <span className={`${className} pill${read.lvl >= 2 ? " on" : ""}`} title="Your scouts file reports on their own through the season, in the regions you assigned them.">{t}</span>;
}

export function statText(league, p) {
  const s = bioStats(league, p);
  if (!s) return null;
  if (isGoalie(p.pos)) return `${s.gp} GP · ${s.svp.toFixed(3).slice(1)} SV% · ${s.gaa.toFixed(2)} GAA`;
  return `${s.gp} GP · ${s.g}-${s.a}-${s.pts}`;
}
