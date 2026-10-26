import React from "react";
import { useGame, PlayerName, recordStr } from "./common.jsx";
import {
  prospectRead, csRank, classPool, userNeeds, userPickAround, scoutsShortlist, interviewProspect, privateWorkout, atCombine,
  SCOUT_GROUPS, SCOUT_ROLES, SCOUT_SLOTS, gradeClass, PRIVATE_WORKOUTS, scoutGroup, myList, onMyList, toggleMyList,
} from "../engine/scouting.js";
import { pickSlot } from "../engine/draft.js";
import { POS_COLOR } from "./TradePage.jsx";
import { REGIONS, regionOf, scoutAssignments, regionCoverage, assignWindowOpen } from "../engine/regions.js";
import { ScoutFlags, RoleTag } from "./scoutingBits.jsx";

const NEED_WORD = { C: "centre", LW: "left wing", RW: "right wing", LD: "left D", RD: "right D", G: "goalie" };
const Pos = ({ pos }) => <span className="gg-pos" style={{ background: POS_COLOR[pos] || "#64748b" }}>{pos}</span>;

// Your scouts' Combine visit list (Gridiron 2.67 / 2.68): who to interview and bring in for a
// private workout, around your picks, with the reason for each. compact: the top three.
export function VisitList({ compact = false }) {
  const { league, commit, toast } = useGame();
  const d = league.draft;
  const list = scoutsShortlist(league, { max: compact ? 3 : 8 });
  const { slots } = userPickAround(league);
  const live = atCombine(league);
  const act = (r) => { toast(r.msg, 5000); commit(); };
  const s = league.teams[league.userTid].scouts || {};
  const who = s.major?.name ? `${s.major.name} and your scouts` : "Your scouts";
  if (!slots.length) return <div className="dim small">You have no picks in this draft, so your scouts aren't lining up visits. Trade for a pick and they'll build a list.</div>;
  return (
    <div className="sc-visits">
      {!compact && <div className="dim small" style={{ marginBottom: 6 }}>{who} built this list around your picks ({slots.slice(0, 3).map((x) => `#${x}`).join(", ")}): players who should be there, at the positions you need, that they grade well, and anyone they want answers on before you spend a 1st or 2nd (a rough read, a red flag, a poor Combine). The top names go long before you pick: only worth a visit if you plan to trade up.</div>}
      {list.map(({ p, why, interview, workout }) => {
        const read = prospectRead(league, p);
        return (
          <div key={p.id} className="sc-visit-row">
            <Pos pos={p.pos} />
            <div className="sc-visit-who">
              <b><PlayerName p={p} /> <RoleTag p={p} /> <ScoutFlags read={read} compact /> <span className="dim small">{p.bio?.team || ""}</span></b>
              <span>{why.join(" · ")}</span>
            </div>
            <div className="sc-visit-act">
              {workout && <button className="small" disabled={!live || !(d?.workoutsLeft > 0)} title="A free full workup: exact ratings and (from a major scout) his development trait" onClick={() => act(privateWorkout(league, p.id))}>Workout</button>}
              {interview && <button className="small" disabled={!live || !(d?.interviewsLeft > 0)} title="Work ethic, and any red flags in the room" onClick={() => act(interviewProspect(league, p.id))}>Interview</button>}
            </div>
          </div>
        );
      })}
      {!list.length && <div className="dim small">Everyone your scouts flagged around your picks has been interviewed and worked out.</div>}
    </div>
  );
}

