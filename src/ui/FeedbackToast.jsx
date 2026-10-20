import React from "react";

// The game's messages: one small toast at a time, floating over the page (bottom-right on
// a desktop, bottom-centre above the home indicator on a phone) instead of a strip that
// pushes the screen down. App.jsx queues them so each one gets its full time; tap a toast
// to move on to the next. The football game's look: dark card, green edge, amber for a
// warning.
const WARN = /⚠️|failed|blocked|invalid|rejected|not enough|cannot|can't|won't|declined|paused|stopped|error|injur|unhappy|over the|max \d|need|no longer|isn't|aren't|closed/i;
export const toastTone = (msg) => (WARN.test(String(msg)) ? "warn" : "ok");

export default function FeedbackToast({ toast, waiting = 0, onDismiss }) {
  return (
    <div className="rk-toasts" role="status" aria-live="polite">
      {toast && (
        <div key={toast.id} className={`rk-toast t-${toastTone(toast.msg)}`} onClick={onDismiss} title={waiting ? "Tap for the next message" : "Tap to dismiss"}>
          <span className="rk-toast-msg">{toast.msg}</span>
          {waiting > 0 && <span className="rk-toast-more" aria-label={`${waiting} more message${waiting === 1 ? "" : "s"}`}>+{waiting}</span>}
        </div>
      )}
    </div>
  );
}
