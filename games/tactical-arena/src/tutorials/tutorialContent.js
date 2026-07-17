// Tutorial DEFINITIONS: ids, the catalog, authored board/roll constants, the
// per-tutorial factories, and the opening prompt/dialogue scripts. Pure content —
// the runtime engine, scripted CPU, and persistence live in sibling modules.

import { attack, defend } from "../core/commands.js";

export const TUTORIAL_BASICS_ID = "basics";
export const TUTORIAL_ARTS_MP_ID = "arts-mp";
export const TUTORIAL_DAMAGE_TYPES_ID = "damage-types";
export const TUTORIAL_RAGE_ID = "rage-status";
export const TUTORIAL_STATUS_EFFECTS_ID = "status-effects";
export const TUTORIAL_ARTS_PLAYER_ARCHER_ID = "p1-0-archer";
export const TUTORIAL_ARTS_PLAYER_MYSTIC_ID = "p1-1-mystic";
export const TUTORIAL_ARTS_CPU_ARCHER_ID = "p2-3-archer";
export const TUTORIAL_DAMAGE_TYPES_PLAYER_SWORDSMAN_ID = "p1-0-swordsman";
export const TUTORIAL_DAMAGE_TYPES_PLAYER_MAGICIAN_ID = "p1-1-magician";
export const TUTORIAL_DAMAGE_TYPES_CPU_CLOD_ID = "p2-0-clod";
export const TUTORIAL_RAGE_PLAYER_MAGICIAN_ID = "p1-0-magician";
export const TUTORIAL_RAGE_PLAYER_ARCHER_ID = "p1-1-archer";
export const TUTORIAL_RAGE_CPU_GHOUL_IDS = Object.freeze(["p2-0-ghoul", "p2-1-ghoul", "p2-2-ghoul"]);
export const TUTORIAL_RAGE_CPU_SWORDSMAN_ID = "p2-3-swordsman";
export const TUTORIAL_RAGE_CPU_MAGICIAN_ID = "p2-4-magician";
export const TUTORIAL_STATUS_PLAYER_SWORDSMAN_ID = "p1-0-swordsman";
export const TUTORIAL_STATUS_PLAYER_MAGICIAN_ID = "p1-1-magician";
export const TUTORIAL_STATUS_PLAYER_ARCHER_ID = "p1-2-archer";
export const TUTORIAL_STATUS_PLAYER_VIRUS_ID = "p1-3-virus";
export const TUTORIAL_STATUS_PLAYER_MYSTIC_ID = "p1-status-mystic";
export const TUTORIAL_STATUS_CPU_SWORDSMAN_ID = "p2-0-swordsman";
export const TUTORIAL_STATUS_CPU_MAGICIAN_ID = "p2-1-magician";
export const TUTORIAL_STATUS_CPU_MYSTIC_ID = "p2-2-mystic";
export const TUTORIAL_STATUS_CPU_FAT_BOWMAN_ID = "p2-3-fat-bowman";
export const TUTORIAL_CATALOG = Object.freeze([
  Object.freeze({
    id: TUTORIAL_BASICS_ID,
    title: "Tutorial 1",
    subtitle: "The Basics",
    description: "Turns, movement, defending, basic attacks, misses, kiting, and critical hits.",
    available: true,
  }),
  Object.freeze({
    id: TUTORIAL_ARTS_MP_ID,
    title: "Tutorial 2",
    subtitle: "ARTS and MP",
    description: "Check ART ranges, set up Volley Shot, learn about MP, and target allies with Pray.",
    available: true,
  }),
  Object.freeze({
    id: TUTORIAL_DAMAGE_TYPES_ID,
    title: "Tutorial 3",
    subtitle: "Damage Types",
    description: "Learn about the 3 damage types in Tactical Arena.",
    available: true,
  }),
  Object.freeze({
    id: TUTORIAL_RAGE_ID,
    title: "Tutorial 4",
    subtitle: "RAGE Status",
    description: "See the RAGE threshold unlock unique ARTS and passives, then use them to break out of a deadly trap.",
    available: true,
  }),
  Object.freeze({
    id: TUTORIAL_STATUS_EFFECTS_ID,
    title: "Tutorial 5",
    subtitle: "Status Effects and Immunities",
    description: "Blind, silence, poison spread, cleanse answers, and status immunities.",
    available: true,
  }),
]);
export const TUTORIAL_IDS = Object.freeze(TUTORIAL_CATALOG.map((tutorial) => tutorial.id));

