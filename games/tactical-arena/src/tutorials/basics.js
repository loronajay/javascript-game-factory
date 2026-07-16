import { COMMANDS, attack, beginActivation, defend, finishActivation, moveUnit, useArt } from "../core/commands.js";
import { areEnemies, findUnit, livingUnits } from "../core/state.js";
import { getEffectiveStats, getInitialMp, getUnitType, takesTurns } from "../core/unitCatalog.js";
import { getLegalMoves, positionKey } from "../rules/movement.js";
import { isShotBlocked, isWallBetween } from "../rules/combat.js";
import {
  TUTORIAL_JUGGERNAUT_REWARD_UNIT,
  TUTORIAL_PROGRESS_KEY,
  TUTORIAL_REWARD_SKIN_CHOICES,
  TUTORIAL_VALOR_REWARD,
  normalizeUnlockProgress,
  readUnlockProgress,
  writeUnlockProgress
} from "../progression/unlocks.js";
import { enqueueDraftBattleUnlockAnnouncement, enqueueUnitUnlockAnnouncements, enqueueValorGainAnnouncement } from "../progression/announcements.js";

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
export { TUTORIAL_PROGRESS_KEY, TUTORIAL_REWARD_SKIN_CHOICES };

export const TUTORIAL_SQUAD = Object.freeze(["archer"]);
export const PLAYER_ARCHER_ID = "p1-0-archer";
export const CPU_ARCHER_ID = "p2-0-archer";

const BASICS_PLAYER_IDS = Object.freeze([PLAYER_ARCHER_ID]);

const NORMAL_HIT = Object.freeze({ attackRoll: 0.5, critRoll: 0.99 });
const FORCED_MISS = Object.freeze({ attackRoll: 0.01 });
const FORCED_CRIT = Object.freeze({ attackRoll: 0.5, critRoll: 0.01 });
const ARTS_MP_ARCHER_MOVE = Object.freeze({ x: 4, y: 5 });
const ARTS_MP_VOLLEY_ORIGIN = Object.freeze({ x: 5, y: 5 });
const ARTS_MP_ENEMY_IDS = Object.freeze(["p2-0-ghoul", "p2-1-ghoul", "p2-2-ghoul", TUTORIAL_ARTS_CPU_ARCHER_ID]);
const DAMAGE_TYPES_SWORDSMAN_MOVE = Object.freeze({ x: 7, y: 6 });
const DAMAGE_TYPES_FOOTWORK_PATH = Object.freeze([
  Object.freeze({ x: 8, y: 6 }),
  Object.freeze({ x: 9, y: 6 }),
  Object.freeze({ x: 10, y: 6 }),
  Object.freeze({ x: 10, y: 5 }),
  Object.freeze({ x: 9, y: 5 }),
  Object.freeze({ x: 8, y: 5 }),
]);
const RAGE_TRAP_CENTER = Object.freeze({ x: 6, y: 6 });
const RAGE_GHOUL_POSITIONS = Object.freeze({
  "p2-0-ghoul": Object.freeze({ x: 6, y: 5 }),
  "p2-1-ghoul": Object.freeze({ x: 6, y: 7 }),
  "p2-2-ghoul": Object.freeze({ x: 5, y: 6 }),
});
const RAGE_SWORDSMAN_POSITION = Object.freeze({ x: 7, y: 6 });
const RAGE_SWORDSMAN_HP = 10;
const RAGE_MAGICIAN_HP = 4;
const RAGE_ARCHER_HP = 4;
const RAGE_CPU_MAGICIAN_POSITION = Object.freeze({ x: 11, y: 6 });
const RAGE_ARCHER_START = Object.freeze({ x: 5, y: 6 });
const RAGE_ARCHER_RETREAT = Object.freeze({ x: 3, y: 6 });
const STATUS_BLIND_PLAYER_SWORDSMAN_POSITION = Object.freeze({ x: 2, y: 3 });
const STATUS_BLIND_CPU_SWORDSMAN_POSITION = Object.freeze({ x: 3, y: 3 });
const STATUS_SILENCE_PLAYER_MAGICIAN_POSITION = Object.freeze({ x: 0, y: 3 });
const STATUS_SILENCE_PLAYER_SWORDSMAN_POSITION = Object.freeze({ x: 3, y: 2 });
const STATUS_SILENCE_PLAYER_MYSTIC_POSITION = Object.freeze({ x: 3, y: 4 });
const STATUS_SILENCE_CPU_MAGICIAN_POSITION = Object.freeze({ x: 4, y: 3 });
const STATUS_POISON_PLAYER_ARCHER_POSITION = Object.freeze({ x: 1, y: 3 });
const STATUS_POISON_PLAYER_VIRUS_POSITION = Object.freeze({ x: 0, y: 5 });
const STATUS_POISON_CPU_FAT_BOWMAN_POSITION = Object.freeze({ x: 4, y: 3 });
const STATUS_POISON_CPU_MYSTIC_POSITION = Object.freeze({ x: 5, y: 4 });

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

export function prepareTutorialMatchState(match, tutorialId = TUTORIAL_BASICS_ID) {
  if (tutorialId === TUTORIAL_STATUS_EFFECTS_ID) {
    const positions = {
      [TUTORIAL_STATUS_PLAYER_SWORDSMAN_ID]: STATUS_BLIND_PLAYER_SWORDSMAN_POSITION,
      [TUTORIAL_STATUS_CPU_SWORDSMAN_ID]: STATUS_BLIND_CPU_SWORDSMAN_POSITION,
    };
    return {
      ...match,
      currentPlayer: 1,
      activation: null,
      units: match.units.map((unit) => {
        const definition = getUnitType(unit.type);
        const active = unit.id === TUTORIAL_STATUS_PLAYER_SWORDSMAN_ID || unit.id === TUTORIAL_STATUS_CPU_SWORDSMAN_ID;
        return {
          ...unit,
          position: { ...(positions[unit.id] ?? unit.position) },
          hp: unit.id === TUTORIAL_STATUS_PLAYER_SWORDSMAN_ID ? 1 : active ? definition.stats.maxHp : 0,
          mp: getInitialMp(definition),
          spent: !active,
          defending: false,
          statuses: [],
        };
      }),
    };
  }

  if (tutorialId === TUTORIAL_RAGE_ID) {
    const positions = {
      [TUTORIAL_RAGE_PLAYER_MAGICIAN_ID]: RAGE_TRAP_CENTER,
      ...RAGE_GHOUL_POSITIONS,
      [TUTORIAL_RAGE_CPU_SWORDSMAN_ID]: RAGE_SWORDSMAN_POSITION,
    };
    return {
      ...match,
      currentPlayer: 1,
      activation: null,
      units: match.units.map((unit) => {
        const definition = getUnitType(unit.type);
        const isArcher = unit.id === TUTORIAL_RAGE_PLAYER_ARCHER_ID;
        const isTrapMagician = unit.id === TUTORIAL_RAGE_PLAYER_MAGICIAN_ID;
        const isSwordsman = unit.id === TUTORIAL_RAGE_CPU_SWORDSMAN_ID;
        return {
          ...unit,
          position: { ...(positions[unit.id] ?? unit.position) },
          hp: isTrapMagician ? RAGE_MAGICIAN_HP : isArcher ? 0 : isSwordsman ? RAGE_SWORDSMAN_HP : definition.stats.maxHp,
          mp: getInitialMp(definition),
          spent: isArcher,
          defending: false,
        };
      }),
    };
  }

  if (tutorialId === TUTORIAL_DAMAGE_TYPES_ID) {
    const positions = {
      [TUTORIAL_DAMAGE_TYPES_PLAYER_SWORDSMAN_ID]: { x: 4, y: 6 },
      [TUTORIAL_DAMAGE_TYPES_PLAYER_MAGICIAN_ID]: { x: 4, y: 4 },
      [TUTORIAL_DAMAGE_TYPES_CPU_CLOD_ID]: { x: 8, y: 6 },
    };
    return {
      ...match,
      currentPlayer: 1,
      activation: null,
      units: match.units.map((unit) => {
        const definition = getUnitType(unit.type);
        return {
          ...unit,
          position: { ...(positions[unit.id] ?? unit.position) },
          hp: definition.stats.maxHp,
          mp: getInitialMp(definition),
          spent: unit.id === TUTORIAL_DAMAGE_TYPES_PLAYER_MAGICIAN_ID,
          defending: false,
        };
      }),
    };
  }

  if (tutorialId !== TUTORIAL_ARTS_MP_ID) return match;
  const positions = {
    [TUTORIAL_ARTS_PLAYER_ARCHER_ID]: { x: 2, y: 5 },
    [TUTORIAL_ARTS_PLAYER_MYSTIC_ID]: { x: 4, y: 6 },
    "p2-0-ghoul": { x: 8, y: 4 },
    "p2-1-ghoul": { x: 8, y: 6 },
    "p2-2-ghoul": { x: 8, y: 7 },
    [TUTORIAL_ARTS_CPU_ARCHER_ID]: { x: 8, y: 5 },
  };
  return {
    ...match,
    currentPlayer: 1,
    activation: null,
    units: match.units.map((unit) => {
      const position = positions[unit.id] ?? unit.position;
      const definition = getUnitType(unit.type);
      const hiddenMystic = unit.id === TUTORIAL_ARTS_PLAYER_MYSTIC_ID;
      return {
        ...unit,
        position: { ...position },
        hp: hiddenMystic ? 0 : definition.stats.maxHp,
        mp: getInitialMp(definition),
        spent: hiddenMystic ? true : false,
        defending: false,
      };
    }),
  };
}

