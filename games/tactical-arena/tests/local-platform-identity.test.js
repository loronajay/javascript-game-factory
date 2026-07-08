import test from "node:test";
import assert from "node:assert/strict";

import {
  FACTORY_PROFILE_STORAGE_KEY,
  bindFactoryProfileToSession,
  loadFactoryProfile,
  saveFactoryProfile,
} from "../js/platform/identity/factory-profile.mjs";
import { createOnlineIdentityPayload } from "../js/platform/identity/match-identity.mjs";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("local factory profile shim creates and persists a test player identity", () => {
  const storage = memoryStorage();
  const options = { playerIdGenerator: () => "local-player-1", seedProfileName: "Local Pilot" };

  const profile = loadFactoryProfile(storage, options);
  const reloaded = loadFactoryProfile(storage, { playerIdGenerator: () => "should-not-be-used" });

  assert.equal(profile.playerId, "local-player-1");
  assert.equal(profile.profileName, "Local Pilot");
  assert.equal(reloaded.playerId, "local-player-1");
  assert.equal(JSON.parse(storage.getItem(FACTORY_PROFILE_STORAGE_KEY)).playerId, "local-player-1");
});

test("local factory profile shim supports platform session binding", () => {
  const storage = memoryStorage();
  saveFactoryProfile({ playerId: "guest-id", profileName: "Guest" }, storage);

  const profile = bindFactoryProfileToSession("factory-id-42", storage, { profileName: "Factory Ace" });

  assert.equal(profile.playerId, "factory-id-42");
  assert.equal(profile.profileName, "Factory Ace");
  assert.equal(loadFactoryProfile(storage).playerId, "factory-id-42");
});

test("local match identity shim emits the online lobby payload shape", () => {
  assert.deepEqual(
    createOnlineIdentityPayload({ playerId: "player-7", profileName: "Tactician" }),
    { playerId: "player-7", displayName: "Tactician" },
  );
  assert.deepEqual(
    createOnlineIdentityPayload({ playerId: "player-7", profileName: "Tactician" }, "Duelist"),
    { playerId: "player-7", displayName: "Duelist" },
  );
});
