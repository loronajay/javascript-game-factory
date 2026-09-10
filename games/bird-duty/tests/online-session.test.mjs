import {
  ONLINE_INPUT_MESSAGE,
  createOnlineSession,
  inputPayloadFrom,
  inputPayloadsDiffer,
} from "../scripts/online-session.js";
import { createMatchSimState, serializeMatchSim, tickMatchSim } from "../scripts/sim/match-sim.js";
import { NPC_DEFINITIONS } from "../scripts/sim/npcs.js";

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

function assert(condition, message) {
  if (!condition) throw new Error(message || "expected truthy");
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `expected ${actual} to equal ${expected}`);
}

const PLAYERS = [
  { clientId: "me", name: "Me" },
  { clientId: "them", name: "Them" },
];

/** A real server snapshot, produced by the same sim the server runs. */
function serverSnapshot({ ticks = 1, inputs = { me: { drop: true } } } = {}) {
  let sim = createMatchSimState({ players: PLAYERS });
  for (let i = 0; i < ticks; i += 1) sim = tickMatchSim(sim, inputs);
  const { snapshot } = serializeMatchSim(sim);
  return { ...snapshot, activeClientId: "me" };
}

function fakeSounds() {
  const played = [];
  return { played, play: (name) => played.push(name) };
}

test("the client vocabulary is exactly three booleans", () => {
  const payload = inputPayloadFrom({ left: true, right: false, dropHeld: true, dropRequested: true, score: 99 });

  assertEqual(Object.keys(payload).sort().join(","), "drop,left,right");
  assertEqual(payload.left, true);
  assertEqual(payload.drop, true, "the held flag is what travels, not the edge");
});

test("the drop edge is never sent — the server finds it", () => {
  // dropRequested is a local, one-frame thing. Sending it would let a client fire by repeating it.
  const payload = inputPayloadFrom({ dropRequested: true, dropHeld: false });

  assertEqual(payload.drop, false);
});

test("input is only sent when it changes", () => {
  const sent = [];
  const client = { sendInput: (payload) => sent.push(payload) };
  const session = createOnlineSession();

  assertEqual(session.sendInput(client, { right: true }), true);
  assertEqual(session.sendInput(client, { right: true }), false, "a held key costs one message");
  assertEqual(session.sendInput(client, { right: true, dropHeld: true }), true);
  assertEqual(sent.length, 2);
});

test("inputPayloadsDiffer notices each flag on its own", () => {
  const base = { left: false, right: false, drop: false };

  assertEqual(inputPayloadsDiffer(base, { ...base }), false);
  assertEqual(inputPayloadsDiffer(base, { ...base, left: true }), true);
  assertEqual(inputPayloadsDiffer(base, { ...base, drop: true }), true);
  assertEqual(inputPayloadsDiffer(null, base), true);
});

test("a snapshot becomes the world wholesale", () => {
  const session = createOnlineSession();
  const snapshot = serverSnapshot({ ticks: 5 });

  assertEqual(session.applySnapshot(snapshot), true);
  assertEqual(session.match.players.length, 2);
  assertEqual(session.world.player.x, snapshot.world.player.x);
  assertEqual(session.activeClientId, "me");
  assertEqual(session.isMyTurn("me"), true);
  assertEqual(session.isMyTurn("them"), false);
});

test("a stale snapshot never rewinds the match", () => {
  const session = createOnlineSession();
  const later = serverSnapshot({ ticks: 30 });
  const earlier = serverSnapshot({ ticks: 5 });

  session.applySnapshot(later);
  assertEqual(session.applySnapshot(earlier), false);
  assertEqual(session.snapshot.tick, later.tick);
});

test("junk off the wire is refused rather than drawn", () => {
  const session = createOnlineSession();

  assertEqual(session.applySnapshot(null), false);
  assertEqual(session.applySnapshot("nope"), false);
  assertEqual(session.world, null);
});

test("the voice lines a client plays are the ones the server named", () => {
  const sounds = fakeSounds();
  const session = createOnlineSession({ sounds });

  session.applySnapshot({ ...serverSnapshot(), sounds: ["poopRelease", NPC_DEFINITIONS.sanjeet.sound] });

  assertEqual(sounds.played.join(","), "poopRelease,sanjeet");
  assertEqual(sounds.played.includes("alan"), false, "never a stand-in line");
});

