// How a neutral body becomes a coloured one.
//
// PURE. Pixel classification and colour maths only — no canvas, no image data
// objects. `render/livery.js` walks the pixels and calls in here; keeping the
// rules on this side is what lets a test assert that a tail light stays a tail
// light without standing up a browser.
//
// **The whole system rests on the bodies being neutral.** Measured roof
// saturation across all 24 models runs 0.006–0.041, so "is this pixel
// bodywork?" is answerable from the pixel itself: paint is desaturated and
// reasonably bright, while the seats are strongly red, the glass and tyres are
// dark, and the outline stroke is a near-black purple. If a future sheet ships
// with pre-coloured bodies this classifier stops working, and the fix is to
// author a mask channel rather than to widen the thresholds until it "mostly"
// works — a widened threshold silently starts painting the seats.
//
// The thresholds below were measured against both sheets, not guessed: they
// classify 60.7% of models-a and 62.2% of models-b as paintable bodywork, and a
// rendered check confirmed seats, glass, lamps, tyres, spoilers and the outline
// are all correctly left alone.

export const REGION_BODY = "body";
export const REGION_CABIN = "cabin";
export const REGION_LAMP = "lamp";
export const REGION_OTHER = "other";

/** Bodywork is desaturated and not in shadow. */
export const BODY_MAX_SATURATION = 0.16;
export const BODY_MIN_LUMINANCE = 60;

/** A pixel is "red" enough to be interior trim or a lamp lens. */
export const RED_DOMINANCE = 25;

/**
 * Where the cabin ends and the tail lights begin, as a fraction of frame height.
 *
 * The cars are drawn nose-up, so the rear — and the lamps — sit at the *bottom*
 * of the frame. Two separate red bands exist on every model: the seat harness
 * through the rear window at roughly 0.42–0.57, and the lamp lenses at
 * 0.77–0.83. Splitting between them is what stops window tint from dimming the
 * tail lights and stops a tail-light hue shift from recolouring the seats.
 */
export const LAMP_BAND_START = 0.68;

/** Bodywork above this is glass/interior rather than paint. */
export const CABIN_BAND_START = 0.10;

export function luminanceOf(r, g, b) {
  return Math.max(r, g, b);
}

export function saturationOf(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

function isRedDominant(r, g, b) {
  return r - g >= RED_DOMINANCE && r - b >= RED_DOMINANCE;
}

/**
 * Which part of the car a pixel belongs to. `yFraction` is the pixel's position
 * down its own frame (0 at the nose, 1 at the tail), which is the only extra
 * information needed to tell the two red bands apart.
 */
export function classifyPixel(r, g, b, yFraction) {
  if (isRedDominant(r, g, b)) {
    return yFraction >= LAMP_BAND_START ? REGION_LAMP : REGION_CABIN;
  }
  const luminance = luminanceOf(r, g, b);
  if (saturationOf(r, g, b) <= BODY_MAX_SATURATION && luminance >= BODY_MIN_LUMINANCE) {
    return REGION_BODY;
  }
  // Dark and neutral inside the cabin band is glass; the same signature at the
  // very top or bottom of the frame is a tyre, a splitter or the outline, and
  // darkening those with window tint would be invisible at best and muddy the
  // silhouette at worst.
  if (luminance < BODY_MIN_LUMINANCE && yFraction >= CABIN_BAND_START && yFraction < LAMP_BAND_START) {
    return REGION_CABIN;
  }
  return REGION_OTHER;
}

/**
 * How a finish reshapes the body's own shading before the colour goes on.
 * `gloss` is the identity because the art already carries gloss highlights —
 * the other two adjust the contrast of that existing shading rather than
 * relighting the car, which no amount of per-pixel work could do convincingly
 * from a flat top-down image.
 */
export function finishCurve(finish, normalizedLuminance) {
  const l = Math.min(1, Math.max(0, normalizedLuminance));
  if (finish === "matte") {
    // Pull the highlights down and lift the shadows: less range, no specular.
    return 0.5 + (l - 0.5) * 0.6;
  }
  if (finish === "metallic") {
    // Widen the range so highlights read as a bright flake and shadows deepen.
    return Math.min(1, Math.max(0, 0.5 + (l - 0.5) * 1.3));
  }
  return l;
}

/**
 * The fully-saturated RGB for a hue, as a plain 0–255 triple. Written out rather
 * than pulled from a colour library because it is six lines and the cabinet has
 * no dependencies.
 */
export function hueToRgb(hue) {
  const h = (((hue % 360) + 360) % 360) / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  const [r, g, b] = h < 1 ? [1, x, 0]
    : h < 2 ? [x, 1, 0]
    : h < 3 ? [0, 1, x]
    : h < 4 ? [0, x, 1]
    : h < 5 ? [x, 0, 1]
    : [1, 0, x];
  return [r * 255, g * 255, b * 255];
}

/**
 * The colour a paint multiplies by: the hue mixed toward white by however
 * desaturated it is. At saturation 0 this is pure white, which is why a
 * saturation-0 livery leaves the body exactly as painted — the factory silver
 * is not a special case, it is the identity of this operation.
 */
export function paintTint(hue, saturation) {
  const [r, g, b] = hueToRgb(hue);
  const s = Math.min(1, Math.max(0, saturation));
  return [255 + (r - 255) * s, 255 + (g - 255) * s, 255 + (b - 255) * s];
}

/**
 * Repaints one bodywork pixel. The body's own luminance carries the shading, so
 * the tint multiplies it rather than replacing it — that is what keeps panel
 * creases, reflections and the shadow under the spoiler readable at any colour.
 */
export function paintPixel(r, g, b, { hue, saturation, brightness, finish }) {
  const shade = finishCurve(finish, luminanceOf(r, g, b) / 255) * brightness;
  const [tr, tg, tb] = paintTint(hue, saturation);
  return [
    Math.min(255, tr * shade),
    Math.min(255, tg * shade),
    Math.min(255, tb * shade),
  ];
}

/**
 * Darkens glass and the interior behind it. A real tint hides what is behind the
 * glass, so this desaturates toward the darkened grey as it goes — at full tint
 * the red seats are gone, which is the entire visible point of the option.
 */
export function tintCabinPixel(r, g, b, amount) {
  const t = Math.min(1, Math.max(0, amount));
  const darkened = 1 - t * 0.8;
  const grey = luminanceOf(r, g, b) * darkened;
  return [
    r * darkened * (1 - t) + grey * t,
    g * darkened * (1 - t) + grey * t,
    b * darkened * (1 - t) + grey * t,
  ];
}

/**
 * Recolours a lamp lens. The lens art is red, so its own red channel is the
 * brightness of the lens and the hue simply replaces which channel that
 * brightness lands in — a hue rotation would drag the dark surround with it.
 */
export function lampPixel(r, g, b, hue) {
  const intensity = luminanceOf(r, g, b) / 255;
  const [lr, lg, lb] = hueToRgb(hue);
  // Keep a little of the original so the lens keeps its internal detail rather
  // than flattening into one colour.
  const detail = Math.min(r, g, b) / 255;
  return [
    Math.min(255, lr * intensity + detail * 60),
    Math.min(255, lg * intensity + detail * 60),
    Math.min(255, lb * intensity + detail * 60),
  ];
}
