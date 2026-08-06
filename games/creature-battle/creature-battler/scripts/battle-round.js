let pendingAdvance = null;
let _onlineRoundSync = createCbRoundSynchronizer();
let _onlineSyncFailed = false;

function resetOnlineBattleSync() {
  _onlineRoundSync.reset(state.battleState?.round ?? 1);
  _onlineSyncFailed = false;
}

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

  // Damage Store: deferred physical damage lands and converts to a strike this round.
  getAllCreatures().forEach(c => {
    if (!c.damageStorePool || c.damageStorePool <= 0 || c.isKnockedOut) return;
    const pool = c.damageStorePool;
    c.damageStorePool  = 0;
    c.damageStorePower = pool;
    c.hp.current = Math.max(0, c.hp.current - pool);
    if (c.hp.current <= 0 && !c.isKnockedOut) {
      c.isKnockedOut = true;
      clearBattleModifiers(c);
    }
    if (!c.isKnockedOut) {
      c.pendingAutoAction = { commandType: 'skill', moveId: 'damage_store_strike' };
    }
  });

  tickRelentlessStreaks();
  if (typeof tickSpeedStreaks === 'function') tickSpeedStreaks();
  const bs = state.battleState;
  SLOT_NAMES.forEach(s => {
    if (bs.player[s])   { bs.player[s].isDefending = false;   bs.player[s].wasHitSuperEffective = false; }
    if (bs.opponent[s]) { bs.opponent[s].isDefending = false; bs.opponent[s].wasHitSuperEffective = false; }
  });
  CreatureState.clearDefend();
  updateBattleLog(`Round ${bs.round} — Select commands for your team.`);
  startCommandInput(onPlayerCommandsDone);
  if (state.isOnlineMatch) {
    _handleOnlineActionResult(_onlineRoundSync.beginRound(bs.round));
  }
}

// ── Online round sync ─────────────────────────────────────────────────────────

function _networkSideForLocalPlayer() {
  return state.onlineClient?.isCoordinator ? 'alpha' : 'beta';
}

function handleBattleRemoteMessage(messageType, value) {
  if (_onlineSyncFailed) return;
  if (messageType === 'player_actions') {
    _handleOnlineActionResult(
      _onlineRoundSync.receiveRemoteActions(value, state.battleState?.round ?? 1)
    );
    return;
  }
  if (messageType === 'round_ready') {
    const completedRound = Math.max(1, (state.battleState?.round ?? 1) - 1);
    _handleOnlineBarrierResult(
      _onlineRoundSync.receiveRemoteReady(value, completedRound),
      value?.round
    );
    return;
  }
  if (messageType === 'sync_error') {
    _failOnlineSync(value, false);
  }
}

function _handleOnlineActionResult(result) {
  if (!result || ['waiting', 'buffered', 'duplicate', 'stale'].includes(result.status)) return;
  if (result.status !== 'ready') {
    _failOnlineSync({ round: state.battleState?.round ?? 1, cause: `action_${result.status}` });
    return;
  }
  const myNetworkSide = _networkSideForLocalPlayer();
  const opponentNetworkSide = myNetworkSide === 'alpha' ? 'beta' : 'alpha';
  const myActions = decorateOnlineActions(result.localActions, myNetworkSide, false);
  const opponentActions = decorateOnlineActions(result.remoteActions, opponentNetworkSide, true);
  if (!myActions || !opponentActions) {
    _failOnlineSync({ round: state.battleState?.round ?? 1, cause: 'invalid_actions' });
    return;
  }
  const allActions = sortActions([...myActions, ...opponentActions]);
  updateBattleLog('Commands locked! Resolving...');
  setTimeout(() => playbackStep(allActions, 0), 700);
}

function _handleOnlineBarrierResult(result, round) {
  if (!result || ['waiting', 'duplicate', 'stale'].includes(result.status)) return;
  if (result.status === 'ready') {
    updateBattleLog(`Round ${round} synced.`);
    setTimeout(startRound, 300);
    return;
  }
  _failOnlineSync({
    round: Number.isInteger(round) ? round : Math.max(1, (state.battleState?.round ?? 1) - 1),
    cause: result.status,
    localHash: result.localHash,
    remoteHash: result.remoteHash,
  });
}

