import test from "node:test";
import assert from "node:assert/strict";

import { recordYamBowlingTournamentRound } from "../src/db/game-progress.mjs";

const NOW = "2026-08-16T12:00:00.000Z";

function makePool() {
  const state = { claims: new Map(), entitlements: new Set(), inventory: new Map(), transactions: [] };
  const claimKey = (playerId, gameSlug, claimId) => `${playerId}:${gameSlug}:${claimId}`;
  const client = {
    async query(sql, params = []) {
      const text = String(sql).trim();
      if (["begin", "commit", "rollback"].includes(text)) {
        state.transactions.push(text);
        return { rows: [], rowCount: 0 };
      }
      if (text.startsWith("insert into game_progress_profiles")) return { rows: [], rowCount: 1 };
      if (text.startsWith("select 1 from game_progress_claims")) {
        const exists = state.claims.has(claimKey(params[0], params[1], params[2]));
        return { rows: exists ? [{ "?column?": 1 }] : [], rowCount: exists ? 1 : 0 };
      }
      if (text.startsWith("insert into game_progress_claims")) {
        const key = claimKey(params[0], params[1], params[2]);
        if (state.claims.has(key)) return { rows: [], rowCount: 0 };
        state.claims.set(key, JSON.parse(params[5]));
        return { rows: [], rowCount: 1 };
      }
      if (text.startsWith("select payload from game_progress_claims")) {
        return { rows: [{ payload: state.claims.get(claimKey(params[0], params[1], params[2])) }] };
      }
      if (text.startsWith("select entitlement_id from game_entitlements")) {
        return { rows: [...state.entitlements].map((entitlement_id) => ({ entitlement_id })) };
      }
      if (text.startsWith("insert into game_entitlements")) {
        state.entitlements.add(params[2]);
        return { rows: [], rowCount: 1 };
      }
      if (text.startsWith("insert into game_inventory_items")) {
        state.inventory.set(params[2], (state.inventory.get(params[2]) || 0) + Number(params[3]));
        return { rows: [], rowCount: 1 };
      }
      if (text.startsWith("update game_progress_claims set payload")) {
        state.claims.set(claimKey(params[0], params[1], params[2]), JSON.parse(params[3]));
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`unhandled query: ${text.slice(0, 120)}`);
    },
    release() {},
  };
  return {
    connect: async () => client,
    async query(sql, params = []) {
      const text = String(sql);
      if (text.includes("from game_progress_claims") && text.includes("kind = 'yam-tournament-round'")) {
        return { rows: [...state.claims.entries()].filter(([key]) => key.startsWith(`${params[0]}:${params[1]}:`)).map(([, payload]) => ({ payload })) };
      }
      if (text.includes("from game_progress_profiles")) return { rows: [{}] };
      if (text.includes("from game_entitlements")) return { rows: [...state.entitlements].map((entitlementId) => ({ entitlement_id: entitlementId, kind: entitlementId.split(":")[0], source: "tournament", source_id: "yam-major-0000", quantity: 1 })) };
      if (text.includes("from game_inventory_items")) return { rows: [...state.inventory].map(([item_id, quantity]) => ({ item_id, quantity })) };
      return { rows: [] };
    },
    state,
  };
}

function request(roundIndex) {
  return { playerId: "player-1", gameSlug: "yam-bowling", eventId: "yam-major-0000", roundIndex, bowlerSlug: "daisy-monroe", now: NOW };
}

test("tournament rounds must clear in order and the final grants one replay-safe server prize", async () => {
  const pool = makePool();

  assert.equal((await recordYamBowlingTournamentRound(pool, request(1))).error, "previous_round_incomplete");
  assert.equal((await recordYamBowlingTournamentRound(pool, request(0))).ok, true);
  assert.equal((await recordYamBowlingTournamentRound(pool, request(1))).ok, true);
  const final = await recordYamBowlingTournamentRound(pool, request(2));
  const replay = await recordYamBowlingTournamentRound(pool, request(2));

  assert.equal(final.ok, true);
  assert.equal(final.alreadyProcessed, false);
  assert.ok(final.prize?.name);
  assert.equal(pool.state.entitlements.has("title:yam-champion"), true);
  assert.deepEqual(final.tournament.completedRoundIndexes, [0, 1, 2]);
  assert.equal(replay.alreadyProcessed, true);
  assert.deepEqual(replay.prize, final.prize);
});

test("closed, stale, and forged tournament rounds are rejected", async () => {
  assert.equal((await recordYamBowlingTournamentRound(makePool(), { ...request(0), now: "2026-08-20T12:00:00.000Z" })).error, "tournament_closed");
  assert.equal((await recordYamBowlingTournamentRound(makePool(), { ...request(0), eventId: "yam-major-9999" })).error, "event_not_active");
  assert.equal((await recordYamBowlingTournamentRound(makePool(), { ...request(0), roundIndex: 9 })).error, "invalid_round");
});
