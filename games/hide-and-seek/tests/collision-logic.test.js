const test = require('node:test');
const assert = require('node:assert/strict');

const collision = require('../collision-logic.js');

test('box collider data is plain and accounts for a rotated footprint', () => {
  const box = collision.createBoxCollider({ x: 10, y: 2, z: -4, width: 4, height: 2, depth: 2, rotationY: Math.PI / 2 });

  assert.deepEqual(box, { minX: 9, maxX: 11, minY: 1, maxY: 3, minZ: -6, maxZ: -2 });
  assert.equal(Object.getPrototypeOf(box), Object.prototype);
});

test('headless collision checks horizontal radius and vertical overlap', () => {
  const colliders = [collision.createBoxCollider({ x: 0, y: 1, z: 0, width: 2, height: 2, depth: 2 })];

  assert.equal(collision.collidesAt(colliders, { x: 1.25, z: 0, feetY: 0, bodyHeight: 1.8, radius: 0.3 }), true);
  assert.equal(collision.collidesAt(colliders, { x: 1.5, z: 0, feetY: 0, bodyHeight: 1.8, radius: 0.3 }), false);
  assert.equal(collision.collidesAt(colliders, { x: 0, z: 0, feetY: 3, bodyHeight: 1.8, radius: 0.3 }), false);
});

test('disabled collider records do not block movement', () => {
  const box = { ...collision.createBoxCollider({ x: 0, y: 1, z: 0, width: 2, height: 2, depth: 2 }), enabled: false };

  assert.equal(collision.collidesAt([box], { x: 0, z: 0, feetY: 0, bodyHeight: 1.8, radius: 0.3 }), false);
});

test('a sight line is blocked by a box standing between the two points', () => {
  const wall = collision.createBoxCollider({ x: 0, y: 1.6, z: 0, width: 6, height: 3.2, depth: 0.3 });

  assert.equal(collision.segmentBlocked([wall], { x: 0, y: 1.6, z: -4 }, { x: 0, y: 1.6, z: 4 }), true);
  // Same wall, but the pair is standing on the same side of it.
  assert.equal(collision.segmentBlocked([wall], { x: 0, y: 1.6, z: -4 }, { x: 0, y: 1.6, z: -1 }), false);
  // Over the top of it.
  assert.equal(collision.segmentBlocked([wall], { x: 0, y: 4, z: -4 }, { x: 0, y: 4, z: 4 }), false);
  // Around the end of it.
  assert.equal(collision.segmentBlocked([wall], { x: 5, y: 1.6, z: -4 }, { x: 5, y: 1.6, z: 4 }), false);
});

test('a sight line ignores disabled records and a box the target is standing inside', () => {
  const box = collision.createBoxCollider({ x: 0, y: 1.6, z: 0, width: 6, height: 3.2, depth: 0.3 });

  assert.equal(collision.segmentBlocked([{ ...box, enabled: false }], { x: 0, y: 1.6, z: -4 }, { x: 0, y: 1.6, z: 4 }), false);
  // A hit within `tolerance` of the far end is the target's own furniture, not an occluder.
  assert.equal(collision.segmentBlocked([box], { x: 0, y: 1.6, z: -4 }, { x: 0, y: 1.6, z: 0.1 }, { tolerance: 0.4 }), false);
});

test('a sight line between two identical points is never blocked', () => {
  const wall = collision.createBoxCollider({ x: 0, y: 1.6, z: 0, width: 6, height: 3.2, depth: 0.3 });

  assert.equal(collision.segmentBlocked([wall], { x: 0, y: 1.6, z: 0 }, { x: 0, y: 1.6, z: 0 }), false);
});
