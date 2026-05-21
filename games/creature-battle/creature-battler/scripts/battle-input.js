const inputState = {
  active: false,
  phase: 'command',       // 'command' | 'art_menu' | 'target_select'
  queue: [],              // alive player slots in order
  queueIndex: 0,
  pendingCommandType: null,
  pendingMoveId: null,
  pendingTargetSide: 'opponent', // 'opponent' | 'player'
  focusedCommand: 0,
  focusedArt: 0,
  focusedTarget: 0,
  lockedActions: [],
  onComplete: null,
  logMessage: 'Preparing for battle...',
};

function alivePlayerSlots() {
  return SLOT_NAMES.filter(s => {
    const c = state.battleState.player[s];
    return c && !c.isKnockedOut;
  });
}

function startCommandInput(onComplete) {
  const allAlive = alivePlayerSlots();
  if (!allAlive.length) { onComplete([]); return; }
  const autoActions = [];
  const needsInput = allAlive.filter(slot => {
    const c = state.battleState.player[slot];
    if (hasStatus(c, 'stun')) {
      autoActions.push({ actorSide: 'player', actorSlot: slot, commandType: 'art', moveId: null, targetSide: null, targetSlot: null, speed: getEffectiveSpeed(c) });
      return false;
    }
    return true;
  });
  if (!needsInput.length) { onComplete(autoActions); return; }
  inputState.queue          = needsInput;
  inputState.queueIndex     = 0;
  inputState.phase          = 'command';
  inputState.focusedCommand = 0;
  inputState.focusedArt     = 0;
  inputState.focusedTarget  = 0;
  inputState.lockedActions  = autoActions;
  inputState.pendingCommandType = null;
  inputState.pendingMoveId  = null;
  inputState.active         = true;
  inputState.onComplete     = onComplete;
  renderBattleCommandPanel();
  highlightActiveCommander();
}

function currentSlot()     { return inputState.queue[inputState.queueIndex]; }
function currentCreature() { return state.battleState.player[currentSlot()]; }

function getCommandDefs(creature) {
  const silenced = hasStatus(creature, 'silence');
  return [
    { id: 'attack', label: 'ATTACK', icon: '⚔️',  enabled: true },
    { id: 'defend', label: 'DEFEND', icon: '🛡️',  enabled: true },
    { id: 'art',    label: 'ART',    icon: '✦',   enabled: !silenced && getArtsFor(creature).length > 0 },
    { id: 'skill',  label: 'SKILL',  icon: '◎',   enabled: false },
    { id: 'item',   label: 'ITEM',   icon: '🧪',  enabled: false },
  ];
}

function getAllArtsFor(creature) {
  return creature.moves.filter(m => ['art', 'heal', 'utility'].includes(m.category));
}

function getArtsFor(creature) {
  return getAllArtsFor(creature).filter(m => m.mpCost <= creature.mp.current);
}

function sortArtsForGrid(arts) {
  const baseOf = id => id.replace(/_[23]$/, '');
  const tierOf = id => id.endsWith('_3') ? 3 : id.endsWith('_2') ? 2 : 1;
  const groupMap = new Map();
  arts.forEach(a => {
    const base = baseOf(a.id);
    if (!groupMap.has(base)) groupMap.set(base, []);
    groupMap.get(base).push(a);
  });
  groupMap.forEach(g => g.sort((a, b) => tierOf(a.id) - tierOf(b.id)));
  const tiered = [], singles = [];
  groupMap.forEach(g => (g.length > 1 ? tiered : singles).push(g));
  tiered.sort((a, b) => a[0].learnedAt - b[0].learnedAt);
  singles.sort((a, b) => a[0].learnedAt - b[0].learnedAt);
  const result = [];
  tiered.forEach(g => {
    result.push(...g);
    const rem = g.length % 3;
    if (rem) for (let i = 0; i < 3 - rem; i++) result.push(null);
  });
  singles.forEach(g => result.push(g[0]));
  return result;
}

function getGridArts(creature) {
  return sortArtsForGrid(getAllArtsFor(creature));
}

function getNonNullArts(creature) {
  return getGridArts(creature).filter(Boolean);
}

function aliveTargetSlots() {
  const side = inputState.pendingTargetSide;
  return SLOT_NAMES.filter(s => { const c = state.battleState[side][s]; return c && !c.isKnockedOut; });
}

// ── Key handler (called from input.js) ──────────────────────────────────────

