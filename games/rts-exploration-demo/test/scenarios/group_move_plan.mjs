import { createWorld, advance, result } from './helpers.mjs';

const { map, units } = createWorld();
const grunts = units.units.filter((u) => u.team === 1 && u.type === 'grunt').slice(0, 6);
const target = map.tileCenter(38, 30);
const issued = units.moveUnitsTo(grunts.map((u) => u.id), target.x, target.y, 1);
advance(units, 60);

const modes = grunts.map((u) => u.debug?.formationMode ?? null);
const routeLengths = grunts.map((u) => u.debug?.groupRoute?.length ?? 0);
const validSlots = grunts.filter((u) => Number.isFinite(u.debug?.formationSlot?.index)).length;

result(issued && validSlots === grunts.length && routeLengths.some((n) => n > 0), {
  scenario: 'group_move_plan',
  issued,
  modes,
  routeLengths,
  validSlots,
  states: grunts.map((u) => u.state),
});
