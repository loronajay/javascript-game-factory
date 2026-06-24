import { calculateBattlefieldView } from '../src/core/game.js';
import { Navigator } from '../src/core/navigation.js';
import { BASE, ENEMY_PATHS, getPathById, isWorldWalkable } from '../src/data/map.js';
import { MISSIONS } from '../src/data/missions.js';
import { UNIT_TYPES, unitIconSvg } from '../src/data/units.js';
import {
  assignAttackOrder,
  assignMoveOrder,
  applyUnitSeparation,
  createUnit,
  getEnemyRouteRecoveryPoint,
  updateBattle,
} from '../src/systems/battle.js';

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const desktopView = calculateBattlefieldView(1920, 1080, 1, false);
assert(desktopView.reservedTop === 0, 'Desktop battle view should keep its full vertical play space');
assert(desktopView.reservedBottom === 0, 'Desktop battle view should not reserve bottom space for the HUD');
assert(desktopView.reservedLeft > 0, 'Desktop battle view should reserve a left-side HUD rail');
assert(desktopView.reservedRight > 0, 'Desktop battle view should reserve a right-side HUD rail');
assert(
  Math.abs(desktopView.scale * 1400 - 1080) < 0.001,
  'Desktop battlefield should retain its full-height scale between the side rails',
);
assert(
  desktopView.offsetX >= desktopView.reservedLeft,
  'Battlefield should begin after the reserved left HUD rail',
);

for (const route of ENEMY_PATHS) {
  for (let index = 1; index < route.points.length; index += 1) {
    const start = route.points[index - 1];
    const end = route.points[index];
    for (let sample = 0; sample <= 30; sample += 1) {
      const t = sample / 30;
      const point = {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
      };
      const nearBase = Math.hypot(point.x - BASE.x, point.y - BASE.y) <= 70;
      assert(isWorldWalkable(point.x, point.y, 12) || nearBase, `${route.id} crosses authored terrain`);
    }
  }
}

for (const type of Object.keys(UNIT_TYPES)) {
  const icon = unitIconSvg(type);
  assert(icon.includes('<svg') && !icon.includes(`>${UNIT_TYPES[type].name[0]}<`), `${type} icon is not illustrated SVG`);
}

const navigator = new Navigator(20);
const game = {
  units: [],
  effects: [],
  gold: 0,
  stats: { enemiesDefeated: 0 },
  baseHp: 100,
  baseMaxHp: 100,
  navigator,
  selectedUnitId: null,
  cancelInteraction() {},
};

const defender = createUnit({ side: 'player', type: 'guard', x: 500, y: 500 });
game.units = [defender];
for (let frame = 0; frame < 600; frame += 1) updateBattle(game, 1 / 60);
assert(defender.x === 500 && defender.y === 500, 'Hold unit moved without an order');

const moveTarget = { x: 285, y: 850 };
const movePath = navigator.findPath(defender, moveTarget);
assert(movePath.length > 0, 'A* failed to create a player route');
assignMoveOrder(defender, movePath);
for (let frame = 0; frame < 1200 && defender.order !== 'hold'; frame += 1) updateBattle(game, 1 / 60);
assert(Math.hypot(defender.x - moveTarget.x, defender.y - moveTarget.y) < 24, 'Move order did not reach its destination');
assert(defender.order === 'hold', 'Move order did not return to Hold');

const blockedTerrainPoint = { x: 500, y: 650 };
const terrainPath = navigator.findPath({ x: 300, y: 650 }, blockedTerrainPoint);
const terrainPathEnd = terrainPath.at(-1);
assert(terrainPath.length > 0, 'Navigation should route to the nearest valid terrain edge');
assert(
  terrainPathEnd && isWorldWalkable(terrainPathEnd.x, terrainPathEnd.y, 20, null, { allowRouteCorridor: false }),
  'Navigation should never finish inside blocked terrain',
);
assert(
  terrainPathEnd && Math.hypot(terrainPathEnd.x - blockedTerrainPoint.x, terrainPathEnd.y - blockedTerrainPoint.y) > 8,
  'Navigation should not use a blocked destination as its final waypoint',
);

const centralRoute = ENEMY_PATHS.find((route) => route.id === 'center-west');
const enemy = createUnit({
  side: 'enemy',
  type: 'striker',
  pathId: centralRoute.id,
  x: centralRoute.points[0].x,
  y: centralRoute.points[0].y,
});
game.units = [enemy];
const enemyStartY = enemy.y;
for (let frame = 0; frame < 300; frame += 1) updateBattle(game, 1 / 60);
assert(enemy.y < enemyStartY - 40, 'Enemy failed to advance toward the core');

const routeWalkers = ENEMY_PATHS.map((route) => createUnit({
  side: 'enemy',
  type: 'striker',
  pathId: route.id,
  x: route.points[0].x,
  y: route.points[0].y,
}));
game.units = routeWalkers;
for (let frame = 0; frame < 4800 && game.units.length > 0; frame += 1) {
  updateBattle(game, 1 / 60);
  for (const walker of game.units) {
    const nearBase = Math.hypot(walker.x - BASE.x, walker.y - BASE.y) <= BASE.radius + UNIT_TYPES[walker.type].radius;
    assert(
      isWorldWalkable(walker.x, walker.y, UNIT_TYPES[walker.type].radius, null, { allowRouteCorridor: false }) || nearBase,
      `${walker.route?.id ?? 'enemy'} entered blocked terrain while advancing`,
    );
  }
}

