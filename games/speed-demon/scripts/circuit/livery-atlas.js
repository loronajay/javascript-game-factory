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
import { localCarCoordinates, measureCircuitFrameGeometry } from "./sprite-geometry.js";
import { circuitStripeCoordinates } from "./stripe-projection.js";

export const CIRCUIT_LIVERY_CACHE_LIMIT = 32;
const CIRCUIT_COVERAGE_CACHE_LIMIT = 8;

export function createCircuitLiveryCache() {
  return {
    atlases: new Map(),
    coverage: new Map(),
    geometry: new Map(),
    projection: new Map(),
  };
}

function imageReady(image) {
  return Boolean(image && image.complete && image.naturalWidth > 0);
}

function percentile(values, fraction, fallback) {
  if (!values.length) return fallback;
  values.sort((a, b) => a - b);
  return values[Math.round((values.length - 1) * fraction)];
}

/**
 * Measures the paintable body independently from the complete silhouette.
 * Wheels, cast shadows, glass and wings still count when the sprite is centred
 * and sized, but cannot move the canonical livery's nose/tail/side anchors.
 */
export function measureCircuitBodyGeometry(pixels, width, height, silhouette) {
  const frameCount = Math.floor(width / CIRCUIT_FRAME_SIZE);
  return Array.from({ length: frameCount }, (_, frame) => {
    const longitudinal = [];
    const lateral = [];
    const base = silhouette[frame];
    const angle = ((frame + 4) % 8) * Math.PI / 4;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < CIRCUIT_FRAME_SIZE; x += 1) {
        const pixel = (y * width + frame * CIRCUIT_FRAME_SIZE + x) * 4;
        if (pixels[pixel + 3] <= 8) continue;
        const bootstrap = localCarCoordinates(frame, x, y, CIRCUIT_FRAME_SIZE, base);
        if (classifyPixel(pixels[pixel], pixels[pixel + 1], pixels[pixel + 2], bootstrap.v)
          !== REGION_BODY) continue;
        const dx = x + 0.5 - CIRCUIT_FRAME_SIZE / 2;
        const dy = y + 0.5 - height / 2;
        lateral.push(dx * cos + dy * sin);
        longitudinal.push(dx * sin - dy * cos);
      }
    }
    return Object.freeze({
      lateralMin: percentile(lateral, 0.02, base.lateralMin),
      lateralMax: percentile(lateral, 0.98, base.lateralMax),
      longitudinalMin: percentile(longitudinal, 0.02, base.longitudinalMin),
      longitudinalMax: percentile(longitudinal, 0.98, base.longitudinalMax),
    });
  });
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

/** Per-frame-UV equivalent of `bodyCoverageMap` for a horizontal atlas. */
export function circuitBodyCoverageMap(pixels, width, height, geometry = null) {
  const coverage = new Float32Array(width * height);
  const confident = new Uint8Array(width * height);
  const frameCount = Math.floor(width / CIRCUIT_FRAME_SIZE);
  const frames = geometry ?? measureCircuitFrameGeometry(pixels, width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const frame = Math.min(frameCount - 1, Math.floor(x / CIRCUIT_FRAME_SIZE));
      const localX = x - frame * CIRCUIT_FRAME_SIZE;
      const local = localCarCoordinates(frame, localX, y, CIRCUIT_FRAME_SIZE, frames[frame]);
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

function coverageFor(cache, modelId, pixels, width, height, geometry) {
  const found = cache.get(modelId);
  if (found) return found;
  const coverage = circuitBodyCoverageMap(pixels, width, height, geometry);
  cache.set(modelId, coverage);
  while (cache.size > CIRCUIT_COVERAGE_CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return coverage;
}

function paintStack(r, g, b, local, livery, skipBase, modelId, frame, geometry, point) {
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
    const layerLocal = layer.kind === "stripe"
      ? circuitStripeCoordinates(modelId, frame, local, geometry, point)
      : local;
    const weight = zoneWeight(layer, layerLocal.u, layerLocal.v);
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

function geometryFor(cache, modelId, pixels, width, height) {
  const found = cache.get(modelId);
  if (found) return found;
  const geometry = measureCircuitFrameGeometry(pixels, width, height);
  cache.set(modelId, geometry);
  return geometry;
}

function projectionFor(cache, modelId, pixels, width, height, silhouette) {
  const found = cache.get(modelId);
  if (found) return found;
  const projection = measureCircuitBodyGeometry(pixels, width, height, silhouette);
  cache.set(modelId, projection);
  return projection;
}

export function circuitFrameScale(cache, modelId, frameIndex) {
  return cache.geometry.get(modelId)?.[frameIndex]?.scale ?? 1;
}

export function circuitFrameGeometry(cache, modelId, frameIndex) {
  return cache.geometry.get(modelId)?.[frameIndex] ?? null;
}

function bakeCircuitAtlas(
  image,
  modelId,
  livery,
  coverageCache,
  geometryCache,
  projectionCache,
) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight || CIRCUIT_FRAME_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  const geometry = geometryFor(geometryCache, modelId, pixels, canvas.width, canvas.height);
  const projection = projectionFor(
    projectionCache,
    modelId,
    pixels,
    canvas.width,
    canvas.height,
    geometry,
  );

  const flatBase = livery.paint.saturation === 0
    && livery.paint.brightness === 1
    && livery.paint.finish === "gloss";
  const paints = !flatBase || livery.fade.enabled || livery.layers.length > 0;
  const tints = livery.windowTint > 0;
  const relamps = livery.tailLightHue !== 0;
  if (!paints && !tints && !relamps) return canvas;

  const skipBase = flatBase && !livery.fade.enabled;
  const coverage = paints
    ? coverageFor(coverageCache, modelId, pixels, canvas.width, canvas.height, projection)
    : null;

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const k = y * canvas.width + x;
      const i = k * 4;
      if (pixels[i + 3] === 0) continue;
      const frame = Math.floor(x / CIRCUIT_FRAME_SIZE);
      const local = localCarCoordinates(
        frame,
        x - frame * CIRCUIT_FRAME_SIZE,
        y,
        CIRCUIT_FRAME_SIZE,
        projection[frame],
      );
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const region = classifyPixel(r, g, b, local.v);

      let out = null;
      if (region === REGION_CABIN && tints) out = tintCabinPixel(r, g, b, livery.windowTint);
      else if (region === REGION_LAMP && relamps) out = lampPixel(r, g, b, livery.tailLightHue);

      const weight = coverage ? coverage[k] : 0;
      if (weight > 0) {
        const painted = paintStack(
          r,
          g,
          b,
          local,
          livery,
          skipBase,
          modelId,
          frame,
          projection[frame],
          { x: x - frame * CIRCUIT_FRAME_SIZE, y },
        );
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

  const atlas = bakeCircuitAtlas(
    image,
    modelId,
    normalized,
    cache.coverage,
    cache.geometry,
    cache.projection ?? new Map(),
  );
  cache.atlases.set(key, atlas);
  while (cache.atlases.size > CIRCUIT_LIVERY_CACHE_LIMIT) {
    cache.atlases.delete(cache.atlases.keys().next().value);
  }
  return atlas;
}
