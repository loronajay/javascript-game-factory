const test = require('node:test');
const assert = require('node:assert/strict');

const collision = require('../collision-logic.js');
const movement = require('../movement-logic.js');

const BODY = { height: 1.8, radius: 0.3 };

// A flat floor at y=0 plus whatever boxes the case cares about. `groundAt` returning null is how the
// world says "there is nothing to stand on here", which is a different answer from "blocked".
function createSpace(colliders = [], { holes = [] } = {}) {
  return {
    groundAt(x, z) {
      for (const hole of holes) if (x > hole.minX && x < hole.maxX && z > hole.minZ && z < hole.maxZ) return null;
      return 0;
    },
    blocked(x, z, feetY, height, radius) {
      return collision.collidesAt(colliders, { x, z, feetY, bodyHeight: height, radius });
    },
  };
}

test('an unobstructed axis step moves on both axes and lands on the ground height', () => {
  const space = createSpace();
  const result = movement.stepAxes(space, BODY, { x: 0, y: 4, z: 0 }, 0.5, -0.25);

  assert.deepEqual({ x: result.x, y: result.y, z: result.z }, { x: 0.5, y: 0, z: -0.25 });
  assert.equal(result.moved, true);
});

test('axis steps are independent, so a wall on one axis still lets you slide along it', () => {
  // A wall across X just ahead: walking north-east into it should keep the Z component.
  const wall = collision.createBoxCollider({ x: 0.7, y: 1.6, z: 0, width: 0.3, height: 3.2, depth: 8 });
  const space = createSpace([wall]);
  const result = movement.stepAxes(space, BODY, { x: 0, y: 0, z: 0 }, 0.5, 0.5);

  assert.equal(result.x, 0);
  assert.equal(result.z, 0.5);
  assert.equal(result.moved, true);
});

test('a step onto nothing is refused rather than walked off', () => {
  const space = createSpace([], { holes: [{ minX: 0.2, maxX: 4, minZ: -4, maxZ: 4 }] });
  const result = movement.stepAxes(space, BODY, { x: 0, y: 0, z: 0 }, 0.5, 0);

  assert.deepEqual({ x: result.x, z: result.z, moved: result.moved }, { x: 0, z: 0, moved: false });
});

test('stepping toward a waypoint covers speed * delta and reports the facing direction', () => {
  const space = createSpace();
  const result = movement.stepToward(space, BODY, { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { speed: 2, delta: 0.5 });

  assert.equal(Number(result.x.toFixed(6)), 1);
  assert.equal(result.arrived, false);
  assert.equal(result.moved, true);
  assert.equal(Number(result.dirX.toFixed(6)), 1);
  assert.equal(Number(result.dirZ.toFixed(6)), 0);
});

test('arrival on a walking waypoint uses the ground, never the waypoint altitude', () => {
  const space = createSpace();
  const result = movement.stepToward(space, BODY, { x: 0, y: 0, z: 0 }, { x: 0.1, y: 0.2, z: 0 }, { speed: 2, delta: 0.5, arriveRadius: 0.3 });

  assert.deepEqual({ x: result.x, y: result.y, z: result.z }, { x: 0.1, y: 0, z: 0 });
  assert.equal(result.arrived, true);
  assert.equal(result.moved, false);
});

test('a body walking into a wall slides along it instead of stalling', () => {
  const wall = collision.createBoxCollider({ x: 1, y: 1.6, z: 0, width: 0.3, height: 3.2, depth: 8 });
  const space = createSpace([wall]);
  const result = movement.stepToward(space, BODY, { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { speed: 2, delta: 0.5 });

  assert.equal(result.x, 0);
  assert.equal(Math.abs(result.z), 1);
  assert.equal(result.moved, true);
  assert.equal(result.blocked, false);
});

test('a boxed-in body reports blocked and does not move', () => {
  const box = (x, z) => collision.createBoxCollider({ x, y: 1.6, z, width: 0.4, height: 3.2, depth: 0.4 });
  const space = createSpace([box(0.5, 0), box(-0.5, 0), box(0, 0.5), box(0, -0.5)]);
  const result = movement.stepToward(space, BODY, { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { speed: 2, delta: 0.05 });

  assert.deepEqual({ x: result.x, z: result.z }, { x: 0, z: 0 });
  assert.equal(result.moved, false);
  assert.equal(result.blocked, true);
});

test('a guided waypoint follows the stair altitude when there is body clearance', () => {
  const wall = collision.createBoxCollider({ x: 1, y: 1.6, z: 0, width: 0.3, height: 3.2, depth: 8 });
  const space = createSpace([wall]);
  const result = movement.stepToward(space, BODY, { x: 0, y: 0, z: 0 }, { x: 0, y: 4, z: 0 }, { speed: 2, delta: 0.5, guided: true });

  assert.equal(Number(result.y.toFixed(6)), 1);
  assert.equal(result.moved, true);
});

test('guided stair movement cannot carry a body through a wall or ceiling', () => {
  const space = { groundAt: () => 0, blocked: (x, z, y) => x > .01 || y > .01 };
  for (const target of [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }]) {
    const result = movement.stepToward(space, BODY, { x: 0, y: 0, z: 0 }, target, { speed: 2, delta: .1, guided: true });
    assert.equal(result.blocked, true);
    assert.deepEqual([result.x, result.y, result.z], [0, 0, 0]);
  }
});

test('arrival tolerance does not snap a body into a solid wall', () => {
  const space = { groundAt: () => 0, blocked: (x) => x > .05 };
  for (const guided of [false, true]) {
    const result = movement.stepToward(space, BODY, { x: 0, y: 0, z: 0 }, { x: .1, y: 0, z: 0 }, { speed: 2, delta: .1, guided });
    assert.equal(result.arrived, false);
    assert.ok(result.x <= .05);
  }
});

test('a step never overshoots the waypoint it is walking to', () => {
  const space = createSpace();
  const result = movement.stepToward(space, BODY, { x: 0, y: 0, z: 0 }, { x: 0.5, y: 0, z: 0 }, { speed: 20, delta: 1 });

  assert.equal(Number(result.x.toFixed(6)), 0.5);
});
