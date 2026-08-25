import { suite, test, assert, assertEqual, assertClose, finish } from "./harness.js";

import {
  BALL_RADIUS_WORLD,
  CEILING_Y,
  GRAVITY,
  HOOP_BASE_RIM_Y,
  HOOP_BASE_X,
  REFERENCE_POWER,
  RIM_CENTER_Z,
  TICK_SECONDS,
} from "../scripts/sim/constants.js";
import { hoopAt } from "../scripts/sim/hoop.js";
import { solveLaunch, launchSpin } from "../scripts/sim/launch.js";
import { createBall, isBallSettled, launchBall, stepBall, worldFor } from "../scripts/sim/physics.js";
import { detectMadeBasket, resolveCeilingContact, resolveRimContact } from "../scripts/sim/collision.js";
import { hoopWorldState } from "../scripts/sim/hoop.js";

suite("physics — integration order, collision, and the shot that must keep going in");

const BALL = "basketball";
const centreAim = { x: HOOP_BASE_X, y: HOOP_BASE_RIM_Y + 2 };

/**
 * Fire a shot and run it to a conclusion. Returns what happened, which is how
 * every behavioural assertion below is phrased — nothing here reaches into the
 * middle of a flight.
 */
function shoot({ power = REFERENCE_POWER, loft = 1, aim = centreAim, mode = "still", maxTicks = 400 } = {}) {
  const ball = createBall();
  const launch = solveLaunch({ origin: { x: ball.x, y: ball.y, z: ball.z }, aim, power, loft });
  launchBall(ball, launch, launchSpin(launch));

  const contacts = [];
  let scored = false;
  let ticks = 0;

  for (; ticks < maxTicks; ticks++) {
    const hoop = hoopAt(mode, ticks * TICK_SECONDS);
    const result = stepBall(ball, worldFor(hoop), TICK_SECONDS, { ballId: BALL, alreadyScored: scored });
    contacts.push(...result.contacts);
    if (result.scored) scored = true;
    if (isBallSettled(ball)) break;
  }

  return { ball, scored, contacts, ticks, launch };
}

// ---------------------------------------------------------------------------
// The shot that defines the game
// ---------------------------------------------------------------------------

test("the calibrated reference shot goes in", () => {
  // This is the golden case. If it ever fails, the shot feel has moved and that
  // is a product decision, not a test to relax.
  const { scored } = shoot({ power: REFERENCE_POWER, loft: 1 });
  assert(scored, "an 80% straight-back pull at the centre must be a bucket");
});

test("the reference shot goes in cleanly, without needing a rim bounce to save it", () => {
  const { contacts } = shoot({ power: REFERENCE_POWER, loft: 1 });
  assertEqual(contacts.indexOf("score"), contacts.findIndex((c) => c === "score"));
  assert(!contacts.slice(0, contacts.indexOf("score")).includes("rim"), "a swish, not a lucky rattle");
});

test("under-powered shots come up short and stay out", () => {
  for (const power of [0.45, 0.5, 0.6, 0.7]) {
    assert(!shoot({ power }).scored, `${power} must not go in`);
  }
});

test("an over-powered shot can still bank in, but never cleanly", () => {
  // Overpowering is forgiven by the ROOM rather than by the solver — the ball
  // arrives above the rim and caroms down through it. Worth pinning: it is the
  // cabinet's only 'lucky' shot, and it has to stay a carom.
  //
  // Which surface does the forgiving is deliberately NOT pinned. It used to be
  // the back wall; since the room got a ceiling this shot clips that first and
  // comes down onto the rim instead. Both are the same thing happening and the
  // make rate barely moved (see `tools/make-rate.mjs`), so naming the surface
  // here would be pinning an accident of the arc rather than the rule.
  const hard = shoot({ power: 1 });
  assert(hard.scored, "a hard shot bouncing round the room does drop");
  const scoredAt = hard.contacts.indexOf("score");
  assert(scoredAt > 0, "the make comes after a contact, not before one");
  assert(
    hard.contacts.slice(0, scoredAt).some((contact) => ["wall", "backboard", "ceiling", "rim"].includes(contact)),
    "and the room, not the solver, is what saved it",
  );
});

