// Composition: what is drawn, in what order, so the scene reads as 3D.
//
// There is no depth buffer here — the illusion is entirely draw order, and this
// file is the only place that decides it. The rule is:
//
//     room -> backboard -> BACK half of rim+net -> [ball?] -> FRONT half -> [ball?]
//
// and the only question is which side of the front half the ball goes on. It
// goes BEHIND the front half normally, so a ball flying at the hoop passes
// convincingly behind the cords. It goes IN FRONT only in one case — a made
// basket dropping through — because a ball falling through a net is nearer to
// the camera than the net's front cords, and drawing it behind them makes a
// clean bucket look like it bounced off the front of the rim.
//
// A SPLATTED BALL IS NOT DRAWN. Once it has burst there is no ball any more —
// the decal at that spot IS the ball, added to the field on the same tick the
// physics reported it, so the swap is seamless. Drawing the sprite as well
// would leave a snowball hanging on the wall in front of its own splat.

import { PROJECTION_ORIGIN_X } from "../sim/constants.js";
import { ballScreenRadius, projectPoint } from "../sim/projection.js";
import { drawBall } from "./ball.js";
import { drawBackboard, drawNet, drawRim } from "./hoop.js";
import { clearScene, drawBallShadow, drawRoom } from "./scene.js";
import { drawSplatDecals, drawSplatParticles } from "./splats.js";
import { drawAim } from "./aim.js";

/**
 * Draw one frame.
 *
 * @param view everything the frame needs, already resolved — this function
 *   computes no game state and reads no store.
 */
export function renderFrame(ctx, view) {
  const { ball, hoop, backdrop, ballFrames, ballId, pull, trajectory, kicks, scored, splats, splatImages } = view;
  // The one question the splat asks of the composition below: is there still a
  // ball to draw at all?
  const hasBall = !ball.splat;

  clearScene(ctx);
  drawRoom(ctx, backdrop);
  // Decals go on the room itself, under everything — a splat on the back wall
  // belongs behind the backboard that is bolted over it. The powder goes on
  // top of them and behind the hoop, which is where it was thrown from.
  if (splats) {
    drawSplatDecals(ctx, splats, { images: splatImages });
    drawSplatParticles(ctx, splats);
  }
  if (hasBall) drawBallShadow(ctx, ball);

  drawBackboard(ctx, hoop);
  drawNet(ctx, hoop, true, kicks.net);
  drawRim(ctx, hoop, true, kicks.rim);

  if (pull) drawAim(ctx, { pull, trajectory });

  const screen = projectPoint(ball);
  const radius = ballScreenRadius(ball.z);

  if (pull) {
    // Pulling: the ball is in the player's hand at the pull position, not at its
    // world position, and it swells slightly with the draw.
    drawNet(ctx, hoop, false, kicks.net);
    drawRim(ctx, hoop, false, kicks.rim);
    if (hasBall) {
      drawBall(ctx, {
        frames: ballFrames,
        ballId,
        x: pull.visualX,
        y: pull.visualY,
        radius: radius * (1 + pull.power * 0.075),
        rollPhase: ball.rollPhase,
      });
    }
    return;
  }

  const droppingThroughNet = scored && ball.z > 0.55 && screen.y < hoop.rimY + 92;

  if (droppingThroughNet) {
    if (hasBall) drawBall(ctx, { frames: ballFrames, ballId, x: screen.x, y: screen.y, radius, rollPhase: ball.rollPhase });
    drawNet(ctx, hoop, false, kicks.net);
    drawRim(ctx, hoop, false, kicks.rim);
    return;
  }

  drawNet(ctx, hoop, false, kicks.net);
  drawRim(ctx, hoop, false, kicks.rim);
  if (hasBall) drawBall(ctx, { frames: ballFrames, ballId, x: screen.x, y: screen.y, radius, rollPhase: ball.rollPhase });
}

/** Where the ball is on screen, for hit-testing the start of a pull. */
export function ballScreenPosition(ball) {
  const screen = projectPoint(ball);
  return { x: screen.x, y: screen.y, radius: ballScreenRadius(ball.z) };
}

/** The resting screen position of the ball, used to anchor a fresh pull. */
export function restingBallPosition() {
  return { x: PROJECTION_ORIGIN_X, y: projectPoint({ x: 0, y: 0.1, z: 0 }).y };
}
