import test from "node:test";
import assert from "node:assert/strict";

import { attack, beginActivation, defend, finishActivation, moveUnit, useArt } from "../src/core/commands.js";
import { applyCommand } from "../src/core/reducer.js";
import { createUnit } from "../src/core/state.js";
import { createMatchState } from "../src/match/matchBuilder.js";
import { getVolleyShotCells } from "../src/rules/arts.js";
import { positionKey } from "../src/rules/movement.js";
import {
  TUTORIAL_ARTS_MP_ID,
  TUTORIAL_ARTS_CPU_ARCHER_ID,
  TUTORIAL_ARTS_PLAYER_ARCHER_ID,
  TUTORIAL_ARTS_PLAYER_MYSTIC_ID,
  TUTORIAL_BASICS_ID,
  CPU_ARCHER_ID,
  PLAYER_ARCHER_ID,
  TUTORIAL_DAMAGE_TYPES_ID,
  TUTORIAL_DAMAGE_TYPES_PLAYER_MAGICIAN_ID,
  TUTORIAL_DAMAGE_TYPES_PLAYER_SWORDSMAN_ID,
  TUTORIAL_DAMAGE_TYPES_CPU_CLOD_ID,
  TUTORIAL_RAGE_ID,
  TUTORIAL_RAGE_PLAYER_MAGICIAN_ID,
  TUTORIAL_RAGE_PLAYER_ARCHER_ID,
  TUTORIAL_RAGE_CPU_SWORDSMAN_ID,
  TUTORIAL_RAGE_CPU_MAGICIAN_ID,
  TUTORIAL_STATUS_EFFECTS_ID,
  TUTORIAL_STATUS_PLAYER_SWORDSMAN_ID,
  TUTORIAL_STATUS_PLAYER_MAGICIAN_ID,
  TUTORIAL_STATUS_PLAYER_ARCHER_ID,
  TUTORIAL_STATUS_PLAYER_VIRUS_ID,
  TUTORIAL_STATUS_CPU_SWORDSMAN_ID,
  TUTORIAL_STATUS_CPU_MAGICIAN_ID,
  TUTORIAL_STATUS_CPU_MYSTIC_ID,
  TUTORIAL_STATUS_CPU_FAT_BOWMAN_ID,
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
  return prepareTutorialMatchState(createMatchState(createTutorialMatchConfig()), TUTORIAL_BASICS_ID);
}

function applyFormationSwapForTest(match, action) {
  const hidden = new Set(action.hideUnitIds ?? []);
  const revealById = new Map((action.revealUnits ?? []).map((unit) => [unit.unitId, unit]));
  const existingIds = new Set(match.units.map((unit) => unit.id));
  return {
    ...match,
    currentPlayer: Number.isInteger(action.currentPlayer) ? action.currentPlayer : match.currentPlayer,
    activation: null,
    units: [
      ...match.units.map((unit) => {
        if (hidden.has(unit.id)) return { ...unit, hp: 0, spent: true, defending: false };
        const reveal = revealById.get(unit.id);
        if (!reveal) return unit;
        return {
          ...unit,
          position: { ...(reveal.position ?? unit.position) },
          hp: Number.isFinite(reveal.hp) ? reveal.hp : unit.hp,
          mp: Number.isFinite(reveal.mp) ? reveal.mp : unit.mp,
          spent: Boolean(reveal.spent),
          defending: false,
          statuses: [],
        };
      }),
      ...(action.spawnUnits ?? [])
        .filter((unit) => !existingIds.has(unit.id))
        .map((unit) => ({
          ...createUnit({ id: unit.id, type: unit.type, player: unit.player, x: unit.position.x, y: unit.position.y, skin: unit.skin }),
          ...(Number.isFinite(unit.hp) ? { hp: unit.hp } : {}),
          ...(Number.isFinite(unit.mp) ? { mp: unit.mp } : {}),
          spent: Boolean(unit.spent),
        })),
    ],
  };
}

test("basics tutorial config starts player one in an Archer duel on the normal board", () => {
  const config = createTutorialMatchConfig();
  const match = makeMatch();

  assert.equal(config.size, 13);
  assert.equal(match.size, 13);
  assert.equal(match.currentPlayer, 1);
  assert.deepEqual(config.squads[1], ["archer"]);
  assert.deepEqual(config.squads[2], ["archer"]);
  assert.deepEqual(
    match.units.filter((unit) => unit.player === 1).map((unit) => unit.type),
    ["archer"],
  );
  assert.deepEqual(
    match.units.filter((unit) => unit.player === 2).map((unit) => unit.type),
    ["archer"],
  );
  assert.deepEqual(match.units.find((unit) => unit.id === PLAYER_ARCHER_ID).position, { x: 1, y: 12 });
  assert.deepEqual(match.units.find((unit) => unit.id === CPU_ARCHER_ID).position, { x: 11, y: 0 });
  assert.equal(match.units.find((unit) => unit.id === "p1-0-swordsman"), undefined);
  assert.equal(match.units.find((unit) => unit.id === "p1-2-mystic"), undefined);
});

