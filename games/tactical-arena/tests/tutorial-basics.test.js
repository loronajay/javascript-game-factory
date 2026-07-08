import test from "node:test";
import assert from "node:assert/strict";

import { attack, beginActivation, defend, finishActivation, moveUnit } from "../src/core/commands.js";
import { applyCommand } from "../src/core/reducer.js";
import { createMatchState } from "../src/match/matchBuilder.js";
import { getVolleyShotCells } from "../src/rules/arts.js";
import { positionKey } from "../src/rules/movement.js";
import {
  TUTORIAL_ARTS_MP_ID,
  TUTORIAL_ARTS_CPU_ARCHER_ID,
  TUTORIAL_ARTS_PLAYER_ARCHER_ID,
  TUTORIAL_ARTS_PLAYER_MYSTIC_ID,
  TUTORIAL_BASICS_ID,
  chooseTutorialCpuActivation,
  completeTutorial,
  createBasicsTutorial,
  createTutorial,
  createTutorialMatchConfig,
  getNextTutorialId,
  getTutorialList,
  prepareTutorialMatchState,
  prepareTutorialCommand,
  recordTutorialCommand,
  validateTutorialCommand,
} from "../src/tutorials/basics.js";
import { useArt } from "../src/core/commands.js";

function applyTutorial(tutorial, match, command) {
  const prepared = prepareTutorialCommand(tutorial, command);
  const previousPlayer = match.currentPlayer;
  const result = applyCommand(match, prepared);
  assert.equal(result.accepted, true, `expected ${command.type} to be accepted`);
  const update = recordTutorialCommand(tutorial, {
    command: prepared,
    events: result.events,
    match: result.nextState,
    previousPlayer,
  });
  return { match: result.nextState, update, events: result.events };
}

function makeMatch() {
  return createMatchState(createTutorialMatchConfig());
}

test("basics tutorial config starts player one with the four base units", () => {
  const match = makeMatch();

  assert.equal(match.currentPlayer, 1);
  assert.deepEqual(
    match.units.filter((unit) => unit.player === 1).map((unit) => unit.type),
    ["swordsman", "archer", "mystic", "magician"],
  );
  assert.deepEqual(
    match.units.filter((unit) => unit.player === 2).map((unit) => unit.type),
    ["swordsman", "archer", "mystic", "magician"],
  );
});

test("basics tutorial tracks defense practice and detects the first archer range lesson", () => {
  const tutorial = createBasicsTutorial();
  let match = makeMatch();

  for (const unit of match.units.filter((candidate) => candidate.player === 1)) {
    ({ match } = applyTutorial(tutorial, match, beginActivation(1, unit.id)));
    ({ match } = applyTutorial(tutorial, match, defend(1, unit.id)));
    ({ match } = applyTutorial(tutorial, match, finishActivation(1, unit.id)));
  }

  assert.equal(match.currentPlayer, 2);
  assert.equal(tutorial.stage, "cpu_approach");

  match = {
    ...match,
    currentPlayer: 1,
    units: match.units.map((unit) =>
      unit.id === "p1-1-archer"
        ? { ...unit, spent: false, position: { x: 4, y: 6 } }
        : unit.id === "p2-1-archer"
          ? { ...unit, position: { x: 8, y: 6 } }
          : unit,
    ),
  };

  const update = recordTutorialCommand(tutorial, {
    command: finishActivation(2, "p2-0-swordsman"),
    events: [],
    match,
    previousPlayer: 2,
  });

  assert.equal(tutorial.stage, "await_first_attack");
  assert.match(update.prompt, /Archer has a target in range/);
  assert.equal(update.dialogue?.[0]?.speakerId, "p1-1-archer");
});

