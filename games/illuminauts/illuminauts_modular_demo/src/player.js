import {
  HEARTS_MAX,
  INVULN_MS,
  NORMAL_STEP_MS,
  POWER_CELL_MS,
  SPRINT_STEP_MS,
  STAMINA_DRAIN_PER_STEP,
  STAMINA_MAX,
  STAMINA_RECOVER_PER_SECOND
} from './config.js';
import { getDoorAt, getPickupAt, isBlocked, isGoalAt } from './map.js';
import { consumeJustPressed, getMoveIntent, wantsSprint } from './input.js';
import { isHazardAt } from './hazards.js';

function canMoveInto(state, nx, ny) {
  const door = getDoorAt(state.map, nx, ny);
  if (door && !door.open) {
    if (state.player.chips <= 0) {
      state.message = 'Laser Door requires an Access Chip.';
      return false;
    }

    state.player.chips -= 1;
    door.open = true;
    state.message = 'Laser Door disabled.';
    return true;
  }

  return !isBlocked(state.map, nx, ny);
}

function collectTilePickup(state) {
  const { player, map } = state;
  const chip = getPickupAt(map, player.x, player.y, 'chip');
  if (chip) {
    chip.active = false;
    player.chips += 1;
    state.message = 'Access Chip collected.';
    return;
  }

  if (isGoalAt(map, player.x, player.y)) {
    player.won = true;
    state.message = 'Beacon Core reached.';
  }
}

function tryActivatePowerCell(state, now) {
  if (!consumeJustPressed(state.input, 'KeyE')) return;

  const powerCell = getPickupAt(state.map, state.player.x, state.player.y, 'powerCell');
  if (!powerCell) {
    state.message = 'No Power Cell underfoot.';
    return;
  }

  state.player.powerUntil = now + POWER_CELL_MS;
  powerCell.active = false;
  state.message = 'Suit light overcharged.';
}

function damagePlayer(state, now) {
  const { player } = state;
  if (now < player.invulnerableUntil) return;

  player.hearts -= 1;
  player.invulnerableUntil = now + INVULN_MS;
  state.message = 'Suit damaged.';

  if (player.hearts <= 0) {
    player.x = player.spawnX;
    player.y = player.spawnY;
    player.hearts = HEARTS_MAX;
    player.powerUntil = 0;
    player.invulnerableUntil = now + INVULN_MS;
    state.message = 'Emergency recall: returned to start.';
  }
}

function clampStamina(player) {
  player.stamina = Math.max(0, Math.min(STAMINA_MAX, player.stamina));
}

function updateStamina(player, dtMs, sprintingThisStep) {
  clampStamina(player);

  if (sprintingThisStep) {
    clampStamina(player);
    return;
  }

  player.stamina += STAMINA_RECOVER_PER_SECOND * (dtMs / 1000);
  clampStamina(player);
}

export function updatePlayer(state, now, dtMs) {
  const { player, input } = state;
  clampStamina(player);

  tryActivatePowerCell(state, now);

  const intent = getMoveIntent(input);
  let sprintingThisStep = false;

  if (intent.dx || intent.dy) {
    if (intent.dx > 0) player.dir = 'right';
    if (intent.dx < 0) player.dir = 'left';
    if (intent.dy > 0) player.dir = 'down';
    if (intent.dy < 0) player.dir = 'up';

    const sprintRequested = wantsSprint(input) && player.stamina >= STAMINA_DRAIN_PER_STEP;
    const stepMs = sprintRequested ? SPRINT_STEP_MS : NORMAL_STEP_MS;

    if (now - player.lastMoveAt >= stepMs) {
      player.lastMoveAt = now;
      const nx = player.x + intent.dx;
      const ny = player.y + intent.dy;

      if (canMoveInto(state, nx, ny)) {
        player.x = nx;
        player.y = ny;
        collectTilePickup(state);

        if (sprintRequested) {
          sprintingThisStep = true;
          player.stamina -= STAMINA_DRAIN_PER_STEP;
          clampStamina(player);
        }
      }
    }
  }

  updateStamina(player, dtMs, sprintingThisStep);

  if (isHazardAt(state.hazards, player.x, player.y, now)) {
    damagePlayer(state, now);
  }
}
