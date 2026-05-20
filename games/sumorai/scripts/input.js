// Tracks raw key state and builds per-tick input snapshots.
// The game update function receives snapshots, never live DOM event references.

function createInput() {
  const held = new Set();
  const justPressed = new Set();
  const consumed = new Set();

  window.addEventListener('keydown', e => {
    if (!held.has(e.code)) justPressed.add(e.code);
    held.add(e.code);
    // Prevent arrow keys from scrolling the page during a match
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', e => {
    held.delete(e.code);
    justPressed.delete(e.code);
    consumed.delete(e.code);
  });

  // Build a snapshot from a key binding object.
  // bindings: { left, right, up, down, attack, dash, projectile } → KeyboardEvent.code strings
  function getSnapshot(bindings) {
    const attackJP = justPressed.has(bindings.attack) && !consumed.has(bindings.attack);
    if (attackJP) consumed.add(bindings.attack);

    return {
      left:            held.has(bindings.left),
      right:           held.has(bindings.right),
      up:              held.has(bindings.up),
      down:            held.has(bindings.down),
      attack:          held.has(bindings.attack),
      dash:            held.has(bindings.dash),
      projectile:      held.has(bindings.projectile),
      attackJustPressed: attackJP,
    };
  }

  // Call once per tick after all snapshots are read to clear just-pressed state.
  function flush() {
    justPressed.clear();
    consumed.clear();
  }

  return { getSnapshot, flush };
}

export { createInput };
