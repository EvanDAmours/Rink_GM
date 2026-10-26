// Development: its own section, three calm views (Overview · Season plan · Prospects) under the
// section hero (its tabs pick the view). One question per screen, answered in one big sentence; lists, not
// dashboards; the detail one tap away in a sheet. The engine is developmentPlan.js.
import React, { useMemo, useState } from "react";
import { useGame, Dialog, DBtn } from "./common.jsx";
import { useCallUp } from "./CallUpFlow.jsx";
import { usePhone } from "./mobile.js";
import { isGoalie, isDefense } from "../engine/constants.js";
import { gameLines } from "../engine/lines.js";
import {
  ensureDevPlan, headline, worthKnowing, nextSummer, focusCandidates, focusExpected, focusChance, weeksLeft, campCovered,
  CAMP_PRIORITY, LEVELS, ROLES, placeText, statusWord, placementOptions, setPlacement, setFocus, setCampPriority, lockPlan,
  unlockPlan, planOpen, readyFor, placementSummer, gamble, signed, traitName, projectSummer, FOCUS_WEEKS, ROLL_WEEK,
} from "../engine/developmentPlan.js";
import "./dev.css";

const VIEWS = [["overview", "Overview"], ["plan", "Season plan"], ["prospects", "Prospects"]];
const OLD = { development: "overview", pipeline: "prospects" };
export const devView = (sub) => (VIEWS.some(([k]) => k === sub) ? sub : OLD[sub] || "overview");
const last = (n) => String(n || "").split(" ").slice(-1)[0];
const one = (v) => (v > 0 ? `+${v.toFixed(1)}` : v < 0 ? `−${Math.abs(v).toFixed(1)}` : "±0");
const toneOf = (v) => (v >= 0.5 ? "up" : v <= -0.5 ? "down" : "");

export default function DevelopmentHub({ sub, onSub }) {
  const { league } = useGame();
  ensureDevPlan(league);
  const cur = devView(sub);
  return (
    <div className="dvx">
      {cur === "plan" ? <SeasonPlan onSub={onSub} /> : cur === "prospects" ? <Prospects onSub={onSub} /> : <Overview onSub={onSub} />}
    </div>
  );
}

// The big sentence: "Your team is up +11 since camp."
export function Headline({ league, t, compact }) {
  const h = headline(league, t);
  const num = h.n == null ? null : <span className={h.n > 0 ? "up" : h.n < 0 ? "down" : ""}>{signed(h.n)}</span>;
  const done = !["preseason", "regular"].includes(league.phase);
  if (h.since === "camp") return h.n === 0 ? <>Your team is level since camp.</> : <>Your team {done ? "finished" : "is"} {h.n > 0 ? "up" : "down"} {num} since camp.</>;
  if (h.since === "summer") return h.n === 0 ? <>Your team is level since last season.</> : <>Your team is {h.n > 0 ? "up" : "down"} {num} since last season.</>;
  return compact ? <>Plan your season.</> : <>Your season starts here.</>;
}
function headSub(league, t) {
  const h = headline(league, t), plan = t.devPlan;
  if (h.since === "camp") {
    const f = league.players[plan.focus];
    const pl = (n) => `${n} player${n === 1 ? " has" : "s have"}`;
    const wk = Math.min(FOCUS_WEEKS, Math.floor(league.day / 7));
    const track = !f || f.tid !== t.id ? "Your focus player has moved on." : (plan.gained || 0) >= focusChance(f) * wk * 0.5 ? "The plan is on track." : `${last(f.name)} hasn't moved yet. There's time.`;
    if (league.phase !== "regular") return `${pl(h.up)} improved this season.${plan.gained ? ` Your focus player gained ${signed(plan.gained)}.` : ""}`;
    return `${h.up ? pl(h.up) : "Nobody has"} improved. ${track}`;
  }
  if (h.since === "summer") return `${h.up} improved over the summer${h.down ? `, ${h.down} slipped` : ""}. ${t.devPlan?.locked ? "Your plan is locked in." : "Your plan is next."}`;
  return "Set the plan, then watch them grow.";
}

