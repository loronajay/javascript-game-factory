import test from "node:test";
import assert from "node:assert/strict";

import {
  CAMPAIGN_GRID,
  cellToPercent,
  buildTrailPath,
  computeCampaignGeometry,
  computeRegionBoxes,
} from "../src/campaign/campaignMap.js";
import {
  BROTHERS_MISSION_ID,
  CAMPAIGN_MISSIONS,
  CAMPAIGN_REGIONS,
  CLOD_MISSION_ID,
  FATHER_TIME_MISSION_ID,
  FINAL_BATTLE_MISSION_ID,
  GARGOYLE_MISSION_ID,
  HASBEEN_HEROES_MISSION_ID,
  MAX_CAMPAIGN_MISSIONS,
  MINER_MISSION_ID,
  MONK_MISSION_ID,
  NECROMANCER_MISSION_ID,
  NOT_MY_KING_MISSION_ID,
  OUT_OF_RETIREMENT_MISSION_ID,
  PALADIN_MISSION_ID,
  RONIN_MISSION_ID,
  SHOWDOWN_MISSION_ID,
  SNIPER_MISSION_ID,
  SPIRIT_WOODS_MISSION_ID,
  VIRUS_MISSION_ID,
  VOIDWOOD_MISSION_ID,
  VOID_CASTLE_MISSION_ID,
  WANDERING_PARTY_MISSION_ID,
  WITCH_DOCTOR_MISSION_ID,
  WRONG_PLACE_MISSION_ID,
  getCampaignMap,
} from "../src/campaign/campaign.js";

function storageAdapter() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

const PAINTED_MAP_NODE_CENTERS = Object.freeze({
  [CLOD_MISSION_ID]: Object.freeze({ x: 9.39, y: 88.44 }),
  [NECROMANCER_MISSION_ID]: Object.freeze({ x: 19.04, y: 76.93 }),
  [WITCH_DOCTOR_MISSION_ID]: Object.freeze({ x: 30.87, y: 87.43 }),
  [FATHER_TIME_MISSION_ID]: Object.freeze({ x: 21.45, y: 48.65 }),
  [VIRUS_MISSION_ID]: Object.freeze({ x: 11.23, y: 45.11 }),
  [PALADIN_MISSION_ID]: Object.freeze({ x: 28.72, y: 34.39 }),
  [MONK_MISSION_ID]: Object.freeze({ x: 21.33, y: 20.08 }),
  [BROTHERS_MISSION_ID]: Object.freeze({ x: 46.07, y: 30.76 }),
  [GARGOYLE_MISSION_ID]: Object.freeze({ x: 52.25, y: 18.22 }),
  [SNIPER_MISSION_ID]: Object.freeze({ x: 63.36, y: 24.68 }),
  [WANDERING_PARTY_MISSION_ID]: Object.freeze({ x: 66.98, y: 36.83 }),
  [MINER_MISSION_ID]: Object.freeze({ x: 56.29, y: 46.73 }),
  [HASBEEN_HEROES_MISSION_ID]: Object.freeze({ x: 50.09, y: 58.45 }),
  [RONIN_MISSION_ID]: Object.freeze({ x: 56.13, y: 72.44 }),
  [WRONG_PLACE_MISSION_ID]: Object.freeze({ x: 68.55, y: 79.02 }),
  [OUT_OF_RETIREMENT_MISSION_ID]: Object.freeze({ x: 85.73, y: 87.27 }),
  [VOIDWOOD_MISSION_ID]: Object.freeze({ x: 74.91, y: 63.78 }),
  [SPIRIT_WOODS_MISSION_ID]: Object.freeze({ x: 29.97, y: 56.93 }),
  [SHOWDOWN_MISSION_ID]: Object.freeze({ x: 79.86, y: 45.19 }),
  [NOT_MY_KING_MISSION_ID]: Object.freeze({ x: 83.88, y: 30.8 }),
  [VOID_CASTLE_MISSION_ID]: Object.freeze({ x: 86.95, y: 19.13 }),
  [FINAL_BATTLE_MISSION_ID]: Object.freeze({ x: 90.54, y: 45.2 }),
});

