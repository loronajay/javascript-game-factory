import { UNIT_TYPES } from "../core/unitCatalog.js";
import { readUnlockProgress } from "./unlocks.js";

export const DRAFT_BATTLE_REQUIRED_UNITS = 8;

// Ranked runs a ban phase (1 ban per side — see RANKED_BANS_PER_SEAT in
// ui/draftModel.js) BEFORE the draft. A ban or an opponent's pick can remove a champ
// you meant to draft, so a ranked-eligible pool is the plain-draft pool plus one owned
// unit per ban. That guarantees a player can still assemble a legal 4-unit squad no
// matter what the ban phase and the opponent's picks take out of the shared pool.
export const RANKED_TOTAL_BANS = 2;
export const RANKED_BATTLE_REQUIRED_UNITS = DRAFT_BATTLE_REQUIRED_UNITS + RANKED_TOTAL_BANS;

export function isDraftableProgressionUnit(type) {
  const def = UNIT_TYPES[type];
  return Boolean(def && !def.summon);
}

export function unlockedDraftUnitCount(storage = globalThis.localStorage) {
  const unlocked = new Set(readUnlockProgress(storage).unlockedUnits);
  return Object.keys(UNIT_TYPES).filter((type) => unlocked.has(type) && isDraftableProgressionUnit(type)).length;
}

export function isDraftBattleAvailable(storage = globalThis.localStorage) {
  return unlockedDraftUnitCount(storage) >= DRAFT_BATTLE_REQUIRED_UNITS;
}

export function isRankedBattleAvailable(storage = globalThis.localStorage) {
  return unlockedDraftUnitCount(storage) >= RANKED_BATTLE_REQUIRED_UNITS;
}
