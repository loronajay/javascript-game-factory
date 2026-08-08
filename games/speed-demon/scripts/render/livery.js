// Turning a livery into pixels.
//
// Canvas only. Every rule about *what* a colour does lives in `garage/paint.js`,
// which is pure and tested; this module walks the pixels, calls in there, and
// caches the result. That split is deliberate — the interesting part of the
// paint system should not need a browser to test, and what is left here is thin
// enough to read in one sitting.
//
// **A tinted sprite is built once and reused.** Repainting 20,000 pixels per car
// per frame would be absurd at 60Hz, so a livery is baked into an offscreen
// canvas the first time it is asked for and drawn with a plain `drawImage`
// thereafter — the same trick `buildTrackTile` uses on the road. The cache key
// comes from `liveryKey`, which deliberately excludes underglow because that is
// drawn *under* the car rather than into the sprite.
//
// **The cache is bounded.** A player dragging along the hue wheel walks through
// dozens of liveries in a second, and an unbounded cache would hold a canvas for
// every one of them until the tab died. Oldest entries are evicted; rebuilding a
// sprite is a few milliseconds, so a miss costs a frame at worst.
//
// **A pixel is painted once, from a stack resolved before it is written.** The
// base paint (or its fade, sampled along one axis) goes down first and each
// layer blends over the result in order, and only then is the whole thing mixed
// into the source pixel by the bodywork coverage. Two consequences worth
// protecting:
//
//   - Every level of the stack reads the *original* pixel for its shading. A
//     layer painted over an already-painted pixel would apply the artwork's
//     shading twice and go muddy exactly where two colours meet — which is the
//     one place anybody is looking.
//   - Layers are gated by the same coverage map as the base, so a stripe cannot
//     run across the glass, the tyres or the outline however it is positioned.
//     That is what lets the player drag one anywhere without being able to break
//     the car.

import { liveryKey, createLivery, findFadeAxis } from "../garage/livery.js";
import {
  REGION_CABIN,
  REGION_LAMP,
  bodyCoverageMap,
  classifyPixel,
  preparePaint,
  paintWith,
  mixPaint,
  zoneWeight,
  curveOffset,
  shiftedZoneWeight,
  tintCabinPixel,
  lampPixel,
  hueToRgb,
} from "../garage/paint.js";

/**
 * How finely a fade is resolved before it is reused across pixels.
 *
 * A gradient's colour depends only on where a pixel sits along one axis, and
 * working it out means walking the hue wheel and weighing the result — real work
 * to repeat twenty thousand times a bake. So it is resolved into this many
 * prepared paints once and looked up per pixel instead. 64 steps across a ~300px
 * car is under 5px per step, and the fades are smooth by construction, so the
 * banding this could cause is well under one 8-bit level.
 */
export const FADE_STEPS = 64;

/**
 * Everything about a livery that does not depend on which pixel is being
 * painted, arranged so the pixel loop looks up rather than computes.
 *
 * **Every varying quantity here runs along exactly one axis**, and that is what
 * makes a multi-layer gradient affordable. A fade's colour depends only on
 * position along its own axis; a straight band's strength depends only on how
 * far down the car it is; a straight stripe's only on how far across. So each
 * becomes either a scalar the row loop refreshes once, or a lookup table indexed
 * by column — and the inner loop never calls `mixPaint` or `preparePaint` at
 * all.
 *
 * A *curved* layer is the exception and pays for it in the only way it can: the
 * displacement still runs along one axis and is still resolved here, but the
 * weight it feeds is two-dimensional, so that one layer costs an `edgeWeight`
 * per pixel. That is arithmetic and a smoothstep, against the `paintWith` the
 * pixel is already paying — measurably cheaper than the alternative of
 * tabulating a whole 2-D weight field per layer per bake.
 *
 * Getting this wrong is not a correctness bug, it is a frame-rate one: resolving
 * per pixel measured 17ms on a 251x346 car with a fade and four layers, which
 * misses a 60Hz frame, and the player who notices is the one dragging a colour
 * slider — a cache miss on every single frame.
 */
