// screen-online-lobby.js — Online 1v1 lobby: settings, matchmaking, private rooms.

// ── Entry ─────────────────────────────────────────────────────────────────────

function enterOnlineLobby() {
  state.onlineLobbyPhase = 'settings';
  state.onlineSettings   = { pickStyle: 'blind', levelCapIndex: 0, resolvedLevelCap: null };
  state.onlineRoomCode   = '';
  state.onlineCodeInput  = '';
  state.remotePlayerInfo = null;
  state.isOnlineMatch    = false;
  state.blindPick        = {
    myTeam: [], myLocked: false, opponentLocked: false,
    remoteTeam: null, settingsReceived: false,
  };

  state.onlineClient = createCbOnlineClient();
  _wireOnlineCbs(state.onlineClient);
  state.onlineClient.connect();
  setScreen('online-lobby');
}

function exitOnlineLobby() {
  state.onlineClient?.disconnect();
  state.onlineClient = null;
  setScreen('mode-select');
}

// ── Callback wiring ───────────────────────────────────────────────────────────

function _wireOnlineCbs(client) {
  client.cb.onConnected = () => {
    // Connection established — lobby is ready for matchmaking actions.
  };

  client.cb.onRoomCreated = (code) => {
    state.onlineRoomCode   = code;
    state.onlineLobbyPhase = 'create';
    if (state.screen === 'online-lobby') renderOnlineLobby();
  };

  client.cb.onPartnerLeft = () => {
    playInvalid();
    if (state.screen === 'battle') {
      renderBattleEndOverlay('player', 'disconnect');
    } else if (state.screen === 'blind-pick') {
      _renderDisconnectOverlay('screen-blind-pick', () => {
        state.onlineLobbyPhase = 'main';
        setScreen('online-lobby');
      });
    } else {
      state.onlineLobbyPhase = 'main';
      renderOnlineLobby();
      _showLobbyBanner('Opponent disconnected.');
    }
  };

  client.cb.onError = (code, msg) => {
    playInvalid();
    console.error('[online]', code, msg);
    if (state.screen === 'online-lobby') {
      _showLobbyBanner(msg);
      state.onlineLobbyPhase = 'main';
      renderOnlineLobby();
    }
  };

  client.cb.onMatchReady = ({ seed }) => {
    _startBlindPick(seed);
  };

  client.cb.onRemoteMessage = ({ messageType, value }) => {
    if (state.screen === 'blind-pick') {
      handleBlindPickRemoteMessage(messageType, value);
    } else if (state.screen === 'battle' && state.isOnlineMatch) {
      handleBattleRemoteMessage(messageType, value);
    }
  };
}

