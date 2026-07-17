// Tutorial match setup: builds each tutorial's authored battle state and stamps
// scripted rolls onto prepared commands so every lesson resolves identically.

import { COMMANDS } from "../core/commands.js";

import { getInitialMp, getUnitType } from "../core/unitCatalog.js";

import {
  TUTORIAL_BASICS_ID,
  TUTORIAL_ARTS_MP_ID,
  TUTORIAL_DAMAGE_TYPES_ID,
  TUTORIAL_RAGE_ID,
  TUTORIAL_STATUS_EFFECTS_ID,
  TUTORIAL_ARTS_PLAYER_ARCHER_ID,
  TUTORIAL_ARTS_PLAYER_MYSTIC_ID,
  TUTORIAL_ARTS_CPU_ARCHER_ID,
  TUTORIAL_DAMAGE_TYPES_PLAYER_SWORDSMAN_ID,
  TUTORIAL_DAMAGE_TYPES_PLAYER_MAGICIAN_ID,
  TUTORIAL_DAMAGE_TYPES_CPU_CLOD_ID,
  TUTORIAL_RAGE_PLAYER_MAGICIAN_ID,
  TUTORIAL_RAGE_PLAYER_ARCHER_ID,
  TUTORIAL_RAGE_CPU_SWORDSMAN_ID,
  TUTORIAL_STATUS_PLAYER_SWORDSMAN_ID,
  TUTORIAL_STATUS_PLAYER_MAGICIAN_ID,
  TUTORIAL_STATUS_PLAYER_ARCHER_ID,
  TUTORIAL_STATUS_CPU_SWORDSMAN_ID,
  TUTORIAL_STATUS_CPU_FAT_BOWMAN_ID,
  PLAYER_ARCHER_ID,
  CPU_ARCHER_ID,
  NORMAL_HIT,
  FORCED_MISS,
  FORCED_CRIT,
  RAGE_TRAP_CENTER,
  RAGE_GHOUL_POSITIONS,
  RAGE_SWORDSMAN_POSITION,
  RAGE_SWORDSMAN_HP,
  RAGE_MAGICIAN_HP,
  STATUS_BLIND_PLAYER_SWORDSMAN_POSITION,
  STATUS_BLIND_CPU_SWORDSMAN_POSITION,
} from "./tutorialContent.js";

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

