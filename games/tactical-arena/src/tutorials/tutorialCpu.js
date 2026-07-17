// The tutorials' bespoke scripted CPU: each lesson's enemy follows an authored
// script (hold, approach, forced attacks) rather than the real AI, so the
// teaching beats always land the same way.

import {
  attack,
  beginActivation,
  defend,
  finishActivation,
  moveUnit,
  useArt,
} from "../core/commands.js";
import { findUnit, livingUnits } from "../core/state.js";

import {
  TUTORIAL_BASICS_ID,
  TUTORIAL_ARTS_MP_ID,
  TUTORIAL_DAMAGE_TYPES_ID,
  TUTORIAL_RAGE_ID,
  TUTORIAL_STATUS_EFFECTS_ID,
  TUTORIAL_ARTS_PLAYER_ARCHER_ID,
  TUTORIAL_ARTS_CPU_ARCHER_ID,
  TUTORIAL_DAMAGE_TYPES_CPU_CLOD_ID,
  TUTORIAL_RAGE_CPU_MAGICIAN_ID,
  TUTORIAL_STATUS_PLAYER_SWORDSMAN_ID,
  TUTORIAL_STATUS_PLAYER_ARCHER_ID,
  TUTORIAL_STATUS_CPU_SWORDSMAN_ID,
  TUTORIAL_STATUS_CPU_MYSTIC_ID,
  TUTORIAL_STATUS_CPU_FAT_BOWMAN_ID,
  PLAYER_ARCHER_ID,
  CPU_ARCHER_ID,
} from "./tutorialContent.js";
import {
  canAct,
  findCounterattackTarget,
  findAttackSetupMove,
  holdNextTutorialCpuUnit,
  approachMove,
  moveUnitInMatch,
} from "./tutorialRuntimeHelpers.js";

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

