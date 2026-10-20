import {buyoutSummary} from '../engine/capAccounting.js';
import ArchivedPlayerCard from './ArchivedPlayerCard.jsx';
import React from "react";
import Headshot from "./Headshot.jsx";
import PlayerCard from "./PlayerCard.jsx";
import { useGame, Modal, TeamBadge, Ovr, Bar, money, pct, signed } from "./common.jsx";
import { SKATER_ATTRS, GOALIE_ATTRS } from "../engine/ratings.js";
import { isGoalie, ARCHETYPES } from "../engine/constants.js";
import { fullPosName, savePct, gaa, marketValue, isRFA, DEV_TRAITS } from "../engine/players.js";
import ProspectProfile from "./ProspectProfile.jsx";
import { DevChip } from "./scoutingBits.jsx";
import { shownRatings } from "../engine/draft.js";
import { sendDown, callUp, releasePlayer, canSendDown, hasRoomFor, capYear } from "../engine/roster.js";
import { careerTotals, careerMilestones } from "../engine/records.js";
import { prospectReport, isProspectWatch } from "../engine/prospectWatch.js";
import { Sparkline } from "./ProspectWatch.jsx";
import AbilityChip, { abilitiesOf } from "./AbilityChip.jsx";
import { injuryReturn, injuryLine } from "../engine/injuryReport.js";

