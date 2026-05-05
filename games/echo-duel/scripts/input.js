import { INPUTS } from './config.js';

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName ? target.tagName.toLowerCase() : '';
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable === true;
}

export function createInputController({ onInput }) {
  const keysDown = new Set();

  function emit(value) {
    const input = String(value || '').toUpperCase();
    if (!INPUTS.includes(input)) return;
    onInput?.(input);
  }

  function onKeyDown(event) {
    if (isTypingTarget(event.target)) return;
    const input = String(event.key || '').toUpperCase();
    if (!INPUTS.includes(input)) return;
    if (keysDown.has(input)) return;
    keysDown.add(input);
    event.preventDefault();
    emit(input);
  }

  function onKeyUp(event) {
    if (isTypingTarget(event.target)) return;
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
