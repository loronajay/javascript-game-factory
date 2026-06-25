// Deterministic, serializable PRNG for authoritative gameplay — ported from
// Mini-Tactics, the engine this game is built on. The prototype rolled with
// Math.random() inside the view, which can never be reproduced: hot-seat, CPU,
// online lockstep, and replay tests must all draw identical rolls from the same
// seed and command sequence. This module is the ONLY source of authoritative
// randomness; rendering may still use Math.random() for cosmetic tumbles because
// that never touches game state.
//
// mulberry32, written as a pure step so the state can live inside the serialized
// match state. `nextRandom`/`drawValue` never mutate their input — they return the
// advanced state alongside the value.

// Normalize an arbitrary seed into a 32-bit integer RNG state.
export function createRngState(seed) {
  const normalized = Number.isFinite(seed) ? Math.trunc(seed) : 1;
  return normalized | 0;
}

// Advance the state once and return a float in [0, 1) plus the new state.
export function nextRandom(state) {
  let a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: a | 0 };
}

// Draw a probability value in [0, 1). A caller may pin the draw with an explicit
// `override` (used by tests and recorded-roll replay); a pinned draw leaves the
// seed untouched so the authoritative stream stays aligned. Otherwise the value
// comes from the seed, which is advanced.
export function drawValue(rngState, override) {
  if (Number.isFinite(override)) return { value: override, rngState };
  const { value, state } = nextRandom(rngState);
  return { value, rngState: state };
}
