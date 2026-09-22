const KEY_BINDINGS = Object.freeze({
  KeyA: { playerIndex: 0, orbit: 1 },
  KeyD: { playerIndex: 0, orbit: -1 },
  ArrowLeft: { playerIndex: 1, orbit: 1 },
  ArrowRight: { playerIndex: 1, orbit: -1 },
});

export function createInputState() {
  const keys = new Set();
  const pointers = new Map();

  function setKey(code, pressed) {
    if (!KEY_BINDINGS[code]) return false;
    if (pressed) keys.add(code);
    else keys.delete(code);
    return true;
  }

  function pressPointer(pointerId, playerIndex, orbit) {
    pointers.set(pointerId, {
      playerIndex: playerIndex === 1 ? 1 : 0,
      orbit: Math.sign(orbit),
    });
  }

  function releasePointer(pointerId) {
    pointers.delete(pointerId);
  }

  function commandFor(playerIndex) {
    let orbit = 0;
    for (const code of keys) {
      const binding = KEY_BINDINGS[code];
      if (binding.playerIndex === playerIndex) orbit += binding.orbit;
    }
    for (const pointer of pointers.values()) {
      if (pointer.playerIndex === playerIndex) orbit += pointer.orbit;
    }
    return { orbit: Math.sign(orbit) };
  }

  function commands() {
    return [commandFor(0), commandFor(1)];
  }

  function clear() {
    keys.clear();
    pointers.clear();
  }

  return { setKey, pressPointer, releasePointer, commands, clear };
}

export { KEY_BINDINGS };
