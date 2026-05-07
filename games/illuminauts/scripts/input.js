const PREVENT_DEFAULT_CODES = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'
]);

export function bindInput(input) {
  window.addEventListener('keydown', (event) => {
    if (PREVENT_DEFAULT_CODES.has(event.code)) event.preventDefault();
    if (!input.held.has(event.code)) input.justPressed.add(event.code);
    input.held.add(event.code);
  });

  window.addEventListener('keyup', (event) => {
    input.held.delete(event.code);
  });
}

export function consumeJustPressed(input, code) {
  if (!input.justPressed.has(code)) return false;
  input.justPressed.delete(code);
  return true;
}

// Returns true (and clears the set) if any key was pressed this frame.
// Used for menu/win screen transitions.
export function consumeAnyKey(input) {
  if (input.justPressed.size === 0) return false;
  input.justPressed.clear();
  return true;
}

export function clearFrameInput(input) {
  input.justPressed.clear();
}

export function getMoveIntent(input) {
  if (input.held.has('ArrowUp') || input.held.has('KeyW')) return { dx: 0, dy: -1 };
  if (input.held.has('ArrowDown') || input.held.has('KeyS')) return { dx: 0, dy: 1 };
  if (input.held.has('ArrowLeft') || input.held.has('KeyA')) return { dx: -1, dy: 0 };
  if (input.held.has('ArrowRight') || input.held.has('KeyD')) return { dx: 1, dy: 0 };
  return { dx: 0, dy: 0 };
}

export function wantsSprint(input) {
  return input.held.has('ShiftLeft') || input.held.has('ShiftRight');
}
