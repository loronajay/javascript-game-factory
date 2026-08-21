// Phone play shell.
//
// The game itself keeps one input path: the shared mobile controller emits the
// same keyboard events as a physical keyboard, and `input.js` remains the only
// place that turns controls into actions. This module owns only the phone
// posture/fullscreen gate and Speed Demon's control labels.

const key = (value, code = value) => ({ key: value, code });

export const SPEED_DEMON_MOBILE_PROFILE = {
  id: "speed-demon-touch",
  layout: "dpad-buttons",
  accent: "#ff5a2e",
  glow: "#ffb21c",
  dpadLabel: "STEER / GATE",
  directionMode: "cardinal",
  dpad: {
    up: key("ArrowUp"),
    down: key("ArrowDown"),
    left: key("ArrowLeft"),
    right: key("ArrowRight"),
  },
  buttons: [
    { id: "gas", label: "GAS", key: key(" ", "Space") },
    { id: "shift", label: "SHIFT", key: key("Shift", "ShiftLeft") },
    { id: "confirm", label: "OK", key: key("Enter") },
    { id: "back", label: "BACK", key: key("Escape") },
  ],
};

export function isTouchLike(win = globalThis.window) {
  if (!win) return false;
  const userAgent = win.navigator?.userAgent || "";
  const iPadDesktopMode = /Macintosh/i.test(userAgent) && (win.navigator?.maxTouchPoints || 0) > 1;
  return /Android|iPhone|iPad|iPod/i.test(userAgent)
    || iPadDesktopMode
    || Boolean(win.matchMedia?.("(pointer: coarse)")?.matches);
}

export function getMobileViewportState(win = globalThis.window, options = {}) {
  const doc = win?.document;
  const isTouch = Boolean(options.force) || isTouchLike(win);
  const isLandscape = (win?.innerWidth || 0) > (win?.innerHeight || 0);
  const fullscreenElement = doc?.fullscreenElement || doc?.webkitFullscreenElement || null;
  const requestFullscreen = doc?.documentElement?.requestFullscreen
    || doc?.documentElement?.webkitRequestFullscreen;
  const fullscreenSupported = typeof requestFullscreen === "function";
  const fullscreenRequested = Boolean(options.fullscreenRequested);
  const needsRotation = isTouch && !isLandscape;
  const needsFullscreen = isTouch
    && isLandscape
    && fullscreenSupported
    && !fullscreenElement
    && !fullscreenRequested;

  return {
    isTouch,
    isLandscape,
    fullscreenSupported,
    fullscreenActive: Boolean(fullscreenElement),
    fullscreenRequested,
    needsRotation,
    needsFullscreen,
    shouldGate: needsRotation || needsFullscreen,
  };
}

export function renderMobileLandscapeGate() {
  return `
    <div class="mobile-landscape-gate-card" role="dialog" aria-modal="true" aria-labelledby="mobile-gate-title">
      <div class="mobile-landscape-gate-kicker">Recommended Mobile Play</div>
      <div class="mobile-landscape-gate-title" id="mobile-gate-title" data-mobile-gate-title>Rotate to Landscape</div>
      <div class="mobile-landscape-gate-copy" data-mobile-gate-copy>
        Speed Demon is built for a wide racing view. Rotate your phone, then enter fullscreen so the track, gauges, and touch controls all stay in reach.
      </div>
      <button class="mobile-landscape-gate-btn" type="button" data-mobile-gate-action>Enter Fullscreen</button>
    </div>
  `;
}

export function initMobileLandscapeGate(options = {}) {
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
    const orientation = globalThis.screen?.orientation;
    const lock = orientation?.lock;
    if (typeof lock !== "function") return Promise.resolve(false);
    return Promise.resolve(lock.call(orientation, "landscape")).then(() => true).catch(() => false);
  }

  function update() {
    const status = getMobileViewportState(window, {
      force: options.force,
      fullscreenRequested,
    });
    document.body.classList.toggle("mobile-play-gated", status.shouldGate);
    document.body.classList.toggle(
      "mobile-landscape-ready",
      status.isTouch && status.isLandscape && !status.shouldGate,
    );
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
      copy.textContent = "Speed Demon needs a wide view for the road, gauges, shifter, and touch controls. Rotate your phone, then tap below for the cleanest run.";
      action.textContent = status.fullscreenSupported ? "Enter Fullscreen" : "Ready to Race";
    } else if (status.needsFullscreen) {
      title.textContent = "Enter Fullscreen";
      copy.textContent = "Landscape is set. Fullscreen hides browser chrome so the full dashboard and every touch control stay in reach.";
      action.textContent = "Enter Fullscreen";
    }

    return status;
  }

  async function activate() {
    fullscreenRequested = true;
    await requestFullscreen();
    await lockLandscape();
    update();
  }

  action.addEventListener("click", activate);
  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", update);
  document.addEventListener("fullscreenchange", update);
  document.addEventListener("webkitfullscreenchange", update);
  update();

  return {
    gate,
    update,
    destroy() {
      action.removeEventListener("click", activate);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("webkitfullscreenchange", update);
      document.body.classList.remove("mobile-play-gated", "mobile-landscape-ready");
      gate.remove();
    },
  };
}
