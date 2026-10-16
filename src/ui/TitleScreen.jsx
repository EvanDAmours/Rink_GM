import React, { useEffect, useMemo, useState } from "react";
import { TEAMS } from "../engine/teams.js";
import { TeamBadge } from "./common.jsx";
import { createLeague, loadLeague, deleteSave, rosterFile, deserializeLeague, restoreLeague, saveLeague } from "../engine/league.js";
import { DIFFICULTY } from "../engine/constants.js";
import { cloudMeta, cloudLoad } from "../platform.js";

import {verifiedDataSummary,verifiedRating} from "../engine/verifiedData.js";
import {setInjuriesEnabled} from "../engine/injuries.js";
import Icon from "./Icon.jsx";
import StanleyCup3D from "./StanleyCup3D.jsx";
import { HockeyTrophy } from "./TrophyRoom.jsx";

const SEASON = (y) => `${y}-${String(y + 1).slice(2)}`;
const when = (t) => (t ? new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

function teamStrength(abbr) {
  const ps = (rosterFile.teams[abbr] || []).map((p) => verifiedRating(p)?.ovr ?? p.ovr).sort((a, b) => b - a);
  const top = ps.slice(0, 18);
  const g = (rosterFile.teams[abbr] || []).filter((p) => p.pos === "G").map((p) => verifiedRating(p)?.ovr ?? p.ovr).sort((a, b) => b - a)[0] || 75;
  return Math.round((top.reduce((a, b) => a + b, 0) / Math.max(1, top.length)) * 0.8 + g * 0.2);
}

export default function TitleScreen({ onStart, ask }) {
  const [local] = useState(() => loadLeague());
  const [cloud, setCloud] = useState(null);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [step, setStep] = useState(local ? "menu" : "new");
  useEffect(() => {
    let live = true;
    cloudMeta().then((m) => {
      if (!live || !m) return;
      setCloud(m);
      setStep((s) => (s === "new" && !local ? "menu" : s));
    });
    return () => { live = false; };
  }, [local]);
  const [abbr, setAbbr] = useState("EDM");
  const [conference,setConference]=useState("all");
  const [mode, setMode] = useState("real");
  const [difficulty, setDifficulty] = useState("normal");
  const [injuries, setInjuries] = useState(local?.settings.injuries !== false);
  const [savedInjuries,setSavedInjuries]=useState(local?.settings.injuries !== false);
  const [injuryPreferenceChanged,setInjuryPreferenceChanged]=useState(false);
  const [err, setErr] = useState(null);
  const strengths = useMemo(() => Object.fromEntries(TEAMS.map((t) => [t.abbr, teamStrength(t.abbr)])), []);
  const ranked = useMemo(() => [...TEAMS].sort((a, b) => strengths[b.abbr] - strengths[a.abbr]).map((t) => t.abbr), [strengths]);
  const eaCount = useMemo(() => Object.values(rosterFile.teams).flat().filter((p) => p.src === "ea27").length, []);
  const total = useMemo(() => Object.values(rosterFile.teams).flat().length, []);

  const cont = () => {
    if (!local) {
      setErr("Couldn't read the saved league. It may be from an older version.");
      return;
    }
    onStart(local);
  };
  const contCloud = async () => {
    setLoadingCloud(true);
    const lg = restoreLeague(await cloudLoad().catch(() => null));
    setLoadingCloud(false);
    if (!lg) return setErr("Couldn't load the cloud backup. Try again in a moment.");
    if(injuryPreferenceChanged)setInjuriesEnabled(lg,savedInjuries);
    onStart(lg);
  };
  const cloudNewer = cloud && (!local || (cloud.savedAt || 0) > (local.savedAt || 0) + 5000);

  const importFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    f.text().then((txt) => {
      try {
        const lg = deserializeLeague(txt.trim());
        if (!lg) throw new Error("bad file");
        onStart(lg);
      } catch {
        setErr("That file isn't a Rink GM league export.");
      }
    });
  };

  const start = async () => {
    if ((local || cloud) && !(await ask({ title: "Start a new league?", body: "Your current saved league will be replaced. Export it from Settings first if you want to keep it.", yes: "Start new league", danger: true }))) return;
    deleteSave();
    const lg = createLeague({ userAbbr: abbr, mode, difficulty, injuries });
    onStart(lg);
  };

  const sel = TEAMS.find((t) => t.abbr === abbr);

  return (
    <div className="title">
      <div className="titlecard stack" style={{"--selected-team":sel.colors[0]}}>
        <header className="title-brandbar"><div className="logo">RINK <span>GM</span><small>THE FRANCHISE EXPERIENCE</small></div><span className="edition">{rosterFile.season} EDITION</span>{step==="new" && (local || cloud) && <button onClick={()=>setStep("menu")}>Back to saved league</button>}</header>
        <section className="title-hero"><div><span className="eyebrow">YOUR CLUB. YOUR CALL.</span><h1>Build a contender.<br/><em>Leave a legacy.</em></h1><p>From opening night to the final buzzer. Own every decision on the road to the Stanley Cup.</p><div className="title-featureline"><span>32 NHL CLUBS</span><i/><span>DEEP FRANCHISE SIMULATION</span><i/><span>LIVE HOCKEY</span></div></div><div className="title-trophy"><StanleyCup3D size={195} showControls={false}><HockeyTrophy size={115}/></StanleyCup3D></div></section>

        {err && <div className="notice bad">{err}</div>}

        {step === "menu" && (
          <div className="panel stack" style={{ maxWidth: 520 }}>
            {local && (
              <button className={cloudNewer ? "" : "primary"} style={{ padding: 14, fontSize: 15 }} onClick={cont}>
                Continue League <span className="small" style={{ opacity: 0.8, fontWeight: 500 }}>· {local.teams[local.userTid].abbr} {SEASON(local.year)}</span>
              </button>
            )}
            {cloud && (cloudNewer || !local) && (
              <button className="primary" style={{ padding: 14, fontSize: 15 }} onClick={contCloud} disabled={loadingCloud}>
                {loadingCloud ? "Loading cloud backup…" : <>Continue from cloud backup <span className="small" style={{ opacity: 0.85, fontWeight: 500 }}>· {cloud.team} {SEASON(cloud.year)} · saved {when(cloud.savedAt)}</span></>}
              </button>
            )}
            <label className="row"><input type="checkbox" checked={savedInjuries} onChange={e=>{const enabled=e.target.checked;setSavedInjuries(enabled);setInjuries(enabled);setInjuryPreferenceChanged(true);if(local){setInjuriesEnabled(local,enabled);saveLeague(local);}}}/> Injuries enabled</label><p className="muted small">Turning this off restores all players in your saved franchise to full health.</p>
            <button onClick={() => setStep("new")}>New League</button>
            <label className="row" style={{ cursor: "pointer" }}>
              <span className="pill">Import league file…</span>
              <input type="file" accept=".rinkgm,.json,.txt" onChange={importFile} style={{ display: "none" }} />
            </label>
          </div>
        )}

        {step === "new" && (
          <>
            <div className="panel">
              <div className="section-heading"><div><span className="eyebrow">01 / CHOOSE YOUR FRANCHISE</span><h2>A league of possibilities.</h2></div><div className="tabs"><button className={conference==="all"?"on":""} onClick={()=>setConference("all")}>All clubs</button><button className={conference==="East"?"on":""} onClick={()=>setConference("East")}>East</button><button className={conference==="West"?"on":""} onClick={()=>setConference("West")}>West</button></div></div>
              <div className="selected-franchise-bar"><TeamBadge team={sel} size={42}/><span><small>YOUR FRANCHISE</small><b>{sel.city} {sel.name}</b></span><button className="primary" onClick={start}>Create {sel.abbr} franchise <Icon name="arrow" size={15}/></button></div>
              <div className="teamgrid">
                {ranked.filter(ab=>conference==="all" || TEAMS.find(t=>t.abbr===ab).conf===conference).map((ab) => {
                  const t = TEAMS.find((x) => x.abbr === ab);
                  return (
                    <button key={ab} aria-pressed={abbr===ab} className={`teamcard ${abbr === ab ? "sel" : ""}`} style={{ "--c1": t.colors[0], "--c2": t.colors[1] }} onClick={() => setAbbr(ab)}>
                      <TeamBadge team={t} size={58} />
                      <div>
                        <div className="tn">{t.city} {t.name}</div>
                        <div className="tr">{t.div}</div>
                      </div>
                      <span className="team-strength">{strengths[ab]}<small>OVR</small></span>{abbr===ab && <span className="team-selected"><Icon name="check" size={12}/></span>}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid g3">
              <div className="panel">
                <h3>02 / Your league</h3>
                <div className="stack" style={{ gap: 8 }}>
                  <label className="row"><input type="radio" checked={mode === "real"} onChange={() => setMode("real")} /> NHL 27 rosters (real players)</label>
                  <label className="row"><input type="radio" checked={mode === "random"} onChange={() => setMode("random")} /> Random fictional players</label>
                  <div className="small muted">
                    {total} real players · {verifiedDataSummary.ratings} detailed EA ratings profiles. Published attributes and verified jersey numbers are used where available; other ratings remain estimates.
                  </div>
                </div>
              </div>
              <div className="panel">
                <h3>03 / The challenge</h3>
                <div className="stack" style={{ gap: 8 }}>
                  {Object.entries(DIFFICULTY).map(([k, d]) => (
                    <label key={k} className="row"><input type="radio" checked={difficulty === k} onChange={() => setDifficulty(k)} /> {d.label}</label>
                  ))}
                  <label className="row"><input type="checkbox" checked={injuries} onChange={e=>setInjuries(e.target.checked)}/> Injuries enabled</label><div className="small muted">Harder settings make AI GMs tougher in trades and free agents pricier.</div>
                </div>
              </div>
              <div className="panel stack">
                <h3>04 / Your next chapter</h3>
                <div className="row">
                  <TeamBadge team={sel} size={70} />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>{sel.city} {sel.name}</div>
                    <div className="muted small">{sel.conf}ern Conference · {sel.div}</div>
                  </div>
                </div>
                <button className="primary" style={{ padding: 12, fontSize: 15 }} onClick={start}>Start {rosterFile.season} Season</button>
              </div>
            </div>
            <div className="small dim">
              Fan-made game, not affiliated with or endorsed by the NHL, NHLPA or Electronic Arts. NHL and team logos belong to their respective owners.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
