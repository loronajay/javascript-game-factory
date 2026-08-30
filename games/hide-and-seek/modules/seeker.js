// The offline seeker is a player-shaped routed body. Its decisions are in seeker-logic.js; this
// module asks the built hotel for sight/collision and drives the shared avatar rig.
export function createSeeker({ THREE, config: CONFIG, tuning, floorY, layout, world, avatars, logic, enemyLogic, movement, avatarLogic }) {
  const id = 'solo-seeker';
  const BODY = { height: CONFIG.bodyHeight, radius: CONFIG.playerRadius };
  // How to get around comes off the building, not out of one hotel's stairwell.
  const navigator = enemyLogic.createNavigator(world.getPlan().navigation);
  const spawn = world.getPlan().spawns.seeker;
  const position = new THREE.Vector3(spawn.x, spawn.y, spawn.z);
  let state = logic.createSeekerState();
  let route = [];
  let yaw = 0;
  let moving = false;
  let held = true;
  let alive = true;
  let replanIn = 0;
  let patrolIndex = 0;

  function floor() { return Math.max(1, Math.min(world.state.floorCount, Math.round(position.y / CONFIG.floorHeight) + 1)); }
  function describe() { return { id, name: 'The Seeker', role: 'seeker', alive, x: position.x, y: position.y, z: position.z, floor: floor(), yaw, crouching: false, flashlightOn: true, flashlightCharge: 1, state: state.mode }; }
  function planRoute(target) {
    const fromFloor = floor(); const toFloor = target.floor || fromFloor;
    const corridorSweep = world.getPlan().navigation?.corridorSweep;
    if (corridorSweep) {
      const interFloorRoute = fromFloor === toFloor ? [] : navigator.planFloorRoute({
        from: position, target: { x: position.x, z: position.z }, fromFloor, toFloor, floorHeight: CONFIG.floorHeight,
      });
      route = logic.createSweepRoute({ hunter: describe(), target: { ...target, y: target.y ?? floorY(toFloor), floor: toFloor }, interFloorRoute, ...corridorSweep });
      return;
    }
    route = navigator.planFloorRoute({
      from: position, target, fromFloor, toFloor, floorHeight: CONFIG.floorHeight,
    });
  }
  function patrol() {
    const rooms = [...world.collections.roomCenters.entries()].filter(([number]) => !world.collections.roomDoors.get(number)?.locked);
    if (!rooms.length) return;
    const [number, room] = rooms[patrolIndex % rooms.length]; patrolIndex += 1;
    enemyLogic.prepareRoamDoor(world.collections.roomDoors.get(number), CONFIG.doorOpenAngle);
    planRoute({ ...room, floor: room.floor });
  }
  function occluded(target) {
    return world.sightBlocked(
      { x: position.x, y: position.y + 1.55, z: position.z },
      { x: target.x, y: target.y + (target.crouching ? 0.9 : 1.55), z: target.z },
      { tolerance: 0.18 },
    );
  }
  function step(delta, speed) {
    const target = route[0]; moving = false;
    if (!target) return;
    const result = movement.stepToward(world.space, BODY, position, target, { speed, delta, arriveRadius: 0.22, guided: !!target.guided });
    if (result.moved || result.arrived) position.set(result.x, result.y, result.z);
    if (result.arrived || result.blocked) route.shift();
    moving = result.moved;
    if (Math.hypot(result.dirX, result.dirZ) > 0.01) yaw = Math.atan2(result.dirX, result.dirZ);
  }
  function update(delta, candidates = []) {
    if (!alive || held) { moving = false; avatars.setPose(id, describe()); return; }
    const hunter = describe();
    const visible = logic.selectVisibleHider(candidates, hunter, { config: tuning, isOccluded: occluded });
    state = logic.updateSeeker(state, { delta, visible, config: tuning });
    replanIn -= delta;
    // Finish a stair traversal before replanning a sighting; otherwise each replan restarts the flight.
    if (state.lastSeen && replanIn <= 0 && !route.some(point => point.stair)) { planRoute(state.lastSeen); replanIn = state.mode === logic.SEEKER_STATES.CHASING ? 0.35 : 0.9; }
    if (!route.length && state.mode === logic.SEEKER_STATES.PATROLLING) patrol();
    step(delta, state.mode === logic.SEEKER_STATES.CHASING ? tuning.chaseSpeed : tuning.patrolSpeed);
    avatars.setPose(id, describe());
  }
  function eliminate() { alive = false; route = []; avatars.setVisible(id, false); }
  avatars.spawn(id, { role: avatarLogic.ROLES.SEEKER, seat: 0, name: 'The Seeker', pose: spawn });
  return { id, update, eliminate, setHeld(value) { held = !!value; }, getState: describe };
}
