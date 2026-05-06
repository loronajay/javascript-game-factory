import { createGameState } from './state.js';
import { bindInput, clearFrameInput } from './input.js';
import { updateAliens } from './hazards.js';
import { updatePlayer } from './player.js';
import { createHud, updateHud } from './hud.js';
import { renderDebugView, renderGameView } from './renderer.js';

const gameCanvas = document.getElementById('gameCanvas');
const debugCanvas = document.getElementById('debugCanvas');
const state = createGameState();
const hud = createHud();

bindInput(state.input);

function loop(now) {
  const dtMs = Math.min(100, now - state.lastTime);
  state.lastTime = now;

  if (!state.player.won) {
    updateAliens(state.hazards, now);
    updatePlayer(state, now, dtMs);
  }

  updateHud(hud, state, now);
  renderGameView(gameCanvas, state, now);
  renderDebugView(debugCanvas, state, now);
  clearFrameInput(state.input);

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