function handleBattleKey(key) {
  if (!inputState.active) return;
  if (inputState.phase === 'command')          handleCommandKey(key);
  else if (inputState.phase === 'art_menu')    handleArtKey(key);
  else if (inputState.phase === 'target_select') handleTargetKey(key);
  else if (inputState.phase === 'multi_confirm') handleMultiConfirmKey(key);
}

function handleCommandKey(key) {
  const cmds  = getCommandDefs(currentCreature());
  const count = cmds.length;
  if (key === 'ArrowLeft')  { playClick(); inputState.focusedCommand = (inputState.focusedCommand - 1 + count) % count; renderBattleCommandPanel(); }
  if (key === 'ArrowRight') { playClick(); inputState.focusedCommand = (inputState.focusedCommand + 1) % count;          renderBattleCommandPanel(); }
  if (key === 'Enter' || key === ' ') { playClick(); confirmCommand(); }
  if (key === 'Escape' && inputState.queueIndex > 0) { playClick(); undoLast(); }
}

function handleArtKey(key) {
  const arts = getNonNullArts(currentCreature());
  if (key === 'ArrowUp'   || key === 'ArrowLeft')  { playClick(); inputState.focusedArt = (inputState.focusedArt - 1 + arts.length) % arts.length; renderBattleCommandPanel(); }
  if (key === 'ArrowDown' || key === 'ArrowRight') { playClick(); inputState.focusedArt = (inputState.focusedArt + 1) % arts.length;                renderBattleCommandPanel(); }
  if (key === 'Enter' || key === ' ') { playClick(); confirmArt(); }
  if (key === 'Escape') { playClick(); inputState.phase = 'command'; renderBattleCommandPanel(); }
}

function handleTargetKey(key) {
  const targets = aliveTargetSlots();
  if (key === 'ArrowUp'   || key === 'ArrowLeft')  { playClick(); inputState.focusedTarget = (inputState.focusedTarget - 1 + aliveTargetSlots().length) % aliveTargetSlots().length; renderBattleCommandPanel(); refreshTargetHighlight(); }
  if (key === 'ArrowDown' || key === 'ArrowRight') { playClick(); inputState.focusedTarget = (inputState.focusedTarget + 1) % aliveTargetSlots().length;                                renderBattleCommandPanel(); refreshTargetHighlight(); }
  if (key === 'Enter' || key === ' ') { playClick(); confirmTarget(); }
  if (key === 'Escape') { playClick();
    inputState.phase = inputState.pendingCommandType === 'attack' ? 'command' : 'art_menu';
    clearTargetHighlights();
    renderBattleCommandPanel();
  }
}

// ── Command confirmation ─────────────────────────────────────────────────────

function confirmCommand() {
  const cmds = getCommandDefs(currentCreature());
  const cmd  = cmds[inputState.focusedCommand];
  if (!cmd || !cmd.enabled) { playInvalid(); return; }
  inputState.pendingCommandType = cmd.id;

  if (cmd.id === 'defend') {
    lockAction({ actorSide: 'player', actorSlot: currentSlot(), commandType: 'defend', moveId: null, targetSide: null, targetSlot: null, speed: getEffectiveSpeed(currentCreature()) });
  } else if (cmd.id === 'attack') {
    inputState.pendingMoveId      = 'basic_attack';
    inputState.pendingTargetSide  = 'opponent';
    inputState.focusedTarget      = 0;
    inputState.phase              = 'target_select';
    updateBattleLog(`${currentCreature().displayName} — click a target on the field, or use W/S to select`);
    renderBattleCommandPanel();
    refreshTargetHighlight();
  } else if (cmd.id === 'art') {
    inputState.focusedArt = 0;
    inputState.phase      = 'art_menu';
    renderBattleCommandPanel();
  }
}

