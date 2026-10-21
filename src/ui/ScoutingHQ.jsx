import React from "react";
import { useGame, PlayerName } from "./common.jsx";
import {
  prospectRead, scoutProspect, csRank, classPool, userNeeds, userPickAround, scoutsShortlist, interviewProspect, privateWorkout, atCombine,
  crewStrength, SCOUT_GROUPS, SCOUT_ROLES, SCOUT_SLOTS, SCOUT_PTS_CAP, scoutPointsLost, gradeClass, PRIVATE_WORKOUTS,
} from "../engine/scouting.js";
import { POS_COLOR } from "./TradePage.jsx";
import { AREA_START, TRIP_COST, MAX_TRIPS, REGIONS, regionOf, scoutRegion } from "../engine/regions.js";
import { ScoutButton, ScoutFlags, RoleTag } from "./scoutingBits.jsx";

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
              {workout && <button className="small" disabled={!live || !(d?.workoutsLeft > 0)} title="A free full workup: exact ratings and (from a major scout) his development trait" onClick={() => act(privateWorkout(league, p.id))}>🏋️ Workout</button>}
              {interview && <button className="small" disabled={!live || !(d?.interviewsLeft > 0)} title="Work ethic, and any red flags in the room" onClick={() => act(interviewProspect(league, p.id))}>🎤 Interview</button>}
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
          <div><b>🎤 {d.interviewsLeft || 0}</b><span>Interviews</span><small>A sit-down: his work ethic, which tends to go with how fast he develops, and any red flags in the room.</small></div>
          <div><b>🏋️ {d.workoutsLeft || 0}</b><span>Private workouts</span><small>A full workup for free: exact ratings and (from a major scout) his development trait. {PRIVATE_WORKOUTS} a year.</small></div>
          <div><b>🔎 {t.scoutPts || 0}</b><span>Scouting points</span><small>Reports and workups, same as always. Unused points expire after the draft.</small></div>
        </div>
      </div>
      <div className="sc-movers">
        <div className="panel"><h3 className="good">📈 Stock up · tested like a higher pick</h3>{up.map((p) => <Mover key={p.id} p={p} />)}{!up.length && <div className="dim small">Nobody from the back of the list blew up the Combine.</div>}</div>
        <div className="panel"><h3 className="bad">📉 Stock down · early names who tested poorly</h3>{down.length > 0 && <div className="dim small" style={{ marginBottom: 4 }}>A real concern or a bad day? An interview or private workout tells you, but only spend one if he could fall to you.</div>}{down.map((p) => <Mover key={p.id} p={p} />)}{!down.length && <div className="dim small">The early names all held up.</div>}</div>
      </div>
    </div>
  );
}