test("cellToPercent keeps every grid cell inside the padded canvas", () => {
  const corners = [
    { col: 0, row: 0 },
    { col: CAMPAIGN_GRID.cols - 1, row: 0 },
    { col: 0, row: CAMPAIGN_GRID.rows - 1 },
    { col: CAMPAIGN_GRID.cols - 1, row: CAMPAIGN_GRID.rows - 1 },
  ];
  for (const cell of corners) {
    const { x, y } = cellToPercent(cell);
    assert.ok(x >= 0 && x <= 100, `x within canvas for ${JSON.stringify(cell)}`);
    assert.ok(y >= 0 && y <= 100, `y within canvas for ${JSON.stringify(cell)}`);
  }
  // Column 0 sits left of the last column; row 0 sits above the last row.
  assert.ok(cellToPercent({ col: 0, row: 2 }).x < cellToPercent({ col: 6, row: 2 }).x);
  assert.ok(cellToPercent({ col: 2, row: 0 }).y < cellToPercent({ col: 2, row: 4 }).y);
});

test("cellToPercent clamps out-of-range cells instead of overflowing", () => {
  const low = cellToPercent({ col: -5, row: -5 });
  const high = cellToPercent({ col: 99, row: 99 });
  assert.deepEqual(low, cellToPercent({ col: 0, row: 0 }));
  assert.deepEqual(high, cellToPercent({ col: CAMPAIGN_GRID.cols - 1, row: CAMPAIGN_GRID.rows - 1 }));
});

test("buildTrailPath is a deterministic quadratic bezier between two points", () => {
  const a = { x: 10, y: 20 };
  const b = { x: 40, y: 20 };
  const d = buildTrailPath(a, b, "a::b");
  assert.match(d, /^M 10 20 Q -?\d/);
  assert.match(d, / 40 20$/);
  // Stable across calls with the same key.
  assert.equal(d, buildTrailPath(a, b, "a::b"));
});

test("computeCampaignGeometry dedupes undirected trails and paths every edge", () => {
  const missions = [
    { id: "a", cell: { col: 0, row: 0 }, connections: ["b"] },
    { id: "b", cell: { col: 1, row: 0 }, connections: ["a", "c"] }, // a<->b is one trail
    { id: "c", cell: { col: 2, row: 0 }, connections: [] },
  ];
  const geo = computeCampaignGeometry(missions);
  assert.equal(geo.edges.length, 2, "a-b counted once, plus b-c");
  assert.ok(geo.positions.a && geo.positions.b && geo.positions.c);
  for (const edge of geo.edges) assert.match(edge.d, /^M /);
});

test("computeCampaignGeometry prefers authored image points over grid cells", () => {
  const geo = computeCampaignGeometry([
    { id: "a", cell: { col: 0, row: 0 }, point: { x: 12.345, y: 67.891 }, connections: [] },
  ]);

  assert.deepEqual(geo.positions.a, { x: 12.35, y: 67.89 });
});

test("authored campaign points sit on the painted map node centers", () => {
  assert.equal(Object.keys(PAINTED_MAP_NODE_CENTERS).length, CAMPAIGN_MISSIONS.length);
  for (const mission of CAMPAIGN_MISSIONS) {
    assert.deepEqual(
      mission.point,
      PAINTED_MAP_NODE_CENTERS[mission.id],
      `${mission.id} should stay centered on its painted map node`,
    );
  }
});

test("computeCampaignGeometry ignores connections to unknown nodes", () => {
  const geo = computeCampaignGeometry([
    { id: "a", cell: { col: 0, row: 0 }, connections: ["ghost"] },
  ]);
  assert.equal(geo.edges.length, 0);
});

