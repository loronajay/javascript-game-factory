import test from "node:test";
import assert from "node:assert/strict";

import { attack, beginActivation, defend, finishActivation, useArt } from "../src/core/commands.js";
import { applyCommand } from "../src/core/reducer.js";
import { createBattleState, findUnit } from "../src/core/state.js";
import { getActiveWeather, getArt, getArtMpCost, getEffectiveStats, getUnitType } from "../src/core/unitCatalog.js";
import { getLegalFleeTiles, getRushSteps } from "../src/rules/arts.js";
import { resolvePhysicalStrike } from "../src/rules/combat.js";
import { positionKey } from "../src/rules/movement.js";
import { chooseActivation, cpuRng } from "../src/ai/cpuController.js";

const NORMAL_HIT = { attackRoll: 0.5, critRoll: 0.99 };
const CRIT = { attackRoll: 0.5, critRoll: 0.0 };

function run(state, command) {
  const result = applyCommand(state, command);
  assert.ok(result.accepted, `${command.type} rejected (${result.errorCode})`);
  return result.nextState;
}

function scenario(overrides = {}) {
  return createBattleState({
    size: 13,
    seed: 7,
    units: [
      { id: "mn", type: "mother-nature", player: 1, x: 1, y: 1, ...overrides.mn },
      { id: "ally", type: "swordsman", player: 1, x: 2, y: 1, ...overrides.ally },
      { id: "mage", type: "magician", player: 1, x: 1, y: 2, ...overrides.mage },
      { id: "foe", type: "swordsman", player: 2, x: 7, y: 7, ...overrides.foe },
      { id: "foe2", type: "archer", player: 2, x: 8, y: 7, ...overrides.foe2 }
    ]
  });
}

test("Mother Nature is registered as an acts-first support with weather arts", () => {
  const def = getUnitType("mother-nature");
  assert.equal(def.name, "Mother Nature");
  assert.equal(def.classType, "support");
  assert.equal(def.actsFirst, true);
  assert.equal(def.stats.maxHp, 25);
  assert.equal(def.stats.maxMp, 100);
  assert.equal(def.stats.attackRange, 6);
  assert.equal(def.stats.moveRange, 3);
  assert.equal(def.stats.strength, 7);
  assert.equal(def.stats.defense, 3);
  assert.deepEqual(def.arts.filter((art) => art.kind === "active").map((art) => art.id), [
    "blizzard",
    "spring-shower",
    "heatwave",
    "landscaper",
    "thunderstorm"
  ]);
  assert.equal(def.rageArt.id, "great-flood");
});

test("drafted Mother Nature starts her owner's turn already activated with charged weather movement", () => {
  const state = createBattleState({
    size: 13,
    seed: 7,
    units: [
      { id: "mn", type: "mother-nature", player: 1, x: 1, y: 1, weatherMoveCharged: 1 },
      { id: "foe", type: "swordsman", player: 2, x: 7, y: 7 }
    ]
  });

  assert.deepEqual(state.activation, {
    unitId: "mn",
    origin: { x: 1, y: 1 },
    moved: false,
    primaryUsed: false,
    spellUsed: false,
    bonusActionGroups: [],
    realmTraversalActive: false
  });
  assert.equal(findUnit(state, "mn").weatherMoveCharged, 0);
  assert.equal(getEffectiveStats(findUnit(state, "mn"), state).moveRange, 4);

  const next = run(state, useArt(1, "mn", "spring-shower"));
  assert.equal(findUnit(next, "mn").spent, true);
  assert.equal(findUnit(next, "mn").lastWeather, "spring");
});

