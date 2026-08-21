// Pure data model and pixel operations for the circuit-car mask editor.
// The catalog is imported from the canonical garage schema so this tool cannot
// quietly invent a second set of customization layers again.

import { LAYER_PRESETS } from "../scripts/garage/livery.js";

export const CIRCUIT_MASK_KIND = "speed-demon-circuit-surface-mask";
export const CIRCUIT_MASK_SCHEMA_VERSION = 2;
export const CIRCUIT_MASK_FRAME_WIDTH = 64;
export const CIRCUIT_MASK_FRAME_HEIGHT = 64;
export const CIRCUIT_MASK_FRAME_COUNT = 8;

// These are the historic names stored in spritesheet.json. They describe the
// camera-facing atlas slots, not the direction of the vehicle's nose.
export const CIRCUIT_MASK_ATLAS_SLOTS = Object.freeze([
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
]);

// User-facing headings. Frame 0 visibly points down (south), frame 6 right
// (east), matching circuitFrameIndex's documented 180-degree correction.
export const CIRCUIT_MASK_HEADINGS = Object.freeze([
  "south",
  "south-west",
  "west",
  "north-west",
  "north",
  "north-east",
  "east",
  "south-east",
]);

// This exclusive map routes a source pixel to an operation the real renderer
// owns. Layers share BODY pixels; their independent masks live below.
export const CIRCUIT_MASK_SURFACES = Object.freeze([
  Object.freeze({ id: 0, key: "unassigned", label: "Unassigned / erase", color: "#000000", shortcut: "0" }),
  Object.freeze({ id: 1, key: "body", label: "Body Paint · Fade · Layers", color: "#26d07c", shortcut: "1" }),
  Object.freeze({ id: 2, key: "windows", label: "Window Tint", color: "#2787ff", shortcut: "2" }),
  Object.freeze({ id: 3, key: "tail-lights", label: "Tail Lights", color: "#ff354d", shortcut: "3" }),
  Object.freeze({ id: 4, key: "excluded", label: "Not Customizable", color: "#68758a", shortcut: "4" }),
]);

const TARGET_COLORS = Object.freeze({
  roof: "#a855f7",
  nose: "#ffd43b",
  trunk: "#ff354d",
  rear: "#ff8a32",
  "two-tone": "#ff4fd8",
  stripes: "#e6edf7",
  sills: "#00c4b4",
  spine: "#9bea39",
});

export const CIRCUIT_MASK_LAYER_TARGETS = Object.freeze(LAYER_PRESETS.map((preset) => Object.freeze({
  id: preset.id,
  label: preset.label,
  kind: preset.kind,
  color: TARGET_COLORS[preset.id] ?? "#ffffff",
})));

const FRAME_PIXELS = CIRCUIT_MASK_FRAME_WIDTH * CIRCUIT_MASK_FRAME_HEIGHT;
const MASK_PIXELS = FRAME_PIXELS * CIRCUIT_MASK_FRAME_COUNT;
const MAX_SURFACE_ID = CIRCUIT_MASK_SURFACES[CIRCUIT_MASK_SURFACES.length - 1].id;

function createMask() {
  return new Uint8Array(MASK_PIXELS);
}

export function createCircuitMaskData() {
  return {
    surfaces: createMask(),
    layers: Object.fromEntries(CIRCUIT_MASK_LAYER_TARGETS.map((target) => [target.id, createMask()])),
    guides: {
      stripes: Array.from({ length: CIRCUIT_MASK_FRAME_COUNT }, () => []),
      bands: Array.from({ length: CIRCUIT_MASK_FRAME_COUNT }, () => []),
    },
  };
}

export function cloneCircuitMaskData(data) {
  assertData(data);
  return {
    surfaces: data.surfaces.slice(),
    layers: Object.fromEntries(CIRCUIT_MASK_LAYER_TARGETS.map((target) => [
      target.id,
      data.layers[target.id].slice(),
    ])),
    guides: {
      stripes: data.guides.stripes.map((paths) => paths.map((path) => path.map((point) => ({ ...point })))),
      bands: data.guides.bands.map((paths) => paths.map((path) => path.map((point) => ({ ...point })))),
    },
  };
}

