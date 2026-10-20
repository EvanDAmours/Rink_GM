// Season beats (Gridiron 3.0, 3.2, 3.49): clinches, Signing Day, blockbuster trades, a franchise
// legend retiring and the Hockey Hall of Fame induction. The engine builds each moment
// (engine/momentsSeason.js); these draw them on the shared frame, as Gridiron's Moment.jsx does,
// and the Hall of Fame gets its own gold ceremony (Gridiron's HofCeremony, with a plaque unveiled
// in Toronto in place of the gold jacket in Canton).
import React, { useEffect } from "react";
import { useGame, TeamBadge } from "../common.jsx";
import Headshot from "../Headshot.jsx";
import { MomentFrame, MomentLine } from "../MomentFrame.jsx";
import { fmtMoney } from "../../engine/players.js";
import "./season.css";

// The snapshot keeps `num`; the sweater art reads `number`.
const face = (p) => ({ ...p, number: p?.num ?? undefined });
const surname = (name) => String(name || "").split(" ").slice(1).join(" ") || String(name || "");
const useClub = (m) => {
  const { league } = useGame();
  return { league, team: league.teams[m.tid] || league.teams[league.userTid] };
};

// Playoff berth, the division, first in the conference, the Presidents' Trophy: confetti in club colours.
function ClinchMoment({ m, onClose }) {
  const { team } = useClub(m);
  return <MomentFrame m={m} team={team} kicker={m.kicker} title={m.title} party onClose={onClose} className={`mm-s-clinch lvl-${m.level || "berth"}`} />;
}

// Signing Day: every free agent you win, and every 80+ signing from another club.
function SigningMoment({ m, onClose }) {
  const { team } = useClub(m);
  const p = m.p || {};
  return (
    <MomentFrame m={m} team={team} kicker="SIGNING DAY" title={`${m.back ? "WELCOME BACK TO" : "WELCOME TO"} ${team.city.toUpperCase()}`} onClose={onClose} className="mm-s-signing">
      <div className="mm-player mm-s-body">
        <div className="mm-s-face">
          <Headshot p={face(p)} team={team} size={96} decorative />
          {m.num != null && <span className="mm-s-num">#{m.num}</span>}
        </div>
        <div className="mm-player-text">
          <div className="mm-player-name">{p.name}</div>
          <div className="mm-player-meta"><span className="mm-pos">{p.pos}</span><span>{p.ovr} OVR · age {p.age}</span></div>
          <div className="mm-s-deal">{m.yrs} year{m.yrs === 1 ? "" : "s"} · {fmtMoney(m.aav)} a year</div>
        </div>
      </div>
    </MomentFrame>
  );
}

// Breaking: a blockbuster. His old club's crest, him, an arrow, his new club's crest.
function TradeMoment({ m, onClose }) {
  const { league, team } = useClub(m);
  const other = league.teams[m.other];
  const p = m.p || {};
  const [from, to] = m.got ? [other, team] : [team, other];
  return (
    <MomentFrame m={m} team={team} kicker={m.kicker} title={m.title} onClose={onClose} className="mm-s-trade">
      <div className="mm-s-swap">
        {from && <TeamBadge team={from} size={60} decorative />}
        <div className="mm-s-swap-p">
          <div className="mm-s-face"><Headshot p={face(p)} team={to || team} size={84} decorative /></div>
          <div className="mm-s-swap-name">{p.name}</div>
          <div className="mm-player-meta"><span className="mm-pos">{p.pos}</span><span>{p.ovr} OVR · age {p.age}</span></div>
        </div>
        <span className="mm-s-arrow" aria-hidden>→</span>
        {to && <TeamBadge team={to} size={60} decorative />}
      </div>
    </MomentFrame>
  );
}

// A franchise legend retires: gold-ringed portrait, "Thank you", his peak.
function LegendMoment({ m, onClose }) {
  const { team } = useClub(m);
  const p = m.p || {};
  return (
    <MomentFrame m={m} team={team} kicker={m.kicker} title={m.title} onClose={onClose} className="mm-s-legend">
      <div className="mm-s-legend-body">
        <div className="mm-s-ring"><div className="mm-s-face"><Headshot p={face(p)} team={team} size={96} decorative /></div></div>
        <div className="mm-player-text">
          <div className="mm-player-meta"><span className="mm-pos">{p.pos}</span><span className="mm-s-thanks">Thank you, {surname(p.name)}.</span></div>
          <div className="mm-s-peak">{p.peak || p.ovr}<small>peak OVR</small></div>
        </div>
      </div>
    </MomentFrame>
  );
}

// The Hockey Hall of Fame: the drapes part on his plaque, the Class is announced.
function HallMoment({ m, onClose }) {
  const { team } = useClub(m);
  const p = m.p || {};
  useEffect(() => {
    const key = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const others = (m.classOf || []).filter((c) => c.name !== p.name);
  return (
    <div className="mm-hof" onClick={onClose}>
      <div className="mm-hof-rays" aria-hidden />
      <div role="dialog" aria-modal="true" aria-label={`Hockey Hall of Fame: ${p.name}`} className="mm-hof-card" onClick={(e) => e.stopPropagation()}>
        <div className="mm-hof-kicker">HOCKEY HALL OF FAME</div>
        <div className="mm-hof-class">TORONTO · CLASS OF {m.cls}</div>
        <div className="mm-hof-stage">
          <div className="mm-hof-plaque">
            <div className="mm-hof-medal"><Headshot p={face(p)} team={team} size={92} decorative /></div>
            <div className="mm-hof-pname">{String(p.name || "").toUpperCase()}</div>
            <div className="mm-hof-pmeta">{p.pos}{p.num != null ? ` · #${p.num}` : ""} · INDUCTED {m.cls}</div>
            <div className="mm-hof-engrave" aria-hidden><i /><i /><i /><i /></div>
          </div>
          <div className="mm-hof-drape l" aria-hidden />
          <div className="mm-hof-drape r" aria-hidden />
        </div>
        <div className="mm-title mm-hof-name">{p.name}</div>
        <div className="mm-hof-team"><span className="mm-pos">{p.pos}</span>{team && <TeamBadge team={team} size={24} decorative />}<span>{m.tagline || `${team.city} ${team.name}`}</span></div>
        {m.sub && <div className="mm-hof-sub">{m.sub}</div>}
        {m.lines?.length > 0 && <div className="mm-hof-lines">{m.lines.map(([k, v, tone]) => <MomentLine key={k} k={k} v={v} tone={tone || "#fde68a"} />)}</div>}
        {others.length > 0 && (
          <div className="mm-hof-classlist">
            <div className="mm-hof-classlist-h">ALSO IN THE CLASS OF {m.cls}</div>
            <div>{others.map((c) => `${c.name} (${c.pos})`).join(" · ")}</div>
          </div>
        )}
        <button type="button" className="mm-hof-cta" onClick={onClose} autoFocus>WELCOME TO THE HALL →</button>
      </div>
    </div>
  );
}

export const SEASON_MOMENTS = { clinch: ClinchMoment, signing: SigningMoment, trade: TradeMoment, legend: LegendMoment, hof: HallMoment };
