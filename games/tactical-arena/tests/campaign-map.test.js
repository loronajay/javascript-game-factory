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
  CAMPAIGN_MISSIONS,
  CAMPAIGN_REGIONS,
  MAX_CAMPAIGN_MISSIONS,
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

test("computeCampaignGeometry ignores connections to unknown nodes", () => {
  const geo = computeCampaignGeometry([
    { id: "a", cell: { col: 0, row: 0 }, connections: ["ghost"] },
  ]);
  assert.equal(geo.edges.length, 0);
});

test("the authored campaign graph is capped, uniquely celled, and fully connected", () => {
  assert.ok(CAMPAIGN_MISSIONS.length <= MAX_CAMPAIGN_MISSIONS);
  assert.equal(CAMPAIGN_MISSIONS.length, 20);

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
