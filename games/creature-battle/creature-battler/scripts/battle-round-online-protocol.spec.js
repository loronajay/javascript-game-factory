const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadBattleRound({ coordinator = true } = {}) {
  const sent = [];
  const logs = [];
  const playbackBatches = [];
  const syncErrors = [];
  let commandStarts = 0;

  const context = {
    console,
    state: {
      isOnlineMatch: true,
      onlineClient: {
        isCoordinator: coordinator,
        send(messageType, value) { sent.push({ messageType, value }); },
      },
      battleState: {
        round: 1,
        arenaFile: 'arena.png',
        player: {},
        opponent: {},
        battleStats: { player: {}, opponent: {} },
      },
    },
    SLOT_NAMES: [],
    CreatureState: { clearDefend() {} },
    updateBattleLog(message) { logs.push(message); },
    startCommandInput() { commandStarts++; },
    sortActions(actions) {
      return [...actions].sort((a, b) => a.networkSide === 'alpha' ? -1 : b.networkSide === 'alpha' ? 1 : 0);
    },
    checkBattleEnd() { return null; },
    showBattleEnd() {},
    selectAiCommands() { return []; },
    setTimeout(fn) { fn(); },
    previewAction() { return { type: 'skipped' }; },
    playMoveAnimation() {},
    accumulateBattleStats() {},
    resolveAction() { return { type: 'skipped' }; },
    renderBattleHud() {},
    updateFieldKoStates() {},
    applyEndOfRoundStatuses() { return []; },
    tickStatModifiers() {},
    advanceStatusDurations() {},
    getAllCreatures() { return []; },
    applyPassiveOnRoundEnd() {},
    clearBattleModifiers() {},
    tickRelentlessStreaks() {},
    tickSpeedStreaks() {},
    STATUS_DEFS: {},
    renderBattleEndOverlay() {},
    renderBattleSyncError(details) { syncErrors.push(details); },
    document: { getElementById() { return null; } },
  };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, 'online-round-sync.js'), 'utf8'),
    context
  );
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'battle-round.js'), 'utf8'), context);
  // Capture resolution without entering animation playback.
  context.playbackStep = (actions) => playbackBatches.push(actions);

  return {
    context,
    sent,
    logs,
    playbackBatches,
    syncErrors,
    get commandStarts() { return commandStarts; },
  };
}

function action(slot = 'top') {
  return {
    actorSide: 'player', actorSlot: slot, commandType: 'attack', moveId: 'basic_attack',
    targetSide: 'opponent', targetSlot: 'top', speed: 10,
  };
}

test('battle action packets are round-addressed and resolve with canonical network sides', () => {
  const harness = loadBattleRound({ coordinator: false });
  harness.context.startRound();
  harness.context.onPlayerCommandsDone([action('middle')]);

  assert.equal(harness.sent[0].messageType, 'player_actions');
  assert.equal(harness.sent[0].value.round, 1);

  harness.context.handleBattleRemoteMessage('player_actions', { round: 1, actions: [action('top')] });
  assert.equal(harness.playbackBatches.length, 1);
  assert.deepEqual(
    Array.from(harness.playbackBatches[0], item => `${item.networkSide}:${item.actorSide}`),
    ['alpha:opponent', 'beta:player']
  );

  // Relay replays must not resolve the same turn twice.
  harness.context.handleBattleRemoteMessage('player_actions', { round: 1, actions: [action('top')] });
  assert.equal(harness.playbackBatches.length, 1);
});

test('online endRound waits at the completion barrier before starting the next turn', () => {
  const harness = loadBattleRound();
  harness.context.startRound();
  harness.context.endRound();

  assert.equal(harness.context.state.battleState.round, 2);
  assert.equal(harness.commandStarts, 1, 'only round 1 input should have started');
  const ready = harness.sent.find(item => item.messageType === 'round_ready');
  assert.ok(ready);
  assert.equal(ready.value.round, 1);

  harness.context.handleBattleRemoteMessage('round_ready', ready.value);
  assert.equal(harness.commandStarts, 2, 'round 2 starts only after both clients are ready');
});

test('state-hash disagreement ends the match cleanly instead of continuing desynced', () => {
  const harness = loadBattleRound();
  harness.context.startRound();
  harness.context.endRound();
  const ready = harness.sent.find(item => item.messageType === 'round_ready');

  harness.context.handleBattleRemoteMessage('round_ready', {
    round: ready.value.round,
    stateHash: ready.value.stateHash === '00000000' ? 'ffffffff' : '00000000',
  });

  assert.equal(harness.commandStarts, 1);
  assert.equal(harness.syncErrors.length, 1);
  assert.equal(harness.syncErrors[0].round, 1);
});
