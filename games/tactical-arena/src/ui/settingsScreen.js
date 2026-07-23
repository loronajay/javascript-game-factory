// The Settings overlay: audio/theme/battery toggles, a hidden cheat-code test
// hook, and the two-press reset-progress confirmation. Extracted from menuFlow.js; the menu
// router injects the cross-screen refresh + reset side effects.

import { THEMES, applyTheme, loadSavedThemeId, saveThemeId } from "./themes.js";
import {
  applyPerformanceMode,
  loadPerformanceMode,
  savePerformanceMode,
} from "./performanceSettings.js";
import { applyCheatCode } from "../progression/cheatCodes.js";
import { resetProgressionAnnouncements } from "../progression/announcements.js";
import { resetCampaignProgress } from "../campaign/campaign.js";
import { resetCampaignOnServer } from "../platform/gameProgressClient.js";

const RESET_PROGRESS_IDLE_LABEL = "Reset Progress";
const RESET_PROGRESS_CONFIRM_LABEL = "Confirm Reset";
const RESET_PROGRESS_WARNING = "Press Confirm Reset again to erase mission progress only. Unit unlocks, Valor, tutorials, and owned skins stay saved.";
const RESET_PROGRESS_CONFIRM_MS = 6000;

// Two-press confirmation state machine for the destructive reset. Pure (no DOM
// lookups of its own) so node tests can drive it with fake timers.
export function createResetProgressConfirmation({
  button,
  status,
  onArm,
  onConfirm,
  idleLabel = RESET_PROGRESS_IDLE_LABEL,
  confirmLabel = RESET_PROGRESS_CONFIRM_LABEL,
  warningText = RESET_PROGRESS_WARNING,
  timeoutMs = RESET_PROGRESS_CONFIRM_MS,
  setTimeoutFn = globalThis.setTimeout.bind(globalThis),
  clearTimeoutFn = globalThis.clearTimeout.bind(globalThis),
} = {}) {
  let armed = false;
  let timer = null;

  function clearTimer() {
    if (timer !== null) clearTimeoutFn(timer);
    timer = null;
  }

  function render() {
    if (button) {
      button.textContent = armed ? confirmLabel : idleLabel;
      button.classList?.toggle("is-confirming", armed);
      button.setAttribute?.("aria-pressed", String(armed));
    }
  }

  function disarm({ clearStatus = false } = {}) {
    clearTimer();
    armed = false;
    render();
    if (clearStatus && status) status.textContent = "";
  }

  function arm() {
    clearTimer();
    armed = true;
    onArm?.();
    render();
    if (status) status.textContent = warningText;
    timer = setTimeoutFn(() => disarm(), timeoutMs);
  }

  function requestReset() {
    if (!armed) {
      arm();
      return false;
    }
    disarm();
    onConfirm?.();
    return true;
  }

  render();
  return { requestReset, disarm, get armed() { return armed; } };
}

export function resetLocalMissionProgress({
  storage = globalThis.localStorage,
  onProgressReset = () => {},
  refreshUnlockedScreens = () => {},
} = {}) {
  const campaignProgress = resetCampaignProgress(storage);
  onProgressReset();
  refreshUnlockedScreens();
  return { campaignProgress };
}

