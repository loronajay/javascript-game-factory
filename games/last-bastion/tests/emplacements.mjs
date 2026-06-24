import assert from 'node:assert/strict';
import { PLAYER_ROSTER, UNIT_TYPES } from '../src/data/units.js';
import { createUnit, updateBattle } from '../src/systems/battle.js';

function createGame(units) {
  return {
    units,
    effects: [],
    gold: 0,
    stats: { enemiesDefeated: 0 },
    baseHp: 100,
    baseMaxHp: 100,
    selectedUnitId: null,
    cancelInteraction() {},
    navigator: { findPath: () => [] },
    playSound() {},
  };
}

assert(PLAYER_ROSTER.includes('turret'), 'Player roster should include the Sentry Turret');
assert(PLAYER_ROSTER.includes('shock-mine'), 'Player roster should include the Shock Mine');

const turret = createUnit({ side: 'player', type: 'turret', x: 500, y: 500 });
const turretTarget = createUnit({ side: 'enemy', type: 'striker', pathId: 'center-west', x: 650, y: 500 });
const turretGame = createGame([turret, turretTarget]);
for (let frame = 0; frame < 100; frame += 1) updateBattle(turretGame, 1 / 60);
assert.equal(turret.x, 500, 'Turret should remain fixed in its deployment position');
assert(turretTarget.hp < turretTarget.maxHp, 'Turret should damage enemies inside its firing radius');
assert(turretGame.effects.some((effect) => effect.type === 'projectile'), 'Turret should fire visible projectiles');

const mine = createUnit({ side: 'player', type: 'shock-mine', x: 500, y: 500 });
const mineTarget = createUnit({ side: 'enemy', type: 'breaker', pathId: 'center-west', x: 535, y: 500 });
const nearbyTarget = createUnit({ side: 'enemy', type: 'striker', pathId: 'center-west', x: 560, y: 500 });
const mineGame = createGame([mine, mineTarget, nearbyTarget]);
for (let frame = 0; frame < 80 && mineGame.units.includes(mine); frame += 1) updateBattle(mineGame, 1 / 60);
assert(!mineGame.units.includes(mine), 'Shock Mine should be consumed when it detonates');
assert(mineTarget.hp < mineTarget.maxHp, 'Shock Mine should damage the triggering enemy');
assert(nearbyTarget.hp < nearbyTarget.maxHp, 'Shock Mine should damage nearby enemies');
assert(mineGame.effects.some((effect) => effect.type === 'explosion'), 'Shock Mine should create an explosion effect');

const perimeterMine = createUnit({ side: 'player', type: 'shock-mine', x: 500, y: 500 });
perimeterMine.armTimer = 0;
const perimeterBreaker = createUnit({ side: 'enemy', type: 'breaker', pathId: 'center-west', x: 564, y: 500 });
const perimeterGame = createGame([perimeterMine, perimeterBreaker]);
updateBattle(perimeterGame, 1 / 60);
assert(!perimeterGame.units.includes(perimeterMine), 'Mine should trigger when an enemy footprint reaches its proximity radius');

assert.equal(UNIT_TYPES.turret.stationary, true, 'Turret should be marked as stationary');
assert.equal(UNIT_TYPES['shock-mine'].placement, 'route', 'Shock Mine should be restricted to route placement');

console.log('Emplacement checks passed.');