function frameOffset(frameIndex) {
  if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= CIRCUIT_MASK_FRAME_COUNT) {
    throw new Error(`invalid circuit mask frame ${frameIndex}`);
  }
  return frameIndex * FRAME_PIXELS;
}

function assertMask(mask) {
  if (!(mask instanceof Uint8Array) || mask.length !== MASK_PIXELS) {
    throw new Error(`circuit mask must contain exactly ${MASK_PIXELS} labels`);
  }
}

function assertData(data) {
  if (!data || typeof data !== "object") throw new Error("circuit mask data is required");
  assertMask(data.surfaces);
  for (const target of CIRCUIT_MASK_LAYER_TARGETS) assertMask(data.layers?.[target.id]);
  for (const kind of ["stripes", "bands"]) {
    if (!Array.isArray(data.guides?.[kind]) || data.guides[kind].length !== CIRCUIT_MASK_FRAME_COUNT) {
      throw new Error(`circuit ${kind} guides must contain all eight headings`);
    }
    for (const paths of data.guides[kind]) {
      if (!Array.isArray(paths)) throw new Error(`invalid circuit ${kind} guide list`);
    }
  }
}

function assertGuideKind(kind) {
  if (kind !== "stripes" && kind !== "bands") throw new Error(`unknown circuit guide kind ${kind}`);
}

function normalizeGuidePath(points) {
  if (!Array.isArray(points)) throw new Error("guide path points must be an array");
  const normalized = [];
  for (const point of points.slice(0, 512)) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const next = {
      x: Math.round(Math.min(63, Math.max(0, point.x)) * 100) / 100,
      y: Math.round(Math.min(63, Math.max(0, point.y)) * 100) / 100,
    };
    const previous = normalized.at(-1);
    if (!previous || previous.x !== next.x || previous.y !== next.y) normalized.push(next);
  }
  if (normalized.length < 2) throw new Error("a directional guide needs at least two distinct points");
  return normalized;
}

/** Adds one arrowed freehand path. Point order is the user-authored direction. */
export function addGuidePath(data, kind, frameIndex, points) {
  assertData(data);
  assertGuideKind(kind);
  frameOffset(frameIndex);
  const path = normalizeGuidePath(points);
  data.guides[kind][frameIndex].push(path);
  return path;
}

export function guidePathCount(data, kind, frameIndex = null) {
  assertData(data);
  assertGuideKind(kind);
  if (frameIndex !== null) return data.guides[kind][frameIndex].length;
  return data.guides[kind].reduce((sum, paths) => sum + paths.length, 0);
}

function assertValue(value, maxValue) {
  if (!Number.isInteger(value) || value < 0 || value > maxValue) {
    throw new Error(`invalid circuit mask value ${value}`);
  }
}

function encodeRuns(mask, start) {
  const runs = [];
  let value = mask[start];
  let count = 1;
  for (let index = start + 1; index < start + FRAME_PIXELS; index += 1) {
    if (mask[index] === value) count += 1;
    else {
      runs.push([count, value]);
      value = mask[index];
      count = 1;
    }
  }
  runs.push([count, value]);
  return runs;
}

function decodeRuns(runs, target, start, maxValue) {
  if (!Array.isArray(runs)) throw new Error("circuit mask frame data must be an array");
  let written = 0;
  for (const run of runs) {
    if (!Array.isArray(run) || run.length !== 2) throw new Error("invalid circuit mask run");
    const [count, value] = run;
    if (!Number.isInteger(count) || count <= 0 || written + count > FRAME_PIXELS) {
      throw new Error("invalid circuit mask run length");
    }
    assertValue(value, maxValue);
    target.fill(value, start + written, start + written + count);
    written += count;
  }
  if (written !== FRAME_PIXELS) throw new Error("circuit mask frame has the wrong pixel count");
}

function encodedFrames(mask) {
  return CIRCUIT_MASK_HEADINGS.map((heading, frameIndex) => ({
    legacyAtlasSlot: CIRCUIT_MASK_ATLAS_SLOTS[frameIndex],
    heading,
    runs: encodeRuns(mask, frameOffset(frameIndex)),
  }));
}

function encodedGuideFrames(data, kind) {
  return CIRCUIT_MASK_HEADINGS.map((heading, frameIndex) => ({
    legacyAtlasSlot: CIRCUIT_MASK_ATLAS_SLOTS[frameIndex],
    heading,
    paths: data.guides[kind][frameIndex].map((path) => path.map((point) => ({ ...point }))),
  }));
}

