export function getRefs() {
  return {
    gameEl: document.getElementById('game'),
    cameraEl: document.getElementById('camera'),
    floorEl: document.getElementById('floor'),
    playerEl: document.getElementById('player'),
    cursorAnchorEl: document.getElementById('cursor-anchor'),

    joystickEl: document.getElementById('joystick'),
    knobEl: document.getElementById('knob'),

    drawButton: document.getElementById('draw-button'),
    undoButton: document.getElementById('undo-button'),
    clearButton: document.getElementById('clear-button'),
    fullViewButton: document.getElementById('full-view-button'),
    smoothToggle: document.getElementById('smooth-toggle'),

    lineColorInput: document.getElementById('line-color'),
    floorColorInput: document.getElementById('floor-color'),
    lineSwatch: document.getElementById('line-swatch'),
    floorSwatch: document.getElementById('floor-swatch'),

    setupOverlay: document.getElementById('setup-overlay'),
    sizeSelect: document.getElementById('size-select'),
    startButton: document.getElementById('start-button'),
    presetSwatches: Array.from(document.querySelectorAll('.preset-swatch')),
    toolButtons: Array.from(document.querySelectorAll('.tool-button')),

    canvas: document.getElementById('draw-canvas'),
    minimapPlayer: document.getElementById('minimap-player'),
    minimapView: document.getElementById('minimap-view')
  };
}
