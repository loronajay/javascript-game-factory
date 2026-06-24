import { getWaveLabel } from '../src/ui/hud.js';
import { calculateBattlefieldView } from '../src/core/game.js';
import { createUnit, updateBattle } from '../src/systems/battle.js';
import { WORLD } from '../src/data/map.js';

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

assert(getWaveLabel(0, 5) === '1 / 5', 'The briefing should show Wave 1');
assert(getWaveLabel(1, 5) === '1 / 5', 'The active first wave should still show Wave 1');
assert(getWaveLabel(5, 5) === '5 / 5', 'The final wave should show Wave 5');

const compactView = calculateBattlefieldView(390, 844, 1, true);
assert(compactView.reservedTop > 0 && compactView.reservedBottom > 0, 'Compact view should reserve space for both HUDs');
assert(compactView.offsetY >= compactView.reservedTop, 'Compact map should begin below the top HUD');
assert(
  compactView.offsetY + WORLD.height * compactView.scale <= 844 - compactView.reservedBottom + 0.01,
  'Compact map should end above the unit tray',
);

const game = {
  units: [],
  effects: [],
  gold: 0,
  stats: { enemiesDefeated: 0 },
  baseHp: 100,
  baseMaxHp: 100,
  selectedUnitId: null,
  cancelInteraction() {},
  navigator: { findPath: () => [] },
  playedSounds: [],
  playSound(soundId) {
    this.playedSounds.push(soundId);
  },
};
const striker = createUnit({ side: 'player', type: 'striker', x: 500, y: 500 });
const breaker = createUnit({ side: 'enemy', type: 'breaker', pathId: 'center-west', x: 530, y: 500 });
game.units = [striker, breaker];
for (let frame = 0; frame < 20; frame += 1) updateBattle(game, 1 / 60);
const hit = game.effects.find((effect) => effect.type === 'hit');
assert(hit?.matchup === 'strong', 'A favorable counterattack should be marked Strong');
assert(hit?.label?.startsWith('STRONG'), 'A favorable counterattack should show a readable Strong label');
assert(hit?.damage > 0, 'Combat feedback should report the damage dealt');
assert(game.playedSounds.includes('critical-hit'), 'A favorable melee hit should play the critical hit sound');

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Polish checks passed.');
