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
    directionMode: 'cardinal',
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
        directionMode: 'cardinal',
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
        directionMode: 'cardinal',
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

function normalizeAngle(angle) {
  return (angle % 360 + 360) % 360;
}

function shortestAngleDelta(a, b) {
  let delta = normalizeAngle(a - b);
  if (delta > 180) delta -= 360;
  return delta;
}

function directionCenter(direction) {
  switch (direction) {
    case 'right': return 0;
    case 'down-right': return 45;
    case 'down': return 90;
    case 'down-left': return 135;
    case 'left': return 180;
    case 'up-left': return 225;
    case 'up': return 270;
    case 'up-right': return 315;
    default: return null;
  }
}

function angleToDirection(angle, mode = 'eight-way') {
  const zones = mode === 'cardinal'
    ? [
        ['right', 0, 44],
        ['down', 90, 44],
        ['left', 180, 44],
        ['up', 270, 44],
      ]
    : [
        ['right', 0, 26],
        ['down-right', 45, 18],
        ['down', 90, 26],
        ['down-left', 135, 18],
        ['left', 180, 26],
        ['up-left', 225, 18],
        ['up', 270, 26],
        ['up-right', 315, 18],
      ];

  let bestDirection = null;
  let bestDistance = Infinity;
  for (const [direction, center, half] of zones) {
    const distance = Math.abs(shortestAngleDelta(angle, center));
    if (distance <= half) return direction;
    if (distance < bestDistance) {
      bestDirection = direction;
      bestDistance = distance;
    }
  }
  return bestDirection;
}

function directionFromPoint(x, y, rect, options = {}) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = x - cx;
  const dy = y - cy;
  const distance = Math.hypot(dx, dy);
  const radius = Math.min(rect.width, rect.height) / 2;
  if (distance < radius * 0.22) return null;
  if (distance > radius * 1.12) return options.activeDirection || null;

  const angle = normalizeAngle(Math.atan2(dy, dx) * 180 / Math.PI);
  const candidate = angleToDirection(angle, options.mode);
  const activeCenter = directionCenter(options.activeDirection);
  const candidateCenter = directionCenter(candidate);

  if (activeCenter !== null && candidateCenter !== null && candidate !== options.activeDirection) {
    const activeError = Math.abs(shortestAngleDelta(angle, activeCenter));
    const candidateError = Math.abs(shortestAngleDelta(angle, candidateCenter));
    if (candidateError + 10 >= activeError) return options.activeDirection;
  }

  return candidate;
}

function polarPoint(cx, cy, radius, angleDeg) {
  const radians = angleDeg * Math.PI / 180;
  return {
    x: cx + Math.cos(radians) * radius,
    y: cy + Math.sin(radians) * radius,
  };
}