export function encodeCircuitMaskProject(modelId, data) {
  assertData(data);
  if (typeof modelId !== "string" || !modelId.trim()) throw new Error("modelId is required");
  return {
    kind: CIRCUIT_MASK_KIND,
    schemaVersion: CIRCUIT_MASK_SCHEMA_VERSION,
    modelId,
    frameWidth: CIRCUIT_MASK_FRAME_WIDTH,
    frameHeight: CIRCUIT_MASK_FRAME_HEIGHT,
    frameCount: CIRCUIT_MASK_FRAME_COUNT,
    legacyAtlasSlots: [...CIRCUIT_MASK_ATLAS_SLOTS],
    headings: [...CIRCUIT_MASK_HEADINGS],
    encoding: "rle-v1",
    surfaces: CIRCUIT_MASK_SURFACES.map(({ id, key, label, color }) => ({ id, key, label, color })),
    surfaceFrames: encodedFrames(data.surfaces),
    layerGuides: CIRCUIT_MASK_LAYER_TARGETS.map((target) => ({
      presetId: target.id,
      label: target.label,
      kind: target.kind,
      color: target.color,
      frames: encodedFrames(data.layers[target.id]),
    })),
    directionGuides: {
      stripes: encodedGuideFrames(data, "stripes"),
      bands: encodedGuideFrames(data, "bands"),
    },
  };
}

function parseProject(input) {
  const project = typeof input === "string" ? JSON.parse(input) : input;
  if (!project || typeof project !== "object") throw new Error("invalid circuit mask project");
  if (project.kind !== CIRCUIT_MASK_KIND) throw new Error(`expected ${CIRCUIT_MASK_KIND}`);
  return project;
}

function assertIdentity(project, expectedModelId) {
  if (expectedModelId && project.modelId !== expectedModelId) {
    throw new Error(`mask belongs to ${project.modelId}, not ${expectedModelId}`);
  }
  if (project.frameWidth !== CIRCUIT_MASK_FRAME_WIDTH
    || project.frameHeight !== CIRCUIT_MASK_FRAME_HEIGHT
    || project.frameCount !== CIRCUIT_MASK_FRAME_COUNT
    || project.encoding !== "rle-v1") {
    throw new Error("circuit mask dimensions or encoding do not match this editor");
  }
}

function decodeFrameSet(frames, target, maxValue) {
  if (!Array.isArray(frames) || frames.length !== CIRCUIT_MASK_FRAME_COUNT) {
    throw new Error("circuit mask must contain all eight headings");
  }
  for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
    const frame = frames[frameIndex];
    const legacyAtlasSlot = frame?.legacyAtlasSlot ?? frame?.atlasSlot;
    if (legacyAtlasSlot !== CIRCUIT_MASK_ATLAS_SLOTS[frameIndex]
      || frame?.heading !== CIRCUIT_MASK_HEADINGS[frameIndex]) {
      throw new Error(`circuit mask frame ${frameIndex} has the wrong heading`);
    }
    decodeRuns(frame.runs, target, frameOffset(frameIndex), maxValue);
  }
}

function decodeGuideFrameSet(frames, data, kind) {
  if (frames === undefined) return;
  if (!Array.isArray(frames) || frames.length !== CIRCUIT_MASK_FRAME_COUNT) {
    throw new Error(`circuit ${kind} guides must contain all eight headings`);
  }
  for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
    const frame = frames[frameIndex];
    const legacyAtlasSlot = frame?.legacyAtlasSlot ?? frame?.atlasSlot;
    if (legacyAtlasSlot !== CIRCUIT_MASK_ATLAS_SLOTS[frameIndex]
      || frame?.heading !== CIRCUIT_MASK_HEADINGS[frameIndex]
      || !Array.isArray(frame.paths)) {
      throw new Error(`circuit ${kind} guide frame ${frameIndex} has the wrong heading`);
    }
    for (const path of frame.paths) addGuidePath(data, kind, frameIndex, path);
  }
}

