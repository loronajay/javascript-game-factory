function isTouchLike(win = globalThis.window) {
  if (!win) return false;
  return /Android|iPhone|iPad|iPod/i.test(win.navigator?.userAgent || "")
    || !!win.matchMedia?.("(pointer: coarse)")?.matches;
}

function getMobileViewportState(win = globalThis.window, options = {}) {
  const doc = win?.document;
  const isTouch = !!options.force || isTouchLike(win);
  const isLandscape = (win?.innerWidth || 0) > (win?.innerHeight || 0);
  const fullscreenElement = doc?.fullscreenElement || doc?.webkitFullscreenElement || null;
  const requestFullscreen = doc?.documentElement?.requestFullscreen || doc?.documentElement?.webkitRequestFullscreen;
  const fullscreenSupported = typeof requestFullscreen === "function";
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
    <div class="mobile-landscape-gate-card" role="dialog" aria-modal="true" aria-labelledby="mobile-gate-title">
      <div class="mobile-landscape-gate-kicker">Recommended Mobile Play</div>
      <div class="mobile-landscape-gate-title" id="mobile-gate-title" data-mobile-gate-title>Rotate to Landscape</div>
      <div class="mobile-landscape-gate-copy" data-mobile-gate-copy>
        Yam Bowling keeps the lane, bowler, and shot controls together in landscape. Rotate your device, then enter fullscreen for the cleanest approach.
      </div>
      <button class="mobile-landscape-gate-btn" type="button" data-mobile-gate-action>Enter Fullscreen</button>
    </div>
  `;
}

function initMobileLandscapeGate(options = {}) {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  if (document.getElementById("mobile-landscape-gate")) return null;

  let fullscreenRequested = false;
  const gate = document.createElement("div");
  gate.id = "mobile-landscape-gate";
  gate.className = "mobile-landscape-gate";
  gate.innerHTML = renderMobileLandscapeGate();
  document.body.appendChild(gate);

  const title = gate.querySelector("[data-mobile-gate-title]");
  const copy = gate.querySelector("[data-mobile-gate-copy]");
  const action = gate.querySelector("[data-mobile-gate-action]");

  function requestFullscreen() {
    const root = document.documentElement;
    const fn = root.requestFullscreen || root.webkitRequestFullscreen;
    if (typeof fn !== "function") return Promise.resolve(false);
    return Promise.resolve(fn.call(root)).then(() => true).catch(() => false);
  }

  function lockLandscape() {
    const orientation = window.screen?.orientation;
    const lock = orientation?.lock;
    if (typeof lock !== "function") return Promise.resolve(false);
    return Promise.resolve(lock.call(orientation, "landscape")).then(() => true).catch(() => false);
  }

  function update() {
    const status = getMobileViewportState(window, { force: options.force, fullscreenRequested });
    document.body.classList.toggle("mobile-play-gated", status.shouldGate);
    document.body.classList.toggle("mobile-landscape-ready", status.isTouch && status.isLandscape && !status.shouldGate);
    gate.classList.toggle("is-visible", status.shouldGate);
    gate.classList.toggle("needs-rotation", status.needsRotation);
    gate.setAttribute("aria-hidden", status.shouldGate ? "false" : "true");

    if (!status.isTouch) {
      gate.classList.remove("is-visible");
      gate.setAttribute("aria-hidden", "true");
      return status;
    }

    if (status.needsRotation) {
      title.textContent = "Rotate to Landscape";
      copy.textContent = "Yam Bowling keeps the lane, bowler, and shot controls together in landscape. Rotate your device, then enter fullscreen for the cleanest approach.";
      action.textContent = status.fullscreenSupported ? "Enter Fullscreen" : "Ready";
    } else if (status.needsFullscreen) {
      title.textContent = "Enter Fullscreen";
      copy.textContent = "Landscape is set. Fullscreen hides browser chrome so the lane and every shot control remain visible while you aim and charge.";
      action.textContent = "Enter Fullscreen";
    }

    return status;
  }

  action.addEventListener("click", async () => {
    fullscreenRequested = true;
    await requestFullscreen();
    await lockLandscape();
    update();
  });

  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", update);
  document.addEventListener("fullscreenchange", update);
  document.addEventListener("webkitfullscreenchange", update);
  update();

  return { gate, update };
}

export {
  getMobileViewportState,
  initMobileLandscapeGate,
  renderMobileLandscapeGate,
};
