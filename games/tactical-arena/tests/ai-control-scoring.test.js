// Regression tests for three CPU planner defects found by the balance simulation
// (see BALANCE.md, "ARTS the CPU cannot see"). Each was verified by dropping a unit into
// the exact board state its ART was designed for and observing that the CPU chose
// something else 100% of the time.
//
//   1. `statusValue` valued ANY unrecognised status as a full disable, so Mother Nature's
//      Heatwave (`empowered`) and Thunderstorm (`weather-magic`) — beneficial buffs that
//      land on BOTH squads — scored as if they stunned every enemy.
//   2. Weather was scored as a fresh gain every turn. Combined with the `lastWeather`
//      rule that forbids repeating the weather just cast, that produced permanent
//      Heatwave -> Thunderstorm -> Heatwave oscillation for the whole match.
//   3. Fat Knight's Fart and Big Brother's Force Push were tagged `statusAoe`, whose
//      scorer returns zero unless the ART carries a status effect. Both are pure shoves
//      with no effect block, so they could never be chosen.

import test from "node:test";
import assert from "node:assert/strict";

import { statusValue, buffAlliesValue } from "../src/ai/evaluate.js";
import { UNIT_TYPES } from "../src/core/unitRegistry.js";
import { createMatchState } from "../src/match/matchBuilder.js";
import { chooseActivation, cpuRng } from "../src/ai/cpuController.js";
import { applyCommand } from "../src/core/reducer.js";

const makeUnit = (over) => ({
  id: over.id ?? `${over.type}-${over.player}`,
  type: over.type,
  player: over.player ?? 1,
  hp: over.hp ?? 25,
  mp: over.mp ?? 20,
  position: over.position ?? { x: 0, y: 0 },
  statModifiers: {},
  statuses: over.statuses ?? []
});

const artOf = (unitId, artId) => UNIT_TYPES[unitId].arts.find((a) => a.id === artId);

// ---- 1. beneficial statuses are not worth inflicting -----------------------

test("statusValue: harmful statuses are still worth inflicting", () => {
  const target = makeUnit({ type: "swordsman", player: 2 });
  for (const status of ["stun", "blind", "silence", "slow", "poison"]) {
    assert.ok(
      statusValue(target, { status, durationTurns: 1 }, null) > 0,
      `${status} should have positive value against an enemy`
    );
  }
});

test("statusValue: a beneficial status is worth nothing to inflict on an enemy", () => {
  const target = makeUnit({ type: "swordsman", player: 2 });
  // `empowered` is +1 STR (Heatwave, Anoint, Time Stretch) and `weather-magic` is
  // +1 magic damage (Thunderstorm). Handing either to an enemy is not a gain, and the
  // old `default:` branch scored both as a full-turn disable.
  assert.equal(statusValue(target, { status: "empowered", durationTurns: 1 }, null), 0);
  assert.equal(statusValue(target, { status: "weather-magic", durationTurns: 1 }, null), 0);
});

// ---- 2. weather is not a fresh gain every turn ------------------------------

function weatherState({ active = null } = {}) {
  const caster = makeUnit({ type: "mother-nature", player: 1, mp: 100, position: { x: 6, y: 6 } });
  const ally = makeUnit({ type: "swordsman", player: 1, position: { x: 5, y: 6 } });
  const enemy = makeUnit({ type: "swordsman", player: 2, position: { x: 7, y: 6 } });
  return {
    state: {
      size: 13,
      units: [caster, ally, enemy],
      weather: active ? { id: active, sourceId: caster.id } : null,
      tileObjects: []
    },
    caster
  };
}

test("weather scores nothing while another weather is already running", () => {
  const { state, caster } = weatherState({ active: "heatwave" });
  const thunderstorm = artOf("mother-nature", "thunderstorm");

  // The old scoring returned a large positive number here, which — because `lastWeather`
  // forbids re-casting Heatwave — forced a switch every single turn.
  assert.equal(buffAlliesValue(state, caster, thunderstorm), 0);
});

test("weather is still worth setting when none is running", () => {
  const { state, caster } = weatherState({ active: null });
  const heatwave = artOf("mother-nature", "heatwave");
  assert.ok(
    buffAlliesValue(state, caster, heatwave) > 0,
    "with no weather active, establishing one should be worth something"
  );
});

test("Mother Nature stops flip-flopping her weather across a real match", () => {
  // The end-to-end symptom: before the fix this produced
  //   heatwave -> thunderstorm -> heatwave -> thunderstorm -> ...
  // for the entire match, because each cast consumed her whole (forced-first) activation.
  const picks = [];
  let state = createMatchState({
    size: 13,
    seed: 3,
    squads: {
      1: ["mother-nature", "swordsman", "archer", "mystic"],
      2: ["clod", "monk", "magician", "paladin"]
    }
  });

  for (let turn = 0; turn < 30 && state.phase === "playing"; turn += 1) {
    const player = state.currentPlayer;
    const commands = chooseActivation(state, { difficulty: "hard", cpuPlayer: player, rng: cpuRng(state) });
    if (!commands.length) break;
    for (const command of commands) {
      if (command.type === "USE_ART" && String(command.unitId).includes("mother-nature")) {
        const art = artOf("mother-nature", command.artId);
        if (art?.weather) picks.push(art.weather);
      }
      const result = applyCommand(state, command);
      if (!result.accepted) break;
      state = result.nextState;
      if (state.phase !== "playing") break;
    }
  }

  // She may set the weather, and may legitimately change it later. What she must not do is
  // alternate between two weathers turn after turn.
  let alternations = 0;
  for (let i = 2; i < picks.length; i += 1) {
    if (picks[i] === picks[i - 2] && picks[i] !== picks[i - 1]) alternations += 1;
  }
  assert.ok(
    alternations <= 1,
    `Mother Nature is oscillating her weather: ${picks.join(" -> ")}`
  );
});

