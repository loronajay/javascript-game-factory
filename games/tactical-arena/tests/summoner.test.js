import test from "node:test";
import assert from "node:assert/strict";

import { applyCommand } from "../src/core/reducer.js";
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