test("a snapshot with no sounds plays nothing", () => {
  const sounds = fakeSounds();
  const session = createOnlineSession({ sounds });

  session.applySnapshot({ ...serverSnapshot(), sounds: [] });

  assertEqual(sounds.played.length, 0);
});

test("prediction moves the walkers between snapshots", () => {
  const session = createOnlineSession();
  session.applySnapshot(serverSnapshot({ ticks: 40 }));
  assert(session.world.npcs.entities.length > 0, "the fixture needs walkers on screen");

  const before = session.world.npcs.entities.map((npc) => npc.x);
  session.predict({}, "me");
  const after = session.world.npcs.entities.map((npc) => npc.x);

  assert(before.some((x, i) => x !== after[i]), "walkers must keep walking between snapshots");
});

test("prediction never spawns or despawns anybody", () => {
  const session = createOnlineSession();
  session.applySnapshot(serverSnapshot({ ticks: 40 }));
  const count = session.world.npcs.entities.length;

  for (let i = 0; i < 30; i += 1) session.predict({}, "me");

  assertEqual(session.world.npcs.entities.length, count, "only the server's tick may add or remove");
});

test("prediction never scores", () => {
  const session = createOnlineSession();
  session.applySnapshot(serverSnapshot({ ticks: 40 }));
  const scores = JSON.stringify(session.match.scores);

  for (let i = 0; i < 60; i += 1) session.predict({ right: true }, "me");

  assertEqual(JSON.stringify(session.match.scores), scores, "a client cannot move its own score");
});

test("prediction never makes a sound", () => {
  const sounds = fakeSounds();
  const session = createOnlineSession({ sounds });
  session.applySnapshot({ ...serverSnapshot({ ticks: 40 }), sounds: [] });

  for (let i = 0; i < 120 && session.world; i += 1) session.predict({}, "me");

  assertEqual(sounds.played.length, 0, "only a snapshot plays a line");
});

test("a client predicts its own bird on its own turn and nobody else's", () => {
  const mine = createOnlineSession();
  mine.applySnapshot(serverSnapshot({ ticks: 40 }));
  const startX = mine.world.player.x;
  for (let i = 0; i < 5; i += 1) mine.predict({ right: true }, "me");
  assert(mine.world.player.x > startX, "my own bird follows my keys immediately");

  const theirs = createOnlineSession();
  theirs.applySnapshot(serverSnapshot({ ticks: 40 }));
  const watchedX = theirs.world.player.x;
  for (let i = 0; i < 5; i += 1) theirs.predict({ right: true }, "them");

  assertEqual(theirs.world.player.x, watchedX, "a spectator never invents the active player's input");
});

test("prediction stops outside the playing phase", () => {
  const session = createOnlineSession();
  // A fresh match is READY: nothing should move behind the overlay.
  session.applySnapshot(serverSnapshot({ ticks: 0, inputs: {} }));
  const before = JSON.stringify(session.world);

  session.predict({ right: true }, "me");

  assertEqual(JSON.stringify(session.world), before);
});

test("prediction before any snapshot is a no-op rather than a crash", () => {
  const session = createOnlineSession();
  session.predict({ right: true }, "me");

  assertEqual(session.world, null);
  assertEqual(session.match, null);
});

test("a session can be reset for the next match", () => {
  const session = createOnlineSession();
  session.applySnapshot(serverSnapshot({ ticks: 20 }));
  session.reset();

  assertEqual(session.snapshot, null);
  assertEqual(session.world, null);
  assertEqual(session.ended, false);
  // A fresh session must send the first input of the next match even if it repeats the last one.
  const sent = [];
  assertEqual(session.sendInput({ sendInput: (p) => sent.push(p) }, {}), true);
});

test("the match-ended snapshot marks the session finished", () => {
  const session = createOnlineSession();
  session.applySnapshot(serverSnapshot({ ticks: 10 }), { ended: true });

  assertEqual(session.ended, true);
});

test("the wire message names are the ones the server handles", () => {
  assertEqual(ONLINE_INPUT_MESSAGE, "bird_duty_input");
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
