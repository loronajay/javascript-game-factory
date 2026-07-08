import { COMMANDS } from "../core/commands.js";
import { EVENTS } from "../core/events.js";
import { createRngState, rollD6 } from "../core/rng.js";
import { getLegalAttackTargets } from "../rules/combat.js";

export const TUTORIAL_BASICS_ID = "basics";
export const TUTORIAL_IDS = Object.freeze([TUTORIAL_BASICS_ID]);
export const TUTORIAL_PROGRESS_KEY = "miniTacticsTutorialProgress";
export const CURATED_TUTORIAL_SKINS = Object.freeze([
  "Sunlit Vanguard",
  "Moonsteel Banner",
  "Emberleaf Guard",
  "Starlace Duelist",
]);

const PLAYER_RANGER_ID = "p1-ranger";
const CPU_RANGER_ID = "p2-ranger";

const ROLL_STATES = Object.freeze({
  hit: rngStateForRoll((roll) => roll >= 2 && roll <= 5),
  miss: rngStateForRoll((roll) => roll === 1),
  crit: rngStateForRoll((roll) => roll === 6),
});

export function createBasicsTutorial() {
  return {
    id: TUTORIAL_BASICS_ID,
    stage: "practice_defense",
    completed: false,
    prompt: openingPrompt(),
  };
}

export function openingPrompt() {
  return (
    "Tutorial 1: The Basics. Activate every unit once. Move with a click/tap or key 1, " +
    "then Defend with key 4. Tanks use Guard; choose the Tank itself to brace."
  );
}

export function prepareTutorialCommand(tutorial, match, command) {
  const forced = forcedRollFor(tutorial, command);
  if (!forced) return match;
  return { ...match, rngState: forced };
}

export function recordTutorialCommand(tutorial, { command, events, match }) {
  if (!tutorial || tutorial.completed) {
    return { prompt: null, completed: false };
  }

  const attack = events.find((event) => event.type === EVENTS.ATTACK_RESOLVED);
  if (attack) {
    return recordAttack(tutorial, attack);
  }

  if (
    tutorial.stage === "await_kite_move" &&
    command.type === COMMANDS.MOVE_UNIT &&
    command.unitId === PLAYER_RANGER_ID
  ) {
    tutorial.stage = "await_final_crit";
    tutorial.prompt =
      "That is kiting: shoot, then move so the enemy has to chase. Finish the squad turn; your next Ranger attack will show a critical strike.";
    return { prompt: tutorial.prompt, completed: false };
  }

  const turnChanged = events.find((event) => event.type === EVENTS.TURN_CHANGED);
  if (turnChanged?.player === 1 && rangerHasTarget(match)) {
    if (tutorial.stage === "practice_defense") {
      tutorial.stage = "await_first_attack";
      tutorial.prompt =
        "Your Ranger is in range. Select the Ranger, choose Attack with the button or key 2, then target the enemy Ranger.";
      return { prompt: tutorial.prompt, completed: false };
    }
    if (tutorial.stage === "await_final_crit") {
      tutorial.prompt =
        "Bring the Ranger back online and attack again. This roll is set up to demonstrate a critical strike.";
      return { prompt: tutorial.prompt, completed: false };
    }
  }

  return { prompt: null, completed: false };
}

export function completeTutorial(storage, tutorialId) {
  const current = readProgress(storage);
  const completed = new Set(current.completedTutorials);
  completed.add(tutorialId);

  const completedTutorials = TUTORIAL_IDS.filter((id) => completed.has(id));
  const allTutorialsComplete = TUTORIAL_IDS.every((id) => completed.has(id));
  const rewardSkin =
    current.rewardSkin || (allTutorialsComplete ? CURATED_TUTORIAL_SKINS[0] : null);
  const rewardGranted = Boolean(allTutorialsComplete && rewardSkin);

  const next = {
    completedTutorials,
    rewardSkin,
    rewardGranted,
    allTutorialsComplete,
  };
  writeProgress(storage, next);
  return next;
}

