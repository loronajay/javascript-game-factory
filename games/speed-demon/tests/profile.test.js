import { suite, test, asyncTest, assert, assertEqual, finish } from "./harness.js";

import {
  ANONYMOUS_NAME,
  MAX_FAVOURITES,
  MAX_NAME_LENGTH,
  createProfile,
  displayName,
  favouritesFull,
  isFavourite,
  profileEquals,
  refreshFavourites,
  setAvatar,
  setName,
  toggleFavourite,
} from "../scripts/profile/profile.js";
import { AVATAR_GROUPS, DEFAULT_AVATAR_ID, allAvatars, avatarById } from "../scripts/profile/avatars.js";
import { createProfileStore, GAME_SLUG, STATUS_LOCAL, STATUS_IDLE, STATUS_ERROR } from "../scripts/profile/profile-store.js";
import { allModels } from "../scripts/assets/car-atlas.js";

suite("profile — the driver, and where the driver is kept");

const A_CAR = allModels()[0].id;
const B_CAR = allModels()[1].id;

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

test("every avatar id is unique, and every one resolves", () => {
  const ids = allAvatars().map((avatar) => avatar.id);
  assertEqual(new Set(ids).size, ids.length, "two faces share an id, so one of them is unreachable");
  for (const id of ids) assert(avatarById(id), `${id} does not resolve`);
});

test("every avatar points at a file under its own group's folder", () => {
  for (const group of AVATAR_GROUPS) {
    for (const avatar of group.avatars) {
      assert(avatar.src.startsWith("assets/avatars/"), `${avatar.id} is not under the avatar folder`);
      assert(avatar.src.endsWith(".png"), `${avatar.id} is not a png`);
      assertEqual(avatar.groupId, group.id);
    }
  }
});

test("the default face is a real one", () => {
  // Every surface that draws a driver assumes there is a face; a default that
  // did not resolve would make the fallback the normal case.
  assert(avatarById(DEFAULT_AVATAR_ID));
});

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

test("a name is trimmed, filtered and capped", () => {
  const profile = createProfile({ name: "  Jay <script>  " });
  assertEqual(profile.name, "Jay script", "angle brackets are not in the alphabet");
  assertEqual(createProfile({ name: "x".repeat(40) }).name.length, MAX_NAME_LENGTH);
  assertEqual(createProfile({ name: 12 }).name, "", "a non-string name is not a name");
});

test("an empty name is legal, and prints as the anonymous one", () => {
  // Clearing the field is a choice a player can make, so every surface needs one
  // answer for it rather than each inventing its own.
  assertEqual(displayName(createProfile({})), ANONYMOUS_NAME);
  assertEqual(displayName(createProfile({ name: "Ren" })), "Ren");
});

test("an unknown avatar falls back rather than being stored", () => {
  assertEqual(createProfile({ avatarId: "nope-9" }).avatarId, DEFAULT_AVATAR_ID);
  const profile = createProfile({});
  assertEqual(setAvatar(profile, "nope-9"), profile, "an unknown id must not be adopted");
});

test("favourites are deduped, validated and capped", () => {
  const profile = createProfile({ favourites: [A_CAR, A_CAR, "not-a-car", B_CAR] });
  assertEqual(profile.favourites.map((pin) => pin.modelId).join(","), `${A_CAR},${B_CAR}`);

  const stuffed = createProfile({ favourites: allModels().map((model) => model.id) });
  assertEqual(stuffed.favourites.length, MAX_FAVOURITES);
});

test("a pin is a car as painted, and an old saved id still reads", () => {
  // The bodies are neutral, so a pin that was only a model id could put nothing
  // on the card but factory silver — which is what this replaced. A bare string
  // is what an older save holds and it still says something true.
  const saved = createProfile({
    favourites: [A_CAR, { modelId: A_CAR, presetId: "kaido#1", livery: { paint: { hue: 110, saturation: 0.8 } } }],
  });
  assertEqual(saved.favourites.length, 2, "the same body in two paints is two pins");
  assertEqual(saved.favourites[0].presetId, null, "a bare id is a factory pin");
  assertEqual(saved.favourites[1].livery.paint.hue, 110);

  // …and the same paint twice is still one pin.
  const twice = createProfile({ favourites: [{ modelId: A_CAR, presetId: "kaido#1" }, { modelId: A_CAR, presetId: "kaido#1" }] });
  assertEqual(twice.favourites.length, 1);
});

