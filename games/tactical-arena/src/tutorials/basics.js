import { COMMANDS, attack, beginActivation, defend, finishActivation, moveUnit } from "../core/commands.js";
import { areEnemies, findUnit, livingUnits } from "../core/state.js";
import { getEffectiveStats, getUnitType, takesTurns } from "../core/unitCatalog.js";
import { getLegalMoves, positionKey } from "../rules/movement.js";
import { isShotBlocked, isWallBetween } from "../rules/combat.js";

export const TUTORIAL_BASICS_ID = "basics";
export const TUTORIAL_ARTS_MP_ID = "arts-mp";
export const TUTORIAL_ARTS_PLAYER_ARCHER_ID = "p1-0-archer";
export const TUTORIAL_ARTS_PLAYER_MYSTIC_ID = "p1-1-mystic";
export const TUTORIAL_ARTS_CPU_ARCHER_ID = "p2-3-archer";
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
    description: "Check ART ranges, set up Volley Shot, spend MP wisely, and heal with Pray.",
    available: true,
  }),
  Object.freeze({
    id: "positioning",
    title: "Tutorial 3",
    subtitle: "Positioning",
    description: "Line of sight, body blocks, walls, and threat ranges.",
    available: false,
  }),
  Object.freeze({
    id: "synergy",
    title: "Tutorial 4",
    subtitle: "Squad Synergy",
    description: "Auras, support turns, focus fire, and team plans.",
    available: false,
  }),
]);
export const TUTORIAL_IDS = Object.freeze(TUTORIAL_CATALOG.map((tutorial) => tutorial.id));
export const TUTORIAL_PROGRESS_KEY = "tacticalArenaTutorialProgress";

export const TUTORIAL_REWARD_SKIN_CHOICES = Object.freeze([
  Object.freeze({ type: "archer", slug: "summer-vibes" }),
  Object.freeze({ type: "swordsman", slug: "summer-vibes" }),
  Object.freeze({ type: "mystic", slug: "summer-vibes" }),
  Object.freeze({ type: "magician", slug: "summer-vibes" }),
]);

export const TUTORIAL_SQUAD = Object.freeze(["swordsman", "archer", "mystic", "magician"]);
export const PLAYER_ARCHER_ID = "p1-1-archer";
export const CPU_ARCHER_ID = "p2-1-archer";

const NORMAL_HIT = Object.freeze({ attackRoll: 0.5, critRoll: 0.99 });
const FORCED_MISS = Object.freeze({ attackRoll: 0.01 });
const FORCED_CRIT = Object.freeze({ attackRoll: 0.5, critRoll: 0.01 });
const ARTS_MP_ARCHER_MOVE = Object.freeze({ x: 4, y: 5 });
const ARTS_MP_VOLLEY_ORIGIN = Object.freeze({ x: 5, y: 5 });
const ARTS_MP_ENEMY_IDS = Object.freeze(["p2-0-ghoul", "p2-1-ghoul", "p2-2-ghoul", TUTORIAL_ARTS_CPU_ARCHER_ID]);

export function createTutorialMatchConfig(tutorialId = TUTORIAL_BASICS_ID) {
  const artsMp = tutorialId === TUTORIAL_ARTS_MP_ID;
  return {
    mode: "tutorial",
    tutorialId: artsMp ? TUTORIAL_ARTS_MP_ID : TUTORIAL_BASICS_ID,
    size: 13,
    seed: artsMp ? 23 : 7,
    squads: artsMp
      ? { 1: ["archer", "mystic"], 2: ["ghoul", "ghoul", "ghoul", "archer"] }
      : { 1: [...TUTORIAL_SQUAD], 2: [...TUTORIAL_SQUAD] },
    skins: artsMp
      ? { 1: [null, null], 2: [null, null, null, null] }
      : { 1: [null, null, null, null], 2: [null, null, null, null] },
  };
}

export function createTutorial(tutorialId = TUTORIAL_BASICS_ID) {
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

export function openingPrompt() {
  return "Tutorial 1: The Basics. Activate each unit, move with a tile click/tap or key 1, then Defend with the button or key 3.";
}

export function openingDialogue() {
  return [
    {
      name: "Instructor",
      text: "Each squad turn, every living unit gets one activation. A clean starter turn is Move, then Defend.",
    },
    {
      speaker: "swordsman",
      text: "Select each base unit once: Swordsman, Archer, Mystic, and Magician. Use key 1 to move and key 3 to defend.",
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

export function prepareTutorialMatchState(match, tutorialId = TUTORIAL_BASICS_ID) {
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
        mp: definition.stats.maxMp,
        spent: hiddenMystic ? true : false,
        defending: false,
      };
    }),
  };
}

export function prepareTutorialCommand(tutorial, command) {
  if (!tutorial || tutorial.completed || command?.type !== COMMANDS.ATTACK) return command;

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

  if (tutorial.id === TUTORIAL_ARTS_MP_ID) return validateArtsMpCommand(tutorial, command, match);

  if (
    tutorial.stage === "await_kite_attack" &&
    command.player === 1 &&
    activeCommandUnitId(command) === PLAYER_ARCHER_ID &&
    command.type !== COMMANDS.BEGIN_ACTIVATION &&
    command.type !== COMMANDS.ATTACK &&
    command.type !== COMMANDS.CANCEL_MOVE
  ) {
    return tutorialBlocked("Attack first with your Archer. After that shot, you can move her before ending the activation.");
  }

  return tutorialAllowed();
}