test("King opens before Mother Nature, then Mother Nature opens before the rest of the squad", () => {
  const state = createBattleState({
    size: 13,
    seed: 7,
    units: [
      { id: "mn", type: "mother-nature", player: 1, x: 1, y: 12 },
      { id: "king", type: "king", player: 1, x: 0, y: 12 },
      { id: "ally", type: "swordsman", player: 1, x: 2, y: 12 },
      { id: "foe", type: "swordsman", player: 2, x: 7, y: 7 }
    ]
  });

  assert.equal(state.activation?.unitId, "king");
  let next = run(state, useArt(1, "king", "strike"));
  assert.equal(next.activation?.unitId, "mn");

  next = run(next, useArt(1, "mn", "heatwave"));
  const allyBegins = applyCommand(next, beginActivation(1, "ally"));
  assert.equal(allyBegins.accepted, true);
});

test("CPU resumes King first, then Mother Nature, for a double first-actor squad", () => {
  let state = createBattleState({
    size: 13,
    seed: 9,
    units: [
      { id: "mn", type: "mother-nature", player: 1, x: 1, y: 12 },
      { id: "king", type: "king", player: 1, x: 0, y: 12 },
      { id: "ally", type: "swordsman", player: 1, x: 2, y: 12 },
      { id: "foe", type: "swordsman", player: 2, x: 7, y: 7 }
    ]
  });

  assert.equal(state.activation?.unitId, "king");
  const kingCommands = chooseActivation(state, { difficulty: "normal", cpuPlayer: 1, rng: cpuRng(state) });
  assert.ok(kingCommands.length > 0);
  assert.equal(kingCommands.some((command) => command.type === "BEGIN_ACTIVATION"), false);
  for (const command of kingCommands) state = run(state, command);

  assert.equal(state.activation?.unitId, "mn");
  const natureCommands = chooseActivation(state, { difficulty: "normal", cpuPlayer: 1, rng: cpuRng(state) });
  assert.ok(natureCommands.length > 0);
  assert.equal(natureCommands.some((command) => command.type === "BEGIN_ACTIVATION"), false);
  for (const command of natureCommands) state = run(state, command);

  assert.equal(findUnit(state, "king").spent, true);
  assert.equal(findUnit(state, "mn").spent, true);
});

test("Mother Nature must act first, and any completed action releases her squad", () => {
  const state = scenario();
  const blocked = applyCommand(state, beginActivation(1, "ally"));
  assert.equal(blocked.accepted, false);
  assert.equal(blocked.errorCode, "KING_MUST_ACT_FIRST");

  let next = run(state, beginActivation(1, "mn"));
  next = run(next, defend(1, "mn"));
  next = run(next, finishActivation(1, "mn"));
  next = run(next, beginActivation(1, "ally"));
  assert.equal(findUnit(next, "mn").commandTurn, next.turnNumber);
});

test("turn rollover into a Mother Nature squad starts with her already open and CPU resumes it", () => {
  const state = createBattleState({
    size: 13,
    seed: 5,
    units: [
      { id: "p1-sword", type: "swordsman", player: 1, x: 1, y: 12 },
      { id: "p2-nature", type: "mother-nature", player: 2, x: 12, y: 0 },
      { id: "p2-sword", type: "swordsman", player: 2, x: 10, y: 2 }
    ]
  });

  let next = run(state, beginActivation(1, "p1-sword"));
  next = run(next, defend(1, "p1-sword"));
  next = run(next, finishActivation(1, "p1-sword"));

  assert.equal(next.currentPlayer, 2);
  assert.equal(next.activation?.unitId, "p2-nature");

  const commands = chooseActivation(next, { difficulty: "normal", cpuPlayer: 2, rng: cpuRng(next) });
  assert.ok(commands.length > 0);
  assert.equal(commands.some((command) => command.type === "BEGIN_ACTIVATION"), false);

  for (const command of commands) next = run(next, command);
  assert.equal(findUnit(next, "p2-nature").spent, true);
});

