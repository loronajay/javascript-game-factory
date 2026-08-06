const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadRoundSync() {
  const context = { console };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, 'online-round-sync.js'), 'utf8');
  vm.runInContext(
    `${source}\nglobalThis.__exports = { createCbRoundSynchronizer, decorateOnlineActions, hashOnlineBattleState };`,
    context
  );
  return context.__exports;
}

function action(actorSlot = 'top') {
  return {
    actorSide: 'player',
    actorSlot,
    commandType: 'attack',
    moveId: 'basic_attack',
    targetSide: 'opponent',
    targetSlot: 'top',
    speed: 12,
  };
}

test('round synchronizer buffers an early next-round packet instead of dropping it', () => {
  const { createCbRoundSynchronizer } = loadRoundSync();
  const sync = createCbRoundSynchronizer();
  const remote = [action('middle')];

  assert.equal(sync.receiveRemoteActions({ round: 2, actions: remote }, 1).status, 'buffered');
  assert.equal(sync.beginRound(2).status, 'waiting');

  const ready = sync.submitLocalActions(2, [action('top')]);
  assert.equal(ready.status, 'ready');
  assert.equal(JSON.stringify(ready.remoteActions), JSON.stringify(remote));
});

test('round synchronizer ignores exact duplicates and rejects conflicting replays', () => {
  const { createCbRoundSynchronizer } = loadRoundSync();
  const sync = createCbRoundSynchronizer();
  const packet = { round: 3, actions: [action()] };

  sync.beginRound(3);
  assert.equal(sync.receiveRemoteActions(packet, 3).status, 'waiting');
  assert.equal(sync.receiveRemoteActions(packet, 3).status, 'duplicate');
  assert.equal(
    sync.receiveRemoteActions({ round: 3, actions: [action('bottom')] }, 3).status,
    'conflict'
  );
});

test('round synchronizer rejects stale, far-future, and malformed action packets', () => {
  const { createCbRoundSynchronizer } = loadRoundSync();
  const sync = createCbRoundSynchronizer();

  assert.equal(sync.receiveRemoteActions({ round: 1, actions: [action()] }, 2).status, 'stale');
  assert.equal(sync.receiveRemoteActions({ round: 4, actions: [action()] }, 2).status, 'invalid');
  assert.equal(sync.receiveRemoteActions({ round: 2, actions: [{ nope: true }] }, 2).status, 'invalid');
});

test('round completion is a barrier and compares both clients state hashes', () => {
  const { createCbRoundSynchronizer } = loadRoundSync();
  const sync = createCbRoundSynchronizer();

  assert.equal(sync.markLocalReady(4, 'abc123').status, 'waiting');
  assert.equal(sync.receiveRemoteReady({ round: 4, stateHash: 'abc123' }, 4).status, 'ready');
  assert.equal(sync.receiveRemoteReady({ round: 4, stateHash: 'abc123' }, 4).status, 'duplicate');

  assert.equal(sync.markLocalReady(5, 'same').status, 'waiting');
  assert.equal(sync.receiveRemoteReady({ round: 5, stateHash: 'different' }, 5).status, 'mismatch');
});

test('network action decoration gives mirrored clients the same alpha/beta identity', () => {
  const { decorateOnlineActions } = loadRoundSync();
  const alphaLocal = decorateOnlineActions([action('top')], 'alpha', false);
  const alphaRemote = decorateOnlineActions([action('top')], 'alpha', true);

  assert.equal(alphaLocal[0].networkSide, 'alpha');
  assert.equal(alphaLocal[0].actorSide, 'player');
  assert.equal(alphaRemote[0].networkSide, 'alpha');
  assert.equal(alphaRemote[0].actorSide, 'opponent');
  assert.equal(alphaRemote[0].targetSide, 'player');
});

test('battle hashes are perspective-independent and ignore random runtime ids', () => {
  const { hashOnlineBattleState } = loadRoundSync();
  const alphaCreature = {
    id: 'salamander', runtimeId: 'random-a', hp: { current: 40, max: 50 },
    mp: { current: 10, max: 20 }, stats: { speed: 12 }, _side: 'player', _slot: 'top',
  };
  const betaCreature = {
    id: 'pengun', runtimeId: 'random-b', hp: { current: 35, max: 45 },
    mp: { current: 9, max: 18 }, stats: { speed: 12 }, _side: 'opponent', _slot: 'top',
  };
  const alphaView = {
    round: 2,
    player: { top: alphaCreature },
    opponent: { top: betaCreature },
    battleStats: { player: { damageDealt: 10 }, opponent: { damageDealt: 7 } },
  };
  const betaView = {
    round: 2,
    player: { top: { ...betaCreature, hp: { ...betaCreature.hp }, mp: { ...betaCreature.mp }, runtimeId: 'other-b', _side: 'player' } },
    opponent: { top: { ...alphaCreature, hp: { ...alphaCreature.hp }, mp: { ...alphaCreature.mp }, runtimeId: 'other-a', _side: 'opponent' } },
    battleStats: { player: { damageDealt: 7 }, opponent: { damageDealt: 10 } },
  };

  assert.equal(hashOnlineBattleState(alphaView, true, 1234), hashOnlineBattleState(betaView, false, 1234));
  assert.notEqual(hashOnlineBattleState(alphaView, true, 1234), hashOnlineBattleState(betaView, false, 1235));
  betaView.player.top.hp.current--;
  assert.notEqual(hashOnlineBattleState(alphaView, true, 1234), hashOnlineBattleState(betaView, false, 1234));
});