export function createSettingsScreen({
  audio,
  syncMusic = () => {},
  refreshUnlockedScreens = () => {},
  onProgressReset = () => {},
} = {}) {
  const $ = (sel, root = document) => root.querySelector(sel);
  const settingsModal = $("#settingsModal");
  const soundToggle = $("#setSoundToggle", settingsModal);
  const sfxRange = $("#setSfxVolume", settingsModal);
  const musicRange = $("#setMusicVolume", settingsModal);
  const themeSelect = $("#setTheme", settingsModal);
  const batterySaverToggle = $("#setBatterySaver", settingsModal);
  const resetProgressBtn = $("#setResetProgressBtn", settingsModal);
  const progressStatus = $("#setProgressStatus", settingsModal);
  const cheatCodeForm = $("#setCheatCodeForm", settingsModal);
  const cheatCodeInput = $("#setCheatCode", settingsModal);
  const cheatCodeStatus = $("#setCheatCodeStatus", settingsModal);
  let progressStatusTimer = null;
  const resetProgressConfirmation = createResetProgressConfirmation({
    button: resetProgressBtn,
    status: progressStatus,
    onArm: () => {
      window.clearTimeout(progressStatusTimer);
      progressStatusTimer = null;
    },
    onConfirm: resetLocalProgress,
    timeoutMs: RESET_PROGRESS_CONFIRM_MS,
  });

  // Palette list comes straight from the registry so a new theme in themes.js
  // shows up here with no markup change. Applied live + persisted on change.
  for (const theme of THEMES) {
    const option = document.createElement("option");
    option.value = theme.id;
    option.textContent = theme.label;
    themeSelect.append(option);
  }
  themeSelect.addEventListener("change", () => {
    applyTheme(themeSelect.value);
    saveThemeId(themeSelect.value);
  });

  function openSettings() {
    soundToggle.checked = audio.enabled !== false;
    sfxRange.value = String(Math.round((audio.volume ?? 0.85) * 100));
    musicRange.value = String(Math.round((audio.musicVolume ?? 0.32) * 100));
    themeSelect.value = loadSavedThemeId();
    batterySaverToggle.checked = loadPerformanceMode() === "balanced";
    resetProgressConfirmation.disarm({ clearStatus: true });
    cheatCodeInput.value = "";
    cheatCodeStatus.textContent = "";
    settingsModal.hidden = false;
  }
  function closeSettings() {
    resetProgressConfirmation.disarm({ clearStatus: true });
    cheatCodeInput.value = "";
    cheatCodeStatus.textContent = "";
    settingsModal.hidden = true;
  }

  function submitCheatCode(event) {
    event.preventDefault();
    const result = applyCheatCode(globalThis.localStorage, cheatCodeInput.value);
    cheatCodeInput.value = "";
    if (!result.accepted) {
      cheatCodeStatus.textContent = "Code not recognized.";
      return;
    }
    resetProgressionAnnouncements(globalThis.localStorage);
    cheatCodeStatus.textContent = "Everything unlocked: missions, units, tutorials, and skins.";
    refreshUnlockedScreens();
  }

  function resetLocalProgress() {
    resetLocalMissionProgress({
      storage: globalThis.localStorage,
      onProgressReset,
      refreshUnlockedScreens,
    });
    // Best-effort: clear the account's campaign mission rows server-side too so the
    // server state matches the local reset. Valor / unlocks / skins are preserved by
    // the endpoint. No-op for guests or when the platform client is unavailable.
    void resetCampaignOnServer();
    if (progressStatus) {
      progressStatus.textContent = "Mission progress reset. Unit unlocks, Valor, tutorials, and owned skins were preserved.";
      window.clearTimeout(progressStatusTimer);
      progressStatusTimer = window.setTimeout(() => { progressStatus.textContent = ""; }, 3600);
    }
  }

  soundToggle.addEventListener("change", () => {
    audio.setEnabled(soundToggle.checked);
    syncMusic();
  });
  batterySaverToggle.addEventListener("change", () => {
    const mode = batterySaverToggle.checked ? "balanced" : "full";
    applyPerformanceMode(mode);
    savePerformanceMode(mode);
  });
  sfxRange.addEventListener("input", () => audio.setVolume(Number(sfxRange.value) / 100));
  musicRange.addEventListener("input", () => audio.setMusicVolume(Number(musicRange.value) / 100));
  $("#setCloseBtn", settingsModal).addEventListener("click", closeSettings);
  cheatCodeForm?.addEventListener("submit", submitCheatCode);
  resetProgressBtn?.addEventListener("click", resetProgressConfirmation.requestReset);
  settingsModal.addEventListener("click", (event) => { if (event.target === settingsModal) closeSettings(); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !settingsModal.hidden) closeSettings();
  });

  return { openSettings, closeSettings };
}
