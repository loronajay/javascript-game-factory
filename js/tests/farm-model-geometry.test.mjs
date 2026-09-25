import test from "node:test";
import assert from "node:assert/strict";

import { hangingLightChain, gazeboCanopy, gableRoofHeightAt, gambrelRoofHeightAt } from "../farm-building-geometry.mjs";
import { SCENERY } from "../farm-scenery.mjs";
import { FARM_BOUNDS } from "../farm-layout.mjs";
import { TREE_ARCHETYPES } from "../farm-props-plants.mjs";

test("the nearest possible hill stays beyond the whole farm instead of clipping the property", () => {
  const propertyRadius = Math.hypot(FARM_BOUNDS.width / 2, FARM_BOUNDS.depth / 2);
  const nearestHillEdge = SCENERY.hillRadius.min - SCENERY.hillWidth.max;
  assert.ok(nearestHillEdge >= propertyRadius + 5, `${nearestHillEdge.toFixed(1)}m hill edge clears the ${propertyRadius.toFixed(1)}m property radius`);
});

test("a hanging light chain spans from the lantern cap all the way to its ceiling anchor", () => {
  const chain = hangingLightChain(3.0, 5.8);
  assert.equal(chain.bottomY, 3.17);
  assert.equal(chain.topY, 5.8);
  assert.ok(Math.abs(chain.height - 2.63) < 1e-9);
  assert.ok(Math.abs(chain.centreY - 4.485) < 1e-9);
});

test("roof profiles provide the actual attachment height above each light", () => {
  assert.equal(gableRoofHeightAt({ wallHeight: 2.9, rise: 1.5, run: 3, across: 0 }), 4.4);
  assert.equal(gableRoofHeightAt({ wallHeight: 2.9, rise: 1.5, run: 3, across: 3 }), 2.9);
  assert.equal(gambrelRoofHeightAt({ wallHeight: 3.4, rise: 2.6, halfSpan: 3.5, overhang: 0.45, across: 0 }), 6);
  assert.ok(gambrelRoofHeightAt({ wallHeight: 3.4, rise: 2.6, halfSpan: 3.5, overhang: 0.45, across: 2.7 }) > 4);
});

test("the gazebo canopy base and its support header meet at the same height", () => {
  const canopy = gazeboCanopy(2.6, 1.4);
  assert.equal(canopy.roofBaseY, 2.6);
  assert.equal(canopy.roofCentreY, 3.3);
  assert.equal(canopy.headerCentreY + canopy.headerHeight / 2, canopy.roofBaseY);
});

test("farm trees have species-specific silhouettes instead of sharing one lollipop canopy", () => {
  assert.deepEqual(Object.keys(TREE_ARCHETYPES), ["oak", "birch", "apple", "willow", "pine"]);
  assert.ok(TREE_ARCHETYPES.oak.branchCount >= 9);
  assert.ok(TREE_ARCHETYPES.birch.trunkCount >= 3);
  assert.ok(TREE_ARCHETYPES.apple.fruitCount >= 18);
  assert.ok(TREE_ARCHETYPES.willow.branchCount >= 12);
  assert.ok(TREE_ARCHETYPES.willow.drapeCount >= 48);
  assert.ok(TREE_ARCHETYPES.willow.crownWidth > TREE_ARCHETYPES.willow.crownHeight * 1.5);
  assert.ok(TREE_ARCHETYPES.pine.tierCount >= 6);
});
