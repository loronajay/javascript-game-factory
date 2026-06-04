import { createWorld, advance, reservationCounts, result } from './helpers.mjs';

const { units } = createWorld();
const grunts = units.units.filter((u) => u.team === 1 && u.type === 'grunt').slice(0, 4);
const target = units.units.find((u) => u.team === 2 && u.type === 'scout');
const issued = units.attackUnitsUnit(grunts.map((u) => u.id), target, 1);
advance(units, 30);
target.hp = 0;
units.update(1 / 60, 31 / 60);
const counts = reservationCounts(units);
const staleUnitSlots = grunts.filter((u) => u.mobileEngagementSlot || u.attackSlot).length;

result(issued && counts.mobileEngagementSlots === 0 && staleUnitSlots === 0, {
  scenario: 'reservation_cleanup_on_death',
  issued,
  reservations: counts,
  staleUnitSlots,
  targetAlive: units.units.some((u) => u.id === target.id),
});
