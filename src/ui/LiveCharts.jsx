// Game-day charts for the live game: the win-probability line, the shot map and the live box
// score (team stats, goalies and the skaters who have done something). Read-only views of the
// game state; LiveGame.jsx lays them out.
import React, { useId } from "react";
import { TeamBadge, PlayerName } from "./common.jsx";
import { liveTeamStats } from "../engine/sim.js";

// A team colour that shows up on a dark background: very dark primaries fall back to the second colour.
const lum = (hex) => {
  const h = String(hex || "").replace("#", "");
  if (h.length < 6) return 0.5;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const dist = (a, b) => {
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(String(h).slice(i, i + 2), 16) || 0);
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
export const vivid = (t) => {
  const [c0, c1] = t?.colors || [];
  if (lum(c0) >= 0.16) return c0;
  return lum(c1) >= 0.16 ? c1 : "#94a3b8";
};
// Home and away chart colours, kept apart when the two clubs look alike.
export function chartColors(home, away) {
  const h = vivid(home);
  let a = vivid(away);
  if (dist(h, a) < 110) a = [away?.colors?.[1], away?.colors?.[0], "#e2e8f0"].find((c) => c && c !== a && lum(c) >= 0.16 && dist(h, c) >= 110) || "#e2e8f0";
  return { h, a };
}

// Home win probability over the game (series: [{t, wp}] with t in game seconds), filled in each
// club's colour on its side of 50%.
export function WinProbChart({ series, home, away, live = true, height = 104 }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (!series || series.length < 2) return null;
  const W = 400, H = height;
  const end = Math.max(3600, series[series.length - 1].t);
  const X = (t) => (t / end) * W, Y = (v) => H - v * H;
  const path = series.map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(1)} ${Y(p.wp).toFixed(1)}`).join(" ");
  const close = `L${X(series[series.length - 1].t).toFixed(1)} ${H / 2} L0 ${H / 2} Z`;
  const col = chartColors(home, away);
  const last = series[series.length - 1].wp;
  const lead = last >= 0.5 ? home : away;
  const pct = Math.round(Math.max(last, 1 - last) * 100);
  const marks = [1200, 2400, 3600].filter((t) => t < end);
  return (
    <div className="lv-chart">
      <div className="lv-chart-h">
        <span>WIN PROBABILITY</span>
        <span><i style={{ color: col.h }}>■</i> {home.abbr} <i style={{ color: col.a }}>■</i> {away.abbr}</span>
      </div>
      <div className="lv-wp">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label={`Win probability: ${lead.abbr} ${pct}%`}>
          <defs>
            <clipPath id={`${id}t`}><rect x="0" y="0" width={W} height={H / 2} /></clipPath>
            <clipPath id={`${id}b`}><rect x="0" y={H / 2} width={W} height={H / 2} /></clipPath>
          </defs>
          {marks.map((t) => <line key={t} x1={X(t)} x2={X(t)} y1="0" y2={H} stroke="#ffffff14" strokeDasharray="3 4" />)}
          <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#ffffff33" />
          <path d={`${path} ${close}`} fill={col.h} opacity=".45" clipPath={`url(#${id}t)`} />
          <path d={`${path} ${close}`} fill={col.a} opacity=".45" clipPath={`url(#${id}b)`} />
          <path d={path} fill="none" stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="lv-wp-top">{home.abbr} 100%</span>
        <span className="lv-wp-bot">{away.abbr} 100%</span>
      </div>
      <div className="lv-axis"><span>Puck drop</span><span>2nd</span><span>3rd</span><span>{live ? "Now" : "Final"} · {lead.abbr} {pct}%</span></div>
    </div>
  );
}

