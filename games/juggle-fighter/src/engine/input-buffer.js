export const INPUT_ACTIONS = Object.freeze([
  'left',
  'right',
  'up',
  'down',
  'jump',
  'attack',
  'special',
  'shield',
  'grab',
  'dodge',
]);

export function normalizeInputFrame(frame = {}) {
  const normalized = {};
  for (const action of INPUT_ACTIONS) {
    normalized[action] = Boolean(frame[action]);
  }
  normalized.moveX = Number.isFinite(frame.moveX) && Math.abs(frame.moveX) > 0
    ? clampAxis(frame.moveX)
    : (normalized.right ? 1 : 0) - (normalized.left ? 1 : 0);
  normalized.moveY = Number.isFinite(frame.moveY) && Math.abs(frame.moveY) > 0
    ? clampAxis(frame.moveY)
    : (normalized.down ? 1 : 0) - (normalized.up ? 1 : 0);
  normalized.attackX = Number.isFinite(frame.attackX) ? Math.sign(frame.attackX) : 0;
  normalized.attackY = Number.isFinite(frame.attackY) ? Math.sign(frame.attackY) : 0;
  return normalized;
}

export function createInputBuffer({ bufferFrames = 6, maxHistory = 120 } = {}) {
  let current = normalizeInputFrame();
  let previous = normalizeInputFrame();
  const history = [];
  const bufferedPresses = new Map();
  const pressedThisFrame = new Set();
  const releasedThisFrame = new Set();

  function push(frame) {
    previous = current;
    current = normalizeInputFrame(frame);
    pressedThisFrame.clear();
    releasedThisFrame.clear();

    for (const [action, age] of [...bufferedPresses]) {
      const nextAge = age + 1;
      if (nextAge > bufferFrames) {
        bufferedPresses.delete(action);
      } else {
        bufferedPresses.set(action, nextAge);
      }
    }

    for (const action of INPUT_ACTIONS) {
      if (current[action] && !previous[action]) {
        pressedThisFrame.add(action);
        bufferedPresses.set(action, 0);
      }
      if (!current[action] && previous[action]) {
        releasedThisFrame.add(action);
      }
    }

    history.push({ ...current });
    if (history.length > maxHistory) history.shift();
    return current;
  }

  function consumeBuffered(action) {
    if (!bufferedPresses.has(action)) return false;
    bufferedPresses.delete(action);
    return true;
  }

  return {
    consumeBuffered,
    get current() {
      return current;
    },
    get previous() {
      return previous;
    },
    get history() {
      return history.map(frame => ({ ...frame }));
    },
    isHeld: action => Boolean(current[action]),
    push,
    wasPressed: action => pressedThisFrame.has(action),
    wasReleased: action => releasedThisFrame.has(action),
  };
}

function clampAxis(value) {
  return Math.min(Math.max(value, -1), 1);
}
