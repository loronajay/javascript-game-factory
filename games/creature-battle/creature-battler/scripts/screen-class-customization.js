// ── Class customization screen ────────────────────────────────────────────────
// Sits between team-select and battle. Player assigns a class route to each
// creature and equips up to 3 passives.
// Training mode: two sequential sub-phases — player's team then opponent's team.

function renderClassCustomization() {
  const cc = state.classCustom;
  if (cc.view === 'overview') _renderCCOverview();
  else if (cc.view === 'browse') _renderCCBrowse();
  else if (cc.view === 'deep') _renderCCDeep();
  else if (cc.view === 'waiting') _renderCCWaiting();
}

registerRenderer('class-customization', renderClassCustomization);

// ── Helpers ───────────────────────────────────────────────────────────────────

function _ccTeam()    { return state.classCustom.teamPhase === 'player' ? state.playerTeam   : state.opponentTeam;   }
function _ccConfigs() { return state.classCustom.teamPhase === 'player' ? state.classCustom.playerConfigs : state.classCustom.opponentConfigs; }
function _ccPhaseLabel() {
  const cc = state.classCustom;
  const side = cc.teamPhase === 'player' ? 'Your Team' : 'Opponent Team';
  return `${side} · Class Selection`;
}

function _skillCostLabel(skill) {
  if (skill.costType === 'none') return 'Free';
  if (skill.costType === 'percentMP') return `${Math.round(skill.costAmount * 100)}% MP`;
  if (skill.costType === 'flatMP')    return `${skill.costAmount} MP`;
  if (skill.costType === 'flatHP')    return `${skill.costAmount} HP`;
  if (skill.costType === 'percentHP') return `${Math.round(skill.costAmount * 100)}% HP`;
  if (skill.costType === 'selfDebuff') return 'Self-debuff';
  if (skill.costType === 'mixed')     return 'MP + HP';
  return skill.costType;
}

// ── Overview view ─────────────────────────────────────────────────────────────

function _renderCCOverview() {
  const cc = state.classCustom;
  const team = _ccTeam();
  const configs = _ccConfigs();
  const el = document.getElementById('screen-class-customization');
  const allLocked = cc.locked.every(v => v);

  el.innerHTML = `
    <div class="cc-header">
      <div class="cc-phase-label">Class Customization</div>
      <h2>${_ccPhaseLabel()}</h2>
    </div>
    <div class="cc-overview-body">
      ${team.map((id, i) => {
        const c = RENTAL_ROSTER.find(r => r.id === id);
        const cfg = configs[i];
        const isLocked = cc.locked[i];
        const isFocused = cc.creatureIndex === i;
        const stub = cfg.routeId ? getRouteStub(cfg.routeId) : null;
        const statusClass = isLocked ? 'status-locked' : (cfg.routeId ? 'status-configured' : 'status-empty');
        const statusText  = isLocked ? '✓ Locked In' : (cfg.routeId ? 'Configured' : 'No Class');
        return `
          <div class="cc-creature-card ${isFocused ? 'focused' : ''} ${isLocked ? 'locked' : ''}" data-slot="${i}">
            <img class="cc-creature-sprite" src="${c.sprite}" alt="${c.name}">
            <div class="cc-creature-name">${c.name}</div>
            <span class="element-tag element-${c.element}">${c.element}</span>
            <div class="cc-creature-status ${statusClass}">${statusText}</div>
            ${stub ? `<div class="cc-creature-route-name">${stub.name}</div>` : ''}
          </div>`;
      }).join('')}
    </div>
    ${allLocked ? `
      <div class="cc-overview-confirm">
        <button class="btn primary" id="cc-confirm-btn">
          ${state.isOnlineMatch ? 'Lock In →' : (cc.teamPhase === 'player' ? 'Next: Opponent Team →' : 'Start Battle →')}
        </button>
      </div>` : ''}
    <div class="cc-footer">
      <div class="cc-hint">${renderControlHint(`← → Select · Space / Enter Configure${state.isOnlineMatch ? '' : ' · Esc Back'}`, 'Tap a creature to configure its class')}</div>
      <div class="cc-hint" style="color:var(--cb-accent)">${cc.locked.filter(v=>v).length} / 3 Locked</div>
    </div>
    ${renderTouchActionBar([
      ...(state.isOnlineMatch ? [] : [{ id: 'back', label: 'Back' }]),
      ...(allLocked ? [{ id: 'confirm', label: state.isOnlineMatch ? 'Lock In' : (cc.teamPhase === 'player' ? 'Next' : 'Battle'), primary: true }] : []),
    ])}
  `;

  el.querySelectorAll('.cc-creature-card').forEach(card => {
    card.addEventListener('click', () => {
      const slot = parseInt(card.dataset.slot, 10);
      playClick();
      state.classCustom.creatureIndex = slot;
      _enterCCBrowse();
    });
  });

  const confirmBtn = el.querySelector('#cc-confirm-btn');
  if (confirmBtn) confirmBtn.addEventListener('click', () => { playClick(); _confirmCCPhase(); });

  bindTouchActionBar(el, {
    back() { playClick(); _backFromCCOverview(); },
    confirm() { playClick(); _confirmCCPhase(); },
  });
}