function _failOnlineSync(details, notifyPeer = true) {
  if (_onlineSyncFailed) return;
  _onlineSyncFailed = true;
  if (notifyPeer) state.onlineClient?.send('sync_error', details);
  renderBattleSyncError(details);
}

// ── Round flow ────────────────────────────────────────────────────────────────

function onPlayerCommandsDone(playerActions) {
  if (state.isOnlineMatch) {
    const round = state.battleState.round;
    const result = _onlineRoundSync.submitLocalActions(round, playerActions);
    if (result.status === 'invalid' || result.status === 'conflict') {
      _failOnlineSync({ round, cause: `local_action_${result.status}` });
      return;
    }
    state.onlineClient.send('player_actions', { round, actions: playerActions });
    updateBattleLog('Waiting for opponent…');
    _handleOnlineActionResult(result);
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
    case 'no_target':    msg = `${result.actorName}'s ${result.moveName} found no target!`; break;
    case 'no_activate':  msg = `${result.actorName} readies ${result.moveName}... but wasn't hit by a super effective move last turn!`; break;
    case 'miss':      msg = `${result.actorName} uses ${result.moveName}... Miss!`; break;
    case 'heal':      msg = `${result.actorName} uses ${result.moveName}! ${result.targetName} recovers ${result.amount} HP.`; break;
    case 'absorb':    msg = `${result.actorName} uses ${result.moveName}! ${result.targetName} absorbs the attack and recovers ${result.amount} HP!`; break;
    case 'damage':
    case 'crit': {
      const crit = result.isCrit ? 'Critical hit! ' : '';
      const eff  = result.elemMod > 1 ? ' Super effective!' : result.elemMod < 1 ? ' Not very effective...' : '';
      msg = `${result.actorName} uses ${result.moveName}! ${crit}${result.targetName} takes ${result.amount} damage.${eff}`;
      if (result.lifestolen)   msg += ` ${result.actorName} restored ${result.lifestolen} HP.`;
      if (result.drainAmount)  msg += ` ${result.actorName} drained ${result.drainAmount} HP!`;
      if (result.statusText)   msg += ` ${result.statusText}!`;
      if (result.recoilAmount) msg += ` ${result.actorName} takes ${result.recoilAmount} recoil!`;
      if (result.wardReflect)  msg += ` Ward reflects ${result.wardReflect} back!`;
      if (result.wasKO) msg += ` ${result.targetName} is knocked out!`;
      if (result.echoAmount)   msg += ` Spell Echo! +${result.echoAmount} more.${result.echoWasKO ? ' KO!' : ''}`;
      if (result.stormAmount)  msg += ` Spellstorm! +${result.stormAmount} more.${result.stormWasKO ? ' KO!' : ''}`;
      break;
    }
    case 'multi_hit': {
      const landed = result.hits.filter(h => !h.missed);
      const allAbsorb = landed.every(h => h.elemMod === 'absorb');
      if (allAbsorb) {
        const recovered = landed.reduce((s, h) => s + (h.healAmount ?? 0), 0);
        msg = `${result.actorName} uses ${result.moveName}! ${result.targetName} absorbs the attack and recovers ${recovered} HP!`;
      } else {
        const parts = landed.map(h => h.elemMod === 'absorb' ? `absorb` : `${h.damage}${h.isCrit ? '!' : ''}`).join(' + ');
        const total = landed.reduce((s, h) => s + (h.damage ?? 0), 0);
        const eff   = landed.find(h => h.elemMod > 1) ? ' Super effective!' : landed.find(h => typeof h.elemMod === 'number' && h.elemMod < 1) ? ' Not very effective...' : '';
        const ko    = result.hits.some(h => h.wasKO) ? ` ${result.targetName} is knocked out!` : '';
        msg = `${result.actorName} uses ${result.moveName}! ${result.targetName} takes ${parts} (${total} total).${eff}${ko}`;
      }
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
        if (h.elemMod === 'absorb') return `${h.name} absorbed (+${h.amount})`;
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
      accumulateBattleStats(result, action.actorSide);
      renderBattleHud();
      return result;
    },
  });
}

