// Options picked on the title screen for a new franchise (Gridiron 1.94): whether the owner can
// fire you, and whether the first draft classes carry the real 2027 and 2028 prospects
// (src/data/realProspects.js) or are generated like every later class.
import { stream } from "./rng.js";
import { randomNameWith } from "./names.js";
import { makeBio } from "./scouting.js";

const PROSPECT_LEAGUES = ["OHL", "WHL", "QMJHL", "NCAA", "Liiga", "SHL"];

export function applyNewGameOptions(league, { firing = false, realDraft = true } = {}) {
  league.settings ||= {};
  league.settings.firing = !!firing;
  league.settings.realDraft = realDraft !== false;
  if (realDraft !== false) return league;
  // Generated classes: prospects seeded with a real identity get a generated one instead, in the
  // class already on the board and on the early watch lists for the classes after it.
  for (const id of league.draftClass || []) {
    const p = league.players[id];
    if (!p || !(p.realIdentity || p.identitySource)) continue;
    const n = randomNameWith(stream(`${league.startYear}|generated-class|${id}`));
    p.name = n.name;
    p.nat = n.nat;
    delete p.realIdentity;
    delete p.identitySource;
    p.bio = makeBio(p);
  }
  for (const [year, list] of Object.entries(league.futureClasses || {})) {
    (list || []).forEach((w, i) => {
      if (!w?.source) return;
      const r = stream(`${league.startYear}|generated-watch|${year}|${i}`), n = randomNameWith(r);
      list[i] = { ...w, name: n.name, nat: n.nat, lg: r.pick(PROSPECT_LEAGUES), team: "Club to be confirmed", source: null };
    });
  }
  return league;
}
