export const WORLD = Object.freeze({ width: 1000, height: 1400 });

export const BASE = Object.freeze({ x: 500, y: 108, radius: 54 });

export const DEPLOY_ZONE = Object.freeze({
  minX: 52,
  maxX: 948,
  minY: 176,
  maxY: 1018,
});

const P = Object.freeze({
  base: BASE,
  final: { x: 500, y: 205 },
  upperWest: { x: 438, y: 310 },
  upperEast: { x: 562, y: 310 },
  westRise: { x: 365, y: 475 },
  eastRise: { x: 635, y: 475 },
  westMerge: { x: 355, y: 625 },
  eastMerge: { x: 645, y: 625 },
  westInner: { x: 320, y: 765 },
  eastInner: { x: 680, y: 765 },
  westOuter: { x: 175, y: 752 },
  eastOuter: { x: 825, y: 752 },
  westCross: { x: 300, y: 905 },
  eastCross: { x: 700, y: 905 },
  westFlankCross: { x: 170, y: 945 },
  eastFlankCross: { x: 830, y: 945 },
  centerWest: { x: 405, y: 1090 },
  centerEast: { x: 595, y: 1090 },
  westLower: { x: 250, y: 1080 },
  eastLower: { x: 750, y: 1080 },
  westGate: { x: 285, y: 1215 },
  eastGate: { x: 715, y: 1215 },
  centerGate: { x: 500, y: 1235 },
  westFlank: { x: 145, y: 1190 },
  eastFlank: { x: 855, y: 1190 },
  spawnWestFlank: { x: 64, y: 1332 },
  spawnWest: { x: 268, y: 1365 },
  spawnCenter: { x: 500, y: 1360 },
  spawnEast: { x: 732, y: 1365 },
  spawnEastFlank: { x: 936, y: 1332 },
});

export const ENEMY_PATHS = [
  {
    id: 'west-flank',
    label: 'West Flank',
    points: [P.spawnWestFlank, P.westFlank, P.westLower, P.westFlankCross, P.westOuter, P.westMerge, P.westRise, P.upperWest, P.final, P.base],
  },
  {
    id: 'west-gate',
    label: 'West Gate',
    points: [P.spawnWest, P.westGate, P.westLower, P.westCross, P.westInner, P.westMerge, P.westRise, P.upperWest, P.final, P.base],
  },
  {
    id: 'center-west',
    label: 'Center West',
    points: [P.spawnCenter, P.centerGate, P.centerWest, P.westCross, P.westInner, P.westMerge, P.westRise, P.upperWest, P.final, P.base],
  },
  {
    id: 'center-east',
    label: 'Center East',
    points: [P.spawnCenter, P.centerGate, P.centerEast, P.eastCross, P.eastInner, P.eastMerge, P.eastRise, P.upperEast, P.final, P.base],
  },
  {
    id: 'east-gate',
    label: 'East Gate',
    points: [P.spawnEast, P.eastGate, P.eastLower, P.eastCross, P.eastInner, P.eastMerge, P.eastRise, P.upperEast, P.final, P.base],
  },
  {
    id: 'east-flank',
    label: 'East Flank',
    points: [P.spawnEastFlank, P.eastFlank, P.eastLower, P.eastFlankCross, P.eastOuter, P.eastMerge, P.eastRise, P.upperEast, P.final, P.base],
  },
];