// Who he is at a glance: position, overall, and where he was drafted.
export const draftText = (p) => p?.draft?.year ? `Drafted ${p.draft.year}${p.draft.round ? ` · R${p.draft.round} #${p.draft.pick}` : ""}` : p?.draft === false || p?.undrafted ? "Undrafted" : "";
// One player row (Gridiron's format): name with "age · POS" inline, one short status line,
// then the big overall, a coloured change and a chevron.
const SIGNED = /^[+\-−±]/;
export const dlt = (v) => { if (v == null || Number.isNaN(v)) return null; const r = Math.round(v * 10) / 10; return r > 0 ? `+${r}` : r < 0 ? `−${Math.abs(r)}` : "0"; };
const toneD = (d) => (!d ? "" : d[0] === "+" ? "up" : d[0] === "−" || d[0] === "-" ? "down" : "");
export function Who({ p }) { return p ? <small className="dv-ap">{p.age} · {p.pos}</small> : null; }
function Row({ p, name, status, delta, tone, onClick, chev = true }) {
  return (
    <button type="button" className="dv-li" onClick={onClick}>
      <span className="dv-tx"><span className="dv-nm"><b>{name || p?.name}</b><Who p={p} /></span>{status && <span className="dv-st">{status}</span>}</span>
      {p && <span className="dv-ovr">{p.ovr}</span>}
      <span className={`dv-d ${tone ?? toneD(delta)}`}>{delta}</span>
      {chev && <span className="dv-chev" aria-hidden="true">›</span>}
    </button>
  );
}
// Worth-knowing rows: the engine's short tag; its number when it's a change, else his projected summer.
function KnowRow({ league, r, proj, onClick }) {
  const p = league.players[r.pid];
  const d = SIGNED.test(r.num || "") ? r.num : dlt(proj.get(r.pid));
  return <Row p={p} name={r.name} status={r.tag || r.why} delta={d} tone={SIGNED.test(r.num || "") ? r.tone : undefined} onClick={onClick} />;
}
const projMap = (ns) => new Map([...ns.grow, ...ns.peak, ...ns.decline].map((x) => [x.p.id, x.v]));
const ORD = ["Top", "Second", "Third", "Fourth"];
// Where he plays: "Top six", "Third pair", "Starter", "AHL · top role".
function roleWords(league, t) {
  const m = new Map();
  try {
    const L = gameLines(league, t);
    L.F.forEach((line, i) => line.forEach((id) => id && m.set(id, i < 2 ? "Top six" : "Bottom six")));
    L.D.forEach((pair, i) => pair.forEach((id) => id && m.set(id, `${ORD[i] || "Third"} pair`)));
    L.G.forEach((id, i) => id && !m.has(id) && m.set(id, i === 0 ? "Starter" : "Backup"));
  } catch { /* lines not set */ }
  return (p) => {
    if (t.prospects.includes(p.id)) { const pl = p.placement?.year === league.year ? p.placement : null; return pl ? placeText(pl.level, pl.role) : LEVELS[p.assignment]?.name || "AHL"; }
    return m.get(p.id) || (p.injury > 0 ? "Injured" : isGoalie(p.pos) ? "Third goalie" : isDefense(p.pos) ? "Extra defenceman" : "Extra forward");
  };
}

