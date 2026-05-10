// All time arguments are elapsed milliseconds since game start (now - state.gameStartAt).
// Using elapsed instead of raw performance.now() lets both online clients derive
// identical hazard phases from the same reference point.

function phaseForTimedHazard(hazard, elapsed) {
  const local = (((elapsed + hazard.offsetMs) % hazard.cycleMs) + hazard.cycleMs) % hazard.cycleMs;
  if (local < hazard.warningMs) return 'warning';
  if (local < hazard.warningMs + hazard.activeMs) return 'active';
  return 'cooldown';
}

// Advance alien route positions. lastStepAt is relative to elapsed time.
export function updateAliens(hazards, elapsed) {
  for (const alien of hazards.aliens) {
    if (elapsed - alien.lastStepAt < alien.stepMs) continue;
    alien.lastStepAt = elapsed;
    alien.index = (alien.index + 1) % alien.route.length;
  }
}

export function getAlienPosition(alien) {
  return alien.route[alien.index];
}

export function getLaserGatePhase(gate, elapsed) {
  return phaseForTimedHazard(gate, elapsed);
}

export function getTurretPhase(turret, elapsed) {
  return phaseForTimedHazard(turret, elapsed);
}

export function getTurretBeamTiles(turret) {
  return turret.beamTiles; // precomputed in state.js; turrets never move
}

export function isHazardAt(hazards, x, y, elapsed) {
  for (const alien of hazards.aliens) {
    const pos = getAlienPosition(alien);
    if (pos.x === x && pos.y === y) return true;
  }

  for (const gate of hazards.laserGates) {
    if (getLaserGatePhase(gate, elapsed) !== 'active') continue;
    if (gate.tiles.some((tile) => tile.x === x && tile.y === y)) return true;
  }

  for (const turret of hazards.turrets) {
    if (getTurretPhase(turret, elapsed) !== 'active') continue;
    if (getTurretBeamTiles(turret).some((tile) => tile.x === x && tile.y === y)) return true;
  }

  return false;
}
