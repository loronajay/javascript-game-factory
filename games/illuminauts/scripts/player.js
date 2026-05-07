import {
  HEARTS_MAX,
  INVULN_MS,
  PLAYER_RADIUS,
  POWER_CELL_MS,
  SPRINT_SPEED,
  STAMINA_DRAIN_PER_SECOND,
  STAMINA_MAX,
  STAMINA_RECOVER_PER_SECOND,
  WALK_SPEED
} from './config.js';
import { getDoorAt, isGoalAt, isWall } from './map.js';
import { getMoveIntent, wantsSprint } from './input.js';
import { isHazardAt } from './hazards.js';

const PICKUP_RANGE_SQ = 0.45 * 0.45; // tile units squared

const PLAYER_HITBOX = {
  left: PLAYER_RADIUS,
  right: PLAYER_RADIUS,
  top: PLAYER_RADIUS * 0.80,
  bottom: PLAYER_RADIUS * 1.65
};

function distSq(ax, ay, bx, by) {
  return (ax - bx) ** 2 + (ay - by) ** 2;
}

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
    return true;
  }
  state.message = 'Laser Door requires an Access Chip.';
  return false;
}

// Move along one axis, resolve AABB collision against solid tiles.
// Gives wall-sliding behavior when the other axis is free.
function moveAxis(state, axis, delta) {
  const { player } = state;
  const npx = axis === 'x' ? player.px + delta : player.px;
  const npy = axis === 'x' ? player.py : player.py + delta;

  const left  = Math.floor(npx - PLAYER_HITBOX.left + 0.001);
  const right = Math.floor(npx + PLAYER_HITBOX.right - 0.001);
  const top   = Math.floor(npy - PLAYER_HITBOX.top + 0.001);
  const bot   = Math.floor(npy + PLAYER_HITBOX.bottom - 0.001);

  let resolved = axis === 'x' ? npx : npy;

  for (let ty = top; ty <= bot; ty++) {
    for (let tx = left; tx <= right; tx++) {
      if (canPass(state, tx, ty)) continue;
      if (axis === 'x') {
        resolved = delta > 0
          ? Math.min(resolved, tx - PLAYER_HITBOX.right)
          : Math.max(resolved, tx + 1 + PLAYER_HITBOX.left);
      } else {
        resolved = delta > 0
          ? Math.min(resolved, ty - PLAYER_HITBOX.bottom)
          : Math.max(resolved, ty + 1 + PLAYER_HITBOX.top);
      }
    }
  }

  if (axis === 'x') player.px = resolved;
  else              player.py = resolved;
}

function collectPickups(state, now) {
  const { player, map } = state;

  for (const pickup of map.pickups) {
    if (!pickup.active) continue;
    if (distSq(player.px, player.py, pickup.x + 0.5, pickup.y + 0.5) > PICKUP_RANGE_SQ) continue;

    if (pickup.type === 'chip') {
      pickup.active = false;
      player.chips += 1;
      state.message = 'Access Chip collected.';
    } else if (pickup.type === 'powerCell') {
      pickup.active = false;
      player.powerUntil = now + POWER_CELL_MS;
      state.message = 'Suit light overcharged.';
    }
  }

  if (isGoalAt(map, Math.floor(player.px), Math.floor(player.py))) {
    player.won = true;
    state.message = 'Beacon Core reached.';
  }
}

function damagePlayer(state, now) {
  const { player } = state;
  if (now < player.invulnerableUntil) return;

  player.hearts -= 1;
  player.invulnerableUntil = now + INVULN_MS;
  state.message = 'Suit damaged.';

  if (player.hearts <= 0) {
    player.px = player.spawnPx;
    player.py = player.spawnPy;
    player.hearts = HEARTS_MAX;
    player.powerUntil = 0;
    player.invulnerableUntil = now + INVULN_MS;
    state.message = 'Emergency recall: returned to start.';
  }
}

export function updatePlayer(state, now, dtMs) {
  const { player, input } = state;
  const dt = dtMs / 1000;

  const intent = getMoveIntent(input);
  const moving = intent.dx !== 0 || intent.dy !== 0;

  // Normalize diagonal so diagonal speed matches cardinal speed
  let nx = intent.dx;
  let ny = intent.dy;
  if (nx !== 0 && ny !== 0) {
    nx *= Math.SQRT1_2;
    ny *= Math.SQRT1_2;
  }

  const sprinting = moving && wantsSprint(input) && player.stamina > 0;
  const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;

  // Stamina
  if (sprinting) {
    player.stamina = Math.max(0, player.stamina - STAMINA_DRAIN_PER_SECOND * dt);
  } else {
    player.stamina = Math.min(STAMINA_MAX, player.stamina + STAMINA_RECOVER_PER_SECOND * dt);
  }

  // Direction (only update while moving, so the sprite holds last direction at rest)
  if (intent.dx > 0) player.dir = 'right';
  else if (intent.dx < 0) player.dir = 'left';
  else if (intent.dy > 0) player.dir = 'down';
  else if (intent.dy < 0) player.dir = 'up';

  // Separate X and Y resolution for wall sliding
  if (nx !== 0) moveAxis(state, 'x', nx * speed * dt);
  if (ny !== 0) moveAxis(state, 'y', ny * speed * dt);

  collectPickups(state, now);

  const tx = Math.floor(player.px);
  const ty = Math.floor(player.py);
  if (isHazardAt(state.hazards, tx, ty, now)) {
    damagePlayer(state, now);
  }
}
