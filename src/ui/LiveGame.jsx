import CupFinalSplash from "./CupFinalSplash.jsx";
import Rink, { STEP_SEC } from "./LiveRink.jsx";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useGame, TeamBadge, PlayerName } from "./common.jsx";
import { skatersForDisplay, skaterCount, takeTimeout, serializeGame, restoreGame, createGame, stepGame, simToEnd, applyResult, periodLabel, clockLabel } from "../engine/sim.js";
import { playScheduledGame, finishDay } from "../engine/league.js";
import { recordSeriesGame, simPlayoffDay, ROUND_NAMES } from "../engine/playoffs.js";

const SPEEDS = [["Slow", 2000], ["Normal", 1200], ["Fast", 450], ["Turbo", 70]];
const SPEED_KEY = "rinkgm_live_speed";


export default function LiveGame({ spec, onDone }) {
  const { league, commit } = useGame();
  const home = league.teams[spec.home];
  const away = league.teams[spec.away];
  const stateRef = useRef(null);
  if (!stateRef.current) {
    const saved=league.activeGame;
    const same=saved?.spec?.kind===spec.kind && saved.spec.home===spec.home && saved.spec.away===spec.away && saved.spec.gid===spec.gid;
    stateRef.current=same?restoreGame(league,saved.state):createGame(league,home,away,{live:true,userTid:league.userTid,playoff:spec.kind==='playoff'});
    if(spec.kind==='playoff') spec.series=league.playoffs.rounds[spec.series.round].find(q=>q.top===spec.series.top && q.bot===spec.series.bot);
  }
  const s = stateRef.current;
  const [, rerender] = useState(0);
  const persist = () => { league.activeGame={version:1,spec:structuredClone(spec),state:serializeGame(s)}; commit(); };
  const force = fn => { persist(); rerender(fn); };
  useEffect(() => { persist(); }, []); // initial puck-drop checkpoint
  const [speed, setSpeedState] = useState(() => {
    try {
      const v = Number(localStorage.getItem(SPEED_KEY));
      return SPEEDS.some(([, ms]) => ms === v) ? v : 1200;
    } catch {
      return 1200;
    }
  });
  const setSpeed = (ms) => {
    setSpeedState(ms);
    try { localStorage.setItem(SPEED_KEY, String(ms)); } catch { /* private mode */ }
  };
  const [paused, setPaused] = useState(!!league.activeGame);
  const [banner, setBanner] = useState(null);
  const isFinal = spec.kind === 'playoff' && spec.series?.round === 3;
  // Every playoff game you play live opens with a walkout (the Final's has the Cup).
  const [curtain, setCurtain] = useState(spec.kind === 'playoff' && !league.activeGame?.state?.elapsed);
  const [committed, setCommitted] = useState(false);
  const stepInfo = useRef({ at: performance.now(), dur: 1200, shot: null, periodEnd: false, paused: true });
  const clockRef = useRef(null);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const me = s.userSide;
  const mySide = me ? s[me] : null;

  // One 10-second step of the game; returns how long to hold before the next one
  // (a moment to take in a goal or the end of a period).
  const doStep = () => {
    const before = s.events.length;
    stepGame(s);
    const fresh = s.events.slice(before);
    const ms = speedRef.current;
    const shotEv = [...fresh].reverse().find((e) => ["goal", "save", "so-goal", "so-miss"].includes(e.t));
    const periodEv = fresh.find((e) => e.t === "period" || e.t === "final");
    stepInfo.current = { at: performance.now(), dur: ms, shot: shotEv ? { x: shotEv.x, y: shotEv.y } : null, periodEnd: !!periodEv && s.phase !== "so", paused: false };
    const goalEv = fresh.find((e) => e.t === "goal");
    const calm = ms >= 400;
    let hold = 0;
    if (goalEv) {
      const t = goalEv.side === "h" ? home : away;
      const parts = goalEv.text.replace(/^GOAL! /, "").split(". ");
      setBanner({ kind: "goal", title: `GOAL — ${t.abbr}`, sub: parts[0], color: t.colors[0], n: Date.now() });
      hold = calm ? Math.min(3400, Math.max(2000, ms * 2)) : 500;
    } else if (periodEv) {
      setBanner({ kind: "period", title: periodEv.text, n: Date.now() });
      hold = calm ? 2400 : 300;
    } else if (fresh.some((e) => e.t === "so-goal" || e.t === "so-miss")) {
      hold = calm ? 900 : 0;
    }
    if (hold) setTimeout(() => setBanner((b) => (b && Date.now() - b.n >= hold - 50 ? null : b)), hold);
    force((x) => x + 1);
    return hold;
  };

  useEffect(() => {
    if (paused || s.phase === "final") {
      stepInfo.current = { ...stepInfo.current, paused: true };
      return;
    }
    let timer;
    const run = (delay) => {
      timer = setTimeout(() => {
        const hold = doStep();
        if (s.phase !== "final") run(speedRef.current + hold);
        else force((x) => x + 1);
      }, delay);
    };
    if (!curtain) run(speedRef.current);
    return () => clearTimeout(timer);
  }, [paused, speed, s, curtain]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = () => {
    if (committed) return;
    setCommitted(true);
    if (s.phase !== "final") simToEnd(s);
    if (spec.kind === "regular") {
      const g = league.schedule.find((x) => x.id === spec.gid);
      if (!g.played) { playScheduledGame(league, g, s); finishDay(league); }
    } else {
      const result = applyResult(league, s, { playoff: true });
      recordSeriesGame(league, spec.series, s, result);
      simPlayoffDay(league, { skipSeries: spec.series });
    }
    delete league.activeGame;
    onDone();
  };

  const skipToEnd = () => {
    simToEnd(s);
    setBanner(null);
    force((x) => x + 1);
  };

  const leaders = useMemo(() => {
    const out = { h: [], a: [] };
    for (const k of ["h", "a"]) {
      out[k] = s[k].dressed
        .map((id) => ({ id, b: s.box[id] }))
        .filter((x) => x.b && (x.b.g || x.b.a))
        .sort((x, y) => y.b.g * 2 + y.b.a - (x.b.g * 2 + x.b.a))
        .slice(0, 4);
    }
    return out;
  }, [s, s.events.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const ppSide = (k) => {
    return skaterCount(s, k) > skaterCount(s, k === 'h' ? 'a' : 'h');
  };
  const gsaves = (k) => {
    const gid = s[k === "h" ? "a" : "h"].goalie;
    const b = s.gbox[gid];
    return b ? b.sa - b.ga : 0;
  };
  const feed = [...s.events].reverse().slice(0, 80);
  const lastPlay = feed.find((e) => e.t !== "fo");
  const title = spec.kind === "playoff" ? `${ROUND_NAMES[spec.series.round]} · Game ${spec.series.games.length + 1} (${league.teams[spec.series.top].abbr} ${spec.series.wTop}-${spec.series.wBot} ${league.teams[spec.series.bot].abbr})` : "Regular season";

  return (
    <div className="stack">
      <div className="pagehead">
        <h2>Live Game</h2>
        <span className="pill">{title}</span>
      </div>
      {isFinal && <div className="gg-final-banner"><span>🏆</span><div><b>STANLEY CUP FINAL · GAME {(spec.series?.games?.length || 0) + 1}</b><small>{league.year}-{String(league.year + 1).slice(2)} · the winner takes home the Stanley Cup</small></div><span>🏆</span></div>}
      <div className="scorebug">
        <div className="side away">
          <TeamBadge team={away} size={40} />
          <div>
            <div className="tname" style={{ fontWeight: 800 }}><span className="full">{away.city} {away.name}</span><span className="short">{away.abbr}</span></div>
            <div className="small muted">SOG {s.shots.a} {ppSide("a") && <span className="pp">PP</span>} {s.a.pulled && <span className="pill">EN</span>}</div>
          </div>
          <div className="score" style={{ marginLeft: "auto" }}>{s.score.a}</div>
        </div>
        <div className="clock">
          <div className="t" ref={clockRef}>{s.phase === "final" ? "FINAL" : s.phase === "so" ? "SO" : clockLabel(s.clock)}</div>
          <div className="p">{s.phase === "final" ? s.endedIn || "" : periodLabel(s)}</div>
        </div>
        <div className="side home">
          <div className="score" style={{ marginRight: "auto" }}>{s.score.h}</div>
          <div style={{ textAlign: "right" }}>
            <div className="tname" style={{ fontWeight: 800 }}><span className="full">{home.city} {home.name}</span><span className="short">{home.abbr}</span></div>
            <div className="small muted">{s.h.pulled && <span className="pill">EN</span>} {ppSide("h") && <span className="pp">PP</span>} SOG {s.shots.h}</div>
          </div>
          <TeamBadge team={home} size={40} />
        </div>
      </div>

      <div className="grid livegrid">
        <div className="stack">
          <Rink s={s} home={home} away={away} stepInfo={stepInfo} clockRef={clockRef} banner={banner} final={isFinal} />
          {curtain && <CupFinalSplash home={home} away={away} game={(spec.series?.games?.length || 0) + 1} round={spec.series?.round ?? 3} series={spec.series} userTid={league.userTid} year={league.year} onStart={() => setCurtain(false)} />}
          {lastPlay && (
            <div className={`lastplay ${lastPlay.t}`} key={s.events.length}>
              <span className="when">{lastPlay.phase === "so" ? "SO" : `${lastPlay.period > 3 ? (s.playoff ? `${lastPlay.period - 3}OT` : "OT") : ["1st", "2nd", "3rd"][lastPlay.period - 1]} ${clockLabel(lastPlay.clock)}`}</span>
              <span>{lastPlay.text}</span>
            </div>
          )}
          <div className="panel">
            <div className="row" style={{ gap: 6 }}>
              {s.phase !== "final" ? (
                <>
                  <button onClick={() => setPaused((p) => !p)}>{paused ? "▶ Resume" : "⏸ Pause"}</button>
                  <button onClick={() => { doStep(); stepInfo.current.paused = true; }} disabled={!paused}>Step</button>
                  {SPEEDS.map(([l, ms]) => (
                    <button key={l} className={speed === ms ? "primary small" : "small"} onClick={() => setSpeed(ms)}>{l}</button>
                  ))}
                  <div style={{ flex: 1 }} />
                  <button onClick={skipToEnd}>Sim to End ⏭</button>
                </>
              ) : (
                <>
                  <b>Final{s.endedIn ? ` (${s.endedIn})` : ""}: {away.abbr} {s.score.a} – {home.abbr} {s.score.h}</b>
                  <div style={{ flex: 1 }} />
                  <button className="primary" onClick={finish} disabled={committed}>Continue →</button>
                </>
              )}
            </div>
            {mySide && s.phase !== "final" && (
              <div className="row" style={{ marginTop: 10, gap: 6 }}>
                <span className="muted small">Tactics:</span>
                {[["attack", "Attack"], ["balanced", "Balanced"], ["defend", "Defend"]].map(([k, l]) => (
                  <button key={k} className={mySide.tactic === k ? "primary small" : "small"} onClick={() => { mySide.tactic = k; force((x) => x + 1); }}>{l}</button>
                ))}
                <button className={mySide.ride ? "primary small" : "small"} onClick={() => { mySide.ride = !mySide.ride; force((x) => x + 1); }} title="Give your top lines more ice time">Ride top lines</button>
                <button className="small" disabled={mySide.timeout || !s.faceoffNext || s.phase === 'so' || s.stoppage?.icing === s.userSide} onClick={() => { takeTimeout(s, s.userSide); force((x) => x + 1); }} title="Rest your players at a stoppage. One per game; unavailable after your own icing.">Timeout{mySide.timeout ? " (used)" : ""}</button>
                <button
                  className={mySide.pulled ? "danger small" : "small"}
                  disabled={s.phase === "so" || s.delayedPenalty && s.delayedPenalty.k !== s.userSide}
                  title={s.phase === 'ot' && !s.playoff ? 'An empty-net overtime loss forfeits the overtime standings point.' : 'Replace your goalie with an extra skater.'}
                  onClick={() => { mySide.autoPull = false; mySide.pulled = !mySide.pulled; force((x) => x + 1); }}
                >
                  {mySide.pulled ? "Put goalie back" : "Pull goalie"}
                </button>
                <label className="row small"><input type="checkbox" checked={mySide.autoPull} onChange={(e) => { mySide.autoPull = e.target.checked; force((x) => x + 1); }} /> auto-pull</label>
              </div>
            )}
          </div>
          <div className="grid g2">
            {["a", "h"].map((k) => (
              <div className="panel" key={k}>
                <h3>{(k === "h" ? home : away).abbr} game leaders <span className="right muted small">{gsaves(k === "h" ? "a" : "h")} saves</span></h3>
                <div className="list">
                  {leaders[k].map(({ id, b }) => (
                    <div className="item small" key={id}>
                      <PlayerName p={league.players[id]} />
                      <span className="muted" style={{ marginLeft: "auto" }}>{b.g}G {b.a}A · {b.sog} SOG</span>
                    </div>
                  ))}
                  {!leaders[k].length && <div className="dim small">No points yet.</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <h3>Play-by-play</h3>
          <div className="feed">
            {feed.map((e, i) => (
              <div key={s.events.length - i} className={`ev ${e.t}`}>
                <span className="when">{e.phase === "so" ? "SO" : `${e.period > 3 ? (s.playoff ? `${e.period - 3}OT` : "OT") : ["1st", "2nd", "3rd"][e.period - 1]} ${clockLabel(e.clock)}`}</span>
                {e.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
