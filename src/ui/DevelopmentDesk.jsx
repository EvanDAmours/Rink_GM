// Development: its own section, three calm views (Overview · Season plan · Prospects) under the
// section hero (its tabs pick the view). One question per screen, answered in one big sentence; lists, not
// dashboards; the detail one tap away in a sheet. The engine is developmentPlan.js.
import React, { useMemo, useState } from "react";
import { useGame, Dialog, DBtn } from "./common.jsx";
import { useCallUp } from "./CallUpFlow.jsx";
import { usePhone } from "./mobile.js";
import { isGoalie } from "../engine/constants.js";
import {
  ensureDevPlan, headline, worthKnowing, nextSummer, focusCandidates, focusExpected, focusChance, weeksLeft, campCovered,
  CAMP_PRIORITY, LEVELS, ROLES, placeText, statusWord, placementOptions, setPlacement, setFocus, setCampPriority, lockPlan,
  unlockPlan, planOpen, readyFor, placementSummer, gamble, signed, traitName, FOCUS_WEEKS, ROLL_WEEK,
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
      {cur === "plan" ? <SeasonPlan onSub={onSub} /> : cur === "prospects" ? <Prospects /> : <Overview onSub={onSub} />}
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

function Row({ name, why, num, tone, onClick, chev, word }) {
  return (
    <button type="button" className="dv-li" onClick={onClick}>
      <span className="dv-tx"><b>{name}</b>{why && <span>{why}</span>}</span>
      {num != null && <span className={`dv-n ${tone || ""}`}>{num}</span>}
      {word && <span className={`dv-w ${tone || ""}`}>{word}</span>}
      {chev && <span className="dv-chev" aria-hidden="true">›</span>}
    </button>
  );
}

// ---------- Overview ----------
function Overview({ onSub }) {
  const { league, openPlayer } = useGame();
  const t = league.teams[league.userTid];
  const [grp, setGrp] = useState("grow");
  const [all, setAll] = useState(false);
  const know = worthKnowing(league, t);
  const ns = useMemo(() => nextSummer(league, t), [league, t, league.day, league.phase, t.devPlan?.camp]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = ns[grp];
  const shown = all ? rows : rows.slice(0, 4);
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
            {know.length ? know.map((r) => <Row key={r.pid} name={r.name} why={r.why} num={r.num} tone={r.tone} onClick={() => openPlayer(r.pid)} />) : <div className="dv-empty">Nothing stands out yet. Check back after a few weeks.</div>}
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
            {shown.length ? shown.map((r) => { const v = Math.round(r.v); return <Row key={r.p.id} name={r.p.name} why={`${r.p.age} · ${r.farm ? LEVELS[r.p.placement?.level || r.p.assignment]?.name || "AHL" : "NHL"}`} num={signed(v)} tone={v > 0 ? "up" : v < 0 ? "down" : ""} onClick={() => openPlayer(r.p.id)} />; })
              : <div className="dv-empty">Nobody {word} next summer.</div>}
          </div>
          {rows.length > 4 && <button type="button" className="dv-qlink" onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `All ${rows.length} ${word} →`}</button>}
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
  const focusSub = !f ? "Nobody yet" : pre ? `+${focusExpected(f).toFixed(1)} expected by spring`
    : league.phase === "regular" ? `${signed(plan.gained || 0)} so far · on pace for ${signed(Math.round((plan.gained || 0) + focusExpected(f, left)))} by spring` : `${signed(plan.gained || 0)} this season`;
  const camp = CAMP_PRIORITY[plan.camp];
  const covered = campCovered(league, plan.camp, t).length;
  const pros = t.prospects.map((id) => league.players[id]).filter((p) => p?.placement?.year === league.year);
  const risky = pros.filter((p) => statusWord(p.placement) !== "Safe");
  const biggest = [...risky].sort((a, b) => b.placement.st - a.placement.st)[0];
  const thriving = pros.filter((p) => p.placement.outcome === "thrive").length;
  const rolled = pros.some((p) => p.placement.outcome);
  const steps = [
    ["Focus player", f ? f.name : "Choose a player", focusSub, open && "Change", () => setSheet("focus")],
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
        {steps.map(([k, v, s, btn, onClick], i) => (
          <div key={k} className="dv-stp">
            {!phone && <span className="dv-no2">{i + 1}</span>}
            <div className="dv-tx"><small>{k}</small><b>{v}</b><span>{s}</span></div>
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
            <span className="dv-tx"><b>{c.name}</b><span>{c.age} · {traitName(c)}{t.prospects.includes(c.id) ? ` · ${LEVELS[c.assignment]?.name || "AHL"}` : ""}</span></span>
            <span className={`dv-n ${boost >= 0.5 ? "up" : ""}`}>+{boost.toFixed(1)}</span>
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
const MID_WORD = { thrive: ["Thriving", "up"], steady: ["Steady", ""], struggle: ["Struggling", "down"] };
function Prospects() {
  const { league } = useGame();
  const t = league.teams[league.userTid];
  ensureDevPlan(league);
  const [sel, setSel] = useState(null);
  const pros = t.prospects.map((id) => league.players[id]).filter(Boolean).sort((a, b) => b.pot - a.pot || b.ovr - a.ovr);
  const placed = pros.filter((p) => p.placement?.year === league.year);
  const pre = league.phase === "preseason";
  const rolled = placed.some((p) => p.placement.outcome);
  const thriving = placed.filter((p) => p.placement.outcome === "thrive").length;
  const gambles = placed.filter((p) => statusWord(p.placement) !== "Safe").length;
  const byStaff = placed.every((p) => p.placement.by === "staff");
  const head = !pros.length ? ["No prospects in your system.", "Draft picks and sent-down players show up here."]
    : pre ? ["Where your prospects play.", `${placed.length} placed${byStaff ? " by your staff" : ""}. ${gambles ? `${gambles} ${gambles === 1 ? "is a gamble" : "are a gamble"}.` : "No gambles."}${t.devPlan?.locked ? " Locked in with your plan." : ""}`]
      : league.phase === "regular" ? (rolled ? [thriving ? `${thriving} prospect${thriving === 1 ? " is" : "s are"} thriving.` : "Nobody is thriving yet.", "Placements are set for the season. Call-ups stay open."] : ["Your prospects are settling in.", `Week ${ROLL_WEEK} shows who's thriving. Call-ups stay open.`])
        : ["How your prospects did.", "Next season's placements are made in the preseason."];
  return (
    <div className="dv-wrap wide">
      <h1 className="dv-hs">{head[0]}</h1>
      <div className="dv-hsub">{head[1]}</div>
      {pros.length > 0 && <div className="dv-list">
        {pros.map((p) => {
          const pl = p.placement?.year === league.year ? p.placement : null;
          const where = pl ? placeText(pl.level, pl.role) : LEVELS[p.assignment]?.name || "AHL";
          let word, tone;
          if (pl && pl.outcome) [word, tone] = MID_WORD[pl.outcome];
          else if (pl && pre) { word = statusWord(pl); tone = word === "Long shot" ? "down" : word === "Risky" ? "warn" : ""; }
          else if (pl) { word = "Settling in"; tone = "dim"; }
          const st = !pre ? statTxt(p) : null;
          return <Row key={p.id} name={p.name} why={st ? `${where} · ${st}` : where} word={word} tone={tone} chev onClick={() => setSel(p.id)} />;
        })}
      </div>}
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
  const sub = `${p.age} · ${p.ovr} today · ceiling ${p.pot}`;
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
  return (
    <Dialog title={<span className="dv-sheet-hs"><Headline league={league} t={t} compact /></span>} sub={reportSub(league, t)} onClose={onClose} className="dv-sheet dv-report"
      actions={<DBtn kind="primary" onClick={() => { onClose(); go("development", "overview"); }}>Open Development</DBtn>}>
      <div className="dv-list inset">
        {know.length ? know.map((r) => <Row key={r.pid} name={r.name} why={r.why} num={r.num} tone={r.tone} onClick={() => { onClose(); openPlayer(r.pid); }} />) : <div className="dv-empty">Nothing stands out yet.</div>}
      </div>
    </Dialog>
  );
}
