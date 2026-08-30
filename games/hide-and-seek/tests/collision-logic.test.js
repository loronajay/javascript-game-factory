const test = require('node:test');
const assert = require('node:assert/strict');

test('mall furniture collision includes seats, stool footprints and scaled crates', () => {
  const geometry = require('../collision-logic.js');
  const table = geometry.furnishingColliders({ type: 'table' });
  assert.ok(table.some(b => b.x === 1.05 && b.w === 0.68));
  assert.ok(geometry.furnishingColliders({ type: 'cinema-seat' }).some(b => b.y + b.h / 2 >= 1.34));
  assert.equal(geometry.furnishingColliders({ type: 'crate', scale: 0.8 })[0].w, 0.8);
  for (const facing of [-1, 1]) {
    const shaft = { centerX: 34, centerZ: -29, frontZ: -29 + facing * 2.1 };
    assert.equal(geometry.elevatorFacing(shaft), facing);
    assert.equal(geometry.inCabinFootprint({ x: 34, z: -29 + facing }, shaft), true);
    assert.equal(geometry.inCabinFootprint({ x: 34, z: -29 - facing * 2 }, shaft), false);
  }
});

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
