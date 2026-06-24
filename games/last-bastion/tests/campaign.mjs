import {
  CAMPAIGN,
  getMissionById,
  getNextMission,
  getStartingMission,
} from '../src/data/missions.js';
import { BATTLEFIELDS, getBattlefieldById } from '../src/data/maps.js';
import { isWorldWalkable } from '../src/data/map.js';

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

assert(CAMPAIGN.length >= 2, 'Campaign needs more than one playable stage');
assert(getStartingMission() === CAMPAIGN[0], 'Campaign should start at the first stage');

for (let index = 0; index < CAMPAIGN.length; index += 1) {
  const mission = CAMPAIGN[index];
  const map = getBattlefieldById(mission.mapId);
  assert(getMissionById(mission.id) === mission, `${mission.id} should resolve from its id`);
  assert(mission.mapId, `${mission.id} should declare a battlefield map`);
  assert(map, `${mission.id} should resolve its authored map`);
  assert(mission.waves.length > 0, `${mission.id} needs at least one wave`);
  for (const wave of mission.waves) {
    assert(wave.units.length > 0, `${mission.id}/${wave.label} needs spawns`);
    for (const spawn of wave.units) {
      assert(
        map?.enemyPaths.some((path) => path.id === spawn.path),
        `${mission.id}/${wave.label} references unknown path ${spawn.path}`,
      );
    }
  }
  assert(
    getNextMission(mission.id) === (CAMPAIGN[index + 1] ?? null),
    `${mission.id} should advance to the next campaign stage`,
  );
}

assert(getMissionById('missing-stage') === null, 'Unknown stages should not silently resolve');
assert(getNextMission('missing-stage') === null, 'Unknown stages should not have a next stage');

assert(BATTLEFIELDS.length >= 2, 'Campaign map authoring should support multiple battlefields');
const expandedBattlefieldIds = ['ironwood-bridge', 'reactor-shards'];
for (const mapId of expandedBattlefieldIds) {
  assert(getBattlefieldById(mapId), `Expanded campaign should include ${mapId}`);
  assert(
    CAMPAIGN.some((mission) => mission.mapId === mapId),
    `Expanded battlefield ${mapId} should have a campaign operation`,
  );
}
for (const map of BATTLEFIELDS) {
  assert(map.world.width > 0 && map.world.height > 0, `${map.id} needs world dimensions`);
  assert(map.enemyPaths.length > 0, `${map.id} needs authored enemy paths`);
  assert(map.routeSegments.length > 0, `${map.id} should derive its route traces from the paths`);
  for (const path of map.enemyPaths) {
    for (let index = 1; index < path.points.length; index += 1) {
      const start = path.points[index - 1];
      const end = path.points[index];
      for (let sample = 0; sample <= 20; sample += 1) {
        const t = sample / 20;
        const x = start.x + (end.x - start.x) * t;
        const y = start.y + (end.y - start.y) * t;
        const nearBase = Math.hypot(x - map.base.x, y - map.base.y) <= map.base.radius + 18;
        assert(
          isWorldWalkable(x, y, 12, map) || nearBase,
          `${map.id}/${path.id} crosses authored terrain`,
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Campaign checks passed.');
