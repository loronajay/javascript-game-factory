import { suite, test, assert, assertEqual, assertDeepEqual, finish } from "./harness.js";

import { DEFAULT_BALL } from "../scripts/assets/ball-catalog.js";
import { DEFAULT_LOCATION } from "../scripts/assets/location-catalog.js";
import { DEFAULT_DURATION, LEADERBOARD_SIZE } from "../scripts/sim/constants.js";
import { DEFAULT_HOOP_MODE } from "../scripts/sim/hoop.js";
import { addEntry, bestScore, boardKey, compareEntries, rankOf } from "../scripts/store/boards.js";
import { createBoardsStore } from "../scripts/store/boards-store.js";
import { createMemoryStorage } from "../scripts/store/local-storage.js";
import {
  DEFAULT_SHOOTING_HAND,
  createPreferencesStore,
  normalizeDuration,
  normalizeHand,
} from "../scripts/store/preferences.js";

suite("store — boards, preferences, and surviving hostile storage");

const summary = (score, extra = {}) => ({
  modeId: "still",
  locationId: "bedroom",
  ballId: "basketball",
  duration: 30,
  score,
  shots: 10,
  made: score / 2,
  accuracy: 50,
  bestStreak: 2,
  ...extra,
});

// ---------------------------------------------------------------------------
// Board shaping
// ---------------------------------------------------------------------------

test("a board key is mode and duration — the two things that change what a score means", () => {
  assertEqual(boardKey("still", 30), "still:30");
  assert(boardKey("still", 30) !== boardKey("still", 60), "duration splits boards");
  assert(boardKey("still", 30) !== boardKey("circle", 30), "mode splits boards");
});

test("the room and the ball do NOT split boards", () => {
  // One board ranks every room and every ball together. The room is cosmetic and
  // could never have split them; the ball genuinely flies differently and is
  // still not a key, because the difference is published on the setup screen and
  // named on every row instead. See the header of scripts/store/boards.js.
  const store = createBoardsStore({ storage: createMemoryStorage(), now: makeClock() });
  store.submitRun(summary(10, { locationId: "bedroom", ballId: "basketball" }));
  store.submitRun(summary(20, { locationId: "cubicle", ballId: "paper" }));
  assertEqual(store.readBoard("still", 30).length, 2, "both runs land on the same board");
});

test("entries rank by score, then by streak, then by fewer shots", () => {
  const sorted = [
    { score: 10, bestStreak: 1, shots: 5 },
    { score: 20, bestStreak: 1, shots: 9 },
    { score: 20, bestStreak: 3, shots: 9 },
    { score: 20, bestStreak: 3, shots: 4 },
  ].sort(compareEntries);
  assertDeepEqual(
    sorted.map((entry) => `${entry.score}/${entry.bestStreak}/${entry.shots}`),
    ["20/3/4", "20/3/9", "20/1/9", "10/1/5"],
  );
});

test("a board keeps only the top five", () => {
  let board = [];
  for (let i = 0; i < 20; i++) board = addEntry(board, { score: i, bestStreak: 0, shots: 1, at: i });
  assertEqual(board.length, LEADERBOARD_SIZE);
  assertEqual(board[0].score, 19, "and keeps the best of them");
});

test("adding an entry does not mutate the board it was given", () => {
  const original = [{ score: 5, at: 1 }];
  addEntry(original, { score: 50, at: 2 });
  assertEqual(original.length, 1, "the caller's board is untouched");
});

test("rank is found by identity, so two identical runs rank distinctly", () => {
  const first = { score: 10, bestStreak: 1, shots: 4, at: 100 };
  const second = { score: 10, bestStreak: 1, shots: 4, at: 200 };
  const board = addEntry(addEntry([], first), second);
  assert(rankOf(board, first) !== rankOf(board, second), "the two must not report the same rank");
});

test("an entry that did not place reports rank 0", () => {
  let board = [];
  for (let i = 0; i < LEADERBOARD_SIZE; i++) board = addEntry(board, { score: 100, bestStreak: 5, shots: 1, at: i });
  const loser = { score: 1, bestStreak: 0, shots: 20, at: 999 };
  assertEqual(rankOf(addEntry(board, loser), loser), 0);
});

test("board helpers tolerate the junk that can come back out of storage", () => {
  for (const junk of [null, undefined, "nonsense", 42, [null, "x", undefined]]) {
    assertEqual(bestScore(junk), 0, `bestScore(${JSON.stringify(junk)})`);
    assert(Array.isArray(addEntry(junk, { score: 1, at: 1 })));
  }
});

// ---------------------------------------------------------------------------
// Board store
// ---------------------------------------------------------------------------

test("a submitted run places, and reports the best it had to beat", () => {
  const store = createBoardsStore({ storage: createMemoryStorage(), now: makeClock() });
  const first = store.submitRun(summary(20));
  assertEqual(first.rank, 1);
  assertEqual(first.previousBest, 0, "nothing to beat on an empty board");

  const second = store.submitRun(summary(40));
  assertEqual(second.rank, 1);
  assertEqual(second.previousBest, 20, "the bar as it stood before this run");
});

test("a scoreless run is not filed", () => {
  const store = createBoardsStore({ storage: createMemoryStorage(), now: makeClock() });
  const result = store.submitRun(summary(0));
  assert(!result.placed);
  assertEqual(store.readBoard("still", 30).length, 0, "an empty board beats a board of zeroes");
});

test("boards persist across store instances", () => {
  const storage = createMemoryStorage();
  createBoardsStore({ storage, now: makeClock() }).submitRun(summary(30));
  assertEqual(createBoardsStore({ storage }).bestScore("still", 30), 30);
});