export function decodeCircuitMaskProject(input, expectedModelId = null) {
  const project = parseProject(input);
  if (project.schemaVersion === 1) return migrateLegacyCircuitMaskProject(project, expectedModelId);
  if (project.schemaVersion !== CIRCUIT_MASK_SCHEMA_VERSION) {
    throw new Error(`unsupported circuit mask schema ${project.schemaVersion}`);
  }
  assertIdentity(project, expectedModelId);
  const legacyAtlasSlots = project.legacyAtlasSlots ?? project.atlasSlots;
  if (!Array.isArray(legacyAtlasSlots)
    || legacyAtlasSlots.some((slot, index) => slot !== CIRCUIT_MASK_ATLAS_SLOTS[index])
    || !Array.isArray(project.headings)
    || project.headings.some((heading, index) => heading !== CIRCUIT_MASK_HEADINGS[index])) {
    throw new Error("circuit mask atlas order or headings do not match the sprites");
  }

  const data = createCircuitMaskData();
  decodeFrameSet(project.surfaceFrames, data.surfaces, MAX_SURFACE_ID);
  if (!Array.isArray(project.layerGuides) || project.layerGuides.length !== CIRCUIT_MASK_LAYER_TARGETS.length) {
    throw new Error("circuit mask canonical guide catalog is incomplete");
  }
  for (const target of CIRCUIT_MASK_LAYER_TARGETS) {
    const guide = project.layerGuides.find((candidate) => candidate?.presetId === target.id);
    if (!guide || guide.kind !== target.kind) throw new Error(`missing canonical ${target.id} guide`);
    decodeFrameSet(guide.frames, data.layers[target.id], 1);
  }
  decodeGuideFrameSet(project.directionGuides?.stripes, data, "stripes");
  decodeGuideFrameSet(project.directionGuides?.bands, data, "bands");
  return { modelId: project.modelId, data, project, migrated: false };
}

/** Converts the original physical-part palette into the real renderer routes. */
export function migrateLegacyCircuitMaskProject(input, expectedModelId = null) {
  const project = parseProject(input);
  if (project.schemaVersion !== 1) throw new Error("expected a schema-1 circuit mask");
  assertIdentity(project, expectedModelId);
  if (!Array.isArray(project.order)
    || project.order.some((slot, index) => slot !== CIRCUIT_MASK_ATLAS_SLOTS[index])
    || !Array.isArray(project.frames)
    || project.frames.length !== CIRCUIT_MASK_FRAME_COUNT) {
    throw new Error("legacy circuit mask atlas order is invalid");
  }

  const legacy = createMask();
  for (let frameIndex = 0; frameIndex < project.frames.length; frameIndex += 1) {
    const frame = project.frames[frameIndex];
    if (frame?.direction !== CIRCUIT_MASK_ATLAS_SLOTS[frameIndex]) {
      throw new Error(`legacy circuit mask frame ${frameIndex} has the wrong slot`);
    }
    decodeRuns(frame.runs, legacy, frameOffset(frameIndex), 13);
  }

  const data = createCircuitMaskData();
  const route = [0, 1, 1, 1, 1, 1, 2, 1, 1, 4, 3, 4, 4, 4];
  for (let index = 0; index < legacy.length; index += 1) {
    const old = legacy[index];
    data.surfaces[index] = route[old] ?? 0;
    if (old === 4) data.layers.roof[index] = 1;
    if (old === 3 || old === 7) data.layers.nose[index] = 1;
    if (old === 5) data.layers.trunk[index] = 1;
    if (old === 8) data.layers.rear[index] = 1;
  }
  return {
    modelId: project.modelId,
    data,
    project: encodeCircuitMaskProject(project.modelId, data),
    migrated: true,
  };
}

function paintDisc(mask, frameStart, x, y, value, radius, paintable) {
  const minX = Math.max(0, x - radius);
  const maxX = Math.min(CIRCUIT_MASK_FRAME_WIDTH - 1, x + radius);
  const minY = Math.max(0, y - radius);
  const maxY = Math.min(CIRCUIT_MASK_FRAME_HEIGHT - 1, y + radius);
  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      if ((px - x) ** 2 + (py - y) ** 2 > radius ** 2 + 0.25) continue;
      const index = frameStart + py * CIRCUIT_MASK_FRAME_WIDTH + px;
      if (!paintable || paintable[index]) mask[index] = value;
    }
  }
}