function confirmArt() {
  const arts = getNonNullArts(currentCreature());
  if (!arts.length) return;
  const art = arts[inputState.focusedArt];
  if (!art) return;
  if (art.mpCost > currentCreature().mp.current) { playInvalid(); return; }
  inputState.pendingMoveId = art.id;

  if (art.damageClass === 'utility') {
    if (art.targeting === 'self') {
      lockAction({ actorSide: 'player', actorSlot: currentSlot(), commandType: 'art', moveId: art.id, targetSide: 'player', targetSlot: currentSlot(), speed: getEffectiveSpeed(currentCreature()) });
      return;
    }
    if (art.targeting === 'all_allies' || art.targeting === 'all_enemies') {
      inputState.pendingTargetSide = art.targeting === 'all_allies' ? 'player' : 'opponent';
      inputState.phase = 'multi_confirm';
      renderBattleCommandPanel();
      refreshMultiTargetHighlight();
      return;
    }
    inputState.pendingTargetSide = art.targeting === 'single_ally' ? 'player' : 'opponent';
    inputState.focusedTarget     = 0;
    inputState.phase             = 'target_select';
    const sideLabel = art.targeting === 'single_ally' ? 'an ally' : 'a target';
    updateBattleLog(`${currentCreature().displayName} — click ${sideLabel} on the field, or use W/S to select`);
    renderBattleCommandPanel();
    refreshTargetHighlight();
    return;
  }

  if (art.damageClass === 'heal' && art.targeting === 'self') {
    lockAction({ actorSide: 'player', actorSlot: currentSlot(), commandType: 'art', moveId: art.id, targetSide: 'player', targetSlot: currentSlot(), speed: getEffectiveSpeed(currentCreature()) });
    return;
  }

  if (art.targeting === 'all_enemies' || art.targeting === 'all_allies') {
    inputState.pendingTargetSide = art.targeting === 'all_allies' ? 'player' : 'opponent';
    inputState.phase = 'multi_confirm';
    renderBattleCommandPanel();
    refreshMultiTargetHighlight();
    return;
  }

  inputState.pendingTargetSide = art.damageClass === 'heal' ? 'player' : 'opponent';
  inputState.focusedTarget     = 0;
  inputState.phase             = 'target_select';
  const sideLabel = art.damageClass === 'heal' ? 'an ally' : 'a target';
  updateBattleLog(`${currentCreature().displayName} — click ${sideLabel} on the field, or use W/S to select`);
  renderBattleCommandPanel();
  refreshTargetHighlight();
}

function confirmTarget() {
  const targets = aliveTargetSlots();
  const tgtSlot = targets[inputState.focusedTarget];
  if (!tgtSlot) { playInvalid(); return; }
  clearTargetHighlights();
  lockAction({ actorSide: 'player', actorSlot: currentSlot(), commandType: inputState.pendingCommandType, moveId: inputState.pendingMoveId, targetSide: inputState.pendingTargetSide, targetSlot: tgtSlot, speed: getEffectiveSpeed(currentCreature()) });
}

function lockAction(action) {
  inputState.lockedActions.push(action);
  inputState.queueIndex++;

  // Re-sync queue against live state in case anything changed
  const remaining = alivePlayerSlots().filter(
    s => !inputState.lockedActions.some(a => a.actorSlot === s)
  );

  if (!remaining.length) {
    inputState.active = false;
    clearAllInputHighlights();
    renderBattleCommandPanel();
    inputState.onComplete(inputState.lockedActions);
  } else {
    inputState.queue          = [...inputState.lockedActions.map(a => a.actorSlot), ...remaining];
    inputState.phase          = 'command';
    inputState.focusedCommand = 0;
    inputState.pendingCommandType = null;
    inputState.pendingMoveId  = null;
    renderBattleCommandPanel();
    highlightActiveCommander();
  }
}

function undoLast() {
  inputState.lockedActions.pop();
  inputState.queueIndex--;
  inputState.phase          = 'command';
  inputState.focusedCommand = 0;
  renderBattleCommandPanel();
  highlightActiveCommander();
}

function handleMultiConfirmKey(key) {
  if (key === 'Enter' || key === ' ') { playClick(); confirmMultiTarget(); }
  if (key === 'Escape') {
    playClick();
    clearMultiTargetHighlights();
    inputState.phase = 'art_menu';
    renderBattleCommandPanel();
  }
}

function confirmMultiTarget() {
  clearMultiTargetHighlights();
  lockAction({
    actorSide: 'player',
    actorSlot: currentSlot(),
    commandType: 'art',
    moveId: inputState.pendingMoveId,
    targetSide: inputState.pendingTargetSide,
    targetSlot: null,
    speed: getEffectiveSpeed(currentCreature()),
  });
}

function refreshMultiTargetHighlight() {
  clearMultiTargetHighlights();
  if (inputState.phase !== 'multi_confirm') return;
  const side = inputState.pendingTargetSide;
  SLOT_NAMES.forEach(s => {
    const c = state.battleState[side][s];
    if (c && !c.isKnockedOut) {
      document.querySelector(`[data-creature="${side}-${s}"]`)?.classList.add('multi-targeted');
    }
  });
}

function clearMultiTargetHighlights() {
  document.querySelectorAll('.battle-creature.multi-targeted').forEach(el => el.classList.remove('multi-targeted'));
}

// ── Visual highlights ────────────────────────────────────────────────────────