function segmentKey(a, b) {
  const first = `${a.x},${a.y}`;
  const second = `${b.x},${b.y}`;
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

export const ROUTE_SEGMENTS = (() => {
  const segments = [];
  const seen = new Set();
  for (const route of ENEMY_PATHS) {
    for (let index = 1; index < route.points.length; index += 1) {
      const a = route.points[index - 1];
      const b = route.points[index];
      const key = segmentKey(a, b);
      if (seen.has(key)) continue;
      seen.add(key);
      segments.push({ a, b });
    }
  }
  return segments;
})();

export const TERRAIN = [
  {
    id: 'upper-west-escarpment',
    type: 'cliff',
    polygon: [
      { x: 38, y: 182 }, { x: 298, y: 170 }, { x: 338, y: 260 },
      { x: 310, y: 410 }, { x: 268, y: 548 }, { x: 58, y: 570 },
      { x: 26, y: 430 },
    ],
  },
  {
    id: 'upper-east-escarpment',
    type: 'cliff',
    polygon: [
      { x: 962, y: 182 }, { x: 702, y: 170 }, { x: 662, y: 260 },
      { x: 690, y: 410 }, { x: 732, y: 548 }, { x: 942, y: 570 },
      { x: 974, y: 430 },
    ],
  },
  {
    id: 'split-ridge',
    type: 'mesa',
    polygon: [
      { x: 426, y: 535 }, { x: 574, y: 535 }, { x: 612, y: 620 },
      { x: 582, y: 735 }, { x: 500, y: 782 }, { x: 418, y: 735 },
      { x: 388, y: 620 },
    ],
  },
  {
    id: 'west-cross-shelf',
    type: 'mesa',
    polygon: [
      { x: 337, y: 790 }, { x: 425, y: 772 }, { x: 458, y: 858 },
      { x: 428, y: 1018 }, { x: 346, y: 1040 }, { x: 318, y: 936 },
    ],
  },
  {
    id: 'east-cross-shelf',
    type: 'mesa',
    polygon: [
      { x: 663, y: 790 }, { x: 575, y: 772 }, { x: 542, y: 858 },
      { x: 572, y: 1018 }, { x: 654, y: 1040 }, { x: 682, y: 936 },
    ],
  },
  {
    id: 'west-outer-wall',
    type: 'cliff',
    polygon: [
      { x: 24, y: 680 }, { x: 122, y: 650 }, { x: 154, y: 730 },
      { x: 130, y: 902 }, { x: 88, y: 1035 }, { x: 26, y: 1002 },
    ],
  },
  {
    id: 'east-outer-wall',
    type: 'cliff',
    polygon: [
      { x: 976, y: 680 }, { x: 878, y: 650 }, { x: 846, y: 730 },
      { x: 870, y: 902 }, { x: 912, y: 1035 }, { x: 974, y: 1002 },
    ],
  },
  {
    id: 'lower-west-buttress',
    type: 'ruin',
    polygon: [
      { x: 315, y: 1125 }, { x: 425, y: 1108 }, { x: 457, y: 1195 },
      { x: 418, y: 1322 }, { x: 330, y: 1338 }, { x: 296, y: 1242 },
    ],
  },
  {
    id: 'lower-east-buttress',
    type: 'ruin',
    polygon: [
      { x: 685, y: 1125 }, { x: 575, y: 1108 }, { x: 543, y: 1195 },
      { x: 582, y: 1322 }, { x: 670, y: 1338 }, { x: 704, y: 1242 },
    ],
  },
  {
    id: 'south-west-ridge',
    type: 'cliff',
    polygon: [
      { x: 18, y: 1082 }, { x: 92, y: 1050 }, { x: 126, y: 1130 },
      { x: 112, y: 1260 }, { x: 54, y: 1320 }, { x: 18, y: 1278 },
    ],
  },
  {
    id: 'south-east-ridge',
    type: 'cliff',
    polygon: [
      { x: 982, y: 1082 }, { x: 908, y: 1050 }, { x: 874, y: 1130 },
      { x: 888, y: 1260 }, { x: 946, y: 1320 }, { x: 982, y: 1278 },
    ],
  },
];

export function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const intersects = ((a.y > point.y) !== (b.y > point.y))
      && (point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || 0.00001) + a.x);
    if (intersects) inside = !inside;
  }
  return inside;
}

export function distanceToSegmentSquared(point, a, b) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = point.x - a.x;
  const wy = point.y - a.y;
  const lengthSq = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / lengthSq));
  const dx = point.x - (a.x + vx * t);
  const dy = point.y - (a.y + vy * t);
  return dx * dx + dy * dy;
}

export function distanceToPolygon(point, polygon) {
  let minSq = Infinity;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    minSq = Math.min(minSq, distanceToSegmentSquared(point, a, b));
  }
  return Math.sqrt(minSq);
}

export function isOnRouteCorridor(point, radius = 0, map = null) {
  const allowance = Math.max(18, 48 - radius * 0.5);
  const allowanceSq = allowance * allowance;
  const routeSegments = map?.routeSegments ?? ROUTE_SEGMENTS;
  return routeSegments.some((segment) => distanceToSegmentSquared(point, segment.a, segment.b) <= allowanceSq);
}

export function isWorldWalkable(x, y, radius = 0, map = null, { allowRouteCorridor = true } = {}) {
  const world = map?.world ?? WORLD;
  const terrain = map?.terrain ?? TERRAIN;
  if (x < 28 + radius || x > world.width - 28 - radius || y < 48 + radius || y > world.height - 20 - radius) return false;
  const point = { x, y };
  if (allowRouteCorridor && isOnRouteCorridor(point, radius, map)) return true;
  for (const feature of terrain) {
    if (pointInPolygon(point, feature.polygon)) return false;
    if (radius > 0 && distanceToPolygon(point, feature.polygon) < radius) return false;
  }
  return true;
}

export function isDeployable(x, y, radius = 18, map = null) {
  const deployZone = map?.deployZone ?? DEPLOY_ZONE;
  const base = map?.base ?? BASE;
  if (x < deployZone.minX || x > deployZone.maxX || y < deployZone.minY || y > deployZone.maxY) return false;
  if (!isWorldWalkable(x, y, radius, map, { allowRouteCorridor: false })) return false;
  const dx = x - base.x;
  const dy = y - base.y;
  return dx * dx + dy * dy > (base.radius + radius + 20) ** 2;
}

export function getPathById(id, map = null) {
  const paths = map?.enemyPaths ?? ENEMY_PATHS;
  return paths.find((path) => path.id === id) ?? paths[0] ?? null;
}