test("the ceiling forgives a heave that is over-powered, not one that is badly aimed", () => {
  // The guard on the change above: a ceiling that turned every wild throw into
  // a bucket would be an aim assist bolted to the roof.
  const heave = shoot({ power: 1, loft: 0.35, aim: { x: 520, y: 200 } });
  assert(heave.contacts.includes("ceiling"), "this shot is only interesting if it does hit the ceiling");
  assert(!heave.scored, "and it must still miss");
});

// ---------------------------------------------------------------------------
// The room is closed
// ---------------------------------------------------------------------------

test("a hard enough shot finds the ceiling", () => {
  // Before the ceiling existed the ball simply left the room on a full-power
  // heave and came back down through where the paint says the ceiling is. If
  // this ever stops reporting a contact the collider has been unhooked, or the
  // ceiling has drifted up out of reach of any shot the player can actually
  // throw — either way it has stopped being a room.
  const { contacts } = shoot({ power: 1, loft: 0.35, aim: { x: 520, y: 200 } });
  assert(contacts.includes("ceiling"), "a full-power flat heave must hit the ceiling");
});

test("nothing the player can throw leaves the room", () => {
  const limit = CEILING_Y - BALL_RADIUS_WORLD;
  for (const power of [0.8, 0.9, 1]) {
    for (const loft of [0, 0.35, 0.7, 1]) {
      for (const aim of [{ x: 340, y: 190 }, centreAim, { x: 620, y: 190 }]) {
        const ball = createBall();
        const launch = solveLaunch({ origin: { x: ball.x, y: ball.y, z: ball.z }, aim, power, loft });
        launchBall(ball, launch, launchSpin(launch));
        let scored = false;
        for (let tick = 0; tick < 400; tick++) {
          const result = stepBall(ball, worldFor(hoopAt("still", tick * TICK_SECONDS)), TICK_SECONDS, {
            ballId: BALL,
            alreadyScored: scored,
          });
          if (result.scored) scored = true;
          assert(
            ball.y <= limit + 1e-9,
            `power ${power} loft ${loft} aim ${aim.x} reached y=${ball.y.toFixed(3)}, past the ceiling at ${limit.toFixed(3)}`,
          );
          if (isBallSettled(ball)) break;
        }
      }
    }
  }
});

test("the ceiling sends the ball back down, and never holds or lifts it", () => {
  const ball = createBall();
  Object.assign(ball, { y: CEILING_Y, vy: 3.1, vx: 0.4, vz: 1.2 });
  const contact = resolveCeilingContact(ball);

  assertEqual(contact, "ceiling");
  assert(ball.y < CEILING_Y, "the ball must be left clear of the plane, not inside it");
  assert(ball.vy < 0, "a ball off the ceiling is on its way down");
  assert(Math.abs(ball.vy) < 3.1, "and slower than it arrived — a ceiling adds no energy");
  assert(ball.vz > 0 && ball.vz < 1.2, "it keeps most of its depth speed and scrubs some");
});

test("the ceiling resolver never touches a ball nowhere near it", () => {
  // The mirror of the rim's own guard. A resolver that quietly corrects a ball
  // it is not in contact with is the hardest kind of physics bug to see.
  const ball = createBall();
  Object.assign(ball, { y: 1.2, vy: 4 });
  const before = { ...ball };
  assertEqual(resolveCeilingContact(ball), null);
  assertEqual(ball.y, before.y);
  assertEqual(ball.vy, before.vy);
});

test("a moving hoop has to be led — the same shot that swishes a still rim misses it", () => {
  // This is the entire point of the moving modes. The reticle never tracks the
  // rim, so a centre-aimed shot at a travelling hoop must miss.
  assert(shoot({ mode: "still" }).scored, "the still rim is makeable dead centre");
  assert(!shoot({ mode: "horizontal" }).scored, "left/right must not be makeable dead centre");
  assert(!shoot({ mode: "circle" }).scored, "circle must not be makeable dead centre");
});