test("a re-coloured preset is written through to the pins that name it", () => {
  // A pin carries the paint itself so a stranger can draw it, which means the
  // owner's copy goes stale the moment they re-colour that preset.
  const profile = createProfile({ favourites: [{ modelId: A_CAR, presetId: "kaido#1", livery: { paint: { hue: 10 } } }] });
  const refreshed = refreshFavourites(profile, () => ({ paint: { hue: 200, saturation: 0.7 } }));
  assertEqual(refreshed.favourites[0].livery.paint.hue, 200);
  assert(!profileEquals(profile, refreshed), "the paint is part of what a pin says");

  // A deleted preset keeps the paint it was saved with rather than reverting.
  const orphaned = refreshFavourites(refreshed, () => undefined);
  assertEqual(orphaned, refreshed, "an unresolvable preset must not wipe the pin");
  // …and a factory pin is never looked up at all.
  const factory = createProfile({ favourites: [A_CAR] });
  assertEqual(refreshFavourites(factory, () => ({ paint: { hue: 9 } })), factory);
});

test("pinning past the ceiling is refused, not silently swapped", () => {
  // The alternative — dropping the oldest pin — throws away something the player
  // chose on purpose in response to a press that looked like it added one.
  let profile = createProfile({});
  for (const model of allModels().slice(0, MAX_FAVOURITES)) profile = toggleFavourite(profile, model.id);
  assert(favouritesFull(profile));

  const sixth = allModels()[MAX_FAVOURITES].id;
  assertEqual(toggleFavourite(profile, sixth), profile, "the sixth pin must be a no-op");
  assert(!isFavourite(profile, sixth));

  // …and unpinning always works, which is what makes the refusal recoverable.
  const freed = toggleFavourite(profile, allModels()[0].id);
  assert(!favouritesFull(freed));
  assert(isFavourite(toggleFavourite(freed, sixth), sixth));
});

test("pin order is part of what the card says", () => {
  // The strip is drawn in the order they were added, so the same five cars in a
  // different order is a different card — `liveryEquals`' argument about layers.
  const a = createProfile({ favourites: [A_CAR, B_CAR] });
  const b = createProfile({ favourites: [B_CAR, A_CAR] });
  assert(!profileEquals(a, b));
  assert(profileEquals(a, createProfile({ favourites: [A_CAR, B_CAR] })));
});

test("an unchanged edit returns the same object", () => {
  const profile = createProfile({ name: "Ren" });
  assertEqual(setName(profile, "Ren"), profile);
  assertEqual(setAvatar(profile, profile.avatarId), profile);
});

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

const signedIn = { authenticated: true, playerId: "player-1", token: "t" };
const signedOut = { authenticated: false, playerId: "", token: "" };

function fakeStorage() {
  const map = new Map();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  };
}

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

function fakeApi({ profile = null, failGet = false, failPut = false } = {}) {
  const calls = { get: [], put: [] };
  return {
    calls,
    isConfigured: true,
    get: async (path) => {
      calls.get.push(path);
      if (failGet) throw new Error("offline");
      return { profile };
    },
    put: async (path, body) => {
      calls.put.push({ path, body });
      if (failPut) throw new Error("offline");
      return { ok: true };
    },
  };
}

const noFactoryName = () => ({ profileName: "" });

test("signed out the driver still exists, and nothing is sent", () => {
  // The records' rule rather than the garage's: a face on your own VS card costs
  // nobody anything, so it is not gated behind an account.
  const api = fakeApi();
  withStorage(fakeStorage(), () => {
    const store = createProfileStore({ session: signedOut, api, readFactoryProfile: noFactoryName });
    assert(!store.synced);
    assertEqual(store.status, STATUS_LOCAL);
    store.save(createProfile({ name: "Vee" }));
    assertEqual(store.profile.name, "Vee");
    assertEqual(api.calls.put.length, 0, "a signed-out edit must not be pushed");
  });
});

