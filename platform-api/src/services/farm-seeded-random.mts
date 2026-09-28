// Deterministic randomness for the farm's day-keyed catalogs (the Order Board,
// the Market's day prices, the Seed Merchant's specials). Each is a pure
// function of the UTC day, so everyone in the shared square sees the same
// thing and nothing has to be stored to rotate it.

/** FNV-1a: a stable 32-bit seed from a name like "farm-orders:v1:<day>". */
export function farmSeedFor(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: a small seeded generator of [0, 1). */
export function farmSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