export function prepareTutorialCommand(tutorial, command) {
  if (!tutorial || tutorial.completed) return command;

  if (tutorial.id === TUTORIAL_STATUS_EFFECTS_ID) {
    if (
      command?.type === COMMANDS.USE_ART &&
      command.unitId === TUTORIAL_STATUS_PLAYER_SWORDSMAN_ID &&
      command.artId === "moonstrike" &&
      tutorial.stage === "await_moonstrike"
    ) {
      return { ...command, ...FORCED_CRIT, effectRoll: 0.01 };
    }
    if (
      command?.type === COMMANDS.ATTACK &&
      command.actorId === TUTORIAL_STATUS_CPU_SWORDSMAN_ID &&
      tutorial.stage === "await_blinded_enemy_attack"
    ) {
      return { ...command, ...NORMAL_HIT };
    }
    if (
      command?.type === COMMANDS.USE_ART &&
      command.unitId === TUTORIAL_STATUS_PLAYER_MAGICIAN_ID &&
      command.artId === "banish" &&
      tutorial.stage === "await_banish"
    ) {
      return { ...command, ...NORMAL_HIT, effectRoll: 0.01 };
    }
    if (
      command?.type === COMMANDS.USE_ART &&
      command.unitId === TUTORIAL_STATUS_PLAYER_ARCHER_ID &&
      command.artId === "poison-arrow" &&
      tutorial.stage === "await_poison_arrow"
    ) {
      return { ...command, ...NORMAL_HIT, effectRoll: 0.01 };
    }
    if (
      command?.type === COMMANDS.USE_ART &&
      command.unitId === TUTORIAL_STATUS_CPU_FAT_BOWMAN_ID &&
      command.artId === "dragonsbane" &&
      tutorial.stage === "await_enemy_poison_immunity"
    ) {
      return { ...command, ...NORMAL_HIT, effectRoll: 0.01, effectRoll2: 0.01 };
    }
    return command;
  }

  if (tutorial.id === TUTORIAL_DAMAGE_TYPES_ID) {
    if (
      command?.type === COMMANDS.ATTACK &&
      command.actorId === TUTORIAL_DAMAGE_TYPES_PLAYER_SWORDSMAN_ID &&
      tutorial.stage === "await_swordsman_attack"
    ) {
      return { ...command, ...NORMAL_HIT };
    }
    if (
      command?.type === COMMANDS.USE_ART &&
      command.unitId === TUTORIAL_DAMAGE_TYPES_PLAYER_MAGICIAN_ID &&
      command.artId === "spark" &&
      tutorial.stage === "await_spark"
    ) {
      return { ...command, ...NORMAL_HIT };
    }
    return command;
  }

  if (tutorial.id === TUTORIAL_RAGE_ID) {
    if (
      command?.type === COMMANDS.ATTACK &&
      command.actorId === TUTORIAL_RAGE_PLAYER_ARCHER_ID &&
      tutorial.stage === "await_rage_attack"
    ) {
      return { ...command, ...FORCED_CRIT };
    }
    return command;
  }

  if (command?.type !== COMMANDS.ATTACK) return command;

  if (tutorial.id === TUTORIAL_ARTS_MP_ID) {
    if (
      command.actorId === TUTORIAL_ARTS_CPU_ARCHER_ID &&
      (tutorial.stage === "await_enemy_counterattack" || tutorial.stage === "await_post_volley_counterattack")
    ) {
      return { ...command, ...NORMAL_HIT };
    }
    return command;
  }

  if (command.actorId === CPU_ARCHER_ID && tutorial.stage === "await_cpu_counterattack") {
    return { ...command, ...FORCED_MISS };
  }

  if (command.actorId !== PLAYER_ARCHER_ID) return command;
  if (tutorial.stage === "await_final_crit") return { ...command, ...FORCED_CRIT };
  if (tutorial.stage === "await_first_attack" || tutorial.stage === "await_kite_attack") {
    return { ...command, ...NORMAL_HIT };
  }

  return command;
}

export function validateTutorialCommand(tutorial, command, match) {
  if (!tutorial || tutorial.completed || !command) return tutorialAllowed();

  if (tutorial.id === TUTORIAL_STATUS_EFFECTS_ID) return validateStatusEffectsCommand(tutorial, command, match);

  if (tutorial.id === TUTORIAL_DAMAGE_TYPES_ID) return validateDamageTypesCommand(tutorial, command, match);

  if (tutorial.id === TUTORIAL_ARTS_MP_ID) return validateArtsMpCommand(tutorial, command, match);

  if (tutorial.id === TUTORIAL_RAGE_ID) return validateRageCommand(tutorial, command, match);

  return validateBasicsCommand(tutorial, command, match);
}

export function recordTutorialCommand(tutorial, { command, events = [], match, previousPlayer = match?.currentPlayer } = {}) {
  if (!tutorial || tutorial.completed) return noUpdate();
  if (tutorial.id === TUTORIAL_STATUS_EFFECTS_ID) {
    return recordStatusEffectsCommand(tutorial, { command, events, match, previousPlayer });
  }
  if (tutorial.id === TUTORIAL_DAMAGE_TYPES_ID) {
    return recordDamageTypesCommand(tutorial, { command, events, match, previousPlayer });
  }
  if (tutorial.id === TUTORIAL_ARTS_MP_ID) {
    return recordArtsMpCommand(tutorial, { command, events, match, previousPlayer });
  }
  if (tutorial.id === TUTORIAL_RAGE_ID) {
    return recordRageCommand(tutorial, { command, events, match, previousPlayer });
  }

  const attackEvent = events.find((event) => event.type === "ATTACK_RESOLVED");
  if (attackEvent) return recordAttack(tutorial, attackEvent);

  if (
    tutorial.stage === "await_kite_move" &&
    command?.type === COMMANDS.MOVE_UNIT &&
    command.unitId === PLAYER_ARCHER_ID
  ) {
    return setStage(tutorial, "await_final_crit", {
      prompt: "That is kiting: attack first, then move to create space before ending the activation. Your next Archer attack will show a critical strike.",
      dialogue: [{
        speakerId: PLAYER_ARCHER_ID,
        text: "Shot first, reposition second. That is how I kite without giving up my attack.",
      }],
    });
  }

  if (previousPlayer === 1 && match?.currentPlayer === 2 && tutorial.stage === "practice_defense") {
    return setStage(tutorial, "cpu_approach", {
      prompt: "Good. The CPU will now advance with normal movement only, then brace. Watch the enemy Archer close the gap.",
    });
  }

  if (previousPlayer === 2 && match?.currentPlayer === 1) {
    if ((tutorial.stage === "cpu_approach" || tutorial.stage === "approach") && archerHasTarget(match, PLAYER_ARCHER_ID)) {
      return setStage(tutorial, "await_first_attack", {
        prompt: "Your Archer has a target in range. Select her, choose Attack with the button or key 2, then target an enemy in the reticle.",
        dialogue: [{
          speakerId: PLAYER_ARCHER_ID,
          text: "I have a clean angle from here. Give me the attack order and I can soften their line.",
        }, {
          name: "Instructor",
          text: "Attacks can be made with the mouse, a finger, or hotkey 2. Every attack rolls to hit.",
        }],
      });
    }

    if (tutorial.stage === "await_kite_attack") {
      return setStage(tutorial, "await_kite_attack", {
        prompt: "Select your Archer again. Attack first, then move to practice kiting before ending the activation.",
      });
    }

    if (tutorial.stage === "await_final_crit") {
      return setStage(tutorial, "await_final_crit", {
        prompt: "Bring the Archer back online and attack again. This roll is set up to show a critical strike.",
      });
    }

    if (tutorial.stage === "cpu_approach") {
      return setStage(tutorial, "approach", {
        prompt: "Now approach with your Archer while keeping her line of fire in mind. Take your full turn.",
      });
    }
  }

  return noUpdate();
}

