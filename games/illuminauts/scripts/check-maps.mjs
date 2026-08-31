import { MAPS } from './maps.js';
import { createGameState } from './state.js';
import { validateTraversal } from './map-validation.js';

for (let i = 0; i < MAPS.length; i++) {
  const state = createGameState(i), { map, hazards } = state;
  for (const [side, start] of [['Alpha', map.start], ['Beta', map.start2]]) for (const mode of ['sprint', 'sweep']) {
    if (!validateTraversal(map, start, mode).solvable) { console.error(`${state.mapId}: ${side} ${mode} cannot finish.`); process.exitCode = 1; }
  }
  console.log(`${state.mapId}: ${map.width}x${map.height}; ${hazards.aliens.length} patrols, ${hazards.laserGates.length} gates, ${hazards.turrets.length} turrets.`);
  for (const message of state.mapDiagnostics) console.log(`  Authoring note: ${message}`);
}
if (!process.exitCode) console.log('All maps pass chip/door-aware Sprint and Sweep reachability for both starts.');
