let pendingAdvance = null;

function advancePlayback() {
  if (!pendingAdvance) return false;
  const fn = pendingAdvance;
  pendingAdvance = null;
  document.getElementById('battle-commands')?.classList.remove('awaiting-advance');
  fn();
  return true;
}

function startRound() {
  _resetOnlineRoundState();
  const end = checkBattleEnd();
  if (end) { showBattleEnd(end); return; }

  const bs = state.battleState;
  SLOT_NAMES.forEach(s => {
    if (bs.player[s])   bs.player[s].isDefending   = false;
    if (bs.opponent[s]) bs.opponent[s].isDefending = false;
  });
  CreatureState.clearDefend();
  updateBattleLog(`Round ${bs.round} — Select commands for your team.`);
  startCommandInput(onPlayerCommandsDone);
}

// ── Online round sync ─────────────────────────────────────────────────────────

let _myPendingActions      = null;
let _opponentPendingActions = null;

function _resetOnlineRoundState() {
  _myPendingActions      = null;
  _opponentPendingActions = null;
}

function handleBattleRemoteMessage(messageType, value) {
  if (messageType !== 'player_actions') return;
  const raw = Array.isArray(value?.actions) ? value.actions : [];
  // Flip perspective: sender's 'player' side is our 'opponent', and vice-versa.
  const flipped = raw.map(a => ({
    ...a,
    actorSide:  'opponent',
    targetSide: a.targetSide === 'player' ? 'opponent' : 'player',
  }));

  if (_myPendingActions) {
    _resolveOnlineRound(_myPendingActions, flipped);
  } else {
    _opponentPendingActions = flipped;
  }
}

function _resolveOnlineRound(myActions, opponentActions) {
  _resetOnlineRoundState();
  const allActions = sortActions([...myActions, ...opponentActions]);
  updateBattleLog('Commands locked! Resolving...');
  setTimeout(() => playbackStep(allActions, 0), 700);
}

// ── Round flow ────────────────────────────────────────────────────────────────

function onPlayerCommandsDone(playerActions) {
  if (state.isOnlineMatch) {
    state.onlineClient.send('player_actions', { actions: playerActions });
    updateBattleLog('Waiting for opponent…');
    if (_opponentPendingActions) {
      _resolveOnlineRound(playerActions, _opponentPendingActions);
    } else {
      _myPendingActions = playerActions;
    }
    return;
  }
  const aiActions  = selectAiCommands();
  const allActions = sortActions([...playerActions, ...aiActions]);
  updateBattleLog('Commands locked! Resolving...');
  setTimeout(() => playbackStep(allActions, 0), 700);
}

function playbackStep(actions, index) {
  if (index >= actions.length) {
    endRound();
    return;
  }
  const action = actions[index];
  const preview = previewAction(action);
  showResult(preview, action, () => {
    updateFieldKoStates();
    const end = checkBattleEnd();
    if (end) { showBattleEnd(end); return; }
    setTimeout(() => playbackStep(actions, index + 1), 180);
  });
}

