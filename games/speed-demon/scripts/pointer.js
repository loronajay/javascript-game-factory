// Mouse and touch.
//
// A separate module from `input.js` because it has a problem the keyboard does
// not: the canvas is drawn in world coordinates (1280x720) but displayed at
// whatever size fits the window, so every event has to be mapped back before it
// means anything. That mapping is the whole job here.
//
// Clicks are **queued** exactly as key presses are, so they land on a tick
// boundary and go through the same handlers. Hover is **sampled**, because it is
// a position rather than an event — the same split `input.js` makes between the
// throttle and everything else.
//
// This exists because the game draws things that look like buttons. A canvas
// faceplate with five drawn buttons on it is a promise to the player, and a
// promise the keyboard alone does not keep.

export const ACTION_CLICK = "click";

/**
 * Maps a viewport point onto the world. The canvas is letterboxed by CSS, so the
 * bounding rect is the source of truth for both scale and offset — reading them
 * back off the element rather than recomputing keeps this correct through a
 * resize without having to be told about one.
 */
export function toWorld(rect, world, clientX, clientY) {
  if (!rect || rect.width === 0 || rect.height === 0) {
    return null;
  }
  return {
    x: ((clientX - rect.left) / rect.width) * world.width,
    y: ((clientY - rect.top) / rect.height) * world.height,
  };
}

export function createPointer(canvas, world) {
  let queue = [];
  let hover = null;
  /** Set while a button is held, so a drag along the volume bar keeps tracking. */
  let dragging = false;

  const locate = (event) => toWorld(canvas.getBoundingClientRect(), world, event.clientX, event.clientY);

  const onMove = (event) => {
    hover = locate(event);
    if (dragging && hover) {
      // A held drag reads as a stream of clicks. That is what makes dragging the
      // volume bar work without the bar needing its own gesture concept.
      queue.push({ type: ACTION_CLICK, ...hover, dragging: true });
    }
  };

  const onDown = (event) => {
    const point = locate(event);
    if (!point) {
      return;
    }
    dragging = true;
    hover = point;
    queue.push({ type: ACTION_CLICK, ...point, dragging: false });
    // Stops a click from selecting the page furniture around the canvas, and
    // stops touch from scrolling the page out from under the game.
    event.preventDefault();
  };

  const onUp = () => {
    dragging = false;
  };

  const onLeave = () => {
    hover = null;
    dragging = false;
  };

  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", onDown);
  // On window, not the canvas: releasing outside the canvas still ends the drag.
  window.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointerleave", onLeave);

  return {
    /** Where the cursor is in world coordinates, or null if it is not over the canvas. */
    hover() {
      return hover;
    },
    drain() {
      const clicks = queue;
      queue = [];
      return clicks;
    },
    destroy() {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
    },
  };
}