function _enterCCBrowse() {
  const cc = state.classCustom;
  // If creature already has a route configured, start browse at that route
  const cfg = _ccConfigs()[cc.creatureIndex];
  if (cfg.routeId) {
    const idx = ROUTE_STUBS.findIndex(r => r.id === cfg.routeId);
    cc.browseRouteIndex = idx >= 0 ? idx : 0;
  }
  cc.view = 'browse';
  renderClassCustomization();
}

// ── Browse view ───────────────────────────────────────────────────────────────

function _renderCCBrowse() {
  const cc = state.classCustom;
  const team = _ccTeam();
  const creature = RENTAL_ROSTER.find(r => r.id === team[cc.creatureIndex]);
  const stub = ROUTE_STUBS[cc.browseRouteIndex];
  const route = getClassRoute(stub.id);
  const level = state.battleConfig.level;
  const el = document.getElementById('screen-class-customization');
  const total = ROUTE_STUBS.length;
  const canLeft  = cc.browseRouteIndex > 0;
  const canRight = cc.browseRouteIndex < total - 1;

  let contentHTML;
  if (route) {
    const pool = resolveClassPool(stub.id, level);
    const skillsHTML = pool.skills.map(s => `
      <div class="cc-browse-item">
        <div class="cc-browse-item-name">${s.name}</div>
        <div class="cc-browse-item-meta">
          <span class="cc-browse-item-cost">${_skillCostLabel(s)}</span>
          <span class="cc-browse-item-cat">${s.category}</span>
        </div>
      </div>`).join('');
    const passivesHTML = pool.passives.map(p => `
      <div class="cc-browse-item">
        <div class="cc-browse-item-name">${p.name}</div>
        <div class="cc-browse-item-meta">
          <span class="cc-browse-item-cat">${p.category}</span>
        </div>
      </div>`).join('');
    contentHTML = `
      <div class="cc-route-content">
        <div class="cc-route-col">
          <div class="cc-col-label">Skills (${pool.skills.length})</div>
          <div class="cc-skill-list">${skillsHTML || '<div style="color:var(--cb-muted);font-size:11px;font-style:italic">None at this level</div>'}</div>
        </div>
        <div class="cc-route-col">
          <div class="cc-col-label">Passives (${pool.passives.length})</div>
          <div class="cc-passive-browse-list">${passivesHTML || '<div style="color:var(--cb-muted);font-size:11px;font-style:italic">None at this level</div>'}</div>
        </div>
      </div>
      <div class="cc-browse-select-btn">
        <button class="btn primary" id="cc-select-route-btn">Select This Class →</button>
      </div>`;
  } else {
    contentHTML = `
      <div class="cc-route-coming-soon">
        <div style="font-size:28px">🔒</div>
        <div>Coming Soon</div>
        <div style="font-size:10px;margin-top:4px">This class route is not yet available</div>
      </div>`;
  }

  el.innerHTML = `
    <div class="cc-header">
      <div class="cc-phase-label">Choose Class · ${creature.name}</div>
      <h2>Class Browse</h2>
    </div>
    <div class="cc-browse-body">
      <div class="cc-route-nav">
        <div class="cc-nav-arrow ${canLeft ? '' : 'disabled'}" id="cc-nav-left">◄</div>
        <div class="cc-route-name-block">
          <div class="cc-route-name">${stub.name}</div>
          <div class="cc-route-counter">${cc.browseRouteIndex + 1} of ${total}</div>
          <div class="cc-route-tiers">${stub.tiers.join(' → ')}</div>
        </div>
        <div class="cc-nav-arrow ${canRight ? '' : 'disabled'}" id="cc-nav-right">►</div>
      </div>
      ${contentHTML}
    </div>
    <div class="cc-footer">
      <div class="cc-hint">${renderControlHint('← → Browse · Enter Select · Esc Back', 'Use arrows to browse, then select this class')}</div>
      <div class="cc-hint" style="color:var(--cb-accent)">Lv.${level}</div>
    </div>
    ${renderTouchActionBar([
      { id: 'back', label: 'Back' },
      ...(route ? [{ id: 'select', label: 'Select Class', primary: true }] : []),
    ])}
  `;

  el.querySelector('#cc-nav-left')?.addEventListener('click',  () => { if (canLeft)  { playClick(); moveCCBrowseCursor(-1); } });
  el.querySelector('#cc-nav-right')?.addEventListener('click', () => { if (canRight) { playClick(); moveCCBrowseCursor(1);  } });
  el.querySelector('#cc-select-route-btn')?.addEventListener('click', () => { playClick(); _enterCCDeep(stub.id); });
  bindTouchActionBar(el, {
    back() { playClick(); cc.view = 'overview'; renderClassCustomization(); },
    select() { playClick(); if (route) _enterCCDeep(stub.id); },
  });
}