test("basics tutorial forces hit, miss, kiting, and final critical strike", () => {
  const tutorial = createBasicsTutorial();
  let match = {
    ...makeMatch(),
    units: makeMatch().units.map((unit) => {
      if (unit.id === "p1-1-archer") return { ...unit, position: { x: 4, y: 6 } };
      if (unit.id === "p2-1-archer") return { ...unit, position: { x: 8, y: 6 } };
      return { ...unit, spent: unit.player === 1 && unit.id !== "p1-1-archer" };
    }),
  };

  tutorial.stage = "await_first_attack";
  ({ match } = applyTutorial(tutorial, match, beginActivation(1, "p1-1-archer")));
  let applied = applyTutorial(tutorial, match, attack(1, "p1-1-archer", "p2-1-archer"));
  let attackEvent = applied.events.find((event) => event.type === "ATTACK_RESOLVED");
  assert.equal(attackEvent.hit, true);
  assert.equal(attackEvent.critical, false);
  assert.equal(tutorial.stage, "await_cpu_counterattack");
  match = applied.match;

  match = {
    ...match,
    currentPlayer: 2,
    activation: null,
    units: match.units.map((unit) => ({ ...unit, spent: unit.player === 2 ? unit.id !== "p2-1-archer" : unit.spent })),
  };
  ({ match } = applyTutorial(tutorial, match, beginActivation(2, "p2-1-archer")));
  applied = applyTutorial(tutorial, match, attack(2, "p2-1-archer", "p1-1-archer"));
  attackEvent = applied.events.find((event) => event.type === "ATTACK_RESOLVED");
  assert.equal(attackEvent.hit, false);
  assert.equal(tutorial.stage, "await_kite_attack");
  match = applied.match;

  match = {
    ...match,
    currentPlayer: 1,
    activation: null,
    units: match.units.map((unit) => unit.id === "p1-1-archer" ? { ...unit, spent: false } : unit),
  };
  ({ match } = applyTutorial(tutorial, match, beginActivation(1, "p1-1-archer")));
  applied = applyTutorial(tutorial, match, attack(1, "p1-1-archer", "p2-1-archer"));
  attackEvent = applied.events.find((event) => event.type === "ATTACK_RESOLVED");
  assert.equal(attackEvent.hit, true);
  assert.equal(attackEvent.critical, false);
  assert.equal(tutorial.stage, "await_kite_move");
  match = applied.match;

  ({ match } = applyTutorial(tutorial, match, moveUnit(1, "p1-1-archer", 4, 7)));
  assert.equal(tutorial.stage, "await_final_crit");

  match = {
    ...match,
    activation: null,
    units: match.units.map((unit) => unit.id === "p1-1-archer" ? { ...unit, spent: false } : unit),
  };
  ({ match } = applyTutorial(tutorial, match, beginActivation(1, "p1-1-archer")));
  applied = applyTutorial(tutorial, match, attack(1, "p1-1-archer", "p2-1-archer"));
  attackEvent = applied.events.find((event) => event.type === "ATTACK_RESOLVED");
  assert.equal(attackEvent.hit, true);
  assert.equal(attackEvent.critical, true);
  assert.equal(tutorial.completed, true);
});

test("tutorial blocks moving the archer before attacking in the kiting lesson", () => {
  const tutorial = createBasicsTutorial();
  tutorial.stage = "await_kite_attack";
  const match = makeMatch();

  const select = validateTutorialCommand(tutorial, beginActivation(1, "p1-1-archer"), match);
  const blocked = validateTutorialCommand(tutorial, moveUnit(1, "p1-1-archer", 1, 8), match);
  const allowed = validateTutorialCommand(tutorial, attack(1, "p1-1-archer", "p2-1-archer"), match);

  assert.equal(select.accepted, true);
  assert.equal(blocked.accepted, false);
  assert.equal(blocked.message, "Attack first with your Archer. After that shot, you can move her before ending the activation.");
  assert.equal(allowed.accepted, true);
});

