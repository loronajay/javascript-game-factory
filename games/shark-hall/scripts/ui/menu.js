// The front door and the two modals.
//
// It owns which layer is up and which panel is open, and it asks `screens.js`
// — which is pure and tested — what those should be. Nothing here reads a class
// back off an element to decide anything, which is the habit that made the
// demo's back button behave differently depending on how you got there.
//
// EVERY BUTTON CLICKS. The click is fired here rather than at each call site, so
// a new menu button cannot forget to make a sound.

import {
  LAYER_MENU,
  LAYER_PAUSE,
  LAYER_RESULT,
  LAYER_TABLE,
  PANEL_HOW,
  PANEL_MAIN,
  PANEL_PLAY,
  PANEL_RULES,
  PANEL_SETTINGS,
  backTarget,
  escapeTarget,
  normalizePanel,
} from "./screens.js";
import { SELECTORS } from "./elements.js";
import { DIFFICULTIES } from "../sim/cpu.js";
import { MODE_CPU } from "../match/match.js";

export function createMenu({ elements, audio, settings, onStart, onResume, onRestart, onQuit, onSettingsChange }) {
  let layer = LAYER_MENU;
  let panel = PANEL_MAIN;
  /** Which layer the front door was opened from. Drives contextual back. */
  let cameFrom = LAYER_MENU;
  let selectedMode = MODE_CPU;
  let started = false;
  let paused = true;
  /** Set by `onPause`, so Escape and the header button take the same path. */
  let onPauseRequested = null;

  const panels = {
    [PANEL_MAIN]: elements.menuMain,
    [PANEL_PLAY]: elements.menuPlayPanel,
    [PANEL_HOW]: elements.menuHowPanel,
    [PANEL_RULES]: elements.menuRulesPanel,
    [PANEL_SETTINGS]: elements.menuSettingsPanel,
  };

  function paint() {
    elements.frontDoor?.classList.toggle("show", layer === LAYER_MENU);
    elements.pauseLayer?.classList.toggle("show", layer === LAYER_PAUSE);
    elements.resultLayer?.classList.toggle("show", layer === LAYER_RESULT);
    for (const [name, element] of Object.entries(panels)) element?.classList.toggle("active", name === panel);
    elements.difficultyWrap && (elements.difficultyWrap.style.display = selectedMode === MODE_CPU ? "block" : "none");
  }

  function go(nextLayer, nextPanel = panel) {
    layer = nextLayer;
    panel = normalizePanel(nextPanel);
    paint();
  }

  const click = (element, handler) =>
    element?.addEventListener("click", (event) => {
      audio?.unlock();
      audio?.click();
      handler(event);
    });

  // --- front door ---------------------------------------------------------
  click(elements.menuPlay, () => go(LAYER_MENU, PANEL_PLAY));
  click(elements.menuHow, () => go(LAYER_MENU, PANEL_HOW));
  click(elements.menuRules, () => go(LAYER_MENU, PANEL_RULES));
  click(elements.menuSettings, () => go(LAYER_MENU, PANEL_SETTINGS));

  for (const button of document.querySelectorAll(SELECTORS.menuBack)) {
    click(button, () => {
      const target = backTarget(cameFrom);
      cameFrom = LAYER_MENU;
      go(target.layer, target.panel);
    });
  }

  // --- mode and difficulty ------------------------------------------------
  const modeCards = [...document.querySelectorAll(SELECTORS.modeCard)];
  for (const card of modeCards) {
    const choose = () => {
      audio?.unlock();
      audio?.click();
      selectedMode = card.dataset.mode;
      for (const other of modeCards) other.classList.toggle("selected", other === card);
      paint();
    };
    card.addEventListener("click", choose);
    // The cards are divs with a button role, so they must answer to the keyboard
    // themselves — a real <button> would, and these have to earn it.
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      choose();
    });
  }

  const difficultyButtons = [...document.querySelectorAll(SELECTORS.difficultyButton)];
  const paintDifficulty = (id) => {
    for (const button of difficultyButtons) button.classList.toggle("active", button.dataset.difficulty === id);
  };
  for (const button of difficultyButtons) {
    click(button, () => {
      paintDifficulty(button.dataset.difficulty);
      onSettingsChange?.({ difficulty: button.dataset.difficulty });
    });
  }

  // --- settings -----------------------------------------------------------
  elements.guideSetting?.addEventListener("change", () => onSettingsChange?.({ guide: elements.guideSetting.value }));
  elements.cameraSetting?.addEventListener("change", () => onSettingsChange?.({ camera: elements.cameraSetting.value }));
  elements.musicSetting?.addEventListener("change", () => {
    audio?.unlock();
    onSettingsChange?.({ muted: elements.musicSetting.value === "off" });
  });

  // --- actions ------------------------------------------------------------
  click(elements.startMatch, () => {
    go(LAYER_TABLE, PANEL_MAIN);
    onStart?.(selectedMode);
  });
  click(elements.resumeBtn, () => {
    go(LAYER_TABLE);
    onResume?.();
  });
  click(elements.newRack, () => {
    go(LAYER_TABLE);
    onRestart?.();
  });
  click(elements.rematchBtn, () => {
    go(LAYER_TABLE);
    onRestart?.();
  });
  click(elements.pauseSettings, () => {
    cameFrom = LAYER_PAUSE;
    go(LAYER_MENU, PANEL_SETTINGS);
  });
  // Same detour as settings: the rules are looked up mid-rack, and Back has to
  // return the player to their paused match rather than to the main menu.
  click(elements.pauseRules, () => {
    cameFrom = LAYER_PAUSE;
    go(LAYER_MENU, PANEL_RULES);
  });
  click(elements.quitMenu, () => {
    cameFrom = LAYER_MENU;
    go(LAYER_MENU, PANEL_MAIN);
    onQuit?.();
  });
  click(elements.resultMenu, () => {
    cameFrom = LAYER_MENU;
    go(LAYER_MENU, PANEL_MAIN);
    onQuit?.();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const target = escapeTarget(layer, { started, paused });
    if (!target) return;
    event.preventDefault();
    if (target === LAYER_PAUSE && layer === LAYER_TABLE) onPauseRequested?.();
    else if (target === LAYER_TABLE) onResume?.();
    go(target, PANEL_MAIN);
  });

  // --- initial paint ------------------------------------------------------
  if (elements.guideSetting) elements.guideSetting.value = settings.guide;
  if (elements.cameraSetting) elements.cameraSetting.value = settings.camera;
  if (elements.musicSetting) elements.musicSetting.value = settings.muted ? "off" : "on";
  paintDifficulty(settings.difficulty || DIFFICULTIES[1].id);
  paint();

  return {
    get layer() {
      return layer;
    },

    /** Whether the table should be taking input. False whenever anything is over it. */
    isTableLive: () => layer === LAYER_TABLE,

    /** Keep the menu's copy of the match's shape in step, for Escape's decisions. */
    syncMatch(snapshot) {
      started = snapshot.started;
      paused = snapshot.paused;
    },

    /** Called by the match when someone wins. */
    showResult({ title, sub }) {
      if (elements.resultTitle) elements.resultTitle.textContent = title;
      if (elements.resultSub) elements.resultSub.textContent = sub;
      go(LAYER_RESULT, PANEL_MAIN);
    },

    showPause() {
      go(LAYER_PAUSE, PANEL_MAIN);
    },

    showTable() {
      go(LAYER_TABLE, PANEL_MAIN);
    },

    /** Wire the pause button's own path through the same layer logic. */
    onPause(handler) {
      onPauseRequested = handler;
    },
  };
}
