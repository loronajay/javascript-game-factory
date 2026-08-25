// The How-to-Play demo court: a real shot, with nothing at stake.
//
// This is a second, smaller composition root. It owns its own canvas, its own
// ball and its own shot, and it runs on the SAME sim as the game — the same
// pull, the same solve, the same collisions. That is the whole point: a demo
// that approximated the shot would teach the wrong hands.
//
// What it deliberately does NOT have is a run: no clock, no score submitted, no
// board. `sim/run.js` is absent from the imports on purpose, because a practice
// shot that could set a record would make the board key a lie.
//
// It holds no DOM beyond its canvas. Everything it wants to say leaves through
// the callbacks and is written by `ui/practice-view.js`.

import { CANVAS_HEIGHT, CANVAS_WIDTH, PULL_MIN, TICK_SECONDS } from "./sim/constants.js";
import { hoopAt } from "./sim/hoop.js";
import { isShootablePull, neutralPull, resolvePull } from "./sim/pull.js";
import { launchSpin, solveLaunch, trajectoryPoints } from "./sim/launch.js";
import { createBall, isBallSettled, launchBall, resetBall, stepBall, worldFor } from "./sim/physics.js";
import { SHOT_FLIGHT, advanceShot, beginShot, createShot, madeAnnouncement } from "./sim/shot.js";
import { ballScreenPosition, renderFrame } from "./render/frame.js";
import { prepareContext } from "./render/scene.js";
import { canvasPoint, isGrab } from "./ui/pointer.js";

/**
 * The rim the demo uses.
 *
 * Still, always — including when the player has a moving mode selected. Leading
 * a moving rim is a skill built on top of the shot, and the demo exists to teach
 * the shot itself. The note beside it is what explains the moving modes.
 */
const PRACTICE_MODE = "still";

