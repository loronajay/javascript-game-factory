(function attachHotelCollision(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HotelCollision = api;
})(typeof window !== 'undefined' ? window : globalThis, function createHotelCollisionApi() {
  'use strict';

  const clean = (value) => Math.abs(value) < 1e-12 ? 0 : Number(value.toFixed(12));

  // A renderer may turn this data into a mesh, but movement needs only these six numbers. Keeping
  // the authoritative shape plain lets the same test run in Node and, later, on the game server.
  function createBoxCollider({ x = 0, y = 0, z = 0, width, height, depth, rotationY = 0 } = {}) {
    const cosine = Math.abs(Math.cos(rotationY));
    const sine = Math.abs(Math.sin(rotationY));
    const halfX = (cosine * width + sine * depth) / 2;
    const halfZ = (sine * width + cosine * depth) / 2;
    return {
      minX: clean(x - halfX), maxX: clean(x + halfX),
      minY: clean(y - height / 2), maxY: clean(y + height / 2),
      minZ: clean(z - halfZ), maxZ: clean(z + halfZ),
    };
  }

  function collidesAt(colliders, { x, z, feetY, bodyHeight, radius } = {}) {
    const playerMinY = feetY + 0.06;
    const playerMaxY = feetY + bodyHeight;
    for (const box of colliders || []) {
      if (!box || box.enabled === false) continue;
      if (playerMaxY <= box.minY + 0.015 || playerMinY >= box.maxY - 0.015) continue;
      if (x > box.minX - radius && x < box.maxX + radius && z > box.minZ - radius && z < box.maxZ + radius) return true;
    }
    return false;
  }

  return { collidesAt, createBoxCollider };
});