// ---------- Overview ----------
function Overview({ onSub }) {
  const { league, openPlayer } = useGame();
  const t = league.teams[league.userTid];
  const [grp, setGrp] = useState("grow");
  const [all, setAll] = useState(false);
  const know = worthKnowing(league, t);
  const ns = useMemo(() => nextSummer(league, t), [league, t, league.day, league.phase, t.devPlan?.camp]); // eslint-disable-line react-hooks/exhaustive-deps
  const proj = projMap(ns);
  const role = roleWords(league, t);
  const rows = ns[grp];
  const shown = all ? rows : rows.slice(0, 5);
  const word = { grow: "growing", peak: "at their peak", decline: "declining" }[grp];
  const plan = t.devPlan;
  const inSeason = league.phase !== "preseason";
  const f = league.players[plan.focus];
  return (
    <>
      <h1 className="dv-hs"><Headline league={league} t={t} /></h1>
      <div className="dv-hsub">{headSub(league, t)}</div>
      <div className="dv-two">
        <div>
          <div className="dv-segw"><span className="dv-lbl">{league.phase === "preseason" ? "Worth knowing this preseason" : league.phase === "regular" ? "Worth knowing this month" : "Worth knowing"}</span></div>
          <div className="dv-list">
            {know.length ? know.map((r) => <KnowRow key={r.pid} league={league} r={r} proj={proj} onClick={() => openPlayer(r.pid)} />) : <div className="dv-empty">Nothing stands out yet. Check back after a few weeks.</div>}
          </div>
          {inSeason && (
            <button type="button" className="dv-planline" onClick={() => onSub("plan")}>
              <span className="dv-k">Your plan</span>
              <b>{f ? last(f.name) : "No focus player"} · {CAMP_PRIORITY[plan.camp]?.name} camp · {t.prospects.length} prospect{t.prospects.length === 1 ? "" : "s"}</b>
              <span className="dv-chev" aria-hidden="true">›</span>
            </button>
          )}
        </div>
        <div>
          <div className="dv-segw">
            <span className="dv-lbl">Next summer</span>
            <div className="dv-seg" role="tablist" aria-label="Next summer">
              {[["grow", "Growing"], ["peak", "Peak"], ["decline", "Declining"]].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={grp === k} className={grp === k ? "on" : ""} onClick={() => { setGrp(k); setAll(false); }}>{l}</button>)}
            </div>
          </div>
          <div className="dv-list">
            {shown.length ? shown.map((r) => <Row key={r.p.id} p={r.p} status={r.p.id === plan.focus ? `Focus player · ${role(r.p)}` : role(r.p)} delta={dlt(r.v)} onClick={() => openPlayer(r.p.id)} />)
              : <div className="dv-empty">Nobody {word} next summer.</div>}
          </div>
          {rows.length > 5 && <button type="button" className="dv-qlink" onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `All ${rows.length} ${word} →`}</button>}
        </div>
      </div>
    </>
  );
}

// ---------- Season plan ----------
function SeasonPlan({ onSub }) {
  const { league, commit, toast } = useGame();
  const t = league.teams[league.userTid];
  const plan = ensureDevPlan(league);
  const phone = usePhone();
  const [sheet, setSheet] = useState(null);
  const open = planOpen(league, t);
  const pre = league.phase === "preseason";
  const f = league.players[plan.focus];
  const left = weeksLeft(league);
  const focusSub = !f ? "Nobody yet" : pre ? "Extra coaching every week" : league.phase === "regular" ? `${signed(plan.gained || 0)} so far · extra coaching every week` : "Extra coaching all season";
  const focusD = !f ? null : pre ? dlt(focusExpected(f)) : league.phase === "regular" ? dlt((plan.gained || 0) + focusExpected(f, left)) : dlt(plan.gained || 0);
  const camp = CAMP_PRIORITY[plan.camp];
  const covered = campCovered(league, plan.camp, t).length;
  const pros = t.prospects.map((id) => league.players[id]).filter((p) => p?.placement?.year === league.year);
  const risky = pros.filter((p) => statusWord(p.placement) !== "Safe");
  const biggest = [...risky].sort((a, b) => b.placement.st - a.placement.st)[0];
  const thriving = pros.filter((p) => p.placement.outcome === "thrive").length;
  const rolled = pros.some((p) => p.placement.outcome);
  const steps = [
    ["Focus player", f ? <>{f.name}<Who p={f} /></> : "Choose a player", focusSub, open && "Change", () => setSheet("focus"), f && <span className="dv-big"><span className="dv-ovr">{f.ovr}</span><span className={`dv-d ${toneD(focusD)}`}>{focusD}</span></span>],
    ["Camp priority", camp?.name || "Youth", `${one(camp?.bonus || 0)} next summer for ${covered} player${covered === 1 ? "" : "s"}`, open && "Change", () => setSheet("camp")],
    ["Prospects", pros.length ? (rolled ? `${pros.length} placed · ${thriving} thriving` : `${pros.length} placed · ${risky.length} risky`) : "No prospects", pros.length ? (rolled ? "Placements are set for the season." : biggest ? `${last(biggest.name)} is the biggest jump` : "Every placement is a safe one") : "Your system is empty.", pros.length ? (open ? "Review" : "View") : null, () => onSub("prospects")],
  ];
  const head = pre ? (plan.locked ? ["Your plan is locked in.", "It starts with the season. Unlock it to change anything."] : ["Plan your season.", "Three choices. They lock when the season starts."])
    : league.phase === "regular" ? [`Your plan for ${league.year}-${String(league.year + 1).slice(2)}.`, "Set for the season. It works every week."]
      : ["Last season's plan.", "Next season's plan opens in the preseason."];
  const act = (r) => { toast(r.msg); commit(); };
  return (
    <div className="dv-planpg">
      <div className="dv-top3"><h1 className="dv-hs">{head[0]}</h1><div className="dv-hsub">{head[1]}</div></div>
      <div className="dv-wrap">
        {steps.map(([k, v, s, btn, onClick, big], i) => (
          <div key={k} className="dv-stp">
            {!phone && <span className="dv-no2">{i + 1}</span>}
            <div className="dv-tx"><small>{k}</small><b>{v}</b><span>{s}</span></div>
            {big}
            {btn && <button type="button" className="dv-ch" onClick={onClick}>{btn}</button>}
          </div>
        ))}
        {pre && <div className="dv-lockb">{plan.locked ? <button type="button" className="dv-btn quiet" onClick={() => act(unlockPlan(league))}>Unlock the plan</button> : <button type="button" className="dv-btn primary" onClick={() => act(lockPlan(league))}>Lock in the plan</button>}</div>}
      </div>
      {sheet === "focus" && <FocusSheet onClose={() => setSheet(null)} />}
      {sheet === "camp" && <CampSheet onClose={() => setSheet(null)} />}
    </div>
  );
}