test("weather activations cannot repeat the same weather twice in a row", () => {
  let next = createBattleState({
    units: [
      { id: "mn", type: "mother-nature", player: 1, x: 1, y: 1 },
      { id: "foe", type: "swordsman", player: 2, x: 7, y: 7 }
    ]
  });
  next = run(next, beginActivation(1, "mn"));
  next = run(next, useArt(1, "mn", "blizzard"));

  // Move the match back to Mother Nature's next squad turn.
  next = run(next, beginActivation(2, "foe"));
  next = run(next, defend(2, "foe"));
  next = run(next, finishActivation(2, "foe"));
  next = run(next, beginActivation(1, "mn"));

  const repeat = applyCommand(next, useArt(1, "mn", "blizzard"));
  assert.equal(repeat.accepted, false);
  assert.equal(repeat.errorCode, "ART_NOT_AVAILABLE");
  assert.equal(applyCommand(next, useArt(1, "mn", "spring-shower")).accepted, true);
});

test("activating a new weather grants +1 MOVE on Mother Nature's next turn", () => {
  let next = run(scenario(), beginActivation(1, "mn"));
  next = run(next, useArt(1, "mn", "spring-shower"));
  const afterCast = findUnit(next, "mn");
  assert.deepEqual(next.weather, { id: "spring", sourceId: "mn" });
  assert.equal(afterCast.weather, "spring");
  assert.equal(getEffectiveStats(afterCast, next).moveRange, 3, "own end tick has not left the next-turn buff live yet");

  const fresh = createBattleState({
    units: [
      { id: "mn", type: "mother-nature", player: 1, x: 1, y: 1, weatherMoveCharged: afterCast.weatherMoveCharged },
      { id: "foe", type: "swordsman", player: 2, x: 7, y: 7 }
    ]
  });
  const opened = run(fresh, beginActivation(1, "mn"));
  assert.equal(getEffectiveStats(findUnit(opened, "mn"), opened).moveRange, 4);
});

test("authored board weather works without Mother Nature on the roster", () => {
  const heated = createBattleState({
    weather: "heatwave",
    units: [
      { id: "hero", type: "swordsman", player: 1, x: 1, y: 1 },
      { id: "foe", type: "swordsman", player: 2, x: 2, y: 1, hp: 20 }
    ]
  });
  const neutral = createBattleState({
    units: [
      { id: "hero", type: "swordsman", player: 1, x: 1, y: 1 },
      { id: "foe", type: "swordsman", player: 2, x: 2, y: 1, hp: 20 }
    ]
  });

  assert.equal(getActiveWeather(heated).id, "heatwave");
  assert.equal(getActiveWeather(heated).sourceId, null);

  const baseDamage = resolvePhysicalStrike(findUnit(neutral, "hero"), findUnit(neutral, "foe"), { critical: true, state: neutral }).damage;
  let next = run(heated, beginActivation(1, "hero"));
  next = run(next, attack(1, "hero", "foe", CRIT));

  assert.equal(findUnit(next, "foe").hp, 20 - baseDamage - 1);
  assert.deepEqual(next.tileObjects["2,1"], { kind: "fire", permanent: true });
});

test("Mother Nature replaces mission-authored weather with her latest cast", () => {
  let next = createBattleState({
    weather: "blizzard",
    units: [
      { id: "mn", type: "mother-nature", player: 1, x: 1, y: 1 },
      { id: "foe", type: "swordsman", player: 2, x: 7, y: 7 }
    ]
  });

  assert.equal(getActiveWeather(next).id, "blizzard");
  next = run(next, beginActivation(1, "mn"));
  next = run(next, useArt(1, "mn", "heatwave"));

  assert.deepEqual(next.weather, { id: "heatwave", sourceId: "mn" });
  assert.equal(getActiveWeather(next).id, "heatwave");
  assert.equal(findUnit(next, "mn").lastWeather, "heatwave");
});

