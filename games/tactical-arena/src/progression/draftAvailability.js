import { UNIT_TYPES } from "../core/unitCatalog.js";
import { readUnlockProgress } from "./unlocks.js";

export const DRAFT_BATTLE_REQUIRED_UNITS = 8;

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