test("leading a moving hoop by where it will actually be makes the shot", () => {
  // The rim travels ~108px right during a reference flight, so that is the lead.
  const led = (mode, aimX) => shoot({ mode, aim: { x: aimX, y: HOOP_BASE_RIM_Y + 2 } }).scored;
  assert(led("horizontal", HOOP_BASE_X + 108), "leading left/right by its travel scores");
  assert(led("circle", HOOP_BASE_X - 75), "leading the orbit by its travel scores");
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test("identical input produces a bit-identical flight", () => {
  // The sim reads no clock and no randomness, which is what would let a run be
  // replayed or verified later.
  const a = shoot();
  const b = shoot();
  assertEqual(a.ball.x, b.ball.x);
  assertEqual(a.ball.y, b.ball.y);
  assertEqual(a.ball.z, b.ball.z);
  assertEqual(a.ticks, b.ticks);
  assertEqual(a.contacts.join(","), b.contacts.join(","));
});

// ---------------------------------------------------------------------------
// Integration
// ---------------------------------------------------------------------------

test("a dropped ball accelerates under gravity at the documented rate", () => {
  const ball = createBall();
  // Dropped from mid-room. It used to start at y=3, which is outside the room
  // now that there is a ceiling — the integration this is about has to be
  // measured somewhere the colliders are not.
  ball.y = CEILING_Y / 2;
  const hoop = hoopAt("still", 0);
  stepBall(ball, worldFor(hoop), TICK_SECONDS, { ballId: BALL });
  assertClose(ball.vy, -GRAVITY * TICK_SECONDS, 1e-9);
});

test("substepping does not change where gravity puts the ball", () => {
  // The substep count is an accuracy device, not a speed control. A tick must
  // integrate to the same velocity however finely it is sliced.
  const coarse = createBall();
  coarse.y = CEILING_Y / 2;
  const fine = createBall();
  fine.y = CEILING_Y / 2;
  const world = worldFor(hoopAt("still", 0));
  stepBall(coarse, world, TICK_SECONDS, { ballId: BALL });
  for (let i = 0; i < 4; i++) stepBall(fine, world, TICK_SECONDS / 4, { ballId: BALL });
  assertClose(coarse.vy, fine.vy, 1e-9, "velocity must not depend on slicing");
});

test("a fast ball cannot tunnel through the rim between substeps", () => {
  // Fired straight down the middle at a speed that covers more than a ball
  // diameter per tick. The plane-crossing test is what catches it.
  const ball = createBall();
  const hoop = hoopAt("still", 0);
  const world = worldFor(hoop);
  const rim = world.hoopWorld;
  ball.x = rim.rimX;
  ball.z = rim.rimZ;
  ball.y = rim.rimY + 0.3;
  // At this speed a single substep moves the ball 0.24 world units — further
  // than its own diameter (2 * BALL_RADIUS_WORLD = 0.156). A proximity test
  // would step clean over the ring and see nothing.
  ball.vy = -30;
  assert(Math.abs(ball.vy) * 0.008 > 2 * BALL_RADIUS_WORLD, "the test must actually be in the tunnelling regime");
  const { scored } = stepBall(ball, world, TICK_SECONDS, { ballId: BALL });
  assert(scored, "a ball dropped straight through the ring must register");
});

// ---------------------------------------------------------------------------
// Collision behaviour
// ---------------------------------------------------------------------------

test("the ball never comes to rest inside the floor", () => {
  const { ball } = shoot({ power: 0.5 });
  assert(ball.y >= BALL_RADIUS_WORLD - 1e-6, `settled at y=${ball.y}`);
});

test("a ball resting on the floor stays there instead of jittering upward", () => {
  const ball = createBall();
  ball.y = BALL_RADIUS_WORLD;
  ball.vy = 0;
  const world = worldFor(hoopAt("still", 0));
  for (let i = 0; i < 60; i++) stepBall(ball, world, TICK_SECONDS, { ballId: BALL });
  assertClose(ball.y, BALL_RADIUS_WORLD, 1e-9);
});

test("the rim resolver never pushes a ball it is not touching", () => {
  const hoopWorld = hoopWorldState(hoopAt("still", 0));
  const ball = createBall();
  ball.x = hoopWorld.rimX + 3;
  ball.y = hoopWorld.rimY;
  ball.z = hoopWorld.rimZ;
  const before = { ...ball };
  assertEqual(resolveRimContact(ball, hoopWorld), null);
  assertEqual(ball.x, before.x, "a distant ball must not be moved");
  assertEqual(ball.vx, before.vx);
});

test("a ball already separating from the rim is not bounced a second time", () => {
  const hoopWorld = hoopWorldState(hoopAt("still", 0));
  const ball = createBall();
  // Sitting on the near edge of the ring, overlapping, but moving away from it.
  ball.x = hoopWorld.rimX;
  ball.z = hoopWorld.rimZ - 0.22;
  ball.y = hoopWorld.rimY + 0.05;
  ball.vy = 4;
  const before = ball.vy;
  resolveRimContact(ball, hoopWorld);
  assert(ball.vy <= before + 1e-9, "an outgoing ball must not gain energy");
});

test("a rising ball passing up through the rim is not a basket", () => {
  const hoopWorld = hoopWorldState(hoopAt("still", 0));
  const ball = createBall();
  ball.x = hoopWorld.rimX;
  ball.z = hoopWorld.rimZ;
  ball.y = hoopWorld.rimY + 0.01;
  ball.vy = 5;
  const previous = { x: ball.x, y: hoopWorld.rimY - 0.01, z: ball.z };
  assert(!detectMadeBasket(ball, previous, hoopWorld), "you cannot score from underneath");
});

test("a ball descending outside the ring is not a basket", () => {
  const hoopWorld = hoopWorldState(hoopAt("still", 0));
  const ball = createBall();
  ball.x = hoopWorld.rimX + 0.5;
  ball.z = hoopWorld.rimZ;
  ball.y = hoopWorld.rimY - 0.01;
  ball.vy = -5;
  const previous = { x: ball.x, y: hoopWorld.rimY + 0.01, z: ball.z };
  assert(!detectMadeBasket(ball, previous, hoopWorld));
});

test("a made ball is committed downward and cannot climb back out", () => {
  const { ball, scored } = shoot();
  assert(scored);
  assert(ball.y < HOOP_BASE_RIM_Y, "the made ball ended up below the rim");
});

// ---------------------------------------------------------------------------
// Spin
// ---------------------------------------------------------------------------

test("a ball thrown at the hoop rolls forward, and the phase advances with it", () => {
  const ball = createBall();
  const launch = solveLaunch({ origin: { ...ball }, aim: centreAim, power: REFERENCE_POWER, loft: 1 });
  launchBall(ball, launch, launchSpin(launch));
  const world = worldFor(hoopAt("still", 0));
  stepBall(ball, world, TICK_SECONDS, { ballId: BALL });
  assert(ball.rollPhase > 0, "forward flight must advance the roll");
});

test("a ball's roll phase advances at its own frame rate, per ball", () => {
  // The same physical spin must walk 12 basketball frames and 8 paper frames in
  // one rotation — this is the whole reason frame count lives in the catalog.
  const spin = 6;
  const world = worldFor(hoopAt("still", 0));
  const phases = ["basketball", "paper"].map((ballId) => {
    const ball = createBall();
    ball.y = 5;
    ball.omegaX = spin;
    stepBall(ball, world, TICK_SECONDS, { ballId });
    return ball.rollPhase;
  });
  assert(phases[0] > phases[1], "the 12-frame ball advances further in frame space");
  assertClose(phases[0] / phases[1], 12 / 8, 1e-9, "exactly in proportion to frame count");
});

// ---------------------------------------------------------------------------
// Termination
// ---------------------------------------------------------------------------

test("every shot eventually settles, so a timed run cannot be held hostage", () => {
  for (const power of [0.2, 0.4, 0.6, 0.8, 1]) {
    for (const loft of [0, 0.5, 1]) {
      const { ticks } = shoot({ power, loft, maxTicks: 900 });
      assert(ticks < 899, `power ${power} loft ${loft} never settled`);
    }
  }
});

test("no shot produces a non-finite ball, whatever it hits on the way", () => {
  for (const power of [0, 0.3, 0.7, 1]) {
    for (const aimX of [320, 480, 640]) {
      const { ball } = shoot({ power, aim: { x: aimX, y: HOOP_BASE_RIM_Y + 2 }, maxTicks: 600 });
      for (const key of ["x", "y", "z", "vx", "vy", "vz", "omegaX", "rollPhase"]) {
        assert(Number.isFinite(ball[key]), `${key} went non-finite at power ${power} aim ${aimX}`);
      }
    }
  }
});

finish();
