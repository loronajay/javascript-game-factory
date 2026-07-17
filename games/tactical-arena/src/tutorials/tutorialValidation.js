// The tutorial engine: validates player commands against the current stage and
// records accepted commands/events to advance each tutorial's scripted state
// machine (prompts, dialogue, spotlights, formation swaps, completion).

import { COMMANDS, attack, defend } from "../core/commands.js";

import {
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
  TUTORIAL_RAGE_CPU_MAGICIAN_ID,
  TUTORIAL_STATUS_PLAYER_SWORDSMAN_ID,
  TUTORIAL_STATUS_PLAYER_MAGICIAN_ID,
  TUTORIAL_STATUS_PLAYER_ARCHER_ID,
  TUTORIAL_STATUS_PLAYER_VIRUS_ID,
  TUTORIAL_STATUS_PLAYER_MYSTIC_ID,
  TUTORIAL_STATUS_CPU_SWORDSMAN_ID,
  TUTORIAL_STATUS_CPU_MAGICIAN_ID,
  TUTORIAL_STATUS_CPU_MYSTIC_ID,
  TUTORIAL_STATUS_CPU_FAT_BOWMAN_ID,
  PLAYER_ARCHER_ID,
  CPU_ARCHER_ID,
  BASICS_PLAYER_IDS,
  ARTS_MP_ARCHER_MOVE,
  ARTS_MP_VOLLEY_ORIGIN,
  ARTS_MP_ENEMY_IDS,
  DAMAGE_TYPES_SWORDSMAN_MOVE,
  RAGE_ARCHER_HP,
  RAGE_CPU_MAGICIAN_POSITION,
  RAGE_ARCHER_START,
  RAGE_ARCHER_RETREAT,
  STATUS_SILENCE_PLAYER_MAGICIAN_POSITION,
  STATUS_SILENCE_PLAYER_SWORDSMAN_POSITION,
  STATUS_SILENCE_PLAYER_MYSTIC_POSITION,
  STATUS_SILENCE_CPU_MAGICIAN_POSITION,
  STATUS_POISON_PLAYER_ARCHER_POSITION,
  STATUS_POISON_PLAYER_VIRUS_POSITION,
  STATUS_POISON_CPU_FAT_BOWMAN_POSITION,
  STATUS_POISON_CPU_MYSTIC_POSITION,
} from "./tutorialContent.js";
import {
  setStage,
  noUpdate,
  tutorialAllowed,
  tutorialBlocked,
  activeCommandUnitId,
  archerHasTarget,
  samePosition,
  footworkPathHitsClod,
} from "./tutorialRuntimeHelpers.js";

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

