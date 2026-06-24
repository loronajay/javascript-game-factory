// Squad composition: the per-player choice of which four unit types spawn, in
// spawn-slot order. Pure and headless so the setup screens, the online wire,
// and createMatchState all validate compositions through the exact same path.
//
// A composition is an array of four unit-type keys mapped to the four spawn
// tiles in createSquad (state/gameState.js):
//   index 0 -> front-inner   1 -> inner-side   2 -> outer-side   3 -> corner
// The DEFAULT_COMPOSITION reproduces the classic tank/medic/warrior/ranger
// placement, so a null/absent composition is byte-identical to the original.

import { UNIT_TYPES } from "../config.js";

export const SQUAD_SIZE = 4;

// Selectable unit types, in a stable order for builder UIs to cycle through.
export const UNIT_TYPE_KEYS = Object.freeze(Object.keys(UNIT_TYPES));

export const DEFAULT_COMPOSITION = Object.freeze([
  "tank",
  "medic",
  "warrior",
  "ranger",
]);

// Coerce arbitrary input into a valid 4-type composition. Unknown or missing
// entries fall back to the default squad's type at that slot; the result is
// always exactly SQUAD_SIZE valid entries. Idempotent.
export function normalizeComposition(composition) {
  if (!Array.isArray(composition)) return [...DEFAULT_COMPOSITION];
  const result = [];
  for (let index = 0; index < SQUAD_SIZE; index += 1) {
    const type = composition[index];
    result.push(UNIT_TYPES[type] ? type : DEFAULT_COMPOSITION[index]);
  }
  return result;
}

// Normalize a { seat: composition } map. Returns null when nothing usable is
// supplied so the default-squad spawn path stays byte-identical to the classic
// duel (mirrors normalizeTeamNames in core/state.js).
export function normalizeCompositions(compositions) {
  if (!compositions || typeof compositions !== "object") return null;
  const cleaned = {};
  for (const [seat, comp] of Object.entries(compositions)) {
    cleaned[seat] = normalizeComposition(comp);
  }
  return Object.keys(cleaned).length ? cleaned : null;
}
