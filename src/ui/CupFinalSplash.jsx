import React from "react";
import { TeamBadge } from "./common.jsx";
import { trophyUrl } from "./trophies.js";
import { momentColors } from "./MomentFrame.jsx";
import "./moments/cup.css";
import "./live-rink.css";
import { arenaLabel } from "../data/arenas.js";

const ROUND_TITLE = ["FIRST ROUND", "SECOND ROUND", "CONFERENCE FINAL", "STANLEY CUP FINAL"];
const season = (y) => `${y}–${String(y + 1).slice(2)}`;

// Where the series stands before the puck drops, and what tonight means for your club.
export function walkoutLines({ round, series, userTid, home, away }) {
  const game = (series?.games?.length || 0) + 1;
  const wTop = series?.wTop || 0, wBot = series?.wBot || 0;
  const top = series ? (series.top === home.id ? home : away) : home, bot = top === home ? away : home;
  const status = game === 1 ? "SERIES OPENER" : wTop === wBot ? `SERIES TIED ${wTop}-${wBot}` : wTop > wBot ? `${top.abbr} LEADS ${wTop}-${wBot}` : `${bot.abbr} LEADS ${wBot}-${wTop}`;
  const mine = series && userTid != null ? (series.top === userTid ? wTop : series.bot === userTid ? wBot : null) : null;
  const theirs = mine == null ? null : series.top === userTid ? wBot : wTop;
  const next = ["THE SECOND ROUND", "THE CONFERENCE FINAL", "THE STANLEY CUP FINAL", "THE STANLEY CUP"][round] || "THE NEXT ROUND";
  const tag = game === 7 ? "GAME SEVEN. WIN OR GO HOME."
    : theirs === 3 ? "WIN OR GO HOME"
    : mine === 3 ? `ONE WIN FROM ${next}`
    : ["SIXTEEN CLUBS. ONE CUP.", "EIGHT CLUBS LEFT", "FOUR WINS FROM THE FINAL", "FOUR WINS FOR EVERYTHING"][round] || "";
  return { game, status, tag };
}

// The walkout before a playoff game you play live: the round, the clubs, the series, where it's
// played and what's at stake (Gridiron's playoff intros). The Stanley Cup Final keeps its own curtain
// with the Cup. venue: the game's building when it isn't the home club's own arena.
export default function CupFinalSplash({ home, away, game, round = 3, series = null, userTid = null, year = null, venue = null, onStart }) {
  const final = round === 3;
  const w = walkoutLines({ round, series, userTid, home, away });
  const n = series ? w.game : game;
  // The Conference Final plays for its own trophy.
  const conf = series?.conf || home.conf;
  const trophy = final ? "stanley" : round === 2 ? (conf === "East" ? "princeOfWales" : "campbellBowl") : null;
  const title = round === 2 ? `${conf === "West" ? "WESTERN" : "EASTERN"} CONFERENCE FINAL` : ROUND_TITLE[round];
  const mine = userTid === home.id ? home : userTid === away.id ? away : null;
  const { clr } = momentColors(mine || home);
  const where = arenaLabel(home, venue);
  return (
    <div className={`gg-splash${final ? "" : " walkout"}`} role="dialog" aria-label={title} style={final ? undefined : { "--wo-clr": clr }}>
      <div className="gg-splash-inner">
        {!final && <div className="gg-splash-kicker">{year != null ? `${season(year)} ` : ""}STANLEY CUP PLAYOFFS</div>}
        {trophy && trophyUrl(trophy) && <img className={`gg-splash-cup${final ? "" : " small"}`} src={trophyUrl(trophy)} alt="" />}
        <div className="gg-splash-title">{title}</div>
        <div className="gg-splash-sub">GAME {n}{series ? ` · ${w.status}` : ""}</div>
        {where && <div className="gg-splash-venue">{where}</div>}
        <div className="gg-splash-teams"><TeamBadge team={away} size={54} decorative /><b>{away.name}</b><span>AT</span><b>{home.name}</b><TeamBadge team={home} size={54} decorative /></div>
        <div className="gg-splash-line">{series ? w.tag : "FOUR WINS FOR EVERYTHING"}</div>
        <button className="primary big" onClick={onStart} autoFocus>Drop the puck ▶</button>
      </div>
    </div>
  );
}
