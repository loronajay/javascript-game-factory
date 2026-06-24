import {
  getUnitRenderProfile,
  getUnitVisualRadius,
  getTeamPalette,
} from '../src/render/unit-renderer.js';

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

for (const type of ['striker', 'guard', 'breaker', 'marksman']) {
  const profile = getUnitRenderProfile(type);
  assert(profile.marker, `${type} needs a readable tactical marker`);
  assert(profile.weapon, `${type} needs a readable weapon silhouette`);
  assert(profile.accent, `${type} needs a distinguishing accent`);
}

assert(
  getUnitVisualRadius(13, 0.4) === 32.5,
  'Units should retain a 13px screen radius on a small fitted battlefield',
);
assert(
  getUnitVisualRadius(17, 1) === 17,
  'Units should not grow beyond their authored radius at close scale',
);

const player = getTeamPalette('player');
const enemy = getTeamPalette('enemy');
assert(player.body !== enemy.body, 'Teams need distinct body colours');
assert(player.rim !== enemy.rim, 'Teams need distinct selection rims');

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Unit renderer checks passed.');
