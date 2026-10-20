// The Stanley Cup and awards night (Gridiron's SuperBowlWin, SeasonAwards and RingNight, in hockey):
//   cupWin      the moment your club wins the Cup: fireworks, confetti in your colours and silver,
//               the final score, the Cup rising, what the title means and the Conn Smythe winner
//   awardsNight the NHL Awards, one envelope at a time (Conn Smythe first), then the All-Star Teams
//   ringNight   the next season's home opener: the banner goes up and the rings come out
// Each component gets { m, onClose }; the data comes from engine/momentsCup.js.
import React, { useEffect, useState } from "react";
import { useGame, TeamBadge } from "../common.jsx";
import Headshot from "../Headshot.jsx";
import StanleyCup3D from "../StanleyCup3D.jsx";
import Ring from "../Ring.jsx";
import { Confetti, Fireworks, momentColors } from "../MomentFrame.jsx";
import { trophyUrl } from "../trophies.js";
import { AWARD_NAMES, AWARD_BLURB, ALL_STAR_LABEL } from "../../engine/awards.js";
import "./cup.css";

const season = (y) => `${y}–${String(y + 1).slice(2)}`;
const SILVER = ["#e5e7eb", "#cbd5e1", "#ffffff"];

function useEscape(onClose) {
  useEffect(() => {
    const key = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
}

// The Cup art: the real-looking 3D Cup, with the trophy render when WebGL isn't available.
export function CupArt({ size = 150 }) {
  const img = trophyUrl("stanley");
  return <StanleyCup3D size={size}>{img ? <img className="cw-cup-img" src={img} alt="The Stanley Cup" style={{ height: size * 1.3 }} draggable={false} /> : null}</StanleyCup3D>;
}

const Pos = ({ pos }) => (pos ? <span className="mm-pos">{pos}</span> : null);

// ---------- The Cup is yours ----------
function CupWin({ m, onClose }) {
  const { league } = useGame();
  const t = league.teams[m.tid], o = m.opp != null ? league.teams[m.opp] : null;
  const { clr, ac } = momentColors(t);
  useEscape(onClose);
  const mvp = m.mvp;
  return (
    <div className="cw-overlay" style={{ "--cw-clr": clr, "--cw-ac": ac }}>
      <Fireworks colors={[ac, "#ffffff", "#e5e7eb", "#fde68a"]} />
      <div className="cw-spot" aria-hidden />
      <Confetti colors={[clr, ac, ...SILVER]} />
      <div role="dialog" aria-modal="true" aria-label="Stanley Cup champions" className="cw-body">
        <div className="cw-kicker">FINAL · GAME {m.game} · {m.season + 1} STANLEY CUP FINAL</div>
        {o && m.us != null && (
          <div className="cw-score">
            <TeamBadge team={t} size={48} decorative />
            <span className="cw-score-n">{m.us}–{m.them}{m.ot ? <small> {m.ot}</small> : null}</span>
            <TeamBadge team={o} size={40} decorative />
          </div>
        )}
        {o && <div className="cw-series">Won the series {m.wins}–{m.losses} over the {o.city} {o.name}</div>}
        <div className="cw-cup"><CupArt size={typeof window !== "undefined" && window.innerWidth > 640 && window.innerHeight > 760 ? 185 : 150} /></div>
        <div className="cw-title">STANLEY CUP CHAMPIONS</div>
        <div className="cw-team">THE {t.city.toUpperCase()} {t.name.toUpperCase()}</div>
        <div className="cw-what">{m.what}</div>
        {mvp && (
          <div className="cw-mvp">
            <span className="cw-mvp-ring"><Headshot p={mvp.p} team={t} size={58} decorative /></span>
            <div className="cw-mvp-text">
              <div className="cw-mvp-k">CONN SMYTHE TROPHY</div>
              <div className="cw-mvp-name">{mvp.name} <Pos pos={mvp.p?.pos} /></div>
              {mvp.why && <div className="cw-mvp-why">{mvp.why}</div>}
            </div>
          </div>
        )}
        <div className="cw-cta-wrap"><button type="button" className="cw-cta" onClick={onClose} autoFocus>READ ALL ABOUT IT →</button></div>
      </div>
    </div>
  );
}

// ---------- Awards night ----------
// One envelope: sealed (the trophy and its name, tap to open) or opened (the winner).
function Envelope({ e, open, next, big, onOpen, league }) {
  const t = e.tid != null ? league.teams[e.tid] : null;
  const mine = e.tid === league.userTid;
  const art = trophyUrl(e.k);
  const label = AWARD_NAMES[e.k] || e.k;
  if (!open) {
    return (
      <button type="button" className={`an-env sealed${big ? " big" : ""}${next ? " next" : ""}`} onClick={onOpen} aria-label={`Open the envelope: ${label}`}>
        {art && <img className="an-art" src={art} alt="" draggable={false} />}
        <span className="an-env-text"><span className="an-k">{label}</span><span className="an-blurb">{AWARD_BLURB[e.k]}</span></span>
        <span className="an-seal" aria-hidden>{next ? "OPEN" : "✉"}</span>
      </button>
    );
  }
  return (
    <div className={`an-env opened${big ? " big" : ""}${mine ? " mine" : ""}`}>
      {art && <img className="an-art" src={art} alt="" draggable={false} />}
      <span className="an-face">{e.p && t ? <Headshot p={e.p} team={t} size={big ? 64 : 46} decorative /> : t ? <TeamBadge team={t} size={big ? 56 : 40} decorative /> : null}</span>
      <span className="an-env-text">
        <span className="an-k">{label}</span>
        <span className="an-name"><Pos pos={e.p?.pos} /><span className="an-name-t">{e.name}</span>{mine && <span className="an-yours">YOUR TEAM</span>}</span>
        <span className="an-line">{t && <TeamBadge team={t} size={16} decorative />}{t ? <b>{t.abbr}</b> : null}{e.why ? ` · ${e.why}` : ""}</span>
      </span>
    </div>
  );
}

// The Final as a scoreboard: both clubs, the series score.
function FinalBoard({ champ, opp, wins, losses }) {
  if (!champ) return null;
  return (
    <div className="an-board" aria-label={`Stanley Cup Final: ${champ.name} ${wins}, ${opp?.name || ""} ${losses}`}>
      <span className="an-board-side win"><TeamBadge team={champ} size={40} decorative /><b>{champ.abbr}</b><span className="an-board-n">{wins}</span></span>
      <span className="an-board-mid"><small>STANLEY CUP</small><b>FINAL</b></span>
      {opp && <span className="an-board-side"><span className="an-board-n">{losses}</span><b>{opp.abbr}</b><TeamBadge team={opp} size={40} decorative /></span>}
    </div>
  );
}

const TEAM_ORDER = ["first", "second", "rookie"];
function AllStarList({ title, list, league }) {
  if (!list?.length) return null;
  return (
    <div className="an-team">
      <div className="an-team-h">{title.toUpperCase()}</div>
      <div className="an-team-grid">
        {list.map((e, i) => (
          <div key={`${e.pid}${i}`} className={`an-pick${e.tid === league.userTid ? " mine" : ""}`}>
            <span className="an-slot">{e.slot}</span>
            <span className="an-pick-name">{e.name}</span>
            <span className="an-pick-team">{e.abbr}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AwardsNight({ m, onClose }) {
  const { league, go } = useGame();
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState(() => new Set());
  useEscape(onClose);
  const env = m.envelopes || [];
  const next = env.findIndex((_, i) => !opened.has(i));
  const all = next < 0;
  const open = (i) => setOpened((s) => new Set([...s, i]));
  const ct = m.champ != null ? league.teams[m.champ] : null, ot = m.opp != null ? league.teams[m.opp] : null;
  const { clr } = momentColors(ct);
  const hasTeams = m.allNHL?.first?.length > 0;
  // Something new for your shelf: the Cup or one of tonight's trophies.
  const yoursToShow = m.champ === league.userTid || env.some((e) => e.tid === league.userTid);
  const finish = () => { onClose(); if (yoursToShow) go?.("trophies"); };
  const cta = yoursToShow ? "TO THE LEGACY HALL →" : "CONTINUE →";
  return (
    <div className="an-overlay">
      <div role="dialog" aria-modal="true" aria-label={page === 1 ? "NHL Awards" : "NHL All-Star Teams"} className={`an-card${page === 2 ? " p2" : ""}`} key={page}>
        <button type="button" className="an-x" onClick={onClose} aria-label="Close">×</button>
        {page === 1 ? (
          <>
            <div className="an-head" style={{ "--an-clr": clr }}>
              <div className="an-kicker">{season(m.season)} NHL AWARDS</div>
              {ct && <div className="an-champ">
                <TeamBadge team={ct} size={64} decorative />
                <div>
                  <div className="an-champ-k">Stanley Cup champions</div>
                  <div className="an-champ-name">{ct.city} {ct.name}</div>
                  {ot && m.wins != null && <div className="an-champ-sub">Beat the {ot.name} {m.wins}-{m.losses}</div>}
                </div>
              </div>}
              <FinalBoard champ={ct} opp={ot} wins={m.wins} losses={m.losses} />
            </div>
            <div className="an-body">
              <div className="an-grid">
                {env.map((e, i) => <Envelope key={e.k} e={e} league={league} open={opened.has(i)} next={i === next} big={i === 0} onOpen={() => open(i)} />)}
              </div>
              <div className="an-foot">
                {!all ? (
                  <>
                    <button type="button" className="an-btn ghost" onClick={() => setOpened(new Set(env.map((_, i) => i)))}>Show all</button>
                    <button type="button" className="an-btn" onClick={() => open(next)} autoFocus>OPEN THE {next === 0 ? "FIRST" : "NEXT"} ENVELOPE</button>
                  </>
                ) : (
                  <button type="button" className="an-btn" onClick={hasTeams ? () => setPage(2) : finish} autoFocus>{hasTeams ? "THE ALL-STAR TEAMS →" : cta}</button>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="an-head gold">
              <div className="an-kicker">{season(m.season)} NHL ALL-STAR TEAMS</div>
              <div className="an-head-sub">The league's best at every position. First Team honourees gain 2 OVR next season, Second Team 1.</div>
            </div>
            <div className="an-body">
              <div className="an-mine">
                <div className="an-mine-h">YOUR HONOUREES</div>
                {!m.mine?.length && <div className="an-mine-none">None of your players made an All-Star Team this year.</div>}
                {(m.mine || []).map((x) => (
                  <div key={x.pid} className="an-mine-row">
                    <Pos pos={x.pos} />
                    <span className="an-mine-who"><b>{x.name}</b><small>{ALL_STAR_LABEL[x.team]}</small></span>
                    <span className={`an-gain${x.gain ? "" : " none"}`}>{x.gain ? `+${x.gain} OVR next season` : x.team === "rookie" ? "honour only" : "already elite"}</span>
                  </div>
                ))}
              </div>
              {TEAM_ORDER.map((k) => <AllStarList key={k} title={ALL_STAR_LABEL[k]} list={m.allNHL?.[k]} league={league} />)}
              <div className="an-foot">
                <button type="button" className="an-btn ghost" onClick={() => setPage(1)}>← Awards</button>
                <button type="button" className="an-btn" onClick={finish} autoFocus>{cta}</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Ring night ----------
// The championship banner going up to the rafters.
function Banner({ team, season: yr }) {
  const { clr, ac } = momentColors(team);
  return (
    <div className="rn-banner" style={{ "--rn-clr": clr, "--rn-ac": ac }} aria-hidden>
      <span className="rn-rope" />
      <span className="rn-flag">
        <TeamBadge team={team} size={46} decorative />
        <b>STANLEY CUP</b>
        <b>CHAMPIONS</b>
        <i>{season(yr)}</i>
      </span>
    </div>
  );
}

function RingNight({ m, onClose }) {
  const { league } = useGame();
  const t = league.teams[m.tid], o = m.opp != null ? league.teams[m.opp] : null;
  const { clr } = momentColors(t);
  useEscape(onClose);
  const score = m.wins != null ? `${m.wins}-${m.losses}` : "";
  return (
    <div className="rn-overlay">
      <Confetti colors={[clr, "#e8c45a", "#fde68a", "#ffffff"]} />
      <div role="dialog" aria-modal="true" aria-label="Ring night" className="rn-card">
        <div className="rn-kicker">RING NIGHT · {season(m.season + 1)} HOME OPENER</div>
        <div className="rn-stage">
          <Banner team={t} season={m.season} />
          <div className="rn-ring"><Ring team={t} season={m.season} opp={o} score={score} titles={m.titles} size={250} /></div>
        </div>
        <div className="rn-title mm-title">{season(m.season)} STANLEY CUP CHAMPIONS</div>
        <div className="rn-sub">{score ? <>Champions {score}{o ? <> over the {o.name}</> : null}. </> : null}The {t.city} {t.name} raise the banner and hand out the rings before the {season(m.season + 1)} opener.</div>
        {m.names?.length > 0 && (
          <div className="rn-names">
            <div className="rn-names-h">GETTING THEIR RINGS</div>
            <div className="rn-names-list">{m.names.join(" · ")}</div>
          </div>
        )}
        <button type="button" className="rn-cta" onClick={onClose} autoFocus>DEFEND THE CUP →</button>
      </div>
    </div>
  );
}

export const CUP_MOMENTS = { cupWin: CupWin, awardsNight: AwardsNight, ringNight: RingNight };