function highlightActiveCommander() {
  clearAllInputHighlights();
  if (!inputState.active) return;

  // Mark locked-in creatures
  inputState.lockedActions.forEach(a => {
    document.querySelector(`[data-hud="player-${a.actorSlot}"]`)?.classList.add('locked');
    document.querySelector(`[data-creature="player-${a.actorSlot}"]`)?.classList.add('locked-in');
  });

  // Mark current active creature
  const slot = currentSlot();
  document.querySelector(`[data-hud="player-${slot}"]`)?.classList.add('active');
  document.querySelector(`[data-creature="player-${slot}"]`)?.classList.add('commanding');
}

function refreshTargetHighlight() {
  clearTargetHighlights();
  if (inputState.phase !== 'target_select') return;
  const side    = inputState.pendingTargetSide;
  const targets = aliveTargetSlots();
  const slot    = targets[inputState.focusedTarget];
  if (slot) document.querySelector(`[data-creature="${side}-${slot}"]`)?.classList.add('targeted');
  wireFieldTargetClicks();
}

function wireFieldTargetClicks() {
  // Reset cursor on all field creatures
  document.querySelectorAll('[data-creature]').forEach(el => {
    el.style.cursor = '';
    el.onclick = null;
  });

  if (inputState.phase !== 'target_select') return;
  const side    = inputState.pendingTargetSide;
  const targets = aliveTargetSlots();

  targets.forEach((slot, i) => {
    const el = document.querySelector(`[data-creature="${side}-${slot}"]`);
    if (!el) return;
    el.style.cursor = 'pointer';
    el.onclick = () => {
      playClick();
      inputState.focusedTarget = i;
      confirmTarget();
    };
  });
}

function clearTargetHighlights() {
  document.querySelectorAll('.battle-creature.targeted').forEach(el => el.classList.remove('targeted'));
  document.querySelectorAll('[data-creature]').forEach(el => { el.style.cursor = ''; el.onclick = null; });
}

function clearAllInputHighlights() {
  document.querySelectorAll('[data-hud]').forEach(el => el.classList.remove('active', 'locked'));
  document.querySelectorAll('[data-creature]').forEach(el => {
    el.classList.remove('commanding', 'locked-in', 'targeted', 'multi-targeted');
    el.style.cursor = '';
    el.onclick = null;
  });
}

// ── Command panel rendering ──────────────────────────────────────────────────

