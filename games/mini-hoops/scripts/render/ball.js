// The ball sprite.
//
// The frame is chosen from the ball's real angular position, not from an
// animation timer — see `assets/ball-catalog.js`. That is what makes a fast shot
// visibly spin faster than a lob, and what makes a ball scrubbed by the rim
// visibly slow its roll, without any of that being animated by hand.

import { ballFrameIndex } from "../assets/ball-catalog.js";

/**
 * Draw a ball.
 *
 * @param frames decoded images for this ball, in roll order
 * @param ballId which ball, for frame-count lookup
 * @param filter a canvas filter string for aerial perspective, from
 *   `render/scene.js`. Applied to the placeholder as well, so a ball deep in the
 *   room does not brighten up for the frames it is still decoding.
 */
export function drawBall(ctx, { frames, ballId, x, y, radius, rollPhase, alpha = 1, filter = null }) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (filter) ctx.filter = filter;
  ctx.translate(x, y);

  const frame = frames?.[ballFrameIndex(ballId, rollPhase)];
  if (frame && frame.complete && frame.naturalWidth) {
    ctx.drawImage(frame, -radius, -radius, radius * 2, radius * 2);
  } else {
    // Placeholder while frames decode, per the repo's Code-As-Asset rule. Never
    // let a missing image become a missing ball.
    ctx.fillStyle = "#d76a28";
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
