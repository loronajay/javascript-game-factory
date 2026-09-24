import test from "node:test";
import assert from "node:assert/strict";

import { LOVERS_LOST_DEFINITIONS, normalizeLoversLostRun } from "../src/services/lovers-lost-achievement-catalog.mjs";
import {
  LOVERS_LOST_ACHIEVEMENT_TICKET_REWARDS,
  calculateLoversLostTicketReward,
} from "../src/services/lovers-lost-ticket-rewards.mjs";
import { evaluateTicketReward } from "../src/services/ticket-reward-catalog.mjs";

const zero = () => ({ spikes: 0, bird: 0, arrowwall: 0, goblin: 0 });
const inactive = () => ({ active: false, finished: false, finishFrame: null, score: 0, obstaclesFaced: 0, perfects: 0, goods: 0, misses: 0, successfulByType: zero(), perfectByType: zero(), missesByType: zero(), warmupFaced: 0, warmupMisses: 0 });

function lane(overrides = {}) {
  return {
    active: true, finished: true, finishFrame: 3000, score: 5000, obstaclesFaced: 4,
    perfects: 2, goods: 1, misses: 1,
    successfulByType: { spikes: 1, bird: 1, arrowwall: 1, goblin: 0 },
    perfectByType: { spikes: 1, bird: 1, arrowwall: 0, goblin: 0 },
    missesByType: { spikes: 0, bird: 0, arrowwall: 0, goblin: 1 },
    warmupFaced: 4, warmupMisses: 1,
    ...overrides,
  };
}

function run(mode, ownedLane, boy, girl, overrides = {}) {
  const active = [boy, girl].filter((entry) => entry.active);
  const elapsedFrames = Math.max(...active.map((entry) => entry.finishFrame || 5400));
  const payload = {
    gameSlug: "lovers-lost",
    runId: "ticket-run-0001",
    mode,
    soloSide: mode === "single" ? ownedLane : null,
    ownedLanes: mode === "local" ? ["boy", "girl"] : [ownedLane],
    outcome: active.every((entry) => entry.finished) ? "reunion" : "game_over",
    elapsedFrames,
    disconnected: false,
    lanes: { boy, girl },
    ...overrides,
  };
  const normalized = normalizeLoversLostRun(payload);
  assert.equal(normalized.ok, true, normalized.error);
  return normalized.run;
}

function perfect104() {
  return lane({
    finishFrame: 2700,
    score: 95000,
    obstaclesFaced: 104,
    perfects: 104,
    goods: 0,
    misses: 0,
    successfulByType: { spikes: 26, bird: 26, arrowwall: 26, goblin: 26 },
    perfectByType: { spikes: 26, bird: 26, arrowwall: 26, goblin: 26 },
    missesByType: zero(),
    warmupMisses: 0,
  });
}

test("Lovers Lost repeatable payout tops out at 20 for a completely Perfect run", () => {
  const reward = calculateLoversLostTicketReward({
    run: run("single", "boy", perfect104(), inactive()),
    unlockedIds: [],
  });

  assert.deepEqual(reward.repeatable, {
    completion: 5,
    perfects: 5,
    noMiss: 3,
    sub60: 2,
    allPerfect: 5,
    total: 20,
  });
  assert.equal(reward.total, 20);
});

test("ordinary completed lanes earn base, capped Perfect tiers, and eligible bonuses", () => {
  const forty = lane({
    finishFrame: 4000,
    score: 40000,
    obstaclesFaced: 40,
    perfects: 39,
    goods: 0,
    misses: 1,
    successfulByType: { spikes: 10, bird: 10, arrowwall: 10, goblin: 9 },
    perfectByType: { spikes: 10, bird: 10, arrowwall: 10, goblin: 9 },
    missesByType: { spikes: 0, bird: 0, arrowwall: 0, goblin: 1 },
  });
  const reward = calculateLoversLostTicketReward({ run: run("single", "boy", forty, inactive()), unlockedIds: [] });
  assert.equal(reward.repeatable.completion, 5);
  assert.equal(reward.repeatable.perfects, 1);
  assert.equal(reward.repeatable.noMiss, 0);
  assert.equal(reward.repeatable.sub60, 0);
  assert.equal(reward.repeatable.allPerfect, 0);
  assert.equal(reward.total, 6);
});

test("local shared-screen, disconnected, and unfinished owned lanes mint no repeatable tickets", () => {
  const local = run("local", "boy", lane(), lane());
  assert.equal(calculateLoversLostTicketReward({ run: local, unlockedIds: [] }).repeatable.total, 0);

  const disconnected = run("online", "boy", lane(), lane(), { disconnected: true });
  const disconnectedReward = calculateLoversLostTicketReward({ run: disconnected, unlockedIds: ["ll_clean_start"] });
  assert.equal(disconnectedReward.repeatable.total, 0);
  assert.equal(disconnectedReward.total, 0, "an early-disconnect achievement cannot bypass the zero-payout rule");

  const unfinishedLane = lane({ finished: false, finishFrame: null });
  const unfinished = run("single", "boy", unfinishedLane, inactive(), { elapsedFrames: 5400, outcome: "game_over" });
  assert.equal(calculateLoversLostTicketReward({ run: unfinished, unlockedIds: [] }).repeatable.total, 0);
});

test("online rewards only the submitting account's owned lane", () => {
  const reward = calculateLoversLostTicketReward({
    run: run("online", "boy", lane(), perfect104()),
    unlockedIds: [],
  });
  assert.equal(reward.repeatable.total, 7, "partner perfection must not pay the submitter");
});

test("every Lovers Lost achievement has one explicit one-time ticket reward", () => {
  assert.deepEqual(
    Object.keys(LOVERS_LOST_ACHIEVEMENT_TICKET_REWARDS).sort(),
    LOVERS_LOST_DEFINITIONS.map((entry) => entry.id).sort(),
  );
  assert.equal(LOVERS_LOST_ACHIEVEMENT_TICKET_REWARDS.ll_perfect_run, 5500);
  assert.equal(LOVERS_LOST_ACHIEVEMENT_TICKET_REWARDS.ll_lovers_never_die, 1000);
  const reward = calculateLoversLostTicketReward({
    run: run("local", "boy", lane(), lane()),
    unlockedIds: ["ll_found_again", "ll_perfect_run", "unknown"],
  });
  assert.equal(reward.repeatable.total, 0);
  assert.equal(reward.achievementTotal, 5550);
  assert.equal(reward.total, 5550);
});

test("the platform reward registry routes Lovers Lost and defaults unknown games to zero", () => {
  const lovers = evaluateTicketReward("lovers-lost", {
    run: run("single", "boy", lane(), inactive()),
    unlockedIds: [],
  });
  assert.equal(lovers.total, 7);
  assert.deepEqual(evaluateTicketReward("not-a-game", { run: {}, unlockedIds: [] }), {
    repeatable: { total: 0 }, achievements: [], achievementTotal: 0, total: 0,
  });
});
