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
  assert.ok(big.decor.filter(row => row.instanceId.startsWith("property-fence-north-")).reduce((length, row) => length + row.length, 0) > 52);
  assert.ok(big.decor.some(row => row.instanceId === "property-gate-downs"));
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
  assert.equal(COVE_DOCKS.length, 3);
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

import { FISH_CATALOG, FISH_ZONES, ZONE_MIN_LEVEL, fishInZone } from "../farm-catalog/fish.mjs";
import { FISHING_REGIONS, findFishingRegion, regionZoneAt, regionWaterDistance } from "../farm-fishing-regions.mjs";
import { regionWaterObstacles, fishingRegionScene } from "../farm-fishing-region-world.mjs";
import { farmFishingZoneAt, FARM_FISH_RULES, farmShadowsForWindow, parseShadowId, ZONE_MIN_LEVEL as SERVER_LEVELS } from "../../platform-api/src/services/farm-fish-catalog.mjs";
import { generateShadows, normalizePublicShadow, parseFishNeed, rollBite } from "../farm-fish.mjs";
import { farmSeededRandom } from "../../platform-api/src/services/farm-seeded-random.mjs";
import { paintSpecies } from "../farm-fish-models.mjs";
import { FARM_LOTS } from "../farm-catalog/lots.mjs";

test("twenty new species reuse existing animated assets with distinct palettes and proportions", () => {
  const exotic = FISH_CATALOG.filter((fish) => fish.appearance);
  assert.equal(exotic.length, 20);
  assert.deepEqual(FISH_ZONES, ["lagoon", "reef", "deep", "grotto", "volcanic", "cedar-creek", "estate-lake"]);
  for (const fish of FISH_CATALOG) {
    const server = FARM_FISH_RULES.find((rule) => rule.id === fish.id);
    for (const key of ["id", "rarity", "zones", "weightKg", "lengthM", "fight", "strength", "value"]) assert.deepEqual(fish[key], server[key], `${fish.id}.${key}`);
    assert.ok(readFileSync(new URL(`../../farm/assets/fishing/${fish.file}`, import.meta.url)).length > 100);
  }
  for (const zone of ["grotto", "volcanic"]) {
    assert.equal(fishInZone(zone).length, 8);
    assert.deepEqual([...new Set(fishInZone(zone).map((fish) => fish.rarity))].sort(), ["common", "epic", "legendary", "rare", "uncommon"]);
    for (let i = 0; i < 50; i++) assert.ok(fishInZone(zone).some((fish) => fish.id === rollBite(zone, null, "blind", farmSeededRandom(i + 1), 30).speciesId));
  }
});
test("destination casts, level gates and swimming shadows agree with the server", () => {
  assert.deepEqual(ZONE_MIN_LEVEL, SERVER_LEVELS);
  const shadows = farmShadowsForWindow(100, { FARM_FISH_SECRET: "test-only" });
  for (const region of FISHING_REGIONS) {
    const scene = fishingRegionScene(region);
    assert.ok(regionWaterDistance(region, scene.COVE_SPAWN) < 0);
    assert.ok(regionWaterDistance(region, region.exit) < 0);
    assert.ok(!regionWaterObstacles(region).some((box) => Math.abs(region.exit.x - box.x) <= box.footprint.width / 2 && Math.abs(region.exit.z - box.z) <= box.footprint.depth / 2));
    for (let x = -35; x <= 35; x += 2) for (let z = -34; z <= 34; z += 2) assert.equal(farmFishingZoneAt({x,z}, region.id), regionZoneAt(region, {x,z}));
    const pool = region.pools[0];
    assert.equal(farmFishingZoneAt(pool, region.id), region.id);
    assert.equal(farmFishingZoneAt(pool, "invalid-area"), null);
    const local = shadows.filter((shadow) => shadow.zone === region.id);
    assert.equal(local.length, region.id === "cedar-creek" ? 6 : 7);
    for (const shadow of local) {
      assert.equal(parseShadowId(shadow.id).zone, region.id);
      assert.equal(normalizePublicShadow(shadow).zone, region.id);
      for (let angle = 0; angle < Math.PI * 2; angle += 0.2) assert.equal(regionZoneAt(region, { x: shadow.path.cx + Math.cos(angle) * shadow.path.rx, z: shadow.path.cz + Math.sin(angle) * shadow.path.rz }), region.id);
    }
    assert.deepEqual(parseFishNeed(`zone=${region.id}`), { zone: region.id });
  }
});
test("species paint preserves details, clones materials and applies body proportions", () => {
  const color = () => ({ value: "original", set(value) { this.value = value; } });
  const material = (name) => ({ name, color: color(), clone() { return { ...this, color: color() }; } });
  const original = material("Koi_Main"), eye = material("Eyes");
  const nodes = [{isMesh:true, material: original}, {isMesh:true, material: eye}];
  const model = { scale: {x:1,y:1,z:1}, traverse(fn) { nodes.forEach(fn); } };
  const look = FISH_CATALOG.find((fish) => fish.id === "fish.moon-koi").appearance;
  paintSpecies(model, look);
  assert.notEqual(nodes[0].material, original);
  assert.equal(original.color.value, "original");
  assert.equal(nodes[0].material.color.value, look.colors.main);
  assert.equal(nodes[1].material, eye);
  assert.equal(model.scale.x, look.width); assert.equal(model.scale.y, look.height);
});
test("farm properties name distinct settings and keep every existing possession during a move", () => {
  assert.deepEqual(FARM_LOTS.map((property) => property.theme), ["woodland", "lakeside"]);
  const farm = createDefaultFarmLayout();
  const wooded = expandFarmLot(farm, "lot.smallholding");
  const estate = expandFarmLot(wooded, "lot.estate");
  assert.equal(wooded.lot, "lot.smallholding"); assert.equal(estate.lot, "lot.estate");
  assert.deepEqual(estate.pets, farm.pets);
  assert.deepEqual(estate.agriculture, farm.agriculture);
  for (const row of normalizeFarmLayout(farm).decor.filter((row) => !row.itemId.startsWith("decor.fence."))) assert.deepEqual(estate.decor.find((entry) => entry.instanceId === row.instanceId), row);
  const panel = readFileSync(new URL("../farm-editor-panel.mts", import.meta.url), "utf8");
  assert.doesNotMatch(panel, /FARM_LOTS/);
});