export default function PlayerModal({ pid }) {
  const { league, closeModal, commit, toast, proposeTradeFor, go, openTeam, ask } = useGame();
  const p = league.players[pid];
  if (!p) return <ArchivedPlayerCard pid={pid} onClose={closeModal}/>;
  const team = league.teams[p.tid];
  const mine = p.tid === league.userTid;
  const inMinors = team && team.prospects.includes(p.id);
  const hidden = p.tid === -2 || (inMinors && !mine);
  const r = hidden ? shownRatings(p) : { ovr: p.ovr, pot: p.pot, exact: true };
  const goalie = isGoalie(p.pos);
  const groups = goalie ? GOALIE_ATTRS : SKATER_ATTRS;
  const s = p.stats;
  const ps = p.pstats;

  const statLine = (st) =>
    goalie
      ? [["GP", st.gp], ["W", st.w], ["L", st.l], ["OTL", st.otl], ["SV%", pct(savePct(st))], ["GAA", gaa(st).toFixed(2)], ["SO", st.so]]
      : [["GP", st.gp], ["G", st.g], ["A", st.a], ["P", st.pts], ["+/-", signed(st.pm)], ["PIM", st.pim], ["SOG", st.sog], ["PPG", st.ppg], ["HIT", st.hit], ["BLK", st.blk]];

  const career = [...p.career].reverse();
  const totals = careerTotals(p);
  const watch = team && isProspectWatch(league, team, p) ? prospectReport(league, team, p) : null;
  const milestones = careerMilestones(p);

  if (p.tid === -2) {
    return (
      <Modal title={p.name} onClose={closeModal} head={<span className="pill">{league.draftClassYear} draft prospect</span>}>
        <ProspectProfile p={p} />
      </Modal>
    );
  }
  if (!league.settings?.classicCard) return <PlayerCard p={p} />;
  // Development traits matter while a player is still growing. Other teams' prospects
  // show what your scouts found out (if anything).
  const devShown = p.age <= 25 && p.dev ? (hidden ? p.scout?.dev || null : p.dev) : undefined;

  return (
    <Modal
      title={p.name}
      onClose={closeModal}
      head={team ? <TeamBadge team={team} size={36} /> : <span className="pill">{p.tid === -2 ? "Draft prospect" : "Free agent"}</span>}
    >
      <div className="stack">
        <div className="row" style={{ gap: 18, alignItems: "flex-start" }}>
          <div className="stack" style={{ gap: 6, alignItems: "center" }}>
            <Headshot team={team} p={p} size={112}/>
            <span style={{ transform: "scale(1.6)", margin: "8px 10px" }}><Ovr v={r.ovr} /></span>
            <span className="muted small">OVR{hidden && !r.exact ? " (est.)" : ""}</span>
          </div>
          <div className="kv" style={{ flex: 1 }}>
            <span className="k">Position</span><span>{fullPosName(p.pos)} · shoots {p.shoots}{goalie ? "/catches" : ""}</span>
            <span className="k">Type</span><span>{ARCHETYPES[p.type]?.name}</span>
            {abilitiesOf(p).length > 0 && (<><span className="k">X-Factors</span><span className="gg-xf-row"><AbilityChip p={p} full /></span></>)}
            <span className="k">Jersey number</span><span>{p.number || "—"}{p.numberData?" · verified":p.numberEdited?" · your assignment":p.number?" · game assigned":""}</span>
            <span className="k">Age</span><span>{p.age}{p.nat ? ` · ${p.nat}` : ""}</span>
            <span className="k">Potential</span><span>{r.pot}{hidden && !r.exact ? " (scout estimate)" : ""}</span>
            {devShown !== undefined && (<><span className="k">Development</span><span>{devShown ? <span title={DEV_TRAITS[devShown].desc}><DevChip dev={devShown} /></span> : <DevChip dev={null} />}</span></>)}
            <span className="k">Team</span><span>{team ? <span className="link" onClick={() => openTeam(team.id)}>{team.city} {team.name}</span> : p.tid === -2 ? `${league.draftClassYear} draft class` : "Free agent"}{inMinors ? " (minors)" : ""}</span>
            <span className="k">Contract</span>
            <span>{p.signed === false ? "Unsigned draft pick" : p.yrs > 0 ? `${money(p.cap)} × ${p.yrs} yr${p.yrs > 1 ? "s" : ""} (through ${league.year + p.yrs - 1}-${String(league.year + p.yrs).slice(2)})` : "None"} {p.tid >= 0 && p.yrs <= 1 && p.signed !== false ? <span className="pill">{isRFA(p) ? "RFA" : "UFA"} next summer</span> : null}</span>
            <span className="k">Market value</span><span>{hidden ? 'Unavailable without an NHL evaluation' : `${money(marketValue(p, league.year))} / yr`}</span>
            <span className="k">Rating source</span>
            <span>{p.ratingData ? <><span className="src ea">EA</span> EA SPORTS {p.ratingData.edition} · {p.ratingData.keys.length} published attributes{league.year>(league.startYear || 2026)?" · franchise development applied":""}</> : p.src === "ea27" ? <><span className="src ea">EA</span> Official EA SPORTS NHL 27 overall</> : p.src === "est" ? <><span className="src est">EST</span> Estimated — update it in Settings → Ratings Import</> : "Generated player"}</span>
            {injuryReturn(league, p) && (<><span className="k">Injury</span><span className="bad">{p.injuryNote || "Injury"} — {injuryLine(league, p)}</span></>)}
            {p.draft && (<><span className="k">Drafted</span><span>{p.draft.year} · Round {p.draft.round}, #{p.draft.pick} by {league.teams[p.draft.tid]?.abbr}</span></>)}
          </div>
        </div>

        {watch && !hidden && (
          <div className="panel gg-pm-dev">
            <h3>Development</h3>
            <div className="gg-pm-dev-grid">
              <div><small>THIS SEASON</small><b>{watch.level}</b><span className="dim small">{watch.line.text}{watch.farm ? ` · ${watch.role} role` : ""}</span></div>
              <div><small>RATING</small><b style={{ color: watch.delta > 0 ? "#22c55e" : watch.delta < 0 ? "#ef4444" : "#e2e8f0" }}>{watch.start} → {p.ovr}</b><span className="dim small">{watch.delta > 0 ? "+" : ""}{watch.delta} since camp · {watch.trend === "surging" ? "surging" : watch.trend === "up" ? "trending up" : watch.trend === "down" ? "slipping" : "holding"}</span></div>
              <div><small>CEILING</small><b>{p.pot}</b><span className="dim small">ETA {watch.eta}{watch.drafted ? ` · drafted ${watch.drafted}` : ""}</span></div>
              <div className="gg-pm-dev-spark"><Sparkline path={watch.path} width={160} height={40} color={watch.delta > 0 ? "#22c55e" : watch.delta < 0 ? "#ef4444" : "#94a3b8"} /><span className="dim small">{watch.prod === "dominant" ? "Dominating his level" : watch.prod === "solid" ? "Holding his own" : watch.prod === "struggling" ? "Struggling at this level" : "Early in the season"}{watch.next ? ` · ${watch.next.label}` : ""}</span></div>
            </div>
            {(p.progress || []).filter((x) => x.year === league.year).length > 0 && <div className="dim small" style={{ marginTop: 8 }}>Growth this season: {(p.progress || []).filter((x) => x.year === league.year).map((x) => `wk ${x.week} ${x.from}→${x.to} (${x.note})`).join(" · ")}</div>}
            {(p.farmHistory || []).length > 0 && <div className="tablewrap" style={{ marginTop: 10 }}><table className="t"><thead><tr><th>Season</th><th>League</th><th>Role</th><th className="num">GP</th>{goalie ? <><th className="num">W</th><th className="num">SV%</th></> : <><th className="num">G</th><th className="num">A</th><th className="num">P</th></>}</tr></thead><tbody>
              {[...p.farmHistory].reverse().map((h, i) => <tr key={i}><td>{h.year}-{String(h.year + 1).slice(2)}</td><td>{h.lg}</td><td>{h.role}</td><td className="num">{h.gp}</td>{goalie ? <><td className="num">{h.w}</td><td className="num">{h.sa ? pct((h.sa - h.ga) / h.sa) : "—"}</td></> : <><td className="num">{h.g}</td><td className="num">{h.a}</td><td className="num">{h.g + h.a}</td></>}</tr>)}
            </tbody></table></div>}
          </div>
        )}
        {!hidden && (
          <div className="panel">
            <h3>Attributes</h3><p className="muted small">{p.ratingData?"EA values are used where published; remaining attributes are estimated. Ratings can develop during your franchise.":"Individual attributes are gameplay estimates where EA has not published values."}</p>
            <div className="attrgrid">
              {Object.entries(groups).map(([g, attrs]) => (
                <div key={g}>
                  <div className="muted small" style={{ textTransform: "capitalize", fontWeight: 700, marginBottom: 4 }}>{g}</div>
                  {Object.entries(attrs).map(([k, label]) => (
                    <div className="attr" key={k} style={{ marginBottom: 4 }}>
                      <span>{label}{p.ratingData && !p.ratingData.keys.includes(k)?" (est.)":""}</span>
                      <span className="right mono">{p.attrs[k] ?? "—"}</span>
                      {p.attrs[k]!=null && <Bar v={p.attrs[k]} />}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="panel">
          <h3>{league.year}-{String(league.year + 1).slice(2)} Stats</h3>
          <div className="row" style={{ gap: 18 }}>
            {statLine(s).map(([k, v]) => <div className="stat" key={k}><span className="l">{k}</span><span className="v" style={{ fontSize: 18 }}>{v}</span></div>)}
          </div>
          {ps.gp > 0 && (
            <>
              <div className="muted small" style={{ margin: "10px 0 4px" }}>Playoffs</div>
              <div className="row" style={{ gap: 18 }}>
                {statLine(ps).map(([k, v]) => <div className="stat" key={k}><span className="l">{k}</span><span className="v" style={{ fontSize: 16 }}>{v}</span></div>)}
              </div>
            </>
          )}
        </div>

        {career.length > 0 && (
          <div className="panel">
            <h3>Career (Rink GM)</h3>
            {milestones.length > 0 && <div className="gg-miles">{milestones.map((m) => <span key={m.key + m.mark} className="gg-mile">🏅 {m.label}</span>)}</div>}
            <div className="tablewrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>Season</th><th>Team</th><th className="num">OVR</th>
                    {goalie ? <><th className="num">GP</th><th className="num">W</th><th className="num">L</th><th className="num">OTL</th><th className="num">SV%</th><th className="num">GAA</th><th className="num">SO</th></>
                      : <><th className="num">GP</th><th className="num">G</th><th className="num">A</th><th className="num">P</th><th className="num">+/-</th><th className="num">PIM</th></>}
                  </tr>
                </thead>
                <tbody>
                  {career.map((c, i) => (
                    <tr key={i}>
                      <td>{c.y}-{String(c.y + 1).slice(2)}</td><td>{c.t}</td><td className="num">{hidden ? '—' : c.o ?? ''}</td>
                      {goalie ? <><td className="num">{c.s.gp}</td><td className="num">{c.s.w}</td><td className="num">{c.s.l}</td><td className="num">{c.s.otl}</td><td className="num">{pct(savePct(c.s))}</td><td className="num">{gaa(c.s).toFixed(2)}</td><td className="num">{c.s.so}</td></>
                        : <><td className="num">{c.s.gp}</td><td className="num">{c.s.g}</td><td className="num">{c.s.a}</td><td className="num">{c.s.pts}</td><td className="num">{signed(c.s.pm)}</td><td className="num">{c.s.pim}</td></>}
                    </tr>
                  ))}
                  <tr className="gg-totals">
                    <td>Totals</td><td>{totals.seasons} season{totals.seasons === 1 ? "" : "s"}</td><td className="num"></td>
                    {goalie ? <><td className="num">{totals.gp}</td><td className="num">{totals.w}</td><td className="num">{totals.l}</td><td className="num">{totals.otl}</td><td className="num">{totals.sa ? pct(totals.svpct) : "—"}</td><td className="num">{totals.gp ? ((totals.ga / Math.max(1, totals.gp)) ).toFixed(2) : "—"}</td><td className="num">{totals.so}</td></>
                      : <><td className="num">{totals.gp}</td><td className="num">{totals.g}</td><td className="num">{totals.a}</td><td className="num">{totals.pts}</td><td className="num">{signed(totals.pm)}</td><td className="num">{totals.pim}</td></>}
                  </tr>
                </tbody>
              </table>
            </div>
            {totals.priorGames > 0 && <div className="dim small" style={{ marginTop: 6 }}>Plus an estimated {totals.priorGames} NHL games before this franchise began{p.service?.estimated === false ? "" : " (estimate)"}. Milestones count games in this franchise.</div>}
          </div>
        )}

        <div className="row">
          {mine && !inMinors && (
            <>
              <button disabled={!canSendDown(p)} onClick={() => { sendDown(league, team, p.id); commit(); closeModal(); }}>Send to minors</button>
              <button className="danger" disabled={!!(p.ltir || p.waiverPending || p.offerSheetPending)} onClick={async () => { if (await ask({ title: `Release ${p.name}?`, body: p.yrs > 0 && p.cap > 0 ? buyoutSummary(p,capYear(league)) : "He becomes a free agent.", yes: "Release", danger: true })) { releasePlayer(league, team, p.id); commit(); closeModal(); } }}>Release</button>
              <button onClick={() => proposeTradeFor(p.id, p.tid)}>Put in a trade</button>
            </>
          )}
          {mine && inMinors && (
            <button onClick={() => { if (!hasRoomFor(league, team)) return toast("Roster is full."); if(!callUp(league, team, p.id))return toast("Recall blocked by contract, cap or assignment rules."); commit(); closeModal(); }}>Call up</button>
          )}
          {!mine && p.tid >= 0 && <button className="primary" onClick={() => proposeTradeFor(p.id)}>Trade for {p.name.split(" ").slice(-1)[0]}</button>}
          {p.tid === -1 && <button className="primary" onClick={() => { closeModal(); go("freeagency"); }}>Go to free agency</button>}
        </div>
      </div>
    </Modal>
  );
}
