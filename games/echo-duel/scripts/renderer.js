import { PHASES } from './config.js';
import { getOwner } from './state.js';

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

function phaseCopy(state) {
  const owner = getOwner(state);
  switch (state.phase) {
    case PHASES.OWNER_CREATE_INITIAL:
      return ['Owner Create', `${owner?.name || 'Owner'} enters a 4-input pattern.`, 'The completed signal will play back before copy mode.'];
    case PHASES.OWNER_REPLAY:
      return ['Owner Replay', `${owner?.name || 'Owner'} must replay their own pattern.`, 'If successful, the completed signal plays back for everyone.'];
    case PHASES.OWNER_APPEND:
      return ['Owner Append', `${owner?.name || 'Owner'} adds one input.`, 'The updated sequence will be presented before copy begins.'];
    case PHASES.SIGNAL_PLAYBACK:
      return ['Memorize', 'Signal playback.', 'Watch the full pattern now. It disappears before copy mode.'];
    case PHASES.CHALLENGER_COPY:
      return ['Copy Phase', `Challengers copy the pattern.`, 'No sequence readout. Memory only.'];
    case PHASES.MATCH_OVER:
      return ['Finished', 'Match over.', ''];
    default:
      return ['Match', 'Waiting.', ''];
  }
}

function localPlayerId(state) {
  return state?.network?.myClientId || null;
}

function isLocalOwner(state) {
  const localId = localPlayerId(state);
  const owner = getOwner(state);
  if (!localId) return state.mode !== 'online';
  return owner?.id === localId || owner?.clientId === localId;
}

function localCopyProgress(state) {
  const localId = localPlayerId(state);
  if (localId && state.copyProgress?.[localId]) return state.copyProgress[localId];
  const firstCopying = Object.values(state.copyProgress || {}).find(progress => progress.status === 'copying');
  return firstCopying || null;
}

function expectedSlotCount(state) {
  if (state.phase === PHASES.OWNER_CREATE_INITIAL) return state.settings.startingPatternLength;
  if (state.phase === PHASES.OWNER_APPEND) return Math.min(state.settings.maxPatternLength, state.appendTargetLength || (state.activeSequence.length + (state.settings.patternAppendCount || 1))); 
  if (state.phase === PHASES.OWNER_REPLAY || state.phase === PHASES.CHALLENGER_COPY || state.phase === PHASES.SIGNAL_PLAYBACK) return state.activeSequence.length;
  return Math.max(state.activeSequence.length, state.settings.startingPatternLength);
}

function progressCountForPhase(state) {
  if (state.phase === PHASES.OWNER_CREATE_INITIAL) return state.ownerDraft.length;
  if (state.phase === PHASES.OWNER_REPLAY) return state.ownerReplayIndex || 0;
  if (state.phase === PHASES.OWNER_APPEND) return state.activeSequence.length;
  if (state.phase === PHASES.CHALLENGER_COPY) return Number(localCopyProgress(state)?.index || 0);
  if (state.phase === PHASES.SIGNAL_PLAYBACK && state.playback) {
    const elapsed = Math.max(0, performance.now() - Number(state.playback.startedAt || performance.now()));
    const perInputMs = Number(state.playback.perInputMs || 570);
    return Math.min(state.activeSequence.length, Math.floor(elapsed / perInputMs) + 1);
  }
  return 0;
}