import { propertyWalkBounds, propertyPlatforms, propertyObstacles, PROPERTY_GATE_ID } from "../farm-property-scene.mjs";
test("new properties keep fishing outside the farm and expose direct side gates", () => {
  for (const property of FARM_LOTS) {
    const layout = expandFarmLot(createDefaultFarmLayout(), property.id);
    assert.deepEqual(propertyWalkBounds(layout), farmLotBounds(layout));
    assert.deepEqual(propertyPlatforms(layout), []);
    assert.deepEqual(propertyObstacles(layout), []);
    assert.ok(layout.decor.some((row) => row.instanceId === PROPERTY_GATE_ID));
    for (const deck of propertyPlatforms(layout)) {
      assert.ok(Math.abs(deck.x) < propertyWalkBounds(layout).width / 2);
      const blocks = propertyObstacles(layout);
      assert.equal(blocks.some((box) => Math.abs(deck.x - box.x) < box.footprint.width / 2 && Math.abs(deck.z - box.z) < box.footprint.depth / 2), false);
      assert.ok(blocks.some((box) => box.instanceId.startsWith("property-water")));
    }
  }
  const moved = expandFarmLot(expandFarmLot(createDefaultFarmLayout(), "lot.smallholding"), "lot.estate");
  assert.equal(moved.decor.filter((row) => row.instanceId === PROPERTY_GATE_ID).length, 1);
  const gate = moved.decor.find((row) => row.instanceId === PROPERTY_GATE_ID);
  for (const rail of moved.decor.filter((row) => row.instanceId.startsWith("property-fence-east"))) assert.ok(Math.abs(gate.z - rail.z) > rail.length / 2 + 1);
});

