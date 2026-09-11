// Model-specific perspective calibration for longitudinal livery stripes.
//
// The circuit atlases are eight independent painted views, not rotations of a
// single 3D mesh. An authored guide uses a pair of rough paths on each
// visible hood/roof/deck segment. A pair defines the local across-stripe axis;
// the renderer interpolates between it instead of pretending a whole sprite is
// one flat, rotated rectangle.

import { CIRCUIT_FRAME_SIZE } from "./assets.js";
import { localCarCoordinates } from "./sprite-geometry.js";
import { MODEL_STRIPE_GUIDES } from "./model-stripe-guides.js";

const pair = (a0, a1, b0, b1) => Object.freeze({
  a: Object.freeze([Object.freeze(a0), Object.freeze(a1)]),
  b: Object.freeze([Object.freeze(b0), Object.freeze(b1)]),
});

// The original generated masters stored the view from the opposite side of the
// car in each named slot. The PNGs are now canonical physical-nose atlases; the
// authored per-frame guides make the same one-time half-turn here.
const physicalHeadingOrder = (frames) => Object.freeze(frames.map(
  (_, frame) => frames[(frame + 4) % 8],
));

function mirroredLateralGuides(frames) {
  const result = [...frames];
  for (const [east, west] of [[1, 7], [2, 6], [3, 5]]) {
    result[east] = Object.freeze(frames[west].map(mirrorGuide));
  }
  return Object.freeze(result);
}

// Atlas frame order by visible nose:
// North, Northeast, East, Southeast, South, Southwest, West, Northwest.
// These are distilled endpoints from kaido-gts-stripe-flow.json. North/South
// were already correct and deliberately remain empty identity mappings.
const KAIDO_CAMERA_VIEW_PANEL_GUIDES = Object.freeze([
  Object.freeze([]),
  Object.freeze([
    pair([11.27, 44.3], [20.64, 34.47], [14.93, 46.13], [23.16, 36.07]),
    pair([29.33, 21.56], [37.1, 14.47], [34.47, 23.84], [42.81, 15.96]),
    pair([10.7, 45.44], [10.24, 52.76], [14.36, 47.61], [13.67, 54.59]),
    pair([43.5, 16.41], [45.33, 15.04], [46.24, 18.24], [48.19, 15.61]),
  ]),
  Object.freeze([
    pair([19.5, 26.7], [7.04, 30.36], [20.07, 28.99], [7.04, 33.21]),
    pair([31.61, 22.13], [44.3, 22.24], [31.39, 24.87], [41.67, 24.64]),
    pair([51.96, 26.47], [54.13, 27.16], [51.73, 28.41], [53.9, 29.33]),
  ]),
  Object.freeze([
    pair([27.96, 19.04], [37.79, 24.07], [32.07, 16.99], [40.53, 21.67]),
    pair([47.16, 34.93], [50.36, 37.9], [49.56, 32.87], [51.61, 34.81]),
    pair([49.9, 37.79], [49.9, 44.99], [52.76, 35.73], [53.1, 42.59]),
    pair([21.44, 18.01], [14.59, 16.3], [18.24, 20.87], [11.27, 18.24]),
  ]),
  Object.freeze([]),
  Object.freeze([
    pair([23.16, 20.99], [31.84, 14.47], [27.27, 23.04], [34.24, 16.99]),
    pair([42.59, 16.99], [47.73, 14.47], [43.96, 19.16], [50.81, 16.07]),
    pair([14.24, 33.33], [12.19, 35.39], [17.33, 34.59], [14.7, 36.87]),
    pair([12.53, 36.99], [11.96, 43.04], [14.93, 39.16], [14.47, 43.96]),
  ]),
  Object.freeze([
    pair([18.36, 21.44], [30.13, 21.21], [18.01, 24.07], [29.56, 24.19]),
    pair([41.79, 26.24], [56.3, 29.79], [41.79, 29.21], [55.73, 32.41]),
    pair([55.96, 32.41], [57.9, 35.27], [56.53, 30.59], [58.59, 33.33]),
    pair([11.04, 26.81], [9.56, 26.81], [11.73, 28.99], [9.9, 28.99]),
  ]),
  Object.freeze([
    pair([20.64, 16.87], [27.04, 22.93], [27.5, 14.93], [32.99, 20.41]),
    pair([36.99, 37.56], [43.39, 46.59], [42.24, 34.93], [49.56, 44.87]),
    pair([46.93, 48.53], [46.59, 55.39], [50.36, 46.93], [51.16, 54.13]),
    pair([17.56, 17.33], [16.3, 16.19], [15.73, 18.01], [13.9, 17.1]),
  ]),
]);

export const KAIDO_STRIPE_PANEL_GUIDES = mirroredLateralGuides(physicalHeadingOrder(KAIDO_CAMERA_VIEW_PANEL_GUIDES));

