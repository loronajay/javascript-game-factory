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

  // A sweep route has to leave the room the seeker is currently standing in before it can aim at
  // the next corridor/stair waypoint. Without this egress dogleg, every new room target points
  // through the bedroom wall; the mover discards the blocked legs and the seeker looks like it has
  // chosen that room as a hiding place of its own.
  function createSweepRoute({ hunter, target, interFloorRoute = [], roomThreshold = 4.25, doorwayX = 3.75 } = {}) {
    if (!hunter || !target) return [];
    const fromFloor = hunter.floor || 1;
    const toFloor = target.floor || fromFloor;
    const fromY = Number.isFinite(hunter.y) ? hunter.y : 0;
    const toY = Number.isFinite(target.y) ? target.y : fromY;
    const route = [];
    const push = (point) => {
      const previous = route.at(-1);
      if (!previous || Math.hypot(previous.x - point.x, previous.y - point.y, previous.z - point.z) > 0.025) route.push(point);
    };
    const point = (x, y, z, floor) => ({ x, y, z, floor, guided: false });

    if (Math.abs(hunter.x) > roomThreshold) {
      push(point(Math.sign(hunter.x) * doorwayX, fromY, hunter.z, fromFloor));
      push(point(0, fromY, hunter.z, fromFloor));
    }
    for (const waypoint of interFloorRoute) push({ ...waypoint });
    if (Math.abs(target.x) > roomThreshold) {
      push(point(0, toY, target.z, toFloor));
      push(point(Math.sign(target.x) * doorwayX, toY, target.z, toFloor));
    }
    push(point(target.x, toY, target.z, toFloor));
    return route;
  }

  return { SEEKER_DEFAULTS, SEEKER_STATES, canSee, createSeekerState, createSweepRoute, selectVisibleHider, updateSeeker };
});