import { propertyRoutes } from "../farm-property-scene.mjs";
import { castFarmLine } from "../../platform-api/src/db/farm-fishing.mjs";
test("medium property grants its creek route; the estate grants different fishing and Downs access", () => {
  assert.deepEqual(propertyRoutes({}).map((route) => route.target), []);
  assert.deepEqual(propertyRoutes({lot: "lot.smallholding"}).map((route) => route.target), ["cedar-creek"]);
  assert.deepEqual(propertyRoutes({lot: "lot.estate"}).map((route) => route.target), ["estate-lake", "downs"]);
  assert.equal(propertyRoutes({lot: "lot.estate"}).find((route) => route.target === "downs").horse, true);
  assert.equal(findFishingRegion("cedar-creek").requiredProperty, "lot.smallholding");
  assert.equal(findFishingRegion("estate-lake").requiredProperty, "lot.estate");
});
test("private fishing rejects non-owners before spending bait or starting a cast", async () => {
  for (const areaId of ["cedar-creek", "estate-lake"]) {
    const queries = [];
    const client = { async query(sql, values) {
      queries.push({sql,values});
      if (/^(begin|commit|rollback)$/i.test(sql.trim())) return {rows:[]};
      if (sql.includes("game_entitlements")) return {rows:[]};
      throw new Error("Unexpected mutation or angler access: " + sql);
    }, release() {} };
    const region = findFishingRegion(areaId);
    const result = await castFarmLine({connect:async()=>client}, { playerId:"angler-test",castId:"cast-private-test",areaId,point:region.pools[0],rodId:"rod.1",bait:"bait.worm" });
    assert.deepEqual(result,{ok:false,error:"property_required",property:region.requiredProperty});
    assert.ok(queries.some((query) => query.sql.includes("game_entitlements") && query.values[1] === region.requiredProperty));
    assert.ok(!queries.some((query) => /insert|update|delete/i.test(query.sql)));
  }
});

import { farmObstacles } from "../farm-scene.mjs";
import { bodyObstacles } from "../farm-body.mjs";
import { obstacleBlocks } from "../arcade-room-walker.mjs";
test("fishing arrivals and return-path approaches do not start inside a fixture", () => {
  for (const region of FISHING_REGIONS) {
    const scene = fishingRegionScene(region);
    const solids = bodyObstacles(farmObstacles(scene.coveLayout()), 0);
    for (const point of [region.spawn, {x:region.exit.x - Math.sign(region.exit.x) * 3,z:region.exit.z}]) {
      assert.equal(solids.some((solid) => obstacleBlocks(point, solid, 0.3)), false, region.id);
    }
  }
});

import { findMarketStall, PROPERTY_OFFICE_ID, MARKET_DECOR, MARKET_COVE_GATE, MARKET_DOWNS_GATE, marketSquareLayout, stallLocalToWorld, MARKET_STALLS, stallObstacles } from "../farm-market-square.mjs";
import { findFarmTicketItem } from "../../platform-api/src/services/farm-ticket-catalog.mjs";
test("property prices match the server and the office has a clear approach away from trees and gates", () => {
  assert.deepEqual(FARM_LOTS.map((lot) => lot.price), [25000, 100000]);
  for (const lot of FARM_LOTS) assert.equal(findFarmTicketItem(lot.id).price, lot.price);
  const office = findMarketStall(PROPERTY_OFFICE_ID);
  for (const item of MARKET_DECOR.filter((item) => /decor.plant.(oak|birch|pine|willow)$/.test(item.itemId))) assert.ok(Math.hypot(office.x-item.x,office.z-item.z)>4.5, item.instanceId);
  for (const id of [MARKET_COVE_GATE,MARKET_DOWNS_GATE]) {
    const gate=MARKET_DECOR.find((item)=>item.instanceId===id);
    assert.ok(Math.hypot(office.x-gate.x,office.z-gate.z)>3.5,id);
  }
  for (const stall of MARKET_STALLS.filter((entry)=>entry.id!==office.id)) {
    const sideways=Math.abs(Math.sin(stall.rotationY))>.5;
    const width=sideways?stall.footprint.depth:stall.footprint.width;
    const depth=sideways?stall.footprint.width:stall.footprint.depth;
    assert.equal(Math.abs(office.x-stall.x)<(office.footprint.width+width)/2+.25 && Math.abs(office.z-stall.z)<(office.footprint.depth+depth)/2+.25,false,stall.id);
  }
  const approach=stallLocalToWorld(office,{x:0,z:1.25});
  assert.equal(bodyObstacles(farmObstacles(marketSquareLayout()).concat(stallObstacles(MARKET_STALLS.filter((entry)=>entry.id!==office.id))),0).some((solid)=>obstacleBlocks(approach,solid,.3)),false);
});
