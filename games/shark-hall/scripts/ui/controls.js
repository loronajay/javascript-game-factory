// Everything the player can do at the table: pointer, keyboard, and the stroke.
//
// One module, because these three are one interaction model wearing three hats —
// the same charge, the same aim, the same two-step placement, reachable from a
// mouse, a finger or a key. Splitting them by input device is how they drift.
//
// THE POINTER MODEL IS ONE GESTURE WITH TWO MEANINGS, and which one is decided
// entirely by whether the player has ball in hand:
//
//   ball in hand — press, drag to a legal spot, RELEASE TO CONFIRM. Placement is
//     two-step on purpose: a single tap that spotted the ball wherever the
//     finger landed would ruin a scratch as often as it fixed one.
//   otherwise    — drag to sweep the aim, or tap to face a point on the cloth.
//     The tap threshold is small; anything longer is a sweep.
//
// THE CHARGE IS THE ONLY POWER INPUT. Hold, release to strike. Nothing here sets
// power any other way, which is what makes the cue's pull-back on the table an
// honest meter rather than an animation.

import { ballAt } from "../sim/aim.js";
import { heldPower } from "../sim/shot.js";

/** A press that travels less than this many pixels is a tap, not a drag. */
const TAP_SLOP = 7;
/** Radians per keyboard nudge, and per click of the fine-aim buttons. */
const NUDGE = (0.35 * Math.PI) / 180;

