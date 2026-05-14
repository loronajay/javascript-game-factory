const CONTROL_KEY_SPECS = {
  KeyW: { key: 'w', code: 'KeyW' },
  KeyA: { key: 'a', code: 'KeyA' },
  KeyS: { key: 's', code: 'KeyS' },
  KeyD: { key: 'd', code: 'KeyD' },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp' },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown' },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft' },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight' },
  ShiftLeft: { key: 'Shift', code: 'ShiftLeft' },
  Escape: { key: 'Escape', code: 'Escape' },
};

const MOBILE_CONTROL_PROFILES = {
  illuminauts: {
    id: 'illuminauts',
    layout: 'dpad-buttons',
    accent: '#6ee7d8',
    glow: '#7c4dff',
    dpadLabel: 'MOVE',
    dpad: {
      up: CONTROL_KEY_SPECS.KeyW,
      down: CONTROL_KEY_SPECS.KeyS,
      left: CONTROL_KEY_SPECS.KeyA,
      right: CONTROL_KEY_SPECS.KeyD,
    },
    buttons: [
      { id: 'sprint', label: 'RUN', key: CONTROL_KEY_SPECS.ShiftLeft },
    ],
  },
  'lovers-lost': {
    id: 'lovers-lost',
    layout: 'dual-dpad',
    accent: '#ff75b7',
    glow: '#ffd166',
    pads: [
      {
        id: 'boy',
        label: 'BOY',
        dpad: {
          up: CONTROL_KEY_SPECS.KeyW,
          down: CONTROL_KEY_SPECS.KeyS,
          left: CONTROL_KEY_SPECS.KeyA,
          right: CONTROL_KEY_SPECS.KeyD,
        },
        legends: { up: 'J', down: 'C', left: 'B', right: 'A' },
      },
      {
        id: 'girl',
        label: 'GIRL',
        dpad: {
          up: CONTROL_KEY_SPECS.ArrowUp,
          down: CONTROL_KEY_SPECS.ArrowDown,
          left: CONTROL_KEY_SPECS.ArrowLeft,
          right: CONTROL_KEY_SPECS.ArrowRight,
        },
        legends: { up: 'J', down: 'C', left: 'A', right: 'B' },
      },
    ],
  },
};

function normalizeKeySpec(spec) {
  if (!spec) return null;
  if (typeof spec === 'string') return CONTROL_KEY_SPECS[spec] || { key: spec, code: spec };
  return {
    key: spec.key || spec.code,
    code: spec.code || spec.key,
  };
}

function getDirectionKeys(direction, dpad) {
  const map = dpad || {};
  switch (direction) {
    case 'up': return [normalizeKeySpec(map.up)];
    case 'up-right': return [normalizeKeySpec(map.up), normalizeKeySpec(map.right)];
    case 'right': return [normalizeKeySpec(map.right)];
    case 'down-right': return [normalizeKeySpec(map.down), normalizeKeySpec(map.right)];
    case 'down': return [normalizeKeySpec(map.down)];
    case 'down-left': return [normalizeKeySpec(map.down), normalizeKeySpec(map.left)];
    case 'left': return [normalizeKeySpec(map.left)];
    case 'up-left': return [normalizeKeySpec(map.up), normalizeKeySpec(map.left)];
    default: return [];
  }
}

function resolveMobileControllerProfile(profileOrId) {
  if (typeof profileOrId === 'string') return MOBILE_CONTROL_PROFILES[profileOrId] || null;
  if (!profileOrId || typeof profileOrId !== 'object') return null;
  return profileOrId;
}

function createKeyboardDispatcher({ target, KeyboardEventCtor } = {}) {
  const eventTarget = target || globalThis.window;
  const EventCtor = KeyboardEventCtor || globalThis.KeyboardEvent;
  const held = new Set();

  function dispatch(type, spec) {
    const keySpec = normalizeKeySpec(spec);
    if (!eventTarget || !EventCtor || !keySpec?.key || !keySpec?.code) return false;
    const event = new EventCtor(type, {
      key: keySpec.key,
      code: keySpec.code,
      bubbles: true,
      cancelable: true,
    });
    eventTarget.dispatchEvent(event);
    return true;
  }

  function press(spec) {
    const keySpec = normalizeKeySpec(spec);
    if (!keySpec) return false;
    const id = `${keySpec.key}:${keySpec.code}`;
    if (held.has(id)) return false;
    held.add(id);
    return dispatch('keydown', keySpec);
  }

  function release(spec) {
    const keySpec = normalizeKeySpec(spec);
    if (!keySpec) return false;
    const id = `${keySpec.key}:${keySpec.code}`;
    if (!held.has(id)) return false;
    held.delete(id);
    return dispatch('keyup', keySpec);
  }

  function releaseAll() {
    for (const id of [...held]) {
      const [key, code] = id.split(':');
      release({ key, code });
    }
  }

  return { press, release, releaseAll, held };
}

