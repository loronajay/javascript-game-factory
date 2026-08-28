import { suite, test, assert, assertEqual, assertDeepEqual, finish } from "./harness.js";

import { BOARD_PIECE, SPRING_PIECE } from "../scripts/sim/trick-shot.js";
import { createMemoryStorage } from "../scripts/store/local-storage.js";
import { createTrickShotStore } from "../scripts/store/trick-shots-store.js";

suite("trick-shot bank — named local layouts");

const layout = (name, extra = {}) => ({
  name,
  locationId: "bedroom",
  ballId: "basketball",
  pieces: [{ type: BOARD_PIECE, id: "board-1", x: 0, y: 0.7, z: 0.5 }],
  ...extra,
});

test("players can name, save, list, and load a trick shot", () => {
  const store = createTrickShotStore({ storage: createMemoryStorage(), now: () => 1234, makeId: () => "saved-1" });
  const saved = store.save(layout("Desk bank"));
  assertEqual(saved.id, "saved-1");
  assertEqual(store.list()[0].name, "Desk bank");
  assertDeepEqual(store.get("saved-1").pieces, saved.pieces);
});

test("saving an opened shot updates it instead of duplicating it", () => {
  let time = 10;
  const store = createTrickShotStore({ storage: createMemoryStorage(), now: () => ++time, makeId: () => "one" });
  const first = store.save(layout("First"));
  const updated = store.save({ ...first, name: "Renamed", pieces: [] });
  assertEqual(store.list().length, 1);
  assertEqual(updated.name, "Renamed");
  assertEqual(updated.createdAt, first.createdAt);
  assert(updated.updatedAt > first.updatedAt);
});

test("the named bank persists and returns defensive copies", () => {
  const storage = createMemoryStorage();
  createTrickShotStore({ storage, makeId: () => "persisted" }).save(layout("Saved forever"));
  const reloaded = createTrickShotStore({ storage });
  const loaded = reloaded.get("persisted");
  loaded.pieces[0].x = 999;
  assertEqual(reloaded.get("persisted").pieces[0].x, 0, "callers cannot mutate the bank in memory");
});

test("saved layouts retain springboards and their launch power", () => {
  const store = createTrickShotStore({ storage: createMemoryStorage(), makeId: () => "spring-shot" });
  const saved = store.save(layout("Spring route", {
    pieces: [{ type: SPRING_PIECE, id: "spring-1", x: 0.1, y: 0.8, z: 0.6, speed: 6.2 }],
  }));
  assertEqual(saved.pieces[0].type, SPRING_PIECE);
  assertEqual(saved.pieces[0].speed, 6.2);
});

test("shots can be deleted without touching neighboring saves", () => {
  let id = 0;
  const store = createTrickShotStore({ storage: createMemoryStorage(), makeId: () => `shot-${++id}` });
  store.save(layout("A"));
  store.save(layout("B"));
  assert(store.remove("shot-1"));
  assertEqual(store.list().length, 1);
  assertEqual(store.list()[0].name, "B");
  assert(!store.remove("missing"));
});

test("corrupt storage degrades to an empty bank", () => {
  const storage = createMemoryStorage({ "miniHoops.trickShots.v1": "{bad json" });
  assertEqual(createTrickShotStore({ storage }).list().length, 0);
});

finish();
