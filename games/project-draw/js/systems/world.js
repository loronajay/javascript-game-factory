import { SIZE_PRESETS, FLOOR_PRESETS } from '../core/config.js';
import { adjustHex, rgbCssToHex } from '../core/utils.js';

export function createWorldSystem(state, refs, drawingSystem, renderer) {
  function applyFloorColor(hex) {
    state.world.floorColor = hex;
    refs.floorEl.style.setProperty('--floor-a', hex);
    refs.floorEl.style.setProperty('--floor-b', adjustHex(hex, 22));
    refs.floorEl.style.setProperty('--floor-c', adjustHex(hex, -18));
    refs.floorColorInput.value = hex.startsWith('#') ? hex : rgbCssToHex(hex);
    refs.floorSwatch.style.background = refs.floorColorInput.value;
  }

  function setupWorldDimensions() {
    refs.cameraEl.style.width = `${state.world.width}px`;
    refs.cameraEl.style.height = `${state.world.height}px`;
    refs.floorEl.style.width = `${state.world.width}px`;
    refs.floorEl.style.height = `${state.world.height}px`;
  }

  function applyCanvasPreset(sizeKey, floorPresetKey) {
    const preset = SIZE_PRESETS[sizeKey] || SIZE_PRESETS.medium;
    state.world.width = preset.width;
    state.world.height = preset.height;

    setupWorldDimensions();

    state.drawing.strokes = [];
    state.player.activeStroke = null;
    state.player.drawCursorX = null;
    state.player.drawCursorY = null;

    state.player.x = state.world.width / 2;
    state.player.y = state.world.height / 2;
    state.player.prevX = state.player.x;
    state.player.prevY = state.player.y;

    state.selectedFloorPreset = floorPresetKey;
    applyFloorColor(FLOOR_PRESETS[floorPresetKey] || FLOOR_PRESETS.slate);

    state.camera.x = Math.max(0, Math.min(state.world.width - window.innerWidth, state.player.x - window.innerWidth / 2));
    state.camera.y = Math.max(0, Math.min(state.world.height - window.innerHeight, state.player.y - window.innerHeight / 2));

    drawingSystem.resizeCanvas();
    renderer.updateCursorVisual();
    renderer.renderPlayer(false);
    renderer.renderCamera();
    renderer.renderMinimap();
  }

  return { applyCanvasPreset, applyFloorColor };
}
