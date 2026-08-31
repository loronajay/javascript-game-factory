import { HEARTS_MAX, INVULN_MS } from './config.js';
import { isHazardAt } from './hazards.js';
import { getSpawnYaw } from './map-3d.js';
import { enqueueSoundEvent } from './audio.js';

export function applyHazardDamage(state, now) {
  const { player } = state;
  if (!state.rules.hazardsEnabled || player.won || now < player.invulnerableUntil) return false;
  if (!isHazardAt(state.hazards, player.tx, player.ty, now - (state.gameStartAt || 0), player, state.map)) return false;
  player.hearts--;
  player.invulnerableUntil = now + INVULN_MS;
  state.message = 'Suit damaged.';
  enqueueSoundEvent(state, 'grunt'); enqueueSoundEvent(state, 'hit');
  if (player.hearts > 0) return false;
  Object.assign(player, {
    tx: player.spawnTx, ty: player.spawnTy, prevTx: player.spawnTx, prevTy: player.spawnTy,
    px: player.spawnTx + 0.5, py: player.spawnTy + 0.5,
    hearts: HEARTS_MAX, powerUntil: 0, isSprinting: false, walkFrame: 0, pitch: 0,
    yaw: getSpawnYaw(state.map, { x: player.spawnTx, y: player.spawnTy }),
  });
  state.message = 'Emergency recall: returned to start.';
  state.online.outbox.push({ type: 'player_died', playerId: state.online.localPlayerId });
  return true;
}