function FocusSheet({ onClose }) {
  const { league, commit, toast } = useGame();
  const t = league.teams[league.userTid];
  const plan = ensureDevPlan(league);
  const [pick, setPick] = useState(plan.focus);
  const [every, setEvery] = useState(false);
  const cands = focusCandidates(league, t);
  const list = every ? cands : cands.slice(0, 5);
  if (!every && pick && !list.some((c) => c.p.id === pick)) { const c = cands.find((x) => x.p.id === pick); if (c) list.push(c); }
  const p = league.players[pick];
  const choose = () => { const r = setFocus(league, pick); toast(r.msg); commit(); onClose(); };
  return (
    <Dialog title="Choose your focus player" sub="Young players with a strong trait gain the most." onClose={onClose} className="dv-sheet"
      actions={<DBtn kind="primary" onClick={choose} disabled={!p}>{p ? `Choose ${last(p.name)}` : "Choose a player"}</DBtn>}>
      <div className={`dv-opts${every ? " scroll" : ""}`}>
        {list.map(({ p: c, boost }) => (
          <button key={c.id} type="button" className={`dv-opt${pick === c.id ? " on" : ""}`} aria-pressed={pick === c.id} onClick={() => setPick(c.id)}>
            <span className="dv-tx"><span className="dv-nm"><b>{c.name}</b><Who p={c} /></span><span>{traitName(c)}{t.prospects.includes(c.id) ? ` · ${LEVELS[c.assignment]?.name || "AHL"}` : ""}{draftText(c) ? ` · ${draftText(c)}` : ""}</span></span>
            <span className="dv-ovr">{c.ovr}</span><span className={`dv-d ${boost >= 0.5 ? "up" : ""}`}>+{boost.toFixed(1)}</span>
          </button>
        ))}
      </div>
      {cands.length > 5 && <button type="button" className="dv-qlink sm" onClick={() => setEvery((v) => !v)}>{every ? "Show the best five" : `Show all ${cands.length} players`}</button>}
    </Dialog>
  );
}

function CampSheet({ onClose }) {
  const { league, commit, toast } = useGame();
  const t = league.teams[league.userTid];
  const plan = ensureDevPlan(league);
  const [pick, setPick] = useState(plan.camp);
  const choose = () => { const r = setCampPriority(league, pick); toast(r.msg); commit(); onClose(); };
  return (
    <Dialog title="Camp priority" sub="One group gets the staff's extra attention at camp. It pays off next summer." onClose={onClose} className="dv-sheet"
      actions={<DBtn kind="primary" onClick={choose}>Choose {CAMP_PRIORITY[pick].name}</DBtn>}>
      <div className="dv-opts">
        {Object.entries(CAMP_PRIORITY).map(([k, c]) => { const n = campCovered(league, k, t).length; return (
          <button key={k} type="button" className={`dv-opt${pick === k ? " on" : ""}`} aria-pressed={pick === k} onClick={() => setPick(k)}>
            <span className="dv-tx"><b>{c.name}</b><span>{n} {c.who}{n === 1 ? "" : ""}</span></span>
            <span className="dv-n up">{one(c.bonus)}</span>
          </button>
        ); })}
      </div>
    </Dialog>
  );
}

