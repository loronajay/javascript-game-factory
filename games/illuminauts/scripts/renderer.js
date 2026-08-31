import { BASE_LIGHT_RADIUS, COLORS, POWER_LIGHT_RADIUS } from './config.js';
import { resizeCanvasToDisplaySize } from './renderer-primitives.js';
import { drawWorld, drawPlayer } from './renderer-world.js';

export {
  renderMenu,
  renderSideSelect,
  renderMapSelect,
  renderLobby,
  renderCountdown,
  renderDisconnected,
  renderWinScreen,
} from './renderer-screens.js';

export { initializeGameView, renderGameView, setGameViewActive } from './renderer-3d.js';

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
