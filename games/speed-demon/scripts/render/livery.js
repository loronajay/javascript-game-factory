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

import { liveryKey, createLivery } from "../garage/livery.js";
import {
  REGION_CABIN,
  REGION_LAMP,
  bodyCoverageMap,
  classifyPixel,
  paintPixel,
  tintCabinPixel,
  lampPixel,
  hueToRgb,
} from "../garage/paint.js";

/**
 * How many baked sprites to keep. Sized for a player browsing the picker — the
 * 24 models plus a spread of colours — rather than for a whole session's worth
 * of experimentation.
 */
export const LIVERY_CACHE_LIMIT = 64;

export function createLiveryCache() {
  // A Map keeps insertion order, which is all the eviction policy needs.
  return new Map();
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
function bakeLiverySprite(image, model, livery) {
  const canvas = document.createElement("canvas");
  canvas.width = model.sw;
  canvas.height = model.sh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, model.sx, model.sy, model.sw, model.sh, 0, 0, model.sw, model.sh);

  const image_data = ctx.getImageData(0, 0, model.sw, model.sh);
  const pixels = image_data.data;
  const { paint, windowTint, tailLightHue } = livery;
  // Skip work that provably changes nothing. A factory-silver car is the common
  // case (it is the default, and it is what every un-customized opponent shows
  // up in), so it is worth not touching 20,000 pixels to produce the input.
  const paints = paint.saturation > 0 || paint.brightness !== 1 || paint.finish !== "gloss";
  const tints = windowTint > 0;
  const relamps = tailLightHue !== 0;
  if (!paints && !tints && !relamps) {
    return canvas;
  }

  // How much of each pixel is paint. Only worth computing when something is
  // actually being painted — a tint-only or lamp-only livery never reads it.
  const coverage = paints ? bodyCoverageMap(pixels, model.sw, model.sh) : null;

  for (let y = 0; y < model.sh; y += 1) {
    const yFraction = y / model.sh;
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
        // The shading always comes from the *original* pixel: a tinted base
        // would feed the window darkening back into the paint.
        const painted = paintPixel(r, g, b, paint);
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

  const cached = cache.get(key);
  if (cached) {
    // Refresh recency so a sprite in active use is not the next one evicted.
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }

  const sprite = bakeLiverySprite(image, model, normalized);
  cache.set(key, sprite);
  while (cache.size > LIVERY_CACHE_LIMIT) {
    cache.delete(cache.keys().next().value);
  }
  return sprite;
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