test("the authored campaign graph is capped, uniquely celled, and fully connected", () => {
  // The trail is fully authored up to the cap — no placeholder stops remain.
  assert.equal(CAMPAIGN_MISSIONS.length, MAX_CAMPAIGN_MISSIONS);

  // No two missions share a grid cell (nodes never overlap on the map).
  const cellKeys = new Set(CAMPAIGN_MISSIONS.map((m) => `${m.cell.col},${m.cell.row}`));
  assert.equal(cellKeys.size, CAMPAIGN_MISSIONS.length);

  // Every connection points at a real mission id.
  const ids = new Set(CAMPAIGN_MISSIONS.map((m) => m.id));
  for (const mission of CAMPAIGN_MISSIONS) {
    for (const target of mission.connections) assert.ok(ids.has(target), `${mission.id} -> ${target}`);
  }

  // The trail graph is connected: walking undirected edges from the first stop
  // reaches every node (no marooned islands on the map).
  const adjacency = new Map(CAMPAIGN_MISSIONS.map((m) => [m.id, new Set()]));
  for (const mission of CAMPAIGN_MISSIONS) {
    for (const target of mission.connections) {
      adjacency.get(mission.id).add(target);
      adjacency.get(target).add(mission.id);
    }
  }
  const seen = new Set([CAMPAIGN_MISSIONS[0].id]);
  const stack = [CAMPAIGN_MISSIONS[0].id];
  while (stack.length) {
    for (const next of adjacency.get(stack.pop())) {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  assert.equal(seen.size, CAMPAIGN_MISSIONS.length, "all stops reachable via trails");
});

test("Mechs on the Farm claims the reserved farmland landmark; Ashfall Flats keeps the mining landmark", () => {
  const farmlandPoint = { x: 46.07, y: 30.76 };
  const miningPoint = { x: 52.25, y: 18.22 };
  const farmlandNode = CAMPAIGN_MISSIONS.find((mission) =>
    mission.point?.x === farmlandPoint.x && mission.point?.y === farmlandPoint.y
  );
  const ashfallFlats = CAMPAIGN_MISSIONS.find((mission) => mission.id === GARGOYLE_MISSION_ID);

  // The farmland landmark, once reserved "for a future unit," now hosts the mech brothers.
  assert.ok(farmlandNode, "the farmland landmark should host a mission");
  assert.equal(farmlandNode.id, BROTHERS_MISSION_ID);
  assert.equal(farmlandNode.locationName, "Meadowmill Farm");
  assert.ok(ashfallFlats, "Ashfall Flats should remain on the campaign trail");
  assert.equal(ashfallFlats.locationName, "Ashfall Flats");
  assert.deepEqual(ashfallFlats.point, miningPoint);
});

test("every mission belongs to a real region and names its place on the map", () => {
  const regionIds = new Set(CAMPAIGN_REGIONS.map((region) => region.id));
  for (const mission of CAMPAIGN_MISSIONS) {
    assert.ok(regionIds.has(mission.region), `${mission.id} in a real region`);
    assert.equal(typeof mission.locationName, "string");
    assert.ok(mission.locationName.length > 0);
  }
});

test("computeRegionBoxes yields one on-canvas box per populated region", () => {
  const boxes = computeRegionBoxes(CAMPAIGN_MISSIONS, CAMPAIGN_REGIONS);
  const usedRegions = new Set(CAMPAIGN_MISSIONS.map((mission) => mission.region));
  assert.equal(boxes.length, usedRegions.size);
  for (const box of boxes) {
    assert.ok(box.x >= 0 && box.x <= 100);
    assert.ok(box.y >= 0 && box.y <= 100);
    assert.ok(box.w > 0 && box.x + box.w <= 100 + 1e-6);
    assert.ok(box.h > 0 && box.y + box.h <= 100 + 1e-6);
    assert.equal(typeof box.label, "string");
    assert.equal(typeof box.biome, "string");
  }
});

test("getCampaignMap exposes terrain regions alongside nodes and trails", () => {
  const map = getCampaignMap(storageAdapter());
  assert.ok(Array.isArray(map.regions) && map.regions.length >= 1);
  assert.ok(map.regions.every((region) => typeof region.biome === "string"));
  // The opening stop reports its biome so the node can echo its terrain.
  assert.equal(map.nodes[0].biome, "rock");
});
