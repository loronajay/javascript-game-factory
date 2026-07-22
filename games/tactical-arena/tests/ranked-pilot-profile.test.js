import test from "node:test";
import assert from "node:assert/strict";

import { syncRankedPilotProfile } from "../src/online/rankedPilotProfile.js";

test("ranked pilot sync saves the local factory pilot name before queueing", async () => {
  const calls = [];
  const result = await syncRankedPilotProfile({
    apiClient: {
      isConfigured: true,
      savePlayerProfile: async (playerId, profile) => {
        calls.push({ playerId, profile });
        return { playerId, profileName: profile.profileName };
      },
    },
    loadProfile: () => ({
      playerId: "pilot-1",
      profileName: "Mara",
      friendCode: "MARA1111",
    }),
  });

  assert.deepEqual(calls, [{
    playerId: "pilot-1",
    profile: {
      playerId: "pilot-1",
      profileName: "Mara",
      friendCode: "MARA1111",
    },
  }]);
  assert.deepEqual(result, { playerId: "pilot-1", profileName: "Mara" });
});

test("ranked pilot sync skips blank names so it does not erase a public profile", async () => {
  const calls = [];
  const result = await syncRankedPilotProfile({
    apiClient: {
      isConfigured: true,
      savePlayerProfile: async (...args) => calls.push(args),
    },
    loadProfile: () => ({ playerId: "pilot-1", profileName: " " }),
  });

  assert.equal(result, null);
  assert.deepEqual(calls, []);
});
