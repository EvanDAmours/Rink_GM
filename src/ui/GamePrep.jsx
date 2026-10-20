// Game Prep (Gridiron 3.34 Week Prep): opened from the gameday card on Home. Opponent report and
// game plan on one side; a Ready Check on the other (injured regulars without a replacement, an
// unset plan, a tired goalie, empty development focus…), each with a one-tap fix.
import React from "react";
import { Modal } from "./common.jsx";

export default function GamePrep({ onClose }) {
  return <Modal title="Game prep" onClose={onClose}><p className="muted">Coming soon.</p></Modal>;
}
