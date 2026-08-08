// How a neutral body becomes a coloured one.
//
// PURE. Pixel classification and colour maths only — no canvas, no image data
// objects. `render/livery.js` walks the pixels and calls in here; keeping the
// rules on this side is what lets a test assert that a tail light stays a tail
// light without standing up a browser. `bodyCoverageMap` needs a whole frame
// rather than one pixel, but it still only takes and returns plain arrays.
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
//
// **Two things here are answers to a repainted car looking patchy**, and both
// are worth understanding before touching them:
//
//   - The thresholds are the *centre* of the decision, not the edge of it.
//     `paintFeather` ramps between them and the fade floors, because a hard cut
//     through a shading gradient leaves a ragged one-pixel boundary wandering
//     across the bodywork. `bodyCoverageMap` is what stops that ramp reaching
//     the glass.
//   - `paintPixel` is pigment *plus clearcoat*, not a bare multiply. A multiply
//     alone destroyed most of the artwork's shading at any saturated colour —
//     measured, a deep red kept 45 of the source's 201 luma range.
//
// Neither loosens what counts as bodywork: `classifyPixel` still answers that,
// and still answers it exactly as before.

export const REGION_BODY = "body";
export const REGION_CABIN = "cabin";
export const REGION_LAMP = "lamp";
export const REGION_OTHER = "other";

/** Bodywork is desaturated and not in shadow. */
export const BODY_MAX_SATURATION = 0.16;
export const BODY_MIN_LUMINANCE = 60;

/**
 * Where paint stops entirely, as opposed to where it stops being *certain*.
 *
 * The two thresholds above are a cliff: a pixel at luminance 61 was painted and
 * its neighbour at 59 was not, with nothing in between. Every shading gradient
 * on the car crosses that cliff somewhere, so the boundary wandered through the
 * artwork as a ragged one-pixel line — measured at 872 such pixels on the
 * Skyward R and 4686 on the Vega QV, which is what read as mottled patches on a
 * repainted car. Feathering between the two pairs below turns the cliff into a
 * ramp, so a crease shadow fades into the paint instead of stopping dead.
 *
 * The floors are where genuinely-not-paint things live: measured glass sits
 * around luminance 40, the outline stroke is a near-black purple, and the tyres
 * are darker still. See `bodyCoverageMap` for the other half of the rule — the
 * feather alone would start painting windscreen reflections.
 */
export const PAINT_FADE_LUMINANCE = 44;
export const PAINT_FADE_SATURATION = 0.32;

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

/**
 * How bright a colour *looks*, as opposed to how bright its strongest channel
 * is. `luminanceOf` is the right measure for lifting shading out of the art —
 * it is what the painter varied — but it says a saturated red and white are
 * equally bright, which they are not. Only `paintPixel` needs the difference,
 * to work out how much brightness a pigment costs.
 */
export function perceivedLuminanceOf(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** A Hermite ramp, so a feather has no visible seam at either end. */
function smoothstep(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
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
 * How much of this pixel is paint, judged on colour alone: 1 for confident
 * bodywork, 0 for confidently something else, and a ramp between.
 *
 * Red-dominant pixels are excluded outright rather than feathered — the seats
 * and the lamp lenses are the two things the classifier must never soften on,
 * and they are the only strongly-red things on a neutral car.
 */
export function paintFeather(r, g, b) {
  if (isRedDominant(r, g, b)) return 0;
  const byLuminance = smoothstep(
    (luminanceOf(r, g, b) - PAINT_FADE_LUMINANCE) / (BODY_MIN_LUMINANCE - PAINT_FADE_LUMINANCE),
  );
  const bySaturation = 1 - smoothstep(
    (saturationOf(r, g, b) - BODY_MAX_SATURATION) / (PAINT_FADE_SATURATION - BODY_MAX_SATURATION),
  );
  return Math.min(byLuminance, bySaturation);
}

/**
 * How far from certain bodywork a feathered pixel may sit and still count as
 * bodywork. One pixel: a crease shadow is a thin band with lit paint either
 * side of it, so it always has a neighbour.
 */
export const PAINT_FEATHER_RADIUS = 1;

/**
 * Per-pixel paint coverage for a whole frame, as a 0–1 map.
 *
 * PURE — it takes a plain RGBA byte array and returns a plain float array, so it
 * is testable without a canvas even though it is the one rule here that cannot
 * be decided from a single pixel.
 *
 * **Why a neighbourhood is needed at all.** Below `BODY_MIN_LUMINANCE`, a dark
 * neutral pixel is ambiguous: it is either a shadow along a panel crease (paint,
 * and the thing that was mottling) or it is glass (emphatically not paint).
 * Colour cannot separate them — measured, 10.2% of the glass on the roster sits
 * inside the feather band, and 33.5% of it on the Vega QV — so this asks a
 * structural question instead. A crease is a thin band with lit paint beside it;
 * a windscreen reflection sits in the middle of a large dark field. Gating the
 * feather on having a confident-bodywork neighbour rescues 14,699 pixels across
 * the 24 models and leaves the windows alone.
 *
 * What does still pick up coverage is the one-pixel rim around each window,
 * which is the frame — bodywork — so it is meant to be painted.
 */
export function bodyCoverageMap(pixels, width, height) {
  const coverage = new Float32Array(width * height);
  const confident = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    const yFraction = y / height;
    for (let x = 0; x < width; x += 1) {
      const k = y * width + x;
      const i = k * 4;
      if (pixels[i + 3] === 0) continue;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      if (classifyPixel(r, g, b, yFraction) === REGION_BODY) {
        confident[k] = 1;
        coverage[k] = 1;
        continue;
      }
      coverage[k] = paintFeather(r, g, b);
    }
  }

  // Second pass: a feathered pixel only keeps its coverage if certain bodywork
  // is within reach. Read from `confident` rather than from `coverage` so this
  // cannot cascade outward from one feathered pixel to the next.
  const R = PAINT_FEATHER_RADIUS;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const k = y * width + x;
      if (confident[k] || coverage[k] <= 0) continue;
      let touchesBody = false;
      for (let dy = -R; dy <= R && !touchesBody; dy += 1) {
        for (let dx = -R; dx <= R; dx += 1) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy < 0 || xx < 0 || yy >= height || xx >= width) continue;
          if (confident[yy * width + xx]) { touchesBody = true; break; }
        }
      }
      if (!touchesBody) coverage[k] = 0;
    }
  }
  return coverage;
}