function _renderDisconnectOverlay(screenId, onBack) {
  const screen  = document.getElementById(screenId);
  if (!screen) return;
  const existing = screen.querySelector('.dc-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.className = 'dc-overlay';
  overlay.innerHTML = `
    <div class="battle-end-card">
      <div class="battle-end-title">Opponent Disconnected</div>
      <div class="battle-end-sub">Your opponent left. The match has been cancelled.</div>
      <button class="btn primary" id="dc-back-btn">Back to Lobby</button>
    </div>`;
  screen.appendChild(overlay);
  overlay.querySelector('#dc-back-btn')?.addEventListener('click', () => { playClick(); onBack(); });
}

let _lobbyBannerTimeout = null;
function _showLobbyBanner(msg) {
  clearTimeout(_lobbyBannerTimeout);
  const el = document.getElementById('lobby-banner');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('visible');
  _lobbyBannerTimeout = setTimeout(() => el.classList.remove('visible'), 3500);
}

// ── Blind pick bootstrap ──────────────────────────────────────────────────────

function _startBlindPick(seed) {
  const client  = state.onlineClient;
  const isCoord = client.isCoordinator;

  state.onlineSettings.battleSeed = seed ?? null;
  state.blindPick = {
    myTeam: [], myLocked: false, opponentLocked: false,
    remoteTeam: null, settingsReceived: isCoord,
  };

  setScreen('blind-pick');

  if (isCoord) {
    const resolved = _resolveOnlineLevelCap();
    state.onlineSettings.resolvedLevelCap = resolved;
    client.send('match_settings', {
      pickStyle: state.onlineSettings.pickStyle,
      levelCap:  resolved,
    });
  }

  renderBlindPick();
}

function _resolveOnlineLevelCap() {
  const idx = state.onlineSettings.levelCapIndex;
  const opt = ONLINE_LEVEL_OPTIONS[idx];
  if (opt.level === 'any') {
    return LEVEL_TIERS[Math.floor(Math.random() * LEVEL_TIERS.length)].level;
  }
  return opt.level;
}

// ── Renderer ──────────────────────────────────────────────────────────────────

registerRenderer('online-lobby', renderOnlineLobby);

function renderOnlineLobby() {
  const el    = document.getElementById('screen-online-lobby');
  const phase = state.onlineLobbyPhase;

  let bodyHtml = '';
  if (phase === 'settings')      bodyHtml = _buildSettingsHtml();
  else if (phase === 'main')     bodyHtml = _buildMainHtml();
  else if (phase === 'searching') bodyHtml = _buildSearchingHtml();
  else if (phase === 'friend_opts') bodyHtml = _buildFriendOptsHtml();
  else if (phase === 'create')   bodyHtml = _buildCreateHtml();
  else if (phase === 'join')     bodyHtml = _buildJoinHtml();

  el.innerHTML = `
    <div class="lobby-banner" id="lobby-banner"></div>
    <div class="lobby-wrap">
      ${bodyHtml}
    </div>
  `;

  _attachLobbyListeners(phase);
}

// ── Phase builders ────────────────────────────────────────────────────────────

function _buildSettingsHtml() {
  const { pickStyle, levelCapIndex } = state.onlineSettings;

  const pickCards = [
    { id: 'blind', label: 'Blind Pick', sub: 'Both pick simultaneously · Mirrors allowed', disabled: false },
    { id: 'draft', label: 'Draft',      sub: 'Coming soon',                                 disabled: true  },
  ].map(c => `
    <div class="lobby-pick-card ${c.id === pickStyle ? 'selected' : ''} ${c.disabled ? 'disabled' : ''}"
         data-pick="${c.id}">
      <div class="lobby-pick-label">${c.label}</div>
      <div class="lobby-pick-sub">${c.sub}</div>
    </div>
  `).join('');

  const levelChips = ONLINE_LEVEL_OPTIONS.map((opt, i) => {
    const sub = opt.level === 'any' ? 'Random' : `Lv ${opt.level}`;
    return `
    <button class="lobby-level-chip ${i === levelCapIndex ? 'selected' : ''}" data-lvl-idx="${i}">
      <span class="lvl-chip-label">${opt.label}</span>
      <span class="lvl-chip-sub">${sub}</span>
    </button>
  `;
  }).join('');

  return `
    <div class="lobby-header">
      <div class="lobby-eyebrow">ONLINE 1V1</div>
      <h2 class="lobby-title">Match Settings</h2>
    </div>
    <div class="lobby-section">
      <div class="lobby-section-label">PICK STYLE</div>
      <div class="lobby-pick-row">${pickCards}</div>
    </div>
    <div class="lobby-section">
      <div class="lobby-section-label">LEVEL CAP</div>
      <div class="lobby-level-row">${levelChips}</div>
    </div>
    <div class="lobby-actions">
      <button class="btn primary lobby-btn" id="lobby-continue-btn">Continue →</button>
    </div>
    <div class="lobby-hint">ESC · Back to modes</div>
  `;
}

function _buildMainHtml() {
  const { pickStyle, levelCapIndex } = state.onlineSettings;
  const lvlLabel = ONLINE_LEVEL_OPTIONS[levelCapIndex].label;
  const styleCap = pickStyle === 'blind' ? 'Blind Pick' : 'Draft';

  return `
    <div class="lobby-header">
      <div class="lobby-eyebrow">ONLINE 1V1</div>
      <h2 class="lobby-title">Find a Match</h2>
      <div class="lobby-settings-summary">${styleCap} · ${lvlLabel}</div>
    </div>
    <div class="lobby-actions lobby-actions--stack">
      <button class="btn primary lobby-btn" id="lobby-find-btn">Find Match</button>
      <button class="btn lobby-btn" id="lobby-private-btn">Private Room</button>
    </div>
    <div class="lobby-hint">ESC · Change settings</div>
  `;
}

function _buildSearchingHtml() {
  const { pickStyle, levelCapIndex } = state.onlineSettings;
  const lvlLabel = ONLINE_LEVEL_OPTIONS[levelCapIndex].label;
  const styleCap = pickStyle === 'blind' ? 'Blind Pick' : 'Draft';

  return `
    <div class="lobby-header">
      <div class="lobby-eyebrow">MATCHMAKING</div>
      <h2 class="lobby-title">Searching<span class="cb-dots"></span></h2>
      <div class="lobby-settings-summary">${styleCap} · ${lvlLabel}</div>
    </div>
    <div class="lobby-searching-status">Looking for an opponent with matching settings...</div>
    <div class="lobby-actions">
      <button class="btn lobby-btn" id="lobby-cancel-btn">Cancel</button>
    </div>
  `;
}

function _buildFriendOptsHtml() {
  return `
    <div class="lobby-header">
      <div class="lobby-eyebrow">PRIVATE ROOM</div>
      <h2 class="lobby-title">Play with a Friend</h2>
    </div>
    <div class="lobby-actions lobby-actions--stack">
      <button class="btn primary lobby-btn" id="lobby-create-btn">Create Room</button>
      <button class="btn lobby-btn" id="lobby-enter-code-btn">Enter Code</button>
    </div>
    <div class="lobby-hint">ESC · Back</div>
  `;
}

function _buildCreateHtml() {
  const code = state.onlineRoomCode || '------';
  const { pickStyle, levelCapIndex } = state.onlineSettings;
  const lvlLabel = ONLINE_LEVEL_OPTIONS[levelCapIndex].label;
  const styleCap = pickStyle === 'blind' ? 'Blind Pick' : 'Draft';

  return `
    <div class="lobby-header">
      <div class="lobby-eyebrow">PRIVATE ROOM</div>
      <h2 class="lobby-title">Share This Code</h2>
      <div class="lobby-settings-summary">${styleCap} · ${lvlLabel}</div>
    </div>
    <div class="lobby-room-code">${code}</div>
    <div class="lobby-searching-status">Waiting for opponent<span class="cb-dots"></span></div>
    <div class="lobby-actions">
      <button class="btn lobby-btn" id="lobby-cancel-room-btn">Cancel</button>
    </div>
  `;
}

function _buildJoinHtml() {
  const code = state.onlineCodeInput || '';
  return `
    <div class="lobby-header">
      <div class="lobby-eyebrow">PRIVATE ROOM</div>
      <h2 class="lobby-title">Enter Room Code</h2>
    </div>
    <div class="lobby-code-input-wrap">
      <input id="lobby-code-input" class="lobby-code-input" type="text"
             maxlength="6" autocomplete="off" spellcheck="false"
             placeholder="XXXXXX" value="${code}">
    </div>
    <div class="lobby-actions lobby-actions--stack">
      <button class="btn primary lobby-btn" id="lobby-join-btn">Join Room</button>
      <button class="btn lobby-btn" id="lobby-cancel-join-btn">Cancel</button>
    </div>
    <div class="lobby-hint">ESC · Back</div>
  `;
}

// ── Listener wiring ───────────────────────────────────────────────────────────

function _attachLobbyListeners(phase) {
  const el = document.getElementById('screen-online-lobby');

  if (phase === 'settings') {
    el.querySelectorAll('.lobby-pick-card:not(.disabled)').forEach(card => {
      card.addEventListener('click', () => {
        playClick();
        state.onlineSettings.pickStyle = card.dataset.pick;
        renderOnlineLobby();
      });
    });
    el.querySelectorAll('.lobby-level-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        playClick();
        state.onlineSettings.levelCapIndex = parseInt(chip.dataset.lvlIdx, 10);
        renderOnlineLobby();
      });
    });
    document.getElementById('lobby-continue-btn')?.addEventListener('click', () => {
      playClick();
      state.onlineLobbyPhase = 'main';
      renderOnlineLobby();
    });
  }

  if (phase === 'main') {
    document.getElementById('lobby-find-btn')?.addEventListener('click', () => {
      playClick();
      _doFindMatch();
    });
    document.getElementById('lobby-private-btn')?.addEventListener('click', () => {
      playClick();
      state.onlineLobbyPhase = 'friend_opts';
      renderOnlineLobby();
    });
  }

  if (phase === 'searching') {
    document.getElementById('lobby-cancel-btn')?.addEventListener('click', () => {
      playClick();
      state.onlineClient?.cancelSearch();
      state.onlineLobbyPhase = 'main';
      renderOnlineLobby();
    });
  }

  if (phase === 'friend_opts') {
    document.getElementById('lobby-create-btn')?.addEventListener('click', () => {
      playClick();
      _doCreateRoom();
    });
    document.getElementById('lobby-enter-code-btn')?.addEventListener('click', () => {
      playClick();
      state.onlineLobbyPhase = 'join';
      renderOnlineLobby();
    });
  }

  if (phase === 'create') {
    document.getElementById('lobby-cancel-room-btn')?.addEventListener('click', () => {
      playClick();
      state.onlineClient?.cancelRoom();
      state.onlineRoomCode   = '';
      state.onlineLobbyPhase = 'friend_opts';
      renderOnlineLobby();
    });
  }

  if (phase === 'join') {
    const input = document.getElementById('lobby-code-input');
    if (input) {
      input.focus();
      input.addEventListener('input', () => {
        state.onlineCodeInput = input.value.toUpperCase();
        input.value = state.onlineCodeInput;
      });
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); _doJoinRoom(); }
      });
    }
    document.getElementById('lobby-join-btn')?.addEventListener('click', () => {
      playClick();
      _doJoinRoom();
    });
    document.getElementById('lobby-cancel-join-btn')?.addEventListener('click', () => {
      playClick();
      state.onlineCodeInput  = '';
      state.onlineLobbyPhase = 'friend_opts';
      renderOnlineLobby();
    });
  }
}

