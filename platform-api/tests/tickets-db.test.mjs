import test from "node:test";
import assert from "node:assert/strict";

import { awardTickets, getTicketShop, getTicketWallet, purchaseTicketShopItem } from "../src/db/tickets.mjs";
import { MIGRATION_FILES } from "../src/db/migrations.mjs";
import { DECOR_CATALOG } from "../../js/arcade-room-catalog/decor.mjs";
import { SURFACE_CATALOG, SURFACE_KINDS } from "../../js/arcade-room-catalog/surfaces.mjs";
import {
  ARCADE_ROOM_CATALOG_IDS,
  ARCADE_ROOM_STARTER_IDS,
  ARCADE_ROOM_TICKET_ITEMS,
  findArcadeRoomTicketItem,
} from "../src/services/arcade-room-ticket-catalog.mjs";

function createTicketPool() {
  const state = {
    wallets: new Map(),
    transactions: new Set(),
    entitlements: new Set(),
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
      if (text.includes("select amount from ticket_transactions")) {
        const key = `${params[0]}:${params[1]}`;
        return { rows: state.transactions.has(key) ? [{ amount: -1 }] : [] };
      }
      if (text.includes("select entitlement_id from game_entitlements")) {
        const [playerId, gameSlug] = params;
        return { rows: [...state.entitlements]
          .filter((key) => key.startsWith(`${playerId}:${gameSlug}:`))
          .map((key) => ({ entitlement_id: key.split(":").slice(2).join(":") })) };
      }
      if (text.includes("insert into game_entitlements")) {
        const [playerId, gameSlug, entitlementId] = params;
        const key = `${playerId}:${gameSlug}:${entitlementId}`;
        const inserted = !state.entitlements.has(key);
        state.entitlements.add(key);
        return { rows: inserted ? [{ entitlement_id: entitlementId }] : [] };
      }
      if (text.includes("update ticket_wallets")) {
        const [playerId, amount] = params;
        const current = state.wallets.get(playerId);
        if (text.includes("balance >=")) {
          if (current < Number(amount)) return { rows: [] };
          state.wallets.set(playerId, current - Number(amount));
        } else {
          state.wallets.set(playerId, current + Number(amount));
        }
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
  assert(MIGRATION_FILES.includes("052-arcade-room-ticket-entitlements.sql"));
});

test("the authoritative room ticket catalog exactly covers the browser catalog", () => {
  const browserIds = new Set([
    ...DECOR_CATALOG.map((entry) => entry.id),
    ...SURFACE_KINDS.flatMap((kind) => SURFACE_CATALOG[kind].map((entry) => entry.id)),
  ]);
  assert.deepEqual([...ARCADE_ROOM_CATALOG_IDS].sort(), [...browserIds].sort());
  for (const entry of DECOR_CATALOG) {
    assert.equal(ARCADE_ROOM_STARTER_IDS.has(entry.id), entry.unlock.type === "starter", entry.id);
  }
  for (const kind of SURFACE_KINDS) {
    for (const entry of SURFACE_CATALOG[kind]) {
      assert.equal(ARCADE_ROOM_STARTER_IDS.has(entry.id), entry.unlock.type === "starter", entry.id);
    }
  }
  assert.equal(new Set(ARCADE_ROOM_TICKET_ITEMS.map((entry) => entry.id)).size, ARCADE_ROOM_TICKET_ITEMS.length);
  for (const item of ARCADE_ROOM_TICKET_ITEMS) {
    assert(Number.isSafeInteger(item.price) && item.price > 0, item.id);
    assert.deepEqual(findArcadeRoomTicketItem(item.id), item);
  }
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

test("arcade room purchases atomically debit the server price and grant permanent ownership", async () => {
  const { pool, state } = createTicketPool();

  const bought = await purchaseTicketShopItem(pool, { playerId: "player-1", shopSlug: "arcade-room", itemId: "decor.prop.claw" });
  const duplicate = await purchaseTicketShopItem(pool, { playerId: "player-1", shopSlug: "arcade-room", itemId: "decor.prop.claw" });

  assert.deepEqual(bought, { ok: true, itemId: "decor.prop.claw", price: 1200, balance: 3800, alreadyOwned: false });
  assert.deepEqual(duplicate, { ok: true, itemId: "decor.prop.claw", price: 0, balance: 3800, alreadyOwned: true });
  assert(state.entitlements.has("player-1:arcade-room:decor.prop.claw"));
  assert.equal(state.wallets.get("player-1"), 3800);
});

test("arcade room purchases reject unknown items and insufficient funds without a grant", async () => {
  const { pool, state } = createTicketPool();
  await assert.rejects(purchaseTicketShopItem(pool, { playerId: "player-1", shopSlug: "arcade-room", itemId: "decor.prop.fake" }), /unknown ticket shop item/);
  state.wallets.set("player-1", 10);
  const result = await purchaseTicketShopItem(pool, { playerId: "player-1", shopSlug: "arcade-room", itemId: "decor.prop.claw" });
  assert.deepEqual(result, { ok: false, error: "insufficient_tickets", itemId: "decor.prop.claw", price: 1200, balance: 10 });
  assert.equal(state.entitlements.size, 0);
});

test("the arcade room shop returns server prices, ownership, and the wallet together", async () => {
  const { pool, state } = createTicketPool();
  state.entitlements.add("player-1:arcade-room:decor.furniture.sofa");
  const shop = await getTicketShop(pool, { playerId: "player-1", shopSlug: "arcade-room" });
  assert.equal(shop.balance, 5000);
  assert(shop.ownedIds.includes("decor.furniture.sofa"));
  assert.equal(shop.items.find((item) => item.id === "decor.prop.claw").price, 1200);
  assert.equal(shop.items.some((item) => item.id === "decor.neon.strip"), false);
});
