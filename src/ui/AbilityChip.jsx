import React from "react";

// EA SPORTS NHL X-Factor abilities (Elite Edges, Quick Release, Tape to Tape…), stored on real
// players as p.ratingData.abilities by verifiedData.js. Shown as a gold tag, the way the
// football game shows its X-Factors: a small "XF" in lists, every ability by name on the card.

export function abilitiesOf(p) {
  const a = p?.ratingData?.abilities;
  return Array.isArray(a) ? a.filter((x) => typeof x === "string" && x.trim()) : [];
}

const tip = (list) => `EA SPORTS NHL X-Factor${list.length > 1 ? "s" : ""}: ${list.join(", ")}`;

export default function AbilityChip({ p, full = false }) {
  const list = abilitiesOf(p);
  if (!list.length) return null;
  if (!full) return <span className="gg-xf" title={tip(list)} aria-label={tip(list)}>XF</span>;
  return list.map((name) => (
    <span key={name} className="gg-xf-pill" title={`EA SPORTS NHL X-Factor: ${name}`}>
      <b aria-hidden="true">⚡</b>
      {name}
    </span>
  ));
}