export function createControls({
  canvas,
  elements,
  match,
  scene,
  audio,
  onCharge,
  onCameraToggle,
  onHover,
  isInteractive = () => true,
}) {
  let charging = false;
  let chargeStart = 0;

  // Pointer state for the current gesture.
  let aiming = false;
  let placing = false;
  let placementLanded = false;
  let lastX = 0;
  let travelled = 0;

  const now = () => performance.now();

  /** The ball number the readout is currently naming, so it is only redrawn on a change. */
  let hovered = null;

  /**
   * Report which ball is under the cursor.
   *
   * MOUSE ONLY. Hover is a pointing-device idea: a finger is already touching
   * the thing it is on, and firing this from touch would pop a readout under
   * every aim sweep. It is also NOT gated on whose turn it is — reading the
   * table while the opponent shoots is exactly when you want it.
   */
  function updateHover(event) {
    if (!onHover) return;
    if (event && event.pointerType && event.pointerType !== "mouse") return;
    if (!event || !isInteractive() || charging || aiming || placing) return clearHover();

    const point = scene.pointToTable(event.clientX, event.clientY);
    const ball = point ? ballAt(match.balls(), point.x, point.z) : null;
    if (!ball) return clearHover();
    hovered = ball.n;
    onHover({ n: ball.n, clientX: event.clientX, clientY: event.clientY });
  }

  function clearHover() {
    if (hovered === null) return;
    hovered = null;
    onHover?.(null);
  }

  // -----------------------------------------------------------------------
  // The stroke
  // -----------------------------------------------------------------------

  function beginCharge() {
    if (charging || !match.humanCanAct()) return false;
    const snapshot = match.snapshot();
    if (snapshot.ballInHand !== "none" || snapshot.moving) return false;
    charging = true;
    chargeStart = now();
    onCharge?.(0.055);
    return true;
  }

  function releaseCharge() {
    if (!charging) return;
    const power = heldPower(now() - chargeStart);
    charging = false;
    onCharge?.(power, { released: true });
    match.shoot(power);
  }

  function cancelCharge() {
    if (!charging) return;
    charging = false;
    onCharge?.(0);
  }

  /** The live charge, for the frame loop to draw the meter and pull the cue back. */
  const chargeLevel = () => (charging ? heldPower(now() - chargeStart) : 0);

  // -----------------------------------------------------------------------
  // Pointer
  // -----------------------------------------------------------------------

  function onPointerDown(event) {
    if (!isInteractive() || !match.humanCanAct()) return;
    canvas.setPointerCapture?.(event.pointerId);
    lastX = event.clientX;
    travelled = 0;

    if (match.snapshot().ballInHand !== "none") {
      placing = true;
      placementLanded = false;
      tryPlace(event);
      return;
    }

    aiming = true;
  }

  function tryPlace(event) {
    const point = scene.pointToTable(event.clientX, event.clientY);
    if (point && match.tryPlaceCue(point.x, point.z)) {
      placementLanded = true;
      return true;
    }
    return false;
  }

  function onPointerMove(event) {
    updateHover(event);
    if (placing) {
      tryPlace(event);
      return;
    }
    if (!aiming) return;

    const dx = event.clientX - lastX;
    lastX = event.clientX;
    travelled += Math.abs(dx);
    // A finger covers less screen than a mouse does, so a phone sweeps faster
    // per pixel. Same total wrist travel, either way.
    match.nudgeAngle(dx * (scene.width < 650 ? 0.003 : 0.00235));
  }

  function onPointerUp(event) {
    if (placing) {
      placing = false;
      if (placementLanded) {
        match.confirmPlacement();
        audio?.click();
      } else {
        audio?.reject();
      }
      placementLanded = false;
      return;
    }

    if (aiming && travelled < TAP_SLOP) {
      const point = scene.pointToTable(event.clientX, event.clientY);
      if (point) match.aimAt(point.x, point.z);
    }
    aiming = false;
  }

  function onPointerCancel() {
    aiming = false;
    placing = false;
    placementLanded = false;
    clearHover();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("pointerleave", clearHover);

  // -----------------------------------------------------------------------
  // The deck
  // -----------------------------------------------------------------------

  elements.aim?.addEventListener("input", () => {
    match.setAngle((Number(elements.aim.value) * Math.PI) / 180);
  });
  elements.nudgeLeft?.addEventListener("click", () => match.nudgeAngle(-NUDGE));
  elements.nudgeRight?.addEventListener("click", () => match.nudgeAngle(NUDGE));
  elements.resetAim?.addEventListener("click", () => {
    match.setAngle(0);
    audio?.click();
  });
  elements.camBtn?.addEventListener("click", () => {
    onCameraToggle?.();
    audio?.click();
  });

  elements.shoot?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (!beginCharge()) return;
    // Capture so the stroke survives the finger sliding off the button, which on
    // a phone it routinely does. Guarded because capture throws on a pointer id
    // the element never saw, and losing the capture must not lose the shot.
    try {
      elements.shoot.setPointerCapture?.(event.pointerId);
    } catch {
      /* uncapturable pointer; the stroke still works, it just cannot leave the button */
    }
  });
  elements.shoot?.addEventListener("pointerup", (event) => {
    event.preventDefault();
    releaseCharge();
  });
  elements.shoot?.addEventListener("pointercancel", cancelCharge);

  // -----------------------------------------------------------------------
  // Keyboard
  // -----------------------------------------------------------------------

  /** Typing in a control is not playing the game. */
  const inField = (target) => target && /INPUT|SELECT|BUTTON|TEXTAREA/.test(target.tagName);

  function onKeyDown(event) {
    if (inField(event.target) || !isInteractive()) return;

    if (event.code === "Space") {
      if (event.repeat) return;
      if (!match.humanCanAct()) return;
      event.preventDefault();
      beginCharge();
      return;
    }

    if (!match.humanCanAct()) return;
    const key = event.key.toLowerCase();
    if (event.key === "ArrowLeft" || key === "a") {
      event.preventDefault();
      match.nudgeAngle(-NUDGE);
    } else if (event.key === "ArrowRight" || key === "d") {
      event.preventDefault();
      match.nudgeAngle(NUDGE);
    } else if (key === "o") {
      onCameraToggle?.();
    }
  }

  function onKeyUp(event) {
    if (event.code !== "Space" || inField(event.target)) return;
    if (!charging) return;
    event.preventDefault();
    releaseCharge();
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  return {
    chargeLevel,
    isCharging: () => charging,
    cancelCharge,

    destroy() {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("pointerleave", clearHover);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    },
  };
}
