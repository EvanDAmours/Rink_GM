// The big moments (Gridiron 3.0): the dispatcher. The engine queues moments (engine/moments.js);
// the app shows the first one once the sim stops. Each family draws its own kinds:
//   ui/moments/season.jsx · cup.jsx · results.jsx · scouting.jsx · draftnight.jsx · development.jsx
// A family file exports { kind: Component }; a component gets { m, onClose } and usually renders
// MomentFrame from ./MomentFrame.jsx. Unknown kinds fall back to BasicMoment (kicker/title/sub/lines).
import React from "react";
import { BasicMoment } from "./MomentFrame.jsx";
import { SEASON_MOMENTS } from "./moments/season.jsx";
import { CUP_MOMENTS } from "./moments/cup.jsx";
import { RESULT_MOMENTS } from "./moments/results.jsx";
import { SCOUTING_MOMENTS } from "./moments/scouting.jsx";
import { DRAFT_MOMENTS } from "./moments/draftnight.jsx";
import { DEV_MOMENTS } from "./moments/development.jsx";

const REGISTRY = { ...SEASON_MOMENTS, ...CUP_MOMENTS, ...RESULT_MOMENTS, ...SCOUTING_MOMENTS, ...DRAFT_MOMENTS, ...DEV_MOMENTS };

export default function Moment({ m, onClose }) {
  if (!m) return null;
  const C = REGISTRY[m.kind] || BasicMoment;
  return <C m={m} onClose={onClose} />;
}