function isMobileLike(win = globalThis.window) {
  if (!win) return false;
  return /Android|iPhone|iPad|iPod/i.test(win.navigator?.userAgent || '') ||
    !!win.matchMedia?.('(pointer: coarse)')?.matches;
}

function directionFromPoint(x, y, rect) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = x - cx;
  const dy = y - cy;
  const distance = Math.hypot(dx, dy);
  const radius = Math.min(rect.width, rect.height) / 2;
  if (distance < radius * 0.18) return null;

  const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
  const index = Math.round(angle / 45) % 8;
  return ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'][index];
}

function ensureStyle(doc, profile) {
  if (doc.getElementById('mobile-controller-style')) return;
  const style = doc.createElement('style');
  style.id = 'mobile-controller-style';
  style.textContent = `
    .mobile-controller {
      --mc-accent: ${profile.accent || '#00ffff'};
      --mc-glow: ${profile.glow || profile.accent || '#00ffff'};
      position: fixed;
      inset: 0;
      z-index: 999900;
      pointer-events: none;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
      touch-action: none;
      font-family: system-ui, sans-serif;
    }
    .mobile-controller__pad,
    .mobile-controller__button {
      position: absolute;
      pointer-events: auto;
      touch-action: none;
      color: var(--mc-accent);
      border: 2px solid color-mix(in srgb, var(--mc-accent) 82%, transparent);
      background:
        radial-gradient(circle at 50% 35%, rgba(255,255,255,0.14), transparent 34%),
        radial-gradient(circle at 50% 50%, rgba(0,0,0,0.28), rgba(0,0,0,0.52));
      box-shadow: 0 0 22px color-mix(in srgb, var(--mc-glow) 42%, transparent);
      backdrop-filter: blur(2px);
      box-sizing: border-box;
    }
    .mobile-controller__pad {
      width: min(29vmin, 220px);
      height: min(29vmin, 220px);
      min-width: 142px;
      min-height: 142px;
      border-radius: 50%;
    }
    .mobile-controller__pad::before {
      content: "";
      position: absolute;
      inset: 31%;
      border-radius: 50%;
      border: 2px solid color-mix(in srgb, var(--mc-accent) 72%, transparent);
      background: rgba(0, 0, 0, 0.26);
    }
    .mobile-controller__pad-label {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0;
      opacity: 0.76;
    }
    .mobile-controller__legend {
      position: absolute;
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      font-size: 13px;
      font-weight: 800;
      opacity: 0.78;
    }
    .mobile-controller__legend--up { left: calc(50% - 14px); top: 12%; }
    .mobile-controller__legend--down { left: calc(50% - 14px); bottom: 12%; }
    .mobile-controller__legend--left { left: 12%; top: calc(50% - 14px); }
    .mobile-controller__legend--right { right: 12%; top: calc(50% - 14px); }
    .mobile-controller__pad.is-active,
    .mobile-controller__button.is-active {
      box-shadow: 0 0 34px color-mix(in srgb, var(--mc-glow) 72%, transparent);
      background:
        radial-gradient(circle at 50% 35%, rgba(255,255,255,0.20), transparent 34%),
        radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--mc-glow) 20%, transparent), rgba(0,0,0,0.50));
    }
    .mobile-controller__button {
      width: min(15vmin, 96px);
      height: min(15vmin, 96px);
      min-width: 62px;
      min-height: 62px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      font-size: 18px;
      font-weight: 900;
    }
    @media (orientation: portrait) {
      .mobile-controller__pad {
        width: min(34vmin, 210px);
        height: min(34vmin, 210px);
      }
    }
  `;
  doc.head.appendChild(style);
}

function positionControl(el, placement) {
  Object.assign(el.style, {
    left: placement.left || '',
    right: placement.right || '',
    bottom: placement.bottom || '',
    top: placement.top || '',
  });
}