export function chooseTutorialCpuActivation(match, tutorial) {
  const player = match?.currentPlayer ?? 2;

  // Once a tutorial has completed, the CPU idles instead of sneaking in one last
  // move/defend after the closing dialogue. Without this, tutorial 3 passes the
  // turn to Clod (both player units spent by the final Spark) and he shuffles +
  // braces right before the results screen — an out-of-place artifact.
  if (tutorial?.completed) return [];

  if (tutorial?.id === TUTORIAL_RAGE_ID) {
    if (tutorial.stage !== "await_enemy_idle") return [];
    const magician = findUnit(match, TUTORIAL_RAGE_CPU_MAGICIAN_ID);
    if (!canAct(match, magician)) return [];
    return [
      beginActivation(player, magician.id),
      defend(player, magician.id),
      finishActivation(player, magician.id),
    ];
  }

  if (tutorial?.id === TUTORIAL_STATUS_EFFECTS_ID) {
    if (tutorial.stage === "await_blinded_enemy_attack") {
      const swordsman = findUnit(match, TUTORIAL_STATUS_CPU_SWORDSMAN_ID);
      const target = findUnit(match, TUTORIAL_STATUS_PLAYER_SWORDSMAN_ID);
      if (!canAct(match, swordsman) || !target || target.hp <= 0) return [];
      return [
        beginActivation(player, swordsman.id),
        attack(player, swordsman.id, target.id),
        finishActivation(player, swordsman.id),
      ];
    }
    if (tutorial.stage === "await_enemy_cleanse") {
      const mystic = findUnit(match, TUTORIAL_STATUS_CPU_MYSTIC_ID);
      const target = findUnit(match, TUTORIAL_STATUS_CPU_FAT_BOWMAN_ID);
      if (!canAct(match, mystic) || !target || target.hp <= 0) return [];
      return [
        beginActivation(player, mystic.id),
        useArt(player, mystic.id, "purify", { targetId: target.id }),
      ];
    }
    if (tutorial.stage === "await_enemy_poison_immunity") {
      const bowman = findUnit(match, TUTORIAL_STATUS_CPU_FAT_BOWMAN_ID);
      const target = findUnit(match, TUTORIAL_STATUS_PLAYER_ARCHER_ID);
      if (!canAct(match, bowman) || !target || target.hp <= 0) return [];
      return [
        beginActivation(player, bowman.id),
        useArt(player, bowman.id, "dragonsbane", { targetId: target.id }),
      ];
    }
    return [];
  }

  if (tutorial?.id === TUTORIAL_DAMAGE_TYPES_ID && tutorial.stage === "await_clod_defend") {
    const clod = findUnit(match, TUTORIAL_DAMAGE_TYPES_CPU_CLOD_ID);
    if (!canAct(match, clod)) return [];
    return [
      beginActivation(player, clod.id),
      defend(player, clod.id),
      finishActivation(player, clod.id),
    ];
  }

  if (
    tutorial?.id === TUTORIAL_ARTS_MP_ID &&
    (tutorial.stage === "await_enemy_counterattack" || tutorial.stage === "await_post_volley_counterattack")
  ) {
    const archer = findUnit(match, TUTORIAL_ARTS_CPU_ARCHER_ID);
    const target = findUnit(match, TUTORIAL_ARTS_PLAYER_ARCHER_ID);
    if (!canAct(match, archer) || !target || target.hp <= 0) return [];
    return [
      beginActivation(player, archer.id),
      attack(player, archer.id, target.id),
      finishActivation(player, archer.id),
    ];
  }

  const archer = findUnit(match, CPU_ARCHER_ID);
  if (tutorial?.stage === "await_cpu_counterattack" && canAct(match, archer)) {
    const commands = [beginActivation(player, archer.id)];
    let actingMatch = match;
    let actingArcher = archer;
    let target = findCounterattackTarget(actingMatch, actingArcher);
    if (!target) {
      const playerArcher = findUnit(match, PLAYER_ARCHER_ID);
      const step = findAttackSetupMove(match, archer, playerArcher) ?? approachMove(match, archer, playerArcher);
      if (step) {
        commands.push(moveUnit(player, archer.id, step.x, step.y));
        actingMatch = moveUnitInMatch(match, archer.id, step);
        actingArcher = findUnit(actingMatch, archer.id);
        target = findCounterattackTarget(actingMatch, actingArcher);
      }
    }
    if (target) commands.push(attack(player, archer.id, target.id));
    else commands.push(defend(player, archer.id));
    commands.push(finishActivation(player, archer.id));
    return commands;
  }

  if (tutorial?.id === TUTORIAL_BASICS_ID && tutorial.stage === "await_kite_attack") {
    return holdNextTutorialCpuUnit(match, player);
  }

  const unit = livingUnits(match, player).find((candidate) => canAct(match, candidate));
  if (!unit) return [];

  const commands = [beginActivation(player, unit.id)];
  const step = approachMove(match, unit);
  if (step) commands.push(moveUnit(player, unit.id, step.x, step.y));
  commands.push(defend(player, unit.id), finishActivation(player, unit.id));
  return commands;
}

export function completeTutorial(storage, tutorialId) {
  const current = readProgress(storage);
  const previouslyComplete = current.allTutorialsComplete;
  const completed = new Set(current.completedTutorials);
  if (TUTORIAL_IDS.includes(tutorialId)) completed.add(tutorialId);

  const completedTutorials = TUTORIAL_IDS.filter((id) => completed.has(id));
  const allTutorialsComplete = TUTORIAL_IDS.every((id) => completed.has(id));
  const shouldGrantTutorialValor = allTutorialsComplete && !current.tutorialValorGranted;
  const next = writeUnlockProgress(storage, {
    ...current,
    completedTutorials,
    allTutorialsComplete,
    valorBalance: current.valorBalance + (shouldGrantTutorialValor ? TUTORIAL_VALOR_REWARD : 0),
    tutorialValorGranted: current.tutorialValorGranted || shouldGrantTutorialValor,
  });
  if (!previouslyComplete && next.allTutorialsComplete) {
    enqueueUnitUnlockAnnouncements(storage, [TUTORIAL_JUGGERNAUT_REWARD_UNIT]);
    enqueueDraftBattleUnlockAnnouncement(storage);
  }
  if (shouldGrantTutorialValor) {
    enqueueValorGainAnnouncement(storage, {
      id: "tutorials-complete",
      amount: TUTORIAL_VALOR_REWARD,
      title: "Tutorial Valor Earned",
      body: `Completing every tutorial awarded ${TUTORIAL_VALOR_REWARD.toLocaleString("en-US")} Valor.`,
    });
  }
  return next;
}

export function readProgress(storage = globalThis.localStorage) {
  const progress = readUnlockProgress(storage);
  const completedTutorials = progress.completedTutorials.filter((id) => TUTORIAL_IDS.includes(id));
  return normalizeUnlockProgress({
    ...progress,
    completedTutorials,
    allTutorialsComplete: TUTORIAL_IDS.every((id) => completedTutorials.includes(id)),
  });
}

export function getTutorialList(storage = globalThis.localStorage) {
  const progress = readProgress(storage);
  const completed = new Set(progress.completedTutorials);
  let nextUnlocked = true;

  return TUTORIAL_CATALOG.map((tutorial) => {
    const isCompleted = completed.has(tutorial.id);
    const unlocked = isCompleted || nextUnlocked;
    const status = isCompleted ? "completed" : unlocked ? "unlocked" : "locked";
    if (!isCompleted && unlocked) nextUnlocked = false;
    return {
      ...tutorial,
      completed: isCompleted,
      locked: !unlocked,
      status,
    };
  });
}

export function getNextTutorialId(storage = globalThis.localStorage, afterTutorialId = null) {
  const tutorials = getTutorialList(storage);
  const startIndex = Math.max(0, tutorials.findIndex((tutorial) => tutorial.id === afterTutorialId) + 1);
  const next = tutorials
    .slice(startIndex)
    .find((tutorial) => tutorial.available && !tutorial.locked && !tutorial.completed);
  return next?.id ?? null;
}

