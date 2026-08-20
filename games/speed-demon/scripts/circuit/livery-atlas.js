// Directional livery baking for circuit cars.
//
// The saved contract remains `{ modelId, livery }`. This module only changes
// how the canonical livery is sampled: every pixel is projected back into the
// car's local across-body/nose-to-tail coordinates before paint, glass and lamp
// rules run. The resulting eight-frame atlas is baked once and cached.

import { createLivery, findFadeAxis, liveryKey } from "../garage/livery.js";
import {
  PAINT_FEATHER_RADIUS,
  REGION_BODY,
  REGION_CABIN,
  REGION_LAMP,
  bodyCoverageMap,
  classifyPixel,
  lampPixel,
  mixPaint,
  paintFeather,
  paintWith,
  preparePaint,
  tintCabinPixel,
  zoneWeight,
} from "../garage/paint.js";
import { CIRCUIT_FRAME_SIZE, hasCircuitAtlas } from "./assets.js";

export const CIRCUIT_LIVERY_CACHE_LIMIT = 32;
const CIRCUIT_COVERAGE_CACHE_LIMIT = 8;

export function createCircuitLiveryCache() {
  return { atlases: new Map(), coverage: new Map() };
}

/** Screen pixel to car-local `(u, v)`, where v=0 is the nose and v=1 the tail. */
export function localCarCoordinates(frameIndex, x, y, frameSize = CIRCUIT_FRAME_SIZE) {
  const angle = (frameIndex % 8) * Math.PI / 4;
  const dx = (x + 0.5) / frameSize - 0.5;
  const dy = (y + 0.5) / frameSize - 0.5;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    u: 0.5 + dx * cos + dy * sin,
    v: 0.5 - dx * sin + dy * cos,
  };
}

function imageReady(image) {
  return Boolean(image && image.complete && image.naturalWidth > 0);
}

function hasConfidentNeighbour(confident, width, height, x, y, frameStart) {
  const minX = Math.max(frameStart, x - PAINT_FEATHER_RADIUS);
  const maxX = Math.min(frameStart + CIRCUIT_FRAME_SIZE - 1, x + PAINT_FEATHER_RADIUS);
  const minY = Math.max(0, y - PAINT_FEATHER_RADIUS);
  const maxY = Math.min(height - 1, y + PAINT_FEATHER_RADIUS);
  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      if (confident[py * width + px]) return true;
    }
  }
  return false;
}

/** Direction-aware equivalent of `bodyCoverageMap` for a horizontal atlas. */
export function circuitBodyCoverageMap(pixels, width, height) {
  // Keep the established north-frame algorithm as the behavioral reference;
  // the implementation below differs only in supplying local v per heading.
  if (width === CIRCUIT_FRAME_SIZE) return bodyCoverageMap(pixels, width, height);

  const coverage = new Float32Array(width * height);
  const confident = new Uint8Array(width * height);
  const frameCount = Math.floor(width / CIRCUIT_FRAME_SIZE);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const frame = Math.min(frameCount - 1, Math.floor(x / CIRCUIT_FRAME_SIZE));
      const localX = x - frame * CIRCUIT_FRAME_SIZE;
      const local = localCarCoordinates(frame, localX, y);
      const k = y * width + x;
      const i = k * 4;
      if (pixels[i + 3] === 0) continue;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      if (classifyPixel(r, g, b, local.v) === REGION_BODY) {
        confident[k] = 1;
        coverage[k] = 1;
      } else {
        coverage[k] = paintFeather(r, g, b);
      }
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const k = y * width + x;
      if (coverage[k] <= 0 || confident[k]) continue;
      const frameStart = Math.floor(x / CIRCUIT_FRAME_SIZE) * CIRCUIT_FRAME_SIZE;
      if (!hasConfidentNeighbour(confident, width, height, x, y, frameStart)) coverage[k] = 0;
    }
  }
  return coverage;
}