function createPad(doc, dispatcher, padConfig, placement) {
  const pad = doc.createElement('div');
  pad.className = 'mobile-controller__pad';
  positionControl(pad, placement);

  const label = doc.createElement('div');
  label.className = 'mobile-controller__pad-label';
  label.textContent = padConfig.label || '';
  pad.appendChild(label);

  const legends = padConfig.legends || {};
  for (const direction of ['up', 'down', 'left', 'right']) {
    const text = legends[direction];
    if (!text) continue;
    const legend = doc.createElement('div');
    legend.className = `mobile-controller__legend mobile-controller__legend--${direction}`;
    legend.textContent = text;
    pad.appendChild(legend);
  }

  let activeDirection = null;
  let activeKeys = [];
  let pointerId = null;

  function applyDirection(direction) {
    if (direction === activeDirection) return;
    for (const key of activeKeys) dispatcher.release(key);
    activeDirection = direction;
    activeKeys = getDirectionKeys(direction, padConfig.dpad).filter(Boolean);
    for (const key of activeKeys) dispatcher.press(key);
    pad.classList.toggle('is-active', !!activeDirection);
  }

  function updateFromEvent(event) {
    applyDirection(directionFromPoint(event.clientX, event.clientY, pad.getBoundingClientRect()));
  }

  function clear(event) {
    if (event && event.pointerId !== pointerId) return;
    pointerId = null;
    applyDirection(null);
  }

  pad.addEventListener('pointerdown', (event) => {
    pointerId = event.pointerId;
    pad.setPointerCapture?.(event.pointerId);
    updateFromEvent(event);
  });
  pad.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId) return;
    updateFromEvent(event);
  });
  pad.addEventListener('pointerup', clear);
  pad.addEventListener('pointercancel', clear);

  return pad;
}

function createFaceButton(doc, dispatcher, buttonConfig, placement) {
  const button = doc.createElement('div');
  button.className = 'mobile-controller__button';
  button.textContent = buttonConfig.label;
  positionControl(button, placement);

  let pointerId = null;
  const key = normalizeKeySpec(buttonConfig.key);

  function press(event) {
    pointerId = event.pointerId;
    button.setPointerCapture?.(event.pointerId);
    button.classList.add('is-active');
    dispatcher.press(key);
  }

  function release(event) {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    button.classList.remove('is-active');
    dispatcher.release(key);
  }

  button.addEventListener('pointerdown', press);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  return button;
}

function mountMobileController(options = {}) {
  const win = options.window || globalThis.window;
  const doc = options.document || win?.document;
  const profile = resolveMobileControllerProfile(options.profile || options.profileId);
  if (!win || !doc || !profile) return null;
  if (!options.force && !isMobileLike(win)) return null;
  if (doc.querySelector('[data-mobile-controller-root]')) return null;

  ensureStyle(doc, profile);
  const root = doc.createElement('div');
  root.className = 'mobile-controller';
  root.dataset.mobileControllerRoot = profile.id || 'custom';
  root.style.setProperty('--mc-accent', profile.accent || '#00ffff');
  root.style.setProperty('--mc-glow', profile.glow || profile.accent || '#00ffff');

  const dispatcher = options.dispatcher || createKeyboardDispatcher({
    target: options.target || win,
    KeyboardEventCtor: options.KeyboardEventCtor || win.KeyboardEvent,
  });

  if (profile.layout === 'dual-dpad') {
    const pads = profile.pads || [];
    if (pads[0]) root.appendChild(createPad(doc, dispatcher, pads[0], { left: '18px', bottom: '18px' }));
    if (pads[1]) root.appendChild(createPad(doc, dispatcher, pads[1], { right: '18px', bottom: '18px' }));
  } else {
    root.appendChild(createPad(doc, dispatcher, {
      label: profile.dpadLabel,
      dpad: profile.dpad,
    }, { left: '18px', bottom: '18px' }));

    const buttons = profile.buttons || [];
    buttons.forEach((button, index) => {
      root.appendChild(createFaceButton(doc, dispatcher, button, {
        right: `${18 + index * 78}px`,
        bottom: '28px',
      }));
    });
  }

  doc.body.appendChild(root);
  win.addEventListener?.('blur', dispatcher.releaseAll);
  return {
    root,
    dispatcher,
    destroy() {
      dispatcher.releaseAll();
      win.removeEventListener?.('blur', dispatcher.releaseAll);
      root.remove();
    },
  };
}

export {
  CONTROL_KEY_SPECS,
  MOBILE_CONTROL_PROFILES,
  createKeyboardDispatcher,
  getDirectionKeys,
  isMobileLike,
  mountMobileController,
  normalizeKeySpec,
  resolveMobileControllerProfile,
};
