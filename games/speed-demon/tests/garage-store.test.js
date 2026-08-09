import { suite, test, asyncTest, assert, assertEqual, finish } from "./harness.js";

import {
  GAME_SLUG,
  STATUS_OFFLINE,
  STATUS_IDLE,
  STATUS_ERROR,
  createGarageStore,
} from "../scripts/garage/garage-store.js";
import { emptyGarage, savePreset, presetsForModel } from "../scripts/garage/garage.js";

suite("garage-store — the server, and the cache in front of it");

const MODEL = "kaido-gts";
const KNOWN = [MODEL, "toro-sv"];
const isKnownModel = (id) => KNOWN.includes(id);

const signedIn = { authenticated: true, playerId: "player-1", token: "t" };
const signedOut = { authenticated: false, playerId: "", token: "" };

/** A fake localStorage that can also be made to throw, the way a blocked one does. */
function fakeStorage({ blocked = false } = {}) {
  const map = new Map();
  return {
    map,
    getItem: (key) => (blocked ? (() => { throw new Error("blocked"); })() : map.get(key) ?? null),
    setItem: (key, value) => {
      if (blocked) throw new Error("blocked");
      map.set(key, value);
    },
    removeItem: (key) => map.delete(key),
  };
}

/** Installs a fake localStorage for one test and restores whatever was there. */
function withStorage(store, fn) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true });
  try {
    return fn();
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
}