// ---------- Prospects ----------
const statTxt = (p) => {
  const s = p.farmStats || {};
  if (!s.gp) return null;
  if (isGoalie(p.pos)) return s.sa ? `.${Math.round(((s.sa - s.ga) / s.sa) * 1000).toString().padStart(3, "0")}` : `${s.w || 0} W`;
  return `${(s.g || 0) + (s.a || 0)} PTS`;
};
const MID_WORD = { thrive: ["Thriving", "up", 0], steady: ["Steady", "", 1], struggle: ["Struggling", "down", 2] };
const PRE_WORD = { Safe: ["Safe", "", 0], Risky: ["Risky", "warn", 1], "Long shot": ["Long shot", "down", 2] };
const SUM_WORD = { grow: ["Growing", "up", 0], peak: ["Steady", "", 1], decline: ["Slipping", "down", 2] };
// Gridiron's "Young players": every prospect on one screen, three cards side by side, grouped by how it's going.
function Prospects({ onSub }) {
  const { league, commit, toast, go } = useGame();
  const t = league.teams[league.userTid];
  const plan = ensureDevPlan(league);
  const phone = usePhone();
  const [sel, setSel] = useState(null);
  const pros = t.prospects.map((id) => league.players[id]).filter(Boolean);
  const placed = pros.filter((p) => p.placement?.year === league.year);
  const pre = league.phase === "preseason";
  const open = planOpen(league, t);
  const rolled = placed.some((p) => p.placement.outcome);
  const thriving = placed.filter((p) => p.placement.outcome === "thrive").length;
  const gambles = placed.filter((p) => statusWord(p.placement) !== "Safe").length;
  const byStaff = placed.every((p) => p.placement.by === "staff");
  const head = !pros.length ? ["No prospects in your system.", "Draft picks and sent-down players show up here."]
    : pre ? ["Where your prospects play.", `${placed.length} placed${byStaff ? " by your staff" : ""}. ${gambles ? `${gambles} ${gambles === 1 ? "is a gamble" : "are a gamble"}.` : "No gambles."}${plan.locked ? " Locked in with your plan." : ""}`]
      : league.phase === "regular" ? (rolled ? [thriving ? `${thriving} prospect${thriving === 1 ? " is" : "s are"} thriving.` : "Nobody is thriving yet.", "Placements are set for the season. Call-ups stay open."] : ["Your prospects are settling in.", `Week ${ROLL_WEEK} shows who's thriving. Call-ups stay open.`])
        : ["How your prospects did.", "Next season's placements are made in the preseason."];
  const rows = pros.map((p) => {
    const pl = p.placement?.year === league.year ? p.placement : null;
    const v = projectSummer(league, t, p);
    const [word, tone, g] = pl?.outcome ? MID_WORD[pl.outcome] : pl ? PRE_WORD[statusWord(pl)] : SUM_WORD[v >= 0.75 ? "grow" : v <= -0.75 ? "decline" : "peak"];
    const where = pl ? placeText(pl.level, pl.role) : LEVELS[p.assignment]?.name || "AHL";
    const st = !pre ? statTxt(p) : null;
    const extra = p.id === plan.focus ? "focus player" : st;
    return { p, v, g, status: <><b className={tone}>{word}</b> · {where}{extra ? ` · ${extra}` : ""}</> };
  }).sort((a, b) => a.g - b.g || b.p.pot - a.p.pot || b.p.ovr - a.p.ovr);
  const cols = phone ? 1 : rows.length > 4 ? 3 : rows.length > 2 ? 2 : 1;
  const per = Math.ceil(rows.length / cols);
  const chunks = Array.from({ length: cols }, (_, i) => rows.slice(i * per, (i + 1) * per)).filter((c) => c.length);
  const offRec = open ? placed.filter((p) => { const o = placementOptions(p); return o.rec && o.key(o.rec) !== `${p.placement.level}|${p.placement.role}`; }) : [];
  const useRec = () => { offRec.forEach((p) => { const o = placementOptions(p); setPlacement(league, p.id, o.rec.level, o.rec.role); }); toast(`${offRec.length} placement${offRec.length === 1 ? "" : "s"} set to the recommended.`); commit(); };
  const action = !pros.length ? null : offRec.length ? ["Use every recommended placement", useRec]
    : pre ? ["Back to the season plan", () => onSub?.("plan")] : league.phase === "regular" ? ["Call-ups on the Lineup", () => go("lines", "lines")] : null;
  return (
    <div className="dv-wrap dv-wall">
      <h1 className="dv-hs">{head[0]}</h1>
      <div className="dv-hsub">{head[1]}</div>
      {rows.length > 0 && <div className={`dv-grid c${chunks.length}`}>
        {chunks.map((c, i) => <div key={i} className="dv-list">{c.map((r) => <Row key={r.p.id} p={r.p} status={r.status} delta={dlt(r.v)} onClick={() => setSel(r.p.id)} />)}</div>)}
      </div>}
      {action && <div className="dv-act"><button type="button" className="dv-btn quiet" onClick={action[1]}>{action[0]}</button></div>}
      {sel && league.players[sel] && <ProspectSheet p={league.players[sel]} onClose={() => setSel(null)} />}
    </div>
  );
}

