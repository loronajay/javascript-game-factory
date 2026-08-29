// The sanity meter: the anti-camping clock the demon reads. Standing still anywhere fills it;
// changing room resets it, and so do steps taken in the hallway. When it is full the player becomes
// a hunt target and The Bellhop walks into the room they are sitting in.
//
// All of the rules live in `sanity-logic.js` so a server can run them headlessly. This module only
// samples the camera, drives the HUD, and shapes the candidate list the demon picks from — that list
// is the multiplayer seam: today it holds the local player, later it holds every hider.
export function createSanity({ camera, world, logic, config, document }) {
  const meterEl = document.getElementById('sanityMeter');
  const fillEl = document.getElementById('sanityFill');
  const readoutEl = document.getElementById('sanityReadout');
  let state = logic.createSanityState();
  let lastX = camera.position.x;
  let lastZ = camera.position.z;
  let zones = [];
  let hunted = false;

  // Rooms come from their centres, tunnels from explicit bounds; both are published by the hotel
  // build, so the list is only rebuilt when the building grows a new one.
  function zoneList() {
    const { roomCenters, secretTunnels } = world.collections;
    if (zones.length !== roomCenters.size + secretTunnels.length) {
      zones = [
        ...[...roomCenters.entries()].map(([id, room]) => ({ id, kind: logic.ZONE_KINDS.ROOM, floor: room.floor, x: room.x, z: room.z })),
        ...secretTunnels,
      ];
    }
    return zones;
  }

  function updateHud() {
    const percent = Math.round(state.value * 100);
    const draining = state.kind === logic.ZONE_KINDS.TUNNEL;
    fillEl.style.width = `${percent}%`;
    meterEl.dataset.state = hunted ? 'hunted' : draining ? 'draining' : state.full ? 'full' : state.value > 0.6 ? 'rising' : 'calm';
    readoutEl.textContent = hunted ? 'IT IS COMING'
      : draining ? (percent > 0 ? `CALMING ${percent}%` : 'UNSEEN')
      : state.full ? 'STAY AND BE FOUND' : `${percent}%`;
  }

  function localCandidate() {
    return { id: 'local', full: state.full, zone: state.zone, kind: state.kind, x: camera.position.x, z: camera.position.z, floor: world.state.playerFloor || 1 };
  }

  function update(delta) {
    if (world.state.gameOver) return;
    const { x, z } = camera.position;
    const movedDistance = Math.hypot(x - lastX, z - lastZ);
    lastX = x; lastZ = z;
    const zone = logic.locateZone(zoneList(), { x, z, floor: world.state.playerFloor }, config);
    const wasFull = state.full;
    const wasDraining = state.kind === logic.ZONE_KINDS.TUNNEL;
    state = logic.updateSanity(state, { zone: zone.id, kind: zone.kind, delta, movedDistance, config });
    if (!wasDraining && state.kind === logic.ZONE_KINDS.TUNNEL && state.value > 0) world.notify('THE PASSAGE IS QUIET. YOU CAN BREATHE.', 2400);
    if (state.full && !wasFull) {
      world.notify('YOU HAVE BEEN STILL TOO LONG.', 2600);
      world.emit('sanity-full', { zone: state.zone });
    }
    updateHud();
  }

  function getHuntTarget(enemy, candidates = []) {
    const target = logic.selectHuntTarget([localCandidate(), ...candidates], enemy, config);
    if (!target) return null;
    const room = world.collections.roomCenters.get(target.zone);
    if (!room) return null;
    return { id: target.id, zone: target.zone, x: room.x, z: room.z, floor: room.floor };
  }

  // The demon owns whether it is actually walking your way; the meter only reports it, so the two
  // can never disagree on screen.
  function setHunted(target) {
    const next = !!target && target.id === 'local';
    if (next === hunted) return;
    hunted = next;
    updateHud();
  }

  updateHud();
  return { update, getHuntTarget, setHunted, getState: () => ({ ...state, hunted }) };
}