test("Spring Shower heals all units and then boosts later HP and MP restoration globally", () => {
  let next = run(scenario({
    mn: { hp: 20 },
    ally: { hp: 20 },
    foe: { hp: 20 },
    mage: { hp: 20, mp: 10 }
  }), beginActivation(1, "mn"));
  next = run(next, useArt(1, "mn", "spring-shower"));
  assert.equal(findUnit(next, "mn").hp, 22);
  assert.equal(findUnit(next, "ally").hp, 22);
  assert.equal(findUnit(next, "foe").hp, 22);

  const springState = scenario({
    mn: { weather: "spring", lastWeather: "spring" },
    mage: { hp: 20, mp: 10 }
  });
  const opened = run(springState, beginActivation(1, "mn"));
  const hit = run(opened, attack(1, "mn", "foe", CRIT));
  assert.equal(findUnit(hit, "mn").mp, 100, "crit refund restores 10 MP, capped at max");

  const rechargeState = createBattleState({
    units: [
      { id: "mn", type: "mother-nature", player: 1, x: 1, y: 1, weather: "spring", lastWeather: "spring" },
      { id: "cleric", type: "fat-cleric", player: 1, x: 2, y: 1, mp: 10 },
      { id: "foe", type: "swordsman", player: 2, x: 7, y: 7 }
    ]
  });
  let recharge = run(rechargeState, beginActivation(1, "mn"));
  recharge = run(recharge, defend(1, "mn"));
  recharge = run(recharge, finishActivation(1, "mn"));
  recharge = run(recharge, beginActivation(1, "cleric"));
  recharge = run(recharge, defend(1, "cleric"));
  assert.equal(findUnit(recharge, "cleric").mp, 12, "Snack Break's 1 MP restore is boosted to 2");
});

test("Blizzard slows everyone immediately and extends movement arts while it persists", () => {
  let next = run(scenario(), beginActivation(1, "mn"));
  next = run(next, useArt(1, "mn", "blizzard"));
  assert.equal(getEffectiveStats(findUnit(next, "ally"), next).moveRange, getUnitType("swordsman").stats.moveRange - 1);
  const neutral = scenario();
  assert.equal(
    getRushSteps(findUnit(next, "ally"), getArt("swordsman", "footwork"), next),
    getRushSteps(findUnit(neutral, "ally"), getArt("swordsman", "footwork"), neutral),
    "Blizzard's +1 movement-art range offsets its immediate -1 MOVE slow"
  );

  const fleeState = scenario({ mn: { weather: "blizzard", lastWeather: "blizzard" } });
  const mage = findUnit(fleeState, "mage");
  assert.ok(getLegalFleeTiles(fleeState, mage).has(positionKey({ x: 1, y: 7 })), "Flee reaches one tile farther");
});

test("Heatwave grants +1 STR immediately, adds crit damage, and crits ignite permanent fire", () => {
  let next = run(scenario(), beginActivation(1, "mn"));
  next = run(next, useArt(1, "mn", "heatwave"));
  assert.equal(getEffectiveStats(findUnit(next, "ally"), next).strength, getUnitType("swordsman").stats.strength + 1);

  const heated = scenario({ mn: { weather: "heatwave", lastWeather: "heatwave", mp: 90 }, foe: { x: 2, y: 1, hp: 20 } });
  const baseline = scenario({ mn: { mp: 90 }, foe: { x: 2, y: 1, hp: 20 } });
  const baseDamage = resolvePhysicalStrike(findUnit(baseline, "mn"), findUnit(baseline, "foe"), { critical: true, state: baseline }).damage;
  const opened = run(heated, beginActivation(1, "mn"));
  const crit = run(opened, attack(1, "mn", "foe", CRIT));
  assert.equal(findUnit(crit, "foe").hp, 20 - baseDamage - 1, "Heatwave adds +1 to the crit's normal damage");
  assert.deepEqual(crit.tileObjects["2,1"], { kind: "fire", permanent: true });
  assert.equal(findUnit(crit, "mn").mp, 100);
});