function getResultMessage(result) {
  let msg = '';
  switch (result.type) {
    case 'skipped':   msg = '...'; break;
    case 'stunned':   msg = `${result.actorName} is stunned and cannot act!`; break;
    case 'silenced':  msg = `${result.actorName} is silenced — cannot use ${result.moveName}!`; break;
    case 'defend':    msg = `${result.actorName} braces for impact!`; break;
    case 'utility': {
      const target = result.targetName ? ` ${result.targetName}:` : '';
      const status = result.statusText ? ` ${result.statusText}!` : '';
      msg = `${result.actorName} uses ${result.moveName}!${target}${status}`;
      break;
    }
    case 'no_target': msg = `${result.actorName}'s ${result.moveName} found no target!`; break;
    case 'miss':      msg = `${result.actorName} uses ${result.moveName}... Miss!`; break;
    case 'heal':      msg = `${result.actorName} uses ${result.moveName}! ${result.targetName} recovers ${result.amount} HP.`; break;
    case 'absorb':    msg = `${result.actorName} uses ${result.moveName}! ${result.targetName} absorbs the attack and recovers ${result.amount} HP!`; break;
    case 'damage':
    case 'crit': {
      const crit = result.isCrit ? 'Critical hit! ' : '';
      const eff  = result.elemMod > 1 ? ' Super effective!' : result.elemMod < 1 ? ' Not very effective...' : '';
      msg = `${result.actorName} uses ${result.moveName}! ${crit}${result.targetName} takes ${result.amount} damage.${eff}`;
      if (result.lifestolen)   msg += ` ${result.actorName} restored ${result.lifestolen} HP.`;
      if (result.statusText)   msg += ` ${result.statusText}!`;
      if (result.recoilAmount) msg += ` ${result.actorName} takes ${result.recoilAmount} recoil!`;
      if (result.wasKO) msg += ` ${result.targetName} is knocked out!`;
      break;
    }
    case 'multi_hit': {
      const landed = result.hits.filter(h => !h.missed);
      const parts  = landed.map(h => `${h.damage}${h.isCrit ? '!' : ''}`).join(' + ');
      const total  = landed.reduce((s, h) => s + h.damage, 0);
      const eff    = landed.find(h => h.elemMod > 1) ? ' Super effective!' : landed.find(h => h.elemMod < 1) ? ' Not very effective...' : '';
      const ko     = result.hits.some(h => h.wasKO) ? ` ${result.targetName} is knocked out!` : '';
      msg = `${result.actorName} uses ${result.moveName}! ${result.targetName} takes ${parts} (${total} total).${eff}${ko}`;
      break;
    }
    case 'world_tree': {
      const dmg   = result.damageHits.map(h => h.missed ? `${h.name} missed` : `${h.name} ${h.amount}${h.wasKO ? ' KO!' : ''}`).join(' / ');
      const heals = result.allyHeals.map(h => `${h.name} +${h.amount}`).join(' / ');
      msg = `${result.actorName} uses ${result.moveName}! Hits: ${dmg}. Heals: ${heals}.`;
      break;
    }
    case 'multi': {
      const parts = result.hits.map(h => {
        if (h.missed) return `${h.name} missed`;
        if (result.damageClass === 'heal') return `${h.name} +${h.amount}`;
        return `${h.name} ${h.amount}${h.wasKO ? ' KO!' : ''}`;
      });
      const verb = result.damageClass === 'heal' ? 'heals' : 'hits all';
      msg = `${result.actorName} uses ${result.moveName}! ${verb}: ${parts.join(' / ')}`;
      break;
    }
    default: msg = '...';
  }
  return msg;
}

function showResult(result, action, onDone) {
  playMoveAnimation(result, action, () => {
    updateBattleLog(getResultMessage(result));
    pendingAdvance = onDone;
    document.getElementById('battle-commands')?.classList.add('awaiting-advance');
  }, {
    onImpact: () => {
      result = resolveAction(action);
      renderBattleHud();
      return result;
    },
  });
}

function endRound() {
  const end = checkBattleEnd();
  if (end) { showBattleEnd(end); return; }
  const tickResults = applyEndOfRoundStatuses();
  renderBattleHud();
  if (tickResults.length) {
    const tickMsg = tickResults.map(t => {
      const label = STATUS_DEFS[t.statusId]?.label || t.statusId.toUpperCase();
      return `${t.creatureName} (${label}: −${t.damage} HP${t.wasKO ? ' KO!' : ''})`;
    }).join(', ');
    updateBattleLog(`End of round — ${tickMsg}`);
    const afterTick = checkBattleEnd();
    if (afterTick) { setTimeout(() => showBattleEnd(afterTick), 900); return; }
  }
  advanceStatusDurations();
  renderBattleHud();
  state.battleState.round++;
  setTimeout(startRound, tickResults.length ? 900 : 500);
}

function showBattleEnd(winner) {
  const msg = winner === 'player'   ? 'Victory! All opponents knocked out!'
            : winner === 'opponent' ? 'Defeat. Your team was knocked out.'
            :                        "It's a draw!";
  updateBattleLog(msg);
  setTimeout(() => renderBattleEndOverlay(winner), 1100);
}
