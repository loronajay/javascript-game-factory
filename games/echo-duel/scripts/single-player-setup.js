import { DEFAULT_SETTINGS } from "./config.js";
import { sanitizePenaltyWord, validatePenaltyWord } from "./validation.js";

function qs(id) {
  return document.getElementById(id);
}

function setError(message = "") {
  const errorEl = qs("single-player-error");
  if (!errorEl) return;
  if (!message) {
    errorEl.textContent = "";
    errorEl.classList.add("hidden");
    return;
  }
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
}

export function readSinglePlayerSettings() {
  const wordResult = validatePenaltyWord(sanitizePenaltyWord(qs("single-player-word")?.value || DEFAULT_SETTINGS.penaltyWord));
  return {
    penaltyWord: wordResult.word,
    valid: wordResult.ok,
    error: wordResult.error,
  };
}

export function wireSinglePlayerConfig({ onStart, onBack } = {}) {
  const wordEl = qs("single-player-word");

  wordEl?.addEventListener("input", () => setError(""));
  wordEl?.addEventListener("blur", () => {
    if (!wordEl) return;
    wordEl.value = sanitizePenaltyWord(wordEl.value || DEFAULT_SETTINGS.penaltyWord);
  });

  qs("btn-single-player-start")?.addEventListener("click", () => {
    const settings = readSinglePlayerSettings();
    if (!settings.valid) {
      setError(settings.error);
      return;
    }
    if (wordEl) wordEl.value = settings.penaltyWord;
    setError("");
    onStart?.(settings);
  });

  qs("btn-single-player-back")?.addEventListener("click", () => {
    setError("");
    onBack?.("menu");
  });
}