// Every shot attempt so far on one sheet of ice: the visitors shooting at the left net, the home
// club at the right, whatever end they were attacking at the time.
export function ShotMap({ log, home, away, s }) {
  const col = chartColors(home, away);
  const shots = (log || []).map((a) => {
    const flip = a.side === "h" ? a.x < 100 : a.x > 100;
    return { ...a, X: flip ? 200 - a.x : a.x, Y: flip ? 85 - a.y : a.y };
  });
  const count = (k, f) => shots.filter((a) => a.side === k && f(a)).length;
  const line = (k) => {
    const t = k === "h" ? home : away;
    const xg = s?.xg?.[k];
    return (
      <span className="lv-sm-team" style={{ "--tc": col[k] }}>
        <b>{t.abbr}</b> {count(k, () => true)} att · {count(k, (a) => a.result === "save" || a.result === "goal")} SOG{xg != null ? ` · ${xg.toFixed(1)} xG` : ""}
      </span>
    );
  };
  const mark = (a, i) => {
    const c = col[a.side];
    const tip = `${(a.side === "h" ? home : away).abbr} ${a.result === "goal" ? "goal" : a.result === "save" ? "shot on goal" : a.result === "block" ? "blocked" : "missed"}${a.strength && a.strength !== "EV" ? ` (${a.strength})` : ""}`;
    if (a.result === "goal") return <g key={i}><circle cx={a.X} cy={a.Y} r="3.1" fill={c} stroke="#fff" strokeWidth=".9" /><circle cx={a.X} cy={a.Y} r="1" fill="#fff" /><title>{tip}</title></g>;
    if (a.result === "save") return <circle key={i} cx={a.X} cy={a.Y} r="1.7" fill={c} opacity=".9"><title>{tip}</title></circle>;
    if (a.result === "block") return <path key={i} d={`M${a.X - 1.2} ${a.Y - 1.2} L${a.X + 1.2} ${a.Y + 1.2} M${a.X + 1.2} ${a.Y - 1.2} L${a.X - 1.2} ${a.Y + 1.2}`} stroke={c} strokeWidth=".6" opacity=".55"><title>{tip}</title></path>;
    return <circle key={i} cx={a.X} cy={a.Y} r="1.5" fill="none" stroke={c} strokeWidth=".55" opacity=".75"><title>{tip}</title></circle>;
  };
  return (
    <div className="lv-chart">
      <div className="lv-chart-h">
        <span>SHOT MAP</span>
        <span className="lv-sm-key"><i className="k-goal" /> goal <i className="k-sog" /> on goal <i className="k-miss" /> wide <i className="k-blk">×</i> blocked</span>
      </div>
      <svg className="lv-sm" viewBox="-2 -2 204 89" role="img" aria-label={`Shot map: ${away.abbr} ${count("a", () => true)} attempts, ${home.abbr} ${count("h", () => true)} attempts`}>
        <rect x="0" y="0" width="200" height="85" rx="26" fill="#0d1626" stroke="#334155" strokeWidth=".8" />
        <line x1="100" y1="0" x2="100" y2="85" stroke="#7f1d1d" strokeWidth=".8" />
        <line x1="75" y1="0" x2="75" y2="85" stroke="#1e3a8a" strokeWidth="1" />
        <line x1="125" y1="0" x2="125" y2="85" stroke="#1e3a8a" strokeWidth="1" />
        <line x1="11" y1="3" x2="11" y2="82" stroke="#7f1d1d" strokeWidth=".4" />
        <line x1="189" y1="3" x2="189" y2="82" stroke="#7f1d1d" strokeWidth=".4" />
        <circle cx="100" cy="42.5" r="12" fill="none" stroke="#1e3a8a" strokeWidth=".4" />
        {[[31, 20.5], [31, 64.5], [169, 20.5], [169, 64.5]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="12" fill="none" stroke="#7f1d1d" strokeWidth=".35" />)}
        <path d="M11 37 A5.5 5.5 0 0 1 11 48 Z" fill="#1e3a8a" opacity=".6" />
        <path d="M189 37 A5.5 5.5 0 0 0 189 48 Z" fill="#1e3a8a" opacity=".6" />
        <text x="50" y="47" textAnchor="middle" fontSize="9" fontWeight="900" fill={col.a} opacity=".14">{away.abbr}</text>
        <text x="150" y="47" textAnchor="middle" fontSize="9" fontWeight="900" fill={col.h} opacity=".14">{home.abbr}</text>
        {shots.filter((a) => a.result !== "goal").map(mark)}
        {shots.filter((a) => a.result === "goal").map(mark)}
      </svg>
      <div className="lv-sm-foot">{line("a")}{line("h")}</div>
    </div>
  );
}

