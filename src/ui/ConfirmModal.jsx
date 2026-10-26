import React from "react";
import { Dialog, DBtn } from "./common.jsx";

// In-page replacement for window.confirm, which embedded viewers suppress.
export default function ConfirmModal({ req, onAnswer }) {
  return (
    <Dialog title={req.title} sub={req.body} onClose={() => onAnswer(false)} className="rk-confirm"
      actions={<><DBtn onClick={() => onAnswer(false)}>{req.no || "Cancel"}</DBtn><DBtn kind={req.danger ? "danger" : "primary"} autoFocus onClick={() => onAnswer(true)}>{req.yes || "OK"}</DBtn></>} />
  );
}
