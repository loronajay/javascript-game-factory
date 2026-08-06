const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function sortedSlots(playerNetworkSide) {
  const context = {
    console,
    Math,
    SLOT_NAMES: ['top', 'middle', 'bottom'],
    state: {
      isOnlineMatch: true,
      battleState: {
        player: { top: { stats: { speed: 10 }, statusEffects: [], statModifiers: [], equippedPassives: [] } },
        opponent: { top: { stats: { speed: 10 }, statusEffects: [], statModifiers: [], equippedPassives: [] } },
      },
    },
    getPassiveStatMultiplier() { return 1; },
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, 'battle-engine.js'), 'utf8');
  vm.runInContext(`${source}\nglobalThis.__sortActions = sortActions;`, context);

  const opponentNetworkSide = playerNetworkSide === 'alpha' ? 'beta' : 'alpha';
  const actions = [
    { actorSide: 'player', actorSlot: 'top', commandType: 'attack', networkSide: playerNetworkSide },
    { actorSide: 'opponent', actorSlot: 'top', commandType: 'attack', networkSide: opponentNetworkSide },
  ];
  return Array.from(context.__sortActions(actions), (item) => item.networkSide);
}

test('equal-speed online actions use alpha as the perspective-independent tiebreaker', () => {
  assert.deepEqual(sortedSlots('alpha'), ['alpha', 'beta']);
  assert.deepEqual(sortedSlots('beta'), ['alpha', 'beta']);
});
