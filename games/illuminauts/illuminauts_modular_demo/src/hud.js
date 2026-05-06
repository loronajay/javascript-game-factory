import { HEARTS_MAX, POWER_CELL_MS, STAMINA_MAX } from './config.js';

function heartString(count) {
  return `${'♥'.repeat(count)}${'♡'.repeat(HEARTS_MAX - count)}`;
}

export function createHud() {
  return {
    hearts: document.getElementById('hudHearts'),
    chips: document.getElementById('hudChips'),
    stamina: document.getElementById('hudStamina'),
    power: document.getElementById('hudPower')
  };
}

export function updateHud(hud, state, now) {
  const player = state.player;
  hud.hearts.textContent = heartString(player.hearts);
  hud.chips.textContent = String(player.chips);
  hud.stamina.textContent = `${Math.round((player.stamina / STAMINA_MAX) * 100)}%`;

  const remaining = Math.max(0, player.powerUntil - now);
  hud.power.textContent = remaining > 0 ? `${Math.ceil(remaining / 1000)}s` : 'OFF';
}
