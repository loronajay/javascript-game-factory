function phaseForTimedHazard(hazard, now) {
  const local = (((now + hazard.offsetMs) % hazard.cycleMs) + hazard.cycleMs) % hazard.cycleMs;
  if (local < hazard.warningMs) return 'warning';
  if (local < hazard.warningMs + hazard.activeMs) return 'active';
  return 'cooldown';
}

export function updateAliens(hazards, now) {
  for (const alien of hazards.aliens) {
    if (now - alien.lastStepAt < alien.stepMs) continue;
    alien.lastStepAt = now;
    alien.index = (alien.index + 1) % alien.route.length;
  }
}

export function getAlienPosition(alien) {
  return alien.route[alien.index];
}

export function getLaserGatePhase(gate, now) {
  return phaseForTimedHazard(gate, now);
}

export function getTurretPhase(turret, now) {
  return phaseForTimedHazard(turret, now);
}

export function getTurretBeamTiles(turret) {
  const tiles = [];
  for (let i = 1; i <= turret.range; i++) {
    tiles.push({ x: turret.x + turret.dx * i, y: turret.y + turret.dy * i });
  }
  return tiles;
}

export function isHazardAt(hazards, x, y, now) {
  for (const alien of hazards.aliens) {
    const pos = getAlienPosition(alien);
    if (pos.x === x && pos.y === y) return true;
  }

  for (const gate of hazards.laserGates) {
    if (getLaserGatePhase(gate, now) !== 'active') continue;
    if (gate.tiles.some((tile) => tile.x === x && tile.y === y)) return true;
  }

  for (const turret of hazards.turrets) {
    if (getTurretPhase(turret, now) !== 'active') continue;
    if (getTurretBeamTiles(turret).some((tile) => tile.x === x && tile.y === y)) return true;
  }

  return false;
}
