import {
  HEARTS_MAX,
  INVULN_MS,
  POWER_CELL_MS,
  SPRINT_STEP_MS,
  STAMINA_DRAIN_PER_STEP,
  STAMINA_MAX,
  STAMINA_RECOVER_PER_SECOND,
  WALK_STEP_MS
} from './config.js';
import { enqueueSoundEvent } from './audio.js';
import { getDoorAt, isGoalAt, isWall } from './map.js';
import { getMoveIntent, wantsSprint } from './input.js';
import { isHazardAt } from './hazards.js';

// Returns true if the player can enter this tile. Opens doors automatically when possible.
function canPass(state, tx, ty) {
  if (isWall(state.map, tx, ty)) return false;
  const door = getDoorAt(state.map, tx, ty);
  if (!door) return true;
  if (door.open) return true;
  if (state.player.chips > 0) {
    state.player.chips -= 1;
    door.open = true;
    state.message = 'Laser Door disabled.';
    enqueueSoundEvent(state, 'door-unlock', { doorId: door.id });
    state.online.outbox.push({ type: 'door_opened', doorId: door.id });
    return true;
  }
  state.message = 'Laser Door requires an Access Chip.';
  return false;
}

function collectPickups(state, now) {
  const { player, map } = state;
  for (const pickup of map.pickups) {
    if (!pickup.active) continue;
    if (pickup.x !== player.tx || pickup.y !== player.ty) continue;
    if (pickup.type === 'chip') {
      pickup.active = false;
      player.chips += 1;
      state.message = 'Access Chip collected.';
      state.online.outbox.push({ type: 'pickup_taken', pickupId: pickup.id });
    } else if (pickup.type === 'powerCell') {
      pickup.active = false;
      player.powerUntil = now + POWER_CELL_MS;
      state.message = 'Suit light overcharged.';
      state.online.outbox.push({ type: 'pickup_taken', pickupId: pickup.id });
    }
  }
  if (isGoalAt(map, player.tx, player.ty)) {
    player.won = true;
    state.message = 'Beacon Core reached.';
    state.online.outbox.push({ type: 'won', playerId: state.online.localPlayerId });
  }
}

function damagePlayer(state, now) {
  const { player } = state;
  if (now < player.invulnerableUntil) return;

  player.hearts -= 1;
  player.invulnerableUntil = now + INVULN_MS;
  state.message = 'Suit damaged.';
  enqueueSoundEvent(state, 'grunt');
  enqueueSoundEvent(state, 'hit');

  if (player.hearts <= 0) {
    player.tx = player.spawnTx;
    player.ty = player.spawnTy;
    player.prevTx = player.spawnTx;
    player.prevTy = player.spawnTy;
    player.px = player.spawnTx + 0.5;
    player.py = player.spawnTy + 0.5;
    player.moveStartAt = 0;
    player.stepMs = 0;
    player.isSprinting = false;
    player.hearts = HEARTS_MAX;
    player.powerUntil = 0;
    player.invulnerableUntil = now + INVULN_MS;
    state.message = 'Emergency recall: returned to start.';
    state.online.outbox.push({ type: 'player_died', playerId: state.online.localPlayerId });
  }
}

export function updatePlayer(state, now, dtMs) {
  const { player, input } = state;
  const dt = dtMs / 1000;
  const elapsed = now - (state.gameStartAt || 0);

  // Compute lerp progress (0→1 over stepMs). stepMs=0 means already at tile.
  const progress = player.stepMs > 0
    ? Math.min(1, (now - player.moveStartAt) / player.stepMs)
    : 1;

  // Visual position follows the lerp — renderer reads player.px/py
  player.px = player.prevTx + (player.tx - player.prevTx) * progress + 0.5;
  player.py = player.prevTy + (player.ty - player.prevTy) * progress + 0.5;

  // Still animating — recover stamina if walking, then wait
  if (progress < 1) {
    if (!player.isSprinting) {
      player.stamina = Math.min(STAMINA_MAX, player.stamina + STAMINA_RECOVER_PER_SECOND * dt);
    }
    return;
  }

  // Arrived at tile — check hazards every tick (invulnerability rate-limits damage)
  if (isHazardAt(state.hazards, player.tx, player.ty, elapsed)) {
    damagePlayer(state, now);
  }

  // Collect pickups on this tile (consumed pickups are skipped, so safe every tick)
  collectPickups(state, now);

  // Read input for next move
  const intent = getMoveIntent(input);
  const moving = intent.dx !== 0 || intent.dy !== 0;

  if (!moving) {
    player.isSprinting = false;
    player.stamina = Math.min(STAMINA_MAX, player.stamina + STAMINA_RECOVER_PER_SECOND * dt);
    return;
  }

  // One cardinal direction per step — prefer horizontal when both axes are held
  let dx = 0, dy = 0;
  if (intent.dx !== 0) dx = Math.sign(intent.dx);
  else dy = Math.sign(intent.dy);

  if (dx > 0) player.dir = 'right';
  else if (dx < 0) player.dir = 'left';
  else if (dy > 0) player.dir = 'down';
  else if (dy < 0) player.dir = 'up';

  const sprinting = wantsSprint(input) && player.stamina > 0;

  if (sprinting) {
    player.stamina = Math.max(0, player.stamina - STAMINA_DRAIN_PER_STEP);
  } else {
    player.stamina = Math.min(STAMINA_MAX, player.stamina + STAMINA_RECOVER_PER_SECOND * dt);
  }

  const nextTx = player.tx + dx;
  const nextTy = player.ty + dy;

  if (!canPass(state, nextTx, nextTy)) return;

  // Start move to next tile
  player.prevTx = player.tx;
  player.prevTy = player.ty;
  player.tx = nextTx;
  player.ty = nextTy;
  player.moveStartAt = now;
  player.stepMs = sprinting ? SPRINT_STEP_MS : WALK_STEP_MS;
  player.isSprinting = sprinting;
}
