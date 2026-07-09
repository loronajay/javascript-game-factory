// Pure squad data + selection rules. No DOM, no engine — just the vocabulary the
// squad pickers (inline strip + roster modal) and tests share. Keeping this
// renderer-independent means the roster modal and a future draft/blind-pick
// controller can both drive the same rules without importing each other's UI.
import { UNIT_TYPES } from "../core/unitCatalog.js";
import { STARTER_UNIT_TYPES, isProgressUnitUnlocked } from "../progression/unlocks.js";
import { normalizeSkinLoadout } from "./skinModel.js";

export const UNIT_CLASS_GROUPS = Object.freeze([
  Object.freeze({ id: "melee", label: "Melees" }),
  Object.freeze({ id: "ranger", label: "Rangers" }),
  Object.freeze({ id: "support", label: "Supports" }),
  Object.freeze({ id: "mage", label: "Mages" }),
  Object.freeze({ id: "tank", label: "Tanks" }),
  Object.freeze({ id: "summon", label: "Summons" })
]);

// Summons (Ghouls) are raised in-match, never drafted, so they are not pickable.
export const UNIT_TYPE_KEYS = Object.keys(UNIT_TYPES).filter((key) => !UNIT_TYPES[key].summon);
export const DEFAULT_SQUAD = ["swordsman", "archer", "mystic", "magician"];
export const SQUAD_SIZE = DEFAULT_SQUAD.length;

// Campaign unlock gate. Player-facing squad pickers read the thin progression
// record. CPU squads and
// scripted tutorial battles build units directly through core/state.js, so
// authored encounters can still field locked units.
export { STARTER_UNIT_TYPES };

export function isUnitUnlocked(type, storage = globalThis.localStorage) {
  return isProgressUnitUnlocked(type, storage);
}

// The four corner-spawn cells, labelled front/back to mirror the staging block.
export const SLOT_LAYOUT = [
  { index: 0, row: "front" },
  { index: 1, row: "front" },
  { index: 2, row: "back" },
  { index: 3, row: "back" }
];

// Force any input into a valid SQUAD_SIZE squad of known unit types.
export function normalizeSquad(squad) {
  const out = [];
  for (let i = 0; i < SQUAD_SIZE; i += 1) {
    const type = squad?.[i];
    out.push(UNIT_TYPE_KEYS.includes(type) ? type : DEFAULT_SQUAD[i]);
  }
  return out;
}

export function normalizeSquadLoadout(loadout, skins = null) {
  const compositionInput = Array.isArray(loadout)
    ? loadout
    : (loadout?.composition ?? loadout?.squad ?? loadout?.units);
  const composition = normalizeSquad(compositionInput);
  const skinInput = skins ?? (Array.isArray(loadout) ? null : loadout?.skins);
  return {
    composition,
    skins: normalizeSkinLoadout(composition, skinInput)
  };
}

// Which roster types may fill `slotIndex` given the rest of the squad. With
// duplicates allowed (hot-seat / blind / casual) every type is selectable; with
// duplicates blocked (draft / ranked) a type already used in another slot is out.
export function availableTypesForSlot(squad, slotIndex, allowDuplicates = true, storage = globalThis.localStorage) {
  const unlocked = UNIT_TYPE_KEYS.filter((type) => isUnitUnlocked(type, storage));
  if (allowDuplicates) return unlocked;
  const usedElsewhere = new Set(squad.filter((_, i) => i !== slotIndex));
  return unlocked.filter((type) => !usedElsewhere.has(type));
}

export function groupedUnitTypes(types = UNIT_TYPE_KEYS) {
  return UNIT_CLASS_GROUPS.map((group) => ({
    ...group,
    types: types.filter((type) => UNIT_TYPES[type]?.classType === group.id)
  })).filter((group) => group.types.length > 0);
}
