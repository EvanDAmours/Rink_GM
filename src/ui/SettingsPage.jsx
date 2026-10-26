import {upgradeVerifiedData,verifiedDataSummary} from "../engine/verifiedData.js";
import {ensureUniforms} from "../engine/uniforms.js";
import {setInjuriesEnabled} from '../engine/injuries.js';
import { headCoachLines } from "../engine/lines.js";
import { resultCardMode } from "../engine/momentsResults.js";
import React, { useEffect, useMemo, useState } from "react";
import { useGame, Ovr, PageHead } from "./common.jsx";
import { DIFFICULTY } from "../engine/constants.js";
import { saveLeague, exportLeagueText, deleteSave } from "../engine/league.js";
import { loadRepaired } from "../engine/repair.js";
import { parseRatingsCsv, matchRows, applyRatings, exportRosterFile } from "../engine/importer.js";
import { saveFile, cloudSave, cloudDelete, cloudMeta, cloudStatus } from "../platform.js";

import {listSlots,saveSlot,readSlot,backupInfo,readBackup} from "../engine/saveSlots.js";
import OfflinePanel from "./OfflinePanel.jsx";
import { ThemePicker, DisplayPicker } from "./DisplayPrefs.jsx";

const when = (ms) => { try { return new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return ""; } };

const SAMPLE = `name,team,pos,ovr
Connor McDavid,EDM,C,99
Nathan MacKinnon,COL,C,97`;