export const TUTORIAL_SQUAD = Object.freeze(["archer"]);
export const PLAYER_ARCHER_ID = "p1-0-archer";
export const CPU_ARCHER_ID = "p2-0-archer";

export const BASICS_PLAYER_IDS = Object.freeze([PLAYER_ARCHER_ID]);

export const NORMAL_HIT = Object.freeze({ attackRoll: 0.5, critRoll: 0.99 });
export const FORCED_MISS = Object.freeze({ attackRoll: 0.01 });
export const FORCED_CRIT = Object.freeze({ attackRoll: 0.5, critRoll: 0.01 });
export const ARTS_MP_ARCHER_MOVE = Object.freeze({ x: 4, y: 5 });
export const ARTS_MP_VOLLEY_ORIGIN = Object.freeze({ x: 5, y: 5 });
export const ARTS_MP_ENEMY_IDS = Object.freeze(["p2-0-ghoul", "p2-1-ghoul", "p2-2-ghoul", TUTORIAL_ARTS_CPU_ARCHER_ID]);
export const DAMAGE_TYPES_SWORDSMAN_MOVE = Object.freeze({ x: 7, y: 6 });
export const DAMAGE_TYPES_FOOTWORK_PATH = Object.freeze([
  Object.freeze({ x: 8, y: 6 }),
  Object.freeze({ x: 9, y: 6 }),
  Object.freeze({ x: 10, y: 6 }),
  Object.freeze({ x: 10, y: 5 }),
  Object.freeze({ x: 9, y: 5 }),
  Object.freeze({ x: 8, y: 5 }),
]);
export const RAGE_TRAP_CENTER = Object.freeze({ x: 6, y: 6 });
export const RAGE_GHOUL_POSITIONS = Object.freeze({
  "p2-0-ghoul": Object.freeze({ x: 6, y: 5 }),
  "p2-1-ghoul": Object.freeze({ x: 6, y: 7 }),
  "p2-2-ghoul": Object.freeze({ x: 5, y: 6 }),
});
export const RAGE_SWORDSMAN_POSITION = Object.freeze({ x: 7, y: 6 });
export const RAGE_SWORDSMAN_HP = 10;
export const RAGE_MAGICIAN_HP = 4;
export const RAGE_ARCHER_HP = 4;
export const RAGE_CPU_MAGICIAN_POSITION = Object.freeze({ x: 11, y: 6 });
export const RAGE_ARCHER_START = Object.freeze({ x: 5, y: 6 });
export const RAGE_ARCHER_RETREAT = Object.freeze({ x: 3, y: 6 });
export const STATUS_BLIND_PLAYER_SWORDSMAN_POSITION = Object.freeze({ x: 2, y: 3 });
export const STATUS_BLIND_CPU_SWORDSMAN_POSITION = Object.freeze({ x: 3, y: 3 });
export const STATUS_SILENCE_PLAYER_MAGICIAN_POSITION = Object.freeze({ x: 0, y: 3 });
export const STATUS_SILENCE_PLAYER_SWORDSMAN_POSITION = Object.freeze({ x: 3, y: 2 });
export const STATUS_SILENCE_PLAYER_MYSTIC_POSITION = Object.freeze({ x: 3, y: 4 });
export const STATUS_SILENCE_CPU_MAGICIAN_POSITION = Object.freeze({ x: 4, y: 3 });
export const STATUS_POISON_PLAYER_ARCHER_POSITION = Object.freeze({ x: 1, y: 3 });
export const STATUS_POISON_PLAYER_VIRUS_POSITION = Object.freeze({ x: 0, y: 5 });
export const STATUS_POISON_CPU_FAT_BOWMAN_POSITION = Object.freeze({ x: 4, y: 3 });
export const STATUS_POISON_CPU_MYSTIC_POSITION = Object.freeze({ x: 5, y: 4 });

