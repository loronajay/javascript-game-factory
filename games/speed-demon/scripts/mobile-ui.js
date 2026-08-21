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

const BASE_LABELS = Object.freeze({
  gas: "GAS",
  shift: "CLUTCH",
  confirm: "GO",
  back: "BACK",
});

const DETAIL_CONTEXT = {
  setup: {
    title: "BUILD YOUR RUN",
    copy: "Tap any card to pick it. SELECT browses; CHOOSE locks each pane.",
    padLabel: "SELECT",
    confirm: "CHOOSE",
  },
  garage: {
    title: "TOUCH TO TUNE",
    copy: "Tap rows, swatches, and sliders directly. TUNE makes precise changes.",
    padLabel: "TUNE",
    confirm: "APPLY",
  },
  collection: {
    title: "CHOOSE A RIDE",
    copy: "Tap a car to take it to the line. Use SELECT when you want to browse.",
    padLabel: "SELECT",
    confirm: "CUSTOM",
  },
  campaign: {
    title: "PICK A STOP",
    copy: "Tap an open map node, then touch through the briefing when you are ready.",
    padLabel: "MAP",
    confirm: "OPEN",
  },
  profile: {
    title: "YOUR DRIVER",
    copy: "Tap a card row, portrait, or favourite. SELECT also moves through each grid.",
    padLabel: "SELECT",
    confirm: "CHOOSE",
  },
  online: {
    title: "ONLINE GARAGE",
    copy: "Tap a row or action directly. SELECT and CHOOSE work across every pane.",
    padLabel: "SELECT",
    confirm: "CHOOSE",
  },
  radio: {
    title: "TOUCH THE STEREO",
    copy: "Tap the faceplate and track rows directly, or use BROWSE and PLAY.",
    padLabel: "BROWSE",
    confirm: "PLAY",
  },
  boards: {
    title: "CHECK THE BOARDS",
    copy: "Tap a board tab or scroll arrow. BROWSE moves through the current list.",
    padLabel: "BROWSE",
    confirm: null,
  },
};

function playContext({
  id,
  group,
  title,
  copy,
  controls,
  padLabel = "MENU",
  labels = {},
}) {
  return {
    id,
    group,
    title,
    copy,
    controls: [...controls],
    padLabel,
    labels: { ...BASE_LABELS, ...labels },
  };
}

/**
 * Shapes the phone controls for the screen the cabinet is actually showing.
 * No game rule lives here: every visible control still emits the same key as
 * the desktop binding, but irrelevant buttons disappear and the remaining ones
 * say what they mean in the current context.
 */
