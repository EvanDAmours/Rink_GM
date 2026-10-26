// Special games (engine/specialGames.js): the title card before puck drop and the result card on a
// spotlight stage. Gridiron 3.71's holiday cards, translated to the Winter Classic and friends.
import React, { useEffect } from "react";
import { useGame, TeamBadge } from "../common.jsx";
import Jersey from "../Jersey.jsx";
import { SPECIAL_EVENTS } from "../../engine/specialGames.js";
import "./special.css";

function useEscape(onClose) {
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape" || e.key === "Enter") onClose?.(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
}

const FLAKES = Array.from({ length: 26 }, (_, i) => ({ l: (i * 37) % 100, d: (i * 0.41) % 9, s: 7 + (i * 13) % 9, size: 3 + (i % 4) }));
// The sky behind both cards: snow outdoors, leaves at Thanksgiving, sparks on New Year's Eve.
function Sky({ ev }) {
  const kind = SPECIAL_EVENTS[ev]?.outdoor || ev === "hockeyday" ? "snow" : ev === "thanksgiving" || ev === "halloween" ? "leaf" : ev === "nye" ? "spark" : "snow";
  return (
    <div className={`sp-sky sp-sky-${ev}`} aria-hidden>
      {FLAKES.map((f, i) => <i key={i} className={`sp-p ${kind}`} style={{ left: `${f.l}%`, width: f.size * (kind === "leaf" ? 2.4 : 1), height: f.size * (kind === "leaf" ? 2 : 1), animationDuration: `${f.s}s`, animationDelay: `${-f.d}s` }} />)}
    </div>
  );
}

function Club({ team }) {
  const c = team?.colors?.[0] || "#334155";
  return (
    <div className="sp-club" style={{ "--sp-c": c }}>
      <TeamBadge team={team} size={72} decorative />
      <small>{team.city}</small>
      <b>{team.name}</b>
    </div>
  );
}

export function SpecialIntro({ m, onClose }) {
  const { league } = useGame();
  useEscape(onClose);
  const e = SPECIAL_EVENTS[m.ev] || SPECIAL_EVENTS.winterclassic;
  const home = league.teams[m.h], away = league.teams[m.a];
  if (!home || !away) return null;
  return (
    <div className={`sp-overlay sp-${m.ev}`} onClick={onClose} role="dialog" aria-modal="true" aria-label={`${e.name}: ${away.name} at ${home.name}`}>
      <Sky ev={m.ev} />
      <div className="sp-intro">
        <div className="sp-art" aria-hidden>{e.art}</div>
        <div className="sp-eyebrow"><span />{e.eyebrow}<span /></div>
        <div className="sp-name" role="heading" aria-level={1}>{e.name}</div>
        <div className="sp-match">
          <Club team={away} />
          <div className="sp-at"><span />AT<span /></div>
          <Club team={home} />
        </div>
        <p className="sp-line">{e.line}</p>
      </div>
      <button type="button" className="sp-tap" onClick={onClose} autoFocus>Tap for puck drop</button>
    </div>
  );
}

export function SpecialResult({ m, onClose }) {
  const { league } = useGame();
  useEscape(onClose);
  const e = SPECIAL_EVENTS[m.ev] || SPECIAL_EVENTS.winterclassic;
  const me = league.teams[m.tid] || league.teams[league.userTid];
  const opp = league.teams[m.home ? m.a : m.h];
  const us = m.home ? m.hs : m.as, them = m.home ? m.as : m.hs;
  const live = m.pog && league.players[m.pog.pid];
  const p = m.pog ? { ...m.pog, ...(live ? { name: live.name, pos: live.pos, number: live.number } : { number: m.pog.num ?? undefined }) } : null;
  const head = m.won ? e.head : e.lose;
  const c = me?.colors?.[0] || "#1e3a8a";
  return (
    <div className={`sp-overlay sp-res sp-${m.ev}`} onClick={onClose} role="dialog" aria-modal="true" aria-label={`${e.name} final`} style={{ "--sp-team": c }}>
      <Sky ev={m.ev} />
      <div className="sp-stage" onClick={(x) => x.stopPropagation()}>
        <div className="sp-bignum" aria-hidden>{us}–{them}</div>
        <div className="sp-figure">
          {p ? <Jersey team={me} player={p} size={300} decorative /> : <span className="sp-art big" aria-hidden>{e.art}</span>}
        </div>
        <div className="sp-text">
          <div className="sp-k">{e.name} · Final{m.ot ? ` (${m.ot})` : ""}</div>
          <div className="sp-head" role="heading" aria-level={1}>{head[0]}<br />{head[1]}</div>
          <div className="sp-score">
            {me && <TeamBadge team={me} size={40} decorative />}<b>{us}</b><i>–</i><b>{them}</b>{opp && <TeamBadge team={opp} size={40} decorative />}
          </div>
          <p className="sp-sub">{m.won ? "Beat" : "Lost to"} the {opp?.city} {opp?.name} {m.home ? "at home" : "on the road"}.</p>
          {p && <div className="sp-pog"><div className="sp-k">{e.pog}</div><b>{p.name}</b><small>{p.pos}{p.number != null ? ` · #${p.number}` : ""}</small></div>}
          <button type="button" className="sp-cta" onClick={onClose} autoFocus>Continue →</button>
        </div>
      </div>
    </div>
  );
}

export const SPECIAL_MOMENTS = { "special-intro": SpecialIntro, "special-result": SpecialResult };