export function readProgress(storage = globalThis.localStorage) {
  const fallback = {
    completedTutorials: [],
    rewardSkin: null,
    rewardGranted: false,
    allTutorialsComplete: false,
  };

  try {
    const raw = storage?.getItem?.(TUTORIAL_PROGRESS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const completed = Array.isArray(parsed.completedTutorials)
      ? parsed.completedTutorials.filter((id) => TUTORIAL_IDS.includes(id))
      : [];
    const rewardSkin = CURATED_TUTORIAL_SKINS.includes(parsed.rewardSkin)
      ? parsed.rewardSkin
      : null;
    return {
      completedTutorials: [...new Set(completed)],
      rewardSkin,
      rewardGranted: Boolean(parsed.rewardGranted && rewardSkin),
      allTutorialsComplete: TUTORIAL_IDS.every((id) => completed.includes(id)),
    };
  } catch {
    return fallback;
  }
}

function writeProgress(storage, progress) {
  try {
    storage?.setItem?.(TUTORIAL_PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Private browsing or blocked storage should never stop the tutorial flow.
  }
}

function recordAttack(tutorial, attack) {
  if (attack.actorId === PLAYER_RANGER_ID) {
    if (tutorial.stage === "await_kite_attack") {
      tutorial.stage = "await_kite_move";
      tutorial.prompt =
        "Hit confirmed. Now move the Ranger after attacking to create space before ending the activation.";
      return { prompt: tutorial.prompt, completed: false };
    }

    if (tutorial.stage === "await_final_crit" && attack.critical) {
      tutorial.completed = true;
      tutorial.stage = "complete";
      tutorial.prompt =
        "Critical strike. Tutorial complete: you have seen turns, movement, defense, attacks, misses, kiting, and crits.";
      return { prompt: tutorial.prompt, completed: true };
    }

    tutorial.stage = "await_counter_turn";
    tutorial.prompt =
      "Your attack hit. Every attack rolls a die: 1 misses, 6 crits, and the middle rolls hit normally. Finish the squad turn so the enemy Ranger can answer.";
    return { prompt: tutorial.prompt, completed: false };
  }

  if (attack.actorId === CPU_RANGER_ID && tutorial.stage === "cpu_counterattack") {
    tutorial.stage = "await_kite_attack";
    tutorial.prompt =
      "The enemy Ranger missed on a 1. Select your Ranger again when your squad turn returns: attack first, then move away to kite.";
    return { prompt: tutorial.prompt, completed: false };
  }

  return { prompt: null, completed: false };
}

function forcedRollFor(tutorial, command) {
  if (!tutorial || command?.type !== COMMANDS.ATTACK) return null;

  if (command.actorId === CPU_RANGER_ID && tutorial.stage === "cpu_counterattack") {
    return ROLL_STATES.miss;
  }

  if (command.actorId !== PLAYER_RANGER_ID) return null;

  if (tutorial.stage === "await_final_crit") return ROLL_STATES.crit;
  if (tutorial.stage === "await_kite_attack") return ROLL_STATES.hit;
  if (
    tutorial.stage === "practice_defense" ||
    tutorial.stage === "await_first_attack" ||
    tutorial.stage === "await_counter_turn"
  ) {
    return ROLL_STATES.hit;
  }

  return null;
}

function rangerHasTarget(match) {
  const ranger = match.units.find((unit) => unit.id === PLAYER_RANGER_ID);
  if (!ranger || ranger.hp <= 0) return false;
  return getLegalAttackTargets(match, ranger).size > 0;
}

function rngStateForRoll(predicate) {
  for (let seed = 1; seed < 200000; seed += 1) {
    const state = createRngState(seed);
    if (predicate(rollD6(state).roll)) return state;
  }
  throw new Error("Unable to find tutorial RNG state.");
}