test("tutorial CPU archer can counterattack any legal target to progress", () => {
  const tutorial = createBasicsTutorial();
  tutorial.stage = "await_cpu_counterattack";
  let match = {
    ...makeMatch(),
    currentPlayer: 2,
    units: makeMatch().units.map((unit) => {
      if (unit.id === "p2-1-archer") return { ...unit, spent: false, position: { x: 8, y: 6 } };
      if (unit.id === "p1-1-archer") return { ...unit, position: { x: 2, y: 6 } };
      if (unit.id === "p1-2-mystic") return { ...unit, position: { x: 8, y: 2 } };
      return { ...unit, spent: unit.player === 2 };
    }),
  };

  const commands = chooseTutorialCpuActivation(match, tutorial);

  assert.deepEqual(commands.map((command) => command.type), [
    "BEGIN_ACTIVATION",
    "ATTACK",
    "FINISH_ACTIVATION",
  ]);
  assert.equal(commands[1].targetId, "p1-2-mystic");

  let update = null;
  let attackEvent = null;
  for (const command of commands) {
    const prepared = prepareTutorialCommand(tutorial, command);
    const result = applyCommand(match, prepared);
    assert.equal(result.accepted, true, `expected ${command.type} to be accepted`);
    attackEvent = result.events.find((event) => event.type === "ATTACK_RESOLVED") ?? attackEvent;
    update = recordTutorialCommand(tutorial, {
      command: prepared,
      events: result.events,
      match: result.nextState,
      previousPlayer: match.currentPlayer,
    });
    match = result.nextState;
  }

  assert.equal(attackEvent?.actorId, "p2-1-archer");
  assert.equal(attackEvent?.targetId, "p1-2-mystic");
  assert.equal(attackEvent?.hit, false);
  assert.equal(tutorial.stage, "await_kite_attack");
  assert.match(update.prompt, /attack first, then move/i);
  assert.match(update.prompt, /kiting/i);
});

test("tutorial CPU archer moves before the scripted counterattack when no target is initially legal", () => {
  const tutorial = createBasicsTutorial();
  tutorial.stage = "await_cpu_counterattack";
  let match = {
    ...makeMatch(),
    currentPlayer: 2,
    units: makeMatch().units.map((unit) => {
      if (unit.id === "p2-1-archer") return { ...unit, spent: false, position: { x: 8, y: 6 } };
      if (unit.id === "p1-1-archer") return { ...unit, position: { x: 2, y: 6 } };
      if (unit.id === "p1-2-mystic") return { ...unit, position: { x: 0, y: 2 } };
      return { ...unit, spent: unit.player === 2 };
    }),
  };

  const commands = chooseTutorialCpuActivation(match, tutorial);

  assert.deepEqual(commands.map((command) => command.type), [
    "BEGIN_ACTIVATION",
    "MOVE_UNIT",
    "ATTACK",
    "FINISH_ACTIVATION",
  ]);
  assert.ok(commands[2].targetId.startsWith("p1-"));

  let attackEvent = null;
  for (const command of commands) {
    const prepared = prepareTutorialCommand(tutorial, command);
    const result = applyCommand(match, prepared);
    assert.equal(result.accepted, true, `expected ${command.type} to be accepted`);
    attackEvent = result.events.find((event) => event.type === "ATTACK_RESOLVED") ?? attackEvent;
    match = result.nextState;
  }

  assert.equal(attackEvent?.actorId, "p2-1-archer");
  assert.equal(attackEvent?.hit, false);
});

test("tutorial list exposes completion, unlocked, and locked states", () => {
  const storage = new Map();
  const adapter = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };

  completeTutorial(adapter, TUTORIAL_BASICS_ID);
  const tutorials = getTutorialList(adapter);

  assert.equal(tutorials[0].id, TUTORIAL_BASICS_ID);
  assert.equal(tutorials[0].status, "completed");
  assert.equal(tutorials[0].locked, false);
  assert.equal(tutorials[1].status, "unlocked");
  assert.equal(tutorials[1].available, true);
  assert.equal(tutorials[1].id, TUTORIAL_ARTS_MP_ID);
  assert.ok(tutorials.some((tutorial) => tutorial.status === "locked"));
});

test("next tutorial lookup routes tutorial 1 completion into the playable arts/mp lesson", () => {
  const storage = new Map();
  const adapter = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };

  completeTutorial(adapter, TUTORIAL_BASICS_ID);
  assert.equal(getNextTutorialId(adapter, TUTORIAL_BASICS_ID), TUTORIAL_ARTS_MP_ID);

  completeTutorial(adapter, TUTORIAL_ARTS_MP_ID);
  assert.equal(getNextTutorialId(adapter, TUTORIAL_ARTS_MP_ID), null);
});

