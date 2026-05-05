import { INPUT_META, PHASES } from './config.js';
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

export function showScreen(name) {
  Object.values(screenMap).forEach(id => qs(id)?.classList.add('hidden'));
  qs(screenMap[name])?.classList.remove('hidden');
}

function phaseCopy(state) {
  const owner = getOwner(state);
  switch (state.phase) {
    case PHASES.OWNER_CREATE_INITIAL:
      return ['Owner Create', `${owner?.name || 'Owner'} creates a 4-input pattern.`, 'The starting pattern is public as it is entered.'];
    case PHASES.OWNER_REPLAY:
      return ['Owner Replay', `${owner?.name || 'Owner'} must replay their own pattern.`, 'Failing here only passes control. No letter is awarded.'];
    case PHASES.OWNER_APPEND:
      return ['Owner Append', `${owner?.name || 'Owner'} adds one input.`, 'The updated sequence becomes the challenge.'];
    case PHASES.CHALLENGER_COPY:
      return ['Copy Phase', `Challengers copy the pattern.`, 'All non-owner players copy at the same time in online matches.'];
    case PHASES.MATCH_OVER:
      return ['Finished', 'Match over.', ''];
    default:
      return ['Match', 'Waiting.', ''];
  }
}

function renderSequence(state) {
  const slots = qs('sequence-slots');
  if (!slots) return;
  slots.innerHTML = '';

  const visible = state.phase === PHASES.OWNER_CREATE_INITIAL
    ? state.ownerDraft
    : state.activeSequence;

  const count = Math.max(visible.length, state.settings.startingPatternLength);
  for (let i = 0; i < count; i++) {
    const key = visible[i];
    const slot = document.createElement('div');
    slot.className = `sequence-slot ${key ? INPUT_META[key]?.cssClass || '' : ''}`;
    slot.textContent = key || '·';
    slots.appendChild(slot);
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
  const button = document.querySelector(`[data-echo-key="${input}"]`);
  if (!button) return;
  button.classList.remove('flash');
  void button.offsetWidth;
  button.classList.add('flash');
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
  qs('sequence-label').textContent = state.phase === PHASES.OWNER_CREATE_INITIAL ? 'Draft Pattern' : 'Active Sequence';
  qs('status-line').textContent = state.status || '';
  renderPlayers(state);
  renderSequence(state);
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


export function renderOnlineLobby({ lobby, profiles = {}, myClientId = null, status = '' }) {
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
    startBtn.hidden = !isOwner;
    startBtn.disabled = !ready;
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