// Scouting HQ (Gridiron 2.3): what to do next, with a button for each. Your thinnest positions,
// where you pick (the one projected draft order), an area trip worth taking, the unscouted
// prospects at your needs around your pick, your staff and its crews.
export default function ScoutingHQ({ onBoard, onRegions, onList }) {
  const { league, commit, toast, openPlayer } = useGame();
  const t = league.teams[league.userTid];
  const pts = t.scoutPts || 0;
  const area = t.area?.year === league.draftClassYear ? t.area : null;
  const areaPts = area ? area.points : AREA_START;
  const cls = classPool(league);
  if (!cls.length) return null;
  const needs = userNeeds(league, 3);
  const { slot, own } = userPickAround(league);
  // Before the order exists (no games yet), your scouts work the middle of the first round.
  const around = slot ?? 16;
  const inRange = (p) => csRank(p) >= around - 10 && csRank(p) <= around + 24;
  const targets = cls.filter((p) => needs.includes(p.pos) && inRange(p)).map((p) => ({ p, read: prospectRead(league, p) })).filter((x) => x.read.cost).sort((a, b) => csRank(a.p) - csRank(b.p)).slice(0, 6);
  const closed = ["resign", "freeagency"].includes(league.phase) || (league.phase === "draft" && league.draft?.stage !== "combine");
  const regionPick = Object.keys(REGIONS).map((k) => ({ k, n: cls.filter((p) => regionOf(p) === k && csRank(p) <= 64).length, trips: area?.trips?.[k] || 0 })).filter((r) => r.trips < MAX_TRIPS && r.n > 0).sort((a, b) => b.n - a.n || a.trips - b.trips)[0];
  const lost = scoutPointsLost(league);
  const crews = crewStrength(league).filter((c) => c.n >= 2);
  const send = (k) => { const r = scoutRegion(league, k); toast(r.msg); commit(); };
  const s = t.scouts || {};
  return (
    <section className="gg-card gg-hq sc-hq">
      <div className="gg-k">DO THIS NEXT <span className="right dim" style={{ letterSpacing: 0, textTransform: "none" }}>your biggest needs: {needs.length ? needs.map((k) => NEED_WORD[k]).join(", ") : "none pressing"} · {slot == null ? "the draft order takes shape once games are played (your scouts start around #16)" : own ? `your first pick lands around #${slot}` : `you've traded your picks; your record says #${slot}`}</span></div>
      {(pts >= SCOUT_PTS_CAP - 1 || lost > 0) && league.phase === "regular" && <div className="sc-cap">⚠ Your scouts carry at most <b>{SCOUT_PTS_CAP}</b> points of unfiled work; past that, each week's point is lost.{lost > 0 ? <> You've lost <b>{lost}</b> this year.</> : " You're at the cap: spend some now."}</div>}
      {!closed && regionPick && areaPts >= TRIP_COST && <div className="gg-hq-row"><span className="gg-hq-ico">🗺️</span><div><b>Send your area scouts to the {REGIONS[regionPick.k].name}</b><span>{regionPick.n} of Central Scouting's top 64 play there. A trip reads every prospect in the region at once; from the third trip they start seeing through the list to its sleepers and red flags.</span></div><button className="primary small" onClick={() => send(regionPick.k)}>Send ({TRIP_COST} pts)</button></div>}
      {atCombine(league) && <div className="gg-hq-row sc-hq-visit"><span className="gg-hq-ico">🗂️</span><div><b>Your scouts' visit list <span className="dim small">interview and work out players who'll be there when you pick</span></b><VisitList compact /></div></div>}
      {targets.map(({ p, read }) => (
        <div key={p.id} className="gg-hq-row">
          <Pos pos={p.pos} />
          <div>
            <b><button className="link" onClick={() => openPlayer(p.id)}>{p.name}</button> <span className="dim">#{csRank(p)} on Central Scouting's list · {p.bio?.team || "junior"} ({p.bio?.lg || "?"})</span> <RoleTag p={p} /> <ScoutFlags read={read} compact /></b>
            <span>{read.lvl === 0 ? `No report yet. A ${NEED_WORD[p.pos]} in your range.` : "Reported. A workup would sharpen it."}</span>
          </div>
          <ScoutButton p={p} read={read} className="small primary" />
        </div>
      ))}
      {!targets.length && <div className="dim small" style={{ padding: "6px 0" }}>Every prospect at your need positions in your range has been scouted. Check the Big Board for more, or build Your list.</div>}
      <div className="row" style={{ gap: 6, marginTop: 8 }}><button className="small" onClick={onBoard}>Big Board →</button><button className="small" onClick={onList}>Your list →</button><button className="small" onClick={onRegions}>All regions →</button></div>
      <div className="sc-hq-staff">
        <div className="gg-k" style={{ marginTop: 12 }}>YOUR SCOUTING STAFF {crews.length > 0 && <span className="dim" style={{ letterSpacing: 0, textTransform: "none" }}>· {crews.map((c) => `${c.n} scouts on ${SCOUT_GROUPS[c.group].toLowerCase()}`).join(", ")}</span>}</div>
        <div className="sc-hq-scouts">
          {SCOUT_SLOTS.map((r) => { const sc = s[r]; return (
            <div key={r} className={`sc-hq-scout${sc ? "" : " empty"}`}>
              <small className={r.startsWith("major") ? "maj" : "min"}>{SCOUT_ROLES[r].name.toUpperCase()}</small>
              {sc ? <><b>{sc.name}</b><span>{SCOUT_GROUPS[sc.group]} · evaluation <b>{sc.eval}</b></span></> : <span className="dim">Vacant</span>}
            </div>); })}
        </div>
      </div>
      <div className="gg-guide gg-guide-3">
        <div><b>1. Area trips</b><span>Area points. A rough read on every prospect in a region; more trips sharpen it, turn up sleepers (💎) and red flags (🚩), and after four you get a ~OVR on everyone there.</span></div>
        <div><b>2. Scouting reports</b><span>1 scouting point per prospect: close estimates, tool grades, an NHL comparison, and whether he's a hidden gem or a red flag. Best in your scouts' position groups.</span></div>
        <div><b>3. Full workups</b><span>2 more points: exact ratings, and from a major scout his development trait. Two or more scouts on one group form a crew: sharper reads and early hunches.</span></div>
      </div>
    </section>
  );
}
