import { BATTLEFIELDS } from '../src/data/maps.js';

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

for (const battlefield of BATTLEFIELDS) {
  const { palette } = battlefield;
  assert(battlefield.labels.length === 0, `${battlefield.name} should not place text labels over the terrain`);
  assert(battlefield.renderRoutes === false, `${battlefield.name} should not render route roads over the terrain`);
  for (const key of ['sky', 'terrain', 'routeGlow', 'danger', 'accent', 'grid']) {
    assert(palette[key], `${battlefield.name} needs a ${key} art colour`);
  }
  assert(palette.top !== palette.bottom, `${battlefield.name} needs vertical colour depth`);
  assert(palette.routeGlow !== palette.danger, `${battlefield.name} needs readable route and threat colours`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Battlefield art checks passed.');
