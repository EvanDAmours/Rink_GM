// The ONE player sheet. Every player name, row and card in the game (lineup, roster, stats, the
// league's rosters, box scores, development, prospects, trade, free agency, draft boards, news,
// the record book, the legacy hall) calls useGame().openPlayer(pid, context), and App draws this:
// one shell (common.jsx Sheet: a dialog on a computer, a bottom sheet on a phone), one body for
// the kind of player he is, and one action row.
//   live      a player in the league (NHL, farm or free agent): the full card (PlayerCard.jsx)
//   prospect  a draft-class player: the scouting profile (ProspectProfile.jsx) under a small hero
//   archived  a retired player: his preserved card, or the summary older saves kept
// context ("lines", "roster", "fa", "draft", "search"...) only trims actions that would send you
// to the screen you came from.
import React, { useState } from "react";
import { useGame, Sheet } from "./common.jsx";
import Headshot from "./Headshot.jsx";
import { PlayerCardBody } from "./PlayerCard.jsx";
import ProspectProfile, { prospectDraftState, draftProspect } from "./ProspectProfile.jsx";
import ContractModal from "./ContractModal.jsx";
import { useCallUp } from "./CallUpFlow.jsx";
import { playerSheetKind } from "./navRoute.js";
import { POS_COLOR } from "./TradePage.jsx";
import { sendDown, releasePlayer, canSendDown, capYear } from "../engine/roster.js";
import { buyoutSummary } from "../engine/capAccounting.js";
import { onBlock, toggleUserBlock } from "../engine/market.js";
import { toggleMyList, csRank, fmtHeight } from "../engine/scouting.js";

const last = (n) => String(n || "").split(" ").slice(-1)[0];

// Which body a pid gets (navRoute.js, pure: tests check that every way of opening a player lands here).
export { playerSheetKind };