export function createTutorialMatchConfig(tutorialId = TUTORIAL_BASICS_ID) {
  const artsMp = tutorialId === TUTORIAL_ARTS_MP_ID;
  const damageTypes = tutorialId === TUTORIAL_DAMAGE_TYPES_ID;
  const rage = tutorialId === TUTORIAL_RAGE_ID;
  const statusEffects = tutorialId === TUTORIAL_STATUS_EFFECTS_ID;
  return {
    mode: "tutorial",
    tutorialId: artsMp ? TUTORIAL_ARTS_MP_ID : damageTypes ? TUTORIAL_DAMAGE_TYPES_ID : rage ? TUTORIAL_RAGE_ID : statusEffects ? TUTORIAL_STATUS_EFFECTS_ID : TUTORIAL_BASICS_ID,
    size: statusEffects ? 7 : 13,
    seed: artsMp ? 23 : damageTypes ? 31 : rage ? 41 : statusEffects ? 53 : 7,
    squads: artsMp
      ? { 1: ["archer", "mystic"], 2: ["ghoul", "ghoul", "ghoul", "archer"] }
      : damageTypes
        ? { 1: ["swordsman", "magician"], 2: ["clod"] }
      : rage
        ? { 1: ["magician", "archer"], 2: ["ghoul", "ghoul", "ghoul", "swordsman"] }
      : statusEffects
        ? { 1: ["swordsman", "magician", "archer", "virus"], 2: ["swordsman", "magician", "mystic", "fat-bowman"] }
      : { 1: [...TUTORIAL_SQUAD], 2: [...TUTORIAL_SQUAD] },
    skins: artsMp
      ? { 1: [null, null], 2: [null, null, null, null] }
      : damageTypes
        ? { 1: [null, null], 2: [null] }
      : rage
        ? { 1: [null, null], 2: [null, null, null, null] }
      : statusEffects
        ? { 1: [null, null, null, null], 2: [null, null, null, null] }
      : { 1: [null, null, null, null], 2: [null, null, null, null] },
  };
}

export function createTutorial(tutorialId = TUTORIAL_BASICS_ID) {
  if (tutorialId === TUTORIAL_DAMAGE_TYPES_ID) return createDamageTypesTutorial();
  if (tutorialId === TUTORIAL_RAGE_ID) return createRageTutorial();
  if (tutorialId === TUTORIAL_STATUS_EFFECTS_ID) return createStatusEffectsTutorial();
  return tutorialId === TUTORIAL_ARTS_MP_ID ? createArtsMpTutorial() : createBasicsTutorial();
}

export function createBasicsTutorial() {
  return {
    id: TUTORIAL_BASICS_ID,
    stage: "practice_defense",
    completed: false,
    prompt: openingPrompt(),
    dialogue: openingDialogue(),
  };
}

export function createArtsMpTutorial() {
  return {
    id: TUTORIAL_ARTS_MP_ID,
    stage: "check_volley_range",
    completed: false,
    prompt: artsMpOpeningPrompt(),
    dialogue: artsMpOpeningDialogue(),
  };
}

export function createDamageTypesTutorial() {
  return {
    id: TUTORIAL_DAMAGE_TYPES_ID,
    stage: "await_swordsman_attack",
    completed: false,
    prompt: damageTypesOpeningPrompt(),
    dialogue: damageTypesOpeningDialogue(),
  };
}

export function createRageTutorial() {
  return {
    id: TUTORIAL_RAGE_ID,
    stage: "await_nuke",
    completed: false,
    prompt: rageOpeningPrompt(),
    dialogue: rageOpeningDialogue(),
  };
}

