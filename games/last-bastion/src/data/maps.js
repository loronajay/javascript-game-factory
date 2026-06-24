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

export const BATTLEFIELDS = Object.freeze([BLACKGLASS_PLATEAU, CINDER_PASS]);

export function getBattlefieldById(id) {
  return BATTLEFIELDS.find((map) => map.id === id) ?? null;
}
