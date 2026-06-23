import { level01 } from '../../src/maps/level-01.js';
import { advance, createWorld, result } from './helpers.mjs';

const { map, units } = createWorld();
units.spawnFromDef(level01.spawns);

const startingUnits = units.units.filter((unit) => unit.team === 1);
const startsSeparated = hasRequiredSpacing(startingUnits);

const center = map.tileCenter(20, 20);
const first = units.spawnUnit('grunt', 1, center.x, center.y);
const second = units.spawnUnit('grunt', 1, center.x, center.y);
advance(units, 8);

const recoveredFromExactOverlap = centerDistance(first, second) >= first.radius + second.radius;

const groupStarts = [map.tileCenter(30, 30), map.tileCenter(30, 33), map.tileCenter(33, 30)];
const movers = groupStarts.map((point) => units.spawnUnit('grunt', 1, point.x, point.y));
const groupTarget = map.tileCenter(48, 48);
const groupStartDistances = movers.map((unit) => Math.hypot(groupTarget.x - unit.x, groupTarget.y - unit.y));
const groupMoveIssued = units.moveUnitsTo(movers.map((unit) => unit.id), groupTarget.x, groupTarget.y);
advance(units, 420);
const groupStayedSeparated = hasRequiredSpacing(movers);
const groupKeptMoving = movers.every((unit, index) => Math.hypot(groupTarget.x - unit.x, groupTarget.y - unit.y) < groupStartDistances[index] - 80);

result(startsSeparated && recoveredFromExactOverlap && groupMoveIssued && groupStayedSeparated && groupKeptMoving, {
  scenario: 'unit_spacing',
  startsSeparated,
  recoveredFromExactOverlap,
  recoveredDistance: Math.round(centerDistance(first, second) * 100) / 100,
  groupMoveIssued,
  groupStayedSeparated,
  groupKeptMoving,
  groupDistances: movers.map((unit, index) => movers.slice(index + 1).map((other) => Math.round(centerDistance(unit, other) * 100) / 100)),
});

function hasRequiredSpacing(group) {
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      if (centerDistance(group[i], group[j]) < group[i].radius + group[j].radius) return false;
    }
  }
  return true;
}

function centerDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
