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
              ${isFocused ? `<div class="card-stats-hint">R · Stats</div>` : ''}
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
      <div class="team-select-hint">↑↓←→ Navigate · Space pick/unpick · R stats · F guide · Esc back</div>
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
      playClick();
      state.teamSelectFocusIndex = parseInt(card.dataset.index, 10);
      toggleTeamCreature(card.dataset.id);
    });
  });

  const confirmBtn = el.querySelector('#ts-confirm-btn');
  if (confirmBtn) confirmBtn.addEventListener('click', () => { playClick(); confirmTeamSelectPhase(); });
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

// Shared grid navigation: row-aware, clamping (no wrap), handles incomplete last rows.
// cols comes from ROSTER_COLS so adding creatures never needs a code change here.
function moveGridCursor(current, dir, total) {
  const cols = ROSTER_COLS;
  const rows = Math.ceil(total / cols);
  let r = Math.floor(current / cols);
  let c = current % cols;

  if (dir === 'left'  && c > 0) c--;
  if (dir === 'right' && c < cols - 1) c++;
  if (dir === 'up'   && r > 0) r--;
  if (dir === 'down' && r < rows - 1) r++;

  const next = r * cols + c;
  return next < total ? next : total - 1;
}

function moveTeamSelectCursor(dir) {
  state.teamSelectFocusIndex = moveGridCursor(state.teamSelectFocusIndex, dir, RENTAL_ROSTER.length);
  renderTeamSelect();
}

// ── Creature stats popup ──────────────────────────────────────────────────────

function isStatsPopupOpen() {
  return !!document.getElementById('creature-stats-popup');
}

function hideCreatureStats() {
  document.getElementById('creature-stats-popup')?.remove();
}

function showCreatureStats(indexOverride, levelOverride, screenIdOverride) {
  const idx = indexOverride ?? state.teamSelectFocusIndex;
  const creature = RENTAL_ROSTER[idx];
  if (!creature) return;
  hideCreatureStats();

  const level = levelOverride ?? state.battleConfig.level;
  const stats = resolveStats(creature, level);
  const moves = getCreatureMoves(creature.id, level);
  const arts   = moves.filter(m => m.category === 'art' || m.category === 'heal' || m.category === 'utility');
  const skills = moves.filter(m => m.category === 'skill');

  function targetBadge(targeting) {
    if (targeting === 'all_enemies') return `<span class="art-target-badge foes">ALL FOES</span>`;
    if (targeting === 'all_allies')  return `<span class="art-target-badge allies">ALL ALLIES</span>`;
    if (targeting === 'self')        return `<span class="art-target-badge self-target">SELF</span>`;
    return `<span class="art-target-badge single-target">SINGLE</span>`;
  }

  function moveEntryHTML(m) {
    const elemTag = m.element !== 'neutral'
      ? `<span class="element-tag element-${m.element}">${m.element}</span>` : '';
    const mpTag = m.mpCost > 0 ? `<span class="move-entry-mp">${m.mpCost} MP</span>` : '';
    return `
      <div class="move-entry">
        <div class="move-entry-header">
          <span class="move-entry-name">${m.name}</span>
          ${elemTag}
          ${targetBadge(m.targeting)}
          ${mpTag}
        </div>
        <div class="move-entry-desc">${m.desc}</div>
      </div>`;
  }

  function sectionHTML(label, list, emptyMsg) {
    const content = list.length
      ? `<div class="move-list">${list.map(moveEntryHTML).join('')}</div>`
      : emptyMsg ? `<div class="stats-section-empty">${emptyMsg}</div>` : '';
    if (!content) return '';
    return `
      <div class="stats-section-label">${label}</div>
      ${content}`;
  }

  const popup = document.createElement('div');
  popup.id = 'creature-stats-popup';
  popup.className = 'creature-stats-popup';
  popup.innerHTML = `
    <div class="stats-popup-card">
      <div class="stats-popup-header">
        <img class="stats-popup-sprite" src="${creature.sprite}" alt="${creature.name}">
        <div class="stats-popup-identity">
          <div class="stats-popup-name">${creature.name}</div>
          <span class="element-tag element-${creature.element}">${creature.element}</span>
          <div class="stats-popup-role">${creature.role}</div>
        </div>
      </div>
      <div class="stats-popup-body">
        <div class="stats-section-label">Stats · Lv.${level}</div>
        <div class="stats-resources">
          <div class="stat-item hp"><div class="stat-label">HP</div><div class="stat-value">${stats.hp}</div></div>
          <div class="stat-item mp"><div class="stat-label">MP</div><div class="stat-value">${stats.mp}</div></div>
        </div>
        <div class="stats-combat">
          <div class="stat-item"><div class="stat-label">STR</div><div class="stat-value">${stats.strength}</div></div>
          <div class="stat-item"><div class="stat-label">DEF</div><div class="stat-value">${stats.defense}</div></div>
          <div class="stat-item"><div class="stat-label">INT</div><div class="stat-value">${stats.intelligence}</div></div>
          <div class="stat-item"><div class="stat-label">SPR</div><div class="stat-value">${stats.spirit}</div></div>
          <div class="stat-item spd"><div class="stat-label">SPD</div><div class="stat-value">${stats.speed}</div></div>
        </div>
        ${sectionHTML('Arts', arts)}
        ${sectionHTML('Skills', skills, 'Skills coming soon...')}
      </div>
      <div class="stats-popup-footer">R · ESC — Close</div>
    </div>`;

  popup.addEventListener('click', e => {
    if (e.target === popup) { playClick(); hideCreatureStats(); }
  });
  document.getElementById(screenIdOverride ?? 'screen-team-select').appendChild(popup);
}
