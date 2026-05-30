// mobile-gate.mjs — Landscape gate + fullscreen prompt for Cockpit Swarm.
// Adapted from the Sumorai mobile-ui.js pattern.

function isTouchLike(win = globalThis.window) {
  if (!win) return false;
  return /Android|iPhone|iPad|iPod/i.test(win.navigator?.userAgent || '') ||
    !!win.matchMedia?.('(pointer: coarse)')?.matches;
}

function getMobileViewportState(win = globalThis.window, options = {}) {
  const doc = win?.document;
  const isTouch = !!options.force || isTouchLike(win);
  const isLandscape = (win?.innerWidth || 0) > (win?.innerHeight || 0);
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

export function initMobileLandscapeGate(options = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  if (document.getElementById('mobile-landscape-gate')) return null;

  let fullscreenRequested = false;
  const gate = document.createElement('div');
  gate.id = 'mobile-landscape-gate';
  gate.className = 'mobile-landscape-gate';
  gate.innerHTML = `
    <div class="mobile-landscape-gate-card">
      <div class="mobile-landscape-gate-kicker">Recommended Mobile Play</div>
      <div class="mobile-landscape-gate-title" data-mobile-gate-title>Rotate to Landscape</div>
      <div class="mobile-landscape-gate-copy" data-mobile-gate-copy>
        Cockpit Swarm needs a wide view for the cockpit and controls. Rotate your device, then enter fullscreen for the cleanest experience.
      </div>
      <button class="mobile-landscape-gate-btn" type="button" data-mobile-gate-action>Enter Fullscreen</button>
    </div>
  `;
  document.body.appendChild(gate);

  const title  = gate.querySelector('[data-mobile-gate-title]');
  const copy   = gate.querySelector('[data-mobile-gate-copy]');
  const action = gate.querySelector('[data-mobile-gate-action]');

  function requestFullscreenFn() {
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
    const status = getMobileViewportState(window, { force: options.force, fullscreenRequested });
    document.body.classList.toggle('mobile-play-gated', status.shouldGate);
    gate.classList.toggle('is-visible', status.shouldGate);
    gate.setAttribute('aria-hidden', status.shouldGate ? 'false' : 'true');

    if (!status.isTouch) {
      gate.classList.remove('is-visible');
      gate.setAttribute('aria-hidden', 'true');
      return status;
    }

    if (status.needsRotation) {
      title.textContent = 'Rotate to Landscape';
      copy.textContent  = 'Cockpit Swarm needs a wide view for the cockpit and controls. Rotate your device, then enter fullscreen for the cleanest experience.';
      action.textContent = status.fullscreenSupported ? 'Enter Fullscreen' : 'Ready';
    } else if (status.needsFullscreen) {
      title.textContent = 'Enter Fullscreen';
      copy.textContent  = 'Landscape is set. Enter fullscreen so the cockpit and touch controls have the full screen.';
      action.textContent = 'Enter Fullscreen';
    }

    return status;
  }

  action.addEventListener('click', async () => {
    fullscreenRequested = true;
    await requestFullscreenFn();
    await lockLandscape();
    update();
  });

  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  document.addEventListener('fullscreenchange', update);
  document.addEventListener('webkitfullscreenchange', update);
  update();

  return { gate, update };
}