function _enterCCDeep(routeId) {
  const cc = state.classCustom;
  cc.selectedRouteId = routeId;
  cc.deepPassiveIndex = 0;
  cc.view = 'deep';
  renderClassCustomization();
}

// ── Deep view ─────────────────────────────────────────────────────────────────

function _renderCCDeep() {
  const cc = state.classCustom;
  const configs = _ccConfigs();
  const cfg = configs[cc.creatureIndex];
  const team = _ccTeam();
  const creature = RENTAL_ROSTER.find(r => r.id === team[cc.creatureIndex]);
  const stub = getRouteStub(cc.selectedRouteId);
  const route = getClassRoute(cc.selectedRouteId);
  const level = state.battleConfig.level;
  const pool = resolveClassPool(cc.selectedRouteId, level);
  const el = document.getElementById('screen-class-customization');

  // Passives section
  const equippedIds = cfg.routeId === cc.selectedRouteId ? [...cfg.equippedPassives] : [];
  const maxEquip = 3;
  const atMax = equippedIds.length >= maxEquip;

  const passivesHTML = pool.passives.map((p, i) => {
    const isEquipped = equippedIds.includes(p.id);
    const isMaxed    = atMax && !isEquipped;
    const isFocused  = i === cc.deepPassiveIndex;
    return `
      <div class="cc-passive-row ${isFocused ? 'focused' : ''} ${isEquipped ? 'equipped' : ''} ${isMaxed ? 'maxed' : ''}" data-passive-index="${i}">
        <div class="cc-passive-checkbox ${isEquipped ? 'checked' : ''}">${isEquipped ? '✓' : ''}</div>
        <div class="cc-passive-info">
          <div class="cc-passive-name">${p.name}</div>
          <div class="cc-passive-desc">${p.description}</div>
          <div class="cc-passive-cat">${p.category}</div>
        </div>
      </div>`;
  }).join('');

  // Skills section
  const skillsHTML = pool.skills.map(s => `
    <div class="cc-skill-auto-row">
      <div class="cc-skill-auto-name">${s.name}</div>
      <div class="cc-skill-auto-meta">
        <span class="cc-skill-auto-cost">${_skillCostLabel(s)}</span>
        <span style="color:rgba(168,216,239,0.4);font-size:8px;text-transform:uppercase;letter-spacing:0.08em">${s.category}</span>
      </div>
    </div>`).join('');

  // Passive slots display
  const slotsHTML = [0, 1, 2].map(i => {
    const pId = equippedIds[i];
    const p = pId ? getClassPassive(pId) : null;
    return `
      <div class="cc-passive-slot ${p ? 'filled' : ''}">
        <div class="cc-slot-label">Passive ${i + 1}</div>
        ${p ? `<div class="cc-slot-name">${p.name}</div>` : `<div class="cc-slot-empty">— Empty —</div>`}
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="cc-header">
      <div class="cc-phase-label">${stub.name} · ${creature.name}</div>
      <h2>Equip Passives</h2>
    </div>
    <div class="cc-deep-body">
      <div class="cc-deep-route-info">
        <div class="cc-deep-tiers">${stub.tiers.join(' → ')}</div>
      </div>
      <div class="cc-passive-slots-row">${slotsHTML}</div>
      <div class="cc-deep-cols">
        <div class="cc-passive-col">
          <div class="cc-col-label">Passives Available (${pool.passives.length}) · ${equippedIds.length}/${maxEquip} equipped</div>
          <div class="cc-passive-select-list">${passivesHTML}</div>
        </div>
        <div class="cc-skills-col">
          <div class="cc-col-label">Skills (auto-available)</div>
          <div class="cc-skills-auto-list">${skillsHTML || '<div style="color:var(--cb-muted);font-size:10px;font-style:italic">None at this level</div>'}</div>
        </div>
      </div>
      <div class="cc-deep-lockin">
        <button class="btn primary" id="cc-lockin-btn">Lock In →</button>
      </div>
    </div>
    <div class="cc-footer">
      <div class="cc-hint">${renderControlHint('↑↓ Navigate · Space Equip/Remove · Enter Lock In · Esc Back', 'Tap passives to equip or remove')}</div>
      <div class="cc-hint" style="color:var(--cb-accent)">Lv.${level}</div>
    </div>
    ${renderTouchActionBar([
      { id: 'back', label: 'Back' },
      { id: 'lock', label: 'Lock In', primary: true },
    ])}
  `;

  el.querySelectorAll('.cc-passive-row').forEach(row => {
    row.addEventListener('click', () => {
      const idx = parseInt(row.dataset.passiveIndex, 10);
      cc.deepPassiveIndex = idx;
      _toggleCCPassive();
    });
  });

  el.querySelector('#cc-lockin-btn')?.addEventListener('click', () => { playClick(); _lockInCreature(); });
  bindTouchActionBar(el, {
    back() { playClick(); cc.view = 'browse'; renderClassCustomization(); },
    lock() { playClick(); _lockInCreature(); },
  });
}

// ── Navigation functions ──────────────────────────────────────────────────────

function moveCCOverviewCursor(dir) {
  const cc = state.classCustom;
  cc.creatureIndex = Math.max(0, Math.min(2, cc.creatureIndex + dir));
  renderClassCustomization();
}

function moveCCBrowseCursor(dir) {
  const cc = state.classCustom;
  cc.browseRouteIndex = Math.max(0, Math.min(ROUTE_STUBS.length - 1, cc.browseRouteIndex + dir));
  renderClassCustomization();
}

function moveCCDeepCursor(dir) {
  const cc = state.classCustom;
  const pool = resolveClassPool(cc.selectedRouteId, state.battleConfig.level);
  cc.deepPassiveIndex = Math.max(0, Math.min(pool.passives.length - 1, cc.deepPassiveIndex + dir));
  renderClassCustomization();
}

// ── Actions ───────────────────────────────────────────────────────────────────

function _toggleCCPassive() {
  const cc = state.classCustom;
  const configs = _ccConfigs();
  const cfg = configs[cc.creatureIndex];
  const pool = resolveClassPool(cc.selectedRouteId, state.battleConfig.level);
  const passive = pool.passives[cc.deepPassiveIndex];
  if (!passive) return;

  // Ensure config reflects the currently selected route
  if (cfg.routeId !== cc.selectedRouteId) {
    cfg.routeId = cc.selectedRouteId;
    cfg.equippedPassives = [];
  }

  const idx = cfg.equippedPassives.indexOf(passive.id);
  if (idx !== -1) {
    cfg.equippedPassives.splice(idx, 1);
  } else if (cfg.equippedPassives.length < 3) {
    cfg.equippedPassives.push(passive.id);
  }

  const prevScroll = document.querySelector('.cc-passive-select-list')?.scrollTop ?? 0;
  renderClassCustomization();
  const list = document.querySelector('.cc-passive-select-list');
  if (list) list.scrollTop = prevScroll;
}

function _lockInCreature() {
  const cc = state.classCustom;
  const configs = _ccConfigs();
  const cfg = configs[cc.creatureIndex];
  // Apply route if player is locking in from deep view
  if (cfg.routeId !== cc.selectedRouteId) {
    cfg.routeId = cc.selectedRouteId;
    cfg.equippedPassives = [];
  }
  cc.locked[cc.creatureIndex] = true;
  cc.view = 'overview';
  renderClassCustomization();
}

function _backFromCCOverview() {
  const cc = state.classCustom;
  if (state.isOnlineMatch) return;
  if (cc.teamPhase === 'player') {
    state.teamSelectPhase = 'opponent';
    setScreen('team-select');
  } else {
    startClassCustomization('player');
  }
}

function _confirmCCPhase() {
  const cc = state.classCustom;
  if (!cc.locked.every(v => v)) return;
  if (state.isOnlineMatch) {
    _sendOnlineClassReady();   // defined in screen-blind-pick.js
  } else if (cc.teamPhase === 'player') {
    startClassCustomization('opponent');
  } else {
    startBattle();
  }
}

function _renderCCWaiting() {
  const el = document.getElementById('screen-class-customization');
  el.innerHTML = `
    <div class="cc-header">
      <div class="cc-phase-label">Online 1v1 · Class Customization</div>
      <h2>Ready!</h2>
    </div>
    <div style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:18px">
      <div style="font-size:56px;color:#40cc70;text-shadow:0 0 24px rgba(64,204,112,0.6)">✓</div>
      <div style="font-size:15px;font-weight:700;color:var(--cb-text);letter-spacing:0.06em">Your class is locked in.</div>
      <div style="font-size:12px;color:var(--cb-muted);letter-spacing:0.06em">Waiting for opponent<span class="cb-dots"></span></div>
    </div>
  `;
}

// ── Keyboard entry point (called from input.js) ───────────────────────────────

function handleClassCustomKey(key, rawKey) {
  const cc = state.classCustom;

  if (cc.view === 'overview') {
    if (key === 'ArrowLeft')  { moveCCOverviewCursor(-1); return; }
    if (key === 'ArrowRight') { moveCCOverviewCursor(1);  return; }
    if (rawKey === ' ' || rawKey === 'Enter') {
      _enterCCBrowse();
      return;
    }
    if (rawKey === 'Escape') {
      _backFromCCOverview();
      return;
    }
    // Allow confirm with Enter when all locked
    if (rawKey === 'Enter' && cc.locked.every(v => v)) {
      _confirmCCPhase();
    }
  }

  if (cc.view === 'browse') {
    if (key === 'ArrowLeft')  { if (cc.browseRouteIndex > 0)                     { moveCCBrowseCursor(-1); } return; }
    if (key === 'ArrowRight') { if (cc.browseRouteIndex < ROUTE_STUBS.length - 1) { moveCCBrowseCursor(1);  } return; }
    if (rawKey === 'Enter' || rawKey === ' ') {
      const stub = ROUTE_STUBS[cc.browseRouteIndex];
      const route = getClassRoute(stub.id);
      if (route) { _enterCCDeep(stub.id); }
      return;
    }
    if (rawKey === 'Escape') {
      cc.view = 'overview';
      renderClassCustomization();
      return;
    }
  }

  if (cc.view === 'deep') {
    if (key === 'ArrowUp')   { moveCCDeepCursor(-1); return; }
    if (key === 'ArrowDown') { moveCCDeepCursor(1);  return; }
    if (rawKey === ' ')      { _toggleCCPassive(); return; }
    if (rawKey === 'Enter')  { _lockInCreature(); return; }
    if (rawKey === 'Escape') {
      cc.view = 'browse';
      renderClassCustomization();
      return;
    }
  }
}
