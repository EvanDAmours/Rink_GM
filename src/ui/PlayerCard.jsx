import React, { useState } from "react";
import { useCallUp } from "./CallUpFlow.jsx";
import { useGame, Modal, TeamBadge, money, pct, signed } from "./common.jsx";
import Headshot from "./Headshot.jsx";
import { SKATER_ATTRS, GOALIE_ATTRS } from "../engine/ratings.js";
import { isGoalie, isDefense, ARCHETYPES } from "../engine/constants.js";
import { fullPosName, savePct, gaa, marketValue, isRFA, DEV_TRAITS, primeEnd } from "../engine/players.js";
import { formLabel, seasonRole, ROLE_NAME } from "../engine/development.js";
import { DevChip } from "./scoutingBits.jsx";
import { shownRatings } from "../engine/draft.js";
import { sendDown, callUp, releasePlayer, canSendDown, hasRoomFor, capYear } from "../engine/roster.js";
import { buyoutSummary } from "../engine/capAccounting.js";
import { careerTotals, careerMilestones } from "../engine/records.js";
import { prospectReport, isProspectWatch } from "../engine/prospectWatch.js";
import { Sparkline } from "./ProspectWatch.jsx";
import { assetValue } from "../engine/trade.js";
import { agentPreferences } from "../engine/negotiations.js";
import { SKATER_SKILLS, GOALIE_SKILLS, fmtHeight, COMBINE_TESTS } from "../engine/scouting.js";
import { POS_COLOR } from "./TradePage.jsx";
import AbilityChip from "./AbilityChip.jsx";
import { injuryReturn } from "../engine/injuryReport.js";
import PlayerContract from "./PlayerContract.jsx";
import { accoladesOf, accoladeText, franchiseRanks } from "../engine/legacy.js";
import "./legacy.css";
import { bestRoles } from "../engine/roles.js";

// The player card, laid out like the football game's: hero with the face, number and an
// OVR ring; tags; three quick tiles; attribute bars on the left, the season, scouting
// report, season-by-season and career rating chart on the right.
const ovrTone = (v) => (v >= 90 ? "#4ade80" : v >= 85 ? "#a3e635" : v >= 80 ? "#facc15" : v >= 75 ? "#fb923c" : "#f87171");
const WANTS = { winning: ["Ring", "a contender first"], role: ["Minutes", "a real role on the ice"], security: ["Term", "years and security"], loyalty: ["Home", "to stay where he is"] };
const AGENT = { Patient: "easy to deal with", Businesslike: "all about the number", Ambitious: "drives a hard bargain", Loyal: "rewards good faith" };

