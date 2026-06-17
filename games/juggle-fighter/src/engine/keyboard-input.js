import { normalizeInputFrame } from './input-buffer.js';

export function createKeyboardInputState(bindings, { pulseFrames = 4 } = {}) {
  const heldKeys = new Set();
  const pulses = new Map();

  function recordKey(event, isHeld) {
    let handled = false;
    for (const keyId of [event.code, event.key]) {
      if (!keyId) continue;
      const binding = findBinding(bindings, keyId);
      if (!binding) continue;

      handled = true;
      if (isHeld) {
        heldKeys.add(keyId);
        pulses.set(`${binding.side}:${binding.action}`, pulseFrames);
      } else {
        heldKeys.delete(keyId);
      }
    }

    if (handled) event.preventDefault?.();
    return handled;
  }

  function readFrame(side) {
    const frame = {};
    for (const [keyId, action] of Object.entries(bindings[side])) {
      frame[action] = frame[action] || heldKeys.has(keyId);
    }

    for (const [pulseId, frames] of pulses) {
      const [pulseSide, action] = pulseId.split(':');
      if (pulseSide === side && frames > 0) {
        frame[action] = true;
      }
    }

    return normalizeInputFrame(frame);
  }

  function tick() {
    for (const [pulseId, frames] of [...pulses]) {
      if (frames <= 1) {
        pulses.delete(pulseId);
      } else {
        pulses.set(pulseId, frames - 1);
      }
    }
  }

  return {
    heldKeys,
    readFrame,
    recordKey,
    tick,
  };
}

function findBinding(bindings, keyId) {
  for (const [side, sideBindings] of Object.entries(bindings)) {
    const action = sideBindings[keyId];
    if (action) return { side, action };
  }
  return null;
}
