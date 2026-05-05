import { DEFAULT_SETTINGS } from './config.js';
import { clampPlayerCount, sanitizePenaltyWord, validatePenaltyWord } from './validation.js';
import { showScreen } from './renderer.js';

function qs(id) { return document.getElementById(id); }

function cleanWordForSubmit(value) {
  return sanitizePenaltyWord(value || DEFAULT_SETTINGS.penaltyWord);
}

export function readOnlineLobbySettings() {
  const minPlayers = clampPlayerCount(qs('online-min-players')?.value, 2, 6);
  const maxPlayers = clampPlayerCount(qs('online-max-players')?.value, minPlayers, 6);
  const wordResult = validatePenaltyWord(cleanWordForSubmit(qs('online-word')?.value));
  return { minPlayers, maxPlayers, penaltyWord: wordResult.word, valid: wordResult.ok, error: wordResult.error };
}

export function wireOnlineConfig({ onCreatePublic, onFindPublic, onPrivate, onBack }) {
  const minEl = qs('online-min-players');
  const maxEl = qs('online-max-players');
  const wordEl = qs('online-word');
  const errorEl = qs('online-error');
  const titleEl = qs('online-config-title');
  const submitEl = qs('btn-online-public-start');
  let mode = 'create-public';

  function setError(message = '') {
    if (!errorEl) return;
    if (!message) {
      errorEl.textContent = '';
      errorEl.classList.add('hidden');
      return;
    }
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  }

  function refreshLimits() {
    const min = clampPlayerCount(minEl?.value, 2, 6);
    const max = clampPlayerCount(maxEl?.value, min, 6);
    if (minEl) minEl.value = String(min);
    if (maxEl) maxEl.value = String(max);
  }

  function configure(nextMode) {
    mode = nextMode === 'private' ? 'private' : 'create-public';
    if (titleEl) titleEl.textContent = mode === 'private' ? 'Create Private Room' : 'Create Public Lobby';
    if (submitEl) submitEl.textContent = mode === 'private' ? 'Create Private Room' : 'Create Public Lobby';
    setError('');
    refreshLimits();
    showScreen('onlineConfig');
  }

  minEl?.addEventListener('change', refreshLimits);
  maxEl?.addEventListener('change', refreshLimits);
  wordEl?.addEventListener('input', () => setError(''));
  wordEl?.addEventListener('blur', () => {
    if (!wordEl) return;
    const cleaned = sanitizePenaltyWord(wordEl.value);
    wordEl.value = cleaned;
  });

  function submit() {
    refreshLimits();
    const settings = readOnlineLobbySettings();
    if (!settings.valid) {
      setError(settings.error);
      return;
    }
    if (wordEl) wordEl.value = settings.penaltyWord;
    setError('');
    if (mode === 'private') onPrivate?.(settings);
    else onCreatePublic?.(settings);
  }

  qs('btn-online-public-start')?.addEventListener('click', submit);
  qs('btn-online-private-start')?.remove();
  qs('btn-online-config-back')?.addEventListener('click', () => onBack?.());
  refreshLimits();

  return { configure, findPublic: () => onFindPublic?.() };
}