export function getMobilePlayContext(state = {}) {
  const screen = state.screen || "title";

  if (screen === "versus") {
    return playContext({
      id: "versus",
      group: "versus",
      title: "READY?",
      copy: "Tap anywhere—or hit RACE—to pull up to the line.",
      controls: ["confirm"],
      labels: { confirm: "RACE" },
    });
  }

  if (screen === "race") {
    if (state.onlineResult) {
      return playContext({
        id: "online-result",
        group: "menu",
        title: "ROUND COMPLETE",
        copy: "Tap the result action, or use GO. BACK leaves the match.",
        controls: ["pad", "confirm", "back"],
      });
    }
    if (state.coach?.holding) {
      return playContext({
        id: `coach-${state.coach.step || "hold"}`,
        group: "coach",
        title: "CREW CHIEF",
        copy: "Read the coaching card, then tap GOT IT when you are ready.",
        controls: ["confirm", "back"],
        labels: { confirm: "GOT IT", back: "PAUSE" },
      });
    }
    if (state.runtime === "circuit") {
      return playContext({
        id: "race-circuit",
        group: "circuit",
        title: "CIRCUIT CONTROLS",
        copy: "Hold GAS with your right thumb. Steer with the pad; pull down to brake.",
        controls: ["pad", "gas", "back"],
        padLabel: "STEER / BRAKE",
        labels: { back: "PAUSE" },
      });
    }
    if (state.phase === "staging") {
      return playContext({
        id: "race-drag-staging",
        group: "drag",
        title: "STAGE THE CAR",
        copy: "Tap CLUTCH to stage. Wait for green, then hold GAS.",
        controls: ["pad", "gas", "shift", "back"],
        padLabel: "H-GATE",
        labels: { back: "PAUSE" },
      });
    }
    if (state.phase === "countdown") {
      return playContext({
        id: "race-drag-countdown",
        group: "drag",
        title: "WATCH THE TREE",
        copy: "Hold GAS when it turns green—not before.",
        controls: ["pad", "gas", "shift", "back"],
        padLabel: "H-GATE",
        labels: { back: "PAUSE" },
      });
    }
    return playContext({
      id: "race-drag-running",
      group: "drag",
      title: "NAIL THE SHIFT",
      copy: "Lift GAS · tap CLUTCH · trace the H-GATE · hold GAS to catch it.",
      controls: ["pad", "gas", "shift", "back"],
      padLabel: "H-GATE",
      labels: { back: "PAUSE" },
    });
  }

  if (DETAIL_CONTEXT[screen]) {
    const detail = DETAIL_CONTEXT[screen];
    return playContext({
      id: `detail-${screen}`,
      group: "detail",
      title: detail.title,
      copy: detail.copy,
      controls: detail.confirm ? ["pad", "confirm", "back"] : ["pad", "back"],
      padLabel: detail.padLabel,
      labels: { confirm: detail.confirm },
    });
  }

  const titleScreen = screen === "title";
  return playContext({
    id: `menu-${screen}`,
    group: "menu",
    title: titleScreen ? "TOUCH TO DRIVE" : screen === "paused" ? "PIT MENU" : "CHOOSE YOUR NEXT RUN",
    copy: "Tap a menu row directly, or use MENU and GO.",
    controls: titleScreen ? ["pad", "confirm"] : ["pad", "confirm", "back"],
  });
}

const INPUT_HINTS = {
  title: {
    desktop: {
      primary: "EVERY SHIFT:  LIFT off SPACE  ·  SHIFT clutch  ·  ARROWS gate  ·  SPACE again to catch it",
      secondary: "R restart a run   ESC back   B P N stereo   L repeat   - = volume   F folder",
    },
    mobile: {
      primary: "EVERY SHIFT:  LIFT GAS  ·  CLUTCH  ·  TRACE H-GATE  ·  GAS AGAIN TO CATCH",
      secondary: "TAP A MENU ROW  ·  TOUCH CONTROLS ADAPT WHEN YOU DRIVE",
    },
  },
  setup: {
    desktop: {
      promptPrefix: "ENTER",
      footer: "CLICK anything to pick it       ARROWS / WASD  move within a pane       ENTER  lock in       ESC  unlock / back       R  reset",
    },
    mobile: {
      promptPrefix: "CHOOSE",
      footer: "TAP any card to pick it       SELECT  browse       CHOOSE  lock in       BACK  unlock / leave",
    },
  },
  staging: {
    desktop: {
      steps: "EVERY SHIFT:  LIFT  ·  CLUTCH  ·  GATE  ·  CATCH",
      detail1: "release SPACE, press SHIFT, work the ARROWS,",
      detail2: "then press SPACE again as the clutch bites",
      action: "ENTER to stage — then SPACE the moment it turns green",
    },
    mobile: {
      steps: "EVERY SHIFT:  LIFT  ·  CLUTCH  ·  H-GATE  ·  CATCH",
      detail1: "release GAS, tap CLUTCH, trace the H-GATE,",
      detail2: "then hold GAS again as the clutch bites",
      action: "Tap CLUTCH to stage — hold GAS the moment it turns green",
    },
  },
  coach: {
    desktop: { continue: "ENTER to continue" },
    mobile: { continue: "Tap GOT IT to continue" },
  },
};

export function inputHintsFor(surface, { mobile = false } = {}) {
  const variants = INPUT_HINTS[surface];
  if (!variants) return {};
  return variants[mobile ? "mobile" : "desktop"];
}

