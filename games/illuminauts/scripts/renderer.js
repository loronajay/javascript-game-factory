import { BASE_LIGHT_RADIUS, COLORS, POWER_LIGHT_RADIUS, VIEW_TILES_X, VIEW_TILES_Y } from './config.js';
import { resizeCanvasToDisplaySize } from './renderer-primitives.js';
import { drawWorld, drawPlayer } from './renderer-world.js';
import { drawHud, drawMessage } from './renderer-hud.js';

export {
  renderMenu,
  renderSideSelect,
  renderLobby,
  renderCountdown,
  renderDisconnected,
  renderWinScreen,
} from './renderer-screens.js';

export function renderGameView(canvas, state, now) {
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  ctx.fillStyle = COLORS.fog;
  ctx.fillRect(0, 0, width, height);

  const size = Math.floor(Math.min(width / VIEW_TILES_X, height / VIEW_TILES_Y));
  const offX  = Math.floor((width  - size * VIEW_TILES_X) / 2);
  const offY  = Math.floor((height - size * VIEW_TILES_Y) / 2);

  const { player } = state;
  const elapsed = now - (state.gameStartAt || 0);

  const startX = player.px - VIEW_TILES_X / 2;
  const startY = player.py - VIEW_TILES_Y / 2;

  const lightX = offX + VIEW_TILES_X / 2 * size;
  const lightY = offY + VIEW_TILES_Y / 2 * size;
  const lightRadiusTiles = now < player.powerUntil ? POWER_LIGHT_RADIUS : BASE_LIGHT_RADIUS;
  const radiusPx = lightRadiusTiles * size;

  ctx.save();
  ctx.beginPath();
  ctx.arc(lightX, lightY, radiusPx, 0, Math.PI * 2);
  ctx.clip();

  drawWorld(ctx, state.map, state.hazards, elapsed, startX, startY, size, offX, offY);
  drawPlayer(ctx, player, now, lightX, lightY, size);

  if (state.online?.enabled && state.remote?.active) {
    const distTiles = Math.hypot(state.remote.px - player.px, state.remote.py - player.py);
    if (distTiles <= lightRadiusTiles) {
      const rrx = offX + (state.remote.px - startX) * size;
      const rry = offY + (state.remote.py - startY) * size;
      drawPlayer(ctx, state.remote, now, rrx, rry, size);
    }
  }

  ctx.restore();

  const glowGrad = ctx.createRadialGradient(lightX, lightY, radiusPx * 0.62, lightX, lightY, radiusPx);
  glowGrad.addColorStop(0, 'rgba(118, 244, 255, 0.00)');
  glowGrad.addColorStop(1, 'rgba(118, 244, 255, 0.32)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(lightX, lightY, radiusPx, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(118, 244, 255, 0.62)';
  ctx.lineWidth = Math.max(2, size * 0.05);
  ctx.beginPath();
  ctx.arc(lightX, lightY, radiusPx, 0, Math.PI * 2);
  ctx.stroke();

  drawHud(ctx, state, now, width, height);
  drawMessage(ctx, state, width, height);
}

export function renderDebugView(canvas, state, now) {
  resizeCanvasToDisplaySize(canvas);
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);

  const { map, hazards } = state;
  const size = Math.floor(Math.min(width / map.width, height / map.height));
  const offX  = Math.floor((width  - size * map.width)  / 2);
  const offY  = Math.floor((height - size * map.height) / 2);
  const elapsed = now - (state.gameStartAt || 0);

  drawWorld(ctx, map, hazards, elapsed, 0, 0, size, offX, offY, map.width, map.height);

  const { player } = state;
  const pcx = offX + player.px * size;
  const pcy = offY + player.py * size;

  drawPlayer(ctx, player, now, pcx, pcy, size);

  const lightRadius = now < player.powerUntil ? POWER_LIGHT_RADIUS : BASE_LIGHT_RADIUS;
  ctx.strokeStyle = 'rgba(118, 244, 255, 0.48)';
  ctx.lineWidth = Math.max(1, size * 0.08);
  ctx.beginPath();
  ctx.arc(pcx, pcy, lightRadius * size, 0, Math.PI * 2);
  ctx.stroke();

  if (state.remote) {
    const rcx = offX + state.remote.px * size;
    const rcy = offY + state.remote.py * size;
    ctx.strokeStyle = 'rgba(255, 140, 66, 0.5)';
    ctx.lineWidth = Math.max(1, size * 0.06);
    ctx.beginPath();
    ctx.arc(rcx, rcy, size * 0.38, 0, Math.PI * 2);
    ctx.stroke();
  }

  const fontSize = Math.max(11, Math.floor(width * 0.016));
  ctx.fillStyle = '#76f4ff';
  ctx.font = `${fontSize}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`DEBUG — ${state.mapId ?? 'map'}  [${(state.mapIndex ?? 0) + 1}]`, 8, 8);

  ctx.fillStyle = '#4a6a7a';
  ctx.font = `${Math.max(10, Math.floor(fontSize * 0.82))}px ui-monospace, Consolas, monospace`;
  ctx.fillText('[ ] prev/next map', 8, 8 + fontSize + 3);
}
