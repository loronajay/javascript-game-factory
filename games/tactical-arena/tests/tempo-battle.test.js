import test from "node:test";
import assert from "node:assert/strict";

import { createBattleState } from "../src/core/state.js";
import { UNIT_TYPES, getEffectiveStats } from "../src/core/unitCatalog.js";
import { beginActivation, defend } from "../src/core/commands.js";
import { applyCommand } from "../src/core/reducer.js";
import {
  TEMPO_GAUGE_MAX,
  TEMPO_FIELD_PULSE_MS,
  TEMPO_POISON_TICK_MS,
  TEMPO_STATUS_TURN_MS,
  advanceTempoBattle,
  canBeginTempoActivation,
  enableTempoBattle,
  getTempoReadiness,
  getUnitAgility,
  isTempoBattle,
  isTempoUnitReady,
  normalizeTempoStatus
} from "../src/core/tempoBattle.js";

test("tempo battle stores readiness outside classic unit stats", () => {
  assert.equal(UNIT_TYPES.archer.tempo.agility, 7);
  assert.equal(getUnitAgility({ type: "archer" }), 7);
  assert.equal("agility" in UNIT_TYPES.archer.stats, false);
  assert.deepEqual(getEffectiveStats({ type: "archer", hp: 24 }), {
    moveRange: 2,
    attackRange: 5,
    strength: 8,
    defense: 4,
    maxHp: 24,
    maxMp: 22
  });
});

test("tempo field pulses burn fire tiles and count down their duration", () => {
  const state = enableTempoBattle(createBattleState({
    tileObjects: [{ x: 0, y: 0, kind: "fire", turnsLeft: 2 }],
    units: [
      { id: "victim", player: 1, type: "swordsman", hp: 10, x: 0, y: 0 },
      { id: "enemy", player: 2, type: "swordsman", x: 7, y: 7 }
    ]
  }));

  let advanced = advanceTempoBattle(state, TEMPO_FIELD_PULSE_MS);
  let victim = advanced.state.units.find((unit) => unit.id === "victim");
  assert.equal(victim.hp, 9);
  assert.equal(advanced.state.tileObjects["0,0"].turnsLeft, 1);
  assert.ok(advanced.events.some((event) => event.type === "FIRE_DAMAGE" && event.unitId === "victim"));

  advanced = advanceTempoBattle(advanced.state, TEMPO_FIELD_PULSE_MS);
  victim = advanced.state.units.find((unit) => unit.id === "victim");
  assert.equal(victim.hp, 8);
  assert.equal(advanced.state.tileObjects["0,0"], undefined);
});

test("enableTempoBattle initializes living turn-taking units with empty gauges", () => {
  const state = enableTempoBattle(createBattleState({
    units: [
      { id: "p1-archer", player: 1, type: "archer", x: 0, y: 0 },
      { id: "p1-ghoul", player: 1, type: "ghoul", x: 1, y: 0 },
      { id: "p2-clod", player: 2, type: "clod", x: 7, y: 7 }
    ]
  }));

  assert.equal(isTempoBattle(state), true);
  assert.equal(getTempoReadiness(state, "p1-archer"), 0);
  assert.equal(getTempoReadiness(state, "p2-clod"), 0);
  assert.equal(getTempoReadiness(state, "p1-ghoul"), 0);
  assert.equal(state.units.find((unit) => unit.id === "p1-archer").spent, true);
  assert.equal(state.units.find((unit) => unit.id === "p1-ghoul").spent, true);
});

test("tempo readiness fills faster for higher agility and marks units ready", () => {
  const state = enableTempoBattle(createBattleState({
    units: [
      { id: "fast", player: 1, type: "sniper", x: 0, y: 0 },
      { id: "slow", player: 2, type: "clod", x: 7, y: 7 }
    ]
  }));

  const advanced = advanceTempoBattle(state, 5000);
  assert.equal(isTempoUnitReady(advanced.state, "fast"), true);
  assert.equal(isTempoUnitReady(advanced.state, "slow"), false);
  assert.equal(getTempoReadiness(advanced.state, "fast"), TEMPO_GAUGE_MAX);
  assert.ok(getTempoReadiness(advanced.state, "slow") < TEMPO_GAUGE_MAX);
  assert.ok(advanced.events.some((event) => event.type === "TEMPO_UNIT_READY" && event.unitId === "fast"));
});

