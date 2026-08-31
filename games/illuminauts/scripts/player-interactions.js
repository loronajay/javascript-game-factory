import { POWER_CELL_MS } from './config.js';
import { enqueueSoundEvent } from './audio.js';
import { isGoalAt } from './map.js';

// Gameplay owns these objects. Rendering only reads their active/open flags.
export function tryOpenDoor(state, door) {
  if (door.open) return true;
  if (state.player.chips <= 0) { state.message = 'Laser Door requires an Access Chip.'; return false; }
  state.player.chips--;
  door.open = true;
  state.message = 'Laser Door disabled.';
  enqueueSoundEvent(state, 'door-unlock', { doorId: door.id });
  state.online.outbox.push({ type: 'door_opened', doorId: door.id });
  return true;
}

export function collectPickups(state, now) {
  const { player, map } = state;
  for (const pickup of map.pickups) {
    if (!pickup.active || pickup.x !== player.tx || pickup.y !== player.ty) continue;
    pickup.active = false;
    enqueueSoundEvent(state, 'collect', { pickupId: pickup.id });
    if (pickup.type === 'chip') {
      player.chips++;
      state.message = 'Access Chip collected.';
    } else if (pickup.type === 'powerCell') {
      player.powerUntil = now + POWER_CELL_MS;
      state.message = 'Suit light overcharged.';
      enqueueSoundEvent(state, 'power-up', { pickupId: pickup.id });
    } else if (pickup.type === 'dataCore') {
      state.solo.dataCoresCollected++;
      const remaining = state.solo.dataCoreTotal - state.solo.dataCoresCollected;
      if (state.solo.mode === 'sweep' && remaining <= 0) {
        state.solo.beaconLocked = false;
        map.beaconLocked = false;
        state.message = 'All Data Cores secured — Beacon Core unlocked.';
        enqueueSoundEvent(state, 'power-up', { pickupId: pickup.id });
      } else state.message = `Data Core secured. ${remaining} remaining.`;
    }
    if (pickup.type !== 'dataCore') state.online.outbox.push({ type: 'pickup_taken', pickupId: pickup.id });
  }
  if (!isGoalAt(map, player.tx, player.ty)) return;
  if (state.solo?.beaconLocked) {
    state.message = `Beacon Core locked — collect all Data Cores first. (${state.solo.dataCoresCollected}/${state.solo.dataCoreTotal})`;
  } else if (!player.won) {
    player.won = true;
    state.message = 'Beacon Core reached.';
    if (state.online.enabled) state.online.outbox.push({ type: 'won', playerId: state.online.localPlayerId });
  }
}