function endRound() {
  const end = checkBattleEnd();
  if (end) { showBattleEnd(end); return; }
  const tickResults = applyEndOfRoundStatuses();
  tickResults.forEach(t => {
    if (!t.wasKO) return;
    const creditSide = t.side === 'player' ? 'opponent' : 'player';
    if (state.battleState.battleStats?.[creditSide]) state.battleState.battleStats[creditSide].kos++;
  });
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
  tickStatModifiers();
  advanceStatusDurations();
  getAllCreatures().forEach(c => {
    if (c.vengeanceActive > 0) c.vengeanceActive--;
    c.isChallengedBy = null;
    // Defense round-end passive effects (Resilient HP regen, etc.)
    if (!c.isKnockedOut) applyPassiveOnRoundEnd(c);
    // Clear per-round Defense state flags
    c.barrierHP            = 0;
    c.counterStanceActive  = false;
    c.retaliationActive    = false;
    c.retaliationCount     = 0;
    c.damageStoreActive    = false;
    c.damageStorePower     = 0;
    c.standFirmActive      = false;
    c.totalDefenseActive   = false;
    c.aegisShieldActive    = false;
    c.absorbActive         = false;
    c.meditateActive       = false;
    c.channelActive        = false;
    c.attuneActive         = false;
    c.usedMagicLastRound   = c.usedMagicThisRound || false;
    c.usedMagicThisRound   = false;
    c.wasHitLastRound      = c.wasHitThisRound || false;
    c.wasHitThisRound      = false;
    // totalDefenseUsedLastTurn gates the alternating-turn restriction; set it for next round check
    if (c.totalDefenseJustUsed) { c.totalDefenseUsedLastTurn = true; c.totalDefenseJustUsed = false; }
    else { c.totalDefenseUsedLastTurn = false; }
    // Clear per-round Spirit state flags
    c.wardActive           = false;
    c.wardDamageReduction  = 0;
    c.wardMPRestoreRate    = 0;
    c.wardReflectRatio     = 0;
    c.arcaneVeilActive     = false;
    c.quickenActive        = false;
    // Deep Meditation: deferred restore fires at round end before clearing the flag.
    if (c.deepMeditationActive) {
      const deferred = Math.floor(c.mp.max * 0.20);
      c.mp.current = Math.min(c.mp.max, c.mp.current + deferred);
      c.deepMeditationActive = false;
    }
    // Transcendence persists until the creature is KO'd or the battle ends (not cleared per round).
    // quickenActive is a one-round buff cleared above; transcendenceActive is persistent.
    // Clear per-round Speed state flags
    c.afterimageActive     = false;
    c.afterimage3Ready     = false;
    c.vaultActive          = false;
    c.hasEvadedThisRound   = false;
  });
  // Decrement Shield Wall team aura duration
  ['player', 'opponent'].forEach(side => {
    if ((state.battleState[side].shieldWallTurns || 0) > 0) {
      state.battleState[side].shieldWallTurns--;
      if (state.battleState[side].shieldWallTurns === 0) {
        SLOT_NAMES.forEach(s => { if (state.battleState[side][s]) state.battleState[side][s].shieldWallActive = false; });
      }
    }
  });
  renderBattleHud();
  const completedRound = state.battleState.round;
  state.battleState.round++;
  if (state.isOnlineMatch) {
    const stateHash = hashOnlineBattleState(
      state.battleState,
      !!state.onlineClient?.isCoordinator,
      typeof getBattleRngState === 'function' ? getBattleRngState() : null
    );
    const result = _onlineRoundSync.markLocalReady(completedRound, stateHash);
    state.onlineClient.send('round_ready', { round: completedRound, stateHash });
    updateBattleLog(`Round ${completedRound} complete — syncing opponent...`);
    _handleOnlineBarrierResult(result, completedRound);
    return;
  }
  setTimeout(startRound, tickResults.length ? 900 : 500);
}

function showBattleEnd(winner) {
  const msg = winner === 'player'   ? 'Victory! All opponents knocked out!'
            : winner === 'opponent' ? 'Defeat. Your team was knocked out.'
            :                        "It's a draw!";
  updateBattleLog(msg);
  setTimeout(() => renderBattleEndOverlay(winner), 1100);
}
