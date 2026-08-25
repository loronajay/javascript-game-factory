// The room: backdrop, ambient grade, and the ball's shadow.
//
// A NOTE ON SMOOTHING. The repo default is `imageSmoothingEnabled = false`,
// because most cabinets here are pixel art. This one is not: the rooms are
// painted photographic-resolution JPEGs and the balls are rendered 512px
// sprites. Disabling smoothing on those produces stair-stepped edges on every
// downscale, so this cabinet deliberately leaves smoothing ON. See CLAUDE.md.
//
// Draw calls only. Nothing in `render/` mutates game state or decides anything.

import {
  BOARD_Z,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  FLOOR_SCREEN_Y,
  FLOOR_Y,
  PROJECTION_ORIGIN_X,
  PROJECTION_X_SCALE,
} from "../sim/constants.js";
import {
  EDGE_FILL_SOURCE_BAND,
  occludersInFrontOf,
  roomBackdropOffsetY,
  roomEdgeGap,
} from "../assets/room-geometry.js";
import { ballScreenRadius, depthScaleAt, floorScreenY, projectPoint } from "../sim/projection.js";

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
 * The backdrop is slid so its own painted skirting lands on the camera's wall
 * base — see `assets/room-geometry.js` for why five independently painted rooms
 * need that, and for the contract that keeps it presentation-only. The strip the
 * slide exposes is filled by stretching the art's own edge band, which lands on
 * plain ceiling or plain floor in every shipped room.
 *
 * Falls back to a flat wall colour when the backdrop has not decoded yet, so the
 * first frame is never a transparent hole — the repo's placeholder rule.
 */
export function drawRoom(ctx, backdrop, locationId) {
  if (!backdrop || !backdrop.complete || !backdrop.naturalWidth) {
    ctx.fillStyle = "#7d584b";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  } else {
    const offset = roomBackdropOffsetY(locationId);
    ctx.drawImage(backdrop, 0, offset, CANVAS_WIDTH, CANVAS_HEIGHT);

    const gap = roomEdgeGap(locationId);
    if (gap) {
      const sourceY = gap.edge === "top" ? 0 : backdrop.naturalHeight - EDGE_FILL_SOURCE_BAND;
      ctx.drawImage(
        backdrop,
        0,
        sourceY,
        backdrop.naturalWidth,
        EDGE_FILL_SOURCE_BAND,
        0,
        gap.y,
        CANVAS_WIDTH,
        gap.height,
      );
    }
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
  ctx.ellipse(PROJECTION_ORIGIN_X, FLOOR_SCREEN_Y + 6, 245, 48, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * The furniture that stands in front of the ball.
 *
 * The room is painted flat, so without this every shot skates across the face of
 * the picture: a ball at the back wall draws over the desk in the foreground and
 * the whole illusion collapses in one frame. Re-drawing the backdrop through a
 * polygon cut around the desk puts it back in front, where it is.
 *
 * There is no new art here and there is no mask image — the clip is the mask,
 * and the pixels are the room's own. `depth` is what is being covered up: pass
 * the ball's depth after drawing the ball, or the back wall after drawing the
 * decals stuck to it.
 */
export function drawRoomOccluders(ctx, backdrop, locationId, depth) {
  if (!backdrop || !backdrop.complete || !backdrop.naturalWidth) return;
  const occluders = occludersInFrontOf(locationId, depth);
  if (!occluders.length) return;

  const offset = roomBackdropOffsetY(locationId);
  ctx.save();
  ctx.translate(0, offset);
  ctx.beginPath();
  for (const occluder of occluders) {
    const [first, ...rest] = occluder.polygon;
    ctx.moveTo(first[0], first[1]);
    for (const [x, y] of rest) ctx.lineTo(x, y);
    ctx.closePath();
  }
  ctx.clip();
  ctx.drawImage(backdrop, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.restore();
}

/**
 * How much the room's own air dims an object at depth `z`.
 *
 * Aerial perspective, and the cheapest strong depth cue there is: the back of
 * every one of these rooms is painted darker and flatter than the front, so a
 * ball that stays fully lit all the way to the wall reads as a sticker sliding
 * over the picture. Returned as a filter string rather than applied here, so the
 * one caller that draws the sprite stays the only one touching the context.
 */
export function depthGradeFilter(z) {
  const depth = Math.max(0, Math.min(1, z));
  const brightness = (1 - 0.2 * depth).toFixed(3);
  const saturation = (1 - 0.16 * depth).toFixed(3);
  return `brightness(${brightness}) saturate(${saturation})`;
}

/**
 * The ball's shadow on the back wall.
 *
 * Only exists in the last stretch of the room, and it is what tells a player the
 * wall is a surface rather than a painted horizon: a ball closing on it grows a
 * shadow that tightens and slides in until the two meet. The offset direction
 * follows the same light-from-the-left the rooms and `render/hoop.js` are all
 * keyed to.
 */
export function drawWallShadow(ctx, ball) {
  const gap = BOARD_Z - ball.z;
  if (gap > 0.42 || gap < -0.1) return;

  const closeness = Math.max(0, Math.min(1, 1 - gap / 0.42));
  const wall = projectPoint({ x: ball.x, y: ball.y, z: BOARD_Z });
  const radius = ballScreenRadius(BOARD_Z);
  // Wide and faint when the ball is still out in the room, tight and dark as it
  // arrives — the same two-part read as the floor shadow, on a vertical plane.
  const spread = radius * (1.5 - 0.45 * closeness);

  ctx.save();
  ctx.globalAlpha = 0.34 * closeness;
  ctx.filter = `blur(${(9 - 5 * closeness).toFixed(1)}px)`;
  ctx.fillStyle = "#100a08";
  ctx.beginPath();
  ctx.ellipse(wall.x + spread * 0.34, wall.y + spread * 0.16, spread, spread * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
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
  const screenX = PROJECTION_ORIGIN_X + ball.x * PROJECTION_X_SCALE * scale;
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
