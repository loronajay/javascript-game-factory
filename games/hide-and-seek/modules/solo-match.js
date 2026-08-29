import { createHiders } from './hiders.js';
import { createRound } from './round.js';
import { createSeeker } from './seeker.js';

// Compose either solo role without making main.js or the menu understand round internals.
export function createSoloMatch({ THREE, camera, config, roundConfig, hiderConfig, seekerConfig, floorY, layout, world, player, elevator, avatars, avatarLogic, hiderLogic, seekerLogic, enemyLogic, movement, sanityLogic, sanityConfig, demons, flashlightDrops, spectator, document, window, options }) {
  const match = { ...roundConfig, ...options };
  const localIsHider = match.role === 'hider';
  const plan = world.getPlan();
  if (localIsHider) {
    const spawn = plan.spawns.hiders[0];
    camera.position.set(spawn.x, spawn.y + config.eyeHeight, spawn.z);
    camera.rotation.x = 0; camera.rotation.y = 0;
    world.state.yaw = 0; world.state.pitch = 0; world.state.playerFloor = spawn.floor; world.state.playerFeetY = spawn.y;
    player.refreshLocation();
  }
  avatars.spawn('local', { role: localIsHider ? avatarLogic.ROLES.HIDER : avatarLogic.ROLES.SEEKER, seat: 0, hideHead: true, name: 'You' });
  const seeker = localIsHider ? createSeeker({
    THREE, config, tuning: seekerConfig, floorY, layout, world, avatars,
    logic: seekerLogic, enemyLogic, movement, avatarLogic,
  }) : null;
  const seekerSpawn = localIsHider ? plan.spawns.seeker : { ...camera.position, floor: world.state.playerFloor };
  const hiders = createHiders({
    THREE, config, tuning: hiderConfig, sanityConfig, floorY, layout, world, avatars,
    count: Math.max(0, match.hiderCount - (localIsHider ? 1 : 0)), seekerSpawn,
    logic: hiderLogic, enemyLogic, movement, sanityLogic, avatarLogic,
  });
  demons.setPlayers(() => [...hiders.list(), ...(seeker?.getState().alive ? [seeker.getState()] : [])]);
  const round = createRound({
    camera, world, player, elevator, hiders, seeker, spectator, avatars, localRole: match.role,
    monsters: demons.list, flashlightDrops, logic: window.HotelRound, config: match, document, window,
  });
  return { hiders, seeker, round };
}
