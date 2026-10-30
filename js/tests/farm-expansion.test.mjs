import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultFarmLayout, expandFarmLot, normalizeFarmLayout, farmLayoutsEqual, farmLotBounds } from "../farm-layout.mjs";
import { insideFieldBox } from "../farm-decor-layout.mjs";
import { ovalPoint, ovalRails, OVAL, OVAL_OUTER, OVAL_GAPS } from "../downs-scene.mjs";
import { COVE_DOCKS, covePlatforms, coveWaterBlocks, insideRect, coveZoneAt } from "../farm-cove.mjs";
import { COVE_DOCK_DECKS, farmCoveZoneAt as serverZoneAt } from "../../platform-api/src/services/farm-fish-catalog.mjs";
import { normalizeFarmGarage } from "../../platform-api/src/services/farm-loadout-catalog.mjs";

test("larger lots persist, expand the perimeter and admit placement in the added land", () => {
  const starter = createDefaultFarmLayout();
  const big = expandFarmLot(starter, "lot.estate");
  assert.equal(farmLotBounds(big).width, 56);
  assert.equal(farmLayoutsEqual(starter, big), false);
  assert.deepEqual(normalizeFarmLayout(big), big);
  assert.equal(big.decor.find((row) => row.instanceId === "barn-1").x, starter.decor.find((row) => row.instanceId === "barn-1").x);
  assert.ok(big.decor.find((row) => row.instanceId === "gate-1").z > 27);
  assert.ok(big.decor.find((row) => row.instanceId === "post-rail-1").length > 55);
  assert.equal(expandFarmLot(big, "lot.smallholding"), big);
  const box = { x: 23, z: 0, rotationY: 0 };
  assert.equal(insideFieldBox(box, { width: 2, depth: 2 }, farmLotBounds(big)), true);
  assert.equal(insideFieldBox(box, { width: 2, depth: 2 }), false);
  const saved = normalizeFarmLayout({ ...big, decor: [...big.decor, { instanceId: "new-tree", itemId: "decor.plant.oak", ...box, length: 0 }] });
  assert.equal(saved.decor.find((row) => row.instanceId === "new-tree").x, 23);
});
test("server requires lot ownership and preserves expanded coordinates for owners", () => {
  const input = { version: 3, lot: "lot.estate", pets: [], decor: [{ instanceId: "new-tree", itemId: "decor.plant.oak", x: 24, z: 22, rotationY: 0 }] };
  const locked = normalizeFarmGarage(input, { ownedEntitlementIds: new Set() });
  assert.equal(locked.lot, undefined);
  assert.ok(!locked.decor.length || locked.decor[0].x <= 16);
  const saved = normalizeFarmGarage(input, { ownedEntitlementIds: new Set(["lot.estate"]) });
  assert.equal(saved.lot, "lot.estate");
  assert.equal(saved.decor[0].x, 24);
});
test("oval headings follow the tangent throughout both bends", () => {
  for (let i = 0; i < 100; i++) {
    const a = ovalPoint((i + 0.3) / 100);
    const b = ovalPoint((i + 0.301) / 100);
    const dx = b.x - a.x, dz = b.z - a.z;
    const dot = (-Math.sin(a.heading) * dx - Math.cos(a.heading) * dz) / Math.hypot(dx, dz);
    assert.ok(dot > 0.999, `wrong heading at ${i}: ${dot}`);
  }
});
test("all new docks are walkable platforms with matching server cast exclusions", () => {
  assert.equal(COVE_DOCKS.length, 7);
  assert.deepEqual(COVE_DOCKS.map((dock) => dock.deck), COVE_DOCK_DECKS);
  for (const platform of covePlatforms()) {
    const point = { x: platform.x, z: platform.z };
    assert.equal(coveWaterBlocks().some((box) => insideRect(point, box)), false);
    assert.equal(coveZoneAt(point), null);
    assert.equal(serverZoneAt(point), null);
  }
});


test("oval entrance rails end exactly at the six metre openings", () => {
 const rails = ovalRails().filter(r => Math.abs(r.z - (OVAL.cz - OVAL_OUTER)) < 0.001);
 for (const gap of OVAL_GAPS) {
  assert.ok(rails.some(r => Math.abs(r.x + r.footprint.width / 2 - gap.from) < 0.001));
  assert.ok(rails.some(r => Math.abs(r.x - r.footprint.width / 2 - gap.to) < 0.001));
 }
});

import { DOWNS_JUMP_PADS, DOWNS_STREAM, DOWNS_BOUNDS, downsGround, downsWaterDepth } from "../downs-terrain.mjs";
import { downsGround as serverGround, downsWaterDepth as serverDepth } from "../../platform-api/src/riding-sim/downs-terrain.mjs";
import { XC_FENCES } from "../downs-scene.mjs";
import { readFileSync } from "node:fs";
test("cross-country jumps have level foundations and dry southern approaches", () => {
  for (const pad of DOWNS_JUMP_PADS) {
    const fence = XC_FENCES.find((fence) => fence.id === pad.id);
    assert.equal(fence.x, pad.x);
    assert.equal(fence.z, pad.z);
    for (const side of [-1, 0, 1]) {
      const point = { x: pad.x + Math.cos(pad.heading) * pad.width / 2 * side, z: pad.z - Math.sin(pad.heading) * pad.width / 2 * side };
      assert.ok(Math.abs(downsGround(point) - downsGround(pad)) < 0.001, pad.id);
      assert.equal(serverGround(point), downsGround(point));
      assert.equal(downsWaterDepth(point), 0);
      assert.equal(serverDepth(point), 0);
    }
  }
  assert.ok(DOWNS_STREAM.z - DOWNS_STREAM.halfWidth > DOWNS_BOUNDS.depth / 2);
});
test("the local horse name is hidden after body sync, including the first mounted frame", () => {
  const source = readFileSync(new URL("../farm-riding-away.mts", import.meta.url), "utf8");
  assert.match(source, /bodies\.sync\(\[\.\.\.tether\.bodies\(\), \.\.\.theirs\], dt\);[\s\S]*?if \(horse\) bodies\.setTagVisible\(horse\.instanceId, !riding\.mounted\(\)\)/);
});