test("tempo status normalization converts turn durations to timers but leaves poison permanent", () => {
  assert.deepEqual(normalizeTempoStatus({ type: "slow", duration: 3, statModifiers: { moveRange: -1 } }), {
    type: "slow",
    duration: "timer",
    durationTurns: 3,
    remainingMs: 3 * TEMPO_STATUS_TURN_MS,
    totalMs: 3 * TEMPO_STATUS_TURN_MS,
    statModifiers: { moveRange: -1 }
  });

  assert.deepEqual(normalizeTempoStatus({ type: "poison", duration: "permanent", turnStartDamage: 1 }), {
    type: "poison",
    duration: "permanent",
    turnStartDamage: 1,
    tickElapsedMs: 0
  });
});

test("tempo timers expire non-poison statuses and poison ticks without expiring", () => {
  const state = enableTempoBattle(createBattleState({
    units: [
      {
        id: "victim",
        player: 1,
        type: "swordsman",
        hp: 10,
        x: 0,
        y: 0,
        statuses: [
          { type: "slow", duration: 1, statModifiers: { moveRange: -1 } },
          { type: "poison", duration: "permanent", turnStartDamage: 2 }
        ]
      },
      { id: "enemy", player: 2, type: "swordsman", x: 7, y: 7 }
    ]
  }));

  const advanced = advanceTempoBattle(state, Math.max(TEMPO_STATUS_TURN_MS, TEMPO_POISON_TICK_MS));
  const victim = advanced.state.units.find((unit) => unit.id === "victim");

  assert.deepEqual(victim.statuses.map((status) => status.type), ["poison"]);
  assert.equal(victim.hp, 8);
  assert.ok(advanced.events.some((event) =>
    event.type === "STATUS_EXPIRED" && event.unitId === "victim" && event.status === "slow"
  ));
  assert.ok(advanced.events.some((event) =>
    event.type === "STATUS_DAMAGE" && event.unitId === "victim" && event.status === "poison" && event.damage === 2
  ));
});

test("tempo ready units can activate and finishing resets only their readiness", () => {
  const state = enableTempoBattle(createBattleState({
    units: [
      { id: "p1-archer", player: 1, type: "archer", x: 0, y: 0 },
      { id: "p2-clod", player: 2, type: "clod", x: 7, y: 7 }
    ]
  }), { readiness: { "p1-archer": TEMPO_GAUGE_MAX, "p2-clod": 400 } });

  let result = applyCommand(state, beginActivation(1, "p1-archer"));
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.currentPlayer, 1);
  assert.equal(result.nextState.activation.unitId, "p1-archer");

  result = applyCommand(result.nextState, defend(1, "p1-archer"));
  assert.equal(result.accepted, true);

  assert.equal(result.nextState.currentPlayer, null);
  assert.equal(result.nextState.activation, null);
  assert.equal(getTempoReadiness(result.nextState, "p1-archer"), 0);
  assert.equal(getTempoReadiness(result.nextState, "p2-clod"), 400);
  assert.equal(result.nextState.turnNumber, 0);
});

test("tempo activation does not require a classic squad-turn current player", () => {
  const state = enableTempoBattle(createBattleState({
    units: [
      { id: "p1-archer", player: 1, type: "archer", x: 0, y: 0 },
      { id: "p2-clod", player: 2, type: "clod", x: 7, y: 7 }
    ]
  }), { readiness: { "p1-archer": TEMPO_GAUGE_MAX, "p2-clod": TEMPO_GAUGE_MAX } });

  assert.equal(state.currentPlayer, null);
  assert.equal(state.units.find((unit) => unit.id === "p1-archer").spent, false);
  assert.equal(state.units.find((unit) => unit.id === "p2-clod").spent, false);

  const p2Result = applyCommand(state, beginActivation(2, "p2-clod"));
  assert.equal(p2Result.accepted, true);
  assert.equal(p2Result.nextState.currentPlayer, 2);
  assert.equal(p2Result.nextState.activation.unitId, "p2-clod");
  assert.equal(canBeginTempoActivation(state, "p1-archer"), true);
  assert.equal(canBeginTempoActivation(p2Result.nextState, "p1-archer"), false);
});