function preparePalette(livery, width) {
  const { paint, fade, layers } = livery;
  const axis = fade.enabled ? findFadeAxis(fade.axis) : null;
  const far = { hue: fade.hue, saturation: fade.saturation, brightness: fade.brightness, finish: paint.finish };
  const ramp = axis
    ? Array.from({ length: FADE_STEPS + 1 }, (_, step) =>
      preparePaint(mixPaint(paint, far, step / FADE_STEPS)))
    : [preparePaint(paint)];

  const rampAt = (xf, yf) =>
    ramp[Math.round(Math.min(1, Math.max(0, axis.at(xf, yf))) * FADE_STEPS)];

  return {
    ramp,
    // A fade along x varies within a row, so it is tabulated by column; a fade
    // along y is constant within a row and is resolved by `paintAt` instead.
    baseByColumn: axis?.along === "x"
      ? Array.from({ length: width }, (_, x) => rampAt((x + 0.5) / width, 0))
      : null,
    baseForRow: (yf) => (axis?.along === "y" ? rampAt(0, yf) : ramp[0]),

    layers: layers.map((layer) => {
      const stripe = layer.kind === "stripe";
      // A curved layer is the one thing here that genuinely varies in two
      // dimensions, so it cannot be reduced to a table or a scalar — but it can
      // still be reduced to *one* `edgeWeight` per pixel, because the
      // displacement runs along the cross axis alone. A band's offset is
      // therefore tabulated by column once for the whole bake, and a stripe's is
      // a single number the row loop refreshes. Nothing else changes: a straight
      // layer takes exactly the path it always did, so the common case pays
      // nothing for a control it is not using.
      const curved = layer.curve !== 0;
      return {
        prepared: preparePaint(layer.paint),
        layer,
        stripe,
        curved,
        // Same split: a stripe is a function of the column and is tabulated once
        // for the whole bake; a band is one number per row.
        byColumn: stripe && !curved
          ? Float32Array.from({ length: width }, (_, x) => zoneWeight(layer, (x + 0.5) / width, 0))
          : null,
        weightForRow: (yf) => (stripe || curved ? 0 : zoneWeight(layer, 0, yf)),
        offsetByColumn: curved && !stripe
          ? Float32Array.from({ length: width }, (_, x) => curveOffset(layer, (x + 0.5) / width))
          : null,
        offsetForRow: (yf) => (curved && stripe ? curveOffset(layer, yf) : 0),
      };
    }),
  };
}

/**
 * The per-model bodywork coverage map, cached.
 *
 * Coverage answers "which pixels of *this car* are paintable", which does not
 * depend on the colour at all — so recomputing it per livery spent 2.2ms a frame
 * re-deciding something that cannot have changed while the player drags a
 * slider. Small, because only the car being previewed and the two in a race are
 * ever live; each entry is about 300KB and holding all 24 would not be.
 */
export const COVERAGE_CACHE_LIMIT = 6;