/** Paints an integer Bresenham stroke; radius 0 is an exact one-pixel pencil. */
export function paintMaskStroke(mask, frameIndex, from, to, value, radius = 0, paintable = null) {
  assertMask(mask);
  assertValue(value, 255);
  const start = frameOffset(frameIndex);
  let x = Math.round(from.x);
  let y = Math.round(from.y);
  const targetX = Math.round(to.x);
  const targetY = Math.round(to.y);
  const dx = Math.abs(targetX - x);
  const sx = x < targetX ? 1 : -1;
  const dy = -Math.abs(targetY - y);
  const sy = y < targetY ? 1 : -1;
  let error = dx + dy;
  const safeRadius = Math.max(0, Math.min(12, Math.round(radius)));

  while (true) {
    paintDisc(mask, start, x, y, value, safeRadius, paintable);
    if (x === targetX && y === targetY) break;
    const doubled = error * 2;
    if (doubled >= dy) { error += dy; x += sx; }
    if (doubled <= dx) { error += dx; y += sy; }
  }
}

/** Four-connected bucket fill, constrained to one frame and the source alpha. */
export function floodMaskRegion(mask, frameIndex, x, y, value, paintable = null) {
  assertMask(mask);
  assertValue(value, 255);
  const start = frameOffset(frameIndex);
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= CIRCUIT_MASK_FRAME_WIDTH || py >= CIRCUIT_MASK_FRAME_HEIGHT) return 0;
  const first = start + py * CIRCUIT_MASK_FRAME_WIDTH + px;
  if ((paintable && !paintable[first]) || mask[first] === value) return 0;
  const target = mask[first];
  const queued = new Uint8Array(FRAME_PIXELS);
  const queue = [py * CIRCUIT_MASK_FRAME_WIDTH + px];
  queued[queue[0]] = 1;
  let changed = 0;

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const local = queue[cursor];
    const index = start + local;
    if (mask[index] !== target || (paintable && !paintable[index])) continue;
    mask[index] = value;
    changed += 1;
    const cx = local % CIRCUIT_MASK_FRAME_WIDTH;
    const cy = Math.floor(local / CIRCUIT_MASK_FRAME_WIDTH);
    const neighbours = [];
    if (cx > 0) neighbours.push(local - 1);
    if (cx + 1 < CIRCUIT_MASK_FRAME_WIDTH) neighbours.push(local + 1);
    if (cy > 0) neighbours.push(local - CIRCUIT_MASK_FRAME_WIDTH);
    if (cy + 1 < CIRCUIT_MASK_FRAME_HEIGHT) neighbours.push(local + CIRCUIT_MASK_FRAME_WIDTH);
    for (const next of neighbours) {
      if (!queued[next]) { queued[next] = 1; queue.push(next); }
    }
  }
  return changed;
}

export function maskedPixelCount(mask, frameIndex = null) {
  assertMask(mask);
  const start = frameIndex === null ? 0 : frameOffset(frameIndex);
  const end = frameIndex === null ? mask.length : start + FRAME_PIXELS;
  let count = 0;
  for (let index = start; index < end; index += 1) if (mask[index]) count += 1;
  return count;
}

export function maskCompletion(mask, paintable) {
  assertMask(mask);
  if (!(paintable instanceof Uint8Array) || paintable.length !== MASK_PIXELS) {
    throw new Error("paintable silhouette must match the circuit mask");
  }
  let total = 0;
  let assigned = 0;
  const frames = CIRCUIT_MASK_HEADINGS.map((heading, frameIndex) => {
    const start = frameOffset(frameIndex);
    let frameTotal = 0;
    let frameAssigned = 0;
    for (let index = start; index < start + FRAME_PIXELS; index += 1) {
      if (!paintable[index]) continue;
      frameTotal += 1;
      if (mask[index] !== 0) frameAssigned += 1;
    }
    total += frameTotal;
    assigned += frameAssigned;
    return {
      heading,
      assigned: frameAssigned,
      total: frameTotal,
      percent: frameTotal ? Math.round(frameAssigned / frameTotal * 100) : 100,
    };
  });
  return {
    assigned,
    total,
    percent: total ? Math.round(assigned / total * 100) : 100,
    frames,
  };
}