function recordAttack(tutorial, attackEvent) {
  if (attackEvent.actorId === PLAYER_ARCHER_ID) {
    if (tutorial.stage === "await_first_attack") {
      return setStage(tutorial, "await_cpu_counterattack", {
        prompt: "Hit confirmed. Attacks roll to hit: very low rolls miss, normal rolls land, and strong rolls can crit. Finish the Archer so the enemy Archer can answer.",
        dialogue: [{
          name: "Instructor",
          text: "That shot hit. Every attack rolls: some miss, most hit, and critical strikes hit harder.",
        }],
      });
    }

    if (tutorial.stage === "await_kite_attack") {
      return setStage(tutorial, "await_kite_move", {
        prompt: "Hit confirmed. Now move your Archer after attacking to create space before ending the activation.",
      });
    }

    if (tutorial.stage === "await_final_crit" && attackEvent.critical) {
      tutorial.completed = true;
      return setStage(tutorial, "complete", {
        prompt: "Critical strike. Tutorial complete: you have seen squad turns, movement, defense, basic attacks, misses, kiting, and crits.",
        completed: true,
        dialogue: [{
          speakerId: PLAYER_ARCHER_ID,
          text: "Clean hit. That one found the mark.",
        }, {
          name: "Instructor",
          text: "Critical strikes are the high end of the attack roll. Later tutorials cover ARTS, MP, damage types, RAGE, and deeper tactics.",
        }],
      });
    }
  }

  if (attackEvent.actorId === CPU_ARCHER_ID && tutorial.stage === "await_cpu_counterattack") {
    return setStage(tutorial, "await_kite_attack", {
      prompt: "The enemy Archer missed. Select your Archer when your squad turn returns: this time, attack first, then move to kite.",
      dialogue: [{
        speakerId: CPU_ARCHER_ID,
        text: "Tch. Wide shot.",
      }, {
        name: "Instructor",
        text: "That was a miss. Misses still spend the attack. Kiting uses the other legal action order: attack first, then move.",
      }],
    });
  }

  return noUpdate();
}

function validateBasicsCommand(tutorial, command, match) {
  if (command.type === COMMANDS.CONCEDE || command.player !== 1) return tutorialAllowed();
  const unitId = activeCommandUnitId(command);
  const isArcher = unitId === PLAYER_ARCHER_ID;
  const isBasicsPlayer = BASICS_PLAYER_IDS.includes(unitId);

  if (tutorial.stage === "practice_defense") {
    if (command.type === COMMANDS.BEGIN_ACTIVATION && isBasicsPlayer) return tutorialAllowed();
    if (command.type === COMMANDS.MOVE_UNIT && isBasicsPlayer) return tutorialAllowed();
    if (command.type === COMMANDS.DEFEND && isBasicsPlayer) {
      return match?.activation?.unitId === command.unitId && match.activation.moved
        ? tutorialAllowed()
        : tutorialBlocked("Move first, then Defend.");
    }
    if (command.type === COMMANDS.FINISH_ACTIVATION && isBasicsPlayer) return tutorialAllowed();
    if (command.type === COMMANDS.CANCEL_MOVE && isBasicsPlayer) return tutorialAllowed();
    return tutorialBlocked("For the opening, practice movement and defense: move a unit, then Defend.");
  }

  if (tutorial.stage === "await_first_attack") {
    if (command.type === COMMANDS.BEGIN_ACTIVATION && isArcher) return tutorialAllowed();
    if (command.type === COMMANDS.ATTACK && command.actorId === PLAYER_ARCHER_ID) return tutorialAllowed();
    if (command.type === COMMANDS.CANCEL_MOVE && isArcher) return tutorialAllowed();
    return tutorialBlocked("Use the Archer's basic Attack now. Other actions can wait until this shot lands.");
  }

  if (tutorial.stage === "await_cpu_counterattack") {
    if (isArcher) {
      // On the shot turn the Archer has already attacked, so only FINISH is legal
      // (DEFEND/MOVE get rejected by the reducer as PRIMARY_ALREADY_USED and the
      // player finishes). But if the enemy Archer was too far to answer in one turn
      // and the turn returns with a FRESH Archer, she must be spendable too —
      // otherwise the turn can never pass back so the enemy Archer can close in and
      // fire. Allow bracing/repositioning (never a second attack — the enemy answers
      // first) so the counter-shot lesson can't soft-lock.
      if (
        command.type === COMMANDS.FINISH_ACTIVATION ||
        command.type === COMMANDS.BEGIN_ACTIVATION ||
        command.type === COMMANDS.DEFEND ||
        command.type === COMMANDS.MOVE_UNIT ||
        command.type === COMMANDS.CANCEL_MOVE
      ) {
        return tutorialAllowed();
      }
      return tutorialBlocked("Finish the Archer's activation after the shot so the enemy Archer can answer.");
    }
  }

  if (tutorial.stage === "await_kite_attack") {
    if (!isArcher) return tutorialBlocked("Select your Archer for the kiting lesson.");
    if (
      command.type === COMMANDS.BEGIN_ACTIVATION ||
      command.type === COMMANDS.ATTACK ||
      command.type === COMMANDS.CANCEL_MOVE
    ) {
      return tutorialAllowed();
    }
    return tutorialBlocked("Attack first with your Archer. After that shot, you can move her before ending the activation.");
  }

  if (tutorial.stage === "await_kite_move") {
    if (command.type === COMMANDS.MOVE_UNIT && command.unitId === PLAYER_ARCHER_ID) return tutorialAllowed();
    if (command.type === COMMANDS.BEGIN_ACTIVATION && isArcher) return tutorialAllowed();
    return tutorialBlocked("Move the Archer after attacking to create space before ending the activation.");
  }

  if (tutorial.stage === "await_final_crit") {
    if (match?.activation?.unitId === PLAYER_ARCHER_ID && command.type === COMMANDS.FINISH_ACTIVATION) {
      return tutorialAllowed();
    }
    if (isArcher) {
      if (
        command.type === COMMANDS.BEGIN_ACTIVATION ||
        command.type === COMMANDS.ATTACK ||
        command.type === COMMANDS.CANCEL_MOVE
      ) {
        return tutorialAllowed();
      }
      return tutorialBlocked("Bring the Archer back online and attack to see a critical strike.");
    }
  }

  return tutorialAllowed();
}

function validateDamageTypesCommand(tutorial, command) {
  if (command.player !== 1) return tutorialAllowed();
  const unitId = activeCommandUnitId(command);
  const isSwordsman = unitId === TUTORIAL_DAMAGE_TYPES_PLAYER_SWORDSMAN_ID;
  const isMagician = unitId === TUTORIAL_DAMAGE_TYPES_PLAYER_MAGICIAN_ID;

  if (tutorial.stage === "await_swordsman_attack") {
    if (command.type === COMMANDS.BEGIN_ACTIVATION && isSwordsman) return tutorialAllowed();
    if (command.type === COMMANDS.MOVE_UNIT && command.unitId === TUTORIAL_DAMAGE_TYPES_PLAYER_SWORDSMAN_ID) {
      return samePosition(command.position, DAMAGE_TYPES_SWORDSMAN_MOVE)
        ? tutorialAllowed()
        : tutorialBlocked("Move the Swordsman to the adjacent setup tile at column 7, row 6 before attacking Clod.");
    }
    if (command.type === COMMANDS.ATTACK && command.actorId === TUTORIAL_DAMAGE_TYPES_PLAYER_SWORDSMAN_ID && command.targetId === TUTORIAL_DAMAGE_TYPES_CPU_CLOD_ID) {
      return tutorialAllowed();
    }
    if (command.type === COMMANDS.CANCEL_MOVE && isSwordsman) return tutorialAllowed();
    return tutorialBlocked("Start with the Swordsman: move adjacent to Clod, then use a basic Attack.");
  }

  if (tutorial.stage === "await_swordsman_finish") {
    if (command.type === COMMANDS.FINISH_ACTIVATION && command.unitId === TUTORIAL_DAMAGE_TYPES_PLAYER_SWORDSMAN_ID) return tutorialAllowed();
    return tutorialBlocked("Finish the Swordsman's activation so Clod can demonstrate defending.");
  }

  if (tutorial.stage === "await_footwork") {
    if (command.type === COMMANDS.BEGIN_ACTIVATION && isSwordsman) return tutorialAllowed();
    if (
      command.type === COMMANDS.USE_ART &&
      command.unitId === TUTORIAL_DAMAGE_TYPES_PLAYER_SWORDSMAN_ID &&
      command.artId === "footwork"
    ) {
      return footworkPathHitsClod(command.path)
        ? tutorialAllowed()
        : tutorialBlocked("Route Footwork through Clod so the true damage lands before you end on empty ground.");
    }
    return tutorialBlocked("Activate the Swordsman and use Footwork through Clod. True damage ignores Clod's Defend stance.");
  }

  if (tutorial.stage === "await_spark") {
    if (command.type === COMMANDS.BEGIN_ACTIVATION && isMagician) return tutorialAllowed();
    if (
      command.type === COMMANDS.USE_ART &&
      command.unitId === TUTORIAL_DAMAGE_TYPES_PLAYER_MAGICIAN_ID &&
      command.artId === "spark" &&
      command.targetId === TUTORIAL_DAMAGE_TYPES_CPU_CLOD_ID
    ) {
      return tutorialAllowed();
    }
    return tutorialBlocked("Now activate the Magician and cast Spark at Clod to show magic ignoring DEF but still being halved by Defend.");
  }

  return tutorialAllowed();
}