test("basics tutorial gates the Archer opening by action order, not exact tiles", () => {
  const tutorial = createBasicsTutorial();
  let match = makeMatch();

  assert.equal(validateTutorialCommand(tutorial, beginActivation(1, PLAYER_ARCHER_ID), match).accepted, true);

  assert.equal(validateTutorialCommand(tutorial, moveUnit(1, PLAYER_ARCHER_ID, 3, 12), match).accepted, true);
  assert.equal(validateTutorialCommand(tutorial, moveUnit(1, PLAYER_ARCHER_ID, 1, 10), match).accepted, true);

  let blocked = validateTutorialCommand(tutorial, attack(1, PLAYER_ARCHER_ID, CPU_ARCHER_ID), match);
  assert.equal(blocked.accepted, false);
  assert.match(blocked.message, /move.*defend/i);

  blocked = validateTutorialCommand(tutorial, useArt(1, PLAYER_ARCHER_ID, "volley-shot", { targetPosition: { x: 4, y: 8 } }), match);
  assert.equal(blocked.accepted, false);
  assert.match(blocked.message, /move.*defend/i);

  ({ match } = applyTutorial(tutorial, match, beginActivation(1, PLAYER_ARCHER_ID)));

  blocked = validateTutorialCommand(tutorial, defend(1, PLAYER_ARCHER_ID), match);
  assert.equal(blocked.accepted, false);
  assert.match(blocked.message, /move first/i);

  assert.equal(validateTutorialCommand(tutorial, moveUnit(1, PLAYER_ARCHER_ID, 3, 12), match).accepted, true);
  ({ match } = applyTutorial(tutorial, match, moveUnit(1, PLAYER_ARCHER_ID, 3, 12)));
  assert.equal(validateTutorialCommand(tutorial, defend(1, PLAYER_ARCHER_ID), match).accepted, true);
});

test("basics tutorial gates Archer action order while leaving kite movement free", () => {
  const tutorial = createBasicsTutorial();
  let match = {
    ...makeMatch(),
    units: makeMatch().units.map((unit) => {
      if (unit.id === PLAYER_ARCHER_ID) return { ...unit, position: { x: 3, y: 4 } };
      if (unit.id === CPU_ARCHER_ID) return { ...unit, position: { x: 6, y: 4 } };
      return unit;
    }),
  };

  tutorial.stage = "await_first_attack";
  assert.equal(validateTutorialCommand(tutorial, beginActivation(1, "p1-0-swordsman"), match).accepted, false);
  assert.equal(validateTutorialCommand(tutorial, moveUnit(1, PLAYER_ARCHER_ID, 2, 4), match).accepted, false);
  assert.equal(validateTutorialCommand(tutorial, beginActivation(1, PLAYER_ARCHER_ID), match).accepted, true);

  ({ match } = applyTutorial(tutorial, match, beginActivation(1, PLAYER_ARCHER_ID)));
  const shot = applyTutorial(tutorial, match, attack(1, PLAYER_ARCHER_ID, CPU_ARCHER_ID));
  match = shot.match;
  assert.equal(tutorial.stage, "await_cpu_counterattack");
  assert.equal(match.units.find((unit) => unit.id === "p1-2-mystic"), undefined);

  tutorial.stage = "await_kite_attack";
  assert.equal(validateTutorialCommand(tutorial, moveUnit(1, PLAYER_ARCHER_ID, 2, 4), match).accepted, false);
  assert.equal(validateTutorialCommand(tutorial, attack(1, PLAYER_ARCHER_ID, CPU_ARCHER_ID), match).accepted, true);

  tutorial.stage = "await_kite_move";
  assert.equal(validateTutorialCommand(tutorial, finishActivation(1, PLAYER_ARCHER_ID), match).accepted, false);
  assert.equal(validateTutorialCommand(tutorial, moveUnit(1, PLAYER_ARCHER_ID, 2, 4), match).accepted, true);
  assert.equal(validateTutorialCommand(tutorial, moveUnit(1, PLAYER_ARCHER_ID, 1, 4), match).accepted, true);
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
      unit.id === PLAYER_ARCHER_ID
        ? { ...unit, spent: false, position: { x: 4, y: 6 } }
        : unit.id === CPU_ARCHER_ID
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
  assert.equal(update.dialogue?.[0]?.speakerId, PLAYER_ARCHER_ID);
});

test("basics tutorial forces hit, miss, kiting, and final critical strike", () => {
  const tutorial = createBasicsTutorial();
  let match = {
    ...makeMatch(),
    units: makeMatch().units.map((unit) => {
      if (unit.id === PLAYER_ARCHER_ID) return { ...unit, position: { x: 3, y: 4 } };
      if (unit.id === CPU_ARCHER_ID) return { ...unit, position: { x: 6, y: 4 } };
      return unit;
    }),
  };

  tutorial.stage = "await_first_attack";
  ({ match } = applyTutorial(tutorial, match, beginActivation(1, PLAYER_ARCHER_ID)));
  let applied = applyTutorial(tutorial, match, attack(1, PLAYER_ARCHER_ID, CPU_ARCHER_ID));
  let attackEvent = applied.events.find((event) => event.type === "ATTACK_RESOLVED");
  assert.equal(attackEvent.hit, true);
  assert.equal(attackEvent.critical, false);
  assert.equal(tutorial.stage, "await_cpu_counterattack");
  match = applied.match;

  match = {
    ...match,
    currentPlayer: 2,
    activation: null,
    units: match.units.map((unit) => ({ ...unit, spent: unit.player === 2 ? unit.id !== CPU_ARCHER_ID : unit.spent })),
  };
  ({ match } = applyTutorial(tutorial, match, beginActivation(2, CPU_ARCHER_ID)));
  applied = applyTutorial(tutorial, match, attack(2, CPU_ARCHER_ID, PLAYER_ARCHER_ID));
  attackEvent = applied.events.find((event) => event.type === "ATTACK_RESOLVED");
  assert.equal(attackEvent.hit, false);
  assert.equal(tutorial.stage, "await_kite_attack");
  match = applied.match;

  match = {
    ...match,
    currentPlayer: 1,
    activation: null,
    units: match.units.map((unit) => unit.id === PLAYER_ARCHER_ID ? { ...unit, spent: false } : unit),
  };
  ({ match } = applyTutorial(tutorial, match, beginActivation(1, PLAYER_ARCHER_ID)));
  applied = applyTutorial(tutorial, match, attack(1, PLAYER_ARCHER_ID, CPU_ARCHER_ID));
  attackEvent = applied.events.find((event) => event.type === "ATTACK_RESOLVED");
  assert.equal(attackEvent.hit, true);
  assert.equal(attackEvent.critical, false);
  assert.equal(tutorial.stage, "await_kite_move");
  match = applied.match;

  ({ match } = applyTutorial(tutorial, match, moveUnit(1, PLAYER_ARCHER_ID, 1, 4)));
  assert.equal(tutorial.stage, "await_final_crit");

  match = {
    ...match,
    activation: null,
    units: match.units.map((unit) => unit.id === PLAYER_ARCHER_ID ? { ...unit, spent: false } : unit),
  };
  ({ match } = applyTutorial(tutorial, match, beginActivation(1, PLAYER_ARCHER_ID)));
  applied = applyTutorial(tutorial, match, attack(1, PLAYER_ARCHER_ID, CPU_ARCHER_ID));
  attackEvent = applied.events.find((event) => event.type === "ATTACK_RESOLVED");
  assert.equal(attackEvent.hit, true);
  assert.equal(attackEvent.critical, true);
  assert.equal(tutorial.completed, true);
});

