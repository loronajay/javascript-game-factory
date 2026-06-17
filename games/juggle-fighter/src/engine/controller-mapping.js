export const DEFAULT_CONTROLLER_BUTTON_BINDINGS = Object.freeze({
  attack: Object.freeze([0]),
  special: Object.freeze([1]),
  jump: Object.freeze([2, 3]),
  shield: Object.freeze([4, 7]),
  grab: Object.freeze([5]),
});

export const CONTROLLER_ACTIONS = Object.freeze(['attack', 'special', 'jump', 'shield', 'grab']);

export function createControllerMapping(initialBindings = DEFAULT_CONTROLLER_BUTTON_BINDINGS) {
  const bindings = normalizeBindings(initialBindings);

  function bind(action, buttonIndex) {
    if (!CONTROLLER_ACTIONS.includes(action) || !Number.isInteger(buttonIndex)) return false;
    bindings[action] = [buttonIndex];
    return true;
  }

  function toProfile(baseProfile) {
    return {
      ...baseProfile,
      buttons: {
        ...baseProfile.buttons,
        ...bindings,
      },
    };
  }

  return {
    bind,
    bindings,
    toJSON: () => normalizeBindings(bindings),
    toProfile,
  };
}

export function normalizeBindings(bindings = {}) {
  const normalized = {};
  for (const action of CONTROLLER_ACTIONS) {
    const value = bindings[action] ?? DEFAULT_CONTROLLER_BUTTON_BINDINGS[action];
    normalized[action] = [...new Set([...(Array.isArray(value) ? value : [value])]
      .map(Number)
      .filter(Number.isInteger))];
  }
  return normalized;
}

export function getPressedButtonIndices(gamepad, { threshold = 0.5 } = {}) {
  if (!gamepad) return [];
  return [...(gamepad.buttons ?? [])]
    .map((button, index) => (button?.pressed || button?.value > threshold ? index : null))
    .filter(index => index !== null);
}

export function firstNewPressedButton(previousIndices, currentIndices) {
  const previous = new Set(previousIndices);
  return currentIndices.find(index => !previous.has(index)) ?? null;
}

export function loadControllerBindings(storage, key = 'juggle-fighter-controller-buttons') {
  try {
    const raw = storage?.getItem?.(key);
    return raw ? normalizeBindings(JSON.parse(raw)) : normalizeBindings();
  } catch {
    return normalizeBindings();
  }
}

export function saveControllerBindings(storage, bindings, key = 'juggle-fighter-controller-buttons') {
  storage?.setItem?.(key, JSON.stringify(normalizeBindings(bindings)));
}
