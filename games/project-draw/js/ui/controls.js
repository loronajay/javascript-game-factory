import { TOOL_CONFIG } from '../core/config.js';

export function wireUi(state, refs, actions, renderer, worldSystem) {
  refs.drawButton.addEventListener('pointerdown', (event) => {
    if (state.fullView) return;
    state.input.drawPointerId = event.pointerId;
    refs.drawButton.setPointerCapture(event.pointerId);
    actions.setDrawing(true);
    event.preventDefault();
  });

  refs.drawButton.addEventListener('pointerup', (event) => {
    if (event.pointerId !== state.input.drawPointerId) return;
    state.input.drawPointerId = null;
    actions.setDrawing(false);
    event.preventDefault();
  });

  refs.drawButton.addEventListener('pointercancel', () => {
    state.input.drawPointerId = null;
    actions.setDrawing(false);
  });

  refs.drawButton.addEventListener('lostpointercapture', () => {
    state.input.drawPointerId = null;
    actions.setDrawing(false);
  });

  refs.toolButtons.forEach(btn => {
    btn.addEventListener('click', () => actions.setActiveTool(btn.dataset.tool));
  });

  refs.lineColorInput.addEventListener('input', () => {
    state.drawing.color = refs.lineColorInput.value;
    refs.lineSwatch.style.background = state.drawing.color;
    renderer.updateCursorVisual();
  });

  refs.floorColorInput.addEventListener('input', () => {
    worldSystem.applyFloorColor(refs.floorColorInput.value);
  });

  refs.smoothToggle.addEventListener('click', () => {
    state.drawing.smooth = !state.drawing.smooth;
    refs.smoothToggle.classList.toggle('active', state.drawing.smooth);
    refs.smoothToggle.textContent = state.drawing.smooth ? 'Mode: Smooth' : 'Mode: Raw';
  });

  refs.undoButton.addEventListener('click', actions.undoLastStroke);
  refs.clearButton.addEventListener('click', actions.clearAllStrokes);
  refs.fullViewButton.addEventListener('click', () => actions.setFullView(!state.fullView));

  refs.presetSwatches.forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedFloorPreset = btn.dataset.preset;
      refs.presetSwatches.forEach(x => x.classList.toggle('active', x === btn));
    });
  });

  refs.startButton.addEventListener('click', actions.startCanvas);
}

export function setActiveToolClass(refs, toolName) {
  refs.toolButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tool === toolName));
  refs.playerEl.classList.remove('tool-pencil', 'tool-brush', 'tool-spray', 'tool-eraser');
  refs.playerEl.classList.add(`tool-${toolName}`);
}
