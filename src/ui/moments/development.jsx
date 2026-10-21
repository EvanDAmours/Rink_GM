// Development beats: breakout summers, cornerstone seasons, big seasons paying off, and a young
// Generational talent arriving. The engine builds them at rollover (engine/momentsDevelopment.js);
// these draw them on the shared frame, in the style of the season beats.
import React from "react";
import { useGame } from "../common.jsx";
import Headshot from "../Headshot.jsx";
import { MomentFrame } from "../MomentFrame.jsx";
import { DEV_TRAITS } from "../../engine/players.js";
import "./development.css";

const face = (p) => ({ ...p, number: p?.num ?? undefined });
const useClub = (m) => {
  const { league } = useGame();
  return team(league, m);
};
const team = (league, m) => league.teams[m.tid] || league.teams[league.userTid];

// The rating climb: old → new with the gain.
function Climb({ from, to }) {
  const d = (to ?? 0) - (from ?? 0);
  return <div className="mm-d-climb"><span>{from}</span><i aria-hidden>→</i><b>{to}</b>{d > 0 && <em>+{d}</em>}</div>;
}
function Face({ p, t, ring }) {
  return <div className={`mm-d-face${ring ? ` ${ring}` : ""}`}><Headshot p={face(p)} team={t} size={96} decorative /></div>;
}

function BreakoutMoment({ m, onClose }) {
  const t = useClub(m), p = m.p || {};
  return (
    <MomentFrame m={{ ...m, lines: m.lines?.filter(([k]) => k !== "RATING") }} team={t} kicker={m.kicker} title={m.title} onClose={onClose} className="mm-d-breakout">
      <div className="mm-d-body">
        <Face p={p} t={t} />
        <div className="mm-player-text">
          <div className="mm-player-name">{p.name}</div>
          <div className="mm-player-meta"><span className="mm-pos">{p.pos}</span><span>age {p.age}</span></div>
          <Climb from={m.from} to={m.to} />
        </div>
      </div>
    </MomentFrame>
  );
}

function CornerstoneMoment({ m, onClose }) {
  const t = useClub(m), p = m.p || {};
  return (
    <MomentFrame m={{ ...m, lines: m.lines?.filter(([k]) => k !== "RATING") }} team={t} kicker={m.kicker} title={m.title} party onClose={onClose} className="mm-d-corner">
      <div className="mm-d-body gold">
        <Face p={p} t={t} ring="gold" />
        <div className="mm-player-text">
          <div className="mm-player-meta"><span className="mm-pos">{p.pos}</span><span className="mm-d-star">★ Cornerstone</span></div>
          <Climb from={m.from} to={m.to} />
        </div>
      </div>
    </MomentFrame>
  );
}

function RewardsMoment({ m, onClose }) {
  const t = useClub(m);
  return (
    <MomentFrame m={m} team={t} kicker={m.kicker} title={m.title} onClose={onClose} className="mm-d-rewards" wide>
      <div className="mm-d-list">
        {(m.rows || []).map((r, i) => (
          <div key={i} className="mm-d-row">
            <div className="mm-d-row-face"><Headshot p={face(r.p)} team={t} size={44} decorative /></div>
            <div className="mm-d-row-text">
              <div className="mm-d-row-name"><span className="mm-pos">{r.p?.pos}</span> {r.p?.name}</div>
              <div className="mm-d-row-notes">{r.notes.join(" · ")}</div>
              {r.devFrom && <div className="mm-d-row-trait">{DEV_TRAITS[r.devFrom]?.name} → <b>{DEV_TRAITS[r.dev]?.name}</b> developer</div>}
            </div>
            <div className="mm-d-row-ovr">{r.to > r.from ? <><small>{r.from}→</small>{r.to}</> : r.to}</div>
          </div>
        ))}
      </div>
    </MomentFrame>
  );
}

function GenerationalMoment({ m, onClose }) {
  const t = useClub(m), p = m.p || {};
  return (
    <MomentFrame m={m} team={t} kicker={m.kicker} title={m.title} party onClose={onClose} className="mm-d-gen">
      <div className="mm-d-body gen">
        <Face p={p} t={t} ring="gen" />
        <div className="mm-player-text">
          <div className="mm-player-meta"><span className="mm-pos">{p.pos}</span><span className="dev generational">Generational</span></div>
          <div className="mm-d-pot"><small>CEILING</small>{m.pot}</div>
        </div>
      </div>
    </MomentFrame>
  );
}

export const DEV_MOMENTS = { "dev-breakout": BreakoutMoment, "dev-cornerstone": CornerstoneMoment, "dev-rewards": RewardsMoment, "dev-generational": GenerationalMoment };
