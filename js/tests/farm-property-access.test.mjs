import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultFarmLayout, expandFarmLot, farmLotBounds } from '../farm-layout.mjs';
import { propertyRoutes, propertyPlatforms, propertyWalkBounds } from '../farm-property-scene.mjs';
import { farmObstacles, EYE_HEIGHT } from '../farm-scene.mjs';
import { PerspectiveCamera, Vector3 } from '../vendor/three.module.js';
import { createFarmBody, stepFarmBody } from '../farm-body.mjs';
import { forwardOf, obstacleBlocks } from '../arcade-room-walker.mjs';
import { gatewayAt } from '../farm-gateway.mjs';
import { fishingRegionScene } from '../farm-fishing-region-world.mjs';
import { findFishingRegion, regionZoneAt } from '../farm-fishing-regions.mjs';
import { createFishingController } from '../farm-fishing-controller.mjs';
import { findFishingRod, STARTER_ROD_ID, WORM_ID } from '../farm-catalog/fish.mjs';
import { netRing, NET_MARK } from '../farm-fishing.mjs';
import { rideBlocked } from '../farm-ride.mjs';
import { privateFishingLayout } from '../farm-private-fishing-layout.mjs';

for (const id of ['lot.smallholding', 'lot.estate']) test(id + ': direct perimeter gates replace outdoor fishing detours', () => {
  const layout = expandFarmLot(createDefaultFarmLayout(() => .5), id);
  const bounds = farmLotBounds(layout);
  assert.deepEqual(propertyWalkBounds(layout), bounds);
  assert.deepEqual(propertyPlatforms(layout), []);
  for (const route of propertyRoutes(layout)) {
    const gate = layout.decor.find(row => row.instanceId === route.gateId);
    assert.ok(gate, route.title + ' has a real gate');
    assert.ok(farmObstacles(layout, { openDoors: new Set() }).some(box => obstacleBlocks(gate, box)), 'closed gate blocks travel');
    const openDoors = new Set([gate.instanceId]);
    const world = { bounds: { halfWidth: bounds.width / 2, halfDepth: bounds.depth / 2, margin: bounds.wallInset }, obstacles: farmObstacles(layout, { openDoors }), platforms: [], ladders: [] };
    let pose = { ...route.returnPoint, pitch: 0, yaw: gate.rotationY + Math.PI }, body = createFarmBody();
    let exit;
    for (let i = 0; i < 120 && !exit; i++) {
      const next = stepFarmBody(pose, body, new Set(['KeyW']), 1 / 60, world);
      pose = next.pose; body = next.body;
      exit = gatewayAt(layout.decor, openDoors, pose, bounds);
    }
    assert.equal(exit?.instanceId, gate.instanceId, 'walk directly through the gate');
    assert.ok(!world.obstacles.some(box => obstacleBlocks(route.returnPoint, box)), 'return point is inside the farm and clear');
    if (route.horse) {
      for (let z = route.returnPoint.z; z >= gate.z; z -= .1) assert.equal(rideBlocked({ x: gate.x, z }, 0, { bounds: world.bounds, solids: world.obstacles }), false, 'mounted approach fits through the Downs gate');
    }
  }
});