export default function PlayerSheet({ pid, context = null }) {
  const { league, closeModal } = useGame();
  const kind = playerSheetKind(league, pid);
  const p = league.players[pid];
  const arch = kind === "archived" ? league.retirementArchive.find((r) => r.pid === pid) : null;
  const name = p?.name || arch?.name || "Player";
  return (
    <Sheet bare wide title={name} onClose={closeModal} className="gg-pc-modal rk-psheet">
      <div className="gg-pc" data-sheet={kind}>
        {kind === "live" && <PlayerCardBody p={p} />}
        {kind === "prospect" && <><ProspectHero p={p} /><ProspectProfile p={p} actions={false} /></>}
        {kind === "archived" && (arch.player ? <PlayerCardBody p={arch.player} retired={arch} /> : <ArchivedSummary r={arch} />)}
        {kind === "missing" && <div className="rk-softbox dim">This player is no longer in the league's records.</div>}
        <PlayerActions p={kind === "archived" ? null : p} kind={kind} arch={arch} context={context} />
        <button className="gg-pc-close" onClick={closeModal}>Close</button>
      </div>
    </Sheet>
  );
}

// A draft prospect's header, in the card's hero style (his ratings are your scouts' reads, so no ring).
function ProspectHero({ p }) {
  const { league } = useGame();
  const b = p.bio || {};
  return (
    <header className="gg-pc-hero rk-psheet-pros">
      <div className="gg-pc-face"><Headshot p={p} size={96} /></div>
      <div className="gg-pc-who">
        <small>{league.draftClassYear} DRAFT CLASS · CENTRAL SCOUTING #{csRank(p)}</small>
        <h1>{p.name}</h1>
        <div className="gg-pc-meta"><i className="gg-pos" style={{ background: POS_COLOR[p.pos] || "#64748b" }}>{p.pos}</i> Age {p.age}{b.ht ? ` · ${fmtHeight(b.ht)} ${b.wt}lbs` : ""}{b.team ? ` · ${b.team} (${b.lg})` : ""}</div>
      </div>
    </header>
  );
}

// Older saves kept only a summary for players who retired before full cards were archived.
function ArchivedSummary({ r }) {
  const { league } = useGame();
  const team = league.teams[r.tid];
  return (
    <>
      <header className="gg-pc-hero" style={{ "--team": team?.colors?.[0] || "#1e293b" }}>
        <div className="gg-pc-face"><Headshot p={{ id: r.pid, name: r.name, pos: r.pos, number: r.number }} team={team} size={96} /><span className="gg-pc-num">#{r.number || "—"}</span></div>
        <div className="gg-pc-who">
          <small>RETIRED {r.year}{team ? ` · ${team.city} ${team.name}` : ""}</small>
          <h1>{r.name}</h1>
          <div className="gg-pc-meta"><i className="gg-pos" style={{ background: POS_COLOR[r.pos] || "#64748b" }}>{r.pos}</i></div>
        </div>
      </header>
      <div className="gg-pc-tiles">
        <div><small>Peak</small><b>{r.peak ?? "—"}</b><span>best overall rating</span></div>
        <div><small>Games</small><b>{r.gp ?? "—"}</b><span>simulated NHL games</span></div>
        <div><small>Legacy</small><b>{r.legacy ?? "—"}</b><span>Hall of Fame score</span></div>
      </div>
      <div className="dim small">Full career cards are kept for players who retired after the archive update; this older save holds his summary only.</div>
    </>
  );
}

// One action row for every player. What shows depends on whose he is and the phase:
// yours (lineup, minors, contract talk in re-sign week, trade, trade block, release), another
// club's (trade for him, their roster), a free agent (make an offer), a prospect (your list, draft).
// Contract extensions and contract-year decisions sit in the card's Contract panel (PlayerContract).
export function PlayerActions({ p, kind, arch, context }) {
  const { league, commit, toast, closeModal, proposeTradeFor, go, openTeam, ask } = useGame();
  const callUpFlow = useCallUp();
  const [talk, setTalk] = useState(null);
  if (kind === "missing") return null;
  if (kind === "archived") {
    const team = league.teams[arch.tid];
    return team ? <div className="gg-pc-actions"><button className="ghost" onClick={() => openTeam(team.id)}>{team.abbr} roster</button></div> : null;
  }
  if (kind === "prospect") {
    const st = prospectDraftState(league, p);
    return (
      <div className="gg-pc-actions">
        <button onClick={() => { toggleMyList(league, p.id); commit(); }}>{st.listed ? "On your list ✓" : "Add to your list"}</button>
        {st.live && <button className="primary" disabled={!st.onClock} title={st.onClock ? "" : "Wait until you're on the clock"} onClick={() => draftProspect(league, p, { toast, commit, closeModal })}>Draft {last(p.name)}</button>}
        {context !== "draft" && <button className="ghost" onClick={() => { closeModal(); go("draft"); }}>Draft board</button>}
      </div>
    );
  }
  const team = league.teams[p.tid];
  const mine = p.tid === league.userTid;
  const inMinors = !!team && team.prospects.includes(p.id);
  const listed = onBlock(league, p.id);
  const resignTalk = mine && league.phase === "resign" && p.yrs === 0 && p.signed !== false;
  const faOpen = p.tid === -1 && !["draft", "resign", "playoffs"].includes(league.phase);
  const block = () => { const on = toggleUserBlock(league, p.id); commit(); toast(on ? `${p.name} is on your trade block.` : `${p.name} is off your trade block.`); };
  return (
    <div className="gg-pc-actions">
      {mine && !inMinors && <>
        {resignTalk && <button className="primary" onClick={() => setTalk({ id: p.id, kind: "resign" })}>Negotiate</button>}
        {context !== "lines" && <button onClick={() => { closeModal(); go("lines", "lines"); }}>Move in lineup</button>}
        <button disabled={!canSendDown(p)} onClick={() => { sendDown(league, team, p.id); commit(); closeModal(); }}>Send to minors</button>
        <button onClick={() => proposeTradeFor(p.id, p.tid)}>Put in a trade</button>
        <button aria-pressed={listed} onClick={block}>{listed ? "On the block ✓" : "Add to trade block"}</button>
        <button className="danger" disabled={!!(p.ltir || p.waiverPending || p.offerSheetPending)} onClick={async () => { if (await ask({ title: `Release ${p.name}?`, body: p.yrs > 0 && p.cap > 0 ? buyoutSummary(p, capYear(league)) : "He becomes a free agent.", yes: "Release", danger: true })) { releasePlayer(league, team, p.id); commit(); closeModal(); } }}>Release</button>
      </>}
      {mine && inMinors && <>
        {resignTalk && <button className="primary" onClick={() => setTalk({ id: p.id, kind: "resign" })}>Negotiate</button>}
        <button className="primary" onClick={() => callUpFlow.start(p)}>Call up</button>
        <button onClick={() => proposeTradeFor(p.id, p.tid)}>Put in a trade</button>
        <button aria-pressed={listed} onClick={block}>{listed ? "On the block ✓" : "Add to trade block"}</button>
      </>}
      {callUpFlow.element}
      {!mine && p.tid >= 0 && <button className="primary" onClick={() => proposeTradeFor(p.id)}>Trade for {last(p.name)}</button>}
      {p.tid === -1 && (faOpen
        ? <button className="primary" onClick={() => setTalk({ id: p.id, kind: "fa" })}>Make an offer</button>
        : <button onClick={() => { closeModal(); go("freeagency"); }}>Free agency</button>)}
      {team && !mine && <button className="ghost" onClick={() => openTeam(team.id)}>{team.abbr} roster</button>}
      {talk && league.players[talk.id] && <ContractModal p={league.players[talk.id]} kind={talk.kind} onClose={() => { setTalk(null); commit(); }} />}
    </div>
  );
}
