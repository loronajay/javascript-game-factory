import { DEFAULT_SETTINGS } from './config.js';
import { clampPlayerCount, sanitizePenaltyWord, validatePenaltyWord } from './validation.js';
import { renderLobbyPreview, showScreen } from './renderer.js';

function qs(id) { return document.getElementById(id); }

export function readLobbySettings() {
  const playerCount = clampPlayerCount(qs('lobby-player-count')?.value, 2, 6);
  const wordResult = validatePenaltyWord(qs('lobby-word')?.value || DEFAULT_SETTINGS.penaltyWord);
  return { playerCount, penaltyWord: wordResult.word, valid: wordResult.ok, error: wordResult.error };
}

export function wireLobby({ onStart, onBack }) {
  const countEl = qs('lobby-player-count');
  const wordEl = qs('lobby-word');
  const errorEl = qs('lobby-error');

  function refresh() {
    const count = clampPlayerCount(countEl?.value, 2, 6);
    if (countEl) countEl.value = String(count);
    if (wordEl) wordEl.value = sanitizePenaltyWord(wordEl.value || DEFAULT_SETTINGS.penaltyWord);
    renderLobbyPreview(count);
  }

  countEl?.addEventListener('change', refresh);
  wordEl?.addEventListener('input', refresh);

  qs('btn-start-local')?.addEventListener('click', () => {
    const settings = readLobbySettings();
    if (!settings.valid) {
      if (errorEl) {
        errorEl.textContent = settings.error;
        errorEl.classList.remove('hidden');
      }
      return;
    }
    errorEl?.classList.add('hidden');
    onStart?.(settings);
  });

  qs('btn-lobby-back')?.addEventListener('click', () => onBack?.());

  refresh();
}

export function openLobby() {
  renderLobbyPreview(clampPlayerCount(qs('lobby-player-count')?.value, 2, 6));
  showScreen('lobby');
}

export function readOnlineLobbySettings() {
  const minPlayers = clampPlayerCount(qs('online-min-players')?.value, 2, 6);
  const maxPlayers = clampPlayerCount(qs('online-max-players')?.value, minPlayers, 6);
  const wordResult = validatePenaltyWord(qs('online-word')?.value || DEFAULT_SETTINGS.penaltyWord);
  return { minPlayers, maxPlayers, penaltyWord: wordResult.word, valid: wordResult.ok, error: wordResult.error };
}

export function wireOnlineConfig({ onPublic, onPrivate, onBack }) {
  const minEl = qs('online-min-players');
  const maxEl = qs('online-max-players');
  const wordEl = qs('online-word');
  const errorEl = qs('online-error');

  function refresh() {
    const min = clampPlayerCount(minEl?.value, 2, 6);
    const max = clampPlayerCount(maxEl?.value, min, 6);
    if (minEl) minEl.value = String(min);
    if (maxEl) maxEl.value = String(max);
    if (wordEl) wordEl.value = sanitizePenaltyWord(wordEl.value || DEFAULT_SETTINGS.penaltyWord);
  }

  minEl?.addEventListener('change', refresh);
  maxEl?.addEventListener('change', refresh);
  wordEl?.addEventListener('input', refresh);

  function submit(kind) {
    const settings = readOnlineLobbySettings();
    if (!settings.valid) {
      if (errorEl) {
        errorEl.textContent = settings.error;
        errorEl.classList.remove('hidden');
      }
      return;
    }
    errorEl?.classList.add('hidden');
    if (kind === 'public') onPublic?.(settings);
    else onPrivate?.(settings);
  }

  qs('btn-online-public-start')?.addEventListener('click', () => submit('public'));
  qs('btn-online-private-start')?.addEventListener('click', () => submit('private'));
  qs('btn-online-config-back')?.addEventListener('click', () => onBack?.());
  refresh();
}
