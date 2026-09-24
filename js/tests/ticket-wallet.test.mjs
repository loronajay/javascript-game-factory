import test from "node:test";
import assert from "node:assert/strict";

import { createTicketWalletClient, formatTicketBalance, publishTicketBalance } from "../platform/api/ticket-wallet.mjs";
import { createAchievementReporter } from "../platform/achievements/achievements.mjs";

test("ticket balances use whole-number locale formatting", () => {
  assert.equal(formatTicketBalance(5000, "en-US"), "5,000");
  assert.equal(formatTicketBalance(-1, "en-US"), "—");
  assert.equal(formatTicketBalance("nope", "en-US"), "—");
});

test("ticket wallet client reads the authenticated server balance", async () => {
  const calls = [];
  const client = createTicketWalletClient({
    baseUrl: "https://api.example.test",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({ wallet: { balance: 5000 } }),
      };
    },
  });

  const result = await client.getWallet();

  assert.deepEqual(result, { balance: 5000 });
  assert.equal(calls[0].url, "https://api.example.test/tickets/wallet");
  assert.equal(calls[0].options.credentials, "include");
});

test("ticket wallet client fails closed when the API is unavailable", async () => {
  const client = createTicketWalletClient({ baseUrl: "", fetchImpl: null });
  assert.equal(await client.getWallet(), null);
});

test("a settled game result publishes the new ticket balance to the shared shell", () => {
  const events = [];
  const target = { dispatchEvent(event) { events.push(event); } };
  assert.equal(publishTicketBalance(5157, target), true);
  assert.equal(events[0].type, "javascript-game-factory:ticket-balance");
  assert.equal(events[0].detail.balance, 5157);
  assert.equal(publishTicketBalance(-1, target), false);
});

test("the cabinet achievement reporter forwards a settled ticket balance", async () => {
  const balances = [];
  const reporter = createAchievementReporter({
    api: {
      canSubmit: () => true,
      submitRun: async () => ({
        ok: true,
        runId: "ticket-run-0001",
        unlocked: [],
        owned: [],
        progress: { gameSlug: "lovers-lost", title: "Lovers Lost", unlocked: 0, total: 23 },
        tickets: { awarded: 7, balance: 5007, repeatable: 7, achievements: 0, breakdown: {} },
      }),
      fetchCatalog: async () => null,
      fetchPlayerCollection: async () => null,
    },
    toaster: { show: () => 0, current: () => null, queue: null },
    onTicketBalance: (balance) => balances.push(balance),
  });

  await reporter.reportRun("lovers-lost", {});
  assert.deepEqual(balances, [5007]);
});
