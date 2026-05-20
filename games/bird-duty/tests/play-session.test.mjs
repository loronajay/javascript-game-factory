import {
  GAME_OVER_TICKS,
  SHOTS_PER_RUN,
  addScore,
  createPlaySession,
  fireShot,
  shouldReturnToMenu,
  updatePlaySession,
} from "../scripts/play-session.js";

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

test("single player run starts with ten shots and zero score", () => {
  const session = createPlaySession();

  assertEqual(session.phase, "running");
  assertEqual(session.shotsRemaining, SHOTS_PER_RUN);
  assertEqual(session.score, 0);
});

test("play session can start with a custom shot count", () => {
  const session = createPlaySession({ shotsPerRun: 5 });

  assertEqual(session.shotsRemaining, 5);
});

test("firing a shot decrements shots remaining", () => {
  const session = fireShot(createPlaySession());

  assertEqual(session.shotsRemaining, SHOTS_PER_RUN - 1);
});

test("score increments by hit value", () => {
  const session = addScore(createPlaySession(), 3);

  assertEqual(session.score, 3);
});

test("shots do not decrement below zero", () => {
  let session = createPlaySession();
  for (let i = 0; i < SHOTS_PER_RUN + 2; i++) {
    session = fireShot(session);
  }

  assertEqual(session.shotsRemaining, 0);
});

test("game over waits until the final poop is gone", () => {
  let session = createPlaySession();
  for (let i = 0; i < SHOTS_PER_RUN; i++) session = fireShot(session);

  const airborne = updatePlaySession(session, { phase: "airborne" });
  const splat = updatePlaySession(session, { phase: "splat" });
  const done = updatePlaySession(session, { phase: "inactive" });

  assertEqual(airborne.phase, "running");
  assertEqual(splat.phase, "running");
  assertEqual(done.phase, "game-over");
  assertEqual(done.finalScore, 0);
});

test("game over remains visible briefly before returning to menu", () => {
  assertEqual(GAME_OVER_TICKS, 240);

  let session = { ...createPlaySession(), shotsRemaining: 0 };
  session = updatePlaySession(session, { phase: "inactive" });

  for (let i = 0; i < GAME_OVER_TICKS - 1; i++) {
    session = updatePlaySession(session, { phase: "inactive" });
    assertEqual(shouldReturnToMenu(session), false);
  }

  session = updatePlaySession(session, { phase: "inactive" });
  assertEqual(shouldReturnToMenu(session), true);
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