// Combine week (Gridiron 2.3): what you have left to use before you leave, and who moved.
// Stock up: tested like a higher pick. Stock down: early names who tested poorly.
export function CombineWeek() {
  const { league } = useGame();
  const d = league.draft || {};
  const t = league.teams[league.userTid];
  const tested = classPool(league).filter((p) => p.combine);
  const up = tested.filter((p) => p.combine.pct >= 0.75 && csRank(p) > 32).sort((a, b) => b.combine.pct - a.combine.pct || csRank(a) - csRank(b)).slice(0, 4);
  const down = tested.filter((p) => p.combine.pct < 0.3 && (p.cs?.now ?? p.cs?.mid ?? 999) <= 64).sort((a, b) => (csRank(b) - (b.cs.now ?? b.cs.mid)) - (csRank(a) - (a.cs.now ?? a.cs.mid))).slice(0, 4);
  const Mover = ({ p }) => {
    const pre = p.cs?.now ?? p.cs?.mid;
    return <div className="sc-mover"><Pos pos={p.pos} /><PlayerName p={p} /><span className="dim small">{pre && pre !== csRank(p) ? `#${pre} → #${csRank(p)}` : `#${csRank(p)}`}</span><span className={`grade sm ${gradeClass(p.combine.grade)}`}>{p.combine.grade}</span></div>;
  };
  return (
    <div className="stack">
      <div className="panel sc-cweek">
        <h3>Combine week · use these before you leave</h3>
        <div className="sc-cweek-grid">
          <div><b>{d.interviewsLeft || 0}</b><span>Interviews</span><small>A sit-down: his work ethic, which tends to go with how fast he develops, and any red flags in the room.</small></div>
          <div><b>{d.workoutsLeft || 0}</b><span>Private workouts</span><small>A full workup for free: exact ratings and (from a major scout) his development trait. {PRIVATE_WORKOUTS} a year.</small></div>
        </div>
      </div>
      <div className="sc-movers">
        <div className="panel"><h3 className="good">Stock up · tested like a higher pick</h3>{up.map((p) => <Mover key={p.id} p={p} />)}{!up.length && <div className="dim small">Nobody from the back of the list blew up the Combine.</div>}</div>
        <div className="panel"><h3 className="bad">Stock down · early names who tested poorly</h3>{down.length > 0 && <div className="dim small" style={{ marginBottom: 4 }}>A real concern or a bad day? An interview or private workout tells you, but only spend one if he could fall to you.</div>}{down.map((p) => <Mover key={p.id} p={p} />)}{!down.length && <div className="dim small">The early names all held up.</div>}</div>
      </div>
    </div>
  );
}

// Scouting HQ (Gridiron 3.71's Scouting HQ): your picks if the season ended today, each with the
// slice of the board it can reach; "Scout these next" (prospects in range of your picks, needs
// first); where the talent is this year, region by region; your scouts and their regions.
// Scouting is hands-off (regions.js), so the row's quiet action is your list, not a spend.
export const pickWindow = (pick) => [Math.max(1, Math.round(pick - Math.max(4, pick * 0.25))), Math.round(pick + Math.max(10, pick * 0.45))];
const SHORT = { OHL: "OHL", WHL: "WHL", QMJHL: "QMJHL", USA: "USHL", NCAA: "NCAA", Sweden: "SWE", Liiga: "FIN", Russia: "RUS", Europe: "C. EUR" };
const GROUP_SHORT = { C: "C", W: "W", D: "D", G: "G" };
const GROUP_WORD = { C: "Centres", W: "Wingers", D: "Defence", G: "Goalies" };
export const scoutStars = (ev) => (ev >= 88 ? 5 : ev >= 80 ? 4 : ev >= 72 ? 3 : ev >= 64 ? 2 : 1);
export function Stars({ ev }) {
  const n = scoutStars(ev);
  return <span className="hq-stars" title={`Evaluation ${ev}`} aria-label={`${n} of 5 stars`}>{"★".repeat(n)}<i>{"★".repeat(5 - n)}</i></span>;
}

