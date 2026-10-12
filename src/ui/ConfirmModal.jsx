import {useDialogFocus} from "./accessibility.js";
import React, { useEffect, useRef } from "react";

// In-page replacement for window.confirm, which embedded viewers suppress.
export default function ConfirmModal({ req, onAnswer }) {
  const yesRef = useRef(null),dialogRef=useRef(null);useDialogFocus(dialogRef,()=>onAnswer(false));
  useEffect(()=>{yesRef.current?.focus();},[]);
  return (
    <div className="modalbg" style={{ zIndex: 80, alignItems: "center" }} onMouseDown={(e) => e.target === e.currentTarget && onAnswer(false)}>
      <div ref={dialogRef} className="modal" tabIndex={-1} aria-label={req.title} role="alertdialog" aria-modal="true" style={{ width: "min(440px, 100%)" }}>
        <div className="mhead">
          <div style={{ fontWeight: 800, fontSize: 17 }}>{req.title}</div>
        </div>
        <div className="mbody stack" style={{ gap: 16 }}>
          {req.body && <div className="muted">{req.body}</div>}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button onClick={() => onAnswer(false)}>{req.no || "Cancel"}</button>
            <button data-autofocus ref={yesRef} className={req.danger ? "danger" : "primary"} onClick={() => onAnswer(true)}>{req.yes || "OK"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