test("a fresh driver is named from the factory profile, never the other way round", () => {
  // Canonical identity belongs to the shell. This reads it once as a default and
  // has no path at all that writes back to it.
  withStorage(fakeStorage(), () => {
    const store = createProfileStore({
      session: signedOut,
      api: fakeApi(),
      readFactoryProfile: () => ({ profileName: "Neon Runner" }),
    });
    assertEqual(store.profile.name, "Neon Runner");
  });
});

test("signed out and signed in do not share a saved driver", () => {
  // Two people on one machine would otherwise donate each other's identity —
  // the records store's rule, for the records store's reason.
  const storage = fakeStorage();
  withStorage(storage, () => {
    createProfileStore({ session: signedOut, api: fakeApi(), readFactoryProfile: noFactoryName })
      .save(createProfile({ name: "Guest" }));
    const mine = createProfileStore({ session: signedIn, api: fakeApi(), readFactoryProfile: noFactoryName });
    assert(mine.profile.name !== "Guest", "the account adopted the signed-out driver");
  });
});

await asyncTest("signed in, an edit is pushed to the game's driver route", async () => {
  const api = fakeApi();
  await withStorage(fakeStorage(), async () => {
    const store = createProfileStore({ session: signedIn, api, readFactoryProfile: noFactoryName });
    assert(store.synced);
    store.save(createProfile({ name: "Kuroda", favourites: [A_CAR] }));
    await Promise.resolve();
    await Promise.resolve();
    assertEqual(api.calls.put.length, 1);
    assertEqual(api.calls.put[0].path, `/games/${GAME_SLUG}/driver`);
    assertEqual(api.calls.put[0].body.profile.name, "Kuroda");
    assertEqual(store.status, STATUS_IDLE);
  });
});

await asyncTest("the server's driver wins on load, and a blank one does not", async () => {
  await withStorage(fakeStorage(), async () => {
    const withRow = createProfileStore({
      session: signedIn,
      api: fakeApi({ profile: { name: "Mako", avatarId: DEFAULT_AVATAR_ID, favourites: [] } }),
      readFactoryProfile: noFactoryName,
    });
    assertEqual((await withRow.load()).name, "Mako");
  });

  await withStorage(fakeStorage(), async () => {
    // No row yet. The local driver is kept and pushed up rather than wiped by an
    // empty document — a fresh account must not discard what is already here.
    const api = fakeApi({ profile: { name: "", avatarId: DEFAULT_AVATAR_ID, favourites: [] } });
    const store = createProfileStore({ session: signedIn, api, readFactoryProfile: noFactoryName });
    store.save(createProfile({ name: "Local" }));
    assertEqual((await store.load()).name, "Local");
  });
});

await asyncTest("a failed push keeps the edit and says so", async () => {
  const api = fakeApi({ failPut: true });
  await withStorage(fakeStorage(), async () => {
    const store = createProfileStore({ session: signedIn, api, readFactoryProfile: noFactoryName });
    store.save(createProfile({ name: "Zero" }));
    await Promise.resolve();
    await Promise.resolve();
    assertEqual(store.status, STATUS_ERROR);
    assert(store.dirty, "a failed push must stay pending");
    assertEqual(store.profile.name, "Zero", "the driver is theirs whatever the network did");
  });
});

await asyncTest("another player's driver is a public read, and null on failure", async () => {
  const api = fakeApi({ profile: { name: "Saint", avatarId: DEFAULT_AVATAR_ID, favourites: [] } });
  await withStorage(fakeStorage(), async () => {
    // Signed out on purpose: the read is public, so a spectator needs no account.
    const store = createProfileStore({ session: signedOut, api, readFactoryProfile: noFactoryName });
    const other = await store.fetchDriver("player-2");
    assertEqual(other.name, "Saint");
    assertEqual(api.calls.get.at(-1), `/games/${GAME_SLUG}/driver/player-2`);
  });

  await withStorage(fakeStorage(), async () => {
    const store = createProfileStore({
      session: signedOut,
      api: fakeApi({ failGet: true }),
      readFactoryProfile: noFactoryName,
    });
    assertEqual(await store.fetchDriver("player-2"), null, "a failed read must be a normal null");
  });
});

finish();
