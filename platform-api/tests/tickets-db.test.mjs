import test from "node:test";
import assert from "node:assert/strict";

import { awardTickets, getTicketWallet } from "../src/db/tickets.mjs";
import { MIGRATION_FILES } from "../src/db/migrations.mjs";

function createTicketPool() {
  const state = {
    wallets: new Map(),
    transactions: new Set(),
    queryLog: [],
  };
  const client = {
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
      state.queryLog.push({ text, params });
      if (["begin", "commit", "rollback"].includes(text)) return { rows: [] };
      if (text.includes("insert into ticket_wallets")) {
        const playerId = params[0];
        const inserted = !state.wallets.has(playerId);
        if (inserted) state.wallets.set(playerId, 5000);
        return { rows: inserted ? [{ player_id: playerId }] : [] };
      }
      if (text.includes("insert into ticket_transactions")) {
        const playerId = params[0];
        const transactionKey = text.includes("'welcome'") ? "welcome" : params[1];
        const amount = text.includes("'welcome'") ? params[1] : params[2];
        const key = `${playerId}:${transactionKey}`;
        if (state.transactions.has(key)) return { rows: [] };
        state.transactions.add(key);
        return { rows: [{ amount }] };
      }
      if (text.includes("update ticket_wallets")) {
        const [playerId, amount] = params;
        state.wallets.set(playerId, state.wallets.get(playerId) + Number(amount));
        return { rows: [{ balance: state.wallets.get(playerId), updated_at: "2026-09-23T12:00:00.000Z" }] };
      }
      if (text.includes("select balance")) {
        const playerId = params[0];
        return { rows: [{ balance: state.wallets.get(playerId), created_at: "2026-09-23T11:00:00.000Z", updated_at: "2026-09-23T12:00:00.000Z" }] };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
    release() {},
  };
  return {
    state,
    pool: { connect: async () => client },
  };
}

test("the ticket wallet migration is registered", () => {
  assert(MIGRATION_FILES.includes("049-ticket-wallets.sql"));
});

test("a player's first wallet read grants 5,000 tickets exactly once", async () => {
  const { pool, state } = createTicketPool();

  const first = await getTicketWallet(pool, "player-1");
  const second = await getTicketWallet(pool, "player-1");

  assert.equal(first.balance, 5000);
  assert.equal(second.balance, 5000);
  assert.equal(state.wallets.get("player-1"), 5000);
  assert.deepEqual([...state.transactions], ["player-1:welcome"]);
});

test("ticket awards are atomic and duplicate transaction keys do not mint twice", async () => {
  const { pool, state } = createTicketPool();

  const first = await awardTickets(pool, {
    playerId: "player-1",
    transactionKey: "result:lovers-lost:run-7",
    amount: 12,
    reason: "game_result",
    metadata: { gameSlug: "lovers-lost" },
  });
  const duplicate = await awardTickets(pool, {
    playerId: "player-1",
    transactionKey: "result:lovers-lost:run-7",
    amount: 12,
    reason: "game_result",
    metadata: { gameSlug: "lovers-lost" },
  });

  assert.deepEqual(first, { awarded: 12, balance: 5012, duplicate: false });
  assert.deepEqual(duplicate, { awarded: 0, balance: 5012, duplicate: true });
  assert.equal(state.wallets.get("player-1"), 5012);
});

test("ticket awards reject invalid mint requests before opening a transaction", async () => {
  const { pool, state } = createTicketPool();

  await assert.rejects(
    awardTickets(pool, { playerId: "player-1", transactionKey: "bad", amount: 0, reason: "game_result" }),
    /positive integer/,
  );
  assert.equal(state.queryLog.length, 0);
});
