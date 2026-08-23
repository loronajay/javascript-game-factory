// Model-specific perspective calibration for longitudinal livery stripes.
//
// The circuit atlases are eight independent painted views, not rotations of a
// single 3D mesh. An authored guide uses a pair of rough paths on each
// visible hood/roof/deck segment. A pair defines the local across-stripe axis;
// the renderer interpolates between it instead of pretending a whole sprite is
// one flat, rotated rectangle.

import { CIRCUIT_FRAME_SIZE } from "./assets.js";
import { localCarCoordinates } from "./sprite-geometry.js";

const pair = (a0, a1, b0, b1) => Object.freeze({
  a: Object.freeze([Object.freeze(a0), Object.freeze(a1)]),
  b: Object.freeze([Object.freeze(b0), Object.freeze(b1)]),
});

// Atlas frame order by visible nose:
// North, Northeast, East, Southeast, South, Southwest, West, Northwest.
// These are distilled endpoints from kaido-gts-stripe-flow.json. North/South
// were already correct and deliberately remain empty identity mappings.
export const KAIDO_STRIPE_PANEL_GUIDES = Object.freeze([
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

const TSUNAMI_WEST_GUIDES = Object.freeze([
  pair([18.87, 25.56], [6.64, 27.96], [18.64, 27.84], [6.19, 30.7]),
  pair([30.53, 21.1], [42.3, 20.76], [30.19, 23.96], [41.96, 23.16]),
  pair([52.47, 25.9], [53.84, 26.01], [52.13, 28.53], [53.61, 28.53]),
]);

const mirrorGuide = (guide) => pair(
  [63 - guide.a[0][0], guide.a[0][1]],
  [63 - guide.a[1][0], guide.a[1][1]],
  [63 - guide.b[0][0], guide.b[0][1]],
  [63 - guide.b[1][0], guide.b[1][1]],
);

// Tsunami's generated East body was invalid and is repaired from mirrored West
// art. Its East guide follows the same identity-preserving mirror rather than
// retaining paths authored over the discarded car.
export const TSUNAMI_STRIPE_PANEL_GUIDES = Object.freeze([
  Object.freeze([]),
  Object.freeze([
    pair([32.81, 16.76], [25.73, 23.27], [38.53, 18.36], [31.21, 25.1]),
    pair([18.07, 33.9], [12.7, 38.36], [22.19, 36.19], [17.16, 42.01]),
    pair([12.01, 43.04], [10.3, 54.13], [15.44, 44.87], [14.53, 55.5]),
  ]),
  TSUNAMI_WEST_GUIDES,
  Object.freeze([
    pair([27.44, 18.36], [36.59, 25.33], [33.04, 15.39], [41.39, 22.47]),
    pair([45.27, 32.99], [48.13, 35.04], [49.04, 30.24], [52.01, 33.56]),
    pair([47.33, 35.96], [47.33, 47.61], [51.44, 35.04], [50.99, 44.99]),
    pair([22.07, 16.41], [15.44, 13.33], [17.96, 18.47], [12.13, 15.27]),
  ]),
  Object.freeze([]),
  Object.freeze([
    pair([31.1, 15.61], [20.7, 22.36], [35.44, 18.01], [25.16, 24.76]),
    pair([41.5, 16.53], [48.13, 14.59], [45.27, 18.24], [50.53, 16.07]),
    pair([14.87, 32.07], [13.04, 34.01], [18.3, 33.21], [15.44, 36.19]),
    pair([13.04, 36.07], [12.93, 46.59], [15.56, 38.13], [16.24, 48.53]),
  ]),
  Object.freeze(TSUNAMI_WEST_GUIDES.map(mirrorGuide)),
  Object.freeze([
    pair([21.39, 17.44], [28.36, 24.07], [25.96, 15.84], [32.36, 22.01]),
    pair([38.3, 36.64], [44.7, 42.01], [43.21, 33.79], [48.47, 39.39]),
    pair([47.9, 45.79], [48.7, 55.39], [50.53, 43.84], [51.67, 55.04]),
  ]),
]);

const EMPTY_STRIPE_PANEL_GUIDES = Object.freeze(Array.from(
  { length: 8 },
  () => Object.freeze([]),
));
const STRIPE_PANEL_GUIDES_BY_MODEL = Object.freeze({
  "kaido-gts": KAIDO_STRIPE_PANEL_GUIDES,
  "tsunami-rz": TSUNAMI_STRIPE_PANEL_GUIDES,
  // All six remaining masters use the same camera pose and panel layout as
  // Kaido. Sharing its calibrated perspective axes gives every race-ready body
  // honest hood/roof/deck angles instead of falling back to one flat rectangle.
  "meridian-rs": KAIDO_STRIPE_PANEL_GUIDES,
  "skyward-r": KAIDO_STRIPE_PANEL_GUIDES,
  "toro-sv": KAIDO_STRIPE_PANEL_GUIDES,
  "scalpel-r": KAIDO_STRIPE_PANEL_GUIDES,
  "chrono-12": KAIDO_STRIPE_PANEL_GUIDES,
  "colt-gt": KAIDO_STRIPE_PANEL_GUIDES,
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