function renderBattleCommandPanel() {
  const el = document.getElementById('battle-commands');
  if (!el) return;

  if (!inputState.active) {
    el.innerHTML = `<div class="battle-cmd-announcement" onclick="playClick();advancePlayback()">${inputState.logMessage}</div>`;
    return;
  }

  const creature = currentCreature();
  const progress = `<span class="cmd-progress">${inputState.queueIndex + 1}/${inputState.queue.length}</span>`;

  if (inputState.phase === 'command') {
    const cmds = getCommandDefs(creature);
    el.innerHTML = `
      <div class="battle-cmd-prompt"><span class="cmd-actor">${creature.displayName}</span> — Choose Command ${progress}</div>
      <div class="battle-cmd-row">
        ${cmds.map((c, i) => `
          <div class="command-btn ${!c.enabled ? 'disabled' : ''} ${i === inputState.focusedCommand ? 'focused' : ''}" data-cmd="${i}">
            <span class="command-icon">${c.icon}</span>
            <span class="command-label">${c.label}</span>
          </div>`).join('')}
      </div>`;
    el.querySelectorAll('.command-btn:not(.disabled)').forEach(btn =>
      btn.addEventListener('click', () => { playClick(); inputState.focusedCommand = +btn.dataset.cmd; confirmCommand(); })
    );

  } else if (inputState.phase === 'art_menu') {
    const gridArts = getGridArts(creature);
    let nonNullIdx = 0;
    el.innerHTML = `
      <div class="battle-cmd-prompt"><span class="cmd-actor">${creature.displayName}</span> — Choose Art ${progress} <span class="cmd-back" id="art-back">← Back</span></div>
      <div class="art-list">
        ${gridArts.map(a => {
          if (!a) return `<div class="art-cell-empty"></div>`;
          const artIdx = nonNullIdx++;
          const canAfford = a.mpCost <= creature.mp.current;
          const badge = a.targeting === 'all_enemies' ? '<span class="art-target-badge foes">ALL</span>'
                      : a.targeting === 'all_allies'  ? '<span class="art-target-badge allies">ALLIES</span>'
                      : '';
          return `
          <div class="art-btn ${!canAfford ? 'disabled' : ''} ${artIdx === inputState.focusedArt ? 'focused' : ''}" data-art="${artIdx}">
            <span class="art-name">${a.name}</span>
            <div class="art-meta">
              <span class="element-tag element-${a.element}">${a.element}</span>
              <span class="art-cost ${!canAfford ? 'unaffordable' : ''}">${a.mpCost} MP</span>
              ${badge}
            </div>
            ${a.desc ? `<div class="art-tooltip">${a.desc}</div>` : ''}
          </div>`;
        }).join('')}
      </div>`;
    el.querySelectorAll('.art-btn').forEach(btn =>
      btn.addEventListener('click', () => { playClick(); inputState.focusedArt = +btn.dataset.art; confirmArt(); })
    );
    el.querySelector('.art-btn.focused')?.scrollIntoView({ block: 'nearest' });
    document.getElementById('art-back')?.addEventListener('click', () => { playClick(); inputState.phase = 'command'; renderBattleCommandPanel(); });

  } else if (inputState.phase === 'target_select') {
    const side     = inputState.pendingTargetSide;
    const targets  = aliveTargetSlots();
    const moveName = getMoveData(inputState.pendingMoveId)?.name || 'Attack';
    const sideLabel = side === 'player' ? 'Ally' : 'Target';
    el.innerHTML = `
      <div class="battle-cmd-prompt"><span class="cmd-actor">${creature.displayName}</span> — ${sideLabel} for ${moveName} <span class="cmd-back" id="tgt-back">← Back</span></div>
      <div class="battle-cmd-row target-row">
        ${targets.map((s, i) => {
          const c = state.battleState[side][s];
          return `
            <div class="target-btn ${side === 'player' ? 'ally' : ''} ${i === inputState.focusedTarget ? 'focused' : ''}" data-tgt="${i}">
              <img src="${c.sprite}" style="width:32px;height:32px;image-rendering:pixelated;object-fit:contain;flex-shrink:0">
              <div class="target-info">
                <div class="target-name">${c.displayName}</div>
                <div class="hud-bar-row">
                  <span class="hud-bar-label hp">HP</span>
                  <div class="hud-bar-track"><div class="hud-bar-fill hp" style="width:${pct(c.hp)}%"></div></div>
                  <span class="hud-bar-nums">${c.hp.current}/${c.hp.max}</span>
                </div>
                <div class="hud-bar-row">
                  <span class="hud-bar-label mp">MP</span>
                  <div class="hud-bar-track"><div class="hud-bar-fill mp" style="width:${pct(c.mp)}%"></div></div>
                  <span class="hud-bar-nums">${c.mp.current}/${c.mp.max}</span>
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>`;
    el.querySelectorAll('.target-btn').forEach(btn =>
      btn.addEventListener('click', () => { playClick(); inputState.focusedTarget = +btn.dataset.tgt; confirmTarget(); })
    );
    document.getElementById('tgt-back')?.addEventListener('click', () => {
      playClick();
      inputState.phase = inputState.pendingCommandType === 'attack' ? 'command' : 'art_menu';
      clearTargetHighlights();
      renderBattleCommandPanel();
    });
    refreshTargetHighlight();

  } else if (inputState.phase === 'multi_confirm') {
    const move    = getMoveData(inputState.pendingMoveId);
    const side    = inputState.pendingTargetSide;
    const targets = SLOT_NAMES.filter(s => { const c = state.battleState[side][s]; return c && !c.isKnockedOut; });
    const label   = side === 'player' ? 'All Allies' : 'All Foes';
    el.innerHTML = `
      <div class="battle-cmd-prompt">
        <span class="cmd-actor">${creature.displayName}</span> — ${move?.name} → <span class="multi-confirm-label ${side === 'player' ? 'allies' : 'foes'}">${label}</span>
        <span class="cmd-back" id="multi-back">← Back</span>
      </div>
      <div class="battle-cmd-row target-row">
        ${targets.map(s => {
          const c = state.battleState[side][s];
          return `<div class="target-btn ${side === 'player' ? 'ally' : ''} focused">
            <img src="${c.sprite}" style="width:28px;height:28px;image-rendering:pixelated;object-fit:contain">
            <span class="target-name">${c.displayName}</span>
            <span class="target-hp">${c.hp.current}/${c.hp.max}</span>
          </div>`;
        }).join('')}
      </div>`;
    el.querySelector('#multi-back')?.addEventListener('click', () => {
      playClick();
      clearMultiTargetHighlights();
      inputState.phase = 'art_menu';
      renderBattleCommandPanel();
    });
    el.querySelectorAll('.target-btn').forEach(btn => btn.addEventListener('click', () => { playClick(); confirmMultiTarget(); }));
  }
}
