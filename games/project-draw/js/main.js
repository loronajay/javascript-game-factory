import { TOOL_CONFIG } from './core/config.js';
import { createState } from './core/state.js';
import { getRefs } from './ui/refs.js';
import { createInputSystem } from './systems/input.js';
import { createPlayerSystem } from './systems/player.js';
import { createDrawingSystem } from './systems/drawingEngine.js';
import { createCameraSystem } from './systems/camera.js';
import { createRenderer } from './systems/renderer.js';
import { createWorldSystem } from './systems/world.js';
import { wireUi, setActiveToolClass } from './ui/controls.js';

const state = createState();
const refs = getRefs();

let inputSystem;
let playerSystem;
let drawingSystem;
let cameraSystem;
let renderer;
let worldSystem;

function setDrawing(isDrawing) {
  if (state.fullView) isDrawing = false;
  if (state.player.drawing === isDrawing) return;

  state.player.drawing = isDrawing;
  refs.drawButton.classList.toggle('active', isDrawing);
  refs.drawButton.textContent = isDrawing ? 'Down' : 'Draw';

  if (isDrawing) {
    drawingSystem.startStroke();
  } else {
    drawingSystem.finishActiveStroke();
  }

  renderer.updateCursorVisual();
}

function setActiveTool(toolName) {
  if (!TOOL_CONFIG[toolName]) return;

  setDrawing(false);
  state.drawing.activeTool = toolName;
  setActiveToolClass(refs, toolName);
  renderer.updateCursorVisual();
}

function setFullView(enabled) {
  state.fullView = enabled;
  setDrawing(false);
  inputSystem.resetStick();
  state.input.keys.clear();

  refs.gameEl.classList.toggle('full-view', state.fullView);
  refs.fullViewButton.textContent = state.fullView ? 'Exit Full' : 'Full View';
  renderer.renderCamera();
}

function startCanvas() {
  worldSystem.applyCanvasPreset(refs.sizeSelect.value, state.selectedFloorPreset);
  refs.setupOverlay.style.display = 'none';
}

function boot() {
  playerSystem = createPlayerSystem(state);
  renderer = createRenderer(state, refs, playerSystem);
  drawingSystem = createDrawingSystem(state, refs, playerSystem);
  cameraSystem = createCameraSystem(state);

  const actions = {
    setDrawing,
    setActiveTool,
    setFullView,
    startCanvas,
    undoLastStroke: () => drawingSystem.undoLastStroke(),
    clearAllStrokes: () => drawingSystem.clearAllStrokes()
  };

  inputSystem = createInputSystem(state, refs, actions);
  worldSystem = createWorldSystem(state, refs, drawingSystem, renderer);

  wireUi(state, refs, actions, renderer, worldSystem);

  refs.lineSwatch.style.background = state.drawing.color;
  refs.floorSwatch.style.background = state.world.floorColor;
  renderer.updateCursorVisual();

  window.addEventListener('resize', () => {
    renderer.renderCamera();
    renderer.renderMinimap();
  });

  requestAnimationFrame(frame);
}

let lastTime = performance.now();

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (refs.setupOverlay.style.display !== 'none') {
    requestAnimationFrame(frame);
    return;
  }

  const move = inputSystem.getMoveVector();

  playerSystem.movePlayer(move, dt);
  drawingSystem.updateToolAction(dt);
  cameraSystem.updateCamera();
  renderer.updateCursorPosition();

  renderer.renderPlayer(move.moving);
  renderer.renderCamera();
  renderer.renderMinimap();

  requestAnimationFrame(frame);
}

boot();
