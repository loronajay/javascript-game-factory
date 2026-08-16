const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const {
  ballSpeedForShot,
  chargeStateAtTime,
  chargePowerAtTime,
  createRack,
  createSimulation,
  GUTTER_CENTER_X,
  GUTTER_CONTACT_X,
  GUTTER_EXIT_Z,
  gutterAwareTrajectoryX,
  gutterSideForX,
  hookBreakpointForPower,
  resolveContact,
  stepSimulation,
  spinAtTime,
  SPIN_SWEEP_SECONDS,
  trajectoryX,
  trajectoryDerivative,
} = require("./physics-core.js");

describe("throw charging", () => {
  test("changes charge timing with the selected ball profile", () => {
    const slow = chargeStateAtTime(0.7, { chargeSpeed: 0.7 });
    const fast = chargeStateAtTime(0.7, { chargeSpeed: 1.4 });

    assert.ok(fast.power > slow.power);
    assert.ok(fast.timeToFull < slow.timeToFull);
  });

  test("punishes holding beyond the full-power sweet spot", () => {
    const profile = { chargeSpeed: 1, overchargeGrace: 0.16, overchargeTolerance: 1 };
    const full = chargeStateAtTime(1.35, profile);
    const warning = chargeStateAtTime(1.42, profile);
    const overcharged = chargeStateAtTime(2.1, profile);

    assert.equal(full.power, 1);
    assert.equal(warning.phase, "sweet-spot");
    assert.equal(overcharged.phase, "overcharged");
    assert.ok(overcharged.power < full.power);
    assert.ok(overcharged.penalty > 0);
  });

  test("sweeps the spin pointer across left, straight, and right timing windows", () => {
    assert.equal(spinAtTime(0), -1);
    assert.ok(Math.abs(spinAtTime(SPIN_SWEEP_SECONDS / 4)) < 1e-10);
    assert.equal(spinAtTime(SPIN_SWEEP_SECONDS / 2), 1);
    assert.ok(Math.abs(spinAtTime(SPIN_SWEEP_SECONDS * 0.75)) < 1e-10);
    assert.equal(spinAtTime(SPIN_SWEEP_SECONDS), -1);
    assert.ok(spinAtTime(0.2, 1.2) > spinAtTime(0.2, 0.8), "harder ball profiles should sweep faster");
  });

  test("turns a longer hold into steadily increasing throw power", () => {
    const tap = chargePowerAtTime(0);
    const shortHold = chargePowerAtTime(0.25);
    const mediumHold = chargePowerAtTime(0.7);
    const fullHold = chargePowerAtTime(2);

    assert.ok(tap > 0, "even a tap should release the ball");
    assert.ok(tap < shortHold && shortHold < mediumHold && mediumHold < fullHold);
    assert.equal(fullHold, 1, "power should cap instead of cycling back down");
    assert.equal(chargePowerAtTime(20), fullHold);
  });

  test("makes weak and fully charged throws visibly different speeds", () => {
    const weakSpeed = ballSpeedForShot({ power: chargePowerAtTime(0), speedScale: 1 });
    const fullSpeed = ballSpeedForShot({ power: chargePowerAtTime(20), speedScale: 1 });

    assert.ok(fullSpeed > weakSpeed * 2, `expected a wide speed range, got ${weakSpeed} to ${fullSpeed}`);
    assert.ok(ballSpeedForShot({ power: 1, speedScale: 1.08 }) > fullSpeed, "ball profiles should still modify speed");
  });
});

