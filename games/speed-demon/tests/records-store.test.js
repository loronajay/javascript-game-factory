import { suite, test, asyncTest, assert, assertEqual, finish } from "./harness.js";

import {
  GAME_SLUG,
  STATUS_LOCAL,
  STATUS_IDLE,
  STATUS_ERROR,
  createRecordsStore,
} from "../scripts/records/records-store.js";
import { BOARD_ERROR, BOARD_OFFLINE, BOARD_READY } from "../scripts/records/records.js";
import { MODE_DISTANCE, MODE_TIME_ATTACK } from "../scripts/sim/modes.js";

suite("records-store — the local best, and the board behind it");

const QUARTER = "distance:quarter";
const SPRINT = "time-attack:sprint";

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
function fakeApi({ records = [], boards = null, failGet = false, failPost = false, reply = null } = {}) {
  const calls = { get: [], post: [] };
  let failing = failPost;
  return {
    calls,
    // The real client reports whether it has a base URL and a fetch to use. The
    // store reads it to tell "no platform here" apart from "the board is empty",
    // so a fake without it would exercise a different branch than production.
    isConfigured: true,
    setFailing(value) { failing = value; },
    get: async (path) => {
      calls.get.push(path);
      if (failGet) throw new Error("offline");
      // A board read is a different route from a personal-bests read, and the
      // store treats a null payload as the failure case — `requestJson` swallows
      // a bad response into null rather than throwing.
      if (path.includes("/board/")) return boards ? boards(path) : null;
      return { records };
    },
    post: async (path, body) => {
      calls.post.push({ path, body });
      if (failing) throw new Error("offline");
      return reply ? reply(body) : { ok: true, improved: true, record: { ...body, verified: false } };
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const run = (over = {}) => ({ boardId: QUARTER, modeId: MODE_DISTANCE, value: 12040, ...over });

// ---------------------------------------------------------------------------
// The sign-in asymmetry — the whole reason this is not the garage store

test("signed out, bests are kept locally and nothing is submitted", () => {
  withStorage(fakeStorage(), () => {
    const store = createRecordsStore({ session: signedOut });
    assertEqual(store.ranked, false, "signed out there is no global board");
    assertEqual(store.status, STATUS_LOCAL);

    // A lap time is meaningful to the player alone. Refusing to keep one until
    // they register would be gating the wrong thing — unlike a livery, which
    // only means something if an opponent can see it.
    const result = store.submit(run());
    assert(result.improved, "a personal best still counts signed out");
    assertEqual(store.records[QUARTER].value, 12040);
    assertEqual(store.dirty, false, "nothing is queued for a server it will never reach");
  });
});

test("signed out bests survive a reload", () => {
  const storage = fakeStorage();
  withStorage(storage, () => {
    createRecordsStore({ session: signedOut }).submit(run());
    const reopened = createRecordsStore({ session: signedOut });
    assertEqual(reopened.records[QUARTER].value, 12040);
  });
});

test("signed-out bests are not donated to whoever signs in next", () => {
  const storage = fakeStorage();
  withStorage(storage, () => {
    createRecordsStore({ session: signedOut }).submit(run());
    // Two people sharing a machine would otherwise hand each other records, and
    // there is no way to tell that apart from one person signing in on their own
    // laptop. The signed-out key is deliberately never merged.
    const signedInStore = createRecordsStore({ session: signedIn, api: fakeApi() });
    assertEqual(signedInStore.records[QUARTER], undefined);
  });
});

test("bests are keyed by player, so a shared browser does not leak them", () => {
  const storage = fakeStorage();
  withStorage(storage, () => {
    createRecordsStore({ session: signedIn, api: fakeApi() }).submit(run());
    const other = createRecordsStore({
      session: { authenticated: true, playerId: "player-2", token: "t" },
      api: fakeApi(),
    });
    assertEqual(other.records[QUARTER], undefined);
  });
});

test("blocked storage does not stop a run being recorded for this session", () => {
  withStorage(fakeStorage({ blocked: true }), () => {
    const store = createRecordsStore({ session: signedOut });
    assert(store.submit(run()).improved);
    assertEqual(store.records[QUARTER].value, 12040);
  });
});

// ---------------------------------------------------------------------------
// What counts as an improvement

test("only a better run replaces the record, in either direction", () => {
  withStorage(fakeStorage(), () => {
    const store = createRecordsStore({ session: signedOut });

    store.submit(run({ value: 12380 }));
    assertEqual(store.submit(run({ value: 12960 })).improved, false, "slower is not better");
    assertEqual(store.records[QUARTER].value, 12380);
    assertEqual(store.submit(run({ value: 12040 })).improved, true);

    store.submit({ boardId: SPRINT, modeId: MODE_TIME_ATTACK, value: 250000 });
    assertEqual(
      store.submit({ boardId: SPRINT, modeId: MODE_TIME_ATTACK, value: 240000 }).improved,
      false,
      "shorter is not better on a time attack",
    );
    assertEqual(
      store.submit({ boardId: SPRINT, modeId: MODE_TIME_ATTACK, value: 260000 }).improved,
      true,
    );
  });
});

test("a non-improvement reports the standing record so the screen can show it", () => {
  withStorage(fakeStorage(), () => {
    const store = createRecordsStore({ session: signedOut });
    store.submit(run({ value: 12040 }));
    const missed = store.submit(run({ value: 12380 }));
    assertEqual(missed.improved, false);
    assertEqual(missed.record.value, 12040, "what there was to beat");
  });
});

// ---------------------------------------------------------------------------
// Submission

await asyncTest("a personal best is pushed to the board with its input log", async () => {
  await withStorage(fakeStorage(), async () => {
    const api = fakeApi();
    const store = createRecordsStore({ session: signedIn, api });
    store.submit(run({ modelId: "kaido-gts", trackId: "track-a", inputLog: [[0, 1]] }));
    await flush();

    assertEqual(api.calls.post.length, 1);
    assertEqual(api.calls.post[0].path, `/leaderboards/${GAME_SLUG}/runs`);
    assertEqual(api.calls.post[0].body.boardId, QUARTER);
    assertEqual(api.calls.post[0].body.value, 12040);
    assertEqual(api.calls.post[0].body.modelId, "kaido-gts");
    assertEqual(api.calls.post[0].body.inputLog.length, 1);
  });
});

await asyncTest("a run with no log omits the field rather than claiming an empty one", async () => {
  await withStorage(fakeStorage(), async () => {
    const api = fakeApi();
    createRecordsStore({ session: signedIn, api }).submit(run());
    await flush();
    assertEqual("inputLog" in api.calls.post[0].body, false);
  });
});

await asyncTest("a run that is not a best is never submitted", async () => {
  await withStorage(fakeStorage(), async () => {
    const api = fakeApi();
    const store = createRecordsStore({ session: signedIn, api });
    store.submit(run({ value: 12040 }));
    await flush();
    store.submit(run({ value: 12380 }));
    await flush();
    assertEqual(api.calls.post.length, 1, "only the best went to the board");
  });
});

await asyncTest("a failed submission keeps the best and retries from the game loop", async () => {
  await withStorage(fakeStorage(), async () => {
    const api = fakeApi({ failPost: true });
    const store = createRecordsStore({ session: signedIn, api });
    store.submit(run());
    await flush();

    // The player beat their own time. That must survive the network failing.
    assertEqual(store.records[QUARTER].value, 12040);
    assertEqual(store.status, STATUS_ERROR);
    assert(store.dirty, "the run is still owed to the board");

    api.setFailing(false);
    store.tick(60); // past the first backoff step
    await flush();
    assertEqual(store.dirty, false);
    assertEqual(store.status, STATUS_IDLE);
  });
});

await asyncTest("a better run mid-failure replaces the pending one rather than queuing behind it", async () => {
  await withStorage(fakeStorage(), async () => {
    const api = fakeApi({ failPost: true });
    const store = createRecordsStore({ session: signedIn, api });
    store.submit(run({ value: 12380 }));
    await flush();
    store.submit(run({ value: 12040 }));
    await flush();

    api.setFailing(false);
    store.tick(60);
    await flush();

    // An older pending run has nothing left to contribute once a better one on
    // the same board exists.
    const sent = api.calls.post.filter((call) => !call.failed);
    assertEqual(sent[sent.length - 1].body.value, 12040);
    assertEqual(store.dirty, false);
  });
});

await asyncTest("the server's verdict overrides the local one", async () => {
  await withStorage(fakeStorage(), async () => {
    // The board may hold a better run from another machine. Its answer is folded
    // back in, so the cabinet stops claiming a record the board rejected.
    const api = fakeApi({
      reply: () => ({ ok: true, improved: false, record: { boardId: QUARTER, value: 11924, verified: true } }),
    });
    const store = createRecordsStore({ session: signedIn, api });
    store.submit(run({ value: 12040 }));
    await flush();
    assertEqual(store.records[QUARTER].value, 11924);
    assertEqual(store.records[QUARTER].verified, true);
  });
});

// ---------------------------------------------------------------------------
// Loading

await asyncTest("load merges the server's records over the local ones, per board", async () => {
  await withStorage(fakeStorage(), async () => {
    // Neither side simply wins: the server can be behind on a run set offline,
    // and the local copy can be behind on one set from another machine.
    const api = fakeApi({
      records: [
        { boardId: QUARTER, value: 11924, verified: true },
        { boardId: SPRINT, value: 240000, verified: true },
      ],
    });
    const store = createRecordsStore({ session: signedIn, api });
    store.submit(run({ value: 12040 }));
    store.submit({ boardId: SPRINT, modeId: MODE_TIME_ATTACK, value: 260000 });
    await flush();

    await store.load();
    assertEqual(store.records[QUARTER].value, 11924, "the server's faster quarter wins");
    assertEqual(store.records[SPRINT].value, 260000, "the local longer sprint wins");
  });
});

await asyncTest("a local best the server has never seen is submitted on load", async () => {
  await withStorage(fakeStorage(), async () => {
    const storage = fakeStorage();
    await withStorage(storage, async () => {
      // Set while the push was failing, so it never reached the board.
      const offline = createRecordsStore({ session: signedIn, api: fakeApi({ failPost: true }) });
      offline.submit(run());
      await flush();
    });

    await withStorage(storage, async () => {
      const api = fakeApi({ records: [] });
      const store = createRecordsStore({ session: signedIn, api });
      await store.load();
      await flush();
      assertEqual(api.calls.post.length, 1, "the orphaned best reaches the board");
      assertEqual(api.calls.post[0].body.value, 12040);
    });
  });
});

await asyncTest("signed out, load is a no-op that still answers with the local set", async () => {
  await withStorage(fakeStorage(), async () => {
    const store = createRecordsStore({ session: signedOut });
    store.submit(run());
    const loaded = await store.load();
    assertEqual(loaded[QUARTER].value, 12040, "a complete answer, not a degraded one");
  });
});

await asyncTest("a failed load leaves the local records intact", async () => {
  await withStorage(fakeStorage(), async () => {
    const store = createRecordsStore({ session: signedIn, api: fakeApi({ failGet: true }) });
    store.submit(run());
    await store.load();
    assertEqual(store.records[QUARTER].value, 12040);
    assertEqual(store.status, STATUS_ERROR);
  });
});

// ---------------------------------------------------------------------------
// The global board — public reads, fetched lazily

const board = (entries) => () => ({ board: { id: QUARTER, entries } });

await asyncTest("a global board is readable signed out", async () => {
  // The board routes are public by design: a personal best is a boast, and the
  // auth exists only so a submitted run is attributable. Gating the fetch on
  // sign-in would hide the board from exactly the players most likely to look.
  await withStorage(fakeStorage(), async () => {
    const api = fakeApi({ boards: board([{ playerId: "ace", rank: 1, value: 11924 }]) });
    const store = createRecordsStore({ session: signedOut, api });
    assertEqual(store.ranked, false, "still not ranked — that half is unchanged");
    await store.requestBoard(QUARTER);
    assertEqual(store.boardStatus(QUARTER), BOARD_READY);
    assertEqual(store.boardStandings(QUARTER).entries.length, 1);
  });
});

await asyncTest("a board is asked for once and then kept", async () => {
  await withStorage(fakeStorage(), async () => {
    const api = fakeApi({ boards: board([]) });
    const store = createRecordsStore({ session: signedOut, api });
    await store.requestBoard(QUARTER);
    assertEqual(await store.requestBoard(QUARTER), false, "a second ask starts nothing");
    assertEqual(api.calls.get.length, 1);
    // Walking the strip and coming back must not flicker through loading again.
    await store.requestBoard(SPRINT);
    assertEqual(api.calls.get.length, 2);
    await store.requestBoard(QUARTER);
    assertEqual(api.calls.get.length, 2);
  });
});

await asyncTest("a board that could not be reached is an error, not an empty board", async () => {
  // "Nobody has set a time yet" printed over a network fault is exactly the
  // wrong conclusion, and `requestJson` returns null rather than throwing — so
  // this is the branch that is easy to get wrong.
  await withStorage(fakeStorage(), async () => {
    const store = createRecordsStore({ session: signedOut, api: fakeApi({ boards: () => null }) });
    await store.requestBoard(QUARTER);
    assertEqual(store.boardStatus(QUARTER), BOARD_ERROR);
    // Retried on the next ask rather than on a timer: the player is looking at
    // this screen, so their next tab press is a better trigger than a clock.
    assertEqual(await store.requestBoard(QUARTER), true);
  });
});

await asyncTest("with no platform configured the board says so rather than erroring", async () => {
  await withStorage(fakeStorage(), async () => {
    const store = createRecordsStore({ session: signedOut, api: { isConfigured: false, get: async () => null } });
    await store.requestBoard(QUARTER);
    assertEqual(store.boardStatus(QUARTER), BOARD_OFFLINE);
  });
});

await asyncTest("a rank is derived from the boards already in hand", async () => {
  // Deliberately not seven requests on opening the screen: a rank the player has
  // not looked the board up for is worth less than the round trips.
  await withStorage(fakeStorage(), async () => {
    const api = fakeApi({
      boards: board([
        { playerId: "ace", rank: 1, value: 11924 },
        { playerId: "player-1", rank: 2, value: 12040 },
      ]),
    });
    const store = createRecordsStore({ session: signedIn, api });
    assertEqual(Object.keys(store.boardRanks()).length, 0, "nothing fetched, nothing to rank against");
    await store.requestBoard(QUARTER);
    assertEqual(store.boardRanks()[QUARTER], 2);
    assertEqual(store.boardRanks()[SPRINT], undefined);
  });
});

await asyncTest("a signed-out viewer is nobody on the board", async () => {
  // The signed-out player id is empty, and every row would otherwise match it.
  await withStorage(fakeStorage(), async () => {
    const api = fakeApi({ boards: board([{ playerId: "", rank: 1, value: 11924 }]) });
    const store = createRecordsStore({ session: signedOut, api });
    await store.requestBoard(QUARTER);
    assertEqual(Object.keys(store.boardRanks()).length, 0);
  });
});

finish();
