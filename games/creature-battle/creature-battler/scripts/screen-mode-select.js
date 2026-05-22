function renderModeSelect() {
  const el = document.getElementById('screen-mode-select');
  el.innerHTML = `
    <div class="mode-select-header">
      <h2>Creature Battler</h2>
      <h1>Select Mode</h1>
    </div>
    <div class="mode-list">
      ${MODES.map((m, i) => `
        <div class="mode-card ${!m.available ? 'disabled' : ''} ${i === state.modeSelectIndex ? 'focused' : ''}"
             data-index="${i}">
          <div class="mode-card-icon">${m.icon}</div>
          <div class="mode-card-info">
            <div class="mode-card-name">${m.label}</div>
            <div class="mode-card-desc">${m.desc}</div>
          </div>
          <div class="mode-card-badge ${m.available ? 'available' : 'soon'}">
            ${m.available ? 'PLAY' : 'SOON'}
          </div>
        </div>
      `).join('')}
    </div>
    <div class="mode-select-hint">↑↓ Navigate · Space to Select · Esc to go back</div>
  `;

  el.querySelectorAll('.mode-card:not(.disabled)').forEach(card => {
    card.addEventListener('click', () => {
      playClick();
      state.modeSelectIndex = parseInt(card.dataset.index, 10);
      handleModeConfirm();
    });
  });
}

function handleModeConfirm() {
  const mode = MODES[state.modeSelectIndex];
  if (!mode.available) return;
  if (mode.id === 'training') startBattleConfig();
  if (mode.id === 'online')   enterOnlineLobby();
}

registerRenderer('mode-select', renderModeSelect);

function moveModeSelectCursor(dir) {
  const available = MODES.reduce((acc, m, i) => { if (m.available) acc.push(i); return acc; }, []);
  const cur = available.indexOf(state.modeSelectIndex);
  const next = available[(cur + dir + available.length) % available.length];
  state.modeSelectIndex = next;
  renderModeSelect();
}
