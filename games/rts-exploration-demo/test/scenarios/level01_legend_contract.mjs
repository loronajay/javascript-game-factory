import { buildGameMap } from '../../src/map.js';
import { level01 } from '../../src/maps/level-01.js';
import { result } from './helpers.mjs';

const map = buildGameMap(level01);
const landmarkAt = (kind, tileX, tileY) => map.landmarks.find((landmark) => (
  landmark.kind === kind && landmark.tileX === tileX && landmark.tileY === tileY
));
const campAt = (kind, tileX, tileY, guardian, resourceKind) => {
  const landmark = landmarkAt(kind, tileX, tileY);
  return landmark?.guardian === guardian && landmark.resourceKind === resourceKind && landmark.size === 'large';
};

const dragonCrystal = landmarkAt('postDragonDeposit', 102, 33);
const dragonBiomass = landmarkAt('postDragonDeposit', 94, 20);

// This is the player's legend as executable map data. Generic neutral creature
// behavior may only represent the two gold Drifters; it may not stand in for
// future Behemoth, Zombie Worm, or Space Dragon implementations.
result(
  map.resourceNodes.length === 0
    && (level01.spawns.neutral ?? []).every((spawn) => spawn.type === 'drifter')
    && landmarkAt('nexus', 7, 6)?.team === 1
    && landmarkAt('nexus', 121, 121)?.team === 2
    && campAt('behemothCamp', 6, 62, 'behemoth', 'organicCrystal')
    && campAt('behemothCamp', 121, 62, 'behemoth', 'organicCrystal')
    && campAt('zombieWormCamp', 64, 7, 'zombieWorm', 'organicBiomass')
    && campAt('zombieWormCamp', 64, 119, 'zombieWorm', 'organicBiomass')
    && dragonCrystal?.resourceKind === 'organicCrystal'
    && dragonCrystal?.active === false
    && dragonBiomass?.resourceKind === 'organicBiomass'
    && dragonBiomass?.active === false
    && landmarkAt('spaceDragon', 64, 64)
    && landmarkAt('drifter', 43, 44)
    && landmarkAt('drifter', 84, 83),
  {
    scenario: 'level01_legend_contract',
    resources: map.resourceNodes.length,
    neutralSpawns: level01.spawns.neutral ?? [],
    landmarks: map.landmarks,
  },
);
