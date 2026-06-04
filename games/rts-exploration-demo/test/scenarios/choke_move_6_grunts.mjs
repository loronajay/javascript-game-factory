import { advance, createNarrowChokeWorld, reservationCounts, result } from './helpers.mjs';

const { units, grunts, target } = createNarrowChokeWorld();
const issued = units.moveUnitsTo(grunts.map((u) => u.id), target.x, target.y, 1);
let maxQueued = 0;
let maxReservations = 0;
let maxBlocked = 0;
for (let i = 0; i < 210; i++) {
  units.update(1 / 60, i / 60);
  maxQueued = Math.max(maxQueued, grunts.filter((u) => u.state === 'queued-behind-ally').length);
  maxReservations = Math.max(maxReservations, units.routeReservations.size);
  maxBlocked = Math.max(maxBlocked, ...grunts.map((u) => u.movementState?.blockedFor ?? 0));
}
const countsBeforeStop = reservationCounts(units);
units.stopUnits(grunts.map((u) => u.id), 1);
advance(units, 4);
const countsAfterStop = reservationCounts(units);
const progressed = grunts.filter((u) => u.x > 8 * units.map.tileSize).length;

result(issued && maxReservations > 0 && maxQueued > 0 && countsAfterStop.routeReservations === 0 && progressed >= 1, {
  scenario: 'choke_move_6_grunts',
  issued,
  maxQueued,
  maxReservations,
  maxBlocked: Math.round(maxBlocked * 100) / 100,
  progressed,
  countsBeforeStop,
  countsAfterStop,
  states: grunts.map((u) => u.state),
});
