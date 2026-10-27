// Small draft parts shared by the Draft section (r16). The old floor's clock bar, broadcast stage,
// war room, phone bank, incoming calls, "The pick is in" and the Up next queue were retired with
// the draft redesign (DraftDay.jsx); the engine side is still engine/draftClock.js.
import React, { useEffect, useState } from "react";
import { POS_COLOR } from "./TradePage.jsx";
import { pickValueTag } from "../engine/draftRecap.js";
import "./draft.css";

// Phone layout (the same breakpoint the live game uses).
export function usePhone() {
  const q = "(max-width: 640px)";
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = typeof window !== "undefined" ? window.matchMedia?.(q) : null;
    if (!m) return undefined;
    const on = () => setPhone(m.matches);
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, []);
  return phone;
}

export function PosChip({ pos }) {
  return <span className="gg-pos" style={{ background: POS_COLOR[pos] || "#64748b" }}>{pos}</span>;
}

// STEAL +12 / REACH -15 against Central Scouting.
export function ValueTag({ overall, csr, small }) {
  const t = pickValueTag(overall, csr);
  if (!t) return null;
  return <span className={`dd-vtag ${t.kind}${small ? " sm" : ""}`} title={`Central Scouting #${csr}`}>{t.kind === "steal" ? "STEAL" : "REACH"} {t.d > 0 ? `+${t.d}` : t.d}</span>;
}
