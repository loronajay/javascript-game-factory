// CPU-AI metadata schema (see CPU_AI_METADATA_SCHEMA.md): the intent/role
// vocabularies and the normalizers that give every unit/art well-formed AI
// hints. Consumed by src/ai/; unitCatalog re-exports the surface.

import { getUnitType } from "./unitRegistry.js";

export const AI_INTENTS = Object.freeze([
  "strike", "statusCast", "coneAoe", "selfBlast", "healAllies",
  "tilePulse", "reposition", "rush", "summon", "placeObject", "defend",
  // Self/team support casts with no enemy target (Witch Doctor's Fire/Spirit/
  // Misfortune/Black Death dances): buff allies, cleanse, or shift stance.
  "buffAllies",
  // Father Time's ally-OR-enemy single-target utility + revive:
  //   statBuff — Age: persistent +stat on an ally / -stat on an enemy.
  //   hasten   — Time Stretch: +MOVE on an ally / Slow on an enemy.
  //   revive   — Rewind: return a fallen ally to the board.
  "statBuff", "hasten", "revive",
  // Juggernaut's line abilities + self MP vent:
  //   grab       — Tether Grab: pull the first ally/enemy on a straight ray.
  //   lineStrike — Rocket Punch: strike the first enemy on a straight ray (+ stun).
  //   recharge   — Recharge: restore this unit's own MP (or 1 HP at full MP).
  "grab", "lineStrike", "recharge",
  // The King's global one-turn team buffs (Strike/Hold/Pursue/Higher Ground):
  "commandBuff",
  // Angel's single-ally targeted buff (Anoint: +1 range on a friendly unit):
  "buffAlly", "healAlly",
  // Mystic's single-ally targeted cleanse (Purify: remove all statuses):
  "cleanseAlly",
  // Monk's guarded ally reposition + defend handoff:
  "protectAlly",
  // Gargoyle's abilities:
  //   flightStrike — Flight: reposition (Move + 1) then a small TRUE blast on landing.
  //   lineBurst    — Pyroclasm: hit every enemy on any of the 8 straight rays in range.
  "flightStrike", "lineBurst",
  // Virus's contagion casts:
  //   statusAoe    — Smog: a self-centred blind cloud (no damage, no roll).
  //   poisonBurst  — Poison Tick / Explosion: true damage to every poisoned enemy.
  "statusAoe", "poisonBurst", "displaceAoe",
  // Clod's Thunderous Charge: a RANGE-picked tile that detonates a radius blast (damage +
  // a mass stun) — a targeted-tile AoE, distinct from the self-centred selfBlast.
  "targetedBlast"
]);
export const AI_ROLES = Object.freeze([
  "bruiser", "skirmisher", "ranged", "caster", "support", "controller", "summon"
]);

export const DEFAULT_UNIT_AI = Object.freeze({ threatValue: 10, role: "skirmisher", protect: false });

// Normalized unit-level AI metadata, with safe fallbacks for any unannotated unit.
// `protect` defaults true for support/caster roles when omitted.
export function normalizeUnitAi(definitionOrType) {
  const definition = typeof definitionOrType === "string" ? getUnitType(definitionOrType) : definitionOrType;
  const ai = definition?.ai ?? {};
  return {
    threatValue: Number.isFinite(ai.threatValue) ? ai.threatValue : DEFAULT_UNIT_AI.threatValue,
    role: AI_ROLES.includes(ai.role) ? ai.role : DEFAULT_UNIT_AI.role,
    protect: typeof ai.protect === "boolean" ? ai.protect : (ai.role === "support" || ai.role === "caster")
  };
}

// Normalized art-level AI metadata. An active art missing `ai` degrades to a plain
// `strike` so the planner can still offer it; tags/evHints/priority get empty/neutral
// defaults.
export function normalizeArtAi(art) {
  const ai = art?.ai ?? {};
  return {
    intent: AI_INTENTS.includes(ai.intent) ? ai.intent : "strike",
    tags: Array.isArray(ai.tags) ? ai.tags : [],
    evHints: ai.evHints ?? {},
    priority: Number.isFinite(ai.priority) ? ai.priority : 1
  };
}
