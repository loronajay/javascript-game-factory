import {
  BASE,
  DEPLOY_ZONE,
  ENEMY_PATHS,
  ROUTE_SEGMENTS,
  TERRAIN,
  WORLD,
} from './map.js';

function segmentKey(a, b) {
  const first = `${a.x},${a.y}`;
  const second = `${b.x},${b.y}`;
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

function deriveRouteSegments(paths) {
  const segments = [];
  const seen = new Set();
  for (const path of paths) {
    for (let index = 1; index < path.points.length; index += 1) {
      const a = path.points[index - 1];
      const b = path.points[index];
      const key = segmentKey(a, b);
      if (seen.has(key)) continue;
      seen.add(key);
      segments.push({ a, b });
    }
  }
  return segments;
}

// This is the map-authoring boundary. A new battlefield only needs its geometry,
// spawn lanes, terrain, and a visual palette; route data is derived automatically
// for simulation, while each battlefield decides whether it is visible.
export function defineBattlefield(definition) {
  return Object.freeze({
    ...definition,
    world: Object.freeze({ ...definition.world }),
    base: Object.freeze({ ...definition.base }),
    deployZone: Object.freeze({ ...definition.deployZone }),
    enemyPaths: Object.freeze(definition.enemyPaths.map((path) => Object.freeze({
      ...path,
      points: Object.freeze(path.points.map((point) => Object.freeze({ ...point }))),
    }))),
    labels: Object.freeze((definition.labels ?? []).map((label) => Object.freeze({ ...label }))),
    terrain: Object.freeze(definition.terrain.map((feature) => Object.freeze({
      ...feature,
      polygon: Object.freeze(feature.polygon.map((point) => Object.freeze({ ...point }))),
    }))),
    palette: Object.freeze({ ...definition.palette }),
    renderRoutes: definition.renderRoutes ?? false,
    routeSegments: Object.freeze(deriveRouteSegments(definition.enemyPaths)),
  });
}

export const BLACKGLASS_PLATEAU = defineBattlefield({
  id: 'blackglass-plateau',
  name: 'Blackglass Plateau',
  world: WORLD,
  base: BASE,
  deployZone: DEPLOY_ZONE,
  enemyPaths: ENEMY_PATHS,
  terrain: TERRAIN,
  renderRoutes: false,
  palette: {
    top: '#263c70',
    middle: '#18254d',
    bottom: '#090c20',
    screenCenter: '#162b5b',
    sky: '#658ee8',
    terrain: '#26345f',
    terrainEdge: '#92a6ea',
    ruin: '#4b3865',
    routeGlow: '#ffbd59',
    danger: '#ff4e76',
    accent: '#65f3e6',
    grid: '#9bb9ff',
  },
  // Kept explicitly for the established map: the legacy module already derives it.
  routeSegments: ROUTE_SEGMENTS,
});

export const CINDER_PASS = defineBattlefield({
  id: 'cinder-pass',
  name: 'Cinder Pass',
  world: { width: 1000, height: 1400 },
  base: { x: 500, y: 108, radius: 54 },
  deployZone: { minX: 58, maxX: 942, minY: 176, maxY: 1028 },
  enemyPaths: [
    {
      id: 'west-rift',
      label: 'West Rift',
      points: [
        { x: 56, y: 1334 }, { x: 152, y: 1165 }, { x: 286, y: 1004 }, { x: 376, y: 784 },
        { x: 442, y: 566 }, { x: 500, y: 348 }, { x: 500, y: 108 },
      ],
    },
    {
      id: 'west-breach',
      label: 'West Breach',
      points: [
        { x: 284, y: 1360 }, { x: 336, y: 1170 }, { x: 430, y: 930 }, { x: 376, y: 784 },
        { x: 442, y: 566 }, { x: 500, y: 348 }, { x: 500, y: 108 },
      ],
    },
    {
      id: 'east-breach',
      label: 'East Breach',
      points: [
        { x: 716, y: 1360 }, { x: 664, y: 1170 }, { x: 570, y: 930 }, { x: 624, y: 784 },
        { x: 558, y: 566 }, { x: 500, y: 348 }, { x: 500, y: 108 },
      ],
    },
    {
      id: 'east-rift',
      label: 'East Rift',
      points: [
        { x: 944, y: 1334 }, { x: 848, y: 1165 }, { x: 714, y: 1004 }, { x: 624, y: 784 },
        { x: 558, y: 566 }, { x: 500, y: 348 }, { x: 500, y: 108 },
      ],
    },
  ],
  terrain: [
    {
      id: 'west-caldera-wall', type: 'cliff', polygon: [
        { x: 24, y: 192 }, { x: 310, y: 176 }, { x: 350, y: 348 }, { x: 300, y: 580 },
        { x: 174, y: 720 }, { x: 28, y: 672 },
      ],
    },
    {
      id: 'east-caldera-wall', type: 'cliff', polygon: [
        { x: 976, y: 192 }, { x: 690, y: 176 }, { x: 650, y: 348 }, { x: 700, y: 580 },
        { x: 826, y: 720 }, { x: 972, y: 672 },
      ],
    },
    {
      id: 'central-cinder-isle', type: 'mesa', polygon: [
        { x: 458, y: 700 }, { x: 542, y: 700 }, { x: 558, y: 805 }, { x: 530, y: 875 },
        { x: 470, y: 875 }, { x: 442, y: 805 },
      ],
    },
    {
      id: 'west-ash-shelf', type: 'ruin', polygon: [
        { x: 46, y: 910 }, { x: 222, y: 866 }, { x: 278, y: 954 }, { x: 236, y: 1118 },
        { x: 70, y: 1144 }, { x: 28, y: 1040 },
      ],
    },
    {
      id: 'east-ash-shelf', type: 'ruin', polygon: [
        { x: 954, y: 910 }, { x: 778, y: 866 }, { x: 722, y: 954 }, { x: 764, y: 1118 },
        { x: 930, y: 1144 }, { x: 972, y: 1040 },
      ],
    },
  ],
  renderRoutes: false,
  palette: {
    top: '#8a3034',
    middle: '#4e1d35',
    bottom: '#180b1c',
    screenCenter: '#511d38',
    sky: '#ff9758',
    terrain: '#5d273f',
    terrainEdge: '#f08a5d',
    ruin: '#49303f',
    routeGlow: '#ffd166',
    danger: '#ff4f6d',
    accent: '#a4f7ff',
    grid: '#ffb26b',
  },
});

// A broad southern approach collapses into one exposed span. The player can
// spread to catch the early routes, but the bridge itself becomes the natural
// place to make a costly, memorable last stand.
export const IRONWOOD_BRIDGE = defineBattlefield({
  id: 'ironwood-bridge',
  name: 'Ironwood Span',
  world: { width: 1000, height: 1400 },
  base: { x: 500, y: 108, radius: 54 },
  deployZone: { minX: 54, maxX: 946, minY: 176, maxY: 1050 },
  enemyPaths: [
    {
      id: 'west-road',
      label: 'West Road',
      points: [
        { x: 96, y: 1360 }, { x: 178, y: 1180 }, { x: 278, y: 1000 }, { x: 360, y: 816 },
        { x: 432, y: 670 }, { x: 500, y: 500 }, { x: 500, y: 108 },
      ],
    },
    {
      id: 'causeway',
      label: 'Central Causeway',
      points: [
        { x: 500, y: 1360 }, { x: 500, y: 1130 }, { x: 500, y: 910 }, { x: 500, y: 670 },
        { x: 500, y: 500 }, { x: 500, y: 108 },
      ],
    },
    {
      id: 'east-road',
      label: 'East Road',
      points: [
        { x: 904, y: 1360 }, { x: 822, y: 1180 }, { x: 722, y: 1000 }, { x: 640, y: 816 },
        { x: 568, y: 670 }, { x: 500, y: 500 }, { x: 500, y: 108 },
      ],
    },
  ],
  terrain: [
    {
      id: 'west-ironwood', type: 'cliff', polygon: [
        { x: 28, y: 170 }, { x: 286, y: 180 }, { x: 324, y: 420 }, { x: 290, y: 662 },
        { x: 182, y: 742 }, { x: 28, y: 702 },
      ],
    },
    {
      id: 'east-ironwood', type: 'cliff', polygon: [
        { x: 972, y: 170 }, { x: 714, y: 180 }, { x: 676, y: 420 }, { x: 710, y: 662 },
        { x: 818, y: 742 }, { x: 972, y: 702 },
      ],
    },
    {
      id: 'west-floodplain', type: 'ruin', polygon: [
        { x: 34, y: 854 }, { x: 176, y: 824 }, { x: 252, y: 902 }, { x: 214, y: 1074 },
        { x: 74, y: 1118 }, { x: 28, y: 1008 },
      ],
    },
    {
      id: 'east-floodplain', type: 'ruin', polygon: [
        { x: 966, y: 854 }, { x: 824, y: 824 }, { x: 748, y: 902 }, { x: 786, y: 1074 },
        { x: 926, y: 1118 }, { x: 972, y: 1008 },
      ],
    },
    {
      id: 'west-south-ridge', type: 'mesa', polygon: [
        { x: 286, y: 1160 }, { x: 424, y: 1148 }, { x: 452, y: 1270 }, { x: 416, y: 1364 },
        { x: 300, y: 1372 }, { x: 256, y: 1270 },
      ],
    },
    {
      id: 'east-south-ridge', type: 'mesa', polygon: [
        { x: 714, y: 1160 }, { x: 576, y: 1148 }, { x: 548, y: 1270 }, { x: 584, y: 1364 },
        { x: 700, y: 1372 }, { x: 744, y: 1270 },
      ],
    },
  ],
  renderRoutes: false,
  palette: {
    top: '#285463', middle: '#183747', bottom: '#091a29', screenCenter: '#1f5265', sky: '#8ed6cc',
    terrain: '#285461', terrainEdge: '#a5e6d4', ruin: '#475c5a', routeGlow: '#ffd772',
    danger: '#ff5e6c', accent: '#78f5d0', grid: '#8ac8c8',
  },
});

// Five short approach lanes make this map a reserve-management puzzle. The
// shard walls keep a unit committed to one chamber for just long enough that
// timing a retreat or an interceptor matters more than raw unit count.
export const REACTOR_SHARDS = defineBattlefield({
  id: 'reactor-shards',
  name: 'Reactor Shards',
  world: { width: 1000, height: 1400 },
  base: { x: 500, y: 108, radius: 54 },
  deployZone: { minX: 54, maxX: 946, minY: 176, maxY: 1040 },
  enemyPaths: [
    {
      id: 'west-shard', label: 'West Shard',
      points: [
        { x: 72, y: 1280 }, { x: 190, y: 1110 }, { x: 282, y: 916 }, { x: 364, y: 720 },
        { x: 438, y: 510 }, { x: 500, y: 332 }, { x: 500, y: 108 },
      ],
    },
    {
      id: 'west-relay', label: 'West Relay',
      points: [
        { x: 286, y: 1360 }, { x: 332, y: 1170 }, { x: 398, y: 964 }, { x: 364, y: 720 },
        { x: 438, y: 510 }, { x: 500, y: 332 }, { x: 500, y: 108 },
      ],
    },
    {
      id: 'core-seam', label: 'Core Seam',
      points: [
        { x: 500, y: 1360 }, { x: 500, y: 1120 }, { x: 500, y: 862 }, { x: 500, y: 646 },
        { x: 500, y: 332 }, { x: 500, y: 108 },
      ],
    },
    {
      id: 'east-relay', label: 'East Relay',
      points: [
        { x: 714, y: 1360 }, { x: 668, y: 1170 }, { x: 602, y: 964 }, { x: 636, y: 720 },
        { x: 562, y: 510 }, { x: 500, y: 332 }, { x: 500, y: 108 },
      ],
    },
    {
      id: 'east-shard', label: 'East Shard',
      points: [
        { x: 928, y: 1280 }, { x: 810, y: 1110 }, { x: 718, y: 916 }, { x: 636, y: 720 },
        { x: 562, y: 510 }, { x: 500, y: 332 }, { x: 500, y: 108 },
      ],
    },
  ],
  terrain: [
    {
      id: 'upper-west-shard', type: 'mesa', polygon: [
        { x: 76, y: 204 }, { x: 340, y: 184 }, { x: 394, y: 306 }, { x: 346, y: 474 },
        { x: 196, y: 524 }, { x: 68, y: 432 },
      ],
    },
    {
      id: 'upper-east-shard', type: 'mesa', polygon: [
        { x: 924, y: 204 }, { x: 660, y: 184 }, { x: 606, y: 306 }, { x: 654, y: 474 },
        { x: 804, y: 524 }, { x: 932, y: 432 },
      ],
    },
    {
      id: 'west-inner-shard', type: 'cliff', polygon: [
        { x: 54, y: 620 }, { x: 254, y: 590 }, { x: 308, y: 698 }, { x: 272, y: 850 },
        { x: 126, y: 896 }, { x: 28, y: 806 },
      ],
    },
    {
      id: 'east-inner-shard', type: 'cliff', polygon: [
        { x: 946, y: 620 }, { x: 746, y: 590 }, { x: 692, y: 698 }, { x: 728, y: 850 },
        { x: 874, y: 896 }, { x: 972, y: 806 },
      ],
    },
    {
      id: 'southwest-broken-reactor', type: 'ruin', polygon: [
        { x: 42, y: 1002 }, { x: 180, y: 968 }, { x: 248, y: 1066 }, { x: 216, y: 1236 },
        { x: 64, y: 1262 }, { x: 28, y: 1136 },
      ],
    },
    {
      id: 'southeast-broken-reactor', type: 'ruin', polygon: [
        { x: 958, y: 1002 }, { x: 820, y: 968 }, { x: 752, y: 1066 }, { x: 784, y: 1236 },
        { x: 936, y: 1262 }, { x: 972, y: 1136 },
      ],
    },
  ],
  renderRoutes: false,
  palette: {
    top: '#4d2d7b', middle: '#2a1c56', bottom: '#0b0b24', screenCenter: '#3f286f', sky: '#c08cff',
    terrain: '#42306d', terrainEdge: '#d1a7ff', ruin: '#59416e', routeGlow: '#ffe37b',
    danger: '#ff5276', accent: '#86f6ff', grid: '#a997ec',
  },
});

export const BATTLEFIELDS = Object.freeze([
  BLACKGLASS_PLATEAU,
  CINDER_PASS,
  IRONWOOD_BRIDGE,
  REACTOR_SHARDS,
]);

export function getBattlefieldById(id) {
  return BATTLEFIELDS.find((map) => map.id === id) ?? null;
}
