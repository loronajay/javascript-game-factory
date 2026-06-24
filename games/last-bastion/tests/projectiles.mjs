import assert from 'node:assert/strict';
import {
  addMeleeSwingEffect,
  launchProjectile,
  updateCombatEffects,
} from '../src/systems/effects.js';

const target = { id: 2, x: 180, y: 100, hp: 50, maxHp: 50, dead: false, flash: 0 };
const playedSounds = [];
const game = {
  units: [target],
  effects: [],
  playSound: (soundId) => playedSounds.push(soundId),
};

launchProjectile(game, {
  source: { x: 100, y: 100 },
  target,
  damage: 17,
  strong: false,
  weak: false,
  matchup: 'neutral',
  speed: 200,
});

assert.equal(game.effects.length, 1, 'A ranged attack should create a projectile');
assert.equal(target.hp, 50, 'Projectile damage should wait for impact');

updateCombatEffects(game, 0.2);
assert.equal(target.hp, 50, 'A projectile should not damage its target mid-flight');
assert.equal(game.effects[0].type, 'projectile', 'Projectile should remain visible while travelling');

updateCombatEffects(game, 0.25);
assert.equal(target.hp, 33, 'Projectile should deal its stored damage on impact');
assert.equal(game.effects[0].type, 'hit', 'Projectile should become an impact effect on contact');
assert.deepEqual(playedSounds, ['arrow-hit'], 'Projectile impacts should play the arrow hit sound');

const swingGame = { units: [], effects: [] };
addMeleeSwingEffect(swingGame, {
  attacker: { x: 40, y: 70, type: 'guard', side: 'player' },
  defender: { x: 100, y: 70 },
});
assert.equal(swingGame.effects[0].type, 'slash', 'A melee attack should create a readable weapon swing');
assert.equal(swingGame.effects[0].style, 'thrust', 'Guard attacks should use a spear-thrust visual');
updateCombatEffects(swingGame, 0.08);
assert.equal(swingGame.effects.length, 1, 'Melee swing should remain visible briefly');
updateCombatEffects(swingGame, 0.2);
assert.equal(swingGame.effects.length, 0, 'Melee swing should expire after its animation');

console.log('Projectile checks passed.');
