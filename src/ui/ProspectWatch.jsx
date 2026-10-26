import React from "react";

// A small rating line for the season: weekly points, flat until the kid moves. (The old Prospect
// Watch board lives on as the Development › Prospects list.)
export function Sparkline({ path, color = "#22c55e", width = 120, height = 30 }) {
  if (!path?.length) return null;
  const lo = Math.min(...path.map((x) => x.ovr)) - 1, hi = Math.max(...path.map((x) => x.ovr)) + 1;
  const xs = path.length > 1 ? path.map((_, i) => (i / (path.length - 1)) * (width - 4) + 2) : [width / 2];
  const ys = path.map((x) => height - 3 - ((x.ovr - lo) / Math.max(1, hi - lo)) * (height - 6));
  const d = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
  return <svg className="gg-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true"><path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /><circle cx={xs.at(-1)} cy={ys.at(-1)} r="2.6" fill={color} /></svg>;
}