function mirrorGuide(guide) { return pair(
  [63 - guide.a[0][0], guide.a[0][1]],
  [63 - guide.a[1][0], guide.a[1][1]],
  [63 - guide.b[0][0], guide.b[0][1]],
  [63 - guide.b[1][0], guide.b[1][1]],
); }

const calibratedGuides = Object.freeze(Object.fromEntries(Object.entries(MODEL_STRIPE_GUIDES).map(
  ([modelId, frames]) => [modelId, Object.freeze(frames.map((guides) => Object.freeze(guides.map(
    (guide) => pair(guide.a[0], guide.a[1], guide.b[0], guide.b[1]),
  ))))],
)));
export const TSUNAMI_STRIPE_PANEL_GUIDES = calibratedGuides["tsunami-rz"];

const EMPTY_STRIPE_PANEL_GUIDES = Object.freeze(Array.from(
  { length: 8 },
  () => Object.freeze([]),
));
const STRIPE_PANEL_GUIDES_BY_MODEL = Object.freeze({
  ...calibratedGuides,
  "kaido-gts": KAIDO_STRIPE_PANEL_GUIDES,
});

export function circuitStripePanelGuides(modelId) {
  return STRIPE_PANEL_GUIDES_BY_MODEL[modelId] ?? EMPTY_STRIPE_PANEL_GUIDES;
}

const mix = (a, b, t) => a + (b - a) * t;
function closestOnSegment(point, segment) {
  const [from, to] = segment;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const lengthSquared = dx * dx + dy * dy || 1;
  const raw = ((point.x - from[0]) * dx + (point.y - from[1]) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, raw));
  const x = mix(from[0], to[0], t);
  const y = mix(from[1], to[1], t);
  const distanceSquared = (point.x - x) ** 2 + (point.y - y) ** 2;
  return { t, distanceSquared };
}

function nominalU(frameIndex, point, geometry) {
  return localCarCoordinates(
    frameIndex,
    point.x,
    point.y,
    CIRCUIT_FRAME_SIZE,
    geometry,
  ).u;
}

function panelCoordinate(frameIndex, guide, point, geometry) {
  const onA = closestOnSegment(point, guide.a);
  const onB = closestOnSegment(point, guide.b);
  const vectors = [guide.a, guide.b].map(([from, to]) => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const length = Math.hypot(dx, dy) || 1;
    return { x: dx / length, y: dy / length };
  });
  if (vectors[0].x * vectors[1].x + vectors[0].y * vectors[1].y < 0) {
    vectors[1].x *= -1;
    vectors[1].y *= -1;
  }
  const tangentLength = Math.hypot(
    vectors[0].x + vectors[1].x,
    vectors[0].y + vectors[1].y,
  ) || 1;
  const tangent = {
    x: (vectors[0].x + vectors[1].x) / tangentLength,
    y: (vectors[0].y + vectors[1].y) / tangentLength,
  };
  const anchor = {
    x: (guide.a[0][0] + guide.a[1][0] + guide.b[0][0] + guide.b[1][0]) / 4,
    y: (guide.a[0][1] + guide.a[1][1] + guide.b[0][1] + guide.b[1][1]) / 4,
  };
  const nominalAnchorU = nominalU(frameIndex, anchor, geometry);
  const lateralSpan = geometry.lateralMax - geometry.lateralMin || 1;
  let normal = { x: -tangent.y, y: tangent.x };
  if (nominalU(frameIndex, { x: anchor.x + normal.x, y: anchor.y + normal.y }, geometry) < nominalAnchorU) {
    normal = { x: -normal.x, y: -normal.y };
  }
  return {
    u: 0.5 + ((point.x - anchor.x) * normal.x + (point.y - anchor.y) * normal.y) / lateralSpan,
    distanceSquared: Math.min(onA.distanceSquared, onB.distanceSquared),
  };
}

/**
 * Maps a sprite pixel into the model's authored across-stripe coordinate.
 *
 * The nearest panel pair owns the pixel. Panel boundaries generally fall in
 * glass or transparent gaps, so this keeps each visible painted surface honest
 * without introducing a seam through bodywork. Other cars and the two already
 * correct cardinal frames retain the canonical projection by identity.
 */
export function circuitStripeCoordinates(modelId, frameIndex, local, geometry, point = null) {
  const guides = circuitStripePanelGuides(modelId)[frameIndex];
  if (!guides?.length || !geometry || !point) return local;

  let best = null;
  for (const guide of guides) {
    const candidate = panelCoordinate(frameIndex, guide, point, geometry);
    if (!best || candidate.distanceSquared < best.distanceSquared) best = candidate;
  }
  return best ? { ...local, u: best.u } : local;
}
