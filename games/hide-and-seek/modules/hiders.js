// The offline hiders: bodies for the players who are not here yet.
//
// Every decision — which room to take, when to bolt, how fast to move — lives in `hider-logic.js`
// so a server can run it headlessly. This module owns only the parts that need the built hotel:
// walking a waypoint route against the real collision, and driving the avatar rig. It deliberately
// borrows the demon's navigation shape (a route of waypoints from `enemy-logic`, then a slide-along
// -walls mover from `movement-logic.js`) rather than inventing a second one, because there is only
// one stairwell to route and one way to walk it.
//
// The seam that matters: `list()` returns positions in exactly the shape the round's catch
// resolution and the demon's threat checks want. When real players arrive, the same list is fed
// from the network and this file simply stops being asked for entries.
export function createHiders({ THREE, config: CONFIG, tuning, sanityConfig, floorY, layout, world, avatars, logic, enemyLogic, movement, sanityLogic, avatarLogic, count = 3, spawnOffset = 0, seekerSpawn = null }) {
  const BODY = { height: CONFIG.bodyHeight, radius: CONFIG.playerRadius };
  // Borrowed from the demon deliberately: there is one building to cross and one way to cross it.
  const navigator = enemyLogic.createNavigator(world.getPlan().navigation);
  const hiders = new Map();
  let zones = [];

  function sanityZones() {
    const { roomCenters, secretTunnels } = world.collections;
    if (zones.length !== roomCenters.size + secretTunnels.length) zones = [
      ...[...roomCenters.entries()].map(([id, room]) => ({ ...room, id, kind: sanityLogic.ZONE_KINDS.ROOM })),
      ...secretTunnels,
    ];
    return zones;
  }

  function roomSpots(skip = null) {
    return [...world.collections.roomCenters.entries()]
      .filter(([roomNumber]) => !world.collections.roomDoors.get(roomNumber)?.locked && !(skip && skip.has(roomNumber)))
      .map(([id, room]) => ({ id, x: room.x, z: room.z, floor: room.floor }));
  }

  function nearestFloor(y) {
    return Math.max(1, Math.min(world.state.floorCount, Math.round(y / CONFIG.floorHeight) + 1));
  }

  function describe(hider) {
    const candidate = hider.sanity.candidate || {};
    return {
      id: hider.id,
      x: hider.position.x,
      y: hider.position.y,
      z: hider.position.z,
      floor: nearestFloor(hider.position.y),
      crouching: !!hider.ai.crouching,
      flashlightOn: false,
      flashlightCharge: hider.flashlightCharge,
      state: hider.ai.state,
      // The room it is heading for. Debug/automation only — the round HUD never sees a hider's
      // intent, let alone its position.
      spot: hider.ai.spot ? hider.ai.spot.id : null,
      full: !!candidate.full,
      zone: candidate.zone || null,
      kind: candidate.kind || sanityLogic.ZONE_KINDS.HALLWAY,
    };
  }

  // The same waypoint plan the demon uses: route through the stairwell when floors differ, then out
  // of the corridor centre line and into the room.
  function planRoute(hider, target) {
    const fromFloor = nearestFloor(hider.position.y);
    const toFloor = target.floor || fromFloor;
    hider.route = navigator.planFloorRoute({
      from: hider.position, target, fromFloor, toFloor, floorHeight: CONFIG.floorHeight,
    });
    hider.target = target;
  }

  // The one way a hider takes a room, used for the spot it starts with and every one it runs to
  // afterwards. Opening the door is part of taking the room, not an extra step a caller can forget:
  // a hider routed at a closed door just grinds into it, and the door left standing open behind them
  // is a genuine tell for the seeker.
  function assignSpot(hider, spot) {
    hider.ai = { ...hider.ai, spot, needsSpot: false };
    enemyLogic.prepareRoamDoor(world.collections.roomDoors.get(spot.id), CONFIG.doorOpenAngle);
    planRoute(hider, spot);
  }

  function claimSpot(hider, threats) {
    const taken = [...hiders.values()].filter((other) => other !== hider && other.ai.spot).map((other) => other.ai.spot);
    const spot = logic.chooseHideSpot(roomSpots(hider.unreachable), { threats, taken, config: tuning });
    if (spot) assignSpot(hider, spot);
  }

  // Hiding is standing in the room, not standing outside its door. The mover gives a waypoint up
  // when the way is solid, so an empty route on its own proves nothing — without this check a hider
  // whose doorway is obstructed would crouch in the corridor for the rest of the round, which is
  // both a terrible hiding place and a free find for the seeker.
  function reachedSpot(hider) {
    const spot = hider.ai.spot;
    if (!spot) return false;
    return nearestFloor(hider.position.y) === spot.floor
      && Math.hypot(hider.position.x - spot.x, hider.position.z - spot.z) < 2.2;
  }

  // The same pure mover the player and the demons use, at hider size.
  function tryMove(hider, waypoint, speed, delta) {
    const step = movement.stepToward(world.space, BODY, hider.position, waypoint, { speed, delta, arriveRadius: 0.22, guided: !!waypoint.guided });
    if (step.arrived) { hider.position.set(step.x, step.y, step.z); hider.route.shift(); return; }
    if (step.moved) hider.position.set(step.x, step.y, step.z);
    // Boxed in: drop the waypoint so the next tick re-plans instead of grinding into the wall.
    if (step.blocked) hider.route.shift();
    hider.moving = step.moved;
    if (Math.hypot(step.dirX, step.dirZ) > 0.01) hider.yaw = Math.atan2(step.dirX, step.dirZ);
  }

  function update(delta, threats = []) {
    for (const hider of hiders.values()) {
      if (!hider.alive) continue;
      const self = describe(hider);
      const arrived = !hider.route.length && reachedSpot(hider);
      // Out of waypoints but not in the room: that room cannot be walked into from here, so strike it
      // off this hider's list rather than picking it again on the next tick.
      if (!hider.route.length && hider.ai.spot && !arrived) {
        hider.unreachable.add(hider.ai.spot.id);
        hider.ai = { ...hider.ai, spot: null, needsSpot: true };
      }
      hider.ai = logic.updateHider(hider.ai, { delta, self, threats, arrived, config: tuning });
      if (hider.ai.needsSpot) claimSpot(hider, threats);
      hider.moving = false;
      const waypoint = hider.route[0];
      const speed = logic.movementSpeed(hider.ai, tuning);
      if (waypoint && speed > 0) tryMove(hider, waypoint, speed, delta);
      const pose = describe(hider);
      hider.sanity = sanityLogic.updatePlayerSanity(hider.sanity, pose, sanityZones(), delta, sanityConfig);
      avatars.setPose(hider.id, {
        x: hider.position.x, y: hider.position.y, z: hider.position.z,
        yaw: hider.yaw, crouching: !!hider.ai.crouching, flashlightOn: false, flashlightCharge: hider.flashlightCharge,
      });
    }
  }

  function eliminate(id) {
    const hider = hiders.get(id);
    if (!hider || !hider.alive) return;
    hider.alive = false;
    hider.route = [];
    avatars.remove(id);
  }

  function list() {
    return [...hiders.values()].filter((hider) => hider.alive).map(describe);
  }

  function spawn() {
    const spots = roomSpots();
    const threats = seekerSpawn ? [seekerSpawn] : [];
    const taken = [];
    for (let index = 0; index < count; index += 1) {
      const id = `hider-${index + 1}`;
      const spot = logic.chooseHideSpot(spots, { threats, taken, config: tuning }) || spots[index % spots.length];
      taken.push(spot);
      // Spawn seats belong to the building. A hotel corridor coordinate may be a hospital wall.
      // Reserve seat zero when the local player is also a hider.
      const spawns = world.getPlan().spawns.hiders;
      const start = spawns[(index + spawnOffset) % spawns.length];
      const hider = {
        id,
        position: new THREE.Vector3(start.x, start.y, start.z),
        yaw: 0,
        route: [],
        target: null,
        alive: true,
        moving: false,
        flashlightCharge: 1,
        unreachable: new Set(),
        ai: logic.createHiderState(),
        sanity: sanityLogic.createPlayerSanity(start),
      };
      hiders.set(id, hider);
      avatars.spawn(id, { role: avatarLogic.ROLES.HIDER, seat: index + 1, name: `Guest ${index + 1}`, pose: start });
      assignSpot(hider, spot);
    }
  }

  spawn();
  // Online there are real guests, so the stand-ins leave. They are not paused — their bodies are
  // taken out of the hotel entirely, because a hider nobody can catch standing in a corridor is a
  // decoy the seeker will waste the whole round on.
  function standDown() {
    for (const id of [...hiders.keys()]) avatars.remove(id);
    hiders.clear();
  }

  return { update, eliminate, list, standDown, ids: () => [...hiders.keys()] };
}
