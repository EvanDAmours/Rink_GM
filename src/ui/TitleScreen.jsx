// The main menu and the team picker, laid out like the football game's (Gridiron 1.94): a dark
// radial background, the Stanley Cup in the corner, a RINK kicker over a silver GM, big Continue,
// New Game and Import buttons, the new-game options as pills, and the D'Amours Unlimited byline.
// New Game opens "Choose Your Team": team-colour tiles with the logo, city, name and division;
// tapping one starts the franchise. Saves are repaired as they load (loadRepaired), and the cloud
// backup and file import work as before.
import React, { useEffect, useMemo, useState } from "react";
import { TEAMS } from "../engine/teams.js";
import { TeamBadge } from "./common.jsx";
import { createLeague, deleteSave, rosterFile, restoreLeague, saveLeague } from "../engine/league.js";
import { DIFFICULTY, SAVE_KEY } from "../engine/constants.js";
import { loadRepaired, loadRepairedKey, repairLeague } from "../engine/repair.js";
import { cloudMeta, cloudLoad } from "../platform.js";
import { verifiedDataSummary, verifiedRating } from "../engine/verifiedData.js";
import { setInjuriesEnabled } from "../engine/injuries.js";
import { applyNewGameOptions } from "../engine/newGameOptions.js";
import { Trophy } from "./TrophyRoom.jsx";
import "./title.css";

const SEASON = (y) => `${y}-${String(y + 1).slice(2)}`;
const when = (t) => (t ? new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
// Remembered menu choices (per browser), like the football game's: firing, draft classes, difficulty.
const pref = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };

function teamStrength(abbr) {
  const ps = (rosterFile.teams[abbr] || []).map((p) => verifiedRating(p)?.ovr ?? p.ovr).sort((a, b) => b - a);
  const top = ps.slice(0, 18);
  const g = (rosterFile.teams[abbr] || []).filter((p) => p.pos === "G").map((p) => verifiedRating(p)?.ovr ?? p.ovr).sort((a, b) => b - a)[0] || 75;
  return Math.round((top.reduce((a, b) => a + b, 0) / Math.max(1, top.length)) * 0.8 + g * 0.2);
}
// A tile in the club's colour; a light primary (Boston's gold) gives way to the darker one.
const lum = (hex) => { const h = String(hex || "").replace("#", ""); if (h.length < 6) return 0; const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const tileColour = (t) => (lum(t.colors[0]) > 0.55 && t.colors[1] && lum(t.colors[1]) < lum(t.colors[0]) ? t.colors[1] : t.colors[0]);

export default function TitleScreen({ onStart, ask }) {
  // Saves are repaired as they load, so one broken record doesn't lock you out of your league.
  const [boot] = useState(() => loadRepairedKey(SAVE_KEY));
  const local = boot.league;
  const [cloud, setCloud] = useState(null);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [step, setStep] = useState("menu");
  useEffect(() => {
    let live = true;
    cloudMeta().then((m) => { if (live && m) setCloud(m); });
    return () => { live = false; };
  }, []);
  const [mode, setMode] = useState("real");
  const [difficulty, setDifficulty] = useState(() => (DIFFICULTY[pref("rinkgm_difficulty", "normal")] ? pref("rinkgm_difficulty", "normal") : "normal"));
  const [firing, setFiring] = useState(() => pref("rinkgm_firing", "0") === "1");
  const [realDraft, setRealDraft] = useState(() => pref("rinkgm_realdraft", "1") !== "0");
  const [injuries, setInjuries] = useState(local?.settings.injuries !== false);
  const [injuryPreferenceChanged, setInjuryPreferenceChanged] = useState(false);
  const [err, setErr] = useState(null);
  const strengths = useMemo(() => Object.fromEntries(TEAMS.map((t) => [t.abbr, teamStrength(t.abbr)])), []);
  const total = useMemo(() => Object.values(rosterFile.teams).flat().length, []);

  const cont = () => {
    if (!local) return setErr("Couldn't read the saved league. It may be from an older version.");
    onStart(local, boot.fixes);
  };
  const contCloud = async () => {
    setLoadingCloud(true);
    const raw = await cloudLoad().catch(() => null);
    let fixes = [], lg = null;
    try { if (raw?.game === "rink-gm") fixes = repairLeague(raw); lg = restoreLeague(raw); } catch { lg = null; }
    setLoadingCloud(false);
    if (!lg) return setErr("Couldn't load the cloud backup. Try again in a moment.");
    if (injuryPreferenceChanged) setInjuriesEnabled(lg, injuries);
    onStart(lg, fixes);
  };
  const cloudNewer = cloud && (!local || (cloud.savedAt || 0) > (local.savedAt || 0) + 5000);

  const importFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    f.text().then((txt) => {
      try {
        const { league: lg, fixes } = loadRepaired(txt.trim());
        if (!lg) throw new Error("bad file");
        onStart(lg, fixes);
      } catch {
        setErr("That file isn't a Rink GM league export.");
      }
    });
    e.target.value = "";
  };

  // Injuries: the choice for a new league, and (as before) applied to your saved league at once;
  // turning them off heals everyone in it.
  const toggleInjuries = () => {
    const on = !injuries;
    setInjuries(on);
    setInjuryPreferenceChanged(true);
    if (local) { setInjuriesEnabled(local, on); saveLeague(local); }
  };
  const start = async (abbr) => {
    if ((local || cloud) && !(await ask({ title: "Start a new league?", body: "Your current saved league will be replaced. Export it from Settings first if you want to keep it.", yes: "Start new league", danger: true }))) return;
    deleteSave();
    const lg = createLeague({ userAbbr: abbr, mode, difficulty, injuries });
    applyNewGameOptions(lg, { firing, realDraft: mode === "real" && realDraft });
    onStart(lg);
  };

  if (step === "teams") {
    return (
      <div className="rkt rkt-pick">
        <div className="rkt-pick-bar"><button className="rkt-back" onClick={() => setStep("menu")}>← Back</button></div>
        <h2>Choose Your Team</h2>
        <div className="rkt-modes" role="radiogroup" aria-label="Players">
          {[["real", "NHL 27 rosters", `${total} real players · ${verifiedDataSummary.ratings} EA SPORTS ratings profiles`], ["random", "Random fictional players", "Every club filled with generated players"]].map(([v, l, sub]) => (
            <button key={v} role="radio" aria-checked={mode === v} className={mode === v ? "on" : ""} onClick={() => setMode(v)}><b>{l}</b><small>{sub}</small></button>
          ))}
        </div>
        {err && <div className="rkt-err">{err}</div>}
        <div className="rkt-grid">
          {TEAMS.map((t) => (
            <button key={t.abbr} className="rkt-team" style={{ "--c": tileColour(t), "--a": t.colors[1] || "#ffffff" }} title={`${t.city} ${t.name} · team rating ${strengths[t.abbr]}`} onClick={() => start(t.abbr)}>
              <span className="rkt-team-logo"><TeamBadge team={t} size={46} decorative /></span>
              <span className="rkt-team-text">
                <span className="rkt-team-city">{t.city}</span>
                <span className="rkt-team-name">{t.name}</span>
                <span className="rkt-team-div">{t.abbr} • {t.div === "Metropolitan" ? "Metro" : t.div}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="rkt-legal">Published EA SPORTS attributes and verified sweater numbers are used where they exist; other ratings are estimates. Fan-made game, not affiliated with or endorsed by the NHL, NHLPA or Electronic Arts. NHL and team logos belong to their respective owners.</p>
      </div>
    );
  }

  const ut = local?.teams?.[local.userTid];
  return (
    <div className="rkt rkt-menu">
      <div className="rkt-cup" aria-hidden="true"><Trophy kind="stanley" size={230} className="rkt-cup-img" /></div>
      <main className="rkt-main">
        <div className="rkt-kicker">Rink</div>
        <h1 className="rkt-gm">GM</h1>
        <div className="rkt-tagline">LIVE HOCKEY • 32 NHL CLUBS • FULL DRAFT</div>
        {err && <div className="rkt-err">{err}</div>}
        {local && ut && (
          <button className="rkt-btn rkt-continue" aria-label={`Continue League: ${ut.city} ${ut.name}, ${SEASON(local.year)}, ${ut.rec?.w || 0}-${ut.rec?.l || 0}-${ut.rec?.otl || 0}`} onClick={cont}>
            ▶ Continue <span>— {ut.abbr} · {SEASON(local.year)} · {ut.rec?.w || 0}-{ut.rec?.l || 0}-{ut.rec?.otl || 0}</span>
          </button>
        )}
        {cloud && (cloudNewer || !local) && (
          <button className="rkt-btn rkt-continue cloud" onClick={contCloud} disabled={loadingCloud}>
            {loadingCloud ? "Loading cloud backup…" : <>☁ Continue from cloud backup <span>— {cloud.team} · {SEASON(cloud.year)} · saved {when(cloud.savedAt)}</span></>}
          </button>
        )}
        <button className="rkt-btn rkt-new" onClick={() => { setErr(null); setStep("teams"); }}>NEW GAME</button>
        <label className="rkt-btn rkt-import">
          <span>📂 IMPORT SAVE FILE</span>
          <input type="file" accept=".rinkgm,.json,.txt" onChange={importFile} />
        </label>
        <div className="rkt-opts">
          <button className={`rkt-pill ${firing ? "on" : "off"}`} aria-pressed={firing} title="For new franchises: when off, the owner still judges your seasons but can never fire you" onClick={() => { const v = !firing; setFiring(v); keep("rinkgm_firing", v ? "1" : "0"); }}>👔 Owner can fire you: {firing ? "ON" : "OFF"}</button>
          <div className="rkt-seg" role="group" aria-label="Draft classes" title="Your first draft classes">
            {[[true, "🎓 Real 2027 & 28 classes", "The real top prospects for the 2027 and 2028 drafts lead the first two classes (NHL 27 rosters only)"], [false, "Generated", "Every class is generated"]].map(([v, l, tt]) => (
              <button key={l} title={tt} aria-pressed={realDraft === v} className={realDraft === v ? "on" : ""} onClick={() => { setRealDraft(v); keep("rinkgm_realdraft", v ? "1" : "0"); }}>{l}</button>
            ))}
          </div>
        </div>
        <div className="rkt-opts">
          <button className={`rkt-pill ${injuries ? "on" : "off"}`} aria-pressed={injuries} title={local ? "Applies to new franchises and to your saved league; turning injuries off heals everyone in it" : "Turn off to play without injuries"} onClick={toggleInjuries}>🚑 Injuries: {injuries ? "ON" : "OFF"}</button>
          <div className="rkt-seg" role="group" aria-label="Difficulty" title="Harder settings make AI GMs tougher in trades and free agents pricier">
            <span className="rkt-seg-k">Difficulty</span>
            {Object.entries(DIFFICULTY).map(([k, d]) => (
              <button key={k} aria-pressed={difficulty === k} className={difficulty === k ? "on" : ""} onClick={() => { setDifficulty(k); keep("rinkgm_difficulty", k); }}>{d.label}</button>
            ))}
          </div>
        </div>
        {local && injuryPreferenceChanged && <div className="rkt-note">{injuries ? "Injuries are on for your saved league too." : "Injuries are off: everyone in your saved league is healthy again."}</div>}
        <div className="rkt-byline">D'AMOURS UNLIMITED</div>
      </main>
    </div>
  );
}