test("tutorial blocks moving the archer before attacking in the kiting lesson", () => {
  const tutorial = createBasicsTutorial();
  tutorial.stage = "await_kite_attack";
  const match = makeMatch();

  const select = validateTutorialCommand(tutorial, beginActivation(1, PLAYER_ARCHER_ID), match);
  const blocked = validateTutorialCommand(tutorial, moveUnit(1, PLAYER_ARCHER_ID, 1, 8), match);
  const allowed = validateTutorialCommand(tutorial, attack(1, PLAYER_ARCHER_ID, CPU_ARCHER_ID), match);

  assert.equal(select.accepted, true);
  assert.equal(blocked.accepted, false);
  assert.equal(blocked.message, "Attack first with your Archer. After that shot, you can move her before ending the activation.");
  assert.equal(allowed.accepted, true);
});

test("tutorial CPU archer counterattacks the player Archer to progress", () => {
  const tutorial = createBasicsTutorial();
  tutorial.stage = "await_cpu_counterattack";
  let match = {
    ...makeMatch(),
    currentPlayer: 2,
    units: makeMatch().units.map((unit) => {
      if (unit.id === CPU_ARCHER_ID) return { ...unit, spent: false, position: { x: 8, y: 6 } };
      if (unit.id === PLAYER_ARCHER_ID) return { ...unit, position: { x: 2, y: 6 } };
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
  assert.equal(commands[2].targetId, PLAYER_ARCHER_ID);

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

  assert.equal(attackEvent?.actorId, CPU_ARCHER_ID);
  assert.equal(attackEvent?.targetId, PLAYER_ARCHER_ID);
  assert.equal(attackEvent?.hit, false);
  assert.equal(tutorial.stage, "await_kite_attack");
  assert.match(update.prompt, /attack first, then move/i);
  assert.match(update.prompt, /kiting/i);
});

test("basics tutorial enemy turn uses only the enemy Archer for the duel", () => {
  const tutorial = createBasicsTutorial();
  tutorial.stage = "await_cpu_counterattack";
  let match = {
    ...makeMatch(),
    currentPlayer: 2,
    activation: null,
    units: makeMatch().units.map((unit) => {
      if (unit.id === PLAYER_ARCHER_ID) return { ...unit, spent: true, position: { x: 2, y: 4 } };
      if (unit.id === CPU_ARCHER_ID) return { ...unit, spent: false, position: { x: 7, y: 4 } };
      if (unit.player === 2) return { ...unit, spent: false };
      return { ...unit, spent: true };
    }),
  };
  const commandLog = [];
  let counterattack = null;

  for (let guard = 0; match.currentPlayer === 2 && guard < 8; guard += 1) {
    const commands = chooseTutorialCpuActivation(match, tutorial);
    assert.ok(commands.length > 0, "expected the tutorial CPU to keep spending the enemy turn");
    for (const command of commands) {
      const prepared = prepareTutorialCommand(tutorial, command);
      const result = applyCommand(match, prepared);
      assert.equal(result.accepted, true, `expected ${command.type} to be accepted`);
      const attackEvent = result.events.find((event) => event.type === "ATTACK_RESOLVED");
      counterattack = attackEvent ?? counterattack;
      recordTutorialCommand(tutorial, {
        command: prepared,
        events: result.events,
        match: result.nextState,
        previousPlayer: match.currentPlayer,
      });
      commandLog.push(prepared);
      match = result.nextState;
    }
  }

  assert.equal(match.currentPlayer, 1);
  assert.equal(tutorial.stage, "await_kite_attack");
  assert.equal(counterattack?.actorId, CPU_ARCHER_ID);
  assert.equal(counterattack?.targetId, PLAYER_ARCHER_ID);
  assert.equal(match.units.filter((candidate) => candidate.player === 2).length, 1);
  assert.deepEqual(
    [...new Set(commandLog.filter((command) => command.unitId || command.actorId).map((command) => command.unitId ?? command.actorId))],
    [CPU_ARCHER_ID],
  );

  ({ match } = applyTutorial(tutorial, match, beginActivation(1, PLAYER_ARCHER_ID)));
  const kiteShot = applyTutorial(tutorial, match, attack(1, PLAYER_ARCHER_ID, CPU_ARCHER_ID));
  assert.equal(kiteShot.events.find((event) => event.type === "ATTACK_RESOLVED")?.targetId, CPU_ARCHER_ID);
  assert.equal(tutorial.stage, "await_kite_move");
});

test("tutorial CPU archer moves before the scripted counterattack when no target is initially legal", () => {
  const tutorial = createBasicsTutorial();
  tutorial.stage = "await_cpu_counterattack";
  let match = {
    ...makeMatch(),
    currentPlayer: 2,
    units: makeMatch().units.map((unit) => {
      if (unit.id === CPU_ARCHER_ID) return { ...unit, spent: false, position: { x: 8, y: 4 } };
      if (unit.id === PLAYER_ARCHER_ID) return { ...unit, position: { x: 2, y: 4 } };
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

  assert.equal(attackEvent?.actorId, CPU_ARCHER_ID);
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
  assert.equal(getNextTutorialId(adapter, TUTORIAL_ARTS_MP_ID), TUTORIAL_DAMAGE_TYPES_ID);

  completeTutorial(adapter, TUTORIAL_DAMAGE_TYPES_ID);
  assert.equal(getNextTutorialId(adapter, TUTORIAL_DAMAGE_TYPES_ID), TUTORIAL_RAGE_ID);

  completeTutorial(adapter, TUTORIAL_RAGE_ID);
  assert.equal(getNextTutorialId(adapter, TUTORIAL_RAGE_ID), TUTORIAL_STATUS_EFFECTS_ID);

  completeTutorial(adapter, TUTORIAL_STATUS_EFFECTS_ID);
  assert.equal(getNextTutorialId(adapter, TUTORIAL_RAGE_ID), null);
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

test("damage-types tutorial config and setup replace the placeholder third lesson", () => {
  const config = createTutorialMatchConfig(TUTORIAL_DAMAGE_TYPES_ID);
  const match = prepareTutorialMatchState(createMatchState(config), TUTORIAL_DAMAGE_TYPES_ID);
  const tutorials = getTutorialList();
  const damageTypes = tutorials.find((tutorial) => tutorial.id === TUTORIAL_DAMAGE_TYPES_ID);

  assert.equal(config.tutorialId, TUTORIAL_DAMAGE_TYPES_ID);
  assert.deepEqual(config.squads[1], ["swordsman", "magician"]);
  assert.deepEqual(config.squads[2], ["clod"]);
  assert.equal(damageTypes.available, true);
  assert.equal(damageTypes.title, "Tutorial 3");
  assert.equal(damageTypes.subtitle, "Damage Types");
  assert.deepEqual(match.units.find((unit) => unit.id === TUTORIAL_DAMAGE_TYPES_PLAYER_SWORDSMAN_ID).position, { x: 4, y: 6 });
  assert.deepEqual(match.units.find((unit) => unit.id === TUTORIAL_DAMAGE_TYPES_PLAYER_MAGICIAN_ID).position, { x: 4, y: 4 });
  assert.deepEqual(match.units.find((unit) => unit.id === TUTORIAL_DAMAGE_TYPES_CPU_CLOD_ID).position, { x: 8, y: 6 });
  assert.equal(match.units.find((unit) => unit.id === TUTORIAL_DAMAGE_TYPES_PLAYER_MAGICIAN_ID).spent, true);
  assert.equal(match.currentPlayer, 1);
});

test("damage-types tutorial walks physical, Rock Hard true damage, and defended magic", () => {
  const tutorial = createTutorial(TUTORIAL_DAMAGE_TYPES_ID);
  let match = prepareTutorialMatchState(createMatchState(createTutorialMatchConfig(TUTORIAL_DAMAGE_TYPES_ID)), TUTORIAL_DAMAGE_TYPES_ID);

  assert.equal(tutorial.stage, "await_swordsman_attack");
  assert.match(tutorial.dialogue.map((line) => line.text).join(" "), /Physical damage/i);
  assert.match(tutorial.dialogue.map((line) => line.text).join(" "), /Magic ignores DEF/i);
  assert.match(tutorial.dialogue.map((line) => line.text).join(" "), /True damage/i);
  assert.equal(validateTutorialCommand(tutorial, beginActivation(1, TUTORIAL_DAMAGE_TYPES_PLAYER_MAGICIAN_ID), match).accepted, false);

  ({ match } = applyTutorial(tutorial, match, beginActivation(1, TUTORIAL_DAMAGE_TYPES_PLAYER_SWORDSMAN_ID)));
  ({ match } = applyTutorial(tutorial, match, moveUnit(1, TUTORIAL_DAMAGE_TYPES_PLAYER_SWORDSMAN_ID, 7, 6)));
  let applied = applyTutorial(tutorial, match, attack(1, TUTORIAL_DAMAGE_TYPES_PLAYER_SWORDSMAN_ID, TUTORIAL_DAMAGE_TYPES_CPU_CLOD_ID));
  let attackEvent = applied.events.find((event) => event.type === "ATTACK_RESOLVED");
  assert.equal(attackEvent.hit, true);
  assert.equal(attackEvent.critical, false);
  assert.equal(attackEvent.damage, 2);
  assert.equal(applied.match.units.find((unit) => unit.id === TUTORIAL_DAMAGE_TYPES_CPU_CLOD_ID).hp, 28);
  assert.equal(tutorial.stage, "await_swordsman_finish");
  assert.match(applied.update.dialogue.map((line) => line.text).join(" "), /high DEF/i);
  match = applied.match;

  ({ match } = applyTutorial(tutorial, match, finishActivation(1, TUTORIAL_DAMAGE_TYPES_PLAYER_SWORDSMAN_ID)));
  assert.equal(match.currentPlayer, 2);
  assert.equal(tutorial.stage, "await_clod_defend");

  let cpuUpdate = null;
  for (const command of chooseTutorialCpuActivation(match, tutorial)) {
    const result = applyTutorial(tutorial, match, command);
    match = result.match;
    if (result.update.dialogue) cpuUpdate = result.update;
  }

  assert.equal(match.currentPlayer, 1);
  assert.equal(tutorial.stage, "await_footwork");
  assert.equal(match.units.find((unit) => unit.id === TUTORIAL_DAMAGE_TYPES_CPU_CLOD_ID).defending, true);
  assert.match(cpuUpdate.dialogue.map((line) => line.text).join(" "), /Rock Hard/i);
  assert.match(cpuUpdate.dialogue.map((line) => line.text).join(" "), /true damage/i);
  assert.match(cpuUpdate.dialogue.map((line) => line.text).join(" "), /magic/i);

  ({ match } = applyTutorial(tutorial, match, beginActivation(1, TUTORIAL_DAMAGE_TYPES_PLAYER_SWORDSMAN_ID)));
  const footworkPath = [
    { x: 8, y: 6 },
    { x: 9, y: 6 },
    { x: 10, y: 6 },
    { x: 10, y: 5 },
    { x: 9, y: 5 },
    { x: 8, y: 5 },
  ];
  applied = applyTutorial(tutorial, match, useArt(1, TUTORIAL_DAMAGE_TYPES_PLAYER_SWORDSMAN_ID, "footwork", footworkPath));
  const footworkEvent = applied.events.find((event) => event.type === "ART_RESOLVED");
  assert.equal(footworkEvent.artId, "footwork");
  assert.deepEqual(footworkEvent.harmed, [TUTORIAL_DAMAGE_TYPES_CPU_CLOD_ID]);
  assert.equal(footworkEvent.damageByTarget[TUTORIAL_DAMAGE_TYPES_CPU_CLOD_ID], 3);
  assert.equal(applied.match.units.find((unit) => unit.id === TUTORIAL_DAMAGE_TYPES_CPU_CLOD_ID).hp, 25);
  assert.equal(tutorial.stage, "await_spark");
  match = applied.match;

  ({ match } = applyTutorial(tutorial, match, beginActivation(1, TUTORIAL_DAMAGE_TYPES_PLAYER_MAGICIAN_ID)));
  applied = applyTutorial(tutorial, match, useArt(1, TUTORIAL_DAMAGE_TYPES_PLAYER_MAGICIAN_ID, "spark", { targetId: TUTORIAL_DAMAGE_TYPES_CPU_CLOD_ID }));
  const sparkEvent = applied.events.find((event) => event.type === "ART_RESOLVED");
  assert.equal(sparkEvent.artId, "spark");
  assert.equal(sparkEvent.damage.type, "magic");
  assert.equal(sparkEvent.damage.defended, true);
  assert.equal(sparkEvent.damage.damage, 3);
  assert.equal(applied.match.units.find((unit) => unit.id === TUTORIAL_DAMAGE_TYPES_CPU_CLOD_ID).hp, 22);
  assert.equal(tutorial.completed, true);
  assert.match(applied.update.prompt, /Tutorial complete/i);
});

test("rage tutorial config traps a raging Magician behind 3 Ghouls and a 10 HP Swordsman", () => {
  const config = createTutorialMatchConfig(TUTORIAL_RAGE_ID);
  const match = prepareTutorialMatchState(createMatchState(config), TUTORIAL_RAGE_ID);
  const tutorials = getTutorialList();
  const rage = tutorials.find((tutorial) => tutorial.id === TUTORIAL_RAGE_ID);

  assert.equal(config.tutorialId, TUTORIAL_RAGE_ID);
  assert.deepEqual(config.squads[1], ["magician", "archer"]);
  assert.deepEqual(config.squads[2], ["ghoul", "ghoul", "ghoul", "swordsman"]);
  assert.equal(rage.available, true);
  assert.equal(rage.title, "Tutorial 4");

  const magician = match.units.find((unit) => unit.id === TUTORIAL_RAGE_PLAYER_MAGICIAN_ID);
  const archer = match.units.find((unit) => unit.id === TUTORIAL_RAGE_PLAYER_ARCHER_ID);
  const swordsman = match.units.find((unit) => unit.id === TUTORIAL_RAGE_CPU_SWORDSMAN_ID);

  assert.deepEqual(magician.position, { x: 6, y: 6 });
  assert.ok(magician.hp > 0 && magician.hp <= 5, "Magician should start raging");
  assert.equal(archer.hp, 0);
  assert.equal(archer.spent, true);
  assert.equal(swordsman.hp, 10);
  assert.deepEqual(swordsman.position, { x: 7, y: 6 });
  assert.equal(match.currentPlayer, 1);
  // The enemy Magician for the second formation doesn't exist yet — it's spawned
  // mid-match by main.js once Nuke clears the trap (a squad tops out at 4 units).
  assert.equal(match.units.find((unit) => unit.id === TUTORIAL_RAGE_CPU_MAGICIAN_ID), undefined);

  const blockers = ["p2-0-ghoul", "p2-1-ghoul", "p2-2-ghoul", TUTORIAL_RAGE_CPU_SWORDSMAN_ID].map((id) =>
    match.units.find((unit) => unit.id === id).position
  );
  assert.deepEqual(new Set(blockers.map(positionKey)), new Set([
    positionKey({ x: 6, y: 5 }),
    positionKey({ x: 6, y: 7 }),
    positionKey({ x: 5, y: 6 }),
    positionKey({ x: 7, y: 6 }),
  ]));
});

test("rage tutorial walks Nuke through the trap, the formation swap, the Archer's crit, and the idle enemy", () => {
  const tutorial = createTutorial(TUTORIAL_RAGE_ID);
  let match = prepareTutorialMatchState(createMatchState(createTutorialMatchConfig(TUTORIAL_RAGE_ID)), TUTORIAL_RAGE_ID);

  assert.equal(tutorial.stage, "await_nuke");
  assert.match(tutorial.dialogue.map((line) => line.text).join(" "), /RAGE/);

  let blocked = validateTutorialCommand(tutorial, beginActivation(1, TUTORIAL_RAGE_PLAYER_ARCHER_ID), match);
  assert.equal(blocked.accepted, false);

  ({ match } = applyTutorial(tutorial, match, beginActivation(1, TUTORIAL_RAGE_PLAYER_MAGICIAN_ID)));
  const nuked = applyTutorial(tutorial, match, useArt(1, TUTORIAL_RAGE_PLAYER_MAGICIAN_ID, "nuke"));
  const nukeEvent = nuked.events.find((event) => event.type === "ART_RESOLVED");

  assert.deepEqual(new Set(nukeEvent.targetIds), new Set(["p2-0-ghoul", "p2-1-ghoul", "p2-2-ghoul", TUTORIAL_RAGE_CPU_SWORDSMAN_ID]));
  assert.equal(nuked.match.units.find((unit) => unit.id === TUTORIAL_RAGE_CPU_SWORDSMAN_ID).hp, 0);
  // Wiping out every real enemy commander (the Ghouls never counted toward
  // victory) genuinely ends the reducer's own match right here.
  assert.equal(nuked.match.phase, "complete");
  assert.equal(nuked.match.winner, 1);
  assert.equal(tutorial.stage, "await_rage_attack");
  assert.equal(nuked.update.revertVictory, true);
  assert.match(nuked.update.dialogue.map((line) => line.text).join(" "), /RAGE/);
  assert.equal(nuked.update.afterDialogueAction.type, "formationSwap");
  assert.deepEqual(nuked.update.afterDialogueAction.hideUnitIds, [TUTORIAL_RAGE_PLAYER_MAGICIAN_ID]);
  assert.equal(nuked.update.afterDialogueAction.revealUnits[0].unitId, TUTORIAL_RAGE_PLAYER_ARCHER_ID);
  assert.equal(nuked.update.afterDialogueAction.spawnUnits[0].id, TUTORIAL_RAGE_CPU_MAGICIAN_ID);
  match = nuked.match;

  // Simulate main.js's formationSwap: revert the tutorial-only victory, hide the
  // spent Magician, reveal the raging Archer, and spawn the fresh enemy Magician.
  match = {
    ...match,
    phase: "playing",
    winner: null,
    currentPlayer: 1,
    activation: null,
    units: [
      ...match.units.map((unit) => {
        if (unit.id === TUTORIAL_RAGE_PLAYER_MAGICIAN_ID) return { ...unit, hp: 0, spent: true };
        if (unit.id === TUTORIAL_RAGE_PLAYER_ARCHER_ID) {
          return { ...unit, hp: 4, position: { x: 5, y: 6 }, spent: false };
        }
        return unit;
      }),
      createUnit({ id: TUTORIAL_RAGE_CPU_MAGICIAN_ID, type: "magician", player: 2, x: 11, y: 6 }),
    ],
  };

  blocked = validateTutorialCommand(tutorial, moveUnit(1, TUTORIAL_RAGE_PLAYER_ARCHER_ID, 4, 6), match);
  assert.equal(blocked.accepted, false);
  assert.match(blocked.message, /Attack first/i);

  ({ match } = applyTutorial(tutorial, match, beginActivation(1, TUTORIAL_RAGE_PLAYER_ARCHER_ID)));
  const shot = applyTutorial(tutorial, match, attack(1, TUTORIAL_RAGE_PLAYER_ARCHER_ID, TUTORIAL_RAGE_CPU_MAGICIAN_ID));
  const attackEvent = shot.events.find((event) => event.type === "ATTACK_RESOLVED");
  assert.equal(attackEvent.hit, true);
  assert.equal(attackEvent.critical, true);
  assert.equal(tutorial.stage, "await_rage_move");
  match = shot.match;

  blocked = validateTutorialCommand(tutorial, moveUnit(1, TUTORIAL_RAGE_PLAYER_ARCHER_ID, 4, 6), match);
  assert.equal(blocked.accepted, false);

  ({ match } = applyTutorial(tutorial, match, moveUnit(1, TUTORIAL_RAGE_PLAYER_ARCHER_ID, 3, 6)));
  assert.equal(tutorial.stage, "await_enemy_idle");
  // main.js auto-dispatches FINISH_ACTIVATION once a unit has both attacked and moved.
  ({ match } = applyTutorial(tutorial, match, finishActivation(1, TUTORIAL_RAGE_PLAYER_ARCHER_ID)));
  assert.equal(match.currentPlayer, 2);

  const idleCommands = chooseTutorialCpuActivation(match, tutorial);
  assert.deepEqual(idleCommands.map((command) => command.type), ["BEGIN_ACTIVATION", "DEFEND", "FINISH_ACTIVATION"]);
  assert.equal(idleCommands[0].unitId, TUTORIAL_RAGE_CPU_MAGICIAN_ID);

  let finalUpdate = null;
  for (const command of idleCommands) {
    const applied = applyTutorial(tutorial, match, command);
    match = applied.match;
    if (applied.update.dialogue) finalUpdate = applied.update;
  }

  assert.equal(tutorial.completed, true);
  assert.match(finalUpdate.prompt, /Tutorial complete/i);
});

test("rage tutorial idles the enemy Magician outside its scripted stage", () => {
  const tutorial = createTutorial(TUTORIAL_RAGE_ID);
  const match = {
    ...prepareTutorialMatchState(createMatchState(createTutorialMatchConfig(TUTORIAL_RAGE_ID)), TUTORIAL_RAGE_ID),
    currentPlayer: 2,
  };

  assert.deepEqual(chooseTutorialCpuActivation(match, tutorial), []);
});

test("status-effects tutorial config starts a 7x7 Swordsman blind lesson", () => {
  const config = createTutorialMatchConfig(TUTORIAL_STATUS_EFFECTS_ID);
  const match = prepareTutorialMatchState(createMatchState(config), TUTORIAL_STATUS_EFFECTS_ID);
  const tutorials = getTutorialList();
  const statusEffects = tutorials.find((tutorial) => tutorial.id === TUTORIAL_STATUS_EFFECTS_ID);

  assert.equal(config.tutorialId, TUTORIAL_STATUS_EFFECTS_ID);
  assert.equal(config.size, 7);
  assert.deepEqual(config.squads[1], ["swordsman", "magician", "archer", "virus"]);
  assert.deepEqual(config.squads[2], ["swordsman", "magician", "mystic", "fat-bowman"]);
  assert.equal(statusEffects.available, true);
  assert.equal(statusEffects.title, "Tutorial 5");
  assert.equal(statusEffects.subtitle, "Status Effects and Immunities");

  const swordsman = match.units.find((unit) => unit.id === TUTORIAL_STATUS_PLAYER_SWORDSMAN_ID);
  const enemy = match.units.find((unit) => unit.id === TUTORIAL_STATUS_CPU_SWORDSMAN_ID);
  assert.deepEqual(swordsman.position, { x: 2, y: 3 });
  assert.deepEqual(enemy.position, { x: 3, y: 3 });
  assert.equal(swordsman.hp, 1);
  assert.equal(enemy.hp, 25);
  assert.equal(match.units.find((unit) => unit.id === TUTORIAL_STATUS_PLAYER_MAGICIAN_ID).hp, 0);
  assert.equal(match.units.find((unit) => unit.id === TUTORIAL_STATUS_CPU_FAT_BOWMAN_ID).hp, 0);
  assert.equal(match.currentPlayer, 1);
});

test("status-effects tutorial walks blind, silence, poison spread, cleanse, and immunity", () => {
  const tutorial = createTutorial(TUTORIAL_STATUS_EFFECTS_ID);
  let match = prepareTutorialMatchState(createMatchState(createTutorialMatchConfig(TUTORIAL_STATUS_EFFECTS_ID)), TUTORIAL_STATUS_EFFECTS_ID);

  assert.equal(tutorial.stage, "await_moonstrike");
  assert.match(tutorial.dialogue.map((line) => line.text).join(" "), /status effects/i);
  assert.match(tutorial.dialogue.map((line) => line.text).join(" "), /immun/i);
  assert.equal(validateTutorialCommand(tutorial, attack(1, TUTORIAL_STATUS_PLAYER_SWORDSMAN_ID, TUTORIAL_STATUS_CPU_SWORDSMAN_ID), match).accepted, false);

  ({ match } = applyTutorial(tutorial, match, beginActivation(1, TUTORIAL_STATUS_PLAYER_SWORDSMAN_ID)));
  let applied = applyTutorial(tutorial, match, useArt(1, TUTORIAL_STATUS_PLAYER_SWORDSMAN_ID, "moonstrike", { targetId: TUTORIAL_STATUS_CPU_SWORDSMAN_ID }));
  let artEvent = applied.events.find((event) => event.type === "ART_RESOLVED");
  assert.equal(artEvent.artId, "moonstrike");
  assert.equal(artEvent.critical, true);
  assert.equal(artEvent.effect.applied, true);
  assert.ok(applied.match.units.find((unit) => unit.id === TUTORIAL_STATUS_CPU_SWORDSMAN_ID).statuses.some((status) => status.type === "blind"));
  assert.equal(tutorial.stage, "await_blinded_enemy_attack");
  match = applied.match;

  let blindedAttack = null;
  let blindUpdate = null;
  for (const command of chooseTutorialCpuActivation(match, tutorial)) {
    applied = applyTutorial(tutorial, match, command);
    match = applied.match;
    blindedAttack = applied.events.find((event) => event.type === "ATTACK_RESOLVED") ?? blindedAttack;
    if (applied.update.afterDialogueAction) blindUpdate = applied.update;
  }
  assert.equal(blindedAttack?.actorId, TUTORIAL_STATUS_CPU_SWORDSMAN_ID);
  assert.equal(blindedAttack?.hit, false);
  assert.equal(tutorial.stage, "await_banish");
  assert.equal(blindUpdate.afterDialogueAction.type, "formationSwap");
  assert.ok(blindUpdate.afterDialogueAction.revealUnits.some((unit) => unit.unitId === TUTORIAL_STATUS_PLAYER_MAGICIAN_ID));

  match = applyFormationSwapForTest(match, blindUpdate.afterDialogueAction);
  assert.equal(match.currentPlayer, 1);
  assert.equal(match.units.find((unit) => unit.id === TUTORIAL_STATUS_PLAYER_SWORDSMAN_ID).spent, true);
  assert.equal(match.units.find((unit) => unit.id === TUTORIAL_STATUS_CPU_MAGICIAN_ID).hp, 11);

  let blocked = validateTutorialCommand(tutorial, beginActivation(1, TUTORIAL_STATUS_PLAYER_SWORDSMAN_ID), match);
  assert.equal(blocked.accepted, false);
  assert.match(blocked.message, /Magician.*Banish/i);

  ({ match } = applyTutorial(tutorial, match, beginActivation(1, TUTORIAL_STATUS_PLAYER_MAGICIAN_ID)));
  applied = applyTutorial(tutorial, match, useArt(1, TUTORIAL_STATUS_PLAYER_MAGICIAN_ID, "banish", { targetId: TUTORIAL_STATUS_CPU_MAGICIAN_ID }));
  artEvent = applied.events.find((event) => event.type === "ART_RESOLVED");
  assert.equal(artEvent.artId, "banish");
  assert.equal(artEvent.effect.applied, true);
  assert.equal(applied.match.units.find((unit) => unit.id === TUTORIAL_STATUS_CPU_MAGICIAN_ID).hp, 5);
  assert.ok(applied.match.units.find((unit) => unit.id === TUTORIAL_STATUS_CPU_MAGICIAN_ID).statuses.some((status) => status.type === "silence"));
  assert.equal(tutorial.stage, "await_poison_arrow");
  assert.equal(applied.update.afterDialogueAction.type, "formationSwap");

  match = applyFormationSwapForTest(applied.match, applied.update.afterDialogueAction);
  assert.equal(match.currentPlayer, 1);
  assert.equal(match.units.find((unit) => unit.id === TUTORIAL_STATUS_PLAYER_VIRUS_ID).spent, true);
  assert.deepEqual(match.units.find((unit) => unit.id === TUTORIAL_STATUS_PLAYER_ARCHER_ID).position, { x: 1, y: 3 });
  assert.deepEqual(match.units.find((unit) => unit.id === TUTORIAL_STATUS_CPU_FAT_BOWMAN_ID).position, { x: 4, y: 3 });

  blocked = validateTutorialCommand(tutorial, beginActivation(1, TUTORIAL_STATUS_PLAYER_VIRUS_ID), match);
  assert.equal(blocked.accepted, false);
  assert.match(blocked.message, /Archer.*Poison/i);

  ({ match } = applyTutorial(tutorial, match, beginActivation(1, TUTORIAL_STATUS_PLAYER_ARCHER_ID)));
  applied = applyTutorial(tutorial, match, useArt(1, TUTORIAL_STATUS_PLAYER_ARCHER_ID, "poison-arrow", { targetId: TUTORIAL_STATUS_CPU_FAT_BOWMAN_ID }));
  artEvent = applied.events.find((event) => event.type === "ART_RESOLVED");
  const spreadEvent = applied.events.find((event) => event.type === "STATUS_SPREAD");
  assert.equal(artEvent.artId, "poison-arrow");
  assert.equal(artEvent.effect.applied, true);
  assert.equal(spreadEvent.status, "poison");
  assert.deepEqual(spreadEvent.spreadTo, [TUTORIAL_STATUS_CPU_MYSTIC_ID]);
  assert.ok(applied.match.units.find((unit) => unit.id === TUTORIAL_STATUS_CPU_FAT_BOWMAN_ID).statuses.some((status) => status.type === "poison"));
  assert.ok(applied.match.units.find((unit) => unit.id === TUTORIAL_STATUS_CPU_MYSTIC_ID).statuses.some((status) => status.type === "poison"));
  assert.equal(tutorial.stage, "await_enemy_cleanse");
  match = applied.match;

  let cleanseEvent = null;
  for (const command of chooseTutorialCpuActivation(match, tutorial)) {
    applied = applyTutorial(tutorial, match, command);
    match = applied.match;
    cleanseEvent = applied.events.find((event) => event.type === "ART_RESOLVED" && event.artId === "purify") ?? cleanseEvent;
  }
  assert.deepEqual(cleanseEvent?.cleansed, [TUTORIAL_STATUS_CPU_FAT_BOWMAN_ID]);
  assert.equal(tutorial.stage, "await_enemy_poison_immunity");
  assert.ok(!match.units.find((unit) => unit.id === TUTORIAL_STATUS_CPU_FAT_BOWMAN_ID).statuses.some((status) => status.type === "poison"));
  assert.ok(match.units.find((unit) => unit.id === TUTORIAL_STATUS_CPU_MYSTIC_ID).statuses.some((status) => status.type === "poison"));

  let immunityEvent = null;
  let finalUpdate = null;
  for (const command of chooseTutorialCpuActivation(match, tutorial)) {
    applied = applyTutorial(tutorial, match, command);
    match = applied.match;
    immunityEvent = applied.events.find((event) => event.type === "ART_RESOLVED" && event.artId === "dragonsbane") ?? immunityEvent;
    if (applied.update.completed) finalUpdate = applied.update;
  }
  assert.equal(immunityEvent?.effect.applied, false);
  assert.equal(immunityEvent?.effect.reason, "IMMUNE");
  assert.ok(!match.units.find((unit) => unit.id === TUTORIAL_STATUS_PLAYER_ARCHER_ID).statuses.some((status) => status.type === "poison"));
  assert.equal(tutorial.completed, true);
  assert.match(finalUpdate.prompt, /Tutorial complete/i);
  assert.match(finalUpdate.dialogue.map((line) => line.text).join(" "), /Slow/i);
  assert.match(finalUpdate.dialogue.map((line) => line.text).join(" "), /Stun/i);
});

test("tutorial completion reward is held until tutorial five is completed", () => {
  const storage = new Map();
  const adapter = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };

  completeTutorial(adapter, TUTORIAL_BASICS_ID);
  completeTutorial(adapter, TUTORIAL_ARTS_MP_ID);
  completeTutorial(adapter, TUTORIAL_DAMAGE_TYPES_ID);
  const progressAfterFour = completeTutorial(adapter, TUTORIAL_RAGE_ID);

  assert.deepEqual(progressAfterFour.completedTutorials, [
    TUTORIAL_BASICS_ID,
    TUTORIAL_ARTS_MP_ID,
    TUTORIAL_DAMAGE_TYPES_ID,
    TUTORIAL_RAGE_ID,
  ]);
  assert.equal(progressAfterFour.allTutorialsComplete, false);
  assert.equal(progressAfterFour.tutorialValorGranted, false);
  assert.equal(progressAfterFour.valorBalance, 0);

  const progressAfterFive = completeTutorial(adapter, TUTORIAL_STATUS_EFFECTS_ID);
  assert.equal(progressAfterFive.allTutorialsComplete, true);
  assert.equal(progressAfterFive.tutorialValorGranted, true);
  assert.equal(progressAfterFive.valorBalance, 500);
  assert.ok(progressAfterFive.unlockedUnits.includes("juggernaut"));
});

test("a completed tutorial idles the CPU instead of sneaking in a final move/defend", () => {
  const tutorial = createTutorial(TUTORIAL_DAMAGE_TYPES_ID);
  tutorial.stage = "complete";
  tutorial.completed = true;
  const match = {
    ...prepareTutorialMatchState(createMatchState(createTutorialMatchConfig(TUTORIAL_DAMAGE_TYPES_ID)), TUTORIAL_DAMAGE_TYPES_ID),
    currentPlayer: 2,
  };

  assert.deepEqual(chooseTutorialCpuActivation(match, tutorial), []);
});

test("completing the first tutorial saves progress without granting the tutorial skin choice", () => {
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
  assert.ok(progress.rewardChoices.some((choice) => choice.type === "juggernaut" && choice.slug === "bio-mech"));
});

test("basics tutorial copy teaches kiting without claiming the player is live-battle ready", () => {
  const tutorial = createBasicsTutorial();
  tutorial.stage = "await_final_crit";

  const update = recordTutorialCommand(tutorial, {
    events: [{ type: "ATTACK_RESOLVED", actorId: PLAYER_ARCHER_ID, targetId: CPU_ARCHER_ID, hit: true, critical: true }],
  });

  assert.match(update.prompt, /kiting/i);
  assert.doesNotMatch(update.prompt, /live battles/i);
  assert.doesNotMatch(update.dialogue.map((line) => line.text).join(" "), /live battles/i);
  assert.match(update.dialogue.map((line) => line.text).join(" "), /later tutorials/i);
  assert.match(getTutorialList()[0].description, /kiting/i);
});
