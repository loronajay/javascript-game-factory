import test from 'node:test';
import assert from 'node:assert/strict';
import { BOAT_HANDLING, HARBOR_DOCKS, boatFitsWater, dockedBoat, stepBoat, toggleBoatAnchor, useBoatDock } from '../farm-boating.mjs';
import { BOAT_MODEL_YAW_OFFSET } from '../farm-boating.mjs';
import { harborDockFoot, harborWalkHeight, harborFishingZoneAt } from '../farm-harbor-geometry.mjs';
import { stepHarborWalker } from '../farm-harbor-scene.mjs';
import * as server from '../../platform-api/src/services/farm-harbor-geometry.mjs';
import { farmFishingZoneAt } from '../../platform-api/src/services/farm-fish-catalog.mjs';
import { readFileSync } from 'node:fs';

test('the real model bow is aligned to movement rather than the stern', () => {
  const buffer = readFileSync(new URL('../../farm/assets/fishing/boat.glb', import.meta.url));
  const length = buffer.readUInt32LE(12), gltf = JSON.parse(buffer.subarray(20, 20 + length));
  const accessor = gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION], view = gltf.bufferViews[accessor.bufferView];
  const positions = new Float32Array(buffer.buffer, buffer.byteOffset + 28 + length + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0), accessor.count * 3);
  let frontWidth = 0, backWidth = 0;
  for (let i = 0; i < accessor.count; i++) {
    if (positions[i * 3 + 2] > 2.5) frontWidth = Math.max(frontWidth, Math.abs(positions[i * 3]));
    if (positions[i * 3 + 2] < -3) backWidth = Math.max(backWidth, Math.abs(positions[i * 3]));
  }
  assert.ok(frontWidth < backWidth / 2, 'the pointed bow in the asset faces +z');
  assert.ok(Math.cos(BOAT_MODEL_YAW_OFFSET) < -0.99, 'rotate the bow to the game’s -z forward direction');
});

test('both docks have a safe disembarkation point with a walkable route onto land', () => {
  for (const dock of HARBOR_DOCKS) {
    const foot = harborDockFoot(dock);
    assert.equal(harborWalkHeight(foot), 0.87);
    assert.ok(Math.hypot(foot.x - dock.x, foot.z - dock.z) < 5.5);
    let pose = { ...foot, yaw: dock.id === 'mainland-harbor' ? Math.PI : 0, pitch: 0 };
    for (let i = 0; i < 500; i++) pose = stepHarborWalker(pose, new Set(['KeyW']), 1 / 60).pose;
    assert.ok(Math.abs(pose.z - foot.z) > 15, dock.id + ' must permit walking away from the boat');
    assert.notEqual(harborWalkHeight(pose), null);
  }
});

test('boat fishing uses the same harbor geometry on the client and server', () => {
  assert.deepEqual(server.HARBOR_DOCKS, HARBOR_DOCKS);
  for (let x = -72; x <= 72; x += 3) for (let z = -98; z <= 30; z += 3) {
    const point = { x, z };
    assert.equal(harborFishingZoneAt(point), server.harborFishingZoneAt(point));
    assert.equal(farmFishingZoneAt(point, 'harbor'), harborFishingZoneAt(point));
  }
  assert.equal(farmFishingZoneAt({ x: 8, z: 0 }, 'harbor'), 'reef');
  assert.equal(farmFishingZoneAt({ x: 0, z: -60 }, 'harbor'), 'deep');
  assert.equal(farmFishingZoneAt({ x: 0, z: 12 }, 'harbor'), null, 'casts cannot land on a pier');
});

const run = (state, input, seconds, hz = 60) => { for (let i = 0; i < seconds * hz; i++) state = stepBoat(state, input, 1 / hz).state; return state; };
test('boats board, accelerate, brake, reverse and anchor without drifting', () => {
  const docked = dockedBoat();
  assert.deepEqual(run(docked, { throttle: 1, turn: 1 }, 5), docked);
  let state = useBoatDock(docked);
  state = run(state, { throttle: 1, turn: 0 }, 3);
  assert.ok(state.z < docked.z - 4);
  assert.ok(state.speed > 0 && state.speed <= BOAT_HANDLING.maxSpeed);
  const braked = run(state, { throttle: 0, turn: 0, brake: true }, 2);
  assert.ok(braked.speed < 0.01);
  const reversed = run(braked, { throttle: -1, turn: 0 }, 2);
  assert.ok(reversed.speed < 0 && reversed.speed >= -BOAT_HANDLING.reverseSpeed);
  const anchored = toggleBoatAnchor(reversed);
  assert.equal(anchored.speed, 0);
  assert.deepEqual(run(anchored, { throttle: 1, turn: 1 }, 5), anchored);
  assert.equal(toggleBoatAnchor(anchored).mode, 'sailing');
});
test('only nearby slow approaches can dock; every recovery mooring is navigable', () => {
  for (const dock of HARBOR_DOCKS) {
    const safe = dockedBoat(dock.id);
    assert.equal(boatFitsWater(safe, safe.yaw), true);
    const fast = { ...safe, mode: 'sailing', speed: 2, dockId: null };
    assert.deepEqual(useBoatDock(fast), fast);
    assert.deepEqual(useBoatDock({ ...fast, speed: 0.2 }), safe);
  }
  const far = { ...dockedBoat(), mode: 'sailing', x: 50, z: -30, dockId: null };
  assert.deepEqual(useBoatDock(far), far);
});
test('swept hull checks stop at shore, piers, islands and trial bounds even on long frames', () => {
  for (const start of [
    { x: 8, z: 18, yaw: Math.PI }, { x: 8, z: 12, yaw: Math.PI / 2 },
    { x: -8, z: -36, yaw: Math.PI / 2 }, { x: 0, z: -90, yaw: 0 },
  ]) {
    let state = { ...start, mode: 'sailing', speed: 5, dockId: null }, blocked = false;
    assert.equal(boatFitsWater(state, state.yaw), true);
    for (let i = 0; i < 80; i++) {
      const next = stepBoat(state, { throttle: 1, turn: 0 }, 10);
      state = next.state; blocked ||= next.blocked;
      assert.equal(boatFitsWater(state, state.yaw), true);
    }
    assert.equal(blocked, true);
  }
});
test('handling is consistent across frame rates and cannot turn a stationary hull into a pier', () => {
  const start = { x: 0, z: -10, yaw: 0, speed: 0, mode: 'sailing', dockId: null };
  const a = run(start, { throttle: 1, turn: 0.3 }, 3, 30);
  const b = run(start, { throttle: 1, turn: 0.3 }, 3, 60);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.01);
  assert.ok(Math.abs(a.yaw - b.yaw) < 0.01);
  const besidePier = { ...start, x: 5.2, z: 12 };
  const turned = run(besidePier, { throttle: 0, turn: 1 }, 20);
  assert.equal(boatFitsWater(turned, turned.yaw), true);
});