function validateArtsMpCommand(tutorial, command) {
  const unitId = activeCommandUnitId(command);
  const isArcher = unitId === TUTORIAL_ARTS_PLAYER_ARCHER_ID;
  const isMystic = unitId === TUTORIAL_ARTS_PLAYER_MYSTIC_ID;

  if (tutorial.stage === "check_volley_range") {
    if (command.type === COMMANDS.BEGIN_ACTIVATION && isArcher) return tutorialAllowed();
    if (command.type === COMMANDS.USE_ART && isArcher && command.artId === "volley-shot") {
      const update = setStage(tutorial, "await_move", {
        prompt: "The enemy line is out of reach from here. Cancel the check, move the Archer to the marked setup tile, then Defend. ARTS cannot be used after moving.",
        dialogue: [{
          name: "Instructor",
          text: "Good range check. Volley Shot cannot reach yet, and an ART cannot be used alongside a move, so spend this activation moving into position and defending.",
        }],
      });
      return tutorialBlocked("Volley Shot is out of reach from here. Cancel the check, then move and defend first.", update);
    }
    return tutorialBlocked("Activate the Archer and choose Volley Shot first so you can check its range.");
  }

  if (tutorial.stage === "await_move") {
    if (command.type === COMMANDS.BEGIN_ACTIVATION && isArcher) return tutorialAllowed();
    if (command.type === COMMANDS.MOVE_UNIT && command.unitId === TUTORIAL_ARTS_PLAYER_ARCHER_ID) {
      return samePosition(command.position, ARTS_MP_ARCHER_MOVE)
        ? tutorialAllowed()
        : tutorialBlocked("Move the Archer to the setup tile at column 4, row 5 so next turn's Volley Shot catches the whole line.");
    }
    return tutorialBlocked("Move and defend this turn. ARTS cannot be used in the same activation as movement.");
  }

  if (tutorial.stage === "await_defend") {
    if (command.type === COMMANDS.DEFEND && isArcher) return tutorialAllowed();
    return tutorialBlocked("Now Defend with the Archer so she can weather the countershot.");
  }

  if (tutorial.stage === "await_volley") {
    if (command.type === COMMANDS.BEGIN_ACTIVATION && isArcher) return tutorialAllowed();
    if (command.type === COMMANDS.USE_ART && isArcher && command.artId === "volley-shot") {
      return samePosition(command.targetPosition, ARTS_MP_VOLLEY_ORIGIN)
        ? tutorialAllowed()
        : tutorialBlocked("Aim Volley Shot to the right so the cone covers all four enemies.");
    }
    return tutorialBlocked("Use Volley Shot now. Moving or attacking would miss the point of the setup.");
  }

  if (tutorial.stage === "await_pray") {
    if (command.type === COMMANDS.BEGIN_ACTIVATION && isMystic) return tutorialAllowed();
    if (command.type === COMMANDS.USE_ART && isMystic && command.artId === "pray") return tutorialAllowed();
    return tutorialBlocked("Activate the Mystic and use Pray to heal the Archer.");
  }

  return tutorialAllowed();
}

function validateStatusEffectsCommand(tutorial, command) {
  if (command.type === COMMANDS.CONCEDE || command.player !== 1) return tutorialAllowed();
  const unitId = activeCommandUnitId(command);
  const isSwordsman = unitId === TUTORIAL_STATUS_PLAYER_SWORDSMAN_ID;
  const isMagician = unitId === TUTORIAL_STATUS_PLAYER_MAGICIAN_ID;
  const isArcher = unitId === TUTORIAL_STATUS_PLAYER_ARCHER_ID;

  if (tutorial.stage === "await_moonstrike") {
    if (command.type === COMMANDS.BEGIN_ACTIVATION && isSwordsman) return tutorialAllowed();
    if (
      command.type === COMMANDS.USE_ART &&
      command.unitId === TUTORIAL_STATUS_PLAYER_SWORDSMAN_ID &&
      command.artId === "moonstrike" &&
      command.targetId === TUTORIAL_STATUS_CPU_SWORDSMAN_ID
    ) {
      return tutorialAllowed();
    }
    return tutorialBlocked("Activate your Swordsman and use Moonstrike on the enemy Swordsman to blind him.");
  }

  if (tutorial.stage === "await_banish") {
    if (command.type === COMMANDS.BEGIN_ACTIVATION && isMagician) return tutorialAllowed();
    if (
      command.type === COMMANDS.USE_ART &&
      command.unitId === TUTORIAL_STATUS_PLAYER_MAGICIAN_ID &&
      command.artId === "banish" &&
      command.targetId === TUTORIAL_STATUS_CPU_MAGICIAN_ID
    ) {
      return tutorialAllowed();
    }
    return tutorialBlocked("Use the Magician's Banish on the enemy Magician so Nuke is off the table.");
  }

  if (tutorial.stage === "await_poison_arrow") {
    if (command.type === COMMANDS.BEGIN_ACTIVATION && isArcher) return tutorialAllowed();
    if (
      command.type === COMMANDS.USE_ART &&
      command.unitId === TUTORIAL_STATUS_PLAYER_ARCHER_ID &&
      command.artId === "poison-arrow" &&
      command.targetId === TUTORIAL_STATUS_CPU_FAT_BOWMAN_ID
    ) {
      return tutorialAllowed();
    }
    return tutorialBlocked("Activate the Archer and use Poison Arrow on the Fat Bowman so Virus can spread the poison.");
  }

  if (
    tutorial.stage === "await_blinded_enemy_attack" ||
    tutorial.stage === "await_enemy_cleanse" ||
    tutorial.stage === "await_enemy_poison_immunity"
  ) {
    return tutorialBlocked("Watch the scripted enemy response resolve.");
  }

  return tutorialAllowed();
}

function validateRageCommand(tutorial, command) {
  const unitId = activeCommandUnitId(command);
  const isMagician = unitId === TUTORIAL_RAGE_PLAYER_MAGICIAN_ID;
  const isArcher = unitId === TUTORIAL_RAGE_PLAYER_ARCHER_ID;

  if (tutorial.stage === "await_nuke") {
    if (command.type === COMMANDS.BEGIN_ACTIVATION && isMagician) return tutorialAllowed();
    if (command.type === COMMANDS.USE_ART && isMagician && command.artId === "nuke") return tutorialAllowed();
    return tutorialBlocked("You're surrounded. Activate the Magician and use Nuke — RAGE just unlocked it.");
  }

  if (tutorial.stage === "await_rage_attack") {
    if (!isArcher) return tutorialAllowed();
    if (
      command.type === COMMANDS.BEGIN_ACTIVATION ||
      command.type === COMMANDS.ATTACK ||
      command.type === COMMANDS.CANCEL_MOVE
    ) {
      return tutorialAllowed();
    }
    return tutorialBlocked("Attack first with your Archer. You can move her to safety after the shot lands.");
  }

  if (tutorial.stage === "await_rage_move") {
    if (command.type === COMMANDS.MOVE_UNIT && command.unitId === TUTORIAL_RAGE_PLAYER_ARCHER_ID) {
      return samePosition(command.position, RAGE_ARCHER_RETREAT)
        ? tutorialAllowed()
        : tutorialBlocked("Retreat to the marked tile at column 3, row 6 so the Magician's counter can't reach.");
    }
    return tutorialBlocked("Move the Archer out of the enemy Magician's range to finish the activation.");
  }

  return tutorialAllowed();
}

