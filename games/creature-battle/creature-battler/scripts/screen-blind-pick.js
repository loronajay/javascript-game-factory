// screen-blind-pick.js — Simultaneous online team selection before an online battle.

registerRenderer('blind-pick', renderBlindPick);

// ── Renderer ──────────────────────────────────────────────────────────────────

function renderBlindPick() {
  const el      = document.getElementById('screen-blind-pick');
  const bp      = state.blindPick;
  const profile = window.__factoryProfile;
  const myName  = profile?.profileName || 'You';

  const levelCap = state.onlineSettings.resolvedLevelCap;
  const levelLabel = bp.settingsReceived && levelCap
    ? `Blind Pick · Lv.${levelCap}`
    : 'Blind Pick · Waiting for settings…';

  const rosterHtml = RENTAL_ROSTER.map((c, i) => {
    const isSelected = bp.myTeam.includes(c.id);
    const slotNum    = isSelected ? bp.myTeam.indexOf(c.id) + 1 : '';
    const disabled   = bp.myLocked ? 'locked' : '';
    const isFocused  = i === state.blindPickFocusIndex;
    return `
      <div class="creature-card ${isSelected ? 'selected' : ''} ${disabled} ${isFocused ? 'focused' : ''}" data-id="${c.id}" data-index="${i}">
        <img class="creature-card-sprite" src="${c.sprite}" alt="${c.name}">
        <div class="creature-card-name">${c.name}</div>
        <div class="creature-card-role">${c.role}</div>
        <span class="element-tag element-${c.element}">${c.element}</span>
        ${isSelected ? `<div class="selected-badge">#${slotNum}</div>` : ''}
      </div>
    `;
  }).join('');

  const slotsHtml = [0, 1, 2].map(i => {
    const id = bp.myTeam[i];
    const c  = id ? RENTAL_ROSTER.find(r => r.id === id) : null;
    return `
      <div class="team-slot ${c ? 'filled' : ''}">
        ${c
          ? `<img class="team-slot-sprite" src="${c.sprite}" alt="${c.name}">
             <div class="team-slot-name">${c.name}</div>`
          : `<div class="team-slot-empty-icon"></div>
             <div class="team-slot-empty-text">Empty</div>`}
      </div>
    `;
  }).join('');

  const opponentStatus = bp.opponentLocked
    ? `<div class="bp-opponent-status ready">Opponent is ready!</div>`
    : `<div class="bp-opponent-status waiting">Opponent picking<span class="cb-dots"></span></div>`;

  let footerHtml;
  if (bp.myLocked) {
    footerHtml = `<div class="bp-locked-msg">Locked in! Waiting for opponent<span class="cb-dots"></span></div>`;
  } else if (bp.myTeam.length === 3) {
    footerHtml = `
      <button class="btn primary lobby-btn" id="bp-lockin-btn">Lock In →</button>
      <div class="bp-hint">R — Stats · F — Guide</div>
    `;
  } else {
    footerHtml = `
      <div class="bp-hint">Pick ${3 - bp.myTeam.length} more creature${3 - bp.myTeam.length === 1 ? '' : 's'}</div>
      <div class="bp-hint">R — Stats · F — Guide</div>
    `;
  }

  const prevScroll = el.querySelector('.roster-grid')?.scrollTop ?? 0;
  el.innerHTML = `
    <div class="team-select-header">
      <div class="team-select-title">
        <div class="phase-label">${levelLabel} · Online 1v1</div>
        <h2>${bp.myLocked ? 'Waiting…' : 'Choose Your Team'}</h2>
      </div>
      ${opponentStatus}
    </div>
    <div class="team-select-body">
      <div class="roster-grid ${bp.myLocked ? 'roster-locked' : ''}">${rosterHtml}</div>
      <div class="team-sidebar">
        <div class="team-sidebar-label">${myName}</div>
        ${slotsHtml}
      </div>
    </div>
    <div class="team-select-footer">
      ${footerHtml}
    </div>
  `;

  const rosterGrid = el.querySelector('.roster-grid');
  if (rosterGrid && prevScroll) rosterGrid.scrollTop = prevScroll;

  el.querySelectorAll('.creature-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
      const i = parseInt(card.dataset.index, 10);
      if (state.blindPickFocusIndex !== i) {
        state.blindPickFocusIndex = i;
        renderBlindPick();
      }
    });
  });

  if (!bp.myLocked) {
    el.querySelectorAll('.creature-card:not(.locked)').forEach(card => {
      card.addEventListener('click', () => {
        playClick();
        _toggleBlindPickCreature(card.dataset.id);
      });
    });
  }

  document.getElementById('bp-lockin-btn')?.addEventListener('click', () => {
    playClick();
    _lockInMyTeam();
  });
}

function showBlindPickStats() {
  const level = state.onlineSettings.resolvedLevelCap ?? state.battleConfig.level;
  showCreatureStats(state.blindPickFocusIndex, level, 'screen-blind-pick');
}

function moveBlindPickCursor(dir) {
  const next = moveGridCursor(state.blindPickFocusIndex, dir, RENTAL_ROSTER.length);
  if (next !== state.blindPickFocusIndex) {
    state.blindPickFocusIndex = next;
    renderBlindPick();
    document.querySelector('#screen-blind-pick .creature-card.focused')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

// ── Actions ───────────────────────────────────────────────────────────────────

function _toggleBlindPickCreature(id) {
  const team = state.blindPick.myTeam;
  const idx  = team.indexOf(id);
  if (idx !== -1) {
    team.splice(idx, 1);
  } else if (team.length < 3) {
    team.push(id);
  } else {
    playInvalid();
    return;
  }
  renderBlindPick();
}

function _lockInMyTeam() {
  const bp = state.blindPick;
  if (bp.myTeam.length < 3 || bp.myLocked) return;

  bp.myLocked = true;
  state.onlineClient.send('team_locked', { team: bp.myTeam });
  renderBlindPick();
  _checkBothLocked();
}

function _checkBothLocked() {
  const bp     = state.blindPick;
  const client = state.onlineClient;
  if (!client.isCoordinator) return;
  if (!bp.myLocked || !bp.remoteTeam) return;

  const levelCap = state.onlineSettings.resolvedLevelCap;
  client.send('match_start', {
    alphaTeam: bp.myTeam,
    betaTeam:  bp.remoteTeam,
    levelCap,
  });
  _startOnlineClassCustomization(bp.myTeam, bp.remoteTeam, levelCap);
}

function _startOnlineClassCustomization(myTeamIds, opponentTeamIds, levelCap) {
  setBattleRng(state.onlineSettings.battleSeed);
  state.battleConfig.level = levelCap;
  state.isOnlineMatch      = true;
  state.playerTeam         = myTeamIds;
  state.opponentTeam       = opponentTeamIds;
  state.blindPick.myClassReady       = false;
  state.blindPick.opponentClassReady = false;
  startClassCustomization('player');
}

function _sendOnlineClassReady() {
  state.blindPick.myClassReady = true;
  state.onlineClient.send('class_ready', { configs: state.classCustom.playerConfigs });
  state.classCustom.view = 'waiting';
  renderClassCustomization();
  _checkBothClassReady();
}

function _checkBothClassReady() {
  const bp = state.blindPick;
  if (!bp.myClassReady || !bp.opponentClassReady) return;
  _launchOnlineBattle(state.playerTeam, state.opponentTeam, state.battleConfig.level);
}

function handleClassCustomRemoteMessage(messageType, value) {
  if (messageType === 'class_ready') {
    state.blindPick.opponentClassReady = true;
    state.blindPick.opponentClassConfigs = Array.isArray(value?.configs) ? value.configs : null;
    _checkBothClassReady();
  }
}

function _launchOnlineBattle(myTeamIds, opponentTeamIds, levelCap) {
  function _applyClassConfig(built, config) {
    if (!config || !config.routeId) return;
    const pool = resolveClassPool(config.routeId, built.level);
    built.classRoute = config.routeId;
    built.classSkills = pool.skills;
    built.equippedPassives = config.equippedPassives
      .map(id => getClassPassive(id))
      .filter(Boolean);
  }
  function buildSide(teamIds, configs) {
    return SLOT_NAMES.reduce((acc, slot, i) => {
      const creature = RENTAL_ROSTER.find(c => c.id === teamIds[i]);
      if (!creature) return acc;
      const built = buildRentalCreature(creature, slot);
      _applyClassConfig(built, configs?.[i]);
      acc[slot] = built;
      return acc;
    }, {});
  }

  const arenaId   = state.onlineSettings.resolvedArenaId;
  const arenaData = arenaId ? ARENAS.find(a => a.id === arenaId) : null;
  const arenaFile = arenaData
    ? ARENA_BASE_PATH + arenaData.id + '.png'
    : resolveArena(0).file;

  state.battleState = {
    player:   buildSide(myTeamIds,       state.classCustom.playerConfigs),
    opponent: buildSide(opponentTeamIds, state.blindPick.opponentClassConfigs),
    round:    1,
    arenaFile,
  };
  setScreen('battle');
}

// ── Remote message handler (called from screen-online-lobby.js callback) ──────

function handleBlindPickRemoteMessage(messageType, value) {
  const bp     = state.blindPick;
  const client = state.onlineClient;

  if (messageType === 'match_settings') {
    state.onlineSettings.resolvedLevelCap = value.levelCap;
    state.onlineSettings.resolvedArenaId  = value.arenaId ?? null;
    bp.settingsReceived = true;
    if (state.screen === 'blind-pick') renderBlindPick();
    return;
  }

  if (messageType === 'team_locked') {
    const remoteTeam = Array.isArray(value?.team) ? value.team : [];
    bp.opponentLocked = true;

    if (client.isCoordinator) {
      bp.remoteTeam = remoteTeam;
      _checkBothLocked();
    }

    if (state.screen === 'blind-pick') renderBlindPick();
    return;
  }

  if (messageType === 'match_start') {
    // Non-coordinator receives this — alpha team is opponent, beta team is ours.
    const levelCap    = value.levelCap;
    const myTeamIds   = value.betaTeam;
    const opponentIds = value.alphaTeam;
    _startOnlineClassCustomization(myTeamIds, opponentIds, levelCap);
    return;
  }
}