function coverageFor(cache, modelId, pixels, width, height) {
  const found = cache.get(modelId);
  if (found) return found;
  const coverage = circuitBodyCoverageMap(pixels, width, height);
  cache.set(modelId, coverage);
  while (cache.size > CIRCUIT_COVERAGE_CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return coverage;
}

function paintStack(r, g, b, local, livery, skipBase) {
  const axis = livery.fade.enabled ? findFadeAxis(livery.fade.axis) : null;
  const far = {
    hue: livery.fade.hue,
    saturation: livery.fade.saturation,
    brightness: livery.fade.brightness,
    finish: livery.paint.finish,
  };
  const base = axis
    ? mixPaint(livery.paint, far, Math.min(1, Math.max(0, axis.at(local.u, local.v))))
    : livery.paint;
  let painted = skipBase ? [r, g, b] : paintWith(r, g, b, preparePaint(base));

  for (const layer of livery.layers) {
    const weight = zoneWeight(layer, local.u, local.v);
    if (weight <= 0) continue;
    const over = paintWith(r, g, b, preparePaint(layer.paint));
    painted = weight >= 1 ? over : [
      painted[0] + (over[0] - painted[0]) * weight,
      painted[1] + (over[1] - painted[1]) * weight,
      painted[2] + (over[2] - painted[2]) * weight,
    ];
  }
  return painted;
}

function bakeCircuitAtlas(image, modelId, livery, coverageCache) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight || CIRCUIT_FRAME_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  const flatBase = livery.paint.saturation === 0
    && livery.paint.brightness === 1
    && livery.paint.finish === "gloss";
  const paints = !flatBase || livery.fade.enabled || livery.layers.length > 0;
  const tints = livery.windowTint > 0;
  const relamps = livery.tailLightHue !== 0;
  if (!paints && !tints && !relamps) return canvas;

  const skipBase = flatBase && !livery.fade.enabled;
  const coverage = paints
    ? coverageFor(coverageCache, modelId, pixels, canvas.width, canvas.height)
    : null;

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const k = y * canvas.width + x;
      const i = k * 4;
      if (pixels[i + 3] === 0) continue;
      const frame = Math.floor(x / CIRCUIT_FRAME_SIZE);
      const local = localCarCoordinates(frame, x - frame * CIRCUIT_FRAME_SIZE, y);
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const region = classifyPixel(r, g, b, local.v);

      let out = null;
      if (region === REGION_CABIN && tints) out = tintCabinPixel(r, g, b, livery.windowTint);
      else if (region === REGION_LAMP && relamps) out = lampPixel(r, g, b, livery.tailLightHue);

      const weight = coverage ? coverage[k] : 0;
      if (weight > 0) {
        const painted = paintStack(r, g, b, local, livery, skipBase);
        const under = out ?? [r, g, b];
        out = weight >= 1 ? painted : [
          under[0] + (painted[0] - under[0]) * weight,
          under[1] + (painted[1] - under[1]) * weight,
          under[2] + (painted[2] - under[2]) * weight,
        ];
      }
      if (!out) continue;
      pixels[i] = out[0];
      pixels[i + 1] = out[1];
      pixels[i + 2] = out[2];
    }
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

export function circuitLiveryAtlas(cache, { image, modelId, livery }) {
  if (!imageReady(image) || !hasCircuitAtlas(modelId)) return null;
  const normalized = createLivery(livery);
  const key = `${modelId}:${liveryKey(normalized)}`;
  const found = cache.atlases.get(key);
  if (found) {
    cache.atlases.delete(key);
    cache.atlases.set(key, found);
    return found;
  }

  const atlas = bakeCircuitAtlas(image, modelId, normalized, cache.coverage);
  cache.atlases.set(key, atlas);
  while (cache.atlases.size > CIRCUIT_LIVERY_CACHE_LIMIT) {
    cache.atlases.delete(cache.atlases.keys().next().value);
  }
  return atlas;
}
