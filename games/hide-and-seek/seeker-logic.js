(function attachHotelSeeker(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HotelSeeker = api;
})(typeof window !== 'undefined' ? window : globalThis, function createHotelSeekerApi() {
  'use strict';

  const SEEKER_STATES = Object.freeze({ PATROLLING: 'patrolling', CHASING: 'chasing', SEARCHING: 'searching' });
  const SEEKER_DEFAULTS = Object.freeze({ visionDistance: 15, fieldOfView: Math.PI * 0.8, memorySeconds: 3, patrolSpeed: 3.35, chaseSpeed: 5.25 });

  function settings(config) { return config ? { ...SEEKER_DEFAULTS, ...config } : SEEKER_DEFAULTS; }
  function createSeekerState() { return { mode: SEEKER_STATES.PATROLLING, targetId: null, lastSeen: null, memoryRemaining: 0 }; }

  function canSee(target, hunter, { config, isOccluded } = {}) {
    const cfg = settings(config);
    if (!target || target.alive === false || target.role !== 'hider') return false;
    if (Math.abs((target.y || 0) - (hunter.y || 0)) > 1.5) return false;
    const dx = target.x - hunter.x; const dz = target.z - hunter.z;
    const distance = Math.hypot(dx, dz);
    if (!(distance > 0) || distance > cfg.visionDistance) return false;
    const facingX = Math.sin(hunter.yaw || 0); const facingZ = Math.cos(hunter.yaw || 0);
    if ((dx * facingX + dz * facingZ) / distance < Math.cos(cfg.fieldOfView / 2)) return false;
    return !(isOccluded && isOccluded(target));
  }

  function selectVisibleHider(players, hunter, options = {}) {
    let nearest = null; let nearestDistance = Infinity;
    for (const entry of players || []) {
      if (!canSee(entry, hunter, options)) continue;
      const distance = Math.hypot(entry.x - hunter.x, entry.z - hunter.z);
      if (distance < nearestDistance) { nearest = entry; nearestDistance = distance; }
    }
    return nearest;
  }

  function updateSeeker(previous, { delta = 0, visible = null, config } = {}) {
    const cfg = settings(config); const state = previous || createSeekerState();
    if (visible) return { mode: SEEKER_STATES.CHASING, targetId: visible.id, lastSeen: { ...visible }, memoryRemaining: cfg.memorySeconds };
    if (state.memoryRemaining > 0 && state.lastSeen) {
      const memoryRemaining = Math.max(0, state.memoryRemaining - delta);
      if (memoryRemaining > 0) return { ...state, mode: SEEKER_STATES.SEARCHING, memoryRemaining };
    }
    return createSeekerState();
  }

  return { SEEKER_DEFAULTS, SEEKER_STATES, canSee, createSeekerState, selectVisibleHider, updateSeeker };
});
