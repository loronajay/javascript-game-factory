import { createGameState } from './scripts/state.js';
import { bindInput, clearFrameInput, consumeAnyKey } from './scripts/input.js';
import { updateAliens } from './scripts/hazards.js';
import { updatePlayer } from './scripts/player.js';
import { renderMenu, renderGameView, renderWinScreen, renderDebugView } from './scripts/renderer.js';
import { loadAssets } from './scripts/assets.js';

const canvas = document.getElementById('gameCanvas');

// Input object bound once to DOM events — survives state resets.
const input = { held: new Set(), justPressed: new Set() };
bindInput(input);

// F3 toggles the full-map debug view (replaces game view while active).
let debugMode = false;
window.addEventListener('keydown', (e) => {
  if (e.code === 'F3') { e.preventDefault(); debugMode = !debugMode; }
});

let state = createGameState();
state.input = input;

let phase = 'menu'; // 'menu' | 'playing' | 'win'
let accumulator = 0;

const TICK_MS = 1000 / 60;

// ─── State transitions ────────────────────────────────────────────────────────

function startNewGame() {
  state = createGameState();
  state.input = input;
  input.held.clear();
  input.justPressed.clear();
  phase = 'playing';
  accumulator = 0;
  state.lastTime = performance.now();
}

function goToMenu() {
  state = createGameState();
  state.input = input;
  input.held.clear();
  input.justPressed.clear();
  phase = 'menu';
  accumulator = 0;
  state.lastTime = performance.now();
}

// ─── Fixed-timestep tick ──────────────────────────────────────────────────────

function gameTick(now) {
  if (phase !== 'playing') return;
  updateAliens(state.hazards, now);
  updatePlayer(state, now, TICK_MS);
  if (state.player.won) phase = 'win';
}

// ─── Main loop ────────────────────────────────────────────────────────────────

function loop(now) {
  accumulator += Math.min(100, now - state.lastTime);
  state.lastTime = now;

  while (accumulator >= TICK_MS) {
    gameTick(now);
    accumulator -= TICK_MS;
  }

  if (phase === 'menu') {
    renderMenu(canvas, now);
    if (consumeAnyKey(state.input)) startNewGame();
  } else if (phase === 'playing') {
    if (debugMode) {
      renderDebugView(canvas, state, now);
    } else {
      renderGameView(canvas, state, now);
    }
  } else if (phase === 'win') {
    renderWinScreen(canvas, state, now);
    if (consumeAnyKey(state.input)) goToMenu();
  }

  clearFrameInput(state.input);
  requestAnimationFrame(loop);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function boot() {
  await loadAssets();
  state.lastTime = performance.now();
  requestAnimationFrame(loop);
}

boot().catch(() => {
  console.warn('[Illuminauts] Sprite sheet load failed — falling back to debug glyphs.');
  state.lastTime = performance.now();
  requestAnimationFrame(loop);
});
