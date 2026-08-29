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