function renderSequence(state) {
  const slots = qs('sequence-slots');
  if (!slots) return;
  slots.innerHTML = '';

  const count = Math.max(0, expectedSlotCount(state));
  const progress = Math.max(0, Math.min(count, progressCountForPhase(state)));

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

function inputModeForState(state) {
  const owner = getOwner(state);
  const ownerName = owner?.name || 'Owner';
  const ownerLocal = isLocalOwner(state);

  if (state.phase === PHASES.OWNER_CREATE_INITIAL) {
    return ownerLocal
      ? { label: 'CREATE STARTING SIGNAL', detail: `${state.ownerDraft.length}/${state.settings.startingPatternLength}`, className: 'mode-owner-append', locked: false }
      : { label: `WATCH ${ownerName}`, detail: 'Memorize the signal', className: 'mode-watch', locked: true };
  }

  if (state.phase === PHASES.OWNER_REPLAY) {
    return ownerLocal
      ? { label: 'REPLAY YOUR SIGNAL', detail: `${state.ownerReplayIndex || 0}/${state.activeSequence.length}`, className: 'mode-owner-replay', locked: false }
      : { label: `WATCH ${ownerName}`, detail: 'Control can drop here', className: 'mode-watch', locked: true };
  }

  if (state.phase === PHASES.OWNER_APPEND) {
    const target = Math.min(state.settings.maxPatternLength, state.appendTargetLength || (state.activeSequence.length + (state.settings.patternAppendCount || 1)));
    const remaining = Math.max(1, target - state.activeSequence.length);
    const label = remaining === 1 ? 'ADD 1 NEW INPUT' : `ADD ${remaining} NEW INPUTS`;
    return ownerLocal
      ? { label, detail: `${state.activeSequence.length}/${target}`, className: 'mode-owner-append', locked: false }
      : { label: `WATCH ${ownerName}`, detail: `${remaining} new input${remaining === 1 ? '' : 's'} incoming`, className: 'mode-watch', locked: true };
  }

  if (state.phase === PHASES.SIGNAL_PLAYBACK) {
    return { label: 'MEMORIZE', detail: `${state.activeSequence.length} inputs`, className: 'mode-playback', locked: true };
  }

  if (state.phase === PHASES.CHALLENGER_COPY) {
    const progress = localCopyProgress(state);
    const isCopying = !ownerLocal && progress?.status === 'copying';
    return isCopying
      ? { label: 'COPY THE SIGNAL', detail: `${progress.index || 0}/${state.activeSequence.length}`, className: 'mode-challenger-copy', locked: false }
      : { label: 'WATCH RESULTS', detail: 'Input locked', className: 'mode-watch', locked: true };
  }

  return { label: 'WATCH', detail: '', className: 'mode-watch', locked: true };
}

function renderInputMode(state) {
  const mode = inputModeForState(state);
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


function roleLabel(state, player, owner) {
  if (owner?.id === player.id) return 'Owner';
  const progress = state.copyProgress?.[player.id];
  if (state.phase === PHASES.CHALLENGER_COPY && progress) {
    if (progress.status === 'safe') return 'Safe';
    if (progress.status === 'fail') return 'Failed';
    return `Copying ${progress.index}/${state.activeSequence.length}`;
  }
  return 'Challenger';
}

function renderPlayers(state) {
  const strip = qs('players-strip');
  if (!strip) return;
  strip.innerHTML = '';
  const owner = getOwner(state);

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
      <div class="player-role">${player.eliminated ? 'Eliminated' : roleLabel(state, player, owner)}</div>
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
  const [kicker, title, detail] = phaseCopy(state);
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

  const standings = qs('ended-standings');
  if (!standings) return;
  standings.innerHTML = '';
  state.players.forEach(player => {
    const row = document.createElement('div');
    row.className = 'standing-row';
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
  if (statusEl) statusEl.textContent = status || lobbyStatusText(lobby);
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
    const isOwner = lobby?.ownerId === myClientId;
    const ready = Number(lobby?.playerCount || 0) >= Number(lobby?.minPlayers || 2);
    const starting = startRequested || lobby?.status === 'countdown' || lobby?.status === 'started';
    startBtn.hidden = !isOwner;
    startBtn.disabled = !ready || starting;
    startBtn.textContent = starting ? 'Starting Match...' : 'Start Now';
    startBtn.setAttribute('aria-busy', starting ? 'true' : 'false');
  }
}

function shortClientId(value) {
  const text = String(value || 'Player');
  return text.length > 8 ? `Player ${text.slice(-4).toUpperCase()}` : text;
}

function lobbyStatusText(lobby) {
  if (!lobby) return 'Connecting...';
  if (lobby.status === 'countdown' && lobby.startAt) {
    const seconds = Math.max(0, Math.ceil((lobby.startAt - Date.now()) / 1000));
    return `Starting in ${seconds}s...`;
  }
  if ((lobby.playerCount || 0) < lobby.minPlayers) {
    return `Waiting for ${lobby.minPlayers - lobby.playerCount} more player${lobby.minPlayers - lobby.playerCount === 1 ? '' : 's'}...`;
  }
  return 'Ready to start.';
}