test("Thunderstorm boosts temporary magic damage and discounts later arts globally", () => {
  let baseline = createBattleState({
    units: [
      { id: "mage", type: "magician", player: 1, x: 1, y: 2 },
      { id: "foe", type: "swordsman", player: 2, x: 4, y: 2 }
    ]
  });
  baseline = run(baseline, beginActivation(1, "mage"));
  baseline = run(baseline, useArt(1, "mage", "spark", { targetId: "foe", ...NORMAL_HIT }));
  const baseDamage = getUnitType("swordsman").stats.maxHp - findUnit(baseline, "foe").hp;

  let next = run(scenario({ foe: { x: 4, y: 2 } }), beginActivation(1, "mn"));
  const storm = applyCommand(next, useArt(1, "mn", "thunderstorm"));
  assert.equal(storm.accepted, true);
  assert.equal(storm.events.find((event) => event.type === "ART_RESOLVED")?.buffLabel, "+1 MAGIC");
  next = storm.nextState;
  const mage = findUnit(next, "mage");
  assert.equal(getArtMpCost(mage, getArt("magician", "spark"), next), getArt("magician", "spark").mpCost - 1);

  next = run(next, beginActivation(1, "ally"));
  next = run(next, defend(1, "ally"));
  next = run(next, finishActivation(1, "ally"));
  next = run(next, beginActivation(1, "mage"));
  next = run(next, useArt(1, "mage", "spark", { targetId: "foe", ...NORMAL_HIT }));
  assert.equal(getUnitType("swordsman").stats.maxHp - findUnit(next, "foe").hp, baseDamage + 1);
});

test("Landscaper pushes an enemy and replaces its old tile with a wall", () => {
  let next = run(scenario({ foe: { x: 3, y: 1 } }), beginActivation(1, "mn"));
  next = run(next, useArt(1, "mn", "landscaper", { targetId: "foe" }));
  assert.deepEqual(findUnit(next, "foe").position, { x: 4, y: 1 });
  assert.deepEqual(next.tileObjects["3,1"], { kind: "wall", hp: 1 });
});

test("Landscaper deals defended physical damage when the push is blocked", () => {
  let next = scenario({
    foe: { x: 3, y: 1, hp: 20, defending: true },
    foe2: { x: 4, y: 1 }
  });
  next = run(next, beginActivation(1, "mn"));
  next = run(next, useArt(1, "mn", "landscaper", { targetId: "foe" }));
  assert.equal(findUnit(next, "foe").hp, 15, "10 physical is reduced by the target's existing DEF/Defend rules");
  assert.equal(next.tileObjects["3,1"], undefined);
});

test("Great Flood damages all units, heals Mother Nature, and shuffles existing positions without moving her", () => {
  const start = scenario({
    mn: { hp: 5, mp: 60, x: 1, y: 1 },
    ally: { hp: 20, x: 2, y: 1 },
    mage: { hp: 20, x: 1, y: 2 },
    foe: { hp: 20, x: 7, y: 7 },
    foe2: { hp: 20, x: 8, y: 7 }
  });
  let next = run(start, beginActivation(1, "mn"));
  next = run(next, useArt(1, "mn", "great-flood"));

  assert.equal(findUnit(next, "mn").hp, 5, "7 magic drops her to 0, then Great Flood restores 5");
  assert.deepEqual(findUnit(next, "mn").position, { x: 1, y: 1 });
  for (const id of ["ally", "mage", "foe", "foe2"]) {
    assert.equal(findUnit(next, id).hp, 13);
  }
  const before = ["ally", "mage", "foe", "foe2"].map((id) => positionKey(findUnit(start, id).position)).sort();
  const after = ["ally", "mage", "foe", "foe2"].map((id) => positionKey(findUnit(next, id).position)).sort();
  assert.deepEqual(after, before, "only the occupied positions are shuffled");
  assert.notDeepEqual(
    ["ally", "mage", "foe", "foe2"].map((id) => positionKey(findUnit(next, id).position)),
    ["ally", "mage", "foe", "foe2"].map((id) => positionKey(findUnit(start, id).position)),
    "the seeded shuffle changes assignments"
  );
});
