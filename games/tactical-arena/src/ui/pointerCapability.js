// "Is this a touch device?" — the one answer the rest of the UI should ask for.
//
// `(pointer: coarse)` is the right CSS media feature and the game's stylesheets use
// it everywhere. It is NOT reliable from JavaScript in the packaged Android app: the
// Capacitor WebView reports both `pointer: coarse` and `any-pointer: coarse` as FALSE
// while maxTouchPoints is 5 and touch events fire (measured on a Pixel 3a — the same
// finding that forced mobile/tactical-arena/scripts/enable-touch-css.mjs to strip the
// condition out of the shipped stylesheets).
//
// So any JS gate written as a bare matchMedia("(pointer: coarse)") is silently OFF in
// the shipped app — on the exact devices it exists to protect. Every such gate must
// also consult navigator.maxTouchPoints, which the WebView does report correctly.
//
// Keep this the single definition. boardCameraController.js and boardTouchAssist.js
// already had their own correct copies; they now import this one instead.
export function isCoarsePointer(windowRef = globalThis.window) {
  return Boolean(
    windowRef?.matchMedia?.("(pointer: coarse)")?.matches ||
      Number(windowRef?.navigator?.maxTouchPoints) > 0,
  );
}

// A coarse-pointer-scoped media query, evaluated the way the app actually needs it:
// the touch half comes from isCoarsePointer, the rest from matchMedia. Use this
// instead of folding `(pointer: coarse)` into a larger query string, which loses the
// maxTouchPoints fallback for the whole query.
export function matchesCoarseQuery(query, windowRef = globalThis.window) {
  if (!isCoarsePointer(windowRef)) return false;
  if (!query) return true;
  try {
    return Boolean(windowRef?.matchMedia?.(query)?.matches);
  } catch {
    return false;
  }
}
