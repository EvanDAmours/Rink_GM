// The draft clock as text for the section hero: reads league.draft.clock a few times a second (the
// Draft screen's runner ticks it). Kept apart from DraftDay.jsx so the hero needn't import the screen.
import React, { useEffect, useState } from "react";
import { draftLive, clockText } from "../engine/draftClock.js";

export function LiveClock({ league }) {
  const [, setN] = useState(0);
  useEffect(() => { const t = setInterval(() => setN((n) => n + 1), 250); return () => clearInterval(t); }, []);
  const c = league?.draft?.clock;
  if (!c || !draftLive(league)) return <>—</>;
  // not a <span>: the hero styles its spans as captions
  return <i className={c.remaining <= 10 ? "dy-low" : undefined} style={{ fontStyle: "normal" }}>{clockText(c.remaining ?? 120)}</i>;
}
