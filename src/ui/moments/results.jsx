// Game results and records: the postgame result card and record ceremonies.
// Export { kind: Component }. Each component gets { m, onClose } and usually renders MomentFrame
// from ../MomentFrame.jsx. Put this family's styles in ./results.css (imported here).
//
// result          — the card after your game (Gridiron's WeekResult): compact by default, closing
//                   itself after 10 seconds (hover, focus or a tap keeps it); "full" stays until closed.
// nhlRecord       — your player (or club) sets an NHL single-season record: the gold ceremony.
// franchiseRecord — a club single-season record: the team-colour card.
import React, { useEffect, useRef, useState } from "react";
import { useGame, TeamBadge } from "../common.jsx";
import Headshot from "../Headshot.jsx";
import { MomentFrame, MomentLine, Confetti } from "../MomentFrame.jsx";
import { resultCardMode } from "../../engine/momentsResults.js";
import { poss } from "../../engine/records.js";
import "./results.css";

const SHOW_MS = 10000;
const OUTCOME = {
  W: { word: "WIN", tone: "w" },
  L: { word: "LOSS", tone: "l" },
  OTL: { word: "OT LOSS", tone: "otl" },
};
const fmt = (n) => Number(n || 0).toLocaleString("en-US");
const recText = (r) => (r ? `${r.w}-${r.l}-${r.otl}` : "");
const extra = (ot) => (ot === "SO" ? "SO" : ot ? "OT" : "");
const heroWord = (m) => (m.outcome === "OTL" && m.ot === "SO" ? "SO LOSS" : OUTCOME[m.outcome]?.word || "FINAL");
const heroNote = (m) => (m.outcome === "W" && m.ot ? (m.ot === "SO" ? "in a shootout" : "in overtime") : m.outcome === "OTL" ? "a point banked" : "");

// The game behind the card: the schedule's own entry while it's this season, else the copy kept with the card.
const gameOf = (league, m, id = m.gid) => (league.year === m.year && league.schedule?.find((g) => g.id === id && g.played)) || null;

