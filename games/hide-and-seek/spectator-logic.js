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

  // A spectator sees through the watched player's eyes, so it sees by the watched player's light.
  // The local battery is spent and switched off the moment its owner is caught, and driving the beam
  // from that is why spectating used to be a black screen.
  //
  // `beam` is a fraction of the live player's full beam, never an intensity: a rendering number does
  // not belong in the pure layer. A target whose light is off still gets a weak one — a spectator is
  // a camera, not a competitor, and a watcher staring at an unlit corridor cannot tell a hidden
  // player from a broken game.
  const GHOST_BEAM = 0.26;

  function spectatorLight(target) {
    if (!target) return { on: false, charge: 0, beam: GHOST_BEAM };
    const charge = Math.max(0, Math.min(1, Number(target.flashlightCharge) || 0));
    const on = !!target.flashlightOn && charge > 0;
    return { on, charge, beam: on ? 1 : GHOST_BEAM };
  }

  function cameraPose(target, { eyeHeight = 1.7, crouchEyeHeight = 1.02 } = {}) {
    if (!target) return null;
    return {
      x: target.x,
      y: target.y + (target.crouching ? crouchEyeHeight : eyeHeight),
      z: target.z,
      // CPU rigs face +Z; human/network yaw already describes a camera looking down -Z.
      yaw: Number.isFinite(target.cameraYaw) ? target.cameraYaw : Number(target.yaw) || 0,
      pitch: Number(target.pitch) || 0,
    };
  }

  return { GHOST_BEAM, cameraPose, cycleTarget, spectatorLight, targetsFor };
});