test("clearing one board leaves the others standing", () => {
  const storage = createMemoryStorage();
  const store = createBoardsStore({ storage, now: makeClock() });
  store.submitRun(summary(30));
  store.submitRun(summary(40, { duration: 60 }));
  assert(store.clearBoard("still", 30));
  assertEqual(store.readBoard("still", 30).length, 0);
  assertEqual(store.readBoard("still", 60).length, 1, "the 60-second board is untouched");
});

test("clearing a board that was never written is a no-op, not an error", () => {
  const store = createBoardsStore({ storage: createMemoryStorage() });
  assert(!store.clearBoard("circle", 60));
});

// ---------------------------------------------------------------------------
// Hostile storage
// ---------------------------------------------------------------------------

test("storage that throws on write costs persistence, never the session", () => {
  const hostile = {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {},
  };
  // The probe alone should reject this storage and fall back to memory.
  const store = createBoardsStore({ storage: hostile, now: makeClock() });
  const result = store.submitRun(summary(20));
  assertEqual(result.rank, 1, "the run still scores");
  assertEqual(store.bestScore("still", 30), 20, "and is readable for the rest of the session");
});

test("storage that throws on read degrades to empty rather than crashing", () => {
  const hostile = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {},
    removeItem: () => {},
  };
  assertEqual(createBoardsStore({ storage: hostile }).readBoard("still", 30).length, 0);
});

test("corrupt stored JSON degrades to empty rather than crashing", () => {
  for (const corrupt of ["{not json", '"a string"', "[1,2,3]", "null"]) {
    const storage = createMemoryStorage({ "miniHoops.boards.v1": corrupt });
    const store = createBoardsStore({ storage });
    assertEqual(store.readBoard("still", 30).length, 0, `survived ${corrupt}`);
  }
});

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

test("a fresh player gets the documented defaults", () => {
  const prefs = createPreferencesStore({ storage: createMemoryStorage() });
  assertEqual(prefs.modeId, DEFAULT_HOOP_MODE);
  assertEqual(prefs.locationId, DEFAULT_LOCATION);
  assertEqual(prefs.ballId, DEFAULT_BALL);
  assertEqual(prefs.duration, DEFAULT_DURATION);
});

test("preferences survive a reload", () => {
  const storage = createMemoryStorage();
  const first = createPreferencesStore({ storage });
  first.setMode("circle");
  first.setBall("paper");
  first.setLocation("cubicle");
  first.setDuration(60);

  const second = createPreferencesStore({ storage });
  assertEqual(second.modeId, "circle");
  assertEqual(second.ballId, "paper");
  assertEqual(second.locationId, "cubicle");
  assertEqual(second.duration, 60);
});

test("the round length is remembered per mode", () => {
  const prefs = createPreferencesStore({ storage: createMemoryStorage() });
  prefs.setMode("still");
  prefs.setDuration(30);
  prefs.setMode("circle");
  prefs.setDuration(60);
  assertEqual(prefs.duration, 60, "circle remembers a minute");
  prefs.setMode("still");
  assertEqual(prefs.duration, 30, "still remembers thirty seconds");
});

test("a stored value naming something that no longer exists falls back", () => {
  // The reason preferences resolve through the catalogs on the way out.
  const storage = createMemoryStorage({
    "miniHoops.preferences.v1": JSON.stringify({
      modeId: "diagonal",
      locationId: "moon-base",
      ballId: "medicine-ball",
      durationByMode: { still: 45 },
    }),
  });
  const prefs = createPreferencesStore({ storage });
  assertEqual(prefs.modeId, DEFAULT_HOOP_MODE);
  assertEqual(prefs.locationId, DEFAULT_LOCATION);
  assertEqual(prefs.ballId, DEFAULT_BALL);
  assertEqual(prefs.duration, DEFAULT_DURATION, "45 seconds is not a length this game offers");
});

test("the shooting hand is remembered, and is not part of a run", () => {
  const storage = createMemoryStorage();
  const first = createPreferencesStore({ storage });
  assertEqual(first.hand, DEFAULT_SHOOTING_HAND, "right-handed until someone says otherwise");
  first.setHand("left");

  const second = createPreferencesStore({ storage });
  assertEqual(second.hand, "left");
  // The hand moves the court to the other side of a sideways screen and does
  // nothing else. A run set left-handed is the same run, which is what keeps one
  // board meaning one thing — so it must never reach a result.
  assertEqual(second.snapshot().hand, undefined, "the hand is layout, not a run setting");
});

test("a hand nobody has is rejected", () => {
  assertEqual(normalizeHand("left"), "left");
  assertEqual(normalizeHand("sideways"), DEFAULT_SHOOTING_HAND);
  assertEqual(normalizeHand(undefined), DEFAULT_SHOOTING_HAND, "an older blob has no key at all");

  const prefs = createPreferencesStore({
    storage: createMemoryStorage({
      "miniHoops.preferences.v1": JSON.stringify({ hand: "both" }),
    }),
  });
  assertEqual(prefs.hand, DEFAULT_SHOOTING_HAND);
});

test("a duration the game does not offer is rejected", () => {
  assertEqual(normalizeDuration(45), DEFAULT_DURATION);
  assertEqual(normalizeDuration("60"), 60, "but a numeric string is fine");
  assertEqual(normalizeDuration(null), DEFAULT_DURATION);
});

test("the snapshot is everything a run needs to start", () => {
  const prefs = createPreferencesStore({ storage: createMemoryStorage() });
  const snapshot = prefs.snapshot();
  for (const key of ["modeId", "locationId", "ballId", "duration"]) {
    assert(snapshot[key] !== undefined, `snapshot is missing ${key}`);
  }
});

/** Monotonic stand-in for Date.now(), so entry identities stay distinct. */
function makeClock() {
  let value = 1000;
  return () => (value += 1);
}

finish();
