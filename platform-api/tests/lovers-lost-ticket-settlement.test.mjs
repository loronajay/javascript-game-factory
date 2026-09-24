import test from "node:test";
import assert from "node:assert/strict";

import { submitAchievementRun } from "../src/db/achievements.mjs";
import { MIGRATION_FILES } from "../src/db/migrations.mjs";

const zero = () => ({ spikes: 0, bird: 0, arrowwall: 0, goblin: 0 });
const inactive = () => ({ active: false, finished: false, finishFrame: null, score: 0, obstaclesFaced: 0, perfects: 0, goods: 0, misses: 0, successfulByType: zero(), perfectByType: zero(), missesByType: zero(), warmupFaced: 0, warmupMisses: 0 });
const completedLane = () => ({
  active: true, finished: true, finishFrame: 3000, score: 5000, obstaclesFaced: 4,
  perfects: 2, goods: 1, misses: 1,
  successfulByType: { spikes: 1, bird: 1, arrowwall: 1, goblin: 0 },
  perfectByType: { spikes: 1, bird: 1, arrowwall: 0, goblin: 0 },
  missesByType: { spikes: 0, bird: 0, arrowwall: 0, goblin: 1 },
  warmupFaced: 4, warmupMisses: 1,
});
const run = (runId = "ticket-run-0001") => ({
  gameSlug: "lovers-lost", runId, mode: "single", soloSide: "boy", ownedLanes: ["boy"],
  outcome: "reunion", elapsedFrames: 3000, disconnected: false,
  lanes: { boy: completedLane(), girl: inactive() },
});

function createPool() {
  const state = { achievements: new Map(), runs: new Map(), wallets: new Map(), transactions: new Set() };
  const client = {
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
      if (["begin", "commit", "rollback"].includes(text) || text.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (text.includes("select unlocked_ids") && text.includes("game_achievement_runs")) {
        const stored = state.runs.get(`${params[0]}:${params[1]}:${params[2]}`);
        return { rows: stored ? [stored] : [] };
      }
      if (text.includes("select achievement_id") && text.includes("player_achievements")) {
        const prefix = `${params[0]}:${params[1]}:`;
        return { rows: [...state.achievements.entries()].filter(([key]) => key.startsWith(prefix)).map(([key, unlocked_at]) => ({ achievement_id: key.slice(prefix.length), unlocked_at })) };
      }
      if (text.includes("insert into player_achievements")) {
        const key = `${params[0]}:${params[1]}:${params[2]}`;
        if (state.achievements.has(key)) return { rows: [] };
        const unlocked_at = "2026-09-23T12:00:00.000Z";
        state.achievements.set(key, unlocked_at);
        return { rows: [{ unlocked_at }] };
      }
      if (text.includes("insert into ticket_wallets")) {
        const inserted = !state.wallets.has(params[0]);
        if (inserted) state.wallets.set(params[0], 5000);
        return { rows: inserted ? [{ player_id: params[0] }] : [] };
      }
      if (text.includes("insert into ticket_transactions")) {
        const transactionKey = text.includes("'welcome'") ? "welcome" : params[1];
        const amount = text.includes("'welcome'") ? params[1] : params[2];
        const key = `${params[0]}:${transactionKey}`;
        if (state.transactions.has(key)) return { rows: [] };
        state.transactions.add(key);
        return { rows: [{ amount }] };
      }
      if (text.includes("update ticket_wallets")) {
        state.wallets.set(params[0], state.wallets.get(params[0]) + Number(params[1]));
        return { rows: [{ balance: state.wallets.get(params[0]), updated_at: "2026-09-23T12:00:00.000Z" }] };
      }
      if (text.includes("select balance") && text.includes("ticket_wallets")) {
        return { rows: [{ balance: state.wallets.get(params[0]), created_at: "2026-09-23T12:00:00.000Z", updated_at: "2026-09-23T12:00:00.000Z" }] };
      }
      if (text.includes("insert into game_achievement_runs")) {
        state.runs.set(`${params[0]}:${params[1]}:${params[2]}`, {
          unlocked_ids: JSON.parse(params[3]),
          ticket_awarded: params[4],
          ticket_breakdown: JSON.parse(params[5]),
        });
        return { rows: [] };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
    release() {},
  };
  return { state, pool: { connect: async () => client } };
}

test("migration 050 stores the replayable ticket verdict on achievement runs", () => {
  assert(MIGRATION_FILES.includes("050-achievement-run-ticket-rewards.sql"));
});

test("a Lovers Lost run commits unlocks and one aggregate ticket credit atomically", async () => {
  const { pool, state } = createPool();
  const result = await submitAchievementRun(pool, { playerId: "player-1", gameSlug: "lovers-lost", run: run() });

  assert.equal(result.tickets.repeatable, 7);
  assert.equal(result.tickets.achievements, 400);
  assert.equal(result.tickets.awarded, 407);
  assert.equal(result.tickets.balance, 5407);
  assert.equal(state.wallets.get("player-1"), 5407);
  assert(state.transactions.has("player-1:achievement-run:lovers-lost:ticket-run-0001"));
});

test("retrying the same run replays its ticket verdict without minting again", async () => {
  const { pool, state } = createPool();
  const first = await submitAchievementRun(pool, { playerId: "player-1", gameSlug: "lovers-lost", run: run() });
  const retry = await submitAchievementRun(pool, { playerId: "player-1", gameSlug: "lovers-lost", run: run() });

  assert.deepEqual(retry.tickets, first.tickets);
  assert.equal(state.wallets.get("player-1"), 5407);
  assert.equal([...state.transactions].filter((key) => key.includes("achievement-run")).length, 1);
});
