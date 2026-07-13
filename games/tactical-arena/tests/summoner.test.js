import test from "node:test";
import assert from "node:assert/strict";

import { applyCommand } from "../src/core/reducer.js";
import { chooseActivation } from "../src/ai/cpuController.js";
import { generatePlans } from "../src/ai/plans.js";
import { beginActivation, defend, finishActivation, moveUnit, useArt } from "../src/core/commands.js";
import { createBattleState, findUnit } from "../src/core/state.js";
import { getArt, getSoulShuffleChoices, isRaging, UNIT_TYPES } from "../src/core/unitCatalog.js";
import { getLegalFleeTiles, getSummonPlacementTiles } from "../src/rules/arts.js";
import { getAbilityVfx } from "../src/ui/vfxCatalog.js";
import { PORTRAITS } from "../src/ui/portraits.js";
import { BOARD_SPRITES } from "../src/ui/boardSprites.js";

function makeState(seed = 1, hp = 23) {
  return createBattleState({
    seed,
    size: 9,
    units: [
      { id: "summoner", player: 1, type: "summoner", x: 1, y: 1, hp },
      { id: "foe", player: 2, type: "swordsman", x: 7, y: 7 }
    ]
  });
}

function begin(state, unitId, player = 1) {
  const result = applyCommand(state, beginActivation(player, unitId));
  assert.ok(result.accepted, `beginActivation rejected: ${result.errorCode}`);
  return result.nextState;
}

function seedWithChoice(type) {
  for (let seed = 1; seed < 500; seed += 1) {
    const state = makeState(seed);
    const choices = getSoulShuffleChoices(findUnit(state, "summoner"), state.rngState).choices;
    if (choices.includes(type)) return seed;
  }
  throw new Error(`No test seed found for ${type}`);
}

test("Summoner is registered with stats, glyph, passive, arts, rage, and assets", () => {
  const def = UNIT_TYPES.summoner;
  assert.equal(def.glyph, "✥");
  assert.equal(def.classType, "mage");
  assert.deepEqual(def.stats, { moveRange: 2, attackRange: 5, strength: 6, defense: 4, maxHp: 23, maxMp: 100 });
  assert.equal(def.passive.effect.type, "soulShuffle");
  assert.deepEqual(def.arts.map((art) => art.id), ["summon", "dematerialize"]);
  assert.equal(def.ragePassive.effect.moveAndUseArts, true);
  assert.equal(def.rageArt.id, "beckon");
  assert.ok(PORTRAITS.summoner, "summoner portrait missing");
  assert.ok(BOARD_SPRITES.summoner, "summoner board sprite missing");
  assert.equal(getAbilityVfx("summon")?.type, "summonRise");
  assert.equal(getAbilityVfx("beckon")?.type, "summonRise");
  assert.equal(getAbilityVfx("dematerialize")?.type, "dashTrail");
});

test("Soul Shuffle offers five non-Summoner units and excludes the last ghost type", () => {
  const state = makeState(12);
  const summoner = findUnit(state, "summoner");
  const first = getSoulShuffleChoices(summoner, state.rngState);
  assert.equal(first.choices.length, 5);
  assert.ok(!first.choices.includes("summoner"));

  summoner.lastGhostType = first.choices[0];
  const next = getSoulShuffleChoices(summoner, state.rngState);
  assert.ok(!next.choices.includes("summoner"));
  assert.ok(!next.choices.includes(summoner.lastGhostType));
});

test("Summon opens an immediate ghost activation, then the ghost dissipates and spends Summoner", () => {
  const state = makeState(4);
  const opened = begin(state, "summoner");
  const choice = getSoulShuffleChoices(findUnit(opened, "summoner"), opened.rngState).choices[0];

  const cast = applyCommand(opened, useArt(1, "summoner", "summon", {
    targetPosition: { x: 2, y: 1 },
    summonType: choice
  }));
  assert.ok(cast.accepted, cast.errorCode);
  const event = cast.events.find((entry) => entry.type === "ART_RESOLVED");
  assert.equal(event.artId, "summon");
  assert.equal(event.summonedType, choice);
  assert.equal(event.ghostTurn, true);

  const ghost = findUnit(cast.nextState, event.summonedUnitId);
  assert.equal(ghost.type, choice);
  assert.equal(ghost.ghost, true);
  assert.equal(ghost.summonerId, "summoner");
  assert.equal(ghost.spent, false);
  assert.equal(cast.nextState.activation.unitId, ghost.id);
  assert.equal(findUnit(cast.nextState, "summoner").mp, 95);

  const braced = applyCommand(cast.nextState, defend(1, ghost.id));
  assert.ok(braced.accepted, braced.errorCode);
  const finished = applyCommand(braced.nextState, finishActivation(1, ghost.id));
  assert.ok(finished.accepted, finished.errorCode);
  assert.equal(findUnit(finished.nextState, ghost.id).hp, 0);
  assert.equal(findUnit(finished.nextState, "summoner").spent, true);
  assert.equal(finished.nextState.activation, null);
  assert.ok(finished.events.some((entry) => entry.type === "GHOST_DISSIPATED" && entry.unitId === ghost.id));
});

