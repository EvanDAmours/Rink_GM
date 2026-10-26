import CupFinalSplash from "./CupFinalSplash.jsx";
import Rink, { RINK_ASPECT } from "./LiveRink.jsx";
import { arenaLabel } from "../data/arenas.js";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useGame, TeamBadge } from "./common.jsx";
import { takeTimeout, serializeGame, restoreGame, createGame, stepGame, simToEnd, applyResult, periodLabel, clockLabel,
  situationLine, manpowerState, ppTimeLeft, liveCallouts, eventCallout, momentumOf, winProbSeries, unitsLine } from "../engine/sim.js";
import { winProbability } from "../engine/matchup.js";
import { playScheduledGame, finishDay } from "../engine/league.js";
import { recordSeriesGame, simPlayoffDay, ROUND_NAMES } from "../engine/playoffs.js";
import { WinProbChart, ShotMap, LiveBox, vivid } from "./LiveCharts.jsx";
import "./live.css";

// Fast is a step every 0.6 s (it was 0.45 s), so the skaters finish moving before the next play.
const SPEEDS = [["Slow", 2000], ["Normal", 1200], ["Fast", 600], ["Turbo", 70]];
const SPEED_KEY = "rinkgm_live_speed";
// TV view or the full desk, remembered on this device.
const TV_KEY = "rinkgm_live_tv";
// Callout colours: the play decides, as on a broadcast.
const CALL_COLOR = { goal: "#facc15", hat: "#facc15", pen: "#f97316", pp: "#38bdf8", killed: "#22c55e", fight: "#ef4444", pull: "#c084fc", goalie: "#94a3b8", timeout: "#94a3b8", "so-goal": "#facc15", "so-miss": "#f97316", period: "#e2e8f0", final: "#22c55e" };

const readPref = (key, fallback) => { try { const v = localStorage.getItem(key); return v == null ? fallback : v; } catch { return fallback; } };
const writePref = (key, v) => { try { localStorage.setItem(key, String(v)); } catch { /* private mode */ } };

// Phone layout (the live game stacks and the controls dock at the bottom).
function usePhone() {
  const q = "(max-width: 640px)";
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return undefined;
    const on = () => setPhone(m.matches);
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, []);
  return phone;
}

const whenOf = (e, playoff) => (e.phase === "so" ? "SO" : `${e.period > 3 ? (playoff ? `${e.period - 3}OT` : "OT") : ["1st", "2nd", "3rd"][e.period - 1]} ${clockLabel(e.clock)}`);

// The big banner over the rink for goals, penalties, power plays and the rest. It never takes
// clicks, so the controls stay usable underneath and beside it.
function RinkCallout({ c, home, away }) {
  const team = c?.side === "h" ? home : c?.side === "a" ? away : null;
  return (
    <div className="lv-callwrap" aria-live="polite" aria-atomic="true">
      {c && (
        <div className={`lv-callout k-${c.kind}`} key={c.n} style={{ "--cc": CALL_COLOR[c.kind] || "#e2e8f0", "--tc": team ? vivid(team) : CALL_COLOR[c.kind] || "#e2e8f0" }}>
          <div className="lv-co-top">
            {team && <TeamBadge team={team} size={34} decorative />}
            <b className="lv-co-t">{c.title}</b>
            {c.tag && <span className="lv-co-tag" title={c.tagText || c.tag}>{c.tag}</span>}
          </div>
          {c.sub && <div className="lv-co-s">{c.sub}</div>}
        </div>
      )}
    </div>
  );
}