test("arts/mp tutorial config and setup create the volley formation with mystic hidden", () => {
  const config = createTutorialMatchConfig(TUTORIAL_ARTS_MP_ID);
  const match = prepareTutorialMatchState(createMatchState(config), TUTORIAL_ARTS_MP_ID);
  const archer = match.units.find((unit) => unit.id === TUTORIAL_ARTS_PLAYER_ARCHER_ID);
  const mystic = match.units.find((unit) => unit.id === TUTORIAL_ARTS_PLAYER_MYSTIC_ID);
  const enemyIds = ["p2-0-ghoul", "p2-1-ghoul", "p2-2-ghoul", "p2-3-archer"];

  assert.equal(config.tutorialId, TUTORIAL_ARTS_MP_ID);
  assert.deepEqual(config.squads[1], ["archer", "mystic"]);
  assert.deepEqual(config.squads[2], ["ghoul", "ghoul", "ghoul", "archer"]);
  assert.deepEqual(archer.position, { x: 2, y: 5 });
  assert.equal(mystic.hp, 0);
  assert.equal(match.currentPlayer, 1);

  const startingCone = getVolleyShotCells(match, archer, { x: 3, y: 5 }).map(positionKey);
  assert.equal(enemyIds.some((id) => startingCone.includes(positionKey(match.units.find((unit) => unit.id === id).position))), false);

  const movedArcher = { ...archer, position: { x: 4, y: 5 } };
  const movedCone = getVolleyShotCells(match, movedArcher, { x: 5, y: 5 }).map(positionKey);
  assert.equal(enemyIds.every((id) => movedCone.includes(positionKey(match.units.find((unit) => unit.id === id).position))), true);
});

