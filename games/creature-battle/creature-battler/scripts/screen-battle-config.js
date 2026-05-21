function renderBattleConfig() {
  const el = document.getElementById('screen-battle-config');
  const idx = state.battleConfigLevelIndex;

  el.innerHTML = `
    <div class="battle-config-header">
      <div class="battle-config-phase">Training Battle · Step 1 of 3</div>
      <h2>Choose Creature Level</h2>
      <div class="battle-config-sub">All creatures on both teams will be built at this level.</div>
    </div>
    <div class="battle-config-body">
      <div class="level-tier-row">
        ${LEVEL_TIERS.map((t, i) => `
          <div class="level-tier-card ${i === idx ? 'focused' : ''}" data-index="${i}">
            <div class="level-tier-num">Lv.${t.level}</div>
            <div class="level-tier-label">${t.label}</div>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="battle-config-footer">
      <div class="battle-config-hint">←→ Navigate · Space Confirm · Esc back</div>
    </div>
  `;

  el.querySelectorAll('.level-tier-card').forEach(card => {
    card.addEventListener('click', () => {
      playClick();
      state.battleConfigLevelIndex = parseInt(card.dataset.index, 10);
      confirmBattleConfig();
    });
  });
}

registerRenderer('battle-config', renderBattleConfig);

function confirmBattleConfig() {
  state.battleConfig.level = LEVEL_TIERS[state.battleConfigLevelIndex].level;
  startTeamSelect();
}

function moveBattleConfigCursor(dir) {
  const len = LEVEL_TIERS.length;
  state.battleConfigLevelIndex = (state.battleConfigLevelIndex + dir + len) % len;
  renderBattleConfig();
}