const attacker = createUnit({ side: 'player', type: 'striker', x: 300, y: 900 });
const target = createUnit({ side: 'enemy', type: 'breaker', pathId: 'west-gate', x: 330, y: 900 });
game.units = [attacker, target];
assignAttackOrder(attacker, target);
for (let frame = 0; frame < 900 && game.units.includes(target); frame += 1) updateBattle(game, 1 / 60);
assert(!game.units.includes(target), 'Attack order failed to destroy the selected target');
updateBattle(game, 1 / 60);
assert(attacker.order === 'hold', 'Attack order did not return to Hold after target death');

const blocker = createUnit({ side: 'player', type: 'guard', x: 500, y: 900 });
const invader = createUnit({ side: 'enemy', type: 'guard', pathId: 'center-west', x: 506, y: 900 });
applyUnitSeparation([blocker, invader]);
const blockadeDistance = Math.hypot(blocker.x - invader.x, blocker.y - invader.y);
const minimumBlockadeDistance = (UNIT_TYPES.guard.radius * 2) * 0.82;
assert(blockadeDistance >= minimumBlockadeDistance - 0.01, 'Opposing units overlap instead of forming a frontline');

const displacedEnemy = createUnit({
  side: 'enemy',
  type: 'guard',
  pathId: 'west-flank',
  x: 350,
  y: 380,
});
displacedEnemy.routeIndex = 7;
const recoveryPoint = getEnemyRouteRecoveryPoint(displacedEnemy);
assert(recoveryPoint, 'A displaced enemy needs a route recovery point');
assert(
  Math.hypot(recoveryPoint.x - displacedEnemy.x, recoveryPoint.y - displacedEnemy.y) < 70,
  'Enemy route recovery should return to the nearby route segment, not skip across the map',
);

const mission = MISSIONS[0];
assert(mission.startingGold === 1200, 'Mission does not start with the revised 1,200 gold budget');
assert(UNIT_TYPES.striker.bounty >= 30, 'Enemy kill rewards were not increased');

const economyGame = {
  units: [],
  effects: [],
  gold: mission.startingGold,
  stats: { enemiesDefeated: 0 },
  baseHp: mission.baseHp,
  baseMaxHp: mission.baseHp,
  navigator: new Navigator(20),
  selectedUnitId: null,
  cancelInteraction() {},
};
const defensiveSlots = [
  ['guard', 438, 310], ['breaker', 405, 345], ['striker', 465, 365], ['marksman', 400, 245],
  ['guard', 562, 310], ['breaker', 595, 345], ['striker', 535, 365], ['marksman', 600, 245],
  ['guard', 355, 625], ['marksman', 410, 570], ['guard', 645, 625], ['marksman', 590, 570],
];
const replenish = () => {
  for (const [type, x, y] of defensiveSlots) {
    const occupied = economyGame.units.some((unit) => (
      unit.side === 'player'
      && !unit.dead
      && Math.hypot(unit.x - x, unit.y - y) < 30
    ));
    if (!occupied && economyGame.gold >= UNIT_TYPES[type].cost) {
      economyGame.gold -= UNIT_TYPES[type].cost;
      economyGame.units.push(createUnit({ side: 'player', type, x, y }));
    }
  }
};

let elapsed = 0;
let waveIndex = 0;
let spawnQueue = [];
let missionWon = false;
replenish();
for (let frame = 0; frame < 60 * 160 && economyGame.baseHp > 0; frame += 1) {
  elapsed += 1 / 60;
  while (waveIndex < mission.waves.length && elapsed >= mission.waves[waveIndex].at) {
    const wave = mission.waves[waveIndex];
    for (const spec of wave.units) spawnQueue.push({ ...spec, at: wave.at + spec.delay });
    waveIndex += 1;
  }
  for (let index = spawnQueue.length - 1; index >= 0; index -= 1) {
    const spawn = spawnQueue[index];
    if (elapsed < spawn.at) continue;
    const path = getPathById(spawn.path);
    const origin = path.points[0];
    economyGame.units.push(createUnit({
      side: 'enemy',
      type: spawn.type,
      pathId: spawn.path,
      x: origin.x,
      y: origin.y,
      hpScale: mission.enemyHpScale,
      damageScale: mission.enemyDamageScale,
    }));
    spawnQueue.splice(index, 1);
  }
  updateBattle(economyGame, 1 / 60);
  if (frame % 30 === 0) replenish();
  if (
    waveIndex >= mission.waves.length
    && spawnQueue.length === 0
    && !economyGame.units.some((unit) => unit.side === 'enemy')
  ) {
    missionWon = true;
    break;
  }
}
assert(missionWon, 'Revised Gold economy failed the scripted five-wave defense');

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Tactical smoke checks passed.');
