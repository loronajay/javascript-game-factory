export const UNIT_STATES = Object.freeze({
  IDLE: 'idle',
  MOVING: 'moving',
  ATTACK_MOVING: 'attack-moving',
  PURSUING_TARGET: 'pursuing-target',
  ATTACKING: 'attacking',
  HARVESTING: 'harvesting',
  BLOCKED_REPATHING: 'blocked-repathing',
  QUEUED_BEHIND_ALLY: 'queued-behind-ally',
  DEAD: 'dead',
});

export function setUnitState(unit, state, simTime) {
  if (!unit || unit.state === state) return;
  unit.state = state;
  unit.lastStableState = state;
  if (unit.debug) unit.debug.stateSince = simTime;
}
