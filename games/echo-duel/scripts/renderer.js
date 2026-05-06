import { PHASES } from './config.js';
import { buildLobbyStartButtonState, getLobbyStatusText } from './online-lobby-view-state.js';
import {
  buildInputModeState,
  getExpectedSlotCount,
  getPhaseCopy,
  getProgressCountForPhase,
  getRoleLabel,
  shouldShowLoserCallout,
} from './match-view-state.js';

const screenMap = {
  menu: 'screen-menu',
  lobby: 'screen-lobby',
  onlineConfig: 'screen-online-config',
  onlineLobby: 'screen-online-lobby',
  joinRoom: 'screen-room-join',
  match: 'screen-match',
  ended: 'screen-ended',
};

function qs(id) { return document.getElementById(id); }

function playbackIndex(state, now = performance.now()) {
  const playback = state.playback;
  if (!playback || !Array.isArray(playback.sequence)) return -1;
  const elapsed = Math.max(0, now - Number(playback.startedAt || now));
  const perInputMs = Number(playback.perInputMs || ((playback.stepMs || 450) + (playback.gapMs || 120)));
  const stepMs = Number(playback.stepMs || 450);
  const index = Math.floor(elapsed / perInputMs);
  const offset = elapsed - index * perInputMs;
  if (index < 0 || index >= playback.sequence.length) return -1;
  return offset <= stepMs ? index : -1;
}

function renderLiveSignal(state) {
  const strip = qs('live-signal-strip');
  if (!strip) return;

  if (state.phase !== PHASES.SIGNAL_PLAYBACK || !state.playback) {
    strip.classList.add('hidden');
    strip.innerHTML = '';
    return;
  }

  const sequence = Array.isArray(state.playback.sequence) ? state.playback.sequence : [];
  const current = playbackIndex(state);

  strip.classList.remove('hidden');
  strip.classList.add('is-playback');

  if (strip.children.length !== sequence.length) {
    strip.innerHTML = '';
    sequence.forEach((input, index) => {
      const key = String(input || '').toUpperCase();
      const box = document.createElement('div');
      box.className = `live-signal-box is-lit key-${key.toLowerCase()}`;
      box.textContent = key;
      box.setAttribute('aria-label', `Signal input ${index + 1}: ${key}`);
      strip.appendChild(box);
    });
  }

  Array.from(strip.children).forEach((box, index) => {
    box.classList.toggle('is-current', index === current);
    box.classList.toggle('pop', index === current);
  });
}

export function currentPlaybackStep(state, now = performance.now()) {
  if (state?.phase !== PHASES.SIGNAL_PLAYBACK || !state.playback) return null;
  const index = playbackIndex(state, now);
  if (index < 0) return null;
  const input = String(state.playback.sequence[index] || '').toUpperCase();
  return input ? { index, input } : null;
}

export function currentPlaybackInput(state, now = performance.now()) {
  return currentPlaybackStep(state, now)?.input || null;
}


export function showScreen(name) {
  Object.values(screenMap).forEach(id => qs(id)?.classList.add('hidden'));
  qs(screenMap[name])?.classList.remove('hidden');
}

function renderSequence(state) {
  const slots = qs('sequence-slots');
  if (!slots) return;
  slots.innerHTML = '';

  const count = Math.max(0, getExpectedSlotCount(state));
  const progress = Math.max(0, Math.min(count, getProgressCountForPhase(state)));

  for (let i = 0; i < count; i++) {
    const slot = document.createElement('div');
    slot.className = 'sequence-slot sequence-slot--hidden';
    if (i < progress) {
      slot.classList.add('is-complete');
      slot.textContent = '•';
    } else {
      slot.textContent = String(i + 1);
    }
    if (i === progress && progress < count) slot.classList.add('is-next');
    slots.appendChild(slot);
  }
}

function renderInputMode(state) {
  const mode = buildInputModeState(state);
  const banner = qs('input-mode-banner');
  const pad = qs('input-pad') || document.querySelector('.pad');
  if (banner) {
    banner.innerHTML = `<strong>${mode.label}</strong><span>${mode.detail || ''}</span>`;
    banner.className = `input-mode-banner ${mode.className}`;
  }
  if (pad) {
    pad.classList.toggle('pad--locked', mode.locked);
    pad.classList.toggle('pad--watch', mode.className === 'mode-watch');
    pad.classList.toggle('pad--owner-replay', mode.className === 'mode-owner-replay');
    pad.classList.toggle('pad--owner-append', mode.className === 'mode-owner-append');
    pad.classList.toggle('pad--challenger-copy', mode.className === 'mode-challenger-copy');
    pad.classList.toggle('pad--playback', mode.className === 'mode-playback');
  }
}

function renderPlayers(state) {
  const strip = qs('players-strip');
  if (!strip) return;
  strip.innerHTML = '';

  state.players.forEach((player, index) => {
    const card = document.createElement('article');
    card.className = 'player-card';
    if (index === state.ownerIndex && !player.eliminated) card.classList.add('is-owner');
    if (state.phase === PHASES.CHALLENGER_COPY && state.copyProgress?.[player.id]?.status === 'copying') card.classList.add('is-active');
    if (player.eliminated) card.classList.add('is-eliminated');
    if (player.lastResult) card.dataset.result = player.lastResult;

    const safeLetters = state.settings.penaltyWord.split('').map((letter, letterIndex) => {
      const earned = letterIndex < player.letters.length;
      return `<span class="letter ${earned ? 'earned' : ''}">${earned ? letter : '_'}</span>`;
    }).join('');

    card.innerHTML = `
      <div class="player-name">${player.name}</div>
      <div class="player-role">${player.eliminated ? 'Eliminated' : getRoleLabel(state, player)}</div>
      <div class="letter-track">${safeLetters}</div>
    `;
    strip.appendChild(card);
  });
}

