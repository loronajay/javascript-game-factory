// Ball sets, and the one cosmetic rule with teeth.
//
// A cloth can be any colour anybody likes. A ball set cannot: the player has to
// name the cue ball, the 8, a solid, a stripe and a NUMBER across a table, in a
// dark room, at a glance, and a set that is beautiful and ambiguous is a set
// that loses racks. So every set here carries a declared `readability` block,
// `readabilityOf` computes the same block from the actual colours, and
// `tests/cosmetics.test.js` asserts the two agree. A pretty palette that fails
// the measurement fails the suite.
//
// PURE. Colours and numbers; `render/textures.js` is what turns one into pixels.
//
// NUMBERING IS BY CONVENTION, NOT BY DATA: a set lists seven solids, and the
// stripes are the same seven hues banded on a light ground (9 shares 1's hue,
// 15 shares 7's). That is how a real set works, and it is what stops a set from
// declaring a stripe whose colour matches nobody's solid.

import { distinct } from "./color.js";

/** Which solid's hue a numbered ball wears. 0 is the cue; 8 is its own colour. */
export function hueIndexFor(n) {
  if (n === 0 || n === 8) return null;
  return n > 8 ? n - 8 : n;
}

/** The face colour of one ball in a set — the ground for a solid, the band for a stripe. */
export function ballColorIn(set, n) {
  if (n === 0) return set.cue;
  if (n === 8) return set.eight;
  const index = hueIndexFor(n);
  return set.solids[index - 1] || set.cue;
}

/** Whether a ball is banded rather than painted through. */
export const isStriped = (n) => n > 8;

/**
 * Readability, measured off the palette rather than asserted by its author.
 *
 * The five things a player must be able to tell apart, in the order the product
 * rule names them. `numbered` deliberately does NOT require the number ring to
 * differ from the stripe ground: on a real striped ball the ring IS the ground,
 * and the digit reads off its own ink.
 */
export function readabilityOf(set) {
  const solids = set.solids || [];
  const everySolid = (test) => solids.length === 7 && solids.every(test);
  return {
    cueDistinct: distinct(set.cue, set.eight) && everySolid((color) => distinct(set.cue, color)),
    eightDistinct: distinct(set.eight, set.cue) && everySolid((color) => distinct(set.eight, color)),
    solidsDistinct: solids.every((color, i) => solids.every((other, j) => i === j || distinct(color, other))),
    stripesDistinct: everySolid((color) => distinct(set.stripeBase, color)),
    numbered:
      set.numbers === true &&
      distinct(set.numberRing, set.numberInk) &&
      distinct(set.numberRing, set.eight) &&
      everySolid((color) => distinct(set.numberRing, color)),
  };
}

/** Gloss is shared: these are all phenolic resin balls under the same lamp. */
const RESIN = Object.freeze({ roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08 });

/** A set, with its readability filled in by measurement. Never hand-write that block. */
const set = (presentation) => Object.freeze({ ...presentation, gloss: RESIN, readability: Object.freeze(readabilityOf(presentation)) });

/**
 * The house set: the sixteen colours the cabinet shipped with.
 *
 * This palette is the reference every other set is checked against by eye, and
 * `balls.classic` is the loadout default, so it is the one set that must never
 * be removed — `loadout.js` falls back to it.
 */
export const CLASSIC = set({
  cue: "#f5f4ef",
  eight: "#111111",
  solids: ["#f2c500", "#1f4ea8", "#b62028", "#62227c", "#db6715", "#126f39", "#6e1b25"],
  stripeBase: "#f5f4ef",
  stripeWidth: 0.41,
  numberRing: "#f5f4ef",
  numberInk: "#111111",
  ringStroke: null,
  numbers: true,
});

/** Cooler and deeper, to sit on a dark cloth without glowing. */
export const MIDNIGHT = set({
  cue: "#eef1f5",
  eight: "#0a0c10",
  solids: ["#e0b021", "#2f6fd0", "#c3324a", "#7a3fa8", "#e07a2c", "#1f8f63", "#8a4b2a"],
  stripeBase: "#e9edf2",
  stripeWidth: 0.41,
  numberRing: "#f2f5f8",
  numberInk: "#0a0c10",
  numbers: true,
});

/** Antique phenolic: warm, slightly yellowed, like a set that has been racked for thirty years. */
export const BRASS_HALL = set({
  cue: "#f4ead2",
  eight: "#1a1512",
  solids: ["#d9a318", "#24548f", "#b8332b", "#7a4d9c", "#c96a22", "#3f7a4a", "#5e2418"],
  stripeBase: "#f1e6cd",
  stripeWidth: 0.44,
  numberRing: "#faf3e2",
  numberInk: "#1a1512",
  numbers: true,
});

/** Loud on purpose. High chroma, still on a light stripe ground so the bands read. */
export const NEON_RUN = set({
  cue: "#fbfdff",
  eight: "#141018",
  solids: ["#f6e01a", "#1fa8e8", "#ff2d6a", "#a24cff", "#ff7a12", "#20d17a", "#c2185b"],
  stripeBase: "#f7f9fc",
  stripeWidth: 0.44,
  numberRing: "#ffffff",
  numberInk: "#141018",
  numbers: true,
});

/** Tournament stock: saturated, unornamented, biggest numbers. Made for a camera. */
export const TOURNAMENT = set({
  cue: "#fffdf6",
  eight: "#0d0d0d",
  solids: ["#ffcc00", "#0d47a1", "#c62828", "#6a1b9a", "#ef6c00", "#1b7a3a", "#7f2b1e"],
  stripeBase: "#fffdf6",
  stripeWidth: 0.47,
  numberRing: "#fffdf6",
  numberInk: "#0d0d0d",
  numbers: true,
});

/**
 * Casino: house-chip colours with a gilt ring around every number.
 *
 * `ringStroke` is the only optional field a set carries — an outline drawn
 * around the number circle. It is why this set does not read as "classic with
 * different reds": the gold ring is visible at table distance where a hue shift
 * of ten degrees is not.
 */
export const CASINO = set({
  cue: "#fff8e7",
  eight: "#0d0d0f",
  solids: ["#e0b429", "#2453a8", "#c62233", "#6b2a8f", "#e2701c", "#12804a", "#7a1420"],
  stripeBase: "#fff8e7",
  stripeWidth: 0.43,
  numberRing: "#fff8e7",
  numberInk: "#0d0d0f",
  ringStroke: "#c9a227",
  numbers: true,
});

export const BALL_SETS = Object.freeze({ CLASSIC, CASINO, MIDNIGHT, BRASS_HALL, NEON_RUN, TOURNAMENT });
