import { INPUTS } from './config.js';

export function createInputController({ onInput }) {
  const keysDown = new Set();

  function emit(value) {
    const input = String(value || '').toUpperCase();
    if (!INPUTS.includes(input)) return;
    onInput?.(input);
  }

  function onKeyDown(event) {
    const input = String(event.key || '').toUpperCase();
    if (!INPUTS.includes(input)) return;
    if (keysDown.has(input)) return;
    keysDown.add(input);
    event.preventDefault();
    emit(input);
  }

  function onKeyUp(event) {
    keysDown.delete(String(event.key || '').toUpperCase());
  }

  function bindPad(root = document) {
    root.querySelectorAll('[data-echo-key]').forEach(button => {
      button.addEventListener('pointerdown', event => {
        event.preventDefault();
        emit(button.dataset.echoKey);
      });
    });
  }

  function connect() {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    bindPad(document);
  }

  function disconnect() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    keysDown.clear();
  }

  return { connect, disconnect, emit };
}