function renderTimer(state) {
  const wrap = qs('timer-wrap');
  const bar = qs('timer-bar');
  if (!wrap || !bar) return;
  if (!state.timer) {
    wrap.classList.add('hidden');
    bar.style.width = '100%';
    return;
  }
  wrap.classList.remove('hidden');
  const now = performance.now();
  const remaining = Math.max(0, state.timer.endsAt - now);
  const pct = Math.max(0, Math.min(100, (remaining / state.timer.durationMs) * 100));
  bar.style.width = `${pct}%`;
}

export function flashInput(input) {
  const key = String(input || '').toUpperCase();
  const button = document.querySelector(`[data-echo-key="${key}"]`);
  if (!button) return;
  button.classList.remove('flash');
  void button.offsetWidth;
  button.classList.add('flash');
}

export function revealOwnerInput() {
  // Owner inputs are no longer used as the memory source. The engine runs a formal
  // SIGNAL_PLAYBACK phase after the owner completes their entry.
}


export function renderLobbyPreview(count) {
  const root = qs('lobby-preview');
  if (!root) return;
  root.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const item = document.createElement('span');
    item.textContent = `P${i + 1}`;
    root.appendChild(item);
  }
}

export function renderMatch(state) {
  if (state.phase === PHASES.MATCH_OVER) {
    renderEnded(state);
    return;
  }

  showScreen('match');
  const [kicker, title, detail] = getPhaseCopy(state);
  qs('phase-kicker').textContent = kicker;
  qs('phase-title').textContent = title;
  qs('phase-detail').textContent = detail;
  qs('penalty-word').textContent = state.settings.penaltyWord;
  qs('sequence-label').textContent = state.phase === PHASES.OWNER_CREATE_INITIAL ? 'Draft Progress' : 'Memory Progress';
  qs('status-line').textContent = state.status || '';
  renderPlayers(state);
  renderSequence(state);
  renderLiveSignal(state);
  renderInputMode(state);
  renderTimer(state);
}

export function renderEnded(state) {
  showScreen('ended');
  const winner = state.players.find(player => player.id === state.winnerId);
  qs('ended-title').textContent = winner ? `${winner.name} Wins` : 'No Winner';
  qs('ended-message').textContent = winner
    ? `${winner.name} is the last active player.`
    : 'The match ended without an active player.';

  const callout = qs('loser-callout');
  if (callout) {
    const penaltyWord = String(state.settings?.penaltyWord || 'LOSER').toUpperCase();
    if (shouldShowLoserCallout(state)) {
      callout.textContent = `YOU ARE A ${penaltyWord}!`;
      callout.classList.remove('hidden');
      callout.classList.remove('loser-callout--play');
      void callout.offsetWidth;
      callout.classList.add('loser-callout--play');
    } else {
      callout.textContent = '';
      callout.classList.add('hidden');
      callout.classList.remove('loser-callout--play');
    }
  }

  const standings = qs('ended-standings');
  if (!standings) return;
  standings.innerHTML = '';
  state.players.forEach(player => {
    const row = document.createElement('div');
    row.className = 'standing-row';
    if (player.id === state.winnerId) row.classList.add('is-winner');
    if (player.eliminated) row.classList.add('is-loser');
    row.innerHTML = `<span>${player.name}</span><strong>${player.letters || '—'}</strong>`;
    standings.appendChild(row);
  });
}


export function renderOnlineLobby({ lobby, profiles = {}, myClientId = null, status = '', startRequested = false }) {
  showScreen('onlineLobby');
  const codeEl = qs('online-room-code');
  const statusEl = qs('online-lobby-status');
  const listEl = qs('online-members');
  const startBtn = qs('btn-online-start-now');
  const settingsEl = qs('online-lobby-settings');
  if (codeEl) codeEl.textContent = lobby?.roomCode || '-----';
  if (statusEl) {
    const dynamicStatus = getLobbyStatusText(lobby);
    statusEl.textContent = (lobby?.status === 'countdown' || lobby?.status === 'started') ? dynamicStatus : (status || dynamicStatus);
  }
  if (settingsEl && lobby) {
    settingsEl.textContent = `${lobby.playerCount || 0}/${lobby.maxPlayers} players · min ${lobby.minPlayers} · word ${lobby.settings?.penaltyWord || 'ECHO'}`;
  }
  if (listEl) {
    listEl.innerHTML = '';
    const members = Array.isArray(lobby?.members) ? lobby.members : [];
    for (const memberId of members) {
      const item = document.createElement('div');
      item.className = 'online-member';
      if (memberId === lobby?.ownerId) item.classList.add('is-owner');
      if (memberId === myClientId) item.classList.add('is-me');
      const name = profiles[memberId]?.displayName || shortClientId(memberId);
      item.innerHTML = `<strong>${name}</strong><span>${memberId === lobby?.ownerId ? 'Owner' : 'Ready'}</span>`;
      listEl.appendChild(item);
    }
  }
  if (startBtn) {
    const buttonState = buildLobbyStartButtonState({ lobby, myClientId, startRequested, now: Date.now() });
    startBtn.hidden = buttonState.hidden;
    startBtn.disabled = buttonState.disabled;
    startBtn.textContent = buttonState.text;
    startBtn.setAttribute('aria-busy', buttonState.ariaBusy);
  }
}

function shortClientId(value) {
  const text = String(value || 'Player');
  return text.length > 8 ? `Player ${text.slice(-4).toUpperCase()}` : text;
}