export function OvrRing({ v, pot, est }) {
  const r = 30, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, (v - 40) / 59));
  return <div className="gg-pc-ring"><svg viewBox="0 0 80 80" width="92" height="92" aria-hidden="true"><circle cx="40" cy="40" r={r} fill="#0b1220" stroke="#1e293b" strokeWidth="7" /><circle cx="40" cy="40" r={r} fill="none" stroke={ovrTone(v)} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${c * f} ${c}`} transform="rotate(-90 40 40)" /></svg><b>{v}</b><small>OVR{est ? "*" : ""}</small>{pot != null && <span>POT <em style={{ color: ovrTone(pot) }}>{pot}</em></span>}</div>;
}
function Bars({ attrs, p, hide }) {
  return <div className="gg-pc-bars">{Object.entries(attrs).map(([k, label]) => { const v = p.attrs[k]; return <div key={k} className="gg-pc-bar" title={label}><span>{k.toUpperCase()}</span><i><b style={{ width: hide ? "0%" : `${Math.max(2, ((v ?? 40) - 40) / 59 * 100)}%`, background: ovrTone(v ?? 40) }} /></i><em style={{ color: ovrTone(v ?? 40) }}>{hide || v == null ? "—" : v}</em></div>; })}</div>;
}
function report(p) {
  const S = isGoalie(p.pos) ? GOALIE_SKILLS : SKATER_SKILLS;
  const rows = Object.entries(S).map(([k, g]) => { const ks = g.keys.filter((x) => Number.isFinite(p.attrs[x])); const avg = ks.length ? ks.reduce((s, x) => s + p.attrs[x], 0) / ks.length : null; return { k, g, avg }; }).filter((r) => r.avg != null);
  const sorted = [...rows].sort((a, b) => b.avg - a.avg);
  const pick = (arr, i) => arr[(p.id.length + i) % arr.length];
  const plus = sorted.slice(0, 3).filter((r) => r.avg >= 72).map((r, i) => pick(r.g.hi, i));
  const minus = sorted.slice(-2).filter((r) => r.avg < 80).map((r, i) => pick(r.g.lo, i));
  return { plus, minus };
}
function CareerChart({ points }) {
  if (points.length < 2) return <div className="dim small">A second season draws the line.</div>;
  const W = 420, H = 120, lo = Math.min(...points.map((x) => x.ovr)) - 3, hi = Math.max(...points.map((x) => x.ovr)) + 3;
  const xs = points.map((_, i) => 24 + (i / (points.length - 1)) * (W - 48)), ys = points.map((x) => 18 + (1 - (x.ovr - lo) / (hi - lo)) * (H - 44));
  const d = xs.map((x, i) => `${i ? "L" : "M"}${x} ${ys[i]}`).join(" ");
  return <svg className="gg-pc-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true"><path d={`${d} L${xs.at(-1)} ${H - 22} L${xs[0]} ${H - 22} Z`} fill="#1d4ed822" /><path d={d} fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinejoin="round" />{points.map((x, i) => <g key={i}><circle cx={xs[i]} cy={ys[i]} r="4" fill="#a3e635" /><text x={xs[i]} y={ys[i] - 9} textAnchor="middle" fill="#fff" fontSize="12" fontWeight="800">{x.ovr}</text><text x={xs[i]} y={H - 6} textAnchor="middle" fill="#94a3b8" fontSize="11">{x.year}</text></g>)}</svg>;
}

export default function PlayerCard({ p, retired = null }) {
  const { league, closeModal, commit, toast, proposeTradeFor, go, openTeam, ask } = useGame();
  const callUpFlow = useCallUp();
  const [allAttrs, setAllAttrs] = useState(false);
  const [seasons, setSeasons] = useState("all");
  const team = retired ? league.teams[retired.tid] : league.teams[p.tid];
  const mine = !retired && p.tid === league.userTid;
  const inMinors = !retired && team && team.prospects.includes(p.id);
  const hidden = inMinors && !mine;
  const r = hidden ? shownRatings(p) : { ovr: p.ovr, pot: p.pot, exact: true };
  const goalie = isGoalie(p.pos);
  const groups = goalie ? GOALIE_ATTRS : SKATER_ATTRS;
  const groupKeys = Object.keys(groups);
  const shownGroups = allAttrs ? groupKeys : groupKeys.slice(0, 2);
  const totals = careerTotals(p), milestones = careerMilestones(p);
  const watch = !retired && team && isProspectWatch(league, team, p) ? prospectReport(league, team, p) : null;
  const prefs = agentPreferences(p);
  const value = retired ? null : p.tid >= 0 || p.tid === -1 ? Math.max(1, Math.round(assetValue(league, p.id, league.teams[league.userTid]))) : null;
  const rep = hidden ? { plus: [], minus: [] } : report(p);
  const career = [...p.career].reverse();
  const shownCareer = seasons === "all" ? career : career.slice(0, 3);
  const ratingPoints = [...(p.ratingHistory || []).map((h) => ({ year: h.year, ovr: h.ovr })), ...(retired ? [] : [{ year: league.year, ovr: p.ovr }])];
  const accolades = accoladesOf(league, p);
  const ranks = retired ? [] : franchiseRanks(league, p);
  const eyebrow = retired ? `RETIRED ${retired.year} · ${team ? `${team.city} ${team.name}` : "unsigned free agent"}${retired.age ? ` · age ${retired.age}` : ""}` : team ? `${team.city} ${team.name}${inMinors ? " · MINORS" : ""}` : p.tid === -2 ? `${league.draftClassYear} DRAFT CLASS` : "FREE AGENT";
  // The development trait shows at every age (Gridiron 1.5); another club's prospect shows what your scouts found.
  const devShown = p.dev && DEV_TRAITS[p.dev] ? (hidden ? p.scout?.dev || null : p.dev) : undefined;
  const form = hidden ? null : formLabel(p, league.year);
  const role = hidden ? null : seasonRole(p, league.year);
  const grew = p.grewAs && p.grewAs.year === league.year ? p.grewAs.role : null;
  const summer = !hidden && league.devReport?.year === league.year ? league.devReport.rows.find((x) => x.pid === p.id) : null;
  const prime = primeEnd(p);
  const s = p.stats, ps = p.pstats;
  const tiles = (st) => goalie ? [["GP", st.gp], ["W", st.w], ["L", st.l], ["SV%", st.sa ? pct(savePct(st)) : "—"], ["GAA", st.gp ? gaa(st).toFixed(2) : "—"], ["SO", st.so]] : [["GP", st.gp], ["G", st.g], ["A", st.a], ["PTS", st.pts], ["+/-", signed(st.pm)], ["PIM", st.pim]];
  const farmLine = watch?.farm ? watch.line : null;
  // When he's back, from the schedule and the bracket ("out 3 games", "back for game 5", "out for the series").
  const injury = injuryReturn(league, p);
  return (
    <Modal title={p.name} onClose={closeModal} bare className="gg-pc-modal">
      <div className="gg-pc">
        <header className="gg-pc-hero" style={{ "--team": team?.colors?.[0] || "#1e293b" }}>
          <div className="gg-pc-face"><Headshot p={p} team={team} size={96} /><span className="gg-pc-num">#{p.number || "—"}</span></div>
          <div className="gg-pc-who">
            <small>{eyebrow}</small>
            <h1>{p.name}</h1>
            <div className="gg-pc-meta"><i className="gg-pos" style={{ background: POS_COLOR[p.pos] || "#64748b" }}>{p.pos}</i> Age {p.age}{p.bio?.ht ? ` · ${fmtHeight(p.bio.ht)} ${p.bio.wt}lbs` : ""}{p.nat ? ` · ${p.nat}` : ""} · {goalie ? "catches" : "shoots"} {p.shoots}{p.bio?.town ? ` · ${p.bio.town}` : ""}</div>
          </div>
          <div className="gg-pc-right"><span className="gg-pc-water">{p.number || ""}</span><OvrRing v={r.ovr} pot={r.pot} est={hidden && !r.exact} /></div>
        </header>
        <div className="gg-pc-tags">
          {devShown !== undefined && (devShown ? <span className={`gg-pc-tag dev-${devShown}`}>{DEV_TRAITS[devShown].name}</span> : <span className="gg-pc-tag"><DevChip dev={null} /></span>)}
          <span className="gg-pc-tag">{ARCHETYPES[p.type]?.name || p.type}</span>
          <AbilityChip p={p} full />
          {form && <span className={`gg-pc-tag form-${form.kind}`} title={`Playing ${form.f > 0 ? "well above" : "below"} his rating this season (${form.f > 0 ? "+" : ""}${form.f}).`}>{form.text}</span>}
          {p.rookie && <span className="gg-pc-tag rookie">Rookie</span>}
          {p.ratingData && <span className="gg-pc-tag ea">EA {String(p.ratingData.edition).replace(/^NHL\s*/, "NHL ")}</span>}
          {injury && <span className="gg-pc-tag inj" title={injury.when}>{p.injuryNote || "Injured"} · {injury.list ? `${injury.list} · ` : ""}{injury.text}</span>}
          {p.clause?.type && <span className="gg-pc-tag">{p.clause.type}</span>}
        </div>
        {(accolades.length > 0 || ranks.length > 0 || retired) && <div className="lg-acc">
          {retired && <span className="lg-chip retired">RETIRED{retired.hof || (league.hallOfFame || []).some((h) => h.pid === retired.pid) ? " · HALL OF FAME" : ""}</span>}
          {accolades.map((a) => <span key={a.k} className={`lg-chip k-${a.k}`} title={a.years.map((y) => `${y}-${String(y + 1).slice(2)}`).join(", ")}>{a.icon} {accoladeText(a)}</span>)}
          {ranks.map((r) => <span key={r.key} className="lg-chip rank" title={`${r.value.toLocaleString("en-US")} with the club`}>#{r.rank} in {r.club} {r.label.toLowerCase()}</span>)}
        </div>}
        {retired && <div className="gg-pc-tiles">
          <div><small>CAREER</small><b>{goalie ? `${totals.w} W` : `${totals.pts} PTS`}</b><span>{totals.gp} GP{goalie ? ` · ${totals.so} SO` : ` · ${totals.g} G · ${totals.a} A`}</span></div>
          <div><small>PEAK</small><b>{retired.peak}</b><span>best overall rating</span></div>
          <div><small>LEGACY</small><b>{retired.legacy ?? "—"}</b><span>{retired.pre ? `incl. ${retired.pre} from his pre-league career` : "Hall of Fame score"}</span></div>
        </div>}
        {!retired && <div className="gg-pc-tiles">
          <div><small>TRADE VALUE</small><b>{value == null ? "—" : value}</b><span>what clubs see</span></div>
          <div><small>WANTS</small><b className="want">{WANTS[prefs.priority][0]}</b><span>{WANTS[prefs.priority][1]}</span></div>
          <div><small>AGENT</small><b className="agent">{prefs.personality}</b><span>{AGENT[prefs.personality]}</span></div>
        </div>}
        <div className="gg-pc-cols">
          <div className="gg-pc-col">
            {shownGroups.map((g) => <section key={g} className="gg-pc-panel"><div className="gg-pc-k">{g}</div><Bars attrs={groups[g]} p={p} hide={hidden} /></section>)}
            <button className="link gg-pc-more" onClick={() => setAllAttrs((v) => !v)}>{allAttrs ? "Fewer skills ▴" : `All ${Object.values(groups).reduce((n, g) => n + Object.keys(g).length, 0)} skills ▾`}</button>
            {!retired && <PlayerContract p={p} hidden={hidden} />}
            <section className="gg-pc-panel"><div className="gg-pc-k draft">Draft pedigree</div><div className="gg-pc-big">{p.draft ? `${p.draft.year} · Round ${p.draft.round}, #${p.draft.pick}${league.teams[p.draft.tid] ? ` by ${league.teams[p.draft.tid].abbr}` : ""}` : p.src === "gen" ? "Undrafted" : "Pre-franchise"}</div></section>
            {p.combine && <section className="gg-pc-panel"><div className="gg-pc-k combine">Scouting combine{p.combine.grade ? ` · ${p.combine.grade}` : ""}</div><div className="gg-pc-combine">{COMBINE_TESTS.filter((t) => Number.isFinite(p.combine.tests?.[t.k])).map((t) => <div key={t.k}><small>{t.short.toUpperCase()}</small><b>{p.combine.tests[t.k].toFixed(t.dp)}{t.unit === "in" ? '"' : ""}</b><span>{t.unit !== "in" ? t.unit : ""}</span></div>)}</div></section>}
            <div className="dim small gg-pc-src">{p.ratingData ? `EA SPORTS NHL ${p.ratingData.edition}: ${p.ratingData.keys.length} published attributes; the rest are estimates.` : p.src === "ea27" ? "Official EA SPORTS NHL 27 overall; attributes are estimates." : "Generated player; attributes are gameplay estimates."}</div>
          </div>
          <div className="gg-pc-col">
            {!retired && <section className="gg-pc-panel"><div className="gg-pc-k season">{farmLine ? `${watch.level} (this season)` : `${league.year}-${String(league.year + 1).slice(2)} NHL`}</div>
              <div className="gg-pc-tilesm">{(farmLine ? (goalie ? [["GP", farmLine.gp], ["W", farmLine.w], ["SV%", farmLine.svpct == null ? "—" : pct(farmLine.svpct)]] : [["GP", farmLine.gp], ["G", farmLine.g], ["A", farmLine.a], ["PTS", farmLine.pts]]) : tiles(s)).map(([k, v]) => <div key={k}><small>{k}</small><b>{v}</b></div>)}</div>
              {!farmLine && ps.gp > 0 && <><div className="dim small" style={{ margin: "8px 0 4px" }}>Playoffs</div><div className="gg-pc-tilesm">{tiles(ps).map(([k, v]) => <div key={k}><small>{k}</small><b>{v}</b></div>)}</div></>}
            </section>}
            <section className="gg-pc-panel"><div className="gg-pc-k report">Scouting report</div>
              {hidden ? <div className="dim small">Scout him for a read on his game.</div> : <>
                {rep.plus.map((t, i) => <div key={"p" + i} className="gg-pc-line plus"><b>+</b> {t}</div>)}
                {rep.minus.map((t, i) => <div key={"m" + i} className="gg-pc-line minus"><b>−</b> {t}</div>)}
                {!rep.plus.length && !rep.minus.length && <div className="dim small">A balanced, unremarkable profile.</div>}
                {(p.bio?.lg || p.bio?.town) && <div className="gg-pc-note">{p.bio.town ? `From ${p.bio.town}. ` : ""}{p.bio.lg ? `Played ${p.bio.lg} hockey${p.bio.team ? ` for ${p.bio.team}` : ""}.` : ""}</div>}
              </>}
            </section>
            {!goalie && !hidden && <section className="gg-pc-panel"><div className="gg-pc-k report">Role fit</div>
              {bestRoles(p).map((x) => <div key={x.role} className="gg-pc-line"><b style={{ width: 28 }}>{x.fit}</b> {x.name}</div>)}
            </section>}
            {watch && !hidden && <section className="gg-pc-panel"><div className="gg-pc-k dev">Development</div>
              <div className="gg-pc-devgrid">
                <div><small>RATING</small><b style={{ color: watch.delta > 0 ? "#4ade80" : watch.delta < 0 ? "#f87171" : "#e2e8f0" }}>{watch.start} → {p.ovr}</b><span>{watch.delta > 0 ? "+" : ""}{watch.delta} since camp</span></div>
                <div><small>CEILING</small><b>{p.pot}</b><span>ETA {watch.eta}</span></div>
                <div className="spark"><Sparkline path={watch.path} width={140} height={36} color={watch.delta > 0 ? "#4ade80" : watch.delta < 0 ? "#f87171" : "#94a3b8"} /><span>{watch.prod === "dominant" ? "Dominating his level" : watch.prod === "solid" ? "Holding his own" : watch.prod === "struggling" ? "Struggling at this level" : "Early in the season"}{watch.next ? ` · ${watch.next.label}` : ""}</span></div>
              </div>
              {(p.farmHistory || []).length > 0 && <table className="gg-pc-table"><thead><tr><th>Year</th><th>League</th><th className="num">GP</th>{goalie ? <><th className="num">W</th><th className="num">SV%</th></> : <><th className="num">G</th><th className="num">A</th><th className="num">P</th></>}</tr></thead><tbody>{[...p.farmHistory].reverse().map((h, i) => <tr key={i}><td>{h.year}</td><td>{h.lg}</td><td className="num">{h.gp}</td>{goalie ? <><td className="num">{h.w}</td><td className="num">{h.sa ? pct((h.sa - h.ga) / h.sa) : "—"}</td></> : <><td className="num">{h.g}</td><td className="num">{h.a}</td><td className="num">{h.g + h.a}</td></>}</tr>)}</tbody></table>}
            </section>}
            {!watch && !hidden && <section className="gg-pc-panel"><div className="gg-pc-k dev">Development</div>
              <div className="gg-pc-devrow">
                <div><small>TRAIT</small><b>{DEV_TRAITS[p.dev]?.name || "—"}</b><span>{p.dev === "generational" ? "ages slowest" : p.dev === "superstar" ? "longer prime" : p.dev === "late" ? "surges at 22-25" : p.age <= 25 ? "still growing" : "set"}</span></div>
                <div><small>CEILING</small><b>{p.pot}</b><span>{p.pot > p.ovr ? `${p.pot - p.ovr} to go` : "at his ceiling"}</span></div>
                <div><small>PRIME</small><b>{p.age <= prime ? `to ${prime}` : "past it"}</b><span>{p.age > prime ? `since ${prime + 1}` : `${prime - p.age} yr${prime - p.age === 1 ? "" : "s"} left`}</span></div>
              </div>
              {(role || grew) && <div className="gg-pc-role">{role && <span>Role: <b>{ROLE_NAME[role.role]}</b>{role.pp >= 0.5 ? " · power play" : ""}{role.pk >= 0.5 ? " · penalty kill" : ""}</span>}{grew && <span className="grew" title="He played this role all last season and grew into it over the summer: its skills came along faster.">↗ grew into {ROLE_NAME[grew].toLowerCase()} role</span>}</div>}
              {summer && summer.notes.length > 0 && <div className="gg-pc-summer"><b>This summer:</b> {summer.from} → {summer.to} · {summer.notes.join(" · ")}</div>}
            </section>}
            <section className="gg-pc-panel"><div className="gg-pc-k season">Season by season {career.length > 3 && <button className="gg-pc-pill" onClick={() => setSeasons((v) => (v === "all" ? "recent" : "all"))}>{seasons === "all" ? `All ${career.length} seasons ▾` : "Last 3 ▾"}</button>}</div>
              {career.length ? <table className="gg-pc-table"><thead><tr><th>Year</th><th>TM</th><th className="num">GP</th>{goalie ? <><th className="num">W</th><th className="num">SV%</th><th className="num">GAA</th><th className="num">SO</th></> : <><th className="num">G</th><th className="num">A</th><th className="num">P</th><th className="num">+/-</th></>}</tr></thead><tbody>
                {shownCareer.map((c, i) => <tr key={i}><td>{c.y}</td><td className="dim">{c.t}</td><td className="num">{c.s.gp}</td>{goalie ? <><td className="num">{c.s.w}</td><td className="num">{pct(savePct(c.s))}</td><td className="num">{gaa(c.s).toFixed(2)}</td><td className="num">{c.s.so}</td></> : <><td className="num">{c.s.g}</td><td className="num">{c.s.a}</td><td className="num">{c.s.pts}</td><td className="num">{signed(c.s.pm)}</td></>}</tr>)}
                <tr className="career"><td>Career</td><td /><td className="num">{totals.gp}</td>{goalie ? <><td className="num">{totals.w}</td><td className="num">{totals.sa ? pct(totals.svpct) : "—"}</td><td className="num">{totals.gp ? (totals.ga / totals.gp).toFixed(2) : "—"}</td><td className="num">{totals.so}</td></> : <><td className="num">{totals.g}</td><td className="num">{totals.a}</td><td className="num">{totals.pts}</td><td className="num">{signed(totals.pm)}</td></>}</tr>
              </tbody></table> : <div className="dim small">His first season in this league is in progress.</div>}
              {totals.priorGames > 0 && <div className="dim small" style={{ marginTop: 6 }}>Plus about {totals.priorGames} NHL games before your league began (estimate).</div>}
              {milestones.length > 0 && <div className="gg-miles" style={{ marginTop: 8 }}>{milestones.map((m) => <span key={m.key + m.mark} className="gg-mile">{m.label}</span>)}</div>}
            </section>
            <section className="gg-pc-panel"><div className="gg-pc-k chart">Career OVR</div><CareerChart points={hidden ? [] : ratingPoints} /></section>
          </div>
        </div>
        {!retired && <div className="gg-pc-actions">
          {mine && !inMinors && <>
            <button disabled={!canSendDown(p)} onClick={() => { sendDown(league, team, p.id); commit(); closeModal(); }}>Send to minors</button>
            <button className="danger" disabled={!!(p.ltir || p.waiverPending || p.offerSheetPending)} onClick={async () => { if (await ask({ title: `Release ${p.name}?`, body: p.yrs > 0 && p.cap > 0 ? buyoutSummary(p, capYear(league)) : "He becomes a free agent.", yes: "Release", danger: true })) { releasePlayer(league, team, p.id); commit(); closeModal(); } }}>Release</button>
            <button onClick={() => proposeTradeFor(p.id, p.tid)}>Put in a trade</button>
          </>}
          {mine && inMinors && <button onClick={() => callUpFlow.start(p)}>Call up</button>}{callUpFlow.element}
          {!mine && p.tid >= 0 && <button className="primary" onClick={() => proposeTradeFor(p.id)}>Trade for {p.name.split(" ").slice(-1)[0]}</button>}
          {p.tid === -1 && <button className="primary" onClick={() => { closeModal(); go("freeagency"); }}>Go to free agency</button>}
          {team && <button className="ghost" onClick={() => openTeam(team.id)}>{team.abbr} roster</button>}
        </div>}
        <button className="gg-pc-close" onClick={closeModal}>Close</button>
      </div>
    </Modal>
  );
}
