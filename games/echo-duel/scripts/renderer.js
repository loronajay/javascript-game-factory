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
  singlePlayerConfig: 'screen-single-player-config',
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
  Object.values(screenMap).forEach(id => {
    const screen = qs(id);
    if (!screen) return;
    const isActive = id === screenMap[name];
    screen.classList.toggle('screen--active', isActive);
    screen.setAttribute('aria-hidden', isActive ? 'false' : 'true');
  });
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


function progressStateForPlayer(state, player) {
  const owner = state.players[state.ownerIndex] || null;
  const isOwner = owner?.id === player.id || owner?.clientId === player.clientId;
  const sequenceLength = Number(state.activeSequence?.length || 0);

  if (player.eliminated) {
    return { label: 'ELIMINATED', current: 0, total: 0, status: 'eliminated' };
  }

  if (state.phase === PHASES.OWNER_CREATE_INITIAL) {
    const total = Number(state.settings?.startingPatternLength || 4);
    return isOwner
      ? { label: 'DRIVING', current: Number(state.ownerDraft?.length || 0), total, status: 'driver' }
      : { label: 'WATCHING DRIVER', current: 0, total, status: 'watching' };
  }

  if (state.phase === PHASES.OWNER_REPLAY) {
    return isOwner
      ? { label: 'REPLAYING', current: Number(state.ownerReplayIndex || 0), total: sequenceLength, status: 'driver' }
      : { label: 'WATCHING DRIVER', current: 0, total: sequenceLength, status: 'watching' };
  }

  if (state.phase === PHASES.OWNER_APPEND) {
    const target = Math.max(sequenceLength, Number(state.appendTargetLength || sequenceLength));
    return isOwner
      ? { label: 'ADDING INPUTS', current: sequenceLength, total: target, status: 'driver' }
      : { label: 'WATCHING DRIVER', current: 0, total: target, status: 'watching' };
  }

  if (state.phase === PHASES.SIGNAL_PLAYBACK) {
    const current = Math.max(0, Math.min(sequenceLength, getProgressCountForPhase(state)));
    return isOwner
      ? { label: 'PLAYING SIGNAL', current, total: sequenceLength, status: 'playback' }
      : { label: 'MEMORIZE', current, total: sequenceLength, status: 'playback' };
  }

  if (state.phase === PHASES.CHALLENGER_COPY) {
    if (isOwner) return { label: 'WATCHING', current: 0, total: sequenceLength, status: 'watching' };
    const progress = state.copyProgress?.[player.id] || state.copyProgress?.[player.clientId] || null;
    if (!progress) return { label: 'WAITING', current: 0, total: sequenceLength, status: 'watching' };
    const current = Math.max(0, Math.min(sequenceLength, Number(progress.index || 0)));
    if (progress.status === 'safe') return { label: 'DONE', current: sequenceLength, total: sequenceLength, status: 'safe' };
    if (progress.status === 'fail') return { label: 'FAILED', current, total: sequenceLength, status: 'fail' };
    return { label: 'COPYING', current, total: sequenceLength, status: 'copying' };
  }

  if (player.lastResult === 'safe') return { label: 'SAFE', current: sequenceLength, total: sequenceLength, status: 'safe' };
  if (player.lastResult === 'fail') return { label: 'LETTER +1', current: 0, total: sequenceLength, status: 'fail' };
  if (player.lastResult === 'owner-fail') return { label: 'DROPPED SIGNAL', current: 0, total: sequenceLength, status: 'fail' };
  return isOwner
    ? { label: 'DRIVER', current: 0, total: sequenceLength, status: 'driver' }
    : { label: 'CHALLENGER', current: 0, total: sequenceLength, status: 'watching' };
}

function renderPlayerProgress(state, player) {
  const progress = progressStateForPlayer(state, player);
  const total = Math.max(0, Number(progress.total || 0));
  const current = Math.max(0, Math.min(total, Number(progress.current || 0)));
  const dots = total > 0
    ? Array.from({ length: total }, (_, index) => `<span class="player-progress__dot${index < current ? ' is-filled' : ''}"></span>`).join('')
    : '';
  const count = total > 0 ? `<span class="player-progress__count">${current}/${total}</span>` : '';
  return `
    <div class="player-progress player-progress--${progress.status}">
      <div class="player-progress__topline">
        <span class="player-progress__label">${progress.label}</span>
        ${count}
      </div>
      ${dots ? `<div class="player-progress__dots" aria-hidden="true">${dots}</div>` : ''}
    </div>
  `;
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
    const initials = String(player.name || 'P')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() || '')
      .join('') || 'P';

    card.innerHTML = `
      <div class="player-card__identity">
        <div class="player-card__badge" aria-hidden="true">${initials}</div>
        <div class="player-card__meta">
          <div class="player-name">${player.name}</div>
          <div class="player-role">${player.eliminated ? 'Eliminated' : getRoleLabel(state, player)}</div>
        </div>
      </div>
      <div class="letter-track">${safeLetters}</div>
      ${renderPlayerProgress(state, player)}
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
  qs('phase-detail').textContent = state.mode === 'single'
    ? `${detail} Score: ${Number(state.singlePlayer?.score || 0)}.`
    : detail;
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
