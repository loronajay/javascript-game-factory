import test from "node:test";
import assert from "node:assert/strict";

import { createPlatformApiClient } from "../../js/platform/api/platform-api.mjs";

test("the shared client exposes the tournament read and round-claim routes without a prize field", async () => {
  const requests = [];
  const client = createPlatformApiClient({
    baseUrl: "https://factory.example",
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, method: options.method || "GET", body: options.body || "" });
      return { ok: true, status: 200, json: async () => ({ ok: true, event: { id: "yam-major-0000" } }) };
    },
  });

  await client.fetchGameTournament("yam-bowling");
  await client.claimGameTournamentRound("yam-bowling", {
    eventId: "yam-major-0000",
    roundIndex: 2,
    bowlerSlug: "daisy-monroe",
    prizeId: "skin-voucher",
  });

  assert.deepEqual(requests, [
    {
      url: "https://factory.example/game-progress/yam-bowling/tournaments/current",
      method: "GET",
      body: "",
    },
    {
      url: "https://factory.example/game-progress/yam-bowling/tournaments/rounds/2",
      method: "POST",
      body: JSON.stringify({ eventId: "yam-major-0000", bowlerSlug: "daisy-monroe" }),
    },
  ]);
});