test("Summon rejects invalid Soul Shuffle picks and placement still uses range 3", () => {
  const state = makeState(8);
  const summoner = findUnit(state, "summoner");
  const tiles = getSummonPlacementTiles(state, summoner, getArt("summoner", "summon"));
  assert.ok(tiles.has("4,1"));
  assert.ok(!tiles.has("5,1"));

  const opened = begin(state, "summoner");
  const result = applyCommand(opened, useArt(1, "summoner", "summon", {
    targetPosition: { x: 2, y: 1 },
    summonType: "summoner"
  }));
  assert.equal(result.accepted, false);
});

test("Summoner cannot move before Summon unless Disturbed Spirit is active", () => {
  const normal = begin(makeState(), "summoner");
  const moved = applyCommand(normal, moveUnit(1, "summoner", 2, 1));
  assert.ok(moved.accepted, moved.errorCode);
  assert.equal(applyCommand(moved.nextState, useArt(1, "summoner", "summon", { targetPosition: { x: 3, y: 1 } })).accepted, false);

  const raging = begin(makeState(1, 5), "summoner");
  assert.ok(isRaging(findUnit(raging, "summoner")));
  const rageMoved = applyCommand(raging, moveUnit(1, "summoner", 2, 1));
  assert.ok(rageMoved.accepted, rageMoved.errorCode);
  const choice = getSoulShuffleChoices(findUnit(rageMoved.nextState, "summoner"), rageMoved.nextState.rngState).choices[0];
  const cast = applyCommand(rageMoved.nextState, useArt(1, "summoner", "summon", {
    targetPosition: { x: 3, y: 1 },
    summonType: choice
  }));
  assert.ok(cast.accepted, cast.errorCode);
});

test("Dematerialize teleports with Flee geometry and spends Summoner", () => {
  const state = makeState();
  const summoner = findUnit(state, "summoner");
  const tiles = getLegalFleeTiles(state, summoner, getArt("summoner", "dematerialize"));
  assert.ok(tiles.has("5,1"));

  const opened = begin(state, "summoner");
  const result = applyCommand(opened, useArt(1, "summoner", "dematerialize", { targetPosition: { x: 5, y: 1 } }));
  assert.ok(result.accepted, result.errorCode);
  assert.deepEqual(findUnit(result.nextState, "summoner").position, { x: 5, y: 1 });
  assert.equal(findUnit(result.nextState, "summoner").mp, 95);
  assert.equal(findUnit(result.nextState, "summoner").spent, true);
});

test("Beckon is rage-locked and costs 20 MP while using Soul Shuffle", () => {
  const healthy = begin(makeState(), "summoner");
  assert.equal(applyCommand(healthy, useArt(1, "summoner", "beckon", { targetPosition: { x: 2, y: 1 } })).accepted, false);

  const raging = begin(makeState(2, 5), "summoner");
  const choice = getSoulShuffleChoices(findUnit(raging, "summoner"), raging.rngState).choices[0];
  const result = applyCommand(raging, useArt(1, "summoner", "beckon", {
    targetPosition: { x: 2, y: 1 },
    summonType: choice
  }));
  assert.ok(result.accepted, result.errorCode);
  assert.equal(findUnit(result.nextState, "summoner").mp, 80);
  assert.equal(result.events.find((entry) => entry.type === "ART_RESOLVED").summonedType, choice);
});

test("Beckon's ghost arrives already RAGING, unlike a plain Summon's ghost", () => {
  const raging = begin(makeState(2, 5), "summoner");
  const choice = getSoulShuffleChoices(findUnit(raging, "summoner"), raging.rngState).choices[0];
  const beckoned = applyCommand(raging, useArt(1, "summoner", "beckon", {
    targetPosition: { x: 2, y: 1 },
    summonType: choice
  }));
  assert.ok(beckoned.accepted, beckoned.errorCode);
  const beckonEvent = beckoned.events.find((entry) => entry.type === "ART_RESOLVED");
  const beckonedGhost = findUnit(beckoned.nextState, beckonEvent.summonedUnitId);
  assert.ok(isRaging(beckonedGhost), "Beckon's ghost should spawn already raging");

  const summoned = begin(makeState(3), "summoner");
  const summonChoice = getSoulShuffleChoices(findUnit(summoned, "summoner"), summoned.rngState).choices[0];
  const cast = applyCommand(summoned, useArt(1, "summoner", "summon", {
    targetPosition: { x: 2, y: 1 },
    summonType: summonChoice
  }));
  assert.ok(cast.accepted, cast.errorCode);
  const summonEvent = cast.events.find((entry) => entry.type === "ART_RESOLVED");
  const summonedGhost = findUnit(cast.nextState, summonEvent.summonedUnitId);
  assert.ok(!isRaging(summonedGhost), "a plain Summon's ghost should spawn at full health");
});