// ── Actions ───────────────────────────────────────────────────────────────────

function _doFindMatch() {
  const { pickStyle, levelCapIndex } = state.onlineSettings;
  const levelCap = ONLINE_LEVEL_OPTIONS[levelCapIndex].level;
  const profile  = window.__factoryProfile;
  state.onlineClient.findMatch(
    pickStyle, levelCap,
    profile?.playerId    || '',
    profile?.profileName || 'Trainer'
  );
  state.onlineLobbyPhase = 'searching';
  renderOnlineLobby();
}

function _doCreateRoom() {
  const profile = window.__factoryProfile;
  state.onlineClient.createRoom(
    profile?.playerId    || '',
    profile?.profileName || 'Trainer'
  );
}

function _doJoinRoom() {
  const code = state.onlineCodeInput.trim().toUpperCase();
  if (code.length < 4) { playInvalid(); return; }
  const profile = window.__factoryProfile;
  state.onlineClient.joinRoom(
    code,
    profile?.playerId    || '',
    profile?.profileName || 'Trainer'
  );
  state.onlineLobbyPhase = 'searching';
  renderOnlineLobby();
}

// ── ESC keyboard handling (called from input.js) ──────────────────────────────

function handleOnlineLobbyEsc() {
  const phase = state.onlineLobbyPhase;
  playClick();
  if (phase === 'settings') {
    exitOnlineLobby();
  } else if (phase === 'main') {
    state.onlineLobbyPhase = 'settings';
    renderOnlineLobby();
  } else if (phase === 'searching') {
    state.onlineClient?.cancelSearch();
    state.onlineLobbyPhase = 'main';
    renderOnlineLobby();
  } else if (phase === 'friend_opts') {
    state.onlineLobbyPhase = 'main';
    renderOnlineLobby();
  } else if (phase === 'create') {
    state.onlineClient?.cancelRoom();
    state.onlineRoomCode   = '';
    state.onlineLobbyPhase = 'friend_opts';
    renderOnlineLobby();
  } else if (phase === 'join') {
    state.onlineCodeInput  = '';
    state.onlineLobbyPhase = 'friend_opts';
    renderOnlineLobby();
  }
}
