function renderBattleConfig() {
  const el         = document.getElementById('screen-battle-config');
  const levelIdx   = state.battleConfigLevelIndex;
  const arenaIdx   = state.battleConfigArenaIndex;
  const focusSec   = state.battleConfigFocusSection;

  const arenaName  = arenaIdx === 0 ? 'Random' : ARENAS[arenaIdx - 1].name;
  const arenaFile  = arenaIdx === 0 ? null : ARENA_BASE_PATH + ARENAS[arenaIdx - 1].id + '.png';
  const arenaTotal = ARENAS.length + 1; // +1 for Random slot

  el.innerHTML = `
    <div class="battle-config-header">
      <div class="battle-config-phase">Training Battle · Step 1 of 3</div>
      <h2>Battle Setup</h2>
    </div>
    <div class="battle-config-body">
      <div class="bc-section ${focusSec === 'level' ? 'bc-focused' : ''}">
        <div class="bc-section-label">CREATURE LEVEL</div>
        <div class="level-tier-row">
          ${LEVEL_TIERS.map((t, i) => `
            <div class="level-tier-card ${i === levelIdx ? 'focused' : ''}" data-index="${i}">
              <div class="level-tier-num">Lv.${t.level}</div>
              <div class="level-tier-label">${t.label}</div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="bc-section ${focusSec === 'arena' ? 'bc-focused' : ''}">
        <div class="bc-section-label">ARENA</div>
        <div class="arena-navigator">
          <button class="arena-nav-btn" id="arena-prev" aria-label="Previous arena">&#8592;</button>
          <div class="arena-preview ${arenaFile ? '' : 'arena-preview--random'}"
               style="${arenaFile ? `background-image:url('${arenaFile}')` : ''}">
            <div class="arena-preview-name">${arenaName}</div>
            <div class="arena-preview-counter">${arenaIdx === 0 ? '' : arenaIdx + ' / ' + ARENAS.length}</div>
          </div>
          <button class="arena-nav-btn" id="arena-next" aria-label="Next arena">&#8594;</button>
        </div>
      </div>
    </div>
    <div class="battle-config-footer">
      <div class="battle-config-hint">${renderControlHint('↑↓ Section · ←→ Navigate · Space Confirm · Esc back', 'Tap a level, choose an arena, then continue')}</div>
    </div>
    ${renderTouchActionBar([
      { id: 'back', label: 'Back' },
      { id: 'continue', label: 'Continue', primary: true },
    ])}
  `;

  el.querySelectorAll('.level-tier-card').forEach(card => {
    card.addEventListener('click', () => {
      playClick();
      state.battleConfigFocusSection = 'level';
      state.battleConfigLevelIndex = parseInt(card.dataset.index, 10);
      confirmBattleConfig();
    });
  });

  document.getElementById('arena-prev')?.addEventListener('click', () => {
    playClick();
    state.battleConfigFocusSection = 'arena';
    _moveArenaCursor(-1);
  });
  document.getElementById('arena-next')?.addEventListener('click', () => {
    playClick();
    state.battleConfigFocusSection = 'arena';
    _moveArenaCursor(1);
  });

  bindTouchActionBar(el, {
    back() { playClick(); setScreen('mode-select'); },
    continue() { playClick(); confirmBattleConfig(); },
  });
}

registerRenderer('battle-config', renderBattleConfig);

function confirmBattleConfig() {
  state.battleConfig.level = LEVEL_TIERS[state.battleConfigLevelIndex].level;
  startTeamSelect();
}

function moveBattleConfigCursor(dir) {
  if (state.battleConfigFocusSection === 'arena') {
    _moveArenaCursor(dir);
  } else {
    const len = LEVEL_TIERS.length;
    state.battleConfigLevelIndex = (state.battleConfigLevelIndex + dir + len) % len;
    renderBattleConfig();
  }
}

function _moveArenaCursor(dir) {
  const total = ARENAS.length + 1;
  state.battleConfigArenaIndex = (state.battleConfigArenaIndex + dir + total) % total;
  renderBattleConfig();
}

function moveBattleConfigSection(dir) {
  state.battleConfigFocusSection = state.battleConfigFocusSection === 'level' ? 'arena' : 'level';
  renderBattleConfig();
}