for (const area of ['cedar-creek', 'estate-lake']) test(area + ': enter through the entrance, walk to water, then land a practice fish', () => {
  const region = findFishingRegion(area), scene = fishingRegionScene(region);
  assert.equal(scene.castOrigin({ ...region.spawn, forward: forwardOf(region.spawn.yaw) }), null, 'arrival is at the entrance, not the casting bank');
  const layout = privateFishingLayout(region);
  const solids = farmObstacles(scene.coveLayout()).concat(scene.coveObstacles());
  let walker = { ...region.spawn, pitch: -.06 }, body = createFarmBody(), ticks = 0, firstWaterPoint;
  for (const target of [region.entry, region.fishingSpot]) {
    while (Math.hypot(walker.x - target.x, walker.z - target.z) > .045 && ticks < 600) {
      walker.yaw = Math.atan2(walker.x - target.x, walker.z - target.z);
      const step = stepFarmBody(walker, body, new Set(['KeyW']), 1 / 60, { bounds: { halfWidth: scene.COVE_BOUNDS.width / 2, halfDepth: scene.COVE_BOUNDS.depth / 2, margin: .4 }, obstacles: solids, platforms: [], ladders: [], ground: scene.coveGroundAt });
      assert.ok(step.moved, 'entrance and approach must be unobstructed');
      walker = step.pose; body = step.body; ticks++;
      if (!firstWaterPoint && scene.castOrigin({ ...walker, forward: forwardOf(walker.yaw) })) firstWaterPoint = { ...walker };
    }
    assert.ok(Math.hypot(walker.x - target.x, walker.z - target.z) < .05);
  }
  assert.ok(ticks / 60 < 6, 'keep the entrance walk short');
  const pose = { ...walker, forward: forwardOf(region.fishingSpot.yaw) };
  assert.ok(scene.castOrigin(pose), 'casting bank faces fishable water');
  const signNormal = { x: Math.sin(layout.sign.yaw), z: Math.cos(layout.sign.yaw) };
  assert.ok((region.spawn.x - layout.sign.x) * signNormal.x + (region.spawn.z - layout.sign.z) * signNormal.z > 2, 'welcome face points at incoming players');
  assert.ok((region.fishingSpot.x - layout.sign.x) * signNormal.x + (region.fishingSpot.z - layout.sign.z) * signNormal.z < 0, 'return face points at departing players');
  for (const view of [region.spawn, { ...firstWaterPoint, yaw: Math.atan2(firstWaterPoint.x - region.exit.x, firstWaterPoint.z - region.exit.z) }]) {
    const camera = new PerspectiveCamera(65, 1.6, .05, 200);
    camera.rotation.order = 'YXZ'; camera.rotation.set(-.06, view.yaw, 0);
    camera.position.set(view.x, EYE_HEIGHT, view.z); camera.updateMatrixWorld();
    for (const x of [-1.3, 1.3]) for (const y of [-.325, .325]) {
      const corner = new Vector3(x * layout.sign.scale, 1.375 + .325 * layout.sign.scale + y * layout.sign.scale, 0);
      corner.applyAxisAngle(new Vector3(0, 1, 0), layout.sign.yaw).add(new Vector3(layout.sign.x, 0, layout.sign.z)).project(camera);
      assert.ok(Math.abs(corner.x) < .98 && Math.abs(corner.y) < .95, 'the whole sign must fit in the incoming and departing player views');
    }
  }
  const bench = layout.decor.find(row => row.instanceId === area + '-bench');
  const water = area === 'cedar-creek' ? { x: 0, z: 8 } : { x: 0, z: -4 };
  assert.ok(Math.sin(bench.rotationY) * (water.x - bench.x) + Math.cos(bench.rotationY) * (water.z - bench.z) > 0, 'bench faces the water');
  const events = [];
  const fishing = createFishingController({
    api: null, castOrigin: scene.castOrigin, zoneAt: p => regionZoneAt(region, p),
    random: () => .5, now: () => 1000, tackle: () => ({ rod: findFishingRod(STARTER_ROD_ID), bait: WORM_ID, level: 1 }),
    shadows: () => [], caught: () => new Set(), onEvent: e => events.push(e), newId: () => 'practice-test',
  });
  fishing.primary(true, pose); fishing.tick(.4); fishing.primary(false, pose);
  assert.equal(fishing.state().zone, area);
  for (let index = 0; index < 30000 && fishing.state().phase !== 'reveal'; index++) {
    const state = fishing.state();
    if (state.phase === 'waiting' && state.waited >= state.plan.biteAt) fishing.primary(true, pose);
    if (state.phase === 'fighting') {
      fishing.primary(state.fight.tension < .55, pose);
      fishing.steer(-state.fight.pullSide);
      fishing.bow();
    }
    if (state.phase === 'netting' && Math.abs(netRing(state.fight, state.fight.elapsed) - NET_MARK) < .04) fishing.net();
    fishing.tick(1 / 60);
  }
  assert.equal(fishing.state().phase, 'reveal', JSON.stringify(events));
  const landed = events.find(e => e.kind === 'landed');
  assert.ok(landed?.fish);
  assert.equal(landed.practice, true);
  assert.equal(landed.answer, null, 'no server mutation or rewards');
});