/** A fake platform client recording what it was asked to do. */
function fakeApi({ garage = null, failGet = false, failPut = false } = {}) {
  const calls = { get: [], put: [] };
  let failing = failPut;
  return {
    calls,
    setFailing(value) { failing = value; },
    get: async (path) => {
      calls.get.push(path);
      if (failGet) throw new Error("offline");
      return { garage };
    },
    put: async (path, body) => {
      calls.put.push({ path, body });
      if (failing) throw new Error("offline");
      return { ok: true };
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// ---------------------------------------------------------------------------
// The sign-in gate
// ---------------------------------------------------------------------------

await asyncTest("signed out, the garage is unavailable rather than broken", async () => {
  // Nothing in the game may treat a missing garage as an error: the cabinet
  // still races, on Factory paint.
  const store = createGarageStore({ session: signedOut, isKnownModel });
  assertEqual(store.available, false);
  assertEqual(store.status, STATUS_OFFLINE);
  const garage = await store.load();
  assertEqual(garage.presets.length, 0);
});

test("signed out, saving is a no-op rather than a throw", () => {
  const store = createGarageStore({ session: signedOut, isKnownModel });
  store.save(savePreset(emptyGarage(), { modelId: MODEL, name: "Lime" }));
  assertEqual(store.dirty, false);
});

test("signed out, nothing is written to storage at all", () => {
  const cache = fakeStorage();
  withStorage(cache, () => {
    const store = createGarageStore({ session: signedOut, isKnownModel });
    store.save(savePreset(emptyGarage(), { modelId: MODEL, name: "Lime" }));
    assertEqual(cache.map.size, 0);
  });
});

test("signed in, the garage is available", () => {
  const store = createGarageStore({ session: signedIn, api: fakeApi(), isKnownModel });
  assertEqual(store.available, true);
  assertEqual(store.status, STATUS_IDLE);
});

// Signed in but with nowhere to send: a page that forgot `platform-config.mjs`
// resolves an empty base URL, and the platform client answers null instead of
// throwing — so an unguarded store would report every push as a success and the
// player's paints would silently never leave the browser.
await asyncTest("signed in with an unconfigured client, the garage is unavailable", async () => {
  const api = { ...fakeApi(), isConfigured: false };
  const cache = fakeStorage();
  await withStorage(cache, async () => {
    const store = createGarageStore({ session: signedIn, api, isKnownModel });
    assertEqual(store.available, false);
    assertEqual(store.status, STATUS_OFFLINE);
    store.save(savePreset(emptyGarage(), { modelId: MODEL, name: "Lime" }));
    assertEqual(store.dirty, false);
    assertEqual(cache.map.size, 0);
    const garage = await store.load();
    assertEqual(garage.presets.length, 0);
    assertEqual(api.calls.get.length, 0);
    assertEqual(api.calls.put.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

await asyncTest("loading returns the server's copy", async () => {
  const api = fakeApi({
    garage: { presets: [{ id: "p1", modelId: MODEL, name: "Server" }] },
  });
  const store = createGarageStore({ session: signedIn, api, isKnownModel });
  const garage = await withStorage(fakeStorage(), () => store.load());
  assertEqual(garage.presets.length, 1);
  assertEqual(garage.presets[0].name, "Server");
  assertEqual(api.calls.get[0], `/games/${GAME_SLUG}/garage`);
});

await asyncTest("the server's copy is normalized, so a bad row cannot reach the picker", async () => {
  const api = fakeApi({
    garage: {
      presets: [
        { id: "p1", modelId: "monster-truck", name: "Fake" },
        { id: "p2", modelId: MODEL, name: "Real", livery: { paint: { hue: 9999, finish: "chrome" } } },
      ],
    },
  });
  const store = createGarageStore({ session: signedIn, api, isKnownModel });
  const garage = await withStorage(fakeStorage(), () => store.load());
  assertEqual(garage.presets.length, 1);
  assertEqual(garage.presets[0].livery.paint.finish, "gloss");
});

await asyncTest("a failed load falls back to the cached copy", async () => {
  const cache = fakeStorage();
  cache.map.set(
    "speed-demon:garage:player-1",
    JSON.stringify({ presets: [{ id: "p1", modelId: MODEL, name: "Cached" }] }),
  );
  const store = createGarageStore({ session: signedIn, api: fakeApi({ failGet: true }), isKnownModel });
  const garage = await withStorage(cache, () => store.load());
  assertEqual(garage.presets.length, 1);
  assertEqual(garage.presets[0].name, "Cached");
  assertEqual(store.status, STATUS_ERROR);
});

await asyncTest("a failed load with no cache is an empty garage, not a crash", async () => {
  const store = createGarageStore({ session: signedIn, api: fakeApi({ failGet: true }), isKnownModel });
  const garage = await withStorage(fakeStorage(), () => store.load());
  assertEqual(garage.presets.length, 0);
});

await asyncTest("the cache is keyed by player, so a shared browser cannot leak paints", async () => {
  // A single global key is exactly how one account ends up showing another's
  // saved configs.
  const cache = fakeStorage();
  cache.map.set(
    "speed-demon:garage:player-2",
    JSON.stringify({ presets: [{ id: "p1", modelId: MODEL, name: "Someone Else" }] }),
  );
  const store = createGarageStore({ session: signedIn, api: fakeApi({ failGet: true }), isKnownModel });
  const garage = await withStorage(cache, () => store.load());
  assertEqual(garage.presets.length, 0, "player-1 must not see player-2's cache");
});

await asyncTest("blocked storage does not stop a load", async () => {
  const store = createGarageStore({
    session: signedIn,
    api: fakeApi({ garage: { presets: [{ id: "p1", modelId: MODEL, name: "Server" }] } }),
    isKnownModel,
  });
  const garage = await withStorage(fakeStorage({ blocked: true }), () => store.load());
  assertEqual(garage.presets.length, 1);
});

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

test("saving writes the cache synchronously, before the network is involved", () => {
  const cache = fakeStorage();
  withStorage(cache, () => {
    const store = createGarageStore({ session: signedIn, api: fakeApi(), isKnownModel });
    store.save(savePreset(emptyGarage(), { modelId: MODEL, name: "Lime" }));
    // No awaiting: the player's work has to be safe the moment they press save.
    const cached = JSON.parse(cache.map.get("speed-demon:garage:player-1"));
    assertEqual(cached.presets[0].name, "Lime");
  });
});

await asyncTest("saving pushes the garage to the server", async () => {
  const api = fakeApi();
  const store = createGarageStore({ session: signedIn, api, isKnownModel });
  withStorage(fakeStorage(), () => store.save(savePreset(emptyGarage(), { modelId: MODEL, name: "Lime" })));
  await flush();
  assertEqual(api.calls.put.length, 1);
  assertEqual(api.calls.put[0].path, `/games/${GAME_SLUG}/garage`);
  assertEqual(api.calls.put[0].body.garage.presets[0].name, "Lime");
  assertEqual(store.dirty, false);
});

await asyncTest("only the fields that survive a round trip are sent", async () => {
  const api = fakeApi();
  const store = createGarageStore({ session: signedIn, api, isKnownModel });
  const garage = savePreset(emptyGarage(), { modelId: MODEL, name: "Lime" });
  withStorage(fakeStorage(), () => store.save({ ...garage, scratch: "should not travel" }));
  await flush();
  assertEqual(api.calls.put[0].body.garage.scratch, undefined);
});

await asyncTest("a failed save keeps the work and reports the failure", async () => {
  const api = fakeApi({ failPut: true });
  const store = createGarageStore({ session: signedIn, api, isKnownModel });
  withStorage(fakeStorage(), () => store.save(savePreset(emptyGarage(), { modelId: MODEL, name: "Lime" })));
  await flush();
  assertEqual(store.dirty, true, "the edit must still be pending");
  assertEqual(store.status, STATUS_ERROR);
});

await asyncTest("a failed save is retried on a backoff driven by the game loop", async () => {
  const api = fakeApi({ failPut: true });
  const store = createGarageStore({ session: signedIn, api, isKnownModel });
  withStorage(fakeStorage(), () => store.save(savePreset(emptyGarage(), { modelId: MODEL, name: "Lime" })));
  await flush();
  assertEqual(api.calls.put.length, 1);

  // Not yet — the backoff has not elapsed.
  store.tick(0.5);
  await flush();
  assertEqual(api.calls.put.length, 1);

  api.setFailing(false);
  store.tick(10);
  await flush();
  assertEqual(api.calls.put.length, 2, "the retry must eventually fire");
  assertEqual(store.dirty, false);
  assertEqual(store.status, STATUS_IDLE);
});

await asyncTest("ticking with nothing pending does nothing", async () => {
  const api = fakeApi();
  const store = createGarageStore({ session: signedIn, api, isKnownModel });
  store.tick(100);
  await flush();
  assertEqual(api.calls.put.length, 0);
});

await asyncTest("an edit made during a save is not swallowed by it", async () => {
  // The push holds the whole document, so a newer edit arriving mid-flight must
  // not be cleared when the older one succeeds.
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const calls = [];
  const api = {
    get: async () => ({ garage: null }),
    put: async (path, body) => {
      calls.push(body.garage.presets.map((preset) => preset.name).join(","));
      await gate;
      return { ok: true };
    },
  };
  const store = createGarageStore({ session: signedIn, api, isKnownModel });

  const first = savePreset(emptyGarage(), { modelId: MODEL, name: "First" });
  const second = savePreset(first, { modelId: MODEL, name: "Second" });
  withStorage(fakeStorage(), () => {
    store.save(first);
    store.save(second);
  });

  assertEqual(calls.length, 1, "the second save must coalesce rather than start a second push");
  assertEqual(store.dirty, true, "the newer edit is pending while the older one is in flight");

  release();
  await flush();
  await flush();

  // The newer edit is sent as soon as the in-flight push lands, without waiting
  // for a tick: a successful push schedules no retry, so nothing else would send
  // it and it would sit pending until some unrelated save happened to flush it.
  assert(calls.some((names) => names.includes("Second")), "the newer edit must reach the server");
  assertEqual(store.dirty, false, "nothing may be left pending once the newer edit lands");
});

test("saving a garage does not alter it", () => {
  const garage = savePreset(emptyGarage(), { modelId: MODEL, name: "Lime" });
  const before = JSON.stringify(garage);
  const store = createGarageStore({ session: signedIn, api: fakeApi(), isKnownModel });
  withStorage(fakeStorage(), () => store.save(garage));
  assertEqual(JSON.stringify(garage), before);
  assertEqual(presetsForModel(garage, MODEL).length, 1);
});

finish();