export function mobileCoachLine(line) {
  return String(line ?? "")
    .replace(/Press ENTER/g, "Tap CLUTCH")
    .replace(/Hold SPACE/g, "Hold GAS")
    .replace(/Release SPACE/g, "Release GAS")
    .replace(/Press SPACE/g, "Hold GAS")
    .replace(/press SHIFT/g, "tap CLUTCH")
    .replace(/SPACE/g, "GAS")
    .replace(/SHIFT/g, "CLUTCH");
}

export function renderMobilePlayHelper() {
  return `
    <aside class="mobile-play-helper" aria-live="polite" aria-atomic="true">
      <span class="mobile-play-helper-kicker">PIT CREW</span>
      <strong class="mobile-play-helper-title" data-mobile-helper-title></strong>
      <span class="mobile-play-helper-copy" data-mobile-helper-copy></span>
    </aside>
  `;
}

/** Bind the static shared controller to Speed Demon's live screen state. */
export function initMobilePlayShell(options = {}) {
  const active = Boolean(options.active);
  const controller = options.controller;
  const getState = options.getState;
  const win = options.window || globalThis.window;
  const doc = options.document || win?.document;
  if (!active || !controller?.root || typeof getState !== "function" || !win || !doc) return null;

  const root = controller.root;
  root.setAttribute("aria-label", "Speed Demon touch controls");
  const pad = root.querySelector(".mobile-controller__pad");
  const padLabel = root.querySelector(".mobile-controller__pad-label");
  const buttons = [...root.querySelectorAll(".mobile-controller__button")];
  const buttonById = new Map();
  SPEED_DEMON_MOBILE_PROFILE.buttons.forEach((definition, index) => {
    const button = buttons[index];
    if (!button) return;
    button.dataset.mobileControl = definition.id;
    button.setAttribute("role", "button");
    buttonById.set(definition.id, button);
  });

  const host = doc.createElement("div");
  host.innerHTML = renderMobilePlayHelper().trim();
  const helper = host.firstElementChild;
  doc.body.appendChild(helper);
  const helperTitle = helper.querySelector("[data-mobile-helper-title]");
  const helperCopy = helper.querySelector("[data-mobile-helper-copy]");

  let frame = null;
  let helperTimer = null;
  let currentId = null;
  const helperDuration = Math.max(0, Number(options.helperDuration ?? 4800));

  function apply(context) {
    currentId = context.id;
    root.dataset.mobileContext = context.id;
    root.dataset.mobileContextGroup = context.group;
    doc.body.dataset.mobileContext = context.id;
    doc.body.dataset.mobileContextGroup = context.group;

    const visible = new Set(context.controls);
    if (pad) pad.hidden = !visible.has("pad");
    if (padLabel) padLabel.textContent = context.padLabel;
    for (const [id, button] of buttonById) {
      button.hidden = !visible.has(id);
      button.textContent = context.labels[id] || id.toUpperCase();
      button.setAttribute("aria-label", context.labels[id] || id);
    }

    helper.dataset.mobileHelperGroup = context.group;
    helperTitle.textContent = context.title;
    helperCopy.textContent = context.copy;
    helper.classList.add("is-visible");
    if (helperTimer !== null) win.clearTimeout(helperTimer);
    helperTimer = win.setTimeout(() => helper.classList.remove("is-visible"), helperDuration);
  }

  function update() {
    const context = getMobilePlayContext(getState() || {});
    if (context.id !== currentId) apply(context);
    frame = win.requestAnimationFrame(update);
  }

  apply(getMobilePlayContext(getState() || {}));
  frame = win.requestAnimationFrame(update);

  return {
    helper,
    update,
    destroy() {
      if (frame !== null) win.cancelAnimationFrame(frame);
      if (helperTimer !== null) win.clearTimeout(helperTimer);
      helper.remove();
      delete doc.body.dataset.mobileContext;
      delete doc.body.dataset.mobileContextGroup;
      delete root.dataset.mobileContext;
      delete root.dataset.mobileContextGroup;
    },
  };
}

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