export function createStatusEffectsTutorial() {
  return {
    id: TUTORIAL_STATUS_EFFECTS_ID,
    stage: "await_moonstrike",
    completed: false,
    prompt: statusEffectsOpeningPrompt(),
    dialogue: statusEffectsOpeningDialogue(),
  };
}

export function openingPrompt() {
  return "Tutorial 1: The Basics. Activate your Archer, move with a tile click/tap or key 1, then Defend with the button or key 3.";
}

export function openingDialogue() {
  return [
    {
      name: "Instructor",
      text: "Each squad turn, every living unit gets one activation. A clean starter turn is Move, then Defend.",
    },
    {
      speakerId: PLAYER_ARCHER_ID,
      text: "Select me, choose useful ground, then use key 3 to defend. The enemy Archer will do the same.",
    },
  ];
}

export function artsMpOpeningPrompt() {
  return "Tutorial 2: ARTS and MP. Activate your Archer, choose Volley Shot, check the cone, then cancel the check with Escape when you see the enemy line is out of reach.";
}

export function artsMpOpeningDialogue() {
  return [
    {
      name: "Instructor",
      text: "ARTS are chosen from the action bar after a unit activates. They spend MP and usually replace the whole activation.",
    },
    {
      speakerId: TUTORIAL_ARTS_PLAYER_ARCHER_ID,
      text: "Volley Shot uses a cone. I should check the range first, then cancel the check if the line is not there.",
    },
  ];
}

export function damageTypesOpeningPrompt() {
  return "Tutorial 3: Damage Types. Activate your Swordsman, move to the marked adjacent tile, then attack Clod.";
}

export function damageTypesOpeningDialogue() {
  return [
    {
      name: "Instructor",
      text: "Damage comes in three types. Physical damage is checked against DEF, so heavily armored targets can reduce it to a scrape.",
    },
    {
      name: "Instructor",
      text: "Magic ignores DEF, but Defend still halves it. True damage ignores both defensive stats and the Defend stance.",
    },
    {
      speakerId: TUTORIAL_DAMAGE_TYPES_PLAYER_SWORDSMAN_ID,
      text: "So blade first, footwork second, spell last. I can feel the lesson forming.",
    },
  ];
}

export function rageOpeningPrompt() {
  return "Tutorial 4: RAGE. Activate your Magician and use Nuke to blast every enemy caught in the trap.";
}

export function rageOpeningDialogue() {
  return [
    {
      name: "Instructor",
      text: "RAGE triggers automatically once a unit's HP drops to 5 or lower.",
    },
    {
      name: "Instructor",
      text: "While raging, many units unlock ARTS or passives that stay locked away at full health — tools built for exactly this kind of trouble.",
    },
    {
      name: "Instructor",
      text: "Look at your position. Your Magician is raging and boxed in on all four sides: up, down, left, and right. There is nowhere left to walk.",
    },
    {
      speakerId: TUTORIAL_RAGE_PLAYER_MAGICIAN_ID,
      text: "No footing to retreat to. But RAGE means Nuke is finally mine to cast.",
    },
    {
      name: "Instructor",
      text: "Activate the Magician and use Nuke. It will detonate on every enemy within reach at once.",
    },
  ];
}

export function statusEffectsOpeningPrompt() {
  return "Tutorial 5: Status Effects and Immunities. Activate your 1 HP Swordsman and use Moonstrike on the enemy Swordsman.";
}

export function statusEffectsOpeningDialogue() {
  return [
    {
      name: "Instructor",
      text: "Status effects are debuffs that change what a unit can safely do: blind makes attacks miss, silence locks ARTS, poison chips HP, slow cuts MOVE, and stun skips a unit.",
    },
    {
      name: "Instructor",
      text: "Immunities stop specific statuses before they land. Archer's Emblem blocks poison, Mystic is immune to silence, and fully protected units like Paladin ignore the whole status package.",
    },
    {
      speakerId: TUTORIAL_STATUS_PLAYER_SWORDSMAN_ID,
      text: "One hit point against a fresh Swordsman is ugly. If Moonstrike blinds him, his answer cannot connect.",
    },
  ];
}
