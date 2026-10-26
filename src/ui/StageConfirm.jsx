import React from "react";
import { Dialog, DBtn } from "./common.jsx";

// "Move on? You can't come back to this stage": what you'd leave behind, then stay or go.
export default function StageConfirm({ title, lines = [], stay = "Stay here", yes = "Yes, move on", onYes, onClose, tone = "warn" }) {
  return (
    <Dialog title={title} sub="You can't come back to this stage once it's over." onClose={onClose} className="gg-confirm"
      actions={<><DBtn onClick={onClose}>{stay}</DBtn><DBtn kind="primary" onClick={onYes}>{yes}</DBtn></>}>
      <div className="gg-confirm-lines">{lines.map((l, i) => <div key={i} className={`gg-confirm-line ${l.tone || tone}`}><b>{l.head}</b>{l.text && <span>{l.text}</span>}{l.action && <button className="small gg-confirm-go" onClick={l.action.onClick}>{l.action.label} →</button>}</div>)}</div>
    </Dialog>
  );
}
