// The debug and automation surface: `window.HotelPrototype`.
//
// Browser-driven QA depends on this being current, and it is deliberately *not* part of the
// composition root — it is a read-only window onto everything main.js wired together, and it grows
// every time the game does. Keeping it here is what stops main.js drifting from a composition root
// into a god object.
export function createPrototypeApi(parts) {
  const {
    window, world, rendering, hotel, player, monster, demons, flashlightDrops, sanity, stamina, menu,
    online, round, hiders, avatars, elevator, timestep, soundtrack, soundEffects,
    floorDefs, inspectionViews, mapSession, version,
  } = parts;

  const api = {
    version, floorDefs,
    // Which building this page booted into. QA has to be able to ask, because from inside a round
    // the answer is only visible as scenery.
    map: mapSession ? { id: mapSession.activeMapId(), demons: mapSession.demonRoster().map((entry) => entry.name) } : null,
    getState: () => ({
      locked: !!world.state.isLocked,
      playerFloor: world.state.playerFloor,
      keys: [...world.state.inventory],
      gameOver: !!world.state.gameOver,
      remoteFixtures: !!world.state.remoteFixtures,
      mapId: hotel.getMapId ? hotel.getMapId() : null,
      player: player.getState(),
      flashlightDrops: flashlightDrops.getState(),
      monster: monster.getState(),
      demons: demons.getStates(),
      sanity: sanity ? sanity.getState() : null,
      stamina: stamina ? stamina.getState() : null,
      menu: menu ? menu.getScreen() : null,
      online: online.getState(),
      round: round ? round.getState() : null,
      hiders: hiders ? hiders.list() : [],
      avatars: avatars.list().map((id) => avatars.describe(id)),
      tick: { rate: 1 / timestep.step, ticks: timestep.getTicks(), simulatedSeconds: Number(timestep.getElapsed().toFixed(2)) },
      // The one number that says whether the hotel is cheap to draw. Static geometry is merged per
      // floor per material at build time, so `batches` is what that pass actually collapsed and
      // `drawCalls` is the frame it bought.
      render: {
        drawCalls: rendering.renderer.info.render.calls,
        triangles: rendering.renderer.info.render.triangles,
        batches: hotel.getBatchStats(),
      },
      elevator: {
        currentFloor: elevator.elevator.currentFloor,
        targetFloor: elevator.elevator.targetFloor,
        state: elevator.elevator.state,
        remote: !!elevator.elevator.remote,
      },
    }),
    getRoomDoor: (roomNumber) => world.collections.roomDoors.get(String(roomNumber)) || null,
    getSecretPanel: (id) => world.collections.secretPanels.get(id) || null,
    inspectionViews: Object.keys(inspectionViews),
    notify: world.notify,
    soundtrack, soundEffects, avatars, demons, flashlightDrops, sanity, stamina, menu, round, hiders, online, world, rendering,
    events: [
      'hotel:key-found', 'hotel:door-unlocked', 'hotel:secret-discovered', 'hotel:secret-opened',
      'hotel:elevator-called', 'hotel:elevator-start', 'hotel:elevator-arrive', 'hotel:floor-change',
      'hotel:drawer-searched', 'hotel:flashlight-change', 'hotel:flashlight-charge',
      'hotel:flashlight-drop', 'hotel:flashlight-pickup', 'hotel:demon-state', 'hotel:monster-state',
      'hotel:demon-catch', 'hotel:sanity-full', 'hotel:sanity-hunt', 'hotel:round-over', 'hotel:caught',
    ],
  };
  window.HotelPrototype = api;
  return api;
}