describe("lane physics primitives", () => {
  test("creates the regulation ten-pin rack with stable home positions", () => {
    const rack = createRack();
    assert.equal(rack.length, 10);
    assert.equal(new Set(rack.map((pin) => `${pin.homeX}:${pin.homeY}`)).size, 10);
    assert.equal(rack[0].homeX, 0);
  });

  test("only resolves overlapping bodies and transfers forward momentum", () => {
    const ball = { x: 0, y: 0, vx: 0, vy: 2, mass: 3.4 };
    const pin = { x: 0, y: 0.16, vx: 0, vy: 0, mass: 1 };
    const impulse = resolveContact(ball, pin, 0.12, 0.067, 0.2);
    assert.ok(impulse > 0);
    assert.ok(pin.vy > 0);

    const distant = { x: 2, y: 2, vx: 0, vy: 0, mass: 1 };
    assert.equal(resolveContact(ball, distant, 0.12, 0.067, 0.2), 0);
  });

  test("hook bends a projected line without moving its release point", () => {
    assert.equal(trajectoryX(0, { position: 0.1, aim: 0.2, hook: -0.5, hookScale: 1 }), 0.1);
    assert.ok(
      trajectoryX(0.9, { position: 0.1, aim: 0.2, hook: -0.5, hookScale: 1 })
      < trajectoryX(0.9, { position: 0.1, aim: 0.2, hook: 0, hookScale: 1 }),
    );
  });

  test("models skid before hook and makes slower shots bite earlier", () => {
    const slow = { position: 0, aim: 0, hook: 1, hookScale: 1, power: 0.2 };
    const fast = { ...slow, power: 1 };

    assert.equal(trajectoryX(0.3, slow), 0, "the ball should initially skid on its launch line");
    assert.ok(hookBreakpointForPower(fast.power) > hookBreakpointForPower(slow.power));
    assert.ok(trajectoryX(0.9, slow) > trajectoryX(0.9, fast), "slower shots should hook more by the pocket");
  });

  test("makes a full spin meter produce an unmistakable late hook", () => {
    const straight = { position: 0, aim: 0, hook: 0, hookScale: 1, power: 0.78 };
    const fullHook = { ...straight, hook: 1 };

    assert.equal(trajectoryX(0.3, fullHook), trajectoryX(0.3, straight), "full spin should still skid first");
    assert.ok(
      trajectoryX(0.86, fullHook) - trajectoryX(0.86, straight) >= 0.2,
      "the meter edge should create a clearly visible pocket move",
    );
  });

  test("supports the classic outside-to-pocket hook line", () => {
    const shot = { position: 0.3, aim: -0.12, hook: -1, hookScale: 1, power: 0.78 };

    assert.ok(trajectoryX(0.3, shot) > 0.24, "the ball should hold the outside line through the oil");
    assert.ok(trajectoryX(0.86, shot) < 0.02, "the hook should bring it back to the head-pin pocket");
  });

  test("opens the pocket entry angle without moving an established target", () => {
    const shot = { position: 0.3, aim: -0.12, hook: -1, hookScale: 1, power: 0.78 };
    const establishedTarget = -0.004853659947148564;

    assert.ok(
      Math.abs(trajectoryX(0.86, shot) - establishedTarget) < 1e-12,
      "retuning the shape should not move the existing head-pin target",
    );
    assert.ok(
      trajectoryDerivative(0.86, shot) < -1.6,
      "the same target should now be reachable on a meaningfully steeper inward angle",
    );
  });

  test("applies only a small progressive release nudge", () => {
    const base = { position: 0.12, aim: 0, hook: 0, release: 0 };
    const nudged = { ...base, release: -0.03 };

    assert.equal(trajectoryX(0, nudged), trajectoryX(0, base));
    assert.equal(trajectoryX(0.8, nudged) - trajectoryX(0.8, base), -0.03);
  });

  test("keeps the trajectory derivative consistent with the rendered path", () => {
    const shot = { position: -0.1, aim: 0.18, hook: -0.72, hookScale: 1.2, power: 0.65 };
    const z = 0.76;
    const epsilon = 1e-5;
    const numerical = (trajectoryX(z + epsilon, shot) - trajectoryX(z - epsilon, shot)) / (2 * epsilon);

    assert.ok(Math.abs(trajectoryDerivative(z, shot) - numerical) < 1e-5);
  });

  test("keeps every live body finite while a full rack is resolving", () => {
    const simulation = createSimulation(createRack(), {
      position: 0,
      aim: 0.1,
      hook: -0.1,
      hookScale: 1,
      speedScale: 1,
      massScale: 1,
      power: 0.75,
    });
    for (let i = 0; i < 500; i += 1) stepSimulation(simulation, 1 / 180);
    const bodies = [simulation.ball, ...simulation.pins];
    assert.equal(bodies.every((body) => [body.x, body.y, body.vx, body.vy].every(Number.isFinite)), true);
  });

  test("captures the ball when its outside edge reaches either gutter", () => {
    for (const side of [-1, 1]) {
      const simulation = createSimulation(createRack(), { power: 0.75 });
      simulation.ball.x = side * (GUTTER_CONTACT_X + 0.001);
      simulation.ball.vx = side * 0.4;

      stepSimulation(simulation, 1 / 180);

      assert.equal(simulation.ball.gutterSide, side);
      assert.equal(simulation.ball.active, true, "a guttered ball should remain visible down-lane");
    }
  });

  test("gives a grazing ball a small, symmetric forgiveness margin", () => {
    assert.equal(GUTTER_CONTACT_X, 0.92);
    assert.equal(gutterSideForX(0.9), 0, "a slight overhang should remain playable");
    assert.equal(gutterSideForX(-0.9), 0, "forgiveness should match on the left");
    assert.equal(gutterSideForX(GUTTER_CONTACT_X), 1);
    assert.equal(gutterSideForX(-GUTTER_CONTACT_X), -1);
  });

  test("projects the aim guide onto the gutter rail after its first crossing", () => {
    const shot = {
      position: 0.46,
      aim: 0.45,
      hook: 1,
      hookScale: 1.35,
      power: 0.7,
      release: 0.035,
    };

    assert.equal(gutterAwareTrajectoryX(0.3, shot), trajectoryX(0.3, shot));
    assert.ok(trajectoryX(0.9, shot) > GUTTER_CONTACT_X, "the raw guide should cross the gutter");
    assert.equal(gutterAwareTrajectoryX(0.9, shot), GUTTER_CENTER_X,
      "the visible guide should show permanent gutter capture");
  });

  test("locks a guttered ball onto the gutter rail and keeps it away from the pins", () => {
    const simulation = createSimulation(createRack(), { power: 0.9 });
    simulation.ball.x = GUTTER_CONTACT_X + 0.001;
    simulation.ball.vx = 0.55;
    simulation.ball.hookAcceleration = -30;
    const startingY = simulation.ball.y;

    for (let i = 0; i < 180; i += 1) stepSimulation(simulation, 1 / 180);

    assert.equal(simulation.ball.gutterSide, 1, "gutter capture must be one-way");
    assert.ok(Math.abs(simulation.ball.x - GUTTER_CENTER_X) < 0.002,
      `ball should settle onto the gutter rail at ${GUTTER_CENTER_X}, got ${simulation.ball.x}`);
    assert.ok(simulation.ball.y > startingY, "the captured ball should keep rolling toward the pit");
    assert.equal(simulation.pins.some((pin) => pin.contacted), false,
      "a ball in the gutter cannot climb back onto the deck and hit a pin");
  });

  test("retires a guttered ball underneath the painted pit before it runs onto the back wall", () => {
    const simulation = createSimulation(createRack(), { power: 0.9 }, { gutterSide: 1 });
    simulation.ball.y = (GUTTER_EXIT_Z - 0.001 - 0.86) * 11.76;

    stepSimulation(simulation, 1 / 60);

    assert.equal(simulation.ball.active, false);
  });
});
