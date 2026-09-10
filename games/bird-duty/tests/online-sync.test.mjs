import {
  MAX_ONLINE_SOUND_EVENTS,
  createOnlineSoundQueue,
  getNpcSoundKey,
  playOnlineSoundEvents,
  queueOnlineNpcHitSounds,
  queueOnlineSound,
  readOnlineSoundEvents,
} from "../scripts/sim/online-sync.js";
import { NPC_DEFINITIONS, advanceNpcEntities, createNpcEntity } from "../scripts/sim/npcs.js";
import { readFileSync } from "node:fs";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
    passed++;
  } catch (error) {
    console.log(`FAIL ${name}: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `expected ${actual} to equal ${expected}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(message || `expected ${a} to equal ${b}`);
}

test("every NPC definition maps to its own voice line", () => {
  for (const [type, def] of Object.entries(NPC_DEFINITIONS)) {
    assertEqual(getNpcSoundKey(type), def.sound, `${type} should resolve its own sound`);
  }
  assertEqual(getNpcSoundKey("nobody"), null);
});

test("hit sounds queue the voice line of each NPC actually hit", () => {
  const queue = queueOnlineNpcHitSounds(createOnlineSoundQueue(), ["sanjeet", "bryan"]);
  assertDeepEqual(queue, ["sanjeet", "bryan"]);
});

test("queued sounds accumulate across ticks and never mutate the input queue", () => {
  const first = queueOnlineSound(createOnlineSoundQueue(), "poopRelease");
  const second = queueOnlineNpcHitSounds(first, ["anna"]);
  const third = queueOnlineSound(second, "splat");

  assertDeepEqual(first, ["poopRelease"]);
  assertDeepEqual(third, ["poopRelease", "anna", "splat"]);
});

test("queueing ignores empty names and caps runaway queues", () => {
  assertDeepEqual(queueOnlineSound(createOnlineSoundQueue(), ""), []);
  assertDeepEqual(queueOnlineSound(createOnlineSoundQueue(), null), []);

  let queue = createOnlineSoundQueue();
  for (let i = 0; i < MAX_ONLINE_SOUND_EVENTS + 5; i += 1) {
    queue = queueOnlineSound(queue, "splat");
  }
  assertEqual(queue.length, MAX_ONLINE_SOUND_EVENTS);
});

test("snapshots without sound events are read as empty rather than guessed", () => {
  assertDeepEqual(readOnlineSoundEvents(null), []);
  assertDeepEqual(readOnlineSoundEvents({}), []);
  assertDeepEqual(readOnlineSoundEvents({ sounds: "splat" }), []);
  assertDeepEqual(readOnlineSoundEvents({ sounds: ["splat", 7, "", "anna"] }), ["splat", "anna"]);
});

test("a client plays exactly the voice lines the host recorded, in order", () => {
  const played = [];
  const sounds = { play: (name) => played.push(name) };

  playOnlineSoundEvents(sounds, { sounds: ["poopRelease", "sanjeet", "splat"] });

  assertDeepEqual(played, ["poopRelease", "sanjeet", "splat"]);
});

test("a client hitting a non-alan target never hears alan", () => {
  const played = [];
  const sounds = { play: (name) => played.push(name) };
  const hostQueue = queueOnlineNpcHitSounds(createOnlineSoundQueue(), ["sanjeetFast"]);

  playOnlineSoundEvents(sounds, { sounds: hostQueue });

  assertDeepEqual(played, ["sanjeetFast"]);
  assertEqual(played.includes("alan"), false);
});

test("a client hearing two NPCs hit by one poop plays both lines", () => {
  const played = [];
  const sounds = { play: (name) => played.push(name) };

  playOnlineSoundEvents(sounds, { sounds: queueOnlineNpcHitSounds(createOnlineSoundQueue(), ["john", "bryan"]) });

  assertDeepEqual(played, ["john", "bryan"]);
});

test("advanceNpcEntities moves entities without spawning or despawning", () => {
  const entities = [createNpcEntity("alan", 1), createNpcEntity("john", 2)];
  const next = advanceNpcEntities(entities);

  assertEqual(next.length, 2);
  assertEqual(next[0].x, entities[0].x + NPC_DEFINITIONS.alan.speed);
  assertEqual(next[1].x, entities[1].x - NPC_DEFINITIONS.john.speed);
  assertEqual(next[0].animationTick, 1);
  assertEqual(entities[0].animationTick, 0, "input entities stay untouched");
});

test("advanceNpcEntities tolerates an empty or missing entity list", () => {
  assertDeepEqual(advanceNpcEntities([]), []);
  assertDeepEqual(advanceNpcEntities(), []);
});

test("no client guesses a voice line from a score delta", () => {
  // The bug this whole seam exists for: a client used to infer that *something* was hit from the
  // score going up, and had no way to know what, so it hardcoded Alan's line for every target.
  const game = readFileSync(new URL("../game.js", import.meta.url), "utf8");
  const session = readFileSync(new URL("../scripts/online-session.js", import.meta.url), "utf8");

  assertEqual(game.includes('sounds.playNpcHit("alan")'), false, "no hardcoded stand-in line");
  assertEqual(/scoreTotal|scoreDelta/.test(session), false, "a client must not infer sounds from the score");
  assertEqual(
    session.includes("playOnlineSoundEvents(sounds, next)"),
    true,
    "a client plays exactly the lines the server named",
  );
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