export function createPracticeCourt(canvas, { assets, onPower = () => {}, onSay = () => {}, onTally = () => {} } = {}) {
  const ctx = canvas.getContext("2d");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  prepareContext(ctx);

  const ball = createBall();
  let shot = createShot();
  let style = { ballId: "basketball", locationId: "bedroom" };

  // The hoop's own clock, kept even though the demo rim is still, so switching
  // PRACTICE_MODE to a moving one is a one-line change and not a rewrite.
  let clock = 0;
  let made = 0;
  let taken = 0;
  let streak = 0;

  let pull = null;
  let pullPointerId = null;
  let grabOffset = { x: 0, y: 0 };
  // Only true while the How to Play screen is showing. The listeners stay bound
  // either way — a demo that rebinds its own input on every screen change is a
  // leak waiting to happen — and simply decline to act.
  let active = false;

  const kicks = { net: 0, rim: 0 };

  // -----------------------------------------------------------------------
  // Input — the same gesture as the game, read through the same two helpers.
  // -----------------------------------------------------------------------

  function canPull() {
    return active && shot.state !== SHOT_FLIGHT;
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (!canPull()) return;
    const point = canvasPoint(canvas, event);
    if (!isGrab(point, ballScreenPosition(ball))) return;

    event.preventDefault();
    pullPointerId = event.pointerId;
    const ballScreen = ballScreenPosition(ball);
    grabOffset = { x: point.x - ballScreen.x, y: point.y - ballScreen.y };
    pull = neutralPull(ballScreen);
    onPower(0);
    onSay("");
    canvas.setPointerCapture?.(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!pull || event.pointerId !== pullPointerId) return;
    event.preventDefault();
    updatePull(canvasPoint(canvas, event));
  });

  canvas.addEventListener("pointerup", (event) => {
    if (!pull || event.pointerId !== pullPointerId) return;
    event.preventDefault();
    updatePull(canvasPoint(canvas, event));
    releasePull();
  });

  canvas.addEventListener("pointercancel", (event) => {
    if (event.pointerId !== pullPointerId) return;
    cancelPull();
  });

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  function updatePull(point) {
    pull = resolvePull(
      { x: pull.anchorX, y: pull.anchorY },
      { x: point.x - grabOffset.x, y: point.y - grabOffset.y },
    );
    onPower(pull.power);
  }

  function releasePull() {
    const released = pull;
    pull = null;
    pullPointerId = null;

    if (!released || !isShootablePull(released)) {
      onPower(0);
      return;
    }

    const launch = solveLaunch({
      origin: { x: ball.x, y: ball.y, z: ball.z },
      aim: { x: released.aimX, y: released.aimY },
      power: released.power,
      loft: released.loft,
    });
    launchBall(ball, launch, launchSpin(launch));
    beginShot(shot);
    taken += 1;
    onTally({ made, taken });
  }

  function cancelPull() {
    pull = null;
    pullPointerId = null;
    onPower(0);
  }

  // -----------------------------------------------------------------------
  // Loop — driven by the cabinet's one fixed-timestep clock, not its own.
  // -----------------------------------------------------------------------

  function tick() {
    clock += TICK_SECONDS;
    const hoop = hoopAt(PRACTICE_MODE, clock);

    if (shot.state === SHOT_FLIGHT) {
      const world = worldFor(hoop);
      const stepped = stepBall(ball, world, TICK_SECONDS, { ballId: style.ballId, alreadyScored: shot.scored });

      if (stepped.scored) {
        kicks.net = 1;
        made += 1;
        streak += 1;
        onTally({ made, taken });
        onSay(madeAnnouncement(streak));
      }
      if (stepped.contacts.includes("rim")) {
        kicks.rim = ball.x < world.hoopWorld.rimX ? -1 : 1;
      }

      const progress = advanceShot(
        shot,
        {
          ball,
          hoop,
          hoopWorld: world.hoopWorld,
          contacts: stepped.contacts,
          scored: shot.scored,
          settled: isBallSettled(ball),
        },
        TICK_SECONDS,
      );

      for (const announcement of progress.announcements) onSay(announcement);

      if (progress.finished) {
        if (!shot.scored) streak = 0;
        shot = createShot();
        resetBall(ball);
        onPower(0);
      }
    }

    kicks.net *= Math.pow(0.055, TICK_SECONDS);
    kicks.rim *= Math.pow(0.018, TICK_SECONDS);
    if (Math.abs(kicks.net) < 0.002) kicks.net = 0;
    if (Math.abs(kicks.rim) < 0.002) kicks.rim = 0;
  }

  function draw() {
    const hoop = hoopAt(PRACTICE_MODE, clock);
    const trajectory =
      pull && pull.power > 0.03
        ? trajectoryPoints(
            { x: ball.x, y: ball.y, z: ball.z },
            solveLaunch({
              origin: { x: ball.x, y: ball.y, z: ball.z },
              aim: { x: pull.aimX, y: pull.aimY },
              power: pull.power,
              loft: pull.loft,
            }),
          )
        : null;

    renderFrame(ctx, {
      ball,
      hoop,
      backdrop: assets.backdrop(style.locationId),
      ballFrames: assets.ballFrames(style.ballId),
      ballId: style.ballId,
      pull,
      trajectory,
      kicks,
      scored: shot.scored,
    });
  }

  return {
    /**
     * Show the room and ball the player has actually chosen, so the demo looks
     * like the run they are about to take. Both are cosmetic by contract, so
     * this can never change how the practice shot behaves.
     */
    setStyle(next) {
      style = { ballId: next.ballId ?? style.ballId, locationId: next.locationId ?? style.locationId };
    },

    /** Enter/leave the screen. Leaving drops a half-made pull on the floor. */
    setActive(next) {
      active = next;
      if (!next) cancelPull();
    },

    /** Back to a clean court — used every time the screen is opened. */
    reset() {
      shot = createShot();
      resetBall(ball);
      cancelPull();
      made = 0;
      taken = 0;
      streak = 0;
      kicks.net = 0;
      kicks.rim = 0;
      onTally({ made, taken });
      onSay("");
    },

    /** Whether a shot is in the air right now. */
    isBusy: () => shot.state === SHOT_FLIGHT,

    /** Whether the player has started a real pull yet — keeps the hint honest. */
    hasPulled: () => taken > 0 || Boolean(pull && pull.distance >= PULL_MIN),

    tick,
    draw,
  };
}