function coverageFor(cache, model, pixels) {
  const cached = cache.get(model.id);
  if (cached) return cached;
  const coverage = bodyCoverageMap(pixels, model.sw, model.sh);
  cache.set(model.id, coverage);
  while (cache.size > COVERAGE_CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return coverage;
}

/**
 * How many baked sprites to keep. Sized for a player browsing the picker — the
 * 24 models plus a spread of colours — rather than for a whole session's worth
 * of experimentation.
 */
export const LIVERY_CACHE_LIMIT = 64;

/**
 * The two caches a bake reads, held together so callers pass one opaque handle.
 *
 * They are separate because they are keyed on different things and evict at
 * different rates: a sprite belongs to a (model, livery) pair and churns as fast
 * as a player drags a slider, while coverage belongs to the *model alone* and
 * cannot change while they do. Sharing one map would throw away the expensive
 * half every time the cheap half changed.
 */
export function createLiveryCache() {
  // Maps keep insertion order, which is all the eviction policy needs.
  return { sprites: new Map(), coverage: new Map() };
}

function imageReady(image) {
  return Boolean(image && image.complete && image.naturalWidth > 0);
}

/**
 * Bakes one model in one livery into an offscreen canvas.
 *
 * The frame is lifted at its native size, so the sprite keeps whatever
 * proportion the atlas measured — nothing here may assume a square frame, for
 * the same reason `carBox` exists.
 */
function bakeLiverySprite(image, model, livery, coverageCache) {
  const canvas = document.createElement("canvas");
  canvas.width = model.sw;
  canvas.height = model.sh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, model.sx, model.sy, model.sw, model.sh, 0, 0, model.sw, model.sh);

  const image_data = ctx.getImageData(0, 0, model.sw, model.sh);
  const pixels = image_data.data;
  const { paint, fade, layers, windowTint, tailLightHue } = livery;
  // Skip work that provably changes nothing. A factory-silver car is the common
  // case (it is the default, and it is what every un-customized opponent shows
  // up in), so it is worth not touching 20,000 pixels to produce the input.
  //
  // A fade or a layer counts as painting even over factory silver: both put a
  // second colour on a car whose base is the identity paint.
  const flatBase = paint.saturation === 0 && paint.brightness === 1 && paint.finish === "gloss";
  const paints = !flatBase || fade.enabled || layers.length > 0;

  /**
   * Whether the base paint can be left off the car entirely.
   *
   * **The identity paint is not the identity function**, and that distinction
   * caused a real bug. Painting multiplies a tint through the body's *luminance*,
   * so a white tint turns (200, 201, 201) into (201, 201, 201) — it replaces the
   * pixel's own faint chroma with its brightest channel. Over a coloured paint
   * that is exactly right and is the whole design. Over factory silver it is a
   * quiet desaturation of the artwork.
   *
   * That never showed before because a factory car skipped the pixel loop
   * altogether. Layers changed the arithmetic: a silver car with one stripe has
   * to run the loop, and every body pixel outside the stripe was coming back
   * subtly flatter than the art. Skipping the base restores it exactly, and is
   * cheaper than painting it.
   *
   * A fade rules it out because only one end of the ramp is the identity.
   */
  const skipBase = flatBase && !fade.enabled;
  const tints = windowTint > 0;
  const relamps = tailLightHue !== 0;
  if (!paints && !tints && !relamps) {
    return canvas;
  }

  // How much of each pixel is paint. Only worth computing when something is
  // actually being painted — a tint-only or lamp-only livery never reads it.
  const coverage = paints ? coverageFor(coverageCache, model, pixels) : null;
  const palette = paints ? preparePalette(livery, model.sw) : null;

  // Reused across rows rather than rebuilt per row: at 350 rows this is the
  // difference between a handful of allocations and a few thousand.
  const rowWeights = palette ? new Float64Array(palette.layers.length) : null;
  // The same offsets, for the curved layers that need one per row.
  const rowOffsets = palette ? new Float64Array(palette.layers.length) : null;
  // Column centres, needed only by a curved stripe — which reads a position
  // along the row rather than a tabulated weight. Computed once because a
  // division per pixel per layer is a real cost at 20,000 pixels a bake.
  const columnFractions = palette
    ? Float64Array.from({ length: model.sw }, (_, x) => (x + 0.5) / model.sw)
    : null;

  for (let y = 0; y < model.sh; y += 1) {
    const yFraction = y / model.sh;
    // Everything that varies down the car rather than across it, refreshed once
    // for the whole scanline. See `preparePalette`.
    const rowBase = palette ? palette.baseForRow(yFraction) : null;
    if (palette) {
      for (let n = 0; n < palette.layers.length; n += 1) {
        rowWeights[n] = palette.layers[n].weightForRow(yFraction);
        rowOffsets[n] = palette.layers[n].offsetForRow(yFraction);
      }
    }

    for (let x = 0; x < model.sw; x += 1) {
      const k = y * model.sw + x;
      const i = k * 4;
      if (pixels[i + 3] === 0) continue;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const region = classifyPixel(r, g, b, yFraction);

      // Glass and lamps go first, so a pixel that is partly both — the rim of a
      // window is frame *and* glass — ends up a blend of the two rather than
      // taking one and dropping the other, which would show as a hard edge.
      let out = null;
      if (region === REGION_CABIN && tints) out = tintCabinPixel(r, g, b, windowTint);
      else if (region === REGION_LAMP && relamps) out = lampPixel(r, g, b, tailLightHue);

      const paintWeight = coverage ? coverage[k] : 0;
      if (paintWeight > 0) {
        // The shading always comes from the *original* pixel, at every level of
        // the stack: a tinted base would feed the window darkening back into the
        // paint, and a layer painted over an already-painted pixel would apply
        // the artwork's shading twice and come out muddy where the two meet.
        let painted = skipBase
          ? [r, g, b]
          : paintWith(r, g, b, palette.baseByColumn ? palette.baseByColumn[x] : rowBase);
        for (let n = 0; n < palette.layers.length; n += 1) {
          const entry = palette.layers[n];
          const weight = entry.curved
            ? shiftedZoneWeight(
              entry.layer,
              entry.stripe ? columnFractions[x] : yFraction,
              entry.stripe ? rowOffsets[n] : entry.offsetByColumn[x],
            )
            : entry.byColumn ? entry.byColumn[x] : rowWeights[n];
          if (weight <= 0) continue;
          const over = paintWith(r, g, b, entry.prepared);
          painted = weight >= 1 ? over : [
            painted[0] + (over[0] - painted[0]) * weight,
            painted[1] + (over[1] - painted[1]) * weight,
            painted[2] + (over[2] - painted[2]) * weight,
          ];
        }

        const base = out ?? [r, g, b];
        out = paintWeight >= 1 ? painted : [
          base[0] + (painted[0] - base[0]) * paintWeight,
          base[1] + (painted[1] - base[1]) * paintWeight,
          base[2] + (painted[2] - base[2]) * paintWeight,
        ];
      }
      if (!out) continue;

      pixels[i] = out[0];
      pixels[i + 1] = out[1];
      pixels[i + 2] = out[2];
    }
  }
  ctx.putImageData(image_data, 0, 0);
  return canvas;
}

