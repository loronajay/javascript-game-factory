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

import { ballFlight, ballSplat, ballTrail } from "./assets/ball-catalog.js";
import { addSplat, clearSplatField, createSplatField, tickSplatField } from "./effects/splat-field.js";
import { addFire, clearFlameTrail, createFlameTrail, emitFlameTrail, tickFlameTrail } from "./effects/flame-trail.js";
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

/**
 * A demo that makes no noise at all, for a caller that does not hand one in.
 *
 * The court is a second composition root, and a root that hard-required an
 * audio object would make `tests/practice-court.test.js` a browser test. The
 * silent stand-in keeps the demo runnable under node, the same way `assets`
 * being an injected library keeps it runnable without images.
 */
const SILENT_AUDIO = {
  released() {},
  contact() {},
  splat() {},
  sizzle() {},
  scored() {},
  missed() {},
};

export function createPracticeCourt(
  canvas,
  {
    assets,
    audio = SILENT_AUDIO,
    onPower = () => {},
    onSay = () => {},
    onTally = () => {},
    onBusy = () => {},
  } = {},
) {
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
  // The demo court marks up too. It is the same sim and the same ball, and a
  // player who picked the snowball should find out here what it does.
  const splats = createSplatField();
  // The magma ball burns, and what it leaves in the air and on the floor is a
  // second transient field beside the splats. Same layer, same tick clock, and
  // the same guarantee: it cannot touch a score. See `effects/flame-trail.js`.
  const trail = createFlameTrail();

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
      // The solver compensates for the ball's weight so the reference pull still
      // swishes whatever is in hand; its drag is deliberately not passed, and is
      // felt as the ball landing short. See `sim/launch.js`.
      weight: ballFlight(style.ballId).weight,
    });
    launchBall(ball, launch, launchSpin(launch));
    beginShot(shot);
    audio.released(style.ballId);
    taken += 1;
    onTally({ made, taken });
    // The ball is locked for the flight. The launch was just solved against
    // this ball's weight, so a swap mid-air would leave a ball in the room
    // flying an arc that was solved for a different one.
    onBusy(true);
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
      emitFlameTrail(trail, { ...ball, dt: TICK_SECONDS, style: ballTrail(style.ballId) });

      if (stepped.scored) {
        kicks.net = 1;
        made += 1;
        streak += 1;
        onTally({ made, taken });
        onSay(madeAnnouncement(streak));
        // The demo's own streak, so the celebration matches the ON FIRE! it is
        // already putting on screen. It still has no clock and no board.
        audio.scored(streak);
      }
      if (stepped.contacts.includes("rim")) {
        kicks.rim = ball.x < world.hoopWorld.rimX ? -1 : 1;
      }
      if (stepped.splat) {
        addSplat(splats, { ...stepped.splat, ballId: style.ballId, ...ballSplat(style.ballId) });
        audio.splat(stepped.splat.surface, { ballId: style.ballId, speed: stepped.splat.speed });
      }
      for (const contact of new Set(stepped.contacts)) {
        // A burning ball lights what it lands on. `addFire` is what knows
        // whether this contact started a fire or fell inside one already
        // burning, so the sizzle follows ITS answer rather than the collider's
        // report — which arrives once per 8ms substep for as long as the ball
        // rolls. A ball with no trail block hands in null and nothing happens.
        if (addFire(trail, { ...ball, surface: contact, style: ballTrail(style.ballId) })) audio.sizzle(style.ballId);
        if (stepped.splat?.surface === contact) continue;
        audio.contact(contact, { ballId: style.ballId, speed: ball.vy });
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
        if (!shot.scored) {
          streak = 0;
          audio.missed();
        }
        shot = createShot();
        resetBall(ball);
        onPower(0);
        onBusy(false);
      }
    }

    tickSplatField(splats, TICK_SECONDS);
    tickFlameTrail(trail, TICK_SECONDS);

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
              weight: ballFlight(style.ballId).weight,
            }),
          )
        : null;

    renderFrame(ctx, {
      ball,
      hoop,
      backdrop: assets.backdrop(style.locationId),
      locationId: style.locationId,
      ballFrames: assets.ballFrames(style.ballId),
      ballId: style.ballId,
      pull,
      trajectory,
      kicks,
      scored: shot.scored,
      splats,
      splatImagesFor: assets.ballSplats,
      trail,
    });
  }

  return {
    /**
     * Show the room and ball the player has actually chosen, so the demo plays
     * like the run they are about to take. The room is cosmetic by contract and
     * cannot reach the shot. The ball is not, and that is the point: a player
     * about to shoot a snowball should be practising with one.
     */
    setStyle(next) {
      // Refused while a shot is in the air, for the reason the picker is locked
      // there: the arc under way was solved against the ball that took it.
      if (next.ballId && shot.state === SHOT_FLIGHT) return;
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
      clearSplatField(splats);
    clearFlameTrail(trail);
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
