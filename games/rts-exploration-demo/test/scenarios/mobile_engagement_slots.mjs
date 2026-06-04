import { createWorld, advance, reservationCounts, result } from './helpers.mjs';

const { units } = createWorld();
const grunts = units.units.filter((u) => u.team === 1 && u.type === 'grunt').slice(0, 4);
const target = units.units.find((u) => u.team === 2 && u.type === 'scout');
const issued = units.attackUnitsUnit(grunts.map((u) => u.id), target, 1);
advance(units, 180);

const slots = grunts.map((u) => u.mobileEngagementSlot?.index).filter(Number.isFinite);
const uniqueSlots = new Set(slots).size;
const attackingIntent = grunts.filter((u) => u.attackTarget?.id === target.id).length;
const counts = reservationCounts(units);

result(issued && attackingIntent >= 3 && uniqueSlots >= 3 && counts.mobileEngagementSlots >= 3, {
  scenario: 'mobile_engagement_slots',
  issued,
  attackingIntent,
  slots,
  uniqueSlots,
  states: grunts.map((u) => u.state),
  reservations: counts,
});