function statusSilenceFormationAction() {
  return {
    type: "formationSwap",
    hideUnitIds: [TUTORIAL_STATUS_CPU_SWORDSMAN_ID],
    revealUnits: [
      { unitId: TUTORIAL_STATUS_PLAYER_SWORDSMAN_ID, position: STATUS_SILENCE_PLAYER_SWORDSMAN_POSITION, hp: 10, spent: true },
      { unitId: TUTORIAL_STATUS_PLAYER_MAGICIAN_ID, position: STATUS_SILENCE_PLAYER_MAGICIAN_POSITION, hp: 23 },
      { unitId: TUTORIAL_STATUS_CPU_MAGICIAN_ID, position: STATUS_SILENCE_CPU_MAGICIAN_POSITION, hp: 11 },
    ],
    spawnUnits: [
      { id: TUTORIAL_STATUS_PLAYER_MYSTIC_ID, type: "mystic", player: 1, position: STATUS_SILENCE_PLAYER_MYSTIC_POSITION, hp: 10, spent: true },
    ],
    currentPlayer: 1,
    dialogue: [
      {
        name: "Instructor",
        text: "New formation. Your Swordsman and Mystic could try to finish that Magician, but their damage would likely push him into RAGE instead of ending him.",
      },
      {
        name: "Instructor",
        text: "A raging Magician threatens Nuke. Silence prevents ARTS, so activate your Magician and use Banish before your team commits to the brawl.",
      },
    ],
    prompt: "Activate your Magician and use Banish on the enemy Magician.",
  };
}

function statusPoisonFormationAction() {
  return {
    type: "formationSwap",
    hideUnitIds: [
      TUTORIAL_STATUS_PLAYER_SWORDSMAN_ID,
      TUTORIAL_STATUS_PLAYER_MAGICIAN_ID,
      TUTORIAL_STATUS_PLAYER_MYSTIC_ID,
      TUTORIAL_STATUS_CPU_MAGICIAN_ID,
    ],
    revealUnits: [
      { unitId: TUTORIAL_STATUS_PLAYER_ARCHER_ID, position: STATUS_POISON_PLAYER_ARCHER_POSITION, hp: 24 },
      { unitId: TUTORIAL_STATUS_PLAYER_VIRUS_ID, position: STATUS_POISON_PLAYER_VIRUS_POSITION, hp: 25, spent: true },
      { unitId: TUTORIAL_STATUS_CPU_MYSTIC_ID, position: STATUS_POISON_CPU_MYSTIC_POSITION, hp: 23 },
      { unitId: TUTORIAL_STATUS_CPU_FAT_BOWMAN_ID, position: STATUS_POISON_CPU_FAT_BOWMAN_POSITION, hp: 30 },
    ],
    currentPlayer: 1,
    dialogue: [
      {
        name: "Instructor",
        text: "Poison is permanent until cleansed and deals damage at the start of the poisoned unit's activation.",
      },
      {
        speakerId: TUTORIAL_STATUS_PLAYER_VIRUS_ID,
        text: "And when an enemy catches a debuff near their allies, Spread copies it. I only need to stand here looking infectious.",
      },
      {
        name: "Instructor",
        text: "Virus is already spent. Activate the Archer and use Poison Arrow on the Fat Bowman; the nearby Mystic should catch the same poison.",
      },
    ],
    prompt: "Activate your Archer and use Poison Arrow on the Fat Bowman.",
  };
}

function recordStatusEffectsCommand(tutorial, { events = [] } = {}) {
  const artEvent = events.find((event) => event.type === "ART_RESOLVED");
  if (
    artEvent?.actorId === TUTORIAL_STATUS_PLAYER_SWORDSMAN_ID &&
    artEvent.artId === "moonstrike" &&
    tutorial.stage === "await_moonstrike"
  ) {
    return setStage(tutorial, "await_blinded_enemy_attack", {
      prompt: "Moonstrike blinded the enemy. Every attack he tries this activation will miss; watch him swing into nothing.",
      dialogue: [
        {
          name: "Instructor",
          text: "Blind does not stop movement or ARTS by itself, but it makes attacks miss. Timing it right can save a fragile unit from a lethal counter.",
        },
      ],
    });
  }

  const attackEvent = events.find((event) => event.type === "ATTACK_RESOLVED");
  if (
    attackEvent?.actorId === TUTORIAL_STATUS_CPU_SWORDSMAN_ID &&
    attackEvent.hit === false &&
    tutorial.stage === "await_blinded_enemy_attack"
  ) {
    return setStage(tutorial, "await_banish", {
      prompt: "Blind bought the turn. Next, use silence to shut down a dangerous ART.",
      dialogue: [
        {
          speakerId: TUTORIAL_STATUS_CPU_SWORDSMAN_ID,
          text: "I had the swing. I just did not have the sight.",
        },
        {
          name: "Instructor",
          text: "That is blind in miniature: the threat still activates, but the attack cannot connect.",
        },
      ],
      afterDialogueAction: statusSilenceFormationAction(),
    });
  }

  if (
    artEvent?.actorId === TUTORIAL_STATUS_PLAYER_MAGICIAN_ID &&
    artEvent.artId === "banish" &&
    tutorial.stage === "await_banish"
  ) {
    return setStage(tutorial, "await_poison_arrow", {
      prompt: "Banish silenced the Magician. Next: poison, spread, cleanse, and immunity.",
      dialogue: [
        {
          name: "Instructor",
          text: "Silence leaves basic attacks alone, but it disables ARTS. Against a caster near RAGE, that can be the difference between a cleanup and a disaster.",
        },
      ],
      afterDialogueAction: statusPoisonFormationAction(),
    });
  }

  if (
    artEvent?.actorId === TUTORIAL_STATUS_PLAYER_ARCHER_ID &&
    artEvent.artId === "poison-arrow" &&
    tutorial.stage === "await_poison_arrow"
  ) {
    return setStage(tutorial, "await_enemy_cleanse", {
      prompt: "Poison landed and Virus spread it. The enemy Mystic will cleanse the Fat Bowman before the counterattack.",
      dialogue: [
        {
          speakerId: TUTORIAL_STATUS_CPU_FAT_BOWMAN_ID,
          text: "That little poison trick is cute. Mystic, get this off me.",
        },
        {
          name: "Instructor",
          text: "Cleanses remove statuses after they land. They are one of the cleanest answers to poison chains, blind locks, and silence setups.",
        },
      ],
    });
  }

  if (
    artEvent?.actorId === TUTORIAL_STATUS_CPU_MYSTIC_ID &&
    artEvent.artId === "purify" &&
    tutorial.stage === "await_enemy_cleanse"
  ) {
    return setStage(tutorial, "await_enemy_poison_immunity", {
      prompt: "Purify removed the Fat Bowman's poison. Now watch her try to poison your Archer back.",
      dialogue: [
        {
          name: "Instructor",
          text: "The Fat Bowman is clean, but the Mystic still carries poison. Cleanses target what they actually reach; they are powerful, not automatic.",
        },
        {
          speakerId: TUTORIAL_STATUS_CPU_FAT_BOWMAN_ID,
          text: "My turn. Let us see how your Archer likes poison.",
        },
      ],
    });
  }

  if (
    artEvent?.actorId === TUTORIAL_STATUS_CPU_FAT_BOWMAN_ID &&
    artEvent.artId === "dragonsbane" &&
    artEvent.effect?.applied === false &&
    artEvent.effect?.reason === "IMMUNE" &&
    tutorial.stage === "await_enemy_poison_immunity"
  ) {
    return setStage(tutorial, "complete", {
      prompt: "Tutorial complete. Statuses win turns, cleanses reset them, and immunities stop specific debuffs before they land.",
      completed: true,
      dialogue: [
        {
          speakerId: TUTORIAL_STATUS_PLAYER_ARCHER_ID,
          text: "Arrow hurt. Poison did not. Emblem handled that part.",
        },
        {
          name: "Instructor",
          text: "That is immunity: the status never sticks. Archer blocks poison, Mystic and Nemesis block silence, Father Time blocks stun and slow, and Paladin is fully immune to poison, slow, blind, silence, and stun.",
        },
        {
          name: "Instructor",
          text: "Slow reduces MOVE, and stun auto-spends the unit so it cannot be selected. Scout immunities before building a status plan around either one.",
        },
      ],
    });
  }

  return noUpdate();
}