/**
 * How a finish reshapes the body's own shading before the colour goes on.
 * `gloss` is the identity because the art already carries gloss highlights —
 * the other two adjust the contrast of that existing shading rather than
 * relighting the car, which no amount of per-pixel work could do convincingly
 * from a flat top-down image.
 *
 * Matte used to compress much harder than this (0.6). It no longer has to:
 * killing the specular highlight is what makes a finish read as matte, and
 * `specularOf` now does that on its own, so this can keep the panel shading
 * legible instead of paying for the effect twice.
 */
const FINISH_CONTRAST = { gloss: 1, matte: 0.78, metallic: 1.22 };

export function finishCurve(finish, normalizedLuminance) {
  const l = Math.min(1, Math.max(0, normalizedLuminance));
  const contrast = FINISH_CONTRAST[finish] ?? FINISH_CONTRAST.gloss;
  return Math.min(1, Math.max(0, 0.5 + (l - 0.5) * contrast));
}

/**
 * The clearcoat highlight, as a 0–1 strength for a pixel of a given brightness.
 *
 * **A highlight is the colour of the light, not of the pigment**, and that is
 * the whole reason this exists. Multiplying a tint through the artwork is right
 * for pigment but wrong for a reflection: it drags the specular down to the
 * pigment's own brightness, and a saturated hue has very little. Measured on the
 * Skyward R, the body's luma range fell from 201 in the source art to 45 under a
 * deep red — 78% of the shading gone, which is why a repainted car went flat and
 * plasticky and why what noise remained read as blotches. Red is the worst case
 * because it carries the least perceived brightness of any primary.
 *
 * `start` is where the clearcoat catches, `exponent` how tightly it focuses.
 */
export const SPECULAR_BY_FINISH = {
  gloss: { start: 0.70, gain: 0.85, exponent: 1.9 },
  metallic: { start: 0.62, gain: 1.05, exponent: 1.5 },
  matte: { start: 0.86, gain: 0.22, exponent: 2.6 },
};

export function specularOf(finish, normalizedLuminance) {
  const curve = SPECULAR_BY_FINISH[finish] ?? SPECULAR_BY_FINISH.gloss;
  const l = Math.min(1, Math.max(0, normalizedLuminance));
  if (l <= curve.start) return 0;
  return curve.gain * ((l - curve.start) / (1 - curve.start)) ** curve.exponent;
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
 * Repaints one bodywork pixel, as pigment plus clearcoat.
 *
 * The pigment term is a multiply: the body's own luminance carries the shading,
 * so the tint scales it rather than replacing it, which is what keeps panel
 * creases and the shadow under a spoiler readable at any colour. The clearcoat
 * term is *added* on top, because a highlight is a reflection of the light
 * source rather than of the paint — a specular on a red car is white.
 *
 * **The clearcoat is scaled by exactly the brightness the pigment cost**, so at
 * saturation 0 the tint is white, costs nothing, and adds nothing: factory
 * silver stays a bit-exact identity rather than becoming a special case.
 */
export function paintPixel(r, g, b, { hue, saturation, brightness, finish }) {
  const l = luminanceOf(r, g, b) / 255;
  const shade = finishCurve(finish, l) * brightness;
  const [tr, tg, tb] = paintTint(hue, saturation);
  const pigmentCost = 1 - perceivedLuminanceOf(tr, tg, tb) / 255;
  const clearcoat = specularOf(finish, l) * pigmentCost * 255 * brightness;
  return [
    Math.min(255, tr * shade + clearcoat),
    Math.min(255, tg * shade + clearcoat),
    Math.min(255, tb * shade + clearcoat),
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
