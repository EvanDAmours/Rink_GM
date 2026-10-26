// Game Updates (Gridiron 2.11, its GameInfo.jsx): Rink GM's release notes, newest first, with a
// search box. Only the latest 15 show at first; older ones open from a dropdown (a search looks
// through all of them). The league's News and Timeline are the second tab (the Activity page).
import React, { useState } from "react";
import { PATCH_NOTES } from "../data/patchNotes.js";
import ActivityPage from "./ActivityPage.jsx";
import { PageHead } from "./common.jsx";
import "./prep.css";

const RECENT = 15;
const fmtDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export function PatchNotes() {
  const [q, setQ] = useState("");
  const [older, setOlder] = useState(false);
  const all = [...PATCH_NOTES].reverse();
  const needle = q.trim().toLowerCase();
  const found = needle ? all.filter((p) => `${p.v} ${p.title} ${p.notes.join(" ")}`.toLowerCase().includes(needle)) : all;
  const shown = needle || older ? found : found.slice(0, RECENT);
  const hidden = found.length - shown.length;
  return (
    <div className="rk-gu">
      <div className="rk-gu-head">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search patch notes" aria-label="Search patch notes" />
      </div>
      {shown.map((p, i) => (
        <article key={p.v} className={`rk-gu-card${!needle && i === 0 ? " latest" : ""}`}>
          <div className="rk-gu-top">
            <span className="rk-gu-v">v{p.v}</span>
            <h3>{p.title}</h3>
            {!needle && i === 0 && <span className="rk-gu-latest">LATEST</span>}
            <span className="rk-gu-date">{fmtDate(p.date)}</span>
          </div>
          <ul>{p.notes.map((n, j) => <li key={j}>{n}</li>)}</ul>
        </article>
      ))}
      {!needle && all.length > RECENT && (
        <button className="rk-gu-older" aria-expanded={older} onClick={() => setOlder(!older)}>{older ? "▲ Hide older updates" : `▼ Older updates (${hidden})`}</button>
      )}
      {!shown.length && <div className="rk-gu-none">No patch notes match "{q}".</div>}
    </div>
  );
}

// The page, laid out like the other hubs (hubs.jsx Hub): a label and two section chips.
export default function GameUpdates() {
  const [tab, setTab] = useState("updates");
  return (
    <div className="stack gg-hub rk-gu-page">
      <PageHead label="Game updates" pills={[["updates", "Patch notes", tab === "updates"], ["timeline", "News & timeline", tab === "timeline"]]} onPick={setTab}
        title="Game updates" sub={tab === "updates" ? `Every change to Rink GM, newest first. Current version ${PATCH_NOTES[PATCH_NOTES.length - 1].v}.` : "Your club's news and the league wire, newest first."} />
      <div className="gg-embed">{tab === "updates" ? <PatchNotes /> : <ActivityPage />}</div>
    </div>
  );
}
