import test from "node:test";
import assert from "node:assert/strict";

import { createLayoutStore } from "../arcade-room-store.mjs";
import { completeFarmOnboarding } from "../farm-onboarding.mjs";
import { createDefaultFarmLayout, farmCacheKey, normalizeFarmLayout } from "../farm-layout.mjs";

const SPEC = Object.freeze({ slug: "farm", cacheKey: farmCacheKey, normalize: normalizeFarmLayout, createDefault: () => createDefaultFarmLayout(() => 0) });
const signedOut = { authenticated: false, playerId: "" };
const signedIn = { authenticated: true, playerId: "p1" };

function memoryStorage() {
  const map = new Map();
  return { map, getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)) };
}

function apiWith(garage) {
  const calls = [];
  return {
    calls,
    isConfigured: true,
    fetchGameGarage: async () => ({ garage }),
    saveGameGarage: async (slug, saved) => { calls.push(["save", slug, saved]); return { ok: true, garage: saved }; },
    fetchGamePublicLoadout: async () => ({ layout: garage }),
    loadPlayerProfile: async () => ({ profileName: "Farmer" }),
  };
}

test("signed-out onboarding saves its random starter grant to the guest cache and reload cannot reroll it", async () => {
  const storage = memoryStorage();
  const store = createLayoutStore(SPEC, { session: signedOut, api: null, storage });
  const first = await store.load();
  assert.equal(first.source, "starter");
  const completed = completeFarmOnboarding(first.layout, "Biscuit", () => 0.5).layout;
  assert.equal((await store.save(completed)).target, "device");

  const reloaded = await store.load();
  assert.equal(reloaded.source, "device");
  assert.deepEqual(reloaded.layout, completed);
  assert.equal(reloaded.layout.pets.length, 1);
});

test("signed-in onboarding saves the dog and grants as one account document", async () => {
  const initial = createDefaultFarmLayout(() => 0);
  const api = apiWith(initial);
  const store = createLayoutStore(SPEC, { session: signedIn, api, storage: memoryStorage() });
  const loaded = await store.load();
  const completed = completeFarmOnboarding(loaded.layout, "Scout", () => 0.5).layout;
  const result = await store.save(completed);
  assert.equal(result.target, "account");
  assert.deepEqual(api.calls.at(-1), ["save", "farm", completed]);
  assert.equal(api.calls.at(-1)[2].pets[0].name, "Scout");
  assert.equal(api.calls.at(-1)[2].onboarding.status, "complete");
});

test("visitors may read a farm but never receive owner onboarding or write it", async () => {
  const api = apiWith(createDefaultFarmLayout(() => 0));
  const store = createLayoutStore(SPEC, { visitPlayerId: "p2", session: signedIn, api, storage: memoryStorage() });
  const loaded = await store.load();
  assert.equal(store.mode, "visitor");
  assert.equal(loaded.layout.onboarding.status, "needs_name");
  assert.deepEqual(await store.save(completeFarmOnboarding(loaded.layout, "Nope").layout), { ok: false, target: "device", error: "read_only" });
  assert.equal(api.calls.length, 0);
});