// The picks strip: "If the season ended today  Oilers 12-5-2  R1 #24 #18–35 ...".
export function PickStrip({ compact = false }) {
  const { league } = useGame();
  const t = league.teams[league.userTid];
  const year = league.phase === "draft" && league.draft ? league.draft.year : league.draftClassYear;
  const d = league.draft;
  const live = d?.year === year && Array.isArray(d.slots);
  const picks = live
    ? d.slots.filter((x) => x.owner === t.id && !x.pid).map((x) => ({ key: `s${x.overall}`, round: x.round, orig: x.orig, overall: x.overall }))
    : league.draftPicks.filter((pk) => pk.year === year && pk.owner === t.id).map((pk) => ({ key: pk.id, round: pk.round, orig: pk.orig, overall: pickSlot(league, pk)?.overall ?? null }));
  picks.sort((x, y) => (x.overall ?? x.round * 100) - (y.overall ?? y.round * 100));
  const rec = t.rec ? recordStr(t.rec) : "";
  const label = live ? "Your picks" : ["regular", "playoffs"].includes(league.phase) ? "If the season ended today" : "Your picks in this draft";
  return (
    <div className={`hq-strip${compact ? " compact" : ""}`}>
      <span className="hq-strip-h"><b>{label}</b>{rec && !live && <span>{t.name} {rec}{league.phase === "preseason" ? " · last season's order" : ""}</span>}</span>
      {picks.length ? <span className="hq-strip-picks">
        {picks.map((x, i) => { const via = x.orig !== t.id ? league.teams[x.orig]?.abbr : null; const w = x.overall ? pickWindow(x.overall) : null; return (
          <span key={x.key} className={`hq-pk${i === 0 ? " first" : ""}`} title={`Round ${x.round}${via ? ` (from ${via})` : ""}${w ? `: scout prospects ranked #${w[0]}–${w[1]}` : ": the order is set after the season"}`}>
            <small>R{x.round}{via ? ` ${via}` : ""}</small><b>{x.overall ? `#${x.overall}` : "TBD"}</b>{w && !compact && <em>#{w[0]}–{w[1]}</em>}
          </span>); })}
      </span> : <span className="muted">You have no picks in this draft.</span>}
    </div>
  );
}

// Each region's strength and weakness this year: the position group it has the most and the
// fewest of among the top 96, against the class as a whole.
export function talentMap(pool) {
  const top = pool.filter((p) => csRank(p) <= 96);
  const share = {};
  for (const p of top) share[scoutGroup(p.pos)] = (share[scoutGroup(p.pos)] || 0) + 1 / Math.max(1, top.length);
  return Object.fromEntries(Object.keys(REGIONS).map((k) => {
    const mine = top.filter((p) => regionOf(p) === k);
    const r1 = mine.filter((p) => csRank(p) <= 32).length;
    if (mine.length < 4) return [k, { n: mine.length, r1, strong: null, weak: null }];
    const by = Object.keys(GROUP_WORD).map((g) => ({ g, v: mine.filter((p) => scoutGroup(p.pos) === g).length / mine.length / Math.max(0.02, share[g] || 0) }));
    by.sort((x, y) => y.v - x.v);
    return [k, { n: mine.length, r1, strong: by[0].v > 1.15 ? by[0].g : null, weak: by[by.length - 1].v < 0.85 ? by[by.length - 1].g : null }];
  }));
}

export default function ScoutingHQ({ onBoard, onRegions, onList, onScouts }) {
  const { league, commit, openPlayer } = useGame();
  const t = league.teams[league.userTid];
  const cls = classPool(league);
  if (!cls.length) return null;
  const needs = userNeeds(league, 3);
  const { slots } = userPickAround(league);
  // The slices of the board your first three picks can reach (before an order: the middle of round 1).
  const wins = (slots.length ? slots.slice(0, 3) : [16]).map(pickWindow);
  const inRange = (p) => wins.some(([lo, hi]) => csRank(p) >= lo && csRank(p) <= hi);
  const isNeed = (p) => needs.includes(p.pos);
  const pool = cls.filter(inRange).map((p) => ({ p, read: prospectRead(league, p) })).filter((x) => x.read.lvl < 2);
  const targets = pool.sort((a, b) => (isNeed(b.p) - isNeed(a.p)) || csRank(a.p) - csRank(b.p)).slice(0, 8);
  const assign = scoutAssignments(league, t);
  const s = t.scouts || {};
  const map = talentMap(cls);
  const cov = regionCoverage(league, t);
  const onIt = (k) => SCOUT_SLOTS.filter((r) => s[r] && assign[r].includes(k));
  const prompt = league.phase === "preseason" && assignWindowOpen(league);
  return (
    <div className="hq2">
      <PickStrip />
      {prompt && (
        <button type="button" className="hq-prompt" onClick={onRegions}>
          <span><b>Send your scouts out</b><small>{cov.n < cov.of ? `They cover ${cov.n} of ${cov.of} regions. ` : ""}Pick their regions before the season starts; they stay put once it does.</small></span>
          <span aria-hidden="true" className="hq-chev">›</span>
        </button>
      )}
      <div className="hq-grid">
        <section className="hq-card">
          <div className="hq-h"><b>Scout these next</b><span className="hq-sub">in range of your picks{needs.length ? ` · needs: ${needs.join(", ")}` : ""}</span></div>
          {atCombine(league) && <div className="hq-visits"><b>Combine visits</b><VisitList compact /></div>}
          {targets.map(({ p, read }) => {
            const listed = onMyList(league, p.id);
            const who = read.scout ? `${read.scout.name.split(" ").at(-1)}'s region` : "No scout here";
            return (
              <div key={p.id} className="hq-row">
                <span className="hq-rk">#{csRank(p)}</span>
                <Pos pos={p.pos} />
                <button type="button" className="hq-who" onClick={() => openPlayer(p.id)}>
                  <b>{p.name}{isNeed(p) && <em>need</em>} <ScoutFlags read={read} compact /></b>
                  <span>{p.bio?.team || "Junior"} · {p.bio?.lg || "?"} · {read.lvl === 1 ? `reported ${read.pot}` : read.grade ? `your read ${read.grade}` : "no read yet"}</span>
                </button>
                <span className={`hq-cov${read.scout ? "" : " none"}`}>{who}</span>
                <button type="button" className={`hq-act${listed ? " on" : ""}`} aria-pressed={listed} onClick={() => { toggleMyList(league, p.id); commit(); }}>{listed ? "On your list" : "Add to list"}</button>
              </div>
            );
          })}
          {!targets.length && <div className="hq-empty">Everyone in range of your picks has a full workup. Check the Big Board for more.</div>}
          <div className="hq-links"><button type="button" className="hq-q" onClick={onBoard}>Big Board →</button><button type="button" className="hq-q" onClick={onList}>Your list ({myList(league).ids.length}) →</button></div>
        </section>
        <div className="hq-side">
          <section className="hq-card">
            <div className="hq-h"><b>Where the talent is</b><button type="button" className="hq-q" onClick={onRegions}>Regions →</button></div>
            {Object.entries(REGIONS).map(([k, r]) => { const m = map[k]; const on = onIt(k); return (
              <button type="button" key={k} className="hq-reg" onClick={onRegions}>
                <b>{r.name}</b>
                <span className="up">{m.strong ? `▲ ${GROUP_WORD[m.strong]}` : ""}</span>
                <span className="down">{m.weak ? `▼ ${GROUP_WORD[m.weak]}` : m.n < 4 ? <i>small</i> : ""}</span>
                <span className={`hq-rcov${on.length ? "" : " none"}`}>{on.length ? on.map((x) => s[x].name.split(" ").at(-1)).join(" · ") : "no scout"}</span>
              </button>); })}
          </section>
          <section className="hq-card">
            <div className="hq-h"><b>Your scouts</b><span className="hq-sub">{cov.n} of {cov.of} regions</span><button type="button" className="hq-q" onClick={onScouts}>Manage →</button></div>
            {SCOUT_SLOTS.map((r) => { const sc = s[r]; return (
              <div key={r} className="hq-scout">
                <small className={r.startsWith("major") ? "maj" : "min"}>{SCOUT_ROLES[r].short}</small>
                {sc ? <><b>{sc.name}</b><Stars ev={sc.eval} /><span className="grp" title={`${SCOUT_GROUPS[sc.group]} specialist`}>{GROUP_SHORT[sc.group]}</span><span className="regs">{assign[r].map((k) => SHORT[k] || k).join(" · ")}</span></> : <span className="muted">Vacant</span>}
              </div>); })}
          </section>
        </div>
      </div>
    </div>
  );
}