/**
 * The baked sprite for a model in a livery, or null while its sheet is still
 * loading. Null is a normal answer, not an error — every renderer in the cabinet
 * already skips images that have not resolved, so a cold cache degrades to the
 * placeholder block rather than blocking the first frame.
 */
export function liverySprite(cache, { image, model, livery }) {
  if (!imageReady(image) || !model) return null;
  const normalized = createLivery(livery);
  const key = `${model.id}:${liveryKey(normalized)}`;
  const { sprites, coverage } = cache;

  const cached = sprites.get(key);
  if (cached) {
    // Refresh recency so a sprite in active use is not the next one evicted.
    sprites.delete(key);
    sprites.set(key, cached);
    return cached;
  }

  const sprite = bakeLiverySprite(image, model, normalized, coverage);
  sprites.set(key, sprite);
  while (sprites.size > LIVERY_CACHE_LIMIT) {
    sprites.delete(sprites.keys().next().value);
  }
  return sprite;
}

/**
 * Whether a sprite is already baked, without baking one.
 *
 * The collection screen draws dozens of painted cars at once, and a bake is
 * several milliseconds — a scroll that missed on every cell would spend a
 * hundred of them in one frame. This lets a caller spend a budget on the misses
 * and fall back to the bare body for the rest, which is what every renderer here
 * already does on a cold cache. It deliberately does not refresh recency: asking
 * whether something is cached is not using it.
 */
export function hasLiverySprite(cache, { model, livery }) {
  if (!model) return false;
  return cache.sprites.has(`${model.id}:${liveryKey(createLivery(livery))}`);
}

/**
 * The tail lights' colour, so the glow behind the car matches the lenses on it.
 * A car with amber lamps trailing a red glow is the kind of mismatch that reads
 * as a bug even when nobody can say why.
 */
export function tailLightColour(livery, alpha) {
  const [r, g, b] = hueToRgb(createLivery(livery).tailLightHue);
  // Lift toward white a little: a fully saturated glow reads as a flat decal
  // rather than as light.
  const lift = (channel) => Math.round(channel * 0.82 + 255 * 0.18);
  return `rgba(${lift(r)}, ${lift(g)}, ${lift(b)}, ${alpha})`;
}

/**
 * Underglow, drawn *under* the car before the sprite goes down.
 *
 * It is a pool of light on the tarmac rather than an outline on the body, which
 * is why it is a separate draw rather than another region in the bake — and why
 * it is absent from the sprite cache key. `lighter` compositing is what stops it
 * looking like a painted shape.
 */
export function drawUnderglow(ctx, box, livery) {
  const { underglow } = createLivery(livery);
  if (!underglow.enabled) return;

  const [r, g, b] = hueToRgb(underglow.hue);
  const centreX = box.x;
  const centreY = box.top + box.height * 0.55;
  const radius = Math.max(box.width, box.height) * 0.78;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const glow = ctx.createRadialGradient(centreX, centreY, radius * 0.12, centreX, centreY, radius);
  glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.5 * underglow.intensity})`);
  glow.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, ${0.22 * underglow.intensity})`);
  glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(centreX - radius, centreY - radius, radius * 2, radius * 2);
  ctx.restore();
}
