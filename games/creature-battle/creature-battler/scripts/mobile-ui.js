function renderControlHint(desktopText, touchText) {
  return `
    <span class="control-hint-desktop">${desktopText}</span>
    <span class="control-hint-touch">${touchText}</span>
  `;
}

function renderTouchActionBar(actions) {
  if (!actions || !actions.length) return '';
  return `
    <div class="touch-action-bar">
      ${actions.map(action => `
        <button class="touch-action-btn ${action.primary ? 'touch-action-primary' : ''}"
                type="button"
                data-touch-action="${action.id}">
          ${action.label}
        </button>
      `).join('')}
    </div>
  `;
}

function bindTouchActionBar(root, handlers) {
  if (!root || !handlers) return;
  root.querySelectorAll('[data-touch-action]').forEach(button => {
    const handler = handlers[button.dataset.touchAction];
    if (!handler) return;
    button.addEventListener('click', event => {
      event.stopPropagation();
      handler(event);
    });
  });
}

function getMobileViewportState(win = window, options = {}) {
  const doc = win.document;
  const isTouch = /Android|iPhone|iPad|iPod/i.test(win.navigator?.userAgent || '') ||
    !!win.matchMedia?.('(pointer: coarse)')?.matches;
  const isLandscape = win.innerWidth > win.innerHeight;
  const fullscreenElement = doc?.fullscreenElement || doc?.webkitFullscreenElement || null;
  const requestFullscreen = doc?.documentElement?.requestFullscreen || doc?.documentElement?.webkitRequestFullscreen;
  const fullscreenSupported = typeof requestFullscreen === 'function';
  const fullscreenRequested = !!options.fullscreenRequested;
  const needsRotation = isTouch && !isLandscape;
  const needsFullscreen = isTouch && isLandscape && fullscreenSupported && !fullscreenElement && !fullscreenRequested;

  return {
    isTouch,
    isLandscape,
    fullscreenSupported,
    fullscreenActive: !!fullscreenElement,
    fullscreenRequested,
    needsRotation,
    needsFullscreen,
    shouldGate: needsRotation || needsFullscreen,
  };
}

function renderMobileLandscapeGate() {
  return `
    <div class="mobile-landscape-gate-card">
      <div class="mobile-landscape-gate-kicker">Recommended Mobile Play</div>
      <div class="mobile-landscape-gate-title" data-mobile-gate-title>Rotate to Landscape</div>
      <div class="mobile-landscape-gate-copy" data-mobile-gate-copy>
        Creature Battler is built for a wide battle view. Rotate your device, then enter fullscreen for the cleanest menu and battle layout.
      </div>
      <button class="mobile-landscape-gate-btn" type="button" data-mobile-gate-action>Enter Fullscreen</button>
    </div>
  `;
}

function initMobileLandscapeGate() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  if (document.getElementById('mobile-landscape-gate')) return null;

  let fullscreenRequested = false;
  const gate = document.createElement('div');
  gate.id = 'mobile-landscape-gate';
  gate.className = 'mobile-landscape-gate';
  gate.innerHTML = renderMobileLandscapeGate();
  document.body.appendChild(gate);

  const title = gate.querySelector('[data-mobile-gate-title]');
  const copy = gate.querySelector('[data-mobile-gate-copy]');
  const action = gate.querySelector('[data-mobile-gate-action]');

  function requestFullscreen() {
    const root = document.documentElement;
    const fn = root.requestFullscreen || root.webkitRequestFullscreen;
    if (typeof fn !== 'function') return Promise.resolve(false);
    return Promise.resolve(fn.call(root)).then(() => true).catch(() => false);
  }

  function lockLandscape() {
    const lock = screen.orientation?.lock;
    if (typeof lock !== 'function') return Promise.resolve(false);
    return Promise.resolve(lock.call(screen.orientation, 'landscape')).then(() => true).catch(() => false);
  }

  function update() {
    const status = getMobileViewportState(window, { fullscreenRequested });
    document.body.classList.toggle('mobile-play-gated', status.shouldGate);
    gate.classList.toggle('is-visible', status.shouldGate);
    gate.classList.toggle('needs-rotation', status.needsRotation);
    gate.setAttribute('aria-hidden', status.shouldGate ? 'false' : 'true');

    if (!status.isTouch) {
      gate.classList.remove('is-visible');
      gate.setAttribute('aria-hidden', 'true');
      return status;
    }

    if (status.needsRotation) {
      title.textContent = 'Rotate to Landscape';
      copy.textContent = 'Creature Battler is built for a wide battle view. Rotate your device, then enter fullscreen for the cleanest menu and battle layout.';
      action.textContent = status.fullscreenSupported ? 'Enter Fullscreen' : 'Ready';
    } else if (status.needsFullscreen) {
      title.textContent = 'Enter Fullscreen';
      copy.textContent = 'Landscape is set. Fullscreen hides browser chrome so the menus and battle commands have the room they need.';
      action.textContent = 'Enter Fullscreen';
    }

    return status;
  }

  action.addEventListener('click', async () => {
    fullscreenRequested = true;
    await requestFullscreen();
    await lockLandscape();
    if (typeof scaleCanvas === 'function') scaleCanvas();
    update();
  });

  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  document.addEventListener('fullscreenchange', update);
  document.addEventListener('webkitfullscreenchange', update);
  update();

  return {
    gate,
    update,
  };
}

if (typeof window !== 'undefined') {
  window.renderControlHint = renderControlHint;
  window.renderTouchActionBar = renderTouchActionBar;
  window.bindTouchActionBar = bindTouchActionBar;
  window.getMobileViewportState = getMobileViewportState;
  window.renderMobileLandscapeGate = renderMobileLandscapeGate;
  window.initMobileLandscapeGate = initMobileLandscapeGate;
}
