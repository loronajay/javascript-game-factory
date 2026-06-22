// Deterministic, serializable PRNG for authoritative gameplay.
//
// The prototype used Math.random() directly inside the controller. That is not
// acceptable for a platform game: single player, hot seat, online host, and
// replay tests must all reproduce identical dice from the same seed and the
// same command sequence. This module is the only source of authoritative
// randomness. Rendering may still use Math.random() for cosmetic shuffles
// (e.g. the dice tumble animation) because that never touches game state.
//
// The generator is mulberry32, written as a pure step so the state can live
// inside the serialized match state. `nextRandom`/`rollD6` never mutate their
// input; they return the advanced state alongside the value.

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

// Resolve a single six-sided die. Returns the roll (1..6) and advanced state.
export function rollD6(state) {
  const { value, state: nextState } = nextRandom(state);
  return { roll: 1 + Math.floor(value * 6), rngState: nextState };
}
