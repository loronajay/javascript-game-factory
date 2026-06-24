// Global animation-speed lever. The Settings "Animation speed" control sets one
// multiplier here and every scripted duration in the presentation layer reads it
// through scale() — so Slow/Normal/Fast/Instant re-pace the whole game from one
// place without threading a speed value through every renderer.
//
// Presentation only. The deterministic core/AI/tests never import this; pacing
// never affects rules or event order. A multiplier of 0 ("Instant") collapses
// every animation/beat to zero duration — animations still resolve, just at once.

let speedScale = 1;

// Lower = faster. Normal is 1; Instant is 0.
export function setSpeedScale(value) {
  const next = Number(value);
  speedScale = Number.isFinite(next) && next >= 0 ? next : 1;
}

export function getSpeedScale() {
  return speedScale;
}

// Scale a base duration (ms) by the current speed. Used for both Web-Animations
// durations and the controller's pacing sleeps.
export function scale(milliseconds) {
  return milliseconds * speedScale;
}
