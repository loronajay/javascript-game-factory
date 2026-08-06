const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const SCRIPT_ORDER = [
  'class-data-core.js',
  'class-data-strength.js', 'class-data-defense.js', 'class-data-intelligence.js',
  'class-data-spirit.js', 'class-data-speed.js',
  'passive-registry-core.js',
  'passive-registry-strength.js', 'passive-registry-defense.js', 'passive-registry-intelligence.js',
  'passive-registry-spirit.js', 'passive-registry-speed.js',
  'skill-registry-core.js',
  'skill-registry-strength.js', 'skill-registry-defense.js', 'skill-registry-intelligence.js',
  'skill-registry-spirit.js', 'skill-registry-speed.js',
  'config.js', 'battle-engine.js', 'online-round-sync.js',
];

function makeRuntime(isCoordinator, seed) {
  const context = {
    console,
    Math,
    state: {
      isOnlineMatch: true,
      battleConfig: { level: 30 },
      battleState: null,
    },
  };
  vm.createContext(context);
  for (const filename of SCRIPT_ORDER) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, filename), 'utf8'), context);
  }
  vm.runInContext(`globalThis.__api = {
    RENTAL_ROSTER, buildRentalCreature, setBattleRng, getBattleRngState,
    sortActions, resolveAction, createCbRoundSynchronizer,
    decorateOnlineActions, hashOnlineBattleState
  };`, context);

  const api = context.__api;
  const alphaTemplate = api.RENTAL_ROSTER.find(creature => creature.id === 'salamander');
  const betaTemplate = api.RENTAL_ROSTER.find(creature => creature.id === 'salamander');
  const alpha = api.buildRentalCreature(alphaTemplate, 'top');
  const beta = api.buildRentalCreature(betaTemplate, 'top');
  alpha.hp.current = alpha.hp.max = 100000;
  beta.hp.current = beta.hp.max = 100000;

  const player = isCoordinator ? alpha : beta;
  const opponent = isCoordinator ? beta : alpha;
  player._side = 'player';
  player._slot = 'top';
  opponent._side = 'opponent';
  opponent._slot = 'top';
  context.state.battleState = {
    round: 1,
    arenaFile: 'test-arena.png',
    player: { top: player },
    opponent: { top: opponent },
    battleStats: {
      player: { damageDealt: 0, healingDone: 0, kos: 0, highestHit: 0 },
      opponent: { damageDealt: 0, healingDone: 0, kos: 0, highestHit: 0 },
    },
  };
  api.setBattleRng(seed);
  return {
    api,
    context,
    isCoordinator,
    sync: api.createCbRoundSynchronizer(),
    started: new Set(),
    finishedAt: new Map(),
    actionOrders: [],
    hashes: new Map(),
  };
}

function action() {
  return {
    actorSide: 'player', actorSlot: 'top', commandType: 'attack', moveId: 'basic_attack',
    targetSide: 'opponent', targetSlot: 'top', speed: 10,
  };
}

function runLatencyMatch({ seed, rounds, actionLatency, readyLatency, playbackDelay }) {
  const clients = [makeRuntime(true, seed), makeRuntime(false, seed)];
  const events = [];
  let sequence = 0;
  let now = 0;

  function schedule(at, run) {
    events.push({ at, sequence: sequence++, run });
    events.sort((left, right) => left.at - right.at || left.sequence - right.sequence);
  }

  function peerIndex(index) { return index === 0 ? 1 : 0; }

  function handleBarrier(index, result, completedRound) {
    if (result.status === 'mismatch') {
      assert.fail(`client ${index} detected a state mismatch after round ${completedRound}`);
    }
    if (result.status !== 'ready' || completedRound >= rounds) return;
    startRound(index, completedRound + 1);
  }

  function finishRound(index, round, readyActions) {
    const client = clients[index];
    const localNetworkSide = client.isCoordinator ? 'alpha' : 'beta';
    const remoteNetworkSide = localNetworkSide === 'alpha' ? 'beta' : 'alpha';
    const mine = client.api.decorateOnlineActions(readyActions.localActions, localNetworkSide, false);
    const theirs = client.api.decorateOnlineActions(readyActions.remoteActions, remoteNetworkSide, true);
    const ordered = client.api.sortActions([...mine, ...theirs]);
    client.actionOrders.push(ordered.map(item => item.networkSide).join(','));
    ordered.forEach(item => client.api.resolveAction(item));

    client.context.state.battleState.round++;
    client.finishedAt.set(round, now);
    const hash = client.api.hashOnlineBattleState(
      client.context.state.battleState,
      client.isCoordinator,
      client.api.getBattleRngState()
    );
    client.hashes.set(round, hash);
    const localBarrier = client.sync.markLocalReady(round, hash);
    handleBarrier(index, localBarrier, round);

    const packet = { round, stateHash: hash };
    schedule(now + readyLatency(index, round), () => {
      const remoteIndex = peerIndex(index);
      const remote = clients[remoteIndex];
      const result = remote.sync.receiveRemoteReady(packet, Math.max(1, remote.context.state.battleState.round - 1));
      handleBarrier(remoteIndex, result, round);
    });
  }

  function handleActions(index, round, result) {
    if (result.status !== 'ready') return;
    schedule(now + playbackDelay(index, round), () => finishRound(index, round, result));
  }

  function startRound(index, round) {
    const client = clients[index];
    if (client.started.has(round)) return;
    if (round > 1) {
      const otherFinished = clients[peerIndex(index)].finishedAt.get(round - 1);
      assert.notEqual(otherFinished, undefined, `client ${index} started round ${round} before its peer finished`);
    }
    client.started.add(round);
    handleActions(index, round, client.sync.beginRound(round));
    const localResult = client.sync.submitLocalActions(round, [action()]);
    handleActions(index, round, localResult);

    const packet = { round, actions: [action()] };
    schedule(now + actionLatency(index, round), () => {
      const remoteIndex = peerIndex(index);
      const remote = clients[remoteIndex];
      const result = remote.sync.receiveRemoteActions(packet, remote.context.state.battleState.round);
      handleActions(remoteIndex, round, result);
    });
  }

  startRound(0, 1);
  startRound(1, 1);
  while (events.length) {
    const event = events.shift();
    now = event.at;
    event.run();
  }

  return clients;
}

for (const scenario of [
  {
    name: 'steady asymmetric latency',
    actionLatency: index => index === 0 ? 15 : 95,
    readyLatency: index => index === 0 ? 35 : 120,
    playbackDelay: index => index === 0 ? 20 : 280,
  },
  {
    name: 'alternating jitter and a full-turn-sized playback hitch',
    actionLatency: (index, round) => 10 + ((round * 47 + index * 83) % 180),
    readyLatency: (index, round) => 5 + ((round * 71 + index * 29) % 140),
    playbackDelay: (index, round) => (index === 1 && round === 4 ? 1800 : 25 + ((round * 31) % 90)),
  },
]) {
  test(`two mirrored clients stay in lockstep under ${scenario.name}`, () => {
    const clients = runLatencyMatch({ seed: 0xC0FFEE, rounds: 8, ...scenario });
    for (let round = 1; round <= 8; round++) {
      assert.equal(clients[0].hashes.get(round), clients[1].hashes.get(round), `round ${round} hash`);
    }
    assert.deepEqual(clients[0].actionOrders, clients[1].actionOrders);
    assert.ok(clients[0].actionOrders.every(order => order === 'alpha,beta'));
    assert.equal(clients[0].context.state.battleState.round, 9);
    assert.equal(clients[1].context.state.battleState.round, 9);
  });
}