const optSentence = (p, g, k) => k === "rec" ? (g.coast ? `His best fit, though he'll coast a little. ${g.th}% he thrives.` : `His best fit. ${g.th}% he thrives and grows faster.`)
  : k === "safer" ? `Little risk, slower growth. ${g.st}% he struggles.`
    : k === "bolder" ? (g.gap <= -4 ? `A big jump for a ${p.age}-year-old. ${g.st}% he struggles.` : g.gap < 0 ? `A stretch: real upside, real risk. ${g.st}% he struggles.` : `More minutes he can handle. ${g.st}% he struggles.`)
      : `${g.th}% he thrives, ${g.st}% he struggles.`;
function ProspectSheet({ p, onClose }) {
  const { league, commit, toast } = useGame();
  const t = league.teams[league.userTid];
  const callUp = useCallUp();
  const pl = p.placement?.year === league.year ? p.placement : null;
  const pre = league.phase === "preseason";
  const open = planOpen(league, t);
  const sub = `${p.pos} · ${p.ovr} OVR · age ${p.age} · ceiling ${p.pot}${draftText(p) ? ` · ${draftText(p)}` : ""}`;
  if (!pre || !pl) {
    const ready = league.phase === "regular" || league.phase === "preseason" ? readyFor(league, t, p) : null;
    const s = p.farmStats || {};
    const line = !s.gp ? "No games yet." : isGoalie(p.pos) ? `${s.gp} GP · ${s.w || 0} W · ${statTxt(p) || ""}` : `${s.gp} GP · ${s.g || 0} G · ${s.a || 0} A · ${(s.g || 0) + (s.a || 0)} PTS`;
    const eff = pl?.outcome ? placementSummer(league, p, league.year) : null;
    const status = !pl ? null : !pl.outcome ? ["Settling in", `Week ${ROLL_WEEK} shows how it's going. ${pl.th}% he thrives.`, `${pl.th}%`, ""]
      : pl.outcome === "thrive" ? ["Thriving", `${pl.th}% odds came in. He'll grow faster this summer.`, one(eff), "up"]
        : pl.outcome === "steady" ? ["Steady", "Holding his own. Normal growth this summer.", one(eff), ""]
          : ["Struggling", `The ${pl.st}% came in. He may slip this summer.`, one(eff), "down"];
    return (
      <Dialog title={p.name} sub={sub} onClose={onClose} className="dv-sheet"
        actions={ready && league.phase === "regular" ? <DBtn kind="primary" onClick={() => { callUp.start(p); onClose(); }}>Call him up</DBtn> : <DBtn kind="quiet" onClick={onClose}>Close</DBtn>}>
        <div className="dv-opts">
          {status && <div className="dv-opt static"><span className="dv-tx"><b>{status[0]}: {placeText(pl.level, pl.role)}</b><span>{status[1]}</span></span><span className={`dv-n ${status[3]}`}>{status[2]}</span></div>}
          <div className="dv-opt static"><span className="dv-tx"><b>This season</b><span>{line}</span></span></div>
          {ready && <div className="dv-opt static"><span className="dv-tx"><b>Ready</b><span>He out-rates {ready.label}, {ready.vs.name}.</span></span><span className="dv-n">{p.ovr}</span></div>}
        </div>
        {callUp.element}
      </Dialog>
    );
  }
  const o = placementOptions(p);
  const curKey = `${pl.level}|${pl.role}`;
  const rows = [["rec", "Recommended", o.rec], ["safer", "Safer", o.safer], ["bolder", "Bolder", o.bolder]].filter(([, , g]) => g);
  if (!rows.some(([, , g]) => o.key(g) === curKey)) rows.push(["now", "Now", gamble(p, pl.level, pl.role)]);
  const use = (g) => { const r = setPlacement(league, p.id, g.level, g.role); toast(r.msg); commit(); };
  const isRec = o.key(o.rec) === curKey;
  return (
    <Dialog title={p.name} sub={sub} onClose={onClose} className="dv-sheet"
      actions={open && !isRec ? <DBtn kind="primary" onClick={() => { use(o.rec); onClose(); }}>Use the recommended</DBtn> : <DBtn kind="quiet" onClick={onClose}>{open ? "Keep him there" : "Close"}</DBtn>}>
      <div className="dv-opts">
        {rows.map(([k, label, g]) => {
          const now = o.key(g) === curKey;
          const pct = k === "rec" ? g.th : g.st;
          const tone = k === "rec" ? "up" : k === "bolder" && g.st >= 35 ? "down" : "";
          const body = <><span className="dv-tx"><b>{label}: {placeText(g.level, g.role)}{now && <em> · now</em>}</b><span>{optSentence(p, g, k)}</span></span><span className={`dv-n ${tone}`}>{pct}%</span></>;
          return open ? <button key={k} type="button" className={`dv-opt${now ? " on" : ""}`} aria-pressed={now} onClick={() => use(g)}>{body}</button> : <div key={k} className={`dv-opt static${now ? " on" : ""}`}>{body}</div>;
        })}
      </div>
      {!open && <div className="dv-note">Locked in with your plan.{pre ? " Unlock it on Season plan to change anything." : ""}</div>}
    </Dialog>
  );
}

