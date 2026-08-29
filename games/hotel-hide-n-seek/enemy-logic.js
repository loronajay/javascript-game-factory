(function attachHotelEnemyLogic(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HotelEnemyLogic = api;
})(typeof window !== 'undefined' ? window : globalThis, function createHotelEnemyLogicApi() {
  'use strict';

  const ENEMY_STATES = Object.freeze({ ROAM: 'roam', CHASE: 'chase', SEARCH: 'search' });

  function planarDistance(a, b) {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }

  function chooseSpawn(spawns, player, random = Math.random, minimumDistance = 20) {
    if (!spawns.length) return null;
    const safe = spawns.filter((spawn) => spawn.floor !== player.floor || planarDistance(spawn, player) >= minimumDistance);
    const pool = safe.length ? safe : spawns;
    return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  }

  function canDetectPlayer({ enemy, player, occluded, maxDistance = 18, fieldOfView = Math.PI * 0.72 }) {
    if (occluded || Math.abs(enemy.y - player.y) > 2.75) return false;
    const dx = player.x - enemy.x;
    const dz = player.z - enemy.z;
    const distance = Math.hypot(dx, dz);
    const effectiveRange = maxDistance * (player.crouching ? 0.55 : 1);
    if (distance > effectiveRange) return false;
    if (distance < 2.6) return true;
    const facingLength = Math.hypot(enemy.facingX, enemy.facingZ) || 1;
    const dot = (dx * enemy.facingX + dz * enemy.facingZ) / (distance * facingLength || 1);
    return dot >= Math.cos(fieldOfView / 2);
  }

  function createAwareness() {
    return { state: ENEMY_STATES.ROAM, lastSeen: null, searchRemaining: 0 };
  }

  function updateAwareness(previous, { seesPlayer, delta, playerPosition = null, searchDuration = 7.5 }) {
    const next = { ...previous, lastSeen: previous.lastSeen ? { ...previous.lastSeen } : null };
    if (seesPlayer) {
      next.state = ENEMY_STATES.CHASE;
      next.lastSeen = playerPosition ? { ...playerPosition } : next.lastSeen;
      next.searchRemaining = searchDuration;
      return next;
    }
    if (next.state === ENEMY_STATES.CHASE) next.state = ENEMY_STATES.SEARCH;
    if (next.state === ENEMY_STATES.SEARCH) {
      next.searchRemaining -= delta;
      if (next.searchRemaining <= 0) {
        next.state = ENEMY_STATES.ROAM;
        next.lastSeen = null;
        next.searchRemaining = 0;
      }
    }
    return next;
  }

  function projectToMinimap(position, bounds) {
    const x = Math.max(bounds.minX, Math.min(bounds.maxX, position.x));
    const z = Math.max(bounds.minZ, Math.min(bounds.maxZ, position.z));
    return {
      left: ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * 100,
      top: ((z - bounds.minZ) / (bounds.maxZ - bounds.minZ)) * 100,
    };
  }

  return { ENEMY_STATES, canDetectPlayer, chooseSpawn, createAwareness, planarDistance, projectToMinimap, updateAwareness };
});
