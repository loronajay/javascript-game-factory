const inputState = {
  active: false,
  phase: 'command',       // 'command' | 'art_menu' | 'skill_menu' | 'target_select' | 'multi_confirm'
  queue: [],              // alive player slots in order
  queueIndex: 0,
  pendingCommandType: null,
  pendingMoveId: null,
  pendingTargetSide: 'opponent', // 'opponent' | 'player'
  focusedCommand: 0,
  focusedArt: 0,
  focusedSkill: 0,
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
    if (c.pendingAutoAction) {
      const pa = c.pendingAutoAction;
      c.pendingAutoAction = null;
      autoActions.push({ actorSide: 'player', actorSlot: slot, commandType: pa.commandType, moveId: pa.moveId, targetSide: pa.targetSide, targetSlot: pa.targetSlot, speed: getEffectiveSpeed(c) });
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
  const taunted  = !!creature.tauntActive;
  const aegis    = !!creature.aegisShieldActive;
  return [
    { id: 'attack', label: 'ATTACK', icon: '⚔️',  enabled: !aegis },
    { id: 'defend', label: 'DEFEND', icon: '🛡️',  enabled: true },
    { id: 'art',    label: 'ART',    icon: '✦',   enabled: !silenced && getArtsFor(creature).length > 0 },
    { id: 'skill',  label: 'SKILL',  icon: '◎',   enabled: !taunted && (creature.classSkills?.length > 0) },
    { id: 'item',   label: 'ITEM',   icon: '🧪',  enabled: false },
  ];
}

function getAllArtsFor(creature) {
  return creature.moves.filter(m => ['art', 'heal', 'utility'].includes(m.category));
}

function getArtsFor(creature) {
  const arts = getAllArtsFor(creature).filter(m => m.mpCost <= creature.mp.current);
  if (creature.tauntActive)       return arts.filter(m => m.damageClass !== 'utility' && m.damageClass !== 'heal');
  if (creature.aegisShieldActive) return arts.filter(m => m.damageClass === 'utility' || m.damageClass === 'heal');
  return arts;
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
  if (inputState.phase === 'command')            handleCommandKey(key);
  else if (inputState.phase === 'art_menu')      handleArtKey(key);
  else if (inputState.phase === 'skill_menu')    handleSkillKey(key);
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

const ART_GRID_COLS = 3;

function artGridNav(dir) {
  const grid  = getGridArts(currentCreature());
  const total = grid.length;
  const cur   = inputState.focusedArt;
  let newIdx  = cur;

  if (dir === 'left') {
    for (let i = cur - 1; i >= 0; i--) {
      if (grid[i] !== null) { newIdx = i; break; }
    }
  } else if (dir === 'right') {
    for (let i = cur + 1; i < total; i++) {
      if (grid[i] !== null) { newIdx = i; break; }
    }
  } else if (dir === 'up') {
    const t = cur - ART_GRID_COLS;
    if (t >= 0 && grid[t] !== null) newIdx = t;
  } else if (dir === 'down') {
    const t = cur + ART_GRID_COLS;
    if (t < total && grid[t] !== null) newIdx = t;
  }

  if (newIdx !== cur) {
    inputState.focusedArt = newIdx;
    renderBattleCommandPanel();
  }
}

function handleArtKey(key) {
  if (key === 'ArrowLeft')  { playClick(); artGridNav('left');  }
  if (key === 'ArrowRight') { playClick(); artGridNav('right'); }
  if (key === 'ArrowUp')    { playClick(); artGridNav('up');    }
  if (key === 'ArrowDown')  { playClick(); artGridNav('down');  }
  if (key === 'Enter' || key === ' ') { playClick(); confirmArt(); }
  if (key === 'Escape') { playClick(); inputState.phase = 'command'; renderBattleCommandPanel(); }
}

// ── Skill grid (mirrors art grid) ────────────────────────────────────────────

function sortSkillsForGrid(skills) {
  const groupMap = new Map();
  skills.forEach(s => {
    if (!groupMap.has(s.family)) groupMap.set(s.family, []);
    groupMap.get(s.family).push(s);
  });
  groupMap.forEach(g => g.sort((a, b) => a.rank - b.rank));
  const tiered = [], singles = [];
  groupMap.forEach(g => (g.length > 1 ? tiered : singles).push(g));
  const result = [];
  tiered.forEach(g => {
    result.push(...g);
    const rem = g.length % 3;
    if (rem) for (let i = 0; i < 3 - rem; i++) result.push(null);
  });
  singles.forEach(g => result.push(g[0]));
  return result;
}

function getGridSkills(creature) {
  return sortSkillsForGrid(creature.classSkills || []);
}

function skillGridNav(dir) {
  const grid  = getGridSkills(currentCreature());
  const total = grid.length;
  const cur   = inputState.focusedSkill;
  let newIdx  = cur;
  if (dir === 'left') {
    for (let i = cur - 1; i >= 0; i--) { if (grid[i] !== null) { newIdx = i; break; } }
  } else if (dir === 'right') {
    for (let i = cur + 1; i < total; i++) { if (grid[i] !== null) { newIdx = i; break; } }
  } else if (dir === 'up') {
    const t = cur - ART_GRID_COLS; if (t >= 0 && grid[t] !== null) newIdx = t;
  } else if (dir === 'down') {
    const t = cur + ART_GRID_COLS; if (t < total && grid[t] !== null) newIdx = t;
  }
  if (newIdx !== cur) { inputState.focusedSkill = newIdx; renderBattleCommandPanel(); }
}

function handleSkillKey(key) {
  if (key === 'ArrowLeft')  { playClick(); skillGridNav('left');  }
  if (key === 'ArrowRight') { playClick(); skillGridNav('right'); }
  if (key === 'ArrowUp')    { playClick(); skillGridNav('up');    }
  if (key === 'ArrowDown')  { playClick(); skillGridNav('down');  }
  if (key === 'Enter' || key === ' ') { playClick(); confirmSkill(); }
  if (key === 'Escape') { playClick(); inputState.phase = 'command'; renderBattleCommandPanel(); }
}

function _skillCostLabel(skill, actor) {
  switch (skill.costType) {
    case 'flatMP':    return `${skill.costAmount} MP`;
    case 'percentMP': return `${Math.round(skill.costAmount * 100)}% MP`;
    case 'flatHP':    return `${skill.costAmount} HP`;
    case 'percentHP': return `${Math.round(skill.costAmount * 100)}% HP`;
    case 'none':      return 'FREE';
    case 'selfDebuff':return 'DEBUFF';
    default:          return '—';
  }
}

function handleTargetKey(key) {
  const targets = aliveTargetSlots();
  if (key === 'ArrowUp'   || key === 'ArrowLeft')  { playClick(); inputState.focusedTarget = (inputState.focusedTarget - 1 + aliveTargetSlots().length) % aliveTargetSlots().length; renderBattleCommandPanel(); refreshTargetHighlight(); }
  if (key === 'ArrowDown' || key === 'ArrowRight') { playClick(); inputState.focusedTarget = (inputState.focusedTarget + 1) % aliveTargetSlots().length;                                renderBattleCommandPanel(); refreshTargetHighlight(); }
  if (key === 'Enter' || key === ' ') { playClick(); confirmTarget(); }
  if (key === 'Escape') { playClick();
    inputState.phase = inputState.pendingCommandType === 'attack' ? 'command'
                     : inputState.pendingCommandType === 'skill'  ? 'skill_menu'
                     : 'art_menu';
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
  } else if (cmd.id === 'skill') {
    inputState.focusedSkill = 0;
    inputState.phase        = 'skill_menu';
    renderBattleCommandPanel();
  }
}

function confirmArt() {
  const art = getGridArts(currentCreature())[inputState.focusedArt];
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

function confirmSkill() {
  const grid  = getGridSkills(currentCreature());
  const skill = grid[inputState.focusedSkill];
  if (!skill) return;
  if (!canUseSkill(skill, currentCreature(), { bs: state.battleState, actorSide: 'player' })) { playInvalid(); return; }
  inputState.pendingMoveId      = skill.id;
  inputState.pendingCommandType = 'skill';

  if (skill.targeting === 'self') {
    lockAction({ actorSide: 'player', actorSlot: currentSlot(), commandType: 'skill', moveId: skill.id, targetSide: 'player', targetSlot: currentSlot(), speed: getEffectiveSpeed(currentCreature()) });
    return;
  }
  if (skill.targeting === 'all_enemies') {
    inputState.pendingTargetSide = 'opponent';
    inputState.phase = 'multi_confirm';
    renderBattleCommandPanel();
    refreshMultiTargetHighlight();
    return;
  }
  if (skill.targeting === 'all_allies') {
    inputState.pendingTargetSide = 'player';
    inputState.phase = 'multi_confirm';
    renderBattleCommandPanel();
    refreshMultiTargetHighlight();
    return;
  }
  inputState.pendingTargetSide = 'opponent';
  inputState.focusedTarget     = 0;
  inputState.phase             = 'target_select';
  updateBattleLog(`${currentCreature().displayName} — click a target on the field, or use W/S to select`);
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
    inputState.phase = inputState.pendingCommandType === 'skill' ? 'skill_menu' : 'art_menu';
    renderBattleCommandPanel();
  }
}

function confirmMultiTarget() {
  clearMultiTargetHighlights();
  lockAction({
    actorSide: 'player',
    actorSlot: currentSlot(),
    commandType: inputState.pendingCommandType,
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

// ── Floating tooltip (never clipped by menu container) ───────────────────────

function _getCBTooltip() {
  let tip = document.getElementById('cb-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'cb-tooltip';
    tip.style.cssText = [
      'position:fixed',
      'z-index:9999',
      'background:rgba(2,12,30,0.97)',
      'border:1px solid var(--cb-accent)',
      'border-radius:7px',
      'padding:7px 11px',
      'width:190px',
      'font-size:11px',
      'line-height:1.5',
      'color:var(--cb-text)',
      'pointer-events:none',
      'white-space:normal',
      'text-align:center',
      'box-shadow:0 0 12px var(--cb-accent-soft)',
      'display:none',
    ].join(';');
    document.body.appendChild(tip);
  }
  return tip;
}

function _showCBTooltip(text, anchorEl) {
  const tip = _getCBTooltip();
  tip.textContent = text;
  tip.style.display = 'block';
  tip.style.left = '0px';
  tip.style.top  = '0px';

  const rect   = anchorEl.getBoundingClientRect();
  const tipH   = tip.offsetHeight;
  const tipW   = tip.offsetWidth;

  // Prefer above the element; fall back to below if it would be clipped
  let top  = rect.top - tipH - 8;
  if (top < 8) top = rect.bottom + 8;

  let left = rect.left + (rect.width / 2) - (tipW / 2);
  if (left + tipW > window.innerWidth - 8) left = window.innerWidth - tipW - 8;
  if (left < 8) left = 8;

  tip.style.left = left + 'px';
  tip.style.top  = top  + 'px';
}

function _hideCBTooltip() {
  const tip = document.getElementById('cb-tooltip');
  if (tip) tip.style.display = 'none';
}

function _wireCBTooltips(container) {
  container.querySelectorAll('[data-desc]').forEach(el => {
    const desc = el.dataset.desc;
    if (!desc) return;
    el.addEventListener('mouseenter', () => _showCBTooltip(desc, el));
    el.addEventListener('mouseleave', _hideCBTooltip);
  });
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
  _hideCBTooltip();

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
    el.innerHTML = `
      <div class="battle-cmd-prompt"><span class="cmd-actor">${creature.displayName}</span> — Choose Art ${progress} <span class="cmd-back" id="art-back">← Back</span></div>
      <div class="art-list">
        ${gridArts.map((a, gridIdx) => {
          if (!a) return `<div class="art-cell-empty"></div>`;
          const canAfford = a.mpCost <= creature.mp.current;
          const badge = a.targeting === 'all_enemies' ? '<span class="art-target-badge foes">ALL</span>'
                      : a.targeting === 'all_allies'  ? '<span class="art-target-badge allies">ALLIES</span>'
                      : '';
          return `
          <div class="art-btn ${!canAfford ? 'disabled' : ''} ${gridIdx === inputState.focusedArt ? 'focused' : ''}" data-art="${gridIdx}" ${a.desc ? `data-desc="${a.desc}"` : ''}>
            <span class="art-name">${a.name}</span>
            <div class="art-meta">
              <span class="element-tag element-${a.element}">${a.element}</span>
              <span class="art-cost ${!canAfford ? 'unaffordable' : ''}">${a.mpCost} MP</span>
              ${badge}
            </div>
          </div>`;
        }).join('')}
      </div>`;
    el.querySelectorAll('.art-btn').forEach(btn =>
      btn.addEventListener('click', () => { playClick(); inputState.focusedArt = +btn.dataset.art; confirmArt(); })
    );
    el.querySelector('.art-btn.focused')?.scrollIntoView({ block: 'nearest' });
    document.getElementById('art-back')?.addEventListener('click', () => { playClick(); inputState.phase = 'command'; renderBattleCommandPanel(); });
    _wireCBTooltips(el);

  } else if (inputState.phase === 'skill_menu') {
    const gridSkills = getGridSkills(creature);
    el.innerHTML = `
      <div class="battle-cmd-prompt"><span class="cmd-actor">${creature.displayName}</span> — Choose Skill ${progress} <span class="cmd-back" id="skill-back">← Back</span></div>
      <div class="art-list">
        ${gridSkills.map((s, i) => {
          if (!s) return `<div class="art-cell-empty"></div>`;
          const canAfford = canUseSkill(s, creature, { bs: state.battleState, actorSide: 'player' });
          const costLabel = _skillCostLabel(s, creature);
          return `
          <div class="art-btn ${!canAfford ? 'disabled' : ''} ${i === inputState.focusedSkill ? 'focused' : ''}" data-skill="${i}" ${s.description ? `data-desc="${s.description}"` : ''}>
            <span class="art-name">${s.name}</span>
            <div class="art-meta">
              <span class="art-cost ${!canAfford ? 'unaffordable' : ''}">${costLabel}</span>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    el.querySelectorAll('.art-btn').forEach(btn =>
      btn.addEventListener('click', () => { playClick(); inputState.focusedSkill = +btn.dataset.skill; confirmSkill(); })
    );
    el.querySelector('.art-btn.focused')?.scrollIntoView({ block: 'nearest' });
    document.getElementById('skill-back')?.addEventListener('click', () => { playClick(); inputState.phase = 'command'; renderBattleCommandPanel(); });
    _wireCBTooltips(el);

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
      inputState.phase = inputState.pendingCommandType === 'attack' ? 'command'
                       : inputState.pendingCommandType === 'skill'  ? 'skill_menu'
                       : 'art_menu';
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
      inputState.phase = inputState.pendingCommandType === 'skill' ? 'skill_menu' : 'art_menu';
      renderBattleCommandPanel();
    });
    el.querySelectorAll('.target-btn').forEach(btn => btn.addEventListener('click', () => { playClick(); confirmMultiTarget(); }));
  }
}
