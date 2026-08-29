(function attachHotelSpectator(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HotelSpectator = api;
})(typeof window !== 'undefined' ? window : globalThis, function createHotelSpectatorApi() {
  'use strict';

  function targetsFor(players, selfId) {
    return (players || []).filter((entry) => entry && entry.id !== selfId && entry.alive !== false);
  }

  function cycleTarget(players, selfId, currentId, direction = 1) {
    const targets = targetsFor(players, selfId);
    if (!targets.length) return null;
    const current = targets.findIndex((entry) => entry.id === currentId);
    if (current < 0) return targets[0].id;
    const step = direction < 0 ? -1 : 1;
    return targets[(current + step + targets.length) % targets.length].id;
  }

  function cameraPose(target, { eyeHeight = 1.7, crouchEyeHeight = 1.02 } = {}) {
    if (!target) return null;
    return {
      x: target.x,
      y: target.y + (target.crouching ? crouchEyeHeight : eyeHeight),
      z: target.z,
      yaw: Number(target.yaw) || 0,
      pitch: Number(target.pitch) || 0,
    };
  }

  return { cameraPose, cycleTarget, targetsFor };
});