test("Energy Retrieval redirects a ghost's self MP restore to Summoner", () => {
  const seed = seedWithChoice("juggernaut");
  const opened = begin(makeState(seed), "summoner");
  const cast = applyCommand(opened, useArt(1, "summoner", "summon", {
    targetPosition: { x: 2, y: 1 },
    summonType: "juggernaut"
  }));
  assert.ok(cast.accepted, cast.errorCode);
  const ghost = findUnit(cast.nextState, cast.events.find((entry) => entry.type === "ART_RESOLVED").summonedUnitId);
  ghost.mp = 0;
  const beforeSummonerMp = findUnit(cast.nextState, "summoner").mp;

  const recharge = applyCommand(cast.nextState, useArt(1, ghost.id, "recharge"));
  assert.ok(recharge.accepted, recharge.errorCode);
  assert.equal(findUnit(recharge.nextState, "summoner").mp, beforeSummonerMp + 5);
  assert.equal(findUnit(recharge.nextState, ghost.id).mp, 0);
  const event = recharge.events.find((entry) => entry.type === "ART_RESOLVED");
  assert.equal(event.recipientId, "summoner");
  assert.equal(event.mpRestored, 5);
});

// --- CPU behaviour around summoning ---------------------------------------------------
// A Summon hands the open activation to the ghost it calls (resolveSummonGhost), and the
// reducer rejects a beginActivation for ANY other unit until that ghost has taken its turn.
// These guard the two things that has to get right.

test("the CPU resumes a summoned ghost's open activation instead of stalling on it", () => {
  // A foe within reach, so the summon is worth making in the first place.
  let state = createBattleState({
    seed: 7,
    size: 9,
    units: [
      { id: "summoner", player: 1, type: "summoner", x: 3, y: 3, hp: 23 },
      { id: "foe", player: 2, type: "swordsman", x: 5, y: 5 }
    ]
  });

  // Play the CPU's Summoner until a ghost is on the board.
  let ghost = null;
  for (let guard = 0; guard < 8 && !ghost; guard += 1) {
    const commands = chooseActivation(state, { cpuPlayer: 1, difficulty: "hard" });
    assert.ok(commands.length, "the CPU produced no commands");
    for (const command of commands) {
      const result = applyCommand(state, command);
      assert.ok(result.accepted, `CPU command rejected: ${command.type} -> ${result.errorCode}`);
      state = result.nextState;
    }
    ghost = state.units.find((unit) => unit.ghost && unit.hp > 0) ?? null;
  }
  assert.ok(ghost, "the CPU never summoned a ghost");

  // The ghost now holds the activation, carrying the summonerId that dissipates it later.
  assert.equal(state.activation?.unitId, ghost.id);
  assert.equal(state.activation?.summonerId, "summoner");

  // The CPU must now play THAT ghost — and must not try to re-open its activation, which
  // would rebuild state.activation and drop summonerId.
  const resume = chooseActivation(state, { cpuPlayer: 1, difficulty: "hard" });
  assert.ok(resume.length, "the CPU stalled on the ghost's open activation");
  assert.equal(resume.some((command) => command.type === "BEGIN_ACTIVATION"), false);
  // ATTACK names its actor `actorId`; everything else uses `unitId`.
  assert.ok(resume.every((command) => (command.unitId ?? command.actorId) === ghost.id));

  for (const command of resume) {
    const result = applyCommand(state, command);
    assert.ok(result.accepted, `ghost turn rejected: ${command.type} -> ${result.errorCode}`);
    state = result.nextState;
  }
  // The ghost took its one turn and dissipated, taking the Summoner's activation with it.
  assert.equal(findUnit(state, ghost.id).hp, 0);
  assert.equal(findUnit(state, "summoner").spent, true);
});

test("the CPU won't spend a turn summoning a ghost that cannot reach anything", () => {
  // The foe is parked in the far corner. A ghost lands within 3 of the Summoner and gets
  // exactly one turn, so nothing it could call can act — summoning here is a wasted turn.
  const stranded = createBattleState({
    seed: 3,
    size: 13,
    units: [
      { id: "summoner", player: 1, type: "summoner", x: 0, y: 0, hp: 23 },
      { id: "foe", player: 2, type: "swordsman", x: 12, y: 12 }
    ]
  });
  const summoner = findUnit(stranded, "summoner");
  const plans = generatePlans(stranded, summoner).filter((plan) => plan.primary.artId === "summon");
  assert.equal(plans.length, 0, "the CPU offered a summon with nothing in the ghost's reach");

  // Bring the foe inside reach and the summon becomes worth making again.
  const engaged = createBattleState({
    seed: 3,
    size: 13,
    units: [
      { id: "summoner", player: 1, type: "summoner", x: 5, y: 5, hp: 23 },
      { id: "foe", player: 2, type: "swordsman", x: 7, y: 7 }
    ]
  });
  const engagedPlans = generatePlans(engaged, findUnit(engaged, "summoner"))
    .filter((plan) => plan.primary.artId === "summon");
  assert.ok(engagedPlans.length > 0, "the CPU refused a summon that would have reached the enemy");
});
