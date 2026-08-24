// Pointer events -> canvas coordinates.
//
// The canvas is a fixed 960x760 drawing surface displayed at whatever size the
// layout gives it, so every pointer position has to be mapped back through that
// ratio. Getting this wrong is the classic "aiming is offset on mobile" bug, and
// it is why the conversion lives in exactly one place.

import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../sim/constants.js";

/** Convert a pointer event to canvas coordinates. */
export function canvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  // A zero-sized rect happens if the canvas is measured while hidden. Bail to
  // the centre rather than dividing by zero.
  if (!rect.width || !rect.height) return { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
  return {
    x: ((event.clientX - rect.left) * CANVAS_WIDTH) / rect.width,
    y: ((event.clientY - rect.top) * CANVAS_HEIGHT) / rect.height,
  };
}

/**
 * Is this point close enough to the ball to start a pull?
 *
 * The grab radius is generously larger than the ball. On a phone the ball is
 * roughly a fingertip across, and demanding a precise hit on it would make the
 * game feel unresponsive rather than difficult.
 */
export function isGrab(point, ballScreen) {
  const radius = Math.max(52, ballScreen.radius * 2.25);
  return Math.hypot(point.x - ballScreen.x, point.y - ballScreen.y) <= radius;
}