// ---------- Home: the one line and the report sheet ----------
export function DevStrip({ onOpen, phone }) {
  const { league } = useGame();
  const t = league.teams[league.userTid];
  const h = headline(league, t);
  const num = h.n == null ? null : <span className={h.n > 0 ? "up" : h.n < 0 ? "down" : ""}>{signed(h.n)}</span>;
  const txt = h.since === "camp" ? <>{h.n >= 0 ? "Up" : "Down"} {num} since camp</> : h.since === "summer" ? <>{h.n >= 0 ? "Up" : "Down"} {num} since last season</> : <>{h.text}</>;
  return (
    <section className="dv-strip">
      {!phone && <span className="dv-strip-k">Development</span>}
      <b>{txt}</b>
      <button type="button" className="dv-ch" onClick={onOpen}>Open</button>
    </section>
  );
}
const reportSub = (league, t) => { const h = headline(league, t); return h.since === "camp" ? `${h.up || "No"} player${h.up === 1 ? " has" : "s have"} improved this season.` : headSub(league, t); };
export function DevReportSheet({ onClose }) {
  const { league, go, openPlayer } = useGame();
  const t = league.teams[league.userTid];
  ensureDevPlan(league);
  const know = worthKnowing(league, t);
  const proj = projMap(nextSummer(league, t));
  return (
    <Dialog title={<span className="dv-sheet-hs"><Headline league={league} t={t} compact /></span>} sub={reportSub(league, t)} onClose={onClose} className="dv-sheet dv-report"
      actions={<DBtn kind="primary" onClick={() => { onClose(); go("development", "overview"); }}>Open Development</DBtn>}>
      <div className="dv-list inset">
        {know.length ? know.map((r) => <KnowRow key={r.pid} league={league} r={r} proj={proj} onClick={() => { onClose(); openPlayer(r.pid); }} />) : <div className="dv-empty">Nothing stands out yet.</div>}
      </div>
    </Dialog>
  );
}
