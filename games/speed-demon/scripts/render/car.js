// Car rendering — a top-down sprite lifted straight off the authored sheet.
//
// The sheet's background alpha is already 0, so a tight source rect from the
// atlas is all that is needed; there is no pixel surgery at load time.
//
// The art is a high-angle top-down view with the car pointing up the screen, so
// it is drawn unrotated at a constant size — no perspective scaling. The sprite
// is foreshortened (about 1:1.4 where a real car is nearer 1:2.5), so its size
// is chosen to sit correctly in a lane rather than to match the road's metre
// scale — the usual arcade compromise for this kind of sprite.
//
// Width comes from the lane; height comes from the frame. Frames vary in
// proportion across the sheets, so nothing here may assume a square sprite.
// `carBox` is the single place that resolves a frame into screen geometry, so
// the body, its shadow and its tail lights cannot drift apart.

import { ROAD, trackScale, laneScreenX } from "../ui/track-layout.js";
import { WORLD } from "./scene.js";

/** Where the player's car sits on screen — low in frame, road ahead visible. */
export const CAR_CENTRE_Y = 372;

/** Fraction of a lane's width the car occupies. */
const CAR_LANE_FILL = 0.78;

/**
 * Where the tail lights sit down the sprite, as a fraction of frame height.
 * Measured off the sheets rather than chosen: the lamp pixels form a band at
 * 0.77-0.83 on every car, so 0.80 is its centre. (The other red band, around
 * 0.42-0.57, is the harness through the rear window — not a light.)
 */
export const TAIL_LIGHT_HEIGHT_FRACTION = 0.8;

/** How far a full squat shifts the body in frame, in pixels. */
const ATTITUDE_SHIFT = 3;

export function carWidth() {
  return ROAD.laneWidth * trackScale(WORLD.width) * CAR_LANE_FILL;
}

/**
 * Screen geometry for one car: lane-anchored width, frame-proportioned height.
 * A null frame falls back to a square, which is what the placeholder block the
 * renderer draws before the sheet loads needs.
 */
export function carBox(frame, { laneIndex = 1, attitude = 0, wobble = 0 } = {}) {
  const width = carWidth();
  const height = frame ? frame.sh * (width / frame.sw) : width;
  return {
    x: laneScreenX(WORLD.width, laneIndex) + wobble,
    // Squat shifts the body slightly back in frame under acceleration.
    top: CAR_CENTRE_Y - height / 2 + attitude * ATTITUDE_SHIFT,
    width,
    height,
  };
}

/** Screen point the tail-light glow is centred on. */
export function tailLightAnchor(frame, options = {}) {
  const box = carBox(frame, options);
  return { x: box.x, y: box.top + box.height * TAIL_LIGHT_HEIGHT_FRACTION };
}

/**
 * Body attitude: squats under power, noses forward when the clutch comes out.
 * Driven by the sim's acceleration rather than an animation timer, so it always
 * agrees with what the physics are doing.
 */
export function carAttitude(previousSpeed, speed, dt) {
  const accel = dt > 0 ? (speed - previousSpeed) / dt : 0;
  return Math.max(-1, Math.min(1, accel / 8));
}

/**
 * Draws the car.
 *
 * `sprite` is the *baked livery sprite* from `render/livery.js` — one car in one
 * set of colours, already its own canvas — rather than the shared sheet. That is
 * why there is no source rect here: the tint pass cropped the frame out when it
 * baked it, and re-cropping would slice a neighbouring car off the sheet. The
 * frame is still needed for geometry, because `carBox` sizes by lane width and
 * takes the proportion from the frame.
 */
export function drawCar(ctx, sprite, frame, options = {}) {
  const { x, top, width, height } = carBox(frame, options);

  if (!sprite || !frame) {
    ctx.fillStyle = "#c8382f";
    ctx.fillRect(x - width / 2, top, width, height);
    return;
  }

  ctx.save();

  // Contact shadow. Seen from overhead the sun is nearly behind the camera, so
  // this stays tucked under the body — a larger offset reads as a smear rather
  // than a shadow. It sits at the car's resting centre, not the squatted one,
  // so the body visibly moves against it.
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(x + 3, CAR_CENTRE_Y + 4, width * 0.38, height * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.drawImage(sprite, 0, 0, sprite.width, sprite.height, x - width / 2, top, width, height);

  ctx.restore();
}

/**
 * Tail-light glow behind the car, brightest when the engine is off-power.
 *
 * Anchored to the frame's lamps via `tailLightAnchor`. It used to be offset by a
 * fraction of the car's *width*, which only landed on the lights while the
 * sprite happened to be square.
 */
export function drawTailLights(ctx, frame, intensity, options = {}) {
  if (intensity <= 0.01) {
    return;
  }
  const width = carWidth();
  const { x, y } = tailLightAnchor(frame, options);
  // The glow follows the lenses' own colour. A car with amber lamps trailing a
  // red glow reads as a bug even when nobody can say why, so the caller passes
  // the colour its livery baked into the sprite rather than assuming red.
  const colour = options.colour ?? ((alpha) => `rgba(255, 46, 32, ${alpha})`);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const glow = ctx.createRadialGradient(x, y, 2, x, y, width * 0.95);
  glow.addColorStop(0, colour(0.45 * intensity));
  glow.addColorStop(1, colour(0));
  ctx.fillStyle = glow;
  ctx.fillRect(x - width, y - width, width * 2, width * 2);
  ctx.restore();
}
