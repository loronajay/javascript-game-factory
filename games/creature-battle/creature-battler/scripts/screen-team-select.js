function renderTeamSelect() {
  const isPlayer = state.teamSelectPhase === 'player';
  const currentTeam = isPlayer ? state.playerTeam : state.opponentTeam;
  const otherTeam   = isPlayer ? state.opponentTeam : state.playerTeam;
  const phaseLabel  = isPlayer ? 'Step 1 of 2' : 'Step 2 of 2';
  const title       = isPlayer ? 'Choose Your Team' : 'Choose Opponent Team';

  const el = document.getElementById('screen-team-select');
  el.innerHTML = `
    <div class="team-select-header">
      <div class="team-select-title">
        <div class="phase-label">${phaseLabel} · Training Battle</div>
        <h2>${title}</h2>
      </div>
    </div>
    <div class="team-select-body">
      <div class="roster-grid">
        ${RENTAL_ROSTER.map((c, i) => {
          const isSelected  = currentTeam.includes(c.id);
          const pickedOther = otherTeam.includes(c.id);
          const isFocused   = i === state.teamSelectFocusIndex;
          const slotNum     = isSelected ? currentTeam.indexOf(c.id) + 1 : '';
          return `
            <div class="creature-card ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''}"
                 data-id="${c.id}" data-index="${i}">
              <img class="creature-card-sprite" src="${c.sprite}" alt="${c.name}">
              <div class="creature-card-name">${c.name}</div>
              <div class="creature-card-role">${c.role}</div>
              <span class="element-tag element-${c.element}">${c.element}</span>
              ${isSelected ? `<div class="selected-badge">#${slotNum}</div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
      <div class="team-sidebar">
        <div class="team-sidebar-label">${isPlayer ? 'Your Team' : 'Opponent Team'}</div>
        ${[0, 1, 2].map(slot => {
          const id = currentTeam[slot];
          const c  = id ? RENTAL_ROSTER.find(r => r.id === id) : null;
          return `
            <div class="team-slot ${c ? 'filled' : ''}">
              ${c
                ? `<img class="team-slot-sprite" src="${c.sprite}" alt="${c.name}">
                   <div class="team-slot-name">${c.name}</div>`
                : `<div class="team-slot-empty-icon"></div>
                   <div class="team-slot-empty-text">Empty</div>`
              }
            </div>
          `;
        }).join('')}
      </div>
    </div>
    <div class="team-select-footer">
      <div class="team-select-hint">↑↓←→ Navigate · Enter to pick/unpick · Esc back</div>
      <div class="team-select-count">${currentTeam.length} / 3</div>
    </div>
    ${currentTeam.length === 3 ? `
      <div style="padding:0 20px 14px;display:flex;justify-content:center">
        <button class="btn primary" id="ts-confirm-btn">
          ${isPlayer ? 'Next: Opponent Team →' : 'Start Battle →'}
        </button>
      </div>
    ` : ''}
  `;

  el.querySelectorAll('.creature-card').forEach(card => {
    card.addEventListener('click', () => {
      state.teamSelectFocusIndex = parseInt(card.dataset.index, 10);
      toggleTeamCreature(card.dataset.id);
    });
  });

  const confirmBtn = el.querySelector('#ts-confirm-btn');
  if (confirmBtn) confirmBtn.addEventListener('click', confirmTeamSelectPhase);
}

registerRenderer('team-select', renderTeamSelect);

function toggleTeamCreature(id) {
  const currentTeam = state.teamSelectPhase === 'player' ? state.playerTeam : state.opponentTeam;
  const idx = currentTeam.indexOf(id);
  if (idx !== -1) {
    currentTeam.splice(idx, 1);
  } else if (currentTeam.length < 3) {
    currentTeam.push(id);
  }
  renderTeamSelect();
}

function moveTeamSelectCursor(dir) {
  const cols = 2;
  const rows = Math.ceil(RENTAL_ROSTER.length / cols);
  let r = Math.floor(state.teamSelectFocusIndex / cols);
  let c = state.teamSelectFocusIndex % cols;

  if (dir === 'up')    r = (r - 1 + rows) % rows;
  if (dir === 'down')  r = (r + 1) % rows;
  if (dir === 'left')  c = (c - 1 + cols) % cols;
  if (dir === 'right') c = (c + 1) % cols;

  const next = r * cols + c;
  if (next < RENTAL_ROSTER.length) state.teamSelectFocusIndex = next;
  renderTeamSelect();
}