function ringSegmentPath(cx, cy, innerRadius, outerRadius, startDeg, endDeg) {
  const startOuter = polarPoint(cx, cy, outerRadius, startDeg);
  const endOuter = polarPoint(cx, cy, outerRadius, endDeg);
  const startInner = polarPoint(cx, cy, innerRadius, endDeg);
  const endInner = polarPoint(cx, cy, innerRadius, startDeg);
  const sweep = normalizeAngle(endDeg - startDeg);
  const largeArc = sweep > 180 ? 1 : 0;

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${endInner.x} ${endInner.y}`,
    'Z',
  ].join(' ');
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
      overflow: hidden;
    }
    .mobile-controller__pad::before {
      content: "";
      position: absolute;
      inset: 31%;
      border-radius: 50%;
      border: 2px solid color-mix(in srgb, var(--mc-accent) 72%, transparent);
      background: rgba(0, 0, 0, 0.26);
      z-index: 5;
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
      z-index: 8;
    }
    .mobile-controller__ring {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
      pointer-events: none;
      z-index: 2;
    }
    .mobile-controller__segment {
      fill: var(--mc-accent);
      opacity: 0.055;
      transition: opacity 0.04s linear, filter 0.04s linear;
    }
    .mobile-controller__segment.is-active {
      opacity: 0.48;
      filter: drop-shadow(0 0 18px var(--mc-glow));
    }
    .mobile-controller__divider {
      stroke: var(--mc-accent);
      stroke-width: 1.4;
      stroke-linecap: round;
      opacity: 0.28;
    }
    .mobile-controller__arrow {
      position: absolute;
      display: grid;
      place-items: center;
      width: 18px;
      height: 18px;
      color: var(--mc-accent);
      opacity: 0.78;
      pointer-events: none;
      z-index: 7;
    }
    .mobile-controller__arrow::before {
      content: "";
      width: 0;
      height: 0;
      border-left: 7px solid transparent;
      border-right: 7px solid transparent;
      border-bottom: 13px solid currentColor;
      filter: drop-shadow(0 0 5px var(--mc-glow));
    }
    .mobile-controller__thumb {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 15%;
      height: 15%;
      min-width: 18px;
      min-height: 18px;
      border-radius: 50%;
      border: 2px solid var(--mc-accent);
      background: color-mix(in srgb, var(--mc-glow) 18%, transparent);
      box-shadow: 0 0 18px color-mix(in srgb, var(--mc-glow) 58%, transparent);
      opacity: 0;
      transform: translate(-50%, -50%);
      transition: opacity 0.04s linear;
      pointer-events: none;
      z-index: 9;
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
      z-index: 8;
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

  const ringSize = 220;
  const center = ringSize / 2;
  const outerRadius = ringSize * 0.485;
  const innerRadius = ringSize * 0.20;
  const zones = [
    { direction: 'right', center: 0, half: 26, rotation: 90 },
    { direction: 'down-right', center: 45, half: 18, rotation: 135 },
    { direction: 'down', center: 90, half: 26, rotation: 180 },
    { direction: 'down-left', center: 135, half: 18, rotation: 225 },
    { direction: 'left', center: 180, half: 26, rotation: 270 },
    { direction: 'up-left', center: 225, half: 18, rotation: 315 },
    { direction: 'up', center: 270, half: 26, rotation: 0 },
    { direction: 'up-right', center: 315, half: 18, rotation: 45 },
  ];

  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('mobile-controller__ring');
  svg.setAttribute('viewBox', `0 0 ${ringSize} ${ringSize}`);
  const segmentByDirection = new Map();
  for (const zone of zones) {
    const segment = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    segment.classList.add('mobile-controller__segment');
    segment.dataset.direction = zone.direction;
    segment.setAttribute('d', ringSegmentPath(
      center,
      center,
      innerRadius,
      outerRadius,
      zone.center - zone.half,
      zone.center + zone.half,
    ));
    svg.appendChild(segment);
    segmentByDirection.set(zone.direction, segment);

    for (const angle of [zone.center - zone.half, zone.center + zone.half]) {
      const p1 = polarPoint(center, center, innerRadius, angle);
      const p2 = polarPoint(center, center, outerRadius, angle);
      const divider = doc.createElementNS('http://www.w3.org/2000/svg', 'line');
      divider.classList.add('mobile-controller__divider');
      divider.setAttribute('x1', p1.x);
      divider.setAttribute('y1', p1.y);
      divider.setAttribute('x2', p2.x);
      divider.setAttribute('y2', p2.y);
      svg.appendChild(divider);
    }
  }
  pad.appendChild(svg);

  for (const zone of zones) {
    const point = polarPoint(50, 50, 31, zone.center);
    const arrow = doc.createElement('div');
    arrow.className = 'mobile-controller__arrow';
    arrow.style.left = `calc(${point.x}% - 9px)`;
    arrow.style.top = `calc(${point.y}% - 9px)`;
    arrow.style.transform = `rotate(${zone.rotation}deg)`;
    pad.appendChild(arrow);
  }

  const thumb = doc.createElement('div');
  thumb.className = 'mobile-controller__thumb';
  pad.appendChild(thumb);

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
  let thumbVisible = false;
  let thumbX = 0;
  let thumbY = 0;

  function setThumbFromEvent(event) {
    const rect = pad.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    const radius = Math.min(rect.width, rect.height) * 0.39;
    const distance = Math.hypot(dx, dy);
    const scale = distance > radius && distance > 0 ? radius / distance : 1;
    thumbVisible = true;
    thumbX = dx * scale;
    thumbY = dy * scale;
  }

  function renderPadState() {
    pad.classList.toggle('is-active', !!activeDirection);
    for (const segment of segmentByDirection.values()) segment.classList.remove('is-active');
    if (activeDirection) {
      segmentByDirection.get(activeDirection)?.classList.add('is-active');
    }
    thumb.style.opacity = thumbVisible ? '1' : '0';
    thumb.style.transform = thumbVisible
      ? `translate(calc(-50% + ${thumbX}px), calc(-50% + ${thumbY}px))`
      : 'translate(-50%, -50%)';
  }

  function applyDirection(direction) {
    if (direction === activeDirection) return;
    for (const key of activeKeys) dispatcher.release(key);
    activeDirection = direction;
    activeKeys = getDirectionKeys(direction, padConfig.dpad).filter(Boolean);
    for (const key of activeKeys) dispatcher.press(key);
    renderPadState();
  }

  function updateFromEvent(event) {
    setThumbFromEvent(event);
    applyDirection(directionFromPoint(event.clientX, event.clientY, pad.getBoundingClientRect(), {
      activeDirection,
      mode: padConfig.directionMode || 'eight-way',
    }));
    renderPadState();
  }

  function clear(event) {
    if (event && event.pointerId !== pointerId) return;
    pointerId = null;
    thumbVisible = false;
    applyDirection(null);
    renderPadState();
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
