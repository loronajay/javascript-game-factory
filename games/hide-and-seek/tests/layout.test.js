const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createDoorFrameLayout,
  createStairLayout,
  createStairwellShellLayout,
  getRoomFillLight,
  getHallLighting,
  resolveWalkSurfaceHeight,
} = require('../layout.js');

test('the stairwell uses one clear switchback per floor transition', () => {
  const layout = createStairLayout({ floorCount: 4, floorHeight: 4.6 });

  assert.equal(layout.flights.length, 6);
  assert.equal(layout.landings.length, 7);
  assert.ok(layout.flights.every((flight) => flight.startX === flight.endX));
  assert.deepEqual(
    [...new Set(layout.entrances.map((entrance) => entrance.z))],
    [44.15],
  );

  for (let transition = 1; transition <= 3; transition += 1) {
    const flights = layout.flights.filter((flight) => flight.transition === transition);
    assert.equal(flights.length, 2);
    assert.equal(flights[0].endY, flights[1].startY);
    assert.equal(flights[1].endY, transition * 4.6);
  }
});

test('room openings have two jambs and a header outside the walkable opening', () => {
  const frame = createDoorFrameLayout({ x: -4.05, z: 10, width: 1.45 });

  assert.equal(frame.length, 3);
  assert.deepEqual(frame.map((part) => part.kind), ['jamb', 'jamb', 'header']);
  assert.ok(frame[0].z < 10 - 1.45 / 2);
  assert.ok(frame[1].z > 10 + 1.45 / 2);
  assert.ok(frame[2].y > 2.12);
});

test('rooms on every floor retain a visible low-cost fill light', () => {
  for (let floor = 1; floor <= 4; floor += 1) {
    const light = getRoomFillLight(floor);
    assert.ok(light.intensity >= 0.34);
    assert.ok(light.distance >= 7);
    assert.equal(light.castShadow, false);
  }
});

test('the stair entrance is enclosed and its threshold fully bridges the shaft', () => {
  const shell = createStairwellShellLayout();

  assert.ok(shell.entrance.lowPierDepth >= 0.35);
  assert.ok(shell.entrance.highPierDepth >= 0.35);
  assert.ok(shell.bounds.zMin <= shell.serviceJunctionZ);
  assert.ok(shell.threshold.minX <= shell.serviceEdgeX);
  assert.ok(shell.threshold.maxX >= shell.floorLandingMinX);
  assert.ok(shell.threshold.minZ <= shell.entrance.minZ);
  assert.ok(shell.threshold.maxZ >= shell.entrance.maxZ);
});

test('stair landings include guards on every exposed abyss-facing edge', () => {
  const shell = createStairwellShellLayout();

  assert.deepEqual(
    shell.guards.map((guard) => guard.edge).sort(),
    ['floor-north', 'floor-south', 'switchback-north'],
  );
  assert.ok(shell.guards.every((guard) => guard.height >= 1));
});

test('the bottom of the stairwell is a complete walkable slab, not a decorative pit', () => {
  const shell = createStairwellShellLayout();

  assert.ok(shell.baseSlab.minX <= shell.bounds.xWest + 0.12);
  assert.ok(shell.baseSlab.maxX >= shell.bounds.xEast - 0.12);
  assert.ok(shell.baseSlab.minZ <= shell.bounds.zMin + 0.12);
  assert.ok(shell.baseSlab.maxZ >= shell.bounds.zMax - 0.12);
  assert.equal(shell.baseSlab.walkable, true);
});

test('stair ramps win over an overlapping flat bottom slab', () => {
  const surfaces = [
    { minX: 5, maxX: 6.2, minZ: 44, maxZ: 52, priority: 0, heightAt: () => 0, enabled: () => true },
    { minX: 5, maxX: 6.2, minZ: 44, maxZ: 52, priority: 1, heightAt: (_x, z) => (z - 44) * 0.1, enabled: () => true },
  ];

  assert.ok(Math.abs(resolveWalkSurfaceHeight(surfaces, 5.6, 47, 0, 0.62) - 0.3) < 1e-9);
  assert.equal(resolveWalkSurfaceHeight(surfaces, 5.6, 51, 0, 0.62), 0);
});

test('room doorway fill uses a shader-stable emissive glow', () => {
  for (let floor = 1; floor <= 4; floor += 1) {
    const light = getRoomFillLight(floor);
    assert.equal(light.strategy, 'emissive');
    assert.ok(light.emissiveIntensity >= 0.45);
  }
});

test('hall lighting uses sparse red pools instead of white light at every fixture', () => {
  const lighting = getHallLighting();

  assert.equal(lighting.color, 0xb00000);
  assert.equal(lighting.intensity, 0.62);
  assert.ok(lighting.pointSpacing >= 16);
  assert.equal(lighting.castShadow, false);
});

test('a floor lights only itself', () => {
  const layout = require('../layout.js');

  assert.deepEqual(layout.selectVisibleLightFloors({ activeFloor: 3, feetY: 9.2 }), [3]);
});

test('the stairwell lights only the floors it runs between, never the whole hotel', () => {
  const layout = require('../layout.js');
  const floorHeight = 4.6;

  // Standing on the floor-1 stair landing.
  assert.deepEqual(layout.selectVisibleLightFloors({ activeFloor: 0, feetY: 0, floorHeight }), [1]);
  // Halfway up the first switchback: floors 1 and 2 only.
  assert.deepEqual(layout.selectVisibleLightFloors({ activeFloor: 0, feetY: floorHeight / 2, floorHeight }), [1, 2]);
  // Halfway between 3 and 4 — floors 1 and 2 must be dark.
  assert.deepEqual(layout.selectVisibleLightFloors({ activeFloor: 0, feetY: floorHeight * 2.5, floorHeight }), [3, 4]);
  for (let y = -1; y <= floorHeight * 3 + 1; y += 0.25) {
    assert.ok(layout.selectVisibleLightFloors({ activeFloor: 0, feetY: y, floorHeight }).length <= 2);
  }
});

test('a player somehow outside every floor band still gets one lit floor', () => {
  const layout = require('../layout.js');

  assert.deepEqual(layout.selectVisibleLightFloors({ activeFloor: 0, feetY: 400 }), [4]);
  assert.deepEqual(layout.selectVisibleLightFloors({ activeFloor: 0, feetY: -400 }), [1]);
});