// A result card: the full version or the compact one, by the player's setting (Settings → League).
function ResultCard({ m, onClose }) {
  const { league } = useGame();
  const mode = resultCardMode(league);
  useEffect(() => { if (mode === "off") onClose(); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  if (mode === "off" || !league.teams[m.tid] || !league.teams[m.opp]) return null;
  return <ResultShell m={m} onClose={onClose} full={mode === "full"} />;
}

// The floating shell: top right under the bar (top of the screen on phones). The compact card
// closes itself after 10 seconds with a bar counting down; hovering or focusing it pauses the bar,
// and tapping anything in it keeps it up. Escape or ✕ closes it; on phones a swipe up does too.
// The full card stays until it's closed or you go to another screen.
function ResultShell({ m, onClose, full }) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [kept, setKept] = useState(full);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const left = useRef(SHOW_MS), since = useRef(0), startY = useRef(null);
  const paused = hover || focus;
  useEffect(() => {
    if (kept || paused) return undefined;
    since.current = Date.now();
    const t = setTimeout(() => closeRef.current(), left.current);
    return () => { clearTimeout(t); left.current = Math.max(0, left.current - (Date.now() - since.current)); };
  }, [kept, paused]);
  const keptRef = useRef(kept);
  keptRef.current = kept;
  const ref = useRef(null);
  useEffect(() => {
    const key = (e) => { if (e.key === "Escape") closeRef.current(); };
    // Moving on gets it out of the way (Gridiron keeps its card to the screen it opened on):
    // going to another screen closes either card; any other button closes the compact one
    // unless you've kept it. Scrolling or tapping empty space leaves it be.
    const down = (e) => {
      const t = e.target;
      if (!ref.current || !t?.closest || ref.current.contains(t)) return;
      if (t.closest(".modalbg, .mm-overlay, .rn-overlay, [role=dialog]")) return;
      const nav = t.closest(".gg-tabs, .gg-menu, .gg-ico, .gg-hub-chips");
      const act = t.closest("button, a, input, select, textarea, [role=button], [role=tab]");
      if (nav || (act && !keptRef.current)) closeRef.current();
    };
    window.addEventListener("keydown", key);
    document.addEventListener("pointerdown", down, true);
    return () => { window.removeEventListener("keydown", key); document.removeEventListener("pointerdown", down, true); };
  }, []);
  const { league } = useGame();
  const me = league.teams[m.tid], opp = league.teams[m.opp];
  const tone = OUTCOME[m.outcome]?.tone || "otl";
  const said = `${heroWord(m)}, ${me.name} ${m.us}, ${opp.name} ${m.them}${m.ot ? ` (${m.ot})` : ""}. ${recText(m.rec)}, ${m.place}.`;
  return (
    <section
      ref={ref}
      className={`rc-shell ${full ? "full" : "compact"} ${tone}`}
      aria-label="Game result"
      style={{ "--rc-team": me.colors?.[0] || "#1e3a8a", "--rc-team2": me.colors?.[1] || "#f59e0b" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocus(false); }}
      onClickCapture={() => setKept(true)}
      onTouchStart={(e) => { startY.current = e.touches[0].clientY; setKept(true); }}
      onTouchEnd={(e) => { if (startY.current != null && startY.current - e.changedTouches[0].clientY > 50) onClose(); startY.current = null; }}
    >
      <span className="sr-only" aria-live="polite">{said}</span>
      {full ? <FullCard m={m} me={me} opp={opp} onClose={onClose} /> : <CompactCard m={m} me={me} opp={opp} onClose={onClose} />}
      {!kept && <div className="rc-timer" aria-hidden><i className={paused ? "paused" : ""} style={{ animationDuration: `${SHOW_MS}ms` }} /></div>}
    </section>
  );
}

const Close = ({ onClose }) => <button type="button" className="rc-x" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Dismiss result">✕</button>;

// Box score for your game; the card waits underneath and comes back when the box closes.
function useBox(m) {
  const { league, openBox } = useGame();
  return (id = m.gid) => {
    const g = gameOf(league, m, id) || (id === m.gid ? m.game : (() => { const o = m.others?.find((x) => x.id === id); return o && { ...o, day: m.day, stars: [] }; })());
    if (g) openBox(g);
  };
}

// The night's other scores, each a tap from its box score.
function Others({ m, onBox }) {
  const { league } = useGame();
  if (!m.others?.length) return <div className="rc-others"><div className="rc-k">AROUND THE LEAGUE</div><div className="rc-dim">No other games tonight.</div></div>;
  return (
    <div className="rc-others">
      <div className="rc-k">AROUND THE LEAGUE</div>
      <div className="rc-chips">
        {m.others.map((x) => {
          const H = league.teams[x.h], A = league.teams[x.a];
          if (!H || !A) return null;
          const hw = x.hs > x.as, aw = x.as > x.hs;
          return (
            <button type="button" key={x.id} className="rc-chip" onClick={() => onBox(x.id)} title={`${A.city} ${A.name} at ${H.city} ${H.name}: box score`}>
              <span className={aw ? "won" : ""}>{A.abbr} {x.as}</span>
              <span className="rc-at"> @ </span>
              <span className={hw ? "won" : ""}>{H.abbr} {x.hs}</span>
              {x.ot && <span className="rc-ot">{x.ot}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// A star's name opens his card.
function Who({ s }) {
  const { league, openPlayer } = useGame();
  const p = league.players[s.pid];
  return p ? <button type="button" className="rc-name" onClick={() => openPlayer(p.id)}>{s.name}</button> : <b className="rc-name">{s.name}</b>;
}

function StarRow({ s, rank }) {
  const { league } = useGame();
  return (
    <div className="rc-star">
      <span className="rc-stars" aria-label={`${["First", "Second", "Third"][rank]} star`}>{"★".repeat(3 - rank)}</span>
      <Who s={s} />
      <span className="rc-meta">{s.pos} · {league.teams[s.tid]?.abbr}</span>
      {s.line && <span className="rc-line">{s.line}</span>}
    </div>
  );
}

function Side({ t, score, win }) {
  return (
    <div className={`rc-side${win ? " win" : ""}`}>
      <TeamBadge team={t} size={34} decorative />
      <div className="rc-side-name"><small>{t.city}</small><b>{t.name}</b></div>
      <span className="rc-score">{score}</span>
    </div>
  );
}

// The full card: the result in big type over your colours, both clubs and the score, the three
// stars (your goalie's line too), Box score, and the league's other scores a tap away.
function FullCard({ m, me, opp, onClose }) {
  const [others, setOthers] = useState(false);
  const box = useBox(m);
  const note = heroNote(m);
  return (
    <div className="rc-card">
      <Close onClose={onClose} />
      <div className="rc-head">
        <span className="rc-kick">GAME {m.gameNo} · {m.home ? "HOME" : "AWAY"}</span>
        <span className="rc-rec">{recText(m.rec)} · {m.rec?.pts} PTS{m.place ? ` · ${m.place}` : ""}</span>
      </div>
      <div className="rc-body">
        <div className="rc-hero">
          <span className="rc-word">{heroWord(m)}</span>
          {note && <span className="rc-note">{note}</span>}
        </div>
        <div className="rc-sides">
          <Side t={me} score={m.us} win={m.us > m.them} />
          <Side t={opp} score={m.them} win={m.them > m.us} />
          {m.ot && <span className="rc-final">FINAL / {m.ot}</span>}
        </div>
        <div className="rc-perf">
          <div className="rc-k">THREE STARS</div>
          {m.stars?.map((s, i) => <StarRow key={s.pid} s={s} rank={i} />)}
          {!m.stars?.length && <div className="rc-dim">No stars named.</div>}
          {m.goalie && <div className="rc-star rc-net"><span className="rc-stars rc-in">IN NET</span><Who s={m.goalie} /><span className="rc-line">{m.goalie.line}</span></div>}
          <div className="rc-btns">
            <button type="button" className="rc-btn blue" onClick={() => box()}>Box score</button>
            <button type="button" className="rc-btn ghost" aria-expanded={others} onClick={() => setOthers((v) => !v)}>League scores {others ? "▴" : "▾"}</button>
          </div>
        </div>
      </div>
      {others && <Others m={m} onBox={box} />}
    </div>
  );
}

// The compact card: two lines (result, both logos and the score, record and place; the first star,
// Box score and League scores).
function CompactCard({ m, me, opp, onClose }) {
  const [others, setOthers] = useState(false);
  const box = useBox(m);
  const top = m.stars?.[0];
  const letter = m.outcome === "OTL" ? "OTL" : m.outcome;
  return (
    <div className="rc-card">
      <Close onClose={onClose} />
      <div className="rc-row1">
        <span className="rc-letter" title={heroWord(m)}>{letter}</span>
        <span className="rc-mini"><TeamBadge team={me} size={26} decorative /><b className={m.us >= m.them ? "" : "lost"}>{m.us}</b><span className="rc-dash">–</span><b className={m.them >= m.us ? "" : "lost"}>{m.them}</b><TeamBadge team={opp} size={26} decorative />{m.ot && <span className="rc-ot">{extra(m.ot)}</span>}</span>
        <span className="rc-sum"><b>{recText(m.rec)}</b>{m.place ? ` · ${m.place}` : ""}</span>
      </div>
      <div className="rc-row2">
        {top ? <span className="rc-top"><span className="rc-stars">★</span> <Who s={top} /> <span className="rc-line">{top.line}</span></span> : <span className="rc-top" />}
        <button type="button" className="rc-btn blue sm" onClick={() => box()}><span className="rc-long">Box score</span><span className="rc-short" aria-hidden>Box</span></button>
        <button type="button" className="rc-btn ghost sm" aria-expanded={others} aria-label="League scores" onClick={() => setOthers((v) => !v)}><span className="rc-long">League scores</span><span className="rc-short" aria-hidden>Scores</span> {others ? "▴" : "▾"}</button>
      </div>
      {others && <Others m={m} onBox={box} />}
    </div>
  );
}

// ---------- Records ----------

// The number climbs to the new mark (instantly when motion is reduced).
function CountUp({ value, ms = 1700 }) {
  const target = Number(value) || 0;
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [v, setV] = useState(reduce ? target : 0);
  useEffect(() => {
    if (reduce || typeof requestAnimationFrame === "undefined") { setV(target); return undefined; }
    let raf, t0;
    const step = (t) => { if (t0 == null) t0 = t; const k = Math.min(1, (t - t0) / ms); setV(Math.round(target * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduce]);
  return fmt(v);
}

const prevLine = (pv) => (pv ? `${pv.name}, ${fmt(pv.value)}${pv.season ? ` (${pv.season})` : ""}` : "");

// A new NHL record: the league stops for it. Lights sweep the arena, the number climbs to the new
// mark, the old one is struck through. (Franchise records keep the team-colour card.)
function RecordNight({ m, onClose }) {
  const { league } = useGame();
  const t = league.teams[m.tid];
  const p = m.pid != null ? league.players[m.pid] || null : null;
  const clr = t?.colors?.[0] || "#1e3a8a";
  useEffect(() => {
    const key = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const label = String(m.label || "");
  return (
    <div className="rn-overlay" onClick={onClose}>
      <div className="rn-beam l" aria-hidden />
      <div className="rn-beam r" aria-hidden />
      <Confetti colors={["#fbbf24", "#fde68a", "#d4a017", clr, "#ffffff"]} />
      <div role="dialog" aria-modal="true" aria-label="New NHL record" className="rn-card" onClick={(e) => e.stopPropagation()}>
        <div className="rn-kick">★ ★ ★ HISTORY ★ ★ ★</div>
        <div className="mm-title rn-title">NEW NHL RECORD</div>
        <div className="rn-sub">{m.teamRecord ? `THE MOST ${label.replace(/^Team /i, "").toUpperCase()} BY A CLUB IN ONE SEASON` : `THE MOST ${label.toUpperCase()} IN A SINGLE SEASON`}</div>
        <div className="rn-ring-wrap"><div className="rn-ring">{p ? <Headshot p={p} team={t} size={124} decorative /> : <span className="rn-logo"><TeamBadge team={t} size={104} decorative /></span>}</div></div>
        <div className="rn-name">{p ? p.name : m.p?.name || `${t.city} ${t.name}`}</div>
        <div className="rn-who">{(p?.pos || m.p?.pos) && <span className="mm-pos">{p?.pos || m.p?.pos}</span>}<TeamBadge team={t} size={22} decorative /><span>{t.city} {t.name}{m.season ? ` · ${m.season}` : ""}</span></div>
        <div className="rn-num"><CountUp value={m.value} /></div>
        <div className="rn-label">{label.toUpperCase()}</div>
        {m.prev && <div className="rn-old"><span className="rn-old-k">OLD RECORD</span>{prevLine(m.prev)}<span className="rn-strike" aria-hidden /></div>}
        {m.sub && <div className="rn-say">{m.sub}</div>}
        {m.also?.length > 0 && <div className="rn-also">{m.also.map(([k, v]) => <MomentLine key={k + v} k={k} v={v} tone="#fde68a" />)}</div>}
        <button type="button" className="rn-cta" onClick={onClose} autoFocus>INTO THE RECORD BOOK →</button>
      </div>
    </div>
  );
}

// A club record: the team-colour card, the player (or the club) with the new number.
function FranchiseRecord({ m, onClose }) {
  const { league } = useGame();
  const t = league.teams[m.tid];
  const p = m.pid != null ? league.players[m.pid] || null : null;
  return (
    <MomentFrame m={{ ...m, lines: m.also, note: null }} team={t} kicker={m.kicker || "NEW FRANCHISE RECORD"} title={m.title} party onClose={onClose} className="fr-record">
      <div className="mm-player">
        {p ? <Headshot p={p} team={t} size={84} decorative /> : <TeamBadge team={t} size={72} decorative />}
        <div className="mm-player-text">
          <div className="mm-player-meta">{(p?.pos || m.p?.pos) && <span className="mm-pos">{p?.pos || m.p?.pos}</span>}<span>{m.label}</span></div>
          <div className="mm-big">{fmt(m.value)}</div>
          {m.prev && <div className="fr-prev">Passing {poss(m.prev.name)} {fmt(m.prev.value)}{m.prev.season ? ` (${m.prev.season})` : ""}</div>}
        </div>
      </div>
    </MomentFrame>
  );
}

export const RESULT_MOMENTS = { result: ResultCard, nhlRecord: RecordNight, franchiseRecord: FranchiseRecord };
