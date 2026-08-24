// The room: backdrop, ambient grade, and the ball's shadow.
//
// A NOTE ON SMOOTHING. The repo default is `imageSmoothingEnabled = false`,
// because most cabinets here are pixel art. This one is not: the rooms are
// painted photographic-resolution JPEGs and the balls are rendered 512px
// sprites. Disabling smoothing on those produces stair-stepped edges on every
// downscale, so this cabinet deliberately leaves smoothing ON. See CLAUDE.md.
//
// Draw calls only. Nothing in `render/` mutates game state or decides anything.

import { CANVAS_HEIGHT, CANVAS_WIDTH, FLOOR_Y, PROJECTION_ORIGIN_X } from "../sim/constants.js";
import { ballScreenRadius, depthScaleAt, floorScreenY } from "../sim/projection.js";

/** Configure a context for this cabinet's art. Call once, and again after any resize. */
export function prepareContext(ctx) {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
}

export function clearScene(ctx) {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

/**
 * The room behind everything.
 *
 * Falls back to a flat wall colour when the backdrop has not decoded yet, so the
 * first frame is never a transparent hole — the repo's placeholder rule.
 */
export function drawRoom(ctx, backdrop) {
  if (backdrop && backdrop.complete && backdrop.naturalWidth) {
    ctx.drawImage(backdrop, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  } else {
    ctx.fillStyle = "#7d584b";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  // A soft vertical grade unifies five differently-lit rooms under one light,
  // so the hoop and ball do not look pasted onto whichever backdrop is loaded.
  const shade = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  shade.addColorStop(0, "rgba(40,21,16,.06)");
  shade.addColorStop(0.65, "rgba(22,14,12,0)");
  shade.addColorStop(1, "rgba(18,10,8,.18)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // A broad pool of contact shade where the player is standing.
  ctx.fillStyle = "rgba(20,10,8,.18)";
  ctx.beginPath();
  ctx.ellipse(PROJECTION_ORIGIN_X, 716, 245, 48, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * The ball's shadow.
 *
 * Two parts, because one blob cannot do both jobs: a soft cast shadow that
 * drifts and spreads as the ball rises (which is what reads as height), and a
 * tight contact core that only exists when the ball is nearly touching down
 * (which is what reads as landing).
 */
export function drawBallShadow(ctx, ball) {
  const depth = Math.max(0, Math.min(1, ball.z));
  const scale = depthScaleAt(depth);
  const screenX = PROJECTION_ORIGIN_X + ball.x * 390 * scale;
  const radius = ballScreenRadius(ball.z);

  // The projection places a ground-level ball CENTRE on the floor line, so the
  // real point of contact is one projected radius lower — which is where a
  // shadow belongs. Getting this wrong makes the ball look like it hovers.
  const groundCentreY = floorScreenY(depth);
  const contactY = groundCentreY + radius * 0.92;

  const height = Math.max(0, ball.y - FLOOR_Y);
  const castX = screenX + 5 + Math.min(13, height * 4.5);
  const castY = contactY + 7 + Math.min(20, height * 7.5);
  const width = Math.max(14, radius * (1.12 + Math.min(0.55, height * 0.18)));
  const depthPx = Math.max(4.5, width * (0.19 + Math.min(0.08, height * 0.025)));
  const alpha = Math.max(0.055, 0.27 - height * 0.05) * (0.96 - 0.18 * depth);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.filter = `blur(${Math.min(13, 3.5 + height * 3.2)}px)`;
  ctx.fillStyle = "#160d09";
  ctx.beginPath();
  ctx.ellipse(castX, castY, width, depthPx, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (height < 0.38) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, (0.38 - height) * 0.42);
    ctx.fillStyle = "#130b08";
    ctx.beginPath();
    ctx.ellipse(screenX + 2, contactY + 2, Math.max(9, radius * 0.58), Math.max(3.5, radius * 0.13), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
