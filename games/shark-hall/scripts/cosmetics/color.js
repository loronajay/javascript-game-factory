// Colour arithmetic, so "is this ball set readable?" is a measurement.
//
// PURE. Strings in, numbers out. It exists because the readability rule for ball
// sets — cue, 8, solids, stripes and the number all obviously distinguishable —
// is the one cosmetic rule that can actually be violated by a pretty palette,
// and a flag an author sets by hand is a flag an author sets wrongly. The
// catalog DECLARES readability; `ball-sets` computes it; the test asserts the
// two agree. That is the only arrangement where the declaration means anything.

/** `#rgb` or `#rrggbb` to `{ r, g, b }` in 0-255. Anything else reads as black. */
export function parseHex(value) {
  const text = String(value || "").trim().replace(/^#/, "");
  const full = text.length === 3 ? text.split("").map((c) => c + c).join("") : text;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** Perceived lightness, 0-1. The usual luma weights; good enough to separate ink from ground. */
export function luminance(value) {
  const { r, g, b } = parseHex(value);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * How far apart two colours look, 0-1.
 *
 * Euclidean in RGB with the green channel weighted, normalized by the longest
 * possible distance. Not a perceptual space, and deliberately not: this is a
 * threshold check with a wide margin, and a redistributable 12-line function
 * beats a colour-science dependency for it.
 */
export function distance(a, b) {
  const x = parseHex(a);
  const y = parseHex(b);
  const dr = (x.r - y.r) / 255;
  const dg = (x.g - y.g) / 255;
  const db = (x.b - y.b) / 255;
  return Math.sqrt((dr * dr * 2 + dg * dg * 4 + db * db * 3) / 9);
}

/** The separation two ball colours must clear to count as telling apart. */
export const READABLE_DISTANCE = 0.12;

/** Whether two colours are far enough apart to name across a table. */
export function distinct(a, b, threshold = READABLE_DISTANCE) {
  return distance(a, b) >= threshold;
}