function recordRageCommand(tutorial, { command, events = [], match, previousPlayer = match?.currentPlayer } = {}) {
  const artEvent = events.find((event) => event.type === "ART_RESOLVED");
  if (
    artEvent?.actorId === TUTORIAL_RAGE_PLAYER_MAGICIAN_ID &&
    artEvent.artId === "nuke" &&
    tutorial.stage === "await_nuke"
  ) {
    return setStage(tutorial, "await_rage_attack", {
      // Nuke wipes out every real commander on the enemy team (the Ghouls never
      // counted toward victory anyway), which would otherwise end the match right
      // here. This tutorial has a second formation still to show, so the natural
      // victory this turn is deliberately reverted once, in main.js.
      revertVictory: true,
      dialogue: [
        {
          name: "Instructor",
          text: "That is the shape of RAGE: dangerous for the unit carrying it, but it unlocks tools nothing else in the roster can use.",
        },
        {
          name: "Instructor",
          text: "Every RAGE ART and passive is different. Some, like Nuke, are a one-time burst finisher. Others quietly reshape how a unit fights for as long as it stays raging.",
        },
      ],
      afterDialogueAction: {
        type: "formationSwap",
        hideUnitIds: [TUTORIAL_RAGE_PLAYER_MAGICIAN_ID],
        revealUnits: [{ unitId: TUTORIAL_RAGE_PLAYER_ARCHER_ID, position: RAGE_ARCHER_START, hp: RAGE_ARCHER_HP }],
        spawnUnits: [{ id: TUTORIAL_RAGE_CPU_MAGICIAN_ID, type: "magician", player: 2, position: RAGE_CPU_MAGICIAN_POSITION }],
        currentPlayer: 1,
        dialogue: [
          {
            speakerId: TUTORIAL_RAGE_PLAYER_ARCHER_ID,
            text: "I'm raging too, and that enemy Magician is standing right at the edge of my reach.",
          },
          {
            name: "Instructor",
            text: "RAGE passives don't need to be activated: they're just always on. At 5 HP or lower, the Archer gains +1 STR, +1 range, never misses, and gains a 50% critical chance.",
          },
          {
            name: "Instructor",
            text: "Attack the enemy Magician, then move the Archer back out of his attack range before ending the activation.",
          },
        ],
        prompt: "Attack the enemy Magician with your raging Archer, then move her to safety.",
      },
    });
  }

  const attackEvent = events.find((event) => event.type === "ATTACK_RESOLVED");
  if (attackEvent?.actorId === TUTORIAL_RAGE_PLAYER_ARCHER_ID && tutorial.stage === "await_rage_attack") {
    return setStage(tutorial, "await_rage_move", {
      prompt: "Critical strike: RAGE's guaranteed hits and 50% crit chance at work. Now move the Archer to the retreat tile at column 3, row 6.",
    });
  }

  if (
    tutorial.stage === "await_rage_move" &&
    command?.type === COMMANDS.MOVE_UNIT &&
    command.unitId === TUTORIAL_RAGE_PLAYER_ARCHER_ID &&
    samePosition(command.position, RAGE_ARCHER_RETREAT)
  ) {
    return setStage(tutorial, "await_enemy_idle", {
      prompt: "Out of range. Watch how the enemy Magician responds.",
    });
  }

  if (
    tutorial.stage === "await_enemy_idle" &&
    events.some((event) => event.type === "UNIT_DEFENDED" && event.unitId === TUTORIAL_RAGE_CPU_MAGICIAN_ID)
  ) {
    return setStage(tutorial, "complete", {
      prompt: "Tutorial complete. Every RAGE ART and passive is listed in the Field Manual whenever you need the exact numbers.",
      completed: true,
      dialogue: [
        {
          name: "Instructor",
          text: "With the Archer out of range, the enemy Magician has nothing to answer with this turn.",
        },
        {
          name: "Instructor",
          text: "RAGE comes in a vast variety of shapes across the roster. Open the Field Manual's Codex any time you want a unit's exact RAGE ART or passive.",
        },
      ],
    });
  }

  return noUpdate();
}

function recordDamageTypesCommand(tutorial, { command, events = [], match, previousPlayer = match?.currentPlayer } = {}) {
  const attackEvent = events.find((event) => event.type === "ATTACK_RESOLVED");
  if (
    attackEvent?.actorId === TUTORIAL_DAMAGE_TYPES_PLAYER_SWORDSMAN_ID &&
    attackEvent.targetId === TUTORIAL_DAMAGE_TYPES_CPU_CLOD_ID &&
    tutorial.stage === "await_swordsman_attack"
  ) {
    return setStage(tutorial, "await_swordsman_finish", {
      prompt: "Physical hit landed. Clod's high DEF cut the Swordsman's STR down to a tiny hit. Finish the activation so Clod can Defend.",
      dialogue: [{
        name: "Instructor",
        text: "That was physical damage: Swordsman's STR met Clod's high DEF, so the blow barely got through.",
      }, {
        name: "Instructor",
        text: "High DEF opponents are strong against basic physical attacks. You need a different damage type to crack them cleanly.",
      }],
    });
  }

  if (
    tutorial.stage === "await_swordsman_finish" &&
    command?.type === COMMANDS.FINISH_ACTIVATION &&
    command.unitId === TUTORIAL_DAMAGE_TYPES_PLAYER_SWORDSMAN_ID &&
    previousPlayer === 1 &&
    match?.currentPlayer === 2
  ) {
    return setStage(tutorial, "await_clod_defend", {
      prompt: "Clod is bracing. Watch the enemy Defend, then the real damage-type lesson begins.",
    });
  }

  if (
    tutorial.stage === "await_clod_defend" &&
    events.some((event) => event.type === "UNIT_DEFENDED" && event.unitId === TUTORIAL_DAMAGE_TYPES_CPU_CLOD_ID)
  ) {
    return setStage(tutorial, "await_footwork", {
      prompt: "Clod is defending. Activate Swordsman and use Footwork through Clod, then cast Spark with Magician.",
      selectUnitId: TUTORIAL_DAMAGE_TYPES_PLAYER_SWORDSMAN_ID,
      dialogue: [{
        speakerId: TUTORIAL_DAMAGE_TYPES_CPU_CLOD_ID,
        text: "Rock Hard. While I Defend, physical damage breaks on me completely.",
      }, {
        name: "Instructor",
        text: "Clod's Rock Hard passive ignores physical damage while he is defending. Footwork deals true damage, so route it through Clod now.",
      }, {
        name: "Instructor",
        text: "After that, Spark will show the key difference: magic ignores DEF, but Defend still halves magic. True damage ignores both.",
      }],
    });
  }

  const artEvent = events.find((event) => event.type === "ART_RESOLVED");
  if (
    artEvent?.actorId === TUTORIAL_DAMAGE_TYPES_PLAYER_SWORDSMAN_ID &&
    artEvent.artId === "footwork" &&
    tutorial.stage === "await_footwork"
  ) {
    return setStage(tutorial, "await_spark", {
      prompt: "Footwork slipped true damage through Rock Hard. Now activate Magician and cast Spark at Clod.",
      selectUnitId: TUTORIAL_DAMAGE_TYPES_PLAYER_MAGICIAN_ID,
      dialogue: [{
        speakerId: TUTORIAL_DAMAGE_TYPES_PLAYER_SWORDSMAN_ID,
        text: "No armor math, no bracing math. Footwork just landed the damage.",
      }, {
        name: "Instructor",
        text: "Exactly. True damage is the clean bypass. Now compare it with magic damage while Clod is still defending.",
      }],
    });
  }

  if (
    artEvent?.actorId === TUTORIAL_DAMAGE_TYPES_PLAYER_MAGICIAN_ID &&
    artEvent.artId === "spark" &&
    tutorial.stage === "await_spark"
  ) {
    return setStage(tutorial, "complete", {
      prompt: "Tutorial complete. Physical checks DEF, magic ignores DEF but respects Defend, and true damage bypasses both.",
      completed: true,
      dialogue: [{
        speakerId: TUTORIAL_DAMAGE_TYPES_PLAYER_MAGICIAN_ID,
        text: "Spark ignored the stone shell, but the brace still softened it.",
      }, {
        name: "Instructor",
        text: "That is the whole split: physical fights DEF, magic skips DEF, true damage skips defensive stats and Defend entirely.",
      }],
    });
  }

  return noUpdate();
}