export function recordTutorialCommand(tutorial, { command, events = [], match, previousPlayer = match?.currentPlayer } = {}) {
  if (!tutorial || tutorial.completed) return noUpdate();
  if (tutorial.id === TUTORIAL_ARTS_MP_ID) {
    return recordArtsMpCommand(tutorial, { command, events, match, previousPlayer });
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
      prompt: "Good. The CPU will now advance with normal movement only, then brace. Watch the enemy formation close the gap.",
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
        prompt: "Now approach with your squad while keeping your ranged units positioned. Take your full turn.",
      });
    }
  }

  return noUpdate();
}

export function chooseTutorialCpuActivation(match, tutorial) {
  const player = match?.currentPlayer ?? 2;

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
    let target = findLegalTarget(actingMatch, actingArcher);
    if (!target) {
      const step = approachMove(match, archer);
      if (step) {
        commands.push(moveUnit(player, archer.id, step.x, step.y));
        actingMatch = moveUnitInMatch(match, archer.id, step);
        actingArcher = findUnit(actingMatch, archer.id);
        target = findLegalTarget(actingMatch, actingArcher);
      }
    }
    if (target) commands.push(attack(player, archer.id, target.id));
    else commands.push(defend(player, archer.id));
    commands.push(finishActivation(player, archer.id));
    return commands;
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
  const completed = new Set(current.completedTutorials);
  if (TUTORIAL_IDS.includes(tutorialId)) completed.add(tutorialId);

  const completedTutorials = TUTORIAL_IDS.filter((id) => completed.has(id));
  // More tutorials are still coming, so Tutorial #1 should not grant a skin yet.
  // The reward model is a curated choice pool; a later completion flow can unlock
  // selection from this list once the full tutorial set exists.
  const next = {
    completedTutorials,
    rewardChoices: [...TUTORIAL_REWARD_SKIN_CHOICES],
    selectedRewardSkin: normalizeRewardSkin(current.selectedRewardSkin),
    rewardGranted: false,
    allTutorialsComplete: false,
  };
  writeProgress(storage, next);
  return next;
}

export function readProgress(storage = globalThis.localStorage) {
  const fallback = {
    completedTutorials: [],
    rewardChoices: [...TUTORIAL_REWARD_SKIN_CHOICES],
    selectedRewardSkin: null,
    rewardGranted: false,
    allTutorialsComplete: false,
  };

  try {
    const raw = storage?.getItem?.(TUTORIAL_PROGRESS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const completedTutorials = Array.isArray(parsed.completedTutorials)
      ? [...new Set(parsed.completedTutorials.filter((id) => TUTORIAL_IDS.includes(id)))]
      : [];
    const selectedRewardSkin = normalizeRewardSkin(parsed.selectedRewardSkin);
    return {
      completedTutorials,
      rewardChoices: [...TUTORIAL_REWARD_SKIN_CHOICES],
      selectedRewardSkin,
      rewardGranted: false,
      allTutorialsComplete: false,
    };
  } catch {
    return fallback;
  }
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
        prompt: "Hit confirmed. Attacks roll to hit: very low rolls miss, normal rolls land, and strong rolls can crit. Finish your squad turn so the enemy Archer can answer with a basic attack.",
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

function setStage(tutorial, stage, { prompt, dialogue = null, completed = false, spotlight = null, selectUnitId = null, beforeDialogueAction = null, afterDialogueAction = null } = {}) {
  tutorial.stage = stage;
  tutorial.prompt = prompt ?? tutorial.prompt ?? null;
  if (completed) tutorial.completed = true;
  return { prompt: tutorial.prompt, dialogue, completed: Boolean(completed), spotlight, selectUnitId, beforeDialogueAction, afterDialogueAction };
}

function noUpdate() {
  return { prompt: null, dialogue: null, completed: false, spotlight: null, selectUnitId: null, beforeDialogueAction: null, afterDialogueAction: null };
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

function canTargetUnit(match, attacker, target) {
  if (!match || !attacker || !target || target.hp <= 0 || !areEnemies(attacker, target)) return false;
  const range = getEffectiveStats(attacker, match).attackRange;
  return chebyshev(attacker.position, target.position) <= range &&
    !isShotBlocked(match, attacker.position, target.position, attacker) &&
    !isWallBetween(match, attacker.position, target.position, attacker);
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

function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function normalizeRewardSkin(value) {
  if (!value || typeof value !== "object") return null;
  return TUTORIAL_REWARD_SKIN_CHOICES.find((skin) => skin.type === value.type && skin.slug === value.slug) ?? null;
}

function writeProgress(storage, progress) {
  try {
    storage?.setItem?.(TUTORIAL_PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Blocked storage should never stop the tutorial flow.
  }
}
