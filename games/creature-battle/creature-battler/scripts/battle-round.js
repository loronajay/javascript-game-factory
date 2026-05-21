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
  const end = checkBattleEnd();
  if (end) { showBattleEnd(end); return; }

  const bs = state.battleState;
  SLOT_NAMES.forEach(s => {
    if (bs.player[s])   bs.player[s].isDefending   = false;
    if (bs.opponent[s]) bs.opponent[s].isDefending = false;
  });
  updateBattleLog(`Round ${bs.round} — Select commands for your team.`);
  startCommandInput(onPlayerCommandsDone);
}

function onPlayerCommandsDone(playerActions) {
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
  const result = resolveAction(action);
  renderBattleHud();
  updateFieldKoStates();
  showResult(result, action, () => {
    const end = checkBattleEnd();
    if (end) { showBattleEnd(end); return; }
    setTimeout(() => playbackStep(actions, index + 1), 180);
  });
}

function showResult(result, action, onDone) {
  let msg = '';
  switch (result.type) {
    case 'skipped':   msg = '...'; break;
    case 'defend':    msg = `${result.actorName} braces for impact!`; break;
    case 'utility':   msg = `${result.actorName} uses ${result.moveName}!`; break;
    case 'no_target': msg = `${result.actorName}'s ${result.moveName} found no target!`; break;
    case 'miss':      msg = `${result.actorName} uses ${result.moveName}... Miss!`; break;
    case 'heal':      msg = `${result.actorName} uses ${result.moveName}! ${result.targetName} recovers ${result.amount} HP.`; break;
    case 'damage':
    case 'crit': {
      const crit = result.isCrit ? 'Critical hit! ' : '';
      const eff  = result.elemMod > 1 ? ' Super effective!' : result.elemMod < 1 ? ' Not very effective...' : '';
      msg = `${result.actorName} uses ${result.moveName}! ${crit}${result.targetName} takes ${result.amount} damage.${eff}`;
      if (result.wasKO) msg += ` ${result.targetName} is knocked out!`;
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
  updateBattleLog(msg);
  playMoveAnimation(result, action, () => {
    pendingAdvance = onDone;
    document.getElementById('battle-commands')?.classList.add('awaiting-advance');
  });
}

function endRound() {
  const end = checkBattleEnd();
  if (end) { showBattleEnd(end); return; }
  state.battleState.round++;
  setTimeout(startRound, 500);
}

function showBattleEnd(winner) {
  const msg = winner === 'player'   ? 'Victory! All opponents knocked out!'
            : winner === 'opponent' ? 'Defeat. Your team was knocked out.'
            :                        "It's a draw!";
  updateBattleLog(msg);
  setTimeout(() => renderBattleEndOverlay(winner), 1100);
}