export default function SettingsPage() {
  const { league, commit, toast, newGame, ask, replaceLeague, startTour } = useGame();
  const [slots,setSlots]=useState(()=>listSlots());
  // Read again when the phase moves on (a new backup is made at every phase change).
  const backup=useMemo(()=>backupInfo(),[league.phase,league.year]);
  // Undo a bad stretch: back to the save as it stood before the last phase change.
  const restoreBackup = async () => {
    if (!backup) return;
    const at = backup.savedAt ? ` (${when(backup.savedAt)})` : "";
    if (!(await ask({ title: "Restore your backup?", body: `Go back to your save from ${backup.label}${at}${backup.team ? `, ${backup.team}` : ""}. Everything since then is lost.`, yes: "Restore backup", danger: true }))) return;
    const { league: lg, fixes } = readBackup();
    if (!lg) return toast("That backup can't be read. Your current league is unchanged.");
    replaceLeague(lg, fixes);
    toast(`Backup restored: ${backup.label}.`);
  };
  const [csv, setCsv] = useState("");
  const [fallback, setFallback] = useState(null);
  const [cloudInfo, setCloudInfo] = useState({ ...cloudStatus });
  useEffect(() => {
    cloudMeta().then(() => setCloudInfo({ ...cloudStatus }));
  }, []);

  const offerFile = async (filename, text, label) => {
    const r = await saveFile(filename, text);
    if (r === "saved") toast(`${label} saved.`);
    else if (r === "failed") setFallback({ label, text });
  };
  const backupNow = async () => {
    toast("Backing up…");
    const ok = await cloudSave(league);
    setCloudInfo({ ...cloudStatus });
    toast(ok ? "Cloud backup saved." : cloudStatus.error || "Cloud backup isn't available here.");
  };
  const copyFallback = async (e) => {
    const ta = e.currentTarget.parentElement.parentElement.querySelector("textarea");
    try {
      await navigator.clipboard.writeText(fallback.text);
      toast("Copied to the clipboard.");
    } catch {
      ta?.select();
      toast("Press Ctrl/Cmd+C to copy the selected text.");
    }
  };
  const [preview, setPreview] = useState(null);
  const [opts, setOpts] = useState({ markEA: true, moveTeams: false, addMissing: false });

  const doPreview = () => {
    const { rows, errors } = parseRatingsCsv(csv);
    const matches = matchRows(league, rows);
    setPreview({ matches, errors });
  };
  const doApply = () => {
    if (!preview) return;
    const r = applyRatings(league, preview.matches, opts);
    toast(`Ratings import: ${r.updated} updated, ${r.moved} moved, ${r.added} added, ${r.skipped} skipped.`, 5000);
    setPreview(null);
    setCsv("");
    commit();
  };
  const importSave = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    f.text().then((txt) => {
      // Repaired as it's read, so one broken record doesn't make the file unreadable.
      const { league: lg, fixes } = loadRepaired(txt.trim());
      if (!lg) return toast("That file isn't a Rink GM league export.");
      saveLeague(lg);
      replaceLeague(lg, fixes);
      toast("League imported.");
    });
  };

  const eaCount = Object.values(league.players).filter((p) => p.src === "ea27" && p.tid >= 0).length;
  const estCount = Object.values(league.players).filter((p) => p.src === "est" && p.tid >= 0).length;

  return (
    <div className="stack">
      <PageHead title="Settings" sub="How the game looks, the tour, your saves and the verified player data." /><div className="panel"><h3>Tour</h3><p className="muted small">A two-minute walk through every screen and how a good GM uses each one. Offered once on a new franchise; replay it any time.</p><button className="primary" onClick={startTour}>Show me around</button></div><div className="panel rk-look"><h3>Look</h3><p className="muted small">Saved on this device.</p><div className="rk-look-row"><div><b>Theme</b><span className="muted small">Light, dark, or follow your device.</span></div><ThemePicker /></div><div className="rk-look-row"><div><b>Display size</b><span className="muted small">Laptop fits more on a small screen, Desktop fills a big monitor, Auto picks for you. Phones are never scaled.</span></div><DisplayPicker /></div></div><div className="panel"><h3>Interface preferences</h3><p className="muted small">Choose the spacing that suits your management style. Quick search is available with Command K or Control K.</p><label className="row">Table density <select aria-label="Table density" value={league.settings.uiDensity || "compact"} onChange={e=>{league.settings.uiDensity=e.target.value;commit();}}><option value="compact">Compact (classic GM look)</option><option value="comfortable">Comfortable (larger controls)</option></select></label><label className="row">Text size <select aria-label="Text size" value={league.settings.textSize || "standard"} onChange={e=>{league.settings.textSize=e.target.value;commit();}}><option value="standard">Standard</option><option value="large">Large</option></select></label><label className="row"><input type="checkbox" checked={!!league.settings.reducedMotion} onChange={e=>{league.settings.reducedMotion=e.target.checked;commit();}}/> Reduce interface motion</label></div>
      <div className="panel"><h3>Verified player data</h3><p className="muted small">{verifiedDataSummary.ratings} published EA player profiles and jersey numbers from all 32 ESPN team rosters, checked {verifiedDataSummary.retrieved}. New franchises use this data automatically. Existing preseason saves receive corrections when loaded; established franchises preserve development.</p><button onClick={async()=>{if(!await ask({title:"Apply published EA baseline ratings?",body:"For real players without sourced attributes, replace generated ratings with EA’s published values. Their simulated development will be reset. Custom imports and already sourced players are preserved.",yes:"Apply verified data"}))return;const r=upgradeVerifiedData(league,{replaceRatings:true});ensureUniforms(league);commit();toast(`${r.ratings} ratings profiles and ${r.numbers} jersey numbers updated.`);}}>Apply verified data to this franchise</button></div>
      <div className="panel rk-backup"><h3>Automatic backup</h3><p className="muted small">Before every phase change (opening night, the playoffs, the draft, re-signing, free agency and the next season) the game keeps a copy of your save in this browser. Restore it to undo everything since.</p>{backup ? <div className="rk-backup-row"><div><b>Backup from {backup.label}</b><span className="muted small">{[backup.team, backup.savedAt && when(backup.savedAt)].filter(Boolean).join(" · ")}</span></div><button onClick={restoreBackup}>Restore backup</button></div> : <p className="small">No backup yet. The first one is made at the next phase change.</p>}</div>
      <div className="panel"><h3>Manual save slots</h3><p className="muted small">Keep checkpoints or a second franchise alongside your autosave. Slots stay in this browser; export a file to take a save elsewhere.</p><div className="grid g3">{slots.map(s=><div className="coach-card" key={s.index}><b>Slot {s.index+1}</b><p className="muted small">{s.summary?`${s.summary.team} · ${s.summary.year} · ${s.summary.phase}`:s.occupied?"Unreadable save":"Empty"}</p><div className="row"><button className="small" onClick={async()=>{if(s.occupied && !await ask({title:`Overwrite slot ${s.index+1}?`,body:"The current league will replace this checkpoint.",yes:"Save to slot"}))return;toast(saveSlot(league,s.index)?"Checkpoint saved.":"Save failed. Export a league file instead.");setSlots(listSlots());}}>Save here</button><button className="small" disabled={!s.summary} onClick={async()=>{if(!await ask({title:`Load slot ${s.index+1}?`,body:"The current league's autosave will be replaced by this checkpoint.",yes:"Load checkpoint"}))return;const {league:lg,fixes}=readSlot(s.index);if(lg){replaceLeague(lg,fixes);toast("Checkpoint loaded.");}else toast("Could not load that checkpoint.");}}>Load</button></div></div>)}</div></div>
      <OfflinePanel league={league} />
      <div className="grid g2">
        <div className="panel stack">
          <h3>League</h3>
          <label className="row"><input type="checkbox" checked={league.settings.injuries !== false} onChange={e=>{const enabled=e.target.checked;const healed=setInjuriesEnabled(league,enabled);commit();toast(enabled?"Injuries enabled.":`Injuries disabled. ${healed} players restored to full health.`);}}/> Injuries enabled</label><p className="muted small">Turning injuries off immediately heals every player and clears LTIR. Roster and cap limits still apply.</p>
          <label className="row"><input type="checkbox" checked={league.settings.autoRoster !== false} onChange={e=>{league.settings.autoRoster=e.target.checked;commit();}}/> Handle roster limits automatically</label><p className="muted small">When injured players return and the roster is over the limit, the lowest-rated spare is sent down (or waived) so the simulation never stops. Turn off to make every assignment yourself.</p>
          <label className="row"><input type="checkbox" checked={Boolean(league.settings.coachLines)} onChange={e=>{league.settings.coachLines=e.target.checked;if(e.target.checked)headCoachLines(league,league.teams[league.userTid]);commit();}}/> Head coach runs the lines</label><p className="muted small">When a player is hurt, your head coach fills the hole with the best healthy scratch, rebuilds special teams and keeps simulating instead of pausing. He also dresses clearly better spares each week. Your line combinations stay yours; only injured slots change.</p>
          <label className="row"><input type="checkbox" checked={league.settings.simSummary !== false} onChange={e=>{league.settings.simSummary=e.target.checked;commit();}}/> Show a summary after each sim</label><p className="muted small">After Sim Week, To Deadline or To End, a recap shows your record over the span, standings movement, who carried the club, injuries and returns.</p>
          <label className="row">After your game
            <select aria-label="Result card after your game" value={resultCardMode(league)} onChange={(e) => { league.settings.resultCard = e.target.value; commit(); }}>
              <option value="compact">Compact result card</option>
              <option value="full">Full result card</option>
              <option value="off">No result card</option>
            </select>
          </label><p className="muted small">The compact card shows the result, score, record and first star, and closes itself after 10 seconds (hover or tap it to keep it). The full card adds the three stars and your goalie, and stays until you close it or change screens. Either one opens the box score and the night's other scores. Games played live skip it: the live screen already shows the final.</p>
          <label className="row">Difficulty
            <select value={league.settings.difficulty} onChange={(e) => { league.settings.difficulty = e.target.value; commit(); }}>
              {Object.entries(DIFFICULTY).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
            </select>
          </label>
          <div className="row">
            <button onClick={() => toast(saveLeague(league) ? "League saved." : "Save failed — try exporting instead.")}>Save now</button>
            <button onClick={() => offerFile(`rinkgm-${league.teams[league.userTid].abbr}-${league.year}.json`, exportLeagueText(league), "League file")}>Export league file</button>
            <label className="row" style={{ cursor: "pointer" }}>
              <span className="pill">Import league file…</span>
              <input type="file" accept=".json,.rinkgm,.txt" onChange={importSave} style={{ display: "none" }} />
            </label>
          </div>
          <div className="row">
            <button onClick={newGame}>Back to title</button>
            <button
              className="danger"
              onClick={async () => {
                if (!(await ask({ title: "Delete this league?", body: "This removes the save from this browser and your cloud backup. Export it first if you want to keep it.", yes: "Delete league", danger: true }))) return;
                deleteSave();
                await cloudDelete();
                newGame();
              }}
            >
              Delete saved league
            </button>
          </div>
          <div className="muted small">
            Your league auto-saves in this browser after every action.{" "}
            {cloudInfo.state === "on" && <>It's also backed up to your Claude account{cloudInfo.savedAt ? ` (last backup ${new Date(cloudInfo.savedAt).toLocaleString()})` : ""}, so you can continue on another device.</>}
            {cloudInfo.state === "error" && <span className="warn">{cloudInfo.error}</span>}
            {cloudInfo.state === "off" && <>Cloud backup is available when you play while signed in to Claude.</>}
          </div>
          {cloudInfo.state !== "off" && <div><button className="small" onClick={backupNow}>Back up to cloud now</button></div>}
        </div>
        <div className="panel stack">
          <h3>Ratings data</h3>
          <div>
            <span className="src ea">EA</span> {eaCount} players carry official EA SPORTS NHL 27 overalls. <span className="src est">EST</span> {estCount} are estimates.
          </div>
          <div className="muted small">
            Paste ratings from EA's NHL 27 ratings site (or any spreadsheet) below to replace estimates or apply EA's in-season roster updates. Attributes are re-scaled so each player's overall matches exactly.
          </div>
          <button onClick={() => offerFile(`nhl27-rosters-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(exportRosterFile(league), null, 1), "Roster file")}>
            Export rosters as JSON
          </button>
        </div>
      </div>

      {fallback && (
        <div className="panel stack">
          <h3>{fallback.label} <span className="right"><button className="tiny ghost" onClick={() => setFallback(null)}>Close</button></span></h3>
          <div className="muted small">This browser can't save files from here. Copy the text below and keep it in a .json file; you can import it later.</div>
          <textarea id="export-text" rows={6} readOnly value={fallback.text} onFocus={(e) => e.target.select()} />
          <div className="row"><button className="primary small" onClick={copyFallback}>Copy to clipboard</button></div>
        </div>
      )}

      <div className="panel stack">
        <h3>Ratings Import</h3>
        <div className="muted small">
          Accepted formats: a header row with <code>name</code> and <code>ovr</code> (optional <code>team</code>, <code>pos</code>, <code>type</code>, <code>age</code>, <code>cap</code>, <code>yrs</code>), or plain lines of <code>Name, OVR</code> / <code>Name, Team, Pos, OVR</code>. Comma, tab or semicolon separated.
        </div>
        <textarea rows={8} value={csv} placeholder={SAMPLE} onChange={(e) => { setCsv(e.target.value); setPreview(null); }} />
        <div className="row">
          <label className="row small"><input type="checkbox" checked={opts.markEA} onChange={(e) => setOpts({ ...opts, markEA: e.target.checked })} /> Mark as official EA ratings</label>
          <label className="row small"><input type="checkbox" checked={opts.moveTeams} onChange={(e) => setOpts({ ...opts, moveTeams: e.target.checked })} /> Move players to the listed team</label>
          <label className="row small"><input type="checkbox" checked={opts.addMissing} onChange={(e) => setOpts({ ...opts, addMissing: e.target.checked })} /> Add unknown players (needs team + pos)</label>
        </div>
        <div className="row">
          <button onClick={doPreview} disabled={!csv.trim()}>Preview</button>
          <button className="primary" onClick={doApply} disabled={!preview || !preview.matches.length}>Apply {preview ? `(${preview.matches.length})` : ""}</button>
        </div>
        {preview && (
          <div className="stack" style={{ gap: 6 }}>
            {preview.errors.slice(0, 5).map((e) => <div key={e} className="bad small">{e}</div>)}
            <div className="small muted">
              {preview.matches.filter((m) => m.player).length} matched · {preview.matches.filter((m) => !m.player).length} not found
            </div>
            <div className="tablewrap" style={{ maxHeight: 300, overflowY: "auto" }}>
              <table className="t">
                <thead><tr><th>Name</th><th>Match</th><th className="num">Current</th><th className="num">New</th></tr></thead>
                <tbody>
                  {preview.matches.slice(0, 300).map((m, i) => (
                    <tr key={i}>
                      <td>{m.row.name}{m.row.team ? ` (${m.row.team})` : ""}</td>
                      <td>{m.player ? `${m.player.name} · ${league.teams[m.player.tid]?.abbr || "FA"}` : <span className="warn">not found</span>}</td>
                      <td className="num">{m.player ? <Ovr v={m.player.ovr} src={m.player.src} /> : "-"}</td>
                      <td className="num"><Ovr v={m.row.ovr} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="panel small muted">
        Rink GM is a fan-made game and is not affiliated with or endorsed by the NHL, the NHLPA or Electronic Arts. Player overall ratings marked EA are taken from EA SPORTS NHL 27's published ratings; all other ratings, attributes and contracts are estimates for gameplay.
      </div>
    </div>
  );
}
