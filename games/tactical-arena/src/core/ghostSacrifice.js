import { findUnit } from "./state.js";
import { markSelfInflicted } from "./killAttribution.js";

export function isBeckonedGhost(unit, state) {
  if (!unit?.ghost) return false;
  if (unit.ghostArtId === "beckon") return true;
  return state?.activation?.unitId === unit.id && state.activation.summonerArtId === "beckon";
}

// Spending a Beckoned ghost consumes the summoner that called it. That is a
// self-sacrifice, never anybody's kill, so the summoner is tagged self-inflicted here;
// whichever credit scope sweeps it next announces the death but credits nobody. Without
// the tag it would be blamed on whoever the ghost happened to be fighting.
export function applyBeckonedGhostSacrifice(state, actor) {
  if (!isBeckonedGhost(actor, state)) return null;
  const summonerId = state.activation?.unitId === actor.id
    ? state.activation.summonerId
    : actor.summonerId;
  const summoner = summonerId ? findUnit(state, summonerId) : null;
  if (!summoner || summoner.hp <= 0) return null;
  summoner.hp = 0;
  summoner.defending = false;
  markSelfInflicted(summoner);
  return summoner;
}