test("arts/mp tutorial gates range check, move and defend, volley, then pray", () => {
  const tutorial = createTutorial(TUTORIAL_ARTS_MP_ID);
  let match = prepareTutorialMatchState(createMatchState(createTutorialMatchConfig(TUTORIAL_ARTS_MP_ID)), TUTORIAL_ARTS_MP_ID);

  ({ match } = applyTutorial(tutorial, match, beginActivation(1, TUTORIAL_ARTS_PLAYER_ARCHER_ID)));
  let blocked = validateTutorialCommand(tutorial, useArt(1, TUTORIAL_ARTS_PLAYER_ARCHER_ID, "volley-shot", { targetPosition: { x: 3, y: 5 } }), match);
  assert.equal(blocked.accepted, false);
  assert.match(blocked.message, /out of reach/i);
  assert.equal(tutorial.stage, "await_move");

  blocked = validateTutorialCommand(tutorial, useArt(1, TUTORIAL_ARTS_PLAYER_ARCHER_ID, "volley-shot", { targetPosition: { x: 3, y: 5 } }), match);
  assert.equal(blocked.accepted, false);
  assert.match(blocked.message, /move and defend/i);

  ({ match } = applyTutorial(tutorial, match, moveUnit(1, TUTORIAL_ARTS_PLAYER_ARCHER_ID, 4, 5)));
  assert.equal(tutorial.stage, "await_defend");
  ({ match } = applyTutorial(tutorial, match, defend(1, TUTORIAL_ARTS_PLAYER_ARCHER_ID)));
  assert.equal(tutorial.stage, "await_enemy_counterattack");
  ({ match } = applyTutorial(tutorial, match, finishActivation(1, TUTORIAL_ARTS_PLAYER_ARCHER_ID)));

  for (const command of chooseTutorialCpuActivation(match, tutorial)) {
    ({ match } = applyTutorial(tutorial, match, command));
  }
  assert.equal(tutorial.stage, "await_volley");
  assert.equal(match.currentPlayer, 1);
  assert.ok(match.units.find((unit) => unit.id === TUTORIAL_ARTS_PLAYER_ARCHER_ID).hp < 24);

  ({ match } = applyTutorial(tutorial, match, beginActivation(1, TUTORIAL_ARTS_PLAYER_ARCHER_ID)));
  const volley = applyTutorial(tutorial, match, useArt(1, TUTORIAL_ARTS_PLAYER_ARCHER_ID, "volley-shot", { targetPosition: { x: 5, y: 5 } }));
  const volleyEvent = volley.events.find((event) => event.type === "ART_RESOLVED");
  assert.deepEqual(new Set(volleyEvent.targetIds), new Set(["p2-0-ghoul", "p2-1-ghoul", "p2-2-ghoul", "p2-3-archer"]));
  assert.equal(tutorial.stage, "await_post_volley_counterattack");
  assert.equal(volley.update.spotlight, "mp");
  assert.equal(volley.update.selectUnitId, TUTORIAL_ARTS_PLAYER_ARCHER_ID);
  assert.equal(volley.update.afterDialogueAction, null);
  assert.equal(volley.match.units.find((unit) => unit.id === TUTORIAL_ARTS_PLAYER_MYSTIC_ID).hp, 0);
  assert.equal(volley.match.currentPlayer, 2);

  match = volley.match;
  let cpuUpdate = null;
  let postVolleyAttack = null;
  for (const command of chooseTutorialCpuActivation(match, tutorial)) {
    const applied = applyTutorial(tutorial, match, command);
    match = applied.match;
    cpuUpdate = applied.update;
    postVolleyAttack = applied.events.find((event) => event.type === "ATTACK_RESOLVED") ?? postVolleyAttack;
  }
  assert.equal(postVolleyAttack?.actorId, TUTORIAL_ARTS_CPU_ARCHER_ID);
  assert.equal(postVolleyAttack?.targetId, TUTORIAL_ARTS_PLAYER_ARCHER_ID);
  assert.equal(tutorial.stage, "await_pray");
  assert.equal(match.currentPlayer, 1);
  assert.deepEqual(cpuUpdate.beforeDialogueAction, {
    type: "revealUnit",
    unitId: TUTORIAL_ARTS_PLAYER_MYSTIC_ID,
    position: { x: 4, y: 6 },
    currentPlayer: 1,
  });
  assert.equal(cpuUpdate.dialogue?.[0]?.speakerId, TUTORIAL_ARTS_PLAYER_MYSTIC_ID);

  match = {
    ...match,
    currentPlayer: 1,
    units: match.units.map((unit) =>
      unit.id === TUTORIAL_ARTS_PLAYER_MYSTIC_ID
        ? { ...unit, hp: 23, spent: false }
        : unit
    ),
  };

  ({ match } = applyTutorial(tutorial, match, beginActivation(1, TUTORIAL_ARTS_PLAYER_MYSTIC_ID)));
  const pray = applyTutorial(tutorial, match, useArt(1, TUTORIAL_ARTS_PLAYER_MYSTIC_ID, "pray"));
  const prayEvent = pray.events.find((event) => event.type === "ART_RESOLVED");
  assert.equal(prayEvent.artId, "pray");
  assert.equal(tutorial.completed, true);
});

test("completing the first tutorial saves progress without granting the future skin choice", () => {
  const storage = new Map();
  const adapter = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };

  const progress = completeTutorial(adapter, TUTORIAL_BASICS_ID);

  assert.deepEqual(progress.completedTutorials, [TUTORIAL_BASICS_ID]);
  assert.equal(progress.allTutorialsComplete, false);
  assert.equal(progress.rewardGranted, false);
  assert.equal(progress.selectedRewardSkin, null);
  assert.ok(progress.rewardChoices.some((choice) => choice.type === "archer" && choice.slug === "summer-vibes"));
});

test("basics tutorial copy teaches kiting without claiming the player is live-battle ready", () => {
  const tutorial = createBasicsTutorial();
  tutorial.stage = "await_final_crit";

  const update = recordTutorialCommand(tutorial, {
    events: [{ type: "ATTACK_RESOLVED", actorId: "p1-1-archer", targetId: "p2-1-archer", hit: true, critical: true }],
  });

  assert.match(update.prompt, /kiting/i);
  assert.doesNotMatch(update.prompt, /live battles/i);
  assert.doesNotMatch(update.dialogue.map((line) => line.text).join(" "), /live battles/i);
  assert.match(update.dialogue.map((line) => line.text).join(" "), /later tutorials/i);
  assert.match(getTutorialList()[0].description, /kiting/i);
});
