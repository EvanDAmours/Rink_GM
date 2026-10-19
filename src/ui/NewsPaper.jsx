import React from "react";
import { useGame, TeamBadge } from "./common.jsx";
import { trophyUrl } from "./trophies.js";

// The Rink Gazette for everything that is not a playoff series: the deadline
// extra, the season-in-review issue and the All-Star weekend edition.
export default function NewsPaper({ paper, onClose }) {
  const { league } = useGame();
  const team = (tid) => (tid != null ? league.teams[tid] : null);
  const p1 = team(paper.photo?.tid), p2 = team(paper.photo2?.tid);
  return (
    <div className="modalbg gg-paperbg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`gg-paper kind-${paper.kind}`} role="dialog" aria-label={`${paper.edition} newspaper`}>
        <div className="gg-paper-mast">
          <div className="gg-paper-ear"><i>“All the Hockey That’s Fit to Print”</i></div>
          <div className="gg-paper-title">The Rink Gazette</div>
          <div className="gg-paper-ear right"><b>{paper.edition}</b><span>{paper.weather}</span></div>
        </div>
        <div className="gg-paper-rule"><span>VOL. {paper.year - 1900} … No. {4000 + (paper.day || 0) * 3}</span><span>{paper.date}</span><span>$4.00</span></div>
        <h1 className="gg-paper-h1">{paper.headline}</h1>
        <div className="gg-paper-cols">
          <div className="gg-paper-main">
            <h2 className="gg-paper-h2">{paper.sub}</h2>
            <div className="gg-paper-byline">By the Gazette Staff</div>
            <div className="gg-paper-body">{paper.story.map((t, i) => <p key={i} className={i === 0 ? "drop" : ""}>{t}</p>)}<p className="dim">Continued on Page D4</p></div>
          </div>
          <div className="gg-paper-photo">
            <div className="gg-paper-frame">{paper.photo?.trophy && trophyUrl(paper.photo.trophy) ? <img src={trophyUrl(paper.photo.trophy)} alt="" /> : p1 ? <TeamBadge team={p1} size={150} decorative /> : null}</div>
            {paper.photo?.caption && <div className="gg-paper-cap">{paper.photo.caption}</div>}
            {p2 && <><div className="gg-paper-frame small"><TeamBadge team={p2} size={90} decorative /></div><div className="gg-paper-cap">{paper.photo2.caption}</div></>}
          </div>
          <aside className="gg-paper-side">
            {paper.side.map((sec, i) => <React.Fragment key={i}><h4>{sec.h}</h4>{sec.text && <p>{sec.text}</p>}{sec.rows.map((r, j) => r[0] ? <div key={j} className="gg-paper-kv"><span>{r[0]}</span><b>{r[1]}</b></div> : <p key={j} className="gg-paper-line">{r[1]}</p>)}</React.Fragment>)}
          </aside>
        </div>
        {paper.lists?.length > 0 && <div className="gg-paper-lists">{paper.lists.map((l, i) => <div key={i}><h4>{l.h}</h4><p>{l.text}</p></div>)}</div>}
        <div className="gg-paper-foot">{paper.foot}</div>
      </div>
      <button className="gg-paper-btn" onClick={onClose}>{paper.button || "Continue →"}</button>
    </div>
  );
}
