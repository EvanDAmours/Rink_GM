import React from "react";
import { Modal } from "./common.jsx";

// "Move on? You can't come back to this stage": what you'd leave behind, then stay or go.
export default function StageConfirm({ title, lines = [], stay = "Stay here", yes = "Yes, move on", onYes, onClose, tone = "warn" }) {
  return (
    <Modal title={title} onClose={onClose} bare className="gg-preview gg-confirm">
      <div className="gg-pv">
        <div><h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>{title}</h2><div className="dim">You can't come back to this stage once it's over.</div></div>
        <div className="gg-confirm-lines">{lines.map((l, i) => <div key={i} className={`gg-confirm-line ${l.tone || tone}`}><b>{l.head}</b>{l.text && <span>{l.text}</span>}</div>)}</div>
        <div className="gg-pv-actions"><button className="ghost" onClick={onClose}>{stay}</button><button className="primary big" onClick={onYes}>{yes}</button></div>
      </div>
    </Modal>
  );
}
