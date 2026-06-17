import { createFixedStepLoop } from './engine/fixed-step-loop.js';
import {
  createControllerMapping,
  firstNewPressedButton,
  getPressedButtonIndices,
  loadControllerBindings,
  saveControllerBindings,
} from './engine/controller-mapping.js';
import {
  createGamepadInputManager,
  GAMECUBE_GAMEPAD_PROFILE,
  selectGamepads,
} from './engine/gamepad-input.js';
import { createKeyboardInputState } from './engine/keyboard-input.js';
import { normalizeInputFrame } from './engine/input-buffer.js';
import { createCanvasRenderer } from './rendering/canvas-renderer.js';
import { createTrainingMatch } from './scenes/training-match.js';

const KEY_BINDINGS = Object.freeze({
  p1: Object.freeze({
    KeyA: 'left',
    a: 'left',
    A: 'left',
    KeyD: 'right',
    d: 'right',
    D: 'right',
    KeyW: 'jump',
    w: 'jump',
    W: 'jump',
    KeyS: 'down',
    s: 'down',
    S: 'down',
    KeyJ: 'attack',
    j: 'attack',
    J: 'attack',
    KeyK: 'special',
    k: 'special',
    K: 'special',
    KeyL: 'shield',
    l: 'shield',
    L: 'shield',
  }),
  p2: Object.freeze({
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'jump',
    ArrowDown: 'down',
    Numpad1: 'attack',
    Numpad2: 'special',
    Numpad3: 'shield',
  }),
});

const canvas = document.querySelector('[data-game-canvas]');
const match = createTrainingMatch();
const renderer = createCanvasRenderer({ canvas, match });
const keyboard = createKeyboardInputState(KEY_BINDINGS);
const controllerMapping = createControllerMapping(loadControllerBindings(window.localStorage));
const gamepadInput = createGamepadInputManager({ profile: controllerMapping.toProfile(GAMECUBE_GAMEPAD_PROFILE) });
const controllerUi = createControllerUi({ controllerMapping, gamepadInput });

globalThis.juggleFighterDebug = {
  controllerMapping,
  gamepadInput,
  match,
  keyboard,
};

window.addEventListener('keydown', event => {
  keyboard.recordKey(event, true);
});

window.addEventListener('keyup', event => {
  keyboard.recordKey(event, false);
});

window.addEventListener('resize', () => renderer.resize(window));
renderer.resize(window);

const loop = createFixedStepLoop({
  tick() {
    const gamepads = selectGamepads(navigator.getGamepads?.() ?? []);
    controllerUi.tick(gamepads[0]);
    const p1Frame = readInput('p1', gamepads[0]);
    const p2Frame = readInput('p2', gamepads[1]);
    match.input.p1.push(p1Frame);
    match.input.p2.push(p2Frame);
    keyboard.tick();
    match.tick();
  },
  render: () => renderer.render(),
});

loop.start(window.requestAnimationFrame.bind(window));

function readInput(side, gamepad) {
  const frame = gamepadInput.readFrame(gamepad);
  const keyboardFrame = keyboard.readFrame(side);
  for (const [action, isHeld] of Object.entries(keyboardFrame)) {
    if (typeof isHeld === 'boolean') {
      frame[action] = frame[action] || isHeld;
    }
  }
  return normalizeInputFrame(frame);
}

function createControllerUi({ controllerMapping, gamepadInput }) {
  const status = document.querySelector('[data-controller-status]');
  const buttons = document.querySelector('[data-controller-buttons]');
  const mappingText = document.querySelector('[data-controller-mapping]');
  const mapButtons = [...document.querySelectorAll('[data-map-action]')];
  let listeningAction = null;
  let previousPressed = [];

  for (const button of mapButtons) {
    button.addEventListener('click', () => {
      listeningAction = button.dataset.mapAction;
      previousPressed = [];
      renderMappingText();
      renderListeningButtons();
    });
  }

  function tick(gamepad) {
    const pressed = getPressedButtonIndices(gamepad);
    if (status) status.textContent = gamepad ? `P${gamepad.index + 1}: ${gamepad.id}` : 'No controller detected';
    if (buttons) buttons.textContent = `Buttons: ${pressed.length ? pressed.join(', ') : 'none'}`;

    if (listeningAction) {
      const next = firstNewPressedButton(previousPressed, pressed);
      if (next !== null) {
        controllerMapping.bind(listeningAction, next);
        saveControllerBindings(window.localStorage, controllerMapping.bindings);
        gamepadInput.setProfile(controllerMapping.toProfile(GAMECUBE_GAMEPAD_PROFILE));
        gamepadInput.reset();
        listeningAction = null;
        renderMappingText();
        renderListeningButtons();
      }
    }

    previousPressed = pressed;
  }

  function renderMappingText() {
    if (!mappingText) return;
    const summary = Object.entries(controllerMapping.bindings)
      .map(([action, indices]) => `${action}:${indices.join('/')}`)
      .join('  ');
    mappingText.textContent = listeningAction
      ? `Press controller button for ${listeningAction}. Current: ${summary}`
      : `Mapped buttons: ${summary}`;
  }

  function renderListeningButtons() {
    for (const button of mapButtons) {
      button.dataset.listening = String(button.dataset.mapAction === listeningAction);
    }
  }

  renderMappingText();
  return { tick };
}