function recordArtsMpCommand(tutorial, { command, events = [], match, previousPlayer = match?.currentPlayer } = {}) {
  if (
    tutorial.stage === "await_move" &&
    command?.type === COMMANDS.MOVE_UNIT &&
    command.unitId === TUTORIAL_ARTS_PLAYER_ARCHER_ID &&
    samePosition(command.position, ARTS_MP_ARCHER_MOVE)
  ) {
    return setStage(tutorial, "await_defend", {
      prompt: "Position set. Defend now, then wait for the enemy Archer's countershot.",
      dialogue: [{
        speakerId: TUTORIAL_ARTS_PLAYER_ARCHER_ID,
        text: "I can line up the rain from here next turn. Bracing now.",
      }],
    });
  }

  if (
    tutorial.stage === "await_defend" &&
    command?.type === COMMANDS.DEFEND &&
    command.unitId === TUTORIAL_ARTS_PLAYER_ARCHER_ID
  ) {
    return setStage(tutorial, "await_enemy_counterattack", {
      prompt: "Hold position. The enemy Archer will fire, then the turn comes back to your Archer for Volley Shot.",
    });
  }

  const attackEvent = events.find((event) => event.type === "ATTACK_RESOLVED");
  if (attackEvent?.actorId === TUTORIAL_ARTS_CPU_ARCHER_ID && tutorial.stage === "await_enemy_counterattack") {
    return setStage(tutorial, "enemy_countered", {
      prompt: "The Archer took the countershot while defending. When your turn returns, use Volley Shot to hit all four enemies.",
      dialogue: [{
        name: "Instructor",
        text: "Defend softened the hit. The setup turn bought you the exact cone you need.",
      }],
    });
  }

  if (attackEvent?.actorId === TUTORIAL_ARTS_CPU_ARCHER_ID && tutorial.stage === "await_post_volley_counterattack") {
    return setStage(tutorial, "post_volley_enemy_countered", {
      prompt: "The enemy Archer answered after Volley Shot. Let the enemy activation finish, then the Mystic will respond.",
    });
  }

  if (previousPlayer === 2 && match?.currentPlayer === 1 && tutorial.stage === "enemy_countered") {
    return setStage(tutorial, "await_volley", {
      prompt: "Activate the Archer and use Volley Shot to the right. The cone should catch all four targets.",
    });
  }

  if (previousPlayer === 2 && match?.currentPlayer === 1 && tutorial.stage === "post_volley_enemy_countered") {
    return setStage(tutorial, "await_pray", {
      prompt: "The Mystic joins the field. Activate her and use Pray to heal the Archer.",
      selectUnitId: TUTORIAL_ARTS_PLAYER_MYSTIC_ID,
      beforeDialogueAction: {
        type: "revealUnit",
        unitId: TUTORIAL_ARTS_PLAYER_MYSTIC_ID,
        position: { x: 4, y: 6 },
        currentPlayer: 1,
      },
      dialogue: [{
        speakerId: TUTORIAL_ARTS_PLAYER_MYSTIC_ID,
        text: "I saw that countershot land. Let me answer it with Pray before we move on.",
      }, {
        name: "Instructor",
        text: "Healing ARTS are still ARTS: they spend MP, follow their targeting rules, and usually take the unit's whole activation.",
      }],
    });
  }

  const artEvent = events.find((event) => event.type === "ART_RESOLVED");
  if (
    artEvent?.actorId === TUTORIAL_ARTS_PLAYER_ARCHER_ID &&
    artEvent.artId === "volley-shot" &&
    tutorial.stage === "await_volley" &&
    ARTS_MP_ENEMY_IDS.every((id) => artEvent.targetIds?.includes(id))
  ) {
    return setStage(tutorial, "await_post_volley_counterattack", {
      prompt: "Volley Shot spent MP and hit the whole line. Watch the Archer's MP bar, then the enemy turn will answer.",
      spotlight: "mp",
      selectUnitId: TUTORIAL_ARTS_PLAYER_ARCHER_ID,
      dialogue: [{
        name: "Instructor",
        text: "That is MP at work: powerful, limited, and gone once spent. Watch both HP and MP before committing an ART.",
      }, {
        name: "Instructor",
        text: "Some ARTS hit one target, some draw lines or cones, and some heal allies. MP is scarce, so spend it where the shape changes the turn.",
      }],
    });
  }

  if (
    artEvent?.actorId === TUTORIAL_ARTS_PLAYER_MYSTIC_ID &&
    artEvent.artId === "pray" &&
    tutorial.stage === "await_pray"
  ) {
    return setStage(tutorial, "complete", {
      prompt: "Tutorial complete. You can find each unit's ART details, costs, targeting shape, and effects in the Field Manual.",
      completed: true,
      dialogue: [{
        name: "Instructor",
        text: "Open the Field Manual whenever you want the full ART text: range, MP cost, target type, damage, healing, and status details all live there.",
      }],
    });
  }

  return noUpdate();
}

function setStage(tutorial, stage, { prompt, dialogue = null, completed = false, spotlight = null, selectUnitId = null, beforeDialogueAction = null, afterDialogueAction = null, revertVictory = false } = {}) {
  tutorial.stage = stage;
  tutorial.prompt = prompt ?? tutorial.prompt ?? null;
  if (completed) tutorial.completed = true;
  return { prompt: tutorial.prompt, dialogue, completed: Boolean(completed), spotlight, selectUnitId, beforeDialogueAction, afterDialogueAction, revertVictory: Boolean(revertVictory) };
}

function noUpdate() {
  return { prompt: null, dialogue: null, completed: false, spotlight: null, selectUnitId: null, beforeDialogueAction: null, afterDialogueAction: null, revertVictory: false };
}

function tutorialAllowed() {
  return { accepted: true, message: null };
}

function tutorialBlocked(message, update = null) {
  return { accepted: false, message, ...(update ?? {}) };
}

function activeCommandUnitId(command) {
  return command.actorId ?? command.unitId ?? null;
}

function canAct(match, unit) {
  return Boolean(unit && unit.hp > 0 && !unit.spent && takesTurns(unit));
}

function archerHasTarget(match, archerId) {
  const archer = findUnit(match, archerId);
  if (!archer || archer.hp <= 0) return false;
  return Boolean(findLegalTarget(match, archer));
}

function findLegalTarget(match, attacker) {
  if (!match || !attacker || attacker.hp <= 0) return null;
  return livingUnits(match)
    .filter((target) => target.id !== attacker.id && areEnemies(attacker, target))
    .sort((left, right) => {
      const distance = chebyshev(attacker.position, left.position) - chebyshev(attacker.position, right.position);
      if (distance !== 0) return distance;
      return left.id.localeCompare(right.id);
    })
    .find((target) => canTargetUnit(match, attacker, target)) ?? null;
}

function findCounterattackTarget(match, archer) {
  const playerArcher = findUnit(match, PLAYER_ARCHER_ID);
  return canTargetUnit(match, archer, playerArcher) ? playerArcher : null;
}

function canTargetUnit(match, attacker, target) {
  if (!match || !attacker || !target || target.hp <= 0 || !areEnemies(attacker, target)) return false;
  const range = getEffectiveStats(attacker, match).attackRange;
  return chebyshev(attacker.position, target.position) <= range &&
    !isShotBlocked(match, attacker.position, target.position, attacker) &&
    !isWallBetween(match, attacker.position, target.position, attacker);
}

function findAttackSetupMove(match, attacker, target) {
  if (!target?.hp) return null;
  const moves = [...getLegalMoves(match, attacker)].map(parseTileKey);
  moves.sort((left, right) => {
    const distance = chebyshev(left, target.position) - chebyshev(right, target.position);
    if (distance !== 0) return distance;
    return positionKey(left).localeCompare(positionKey(right));
  });
  return moves.find((move) => {
    const movedMatch = moveUnitInMatch(match, attacker.id, move);
    return canTargetUnit(movedMatch, findUnit(movedMatch, attacker.id), target);
  }) ?? null;
}

function holdNextTutorialCpuUnit(match, player) {
  const unit = livingUnits(match, player).find((candidate) => canAct(match, candidate));
  if (!unit) return [];
  return [
    beginActivation(player, unit.id),
    defend(player, unit.id),
    finishActivation(player, unit.id),
  ];
}

function approachMove(match, unit, preferredTarget = null) {
  const target = preferredTarget?.hp > 0 ? preferredTarget : nearestEnemy(match, unit);
  if (!target) return null;
  const moves = [...getLegalMoves(match, unit)].map(parseTileKey);
  if (!moves.length) return null;
  moves.sort((left, right) => {
    const distance = chebyshev(left, target.position) - chebyshev(right, target.position);
    if (distance !== 0) return distance;
    const center = (match.size - 1) / 2;
    const leftCenter = Math.abs(left.x - center) + Math.abs(left.y - center);
    const rightCenter = Math.abs(right.x - center) + Math.abs(right.y - center);
    return leftCenter - rightCenter;
  });
  return moves.find((move) => !samePosition(move, unit.position)) ?? null;
}

function moveUnitInMatch(match, unitId, position) {
  return {
    ...match,
    units: match.units.map((unit) => unit.id === unitId ? { ...unit, position } : unit),
  };
}

function nearestEnemy(match, unit) {
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of livingUnits(match)) {
    if (candidate.player === unit.player) continue;
    const distance = chebyshev(unit.position, candidate.position);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function parseTileKey(key) {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}

function samePosition(a, b) {
  return positionKey(a) === positionKey(b);
}

function footworkPathHitsClod(path) {
  return Array.isArray(path) && path.some((step) => samePosition(step, DAMAGE_TYPES_FOOTWORK_PATH[0]));
}

function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