// TV view: the last play as a lower third under the rink.
function TvCaption({ e, s, home, away }) {
  const k = e.att || e.side;
  const team = k === "h" ? home : k === "a" ? away : null;
  const c = eventCallout(e, s);
  const color = c ? CALL_COLOR[c.kind] : team ? vivid(team) : "#3b82f6";
  const units = unitsLine(e, s);
  const head = c ? `${c.title.replace(/!$/, "")}${c.tagText ? ` · ${c.tagText}` : ""}` : `${whenOf(e, s.playoff)}${units ? ` · ${units}` : ""}`;
  return (
    <div className={`lv-cap${c ? " big" : ""}`} key={`${s.events.length}`} style={{ "--cc": color, "--tc": team?.colors?.[0] || "#1e293b" }}>
      <i className="lv-cap-bar" />
      {team && <span className="lv-cap-logo"><TeamBadge team={team} size={34} decorative /></span>}
      <div className="lv-cap-body">
        <div className="lv-cap-h">{head}</div>
        <div className="lv-cap-t">{e.text}</div>
      </div>
    </div>
  );
}

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
  const [tick, rerender] = useState(0);
  const persist = () => { league.activeGame={version:1,spec:structuredClone(spec),state:serializeGame(s)}; commit(); };
  const force = fn => { persist(); rerender(fn); };
  useEffect(() => { persist(); }, []); // initial puck-drop checkpoint
  const [speed, setSpeedState] = useState(() => {
    const v = Number(readPref(SPEED_KEY, 1200));
    if (v === 450) return 600; // a saved Fast from before
    return SPEEDS.some(([, ms]) => ms === v) ? v : 1200;
  });
  const setSpeed = (ms) => { setSpeedState(ms); writePref(SPEED_KEY, ms); };
  const [tv, setTv] = useState(() => readPref(TV_KEY, "0") === "1");
  const phone = usePhone();
  const tvOn = tv && !phone;
  const [paused, setPaused] = useState(!!league.activeGame);
  const isFinal = spec.kind === 'playoff' && spec.series?.round === 3;
  // Every playoff game you play live opens with a walkout (the Final's has the Cup).
  const [curtain, setCurtain] = useState(spec.kind === 'playoff' && !league.activeGame?.state?.elapsed);
  const [committed, setCommitted] = useState(false);
  const stepInfo = useRef({ at: performance.now(), dur: 1200, shot: null, periodEnd: false, paused: true });
  const clockRef = useRef(null);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const seenRef = useRef(null);
  if (!seenRef.current) seenRef.current = manpowerState(s);
  const me = s.userSide;
  const mySide = me ? s[me] : null;

  // Callouts play one after another; each holds for its moment, then the next.
  const [callout, setCallout] = useState(null);
  const callQ = useRef([]);
  const callT = useRef(null);
  const callN = useRef(0);
  const nextCall = () => {
    const c = callQ.current.shift();
    if (!c) { callT.current = null; setCallout(null); return; }
    callN.current += 1;
    setCallout({ ...c, n: callN.current });
    callT.current = setTimeout(nextCall, c.hold);
  };
  const queueCalls = (list) => {
    const add = list.filter(Boolean);
    if (!add.length) return;
    callQ.current.push(...add);
    // At high speed, keep the big ones and the newest instead of a backlog.
    if (callQ.current.length > 4) callQ.current = callQ.current.filter((c, i, all) => c.block || i >= all.length - 2);
    if (!callT.current) nextCall();
  };
  const clearCalls = () => { clearTimeout(callT.current); callT.current = null; callQ.current = []; setCallout(null); };
  useEffect(() => () => clearTimeout(callT.current), []);
  const holdScale = (ms) => (ms >= 2000 ? 1.2 : ms >= 1200 ? 1 : ms >= 400 ? 0.75 : 0.4);

  // One 10-second step of the game; returns how long to hold before the next one
  // (a moment to take in a goal, a penalty or the end of a period).
  const doStep = () => {
    const before = s.events.length;
    const was = seenRef.current;
    stepGame(s);
    const fresh = s.events.slice(before);
    const now = manpowerState(s);
    seenRef.current = now;
    const ms = speedRef.current;
    const shotEv = [...fresh].reverse().find((e) => ["goal", "save", "so-goal", "so-miss"].includes(e.t));
    const periodEv = fresh.find((e) => e.t === "period" || e.t === "final");
    stepInfo.current = { at: performance.now(), dur: ms, shot: shotEv ? { x: shotEv.x, y: shotEv.y } : null, periodEnd: !!periodEv && s.phase !== "so", paused: false };
    const scale = holdScale(ms);
    const calls = liveCallouts(fresh, was, now, s).map((c) => ({ ...c, hold: Math.round(c.hold * scale) }));
    queueCalls(calls);
    const calm = ms >= 400;
    const blocking = calls.filter((c) => c.block).reduce((t, c) => t + c.hold, 0);
    const hold = calm ? Math.min(4800, blocking) : calls.some((c) => c.kind === "goal") ? 500 : 0;
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
    seenRef.current = manpowerState(s);
    clearCalls();
    queueCalls([eventCallout({ t: "final" }, s)]);
    force((x) => x + 1);
  };
  const toggleTv = () => setTv((v) => { writePref(TV_KEY, v ? "0" : "1"); return !v; });
  const cycleSpeed = () => { const i = SPEEDS.findIndex(([, ms]) => ms === speed); setSpeed(SPEEDS[(i + 1) % SPEEDS.length][1]); };
  const speedName = (SPEEDS.find(([, ms]) => ms === speed) || SPEEDS[1])[0];

  // The home side's chance before puck drop, from the clubs' strength (offence, defence, goaltending).
  const pre = useMemo(() => { try { return winProbability(league, home, away, { home: true }); } catch { return 0.54; } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const series = useMemo(() => winProbSeries(s, pre), [s, pre, tick]);
  const sit = situationLine(s);
  const momSide = me || "h";
  const mom = momentumOf(s, momSide);
  const momColor = mom.value >= 65 ? "#22c55e" : mom.value <= 35 ? "#ef4444" : "#f59e0b";
  const done = s.phase === "final";
  const mp = manpowerState(s);
  const sitTeam = sit.side === "h" ? home : sit.side === "a" ? away : null;

  // The scorebug's yellow line: the strength, or the shootout round.
  const bugTag = done ? (s.endedIn || "") : s.phase === "so" ? sit.parts[0]?.replace(/^r/, "R") || "" : mp.pp ? `${s[mp.pp].abbr} PP ${clockLabel(ppTimeLeft(s, mp.pp))}` : mp.pulled.h || mp.pulled.a ? `${s[mp.pulled.h ? "h" : "a"].abbr} ${mp.n[mp.pulled.h ? "h" : "a"] + 1}-on-${mp.n[mp.pulled.h ? "a" : "h"]}` : `${mp.n.h}-on-${mp.n.a}`;
  const clockText = done ? "FINAL" : s.phase === "so" ? "SO" : clockLabel(s.clock);
  const perText = done || s.phase === "so" ? "" : periodLabel(s);

  // Play-by-play, oldest first, kept scrolled to the newest play unless you scroll up to read.
  const feedRef = useRef(null);
  const stick = useRef(true);
  useEffect(() => { const el = feedRef.current; if (el && stick.current && el.scrollHeight - el.scrollTop - el.clientHeight > 1) el.scrollTop = el.scrollHeight; });
  // Only a scroll you make lets go of the newest play; the game moving the list never does.
  const touched = useRef(0);
  const touchFeed = () => { touched.current = performance.now(); };
  const readFeed = (e) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) stick.current = true;
    else if (performance.now() - touched.current < 1200) stick.current = false;
  };
  const feed = s.events.slice(-150);
  const lastPlay = [...s.events].reverse().find((e) => e.t !== "fo");
  const title = spec.kind === "playoff" ? `${ROUND_NAMES[spec.series.round]} · Game ${spec.series.games.length + 1} (${league.teams[spec.series.top].abbr} ${spec.series.wTop}-${spec.series.wBot} ${league.teams[spec.series.bot].abbr})` : "Regular season";

  const bugSide = (k) => {
    const t = k === "h" ? home : away;
    return (
      <div className={`lv-bside ${k === "h" ? "home" : "away"}`} style={{ "--tc": t.colors?.[0] || "#1e293b" }}>
        <TeamBadge team={t} size={28} decorative />
        <b className="ab" title={`${t.city} ${t.name}`}>{t.abbr}</b>
        {!done && mp.pp === k && <span className="lv-pill pp" title="Power play">PP</span>}
        {!done && mp.pulled[k] && <span className="lv-pill en" title="Goalie pulled for an extra attacker">EN</span>}
        <span className="sog" title="Shots on goal">SOG {s.shots[k]}</span>
        <span className="sc">{s.score[k]}</span>
      </div>
    );
  };

  const bench = mySide && !done && (
    <div className="lv-bench" role="group" aria-label="Bench controls">
      <span className="lv-lbl">Tactics</span>
      <span className="lv-seg">
        {[["attack", "Attack"], ["balanced", "Balanced"], ["defend", "Defend"]].map(([k, l]) => (
          <button key={k} className={mySide.tactic === k ? "on" : ""} aria-pressed={mySide.tactic === k} onClick={() => { mySide.tactic = k; force((x) => x + 1); }}>{l}</button>
        ))}
      </span>
      <button className={mySide.ride ? "on" : ""} aria-pressed={!!mySide.ride} onClick={() => { mySide.ride = !mySide.ride; force((x) => x + 1); }} title="Give your top lines more ice time">Ride top lines</button>
      <button disabled={mySide.timeout || !s.faceoffNext || s.phase === 'so' || s.stoppage?.icing === s.userSide} onClick={() => { if (takeTimeout(s, s.userSide)) queueCalls([eventCallout({ t: "timeout", side: s.userSide }, s)]); force((x) => x + 1); }} title="Rest your players at a stoppage. One per game; unavailable after your own icing.">Timeout{mySide.timeout ? " (used)" : ""}</button>
      <button
        className={mySide.pulled ? "danger" : ""}
        disabled={s.phase === "so" || s.delayedPenalty && s.delayedPenalty.k !== s.userSide}
        title={s.phase === 'ot' && !s.playoff ? 'An empty-net overtime loss forfeits the overtime standings point.' : 'Replace your goalie with an extra skater.'}
        onClick={() => {
          mySide.autoPull = false; mySide.pulled = !mySide.pulled;
          const was = seenRef.current;
          seenRef.current = manpowerState(s);
          if (mySide.pulled && !was?.pulled?.[me]) queueCalls(liveCallouts([], was, seenRef.current, s).filter((c) => c.kind === "pull"));
          force((x) => x + 1);
        }}
      >
        {mySide.pulled ? "Put goalie back" : "Pull goalie"}
      </button>
      <label className="lv-auto"><input type="checkbox" checked={mySide.autoPull} onChange={(e) => { mySide.autoPull = e.target.checked; force((x) => x + 1); }} /> auto-pull</label>
    </div>
  );

  const units = lastPlay ? unitsLine(lastPlay, s) : null;
  // A neutral-site regular-season game names its building on the boards.
  const venue = spec.kind === "regular" ? league.schedule.find((g) => g.id === spec.gid)?.venue || undefined : undefined;
  return (
    <div className={`lv-game ${tvOn ? "tv" : "desk"}${done ? " done" : ""}`} style={{ "--rink-aspect": RINK_ASPECT }}>
      <div className="lv-top">
        <h2>Live Game</h2>
        <span className="pill">{title}</span>
      </div>
      {isFinal && <div className="gg-final-banner"><span>🏆</span><div><b>STANLEY CUP FINAL · GAME {(spec.series?.games?.length || 0) + 1}</b><small>{arenaLabel(home)} · {league.year}-{String(league.year + 1).slice(2)} · the winner takes home the Stanley Cup</small></div><span>🏆</span></div>}
      <div className="lv-headrow">
        <div className="lv-bug" aria-label={`${away.abbr} ${s.score.a}, ${home.abbr} ${s.score.h}`}>
          {bugSide("a")}
          <div className="lv-bclock clock">
            <b>{perText && <span className="per">{perText} </span>}<span className="t" ref={clockRef}>{clockText}</span></b>
            {bugTag && <span className="p">{bugTag}</span>}
          </div>
          {bugSide("h")}
        </div>
        <div className="lv-ctrls">
          {!done ? (
            <>
              <button className={`lv-tvbtn${tv ? " on" : ""}`} onClick={toggleTv} title="Switch between the TV view (big rink, each play captioned under it) and the full desk (play-by-play and box score beside the rink)">{tv ? "📺 TV view" : "📊 Full desk"}</button>
              <button className="lv-speed" onClick={cycleSpeed} title="Time between steps of the game: Slow, Normal, Fast or Turbo">⏱ {speedName}</button>
              <button className="lv-step" onClick={() => { doStep(); stepInfo.current.paused = true; }} disabled={!paused} title="Play the next ten seconds">Step</button>
              <button className={`lv-play ${paused ? "go" : "stop"}`} onClick={() => setPaused((p) => !p)}>{paused ? "▶ Resume" : "⏸ Pause"}</button>
              <button className="lv-sim" onClick={skipToEnd} title="Play out the rest of the game instantly">Sim to End ⏭</button>
            </>
          ) : (
            <button className="primary lv-continue" onClick={finish} disabled={committed}>Continue →</button>
          )}
        </div>
      </div>
      {!done && (
        <div className="lv-sit">
          <span className="lv-sit-main">
            {sitTeam && <TeamBadge team={sitTeam} size={20} decorative />}
            <b>{sit.lead}</b>{sit.parts.map((p, i) => <span key={i}> · {p}</span>)}
          </span>
          {sit.puck && <span className="lv-sit-puck">{sit.puck}</span>}
          <span className="lv-mom" title="How the club is rolling: its share of the last five minutes of shot attempts, with goals and shots on goal counting more">
            {s[momSide].abbr} momentum
            <span className="lv-mom-bar"><i style={{ width: `${mom.value}%`, background: momColor }} /></span>
            <b style={{ color: momColor }}>{mom.label === "Hot" ? "🔥 Hot" : mom.label === "Cold" ? "🧊 Cold" : "Even"}</b>
          </span>
        </div>
      )}

      {curtain && <CupFinalSplash home={home} away={away} game={(spec.series?.games?.length || 0) + 1} round={spec.series?.round ?? 3} series={spec.series} userTid={league.userTid} year={league.year} onStart={() => setCurtain(false)} />}
      <div className="lv-grid">
        <div className="lv-stage">
          <div className="lv-rinkbox">
            <div className="lv-mini" aria-hidden="true">
              <span>{away.abbr} <b>{s.score.a}</b></span><span className="dash">–</span><span><b>{s.score.h}</b> {home.abbr}</span>
              <span className="lv-mini-r">{done ? `FINAL${s.endedIn ? ` (${s.endedIn})` : ""}` : `${perText || "SO"} · ${bugTag}`}</span>
            </div>
            <div className="lv-rinkpos">
              {/* The rink lights the goal lamp while a GOAL callout is up; the callout itself is drawn here, over the rink. */}
              <Rink s={s} home={home} away={away} stepInfo={stepInfo} clockRef={clockRef} final={isFinal} variant={tvOn ? "tv" : undefined} arena={venue}
                banner={callout?.kind === "goal" ? { kind: "goal", title: callout.title, n: callout.n } : null} />
              <RinkCallout c={callout} home={home} away={away} />
            </div>
          </div>
          {tvOn && lastPlay && <TvCaption e={lastPlay} s={s} home={home} away={away} />}
        </div>

        <div className="lv-pbpcell">
          <div className="lv-pbp">
            {!tvOn && lastPlay && (
              <div className={`lv-last t-${lastPlay.t}${lastPlay.chance ? " chance" : ""}`} key={s.events.length}>
                <div className="lv-last-h">
                  LAST PLAY · {whenOf(lastPlay, s.playoff)}
                  {units && <span className="lv-units" title="The units on the ice for this play, and the strength">{units}</span>}
                </div>
                {lastPlay.text}
              </div>
            )}
            <div className="lv-pbp-h">PLAY-BY-PLAY</div>
            <div className="lv-feed" ref={feedRef} tabIndex={0} aria-label="Play-by-play" onWheel={touchFeed} onTouchStart={touchFeed} onTouchMove={touchFeed} onKeyDown={touchFeed} onPointerDown={touchFeed} onScroll={readFeed}>
              {feed.map((e, i) => (
                <div key={s.events.length - feed.length + i} className={`lv-ev t-${e.t}${e.chance ? " chance" : ""}${me && (e.att || e.side) === me ? " mine" : ""}`}>
                  <span className="when">{whenOf(e, s.playoff)}</span>
                  {e.text}
                </div>
              ))}
            </div>
            {bench}
          </div>
        </div>

        <div className="lv-charts">
          {!phone && <WinProbChart series={series} home={home} away={away} live={!done} />}
          <ShotMap log={s.shotLog} home={home} away={away} s={s} />
        </div>

        {(!tvOn || done) && (
          <div className="lv-boxcell">
            <LiveBox s={s} home={home} away={away} league={league} />
          </div>
        )}
      </div>
    </div>
  );
}
