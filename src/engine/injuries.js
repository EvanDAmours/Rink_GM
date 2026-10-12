import {syncLines} from './lines.js';

export function setInjuriesEnabled(league, enabled) {
  league.settings ||= {};
  league.settings.injuries = Boolean(enabled);
  let healed = 0;
  if (!enabled) {
    for (const p of Object.values(league.players)) {
      if (p.injury > 0 || p.ltir) healed++;
      p.injury = 0;
      delete p.injuryNote;
      delete p.ltir;
    }
    for (const t of league.teams) {
      delete t.ltirUnused;
      if (t.lines) syncLines(league, t);
    }
  }
  return healed;
}