// The live box score: team totals side by side, then each club's goalie and skaters with points
// or shots.
export function LiveBox({ s, home, away, league }) {
  const T = { h: liveTeamStats(s, "h"), a: liveTeamStats(s, "a") };
  const col = chartColors(home, away);
  const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
  const rows = [
    ["Shots on goal", (t) => t.sog, (t) => t.sog],
    ["Shot attempts", (t) => t.attempts, (t) => t.attempts],
    ["Power play", (t) => `${t.ppg}/${t.ppo}`, (t) => t.ppg + t.ppo / 100],
    ["Faceoffs", (t) => `${t.fow} · ${pct(t.foPct)}`, (t) => t.fow],
    ["Hits", (t) => t.hits, (t) => t.hits],
    ["Blocks", (t) => t.blocks, (t) => t.blocks],
    ["Saves", (t) => `${t.saves}/${t.shotsAgainst}`, (t) => t.saves],
    ["PIM", (t) => t.pim, null],
  ];
  const players = (k) => {
    const side = s[k];
    const skaters = side.dressed
      .map((id) => ({ id, b: s.box[id] }))
      .filter((x) => x.b && x.b.sog !== undefined && (x.b.g || x.b.a || x.b.sog >= 2 || x.b.hit >= 3 || x.b.blk >= 2))
      .sort((x, y) => y.b.g * 3 + y.b.a * 2 + y.b.sog * 0.3 - (x.b.g * 3 + x.b.a * 2 + x.b.sog * 0.3))
      .slice(0, 6);
    const goalies = Object.keys(s.gbox).filter((id) => side.pl[id] && (s.gbox[id].toi > 0 || id === side.goalie));
    return (
      <div className="lv-box-team" key={k}>
        <div className="lv-box-name"><i style={{ background: col[k] }} />{side.abbr}</div>
        {goalies.map((id) => {
          const g = s.gbox[id];
          return (
            <div className="lv-box-row goalie" key={id}>
              <span className="lv-pos g">G</span>
              <span className="nm"><PlayerName p={league.players[id] || side.pl[id]} showInj={false} /></span>
              <span className="st">{g.sa - g.ga}/{g.sa} SV{g.sa ? ` · ${((g.sa - g.ga) / g.sa).toFixed(3).replace(/^0/, "")}` : ""}</span>
            </div>
          );
        })}
        {skaters.map(({ id, b }) => {
          const p = league.players[id] || side.pl[id];
          return (
            <div className="lv-box-row" key={id}>
              <span className={`lv-pos ${/D/.test(p?.pos || "") ? "d" : "f"}`}>{p?.pos}</span>
              <span className="nm"><PlayerName p={p} showInj={false} /></span>
              <span className="st">
                {b.g ? <b className="g">{b.g}G</b> : null}{b.a ? <b>{b.a}A</b> : null}<span>{b.sog} SOG</span>{b.hit >= 3 ? <span>{b.hit} H</span> : null}{b.blk >= 2 ? <span>{b.blk} BLK</span> : null}
              </span>
            </div>
          );
        })}
        {!skaters.length && <div className="lv-box-none">Nothing on the sheet yet.</div>}
      </div>
    );
  };
  return (
    <div className="lv-box">
      <div className="lv-box-stats">
        <div className="lv-box-head"><span><TeamBadge team={away} size={18} decorative /> {away.abbr}</span><span>TEAM STATS</span><span>{home.abbr} <TeamBadge team={home} size={18} decorative /></span></div>
        {rows.map(([label, show, val]) => {
          const a = val ? val(T.a) : 0, h = val ? val(T.h) : 0;
          const sum = a + h;
          return (
            <div className="lv-stat" key={label}>
              <b className={val && a > h ? "up" : ""}>{show(T.a)}</b>
              <span className="lbl">{label}{val && sum > 0 ? <span className="lv-statbar"><i style={{ width: `${(a / sum) * 100}%`, background: col.a }} /><i style={{ width: `${(h / sum) * 100}%`, background: col.h }} /></span> : null}</span>
              <b className={val && h > a ? "up" : ""}>{show(T.h)}</b>
            </div>
          );
        })}
      </div>
      <div className="lv-box-players">{players("a")}{players("h")}</div>
    </div>
  );
}