// ---- 3. shove ARTS are reachable -------------------------------------------

test("pure displacement ARTS are not tagged as status AoEs", () => {
  // `statusAoe` scoring short-circuits to zero without `effect.type === "status"`, so an
  // ART with no effect block must not use that intent or it can never be selected.
  for (const [unitId, artId] of [["fat-knight", "fart"], ["big-brother", "force-push"]]) {
    const art = artOf(unitId, artId);
    assert.ok(art, `${unitId}/${artId} should exist`);
    assert.equal(art.effect, undefined, `${artId} is a pure shove with no status effect`);
    assert.notEqual(
      art.ai.intent,
      "statusAoe",
      `${artId} cannot be scored by statusAoe — it has no effect block`
    );
  }
});

function probeChoice(unitType, { ring = 1, seeds = 12 } = {}) {
  const chosen = new Set();
  for (let s = 0; s < seeds; s += 1) {
    const state = createMatchState({
      size: 13,
      seed: s * 2 + 1,
      squads: { 1: [unitType, unitType, unitType, unitType], 2: ["swordsman", "swordsman", "swordsman", "swordsman"] }
    });
    const mine = state.units.filter((u) => u.player === 1);
    const theirs = state.units.filter((u) => u.player === 2);
    mine[0].position = { x: 6, y: 6 };
    const spots = [{ x: 6 - ring, y: 6 }, { x: 6 + ring, y: 6 }, { x: 6, y: 6 - ring }, { x: 6, y: 6 + ring }];
    theirs.forEach((enemy, i) => { enemy.position = spots[i % spots.length]; });
    mine.slice(1).forEach((u, i) => { u.position = { x: 0, y: i }; });

    const commands = chooseActivation(state, { difficulty: "hard", cpuPlayer: 1, rng: cpuRng(state) });
    for (const c of commands) {
      if (c.type === "USE_ART" && c.unitId === mine[0].id) chosen.add(c.artId);
    }
  }
  return chosen;
}

test("Fat Knight will use Fart when enemies are packed around him", () => {
  assert.ok(probeChoice("fat-knight").has("fart"), "Fart was never chosen with four adjacent enemies");
});

test("Big Brother will use Force Push when enemies are packed around him", () => {
  assert.ok(probeChoice("big-brother").has("force-push"), "Force Push was never chosen with four adjacent enemies");
});

// Front Kick's damage is barely above the Monk's free basic attack, so scoring it on
// damage alone meant the CPU never used it — the stun conversion added in c79aa30d had no
// effect on CPU play at all. The fix scores the shove, which makes the choice situational:
// worth 4 MP when the target has nowhere to be shoved, not worth it in open field.
function monkChoice({ monkAt, enemyAt, seeds = 12 }) {
  const chosen = new Set();
  for (let s = 0; s < seeds; s += 1) {
    const state = createMatchState({
      size: 13,
      seed: s * 2 + 1,
      squads: { 1: ["monk", "monk", "monk", "monk"], 2: ["swordsman", "swordsman", "swordsman", "swordsman"] }
    });
    const mine = state.units.filter((u) => u.player === 1);
    const theirs = state.units.filter((u) => u.player === 2);
    mine[0].position = { ...monkAt };
    theirs[0].position = { ...enemyAt };
    theirs.slice(1).forEach((u, i) => { u.position = { x: 12, y: i }; });
    mine.slice(1).forEach((u, i) => { u.position = { x: 0, y: 10 + i }; });

    const commands = chooseActivation(state, { difficulty: "hard", cpuPlayer: 1, rng: cpuRng(state) });
    const art = commands.find((c) => c.type === "USE_ART" && c.unitId === mine[0].id);
    chosen.add(art ? `art:${art.artId}` : "basic attack");
  }
  return chosen;
}

test("Monk uses Front Kick when the shove is blocked by the board edge", () => {
  // Enemy pinned on the edge file: the knockback has nowhere to go, so it becomes a stun.
  const chosen = monkChoice({ monkAt: { x: 1, y: 6 }, enemyAt: { x: 0, y: 6 } });
  assert.ok(chosen.has("art:front-kick"), `expected Front Kick, got ${[...chosen].join(", ")}`);
});

test("Monk still prefers a free basic attack when the shove would achieve nothing", () => {
  // Open board behind the target and a crit-only knockback: 4 MP for roughly one extra
  // damage is a bad trade, and the CPU should not now spam Front Kick everywhere.
  const chosen = monkChoice({ monkAt: { x: 6, y: 6 }, enemyAt: { x: 5, y: 6 } });
  assert.ok(!chosen.has("art:front-kick"), `expected a basic attack, got ${[...chosen].join(", ")}`);
});
