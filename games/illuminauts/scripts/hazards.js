// All time arguments are elapsed milliseconds since game start (now - state.gameStartAt).
// Using elapsed instead of raw performance.now() lets both online clients derive
// identical hazard phases from the same reference point.

import { getDoorAt } from './map.js';

function phaseForTimedHazard(hazard, elapsed) {
  const local = (((elapsed + hazard.offsetMs) % hazard.cycleMs) + hazard.cycleMs) % hazard.cycleMs;
  if (local < hazard.warningMs) return 'warning';
  if (local < hazard.warningMs + hazard.activeMs) return 'active';
  return 'cooldown';
}

// Advance alien route positions. lastStepAt is relative to elapsed time.
export function updateAliens(hazards, elapsed) {
  for (const alien of hazards.aliens) {
    alien.index = Math.floor(Math.max(0, elapsed) / alien.stepMs) % alien.route.length;
    alien.lastStepAt = Math.floor(Math.max(0, elapsed) / alien.stepMs) * alien.stepMs;
  }
}

export function getAlienPosition(alien) {
  return alien.route[alien.index];
}

// Shared by damage and rendering, so a moving model never has a different hit location.
export function getAlienPose(alien, elapsed) {
  const step = Math.max(0, elapsed) / alien.stepMs;
  const index = Math.floor(step) % alien.route.length;
  const a = alien.route[index], b = alien.route[(index + 1) % alien.route.length];
  const t = step - Math.floor(step);
  return { px: a.x + 0.5 + (b.x - a.x) * t, py: a.y + 0.5 + (b.y - a.y) * t,
    yaw: Math.atan2(-(b.x - a.x), -(b.y - a.y)) };
}

export function getLaserGatePhase(gate, elapsed) {
  return phaseForTimedHazard(gate, elapsed);
}

export function getTurretPhase(turret, elapsed) {
  return phaseForTimedHazard(turret, elapsed);
}

export function getTurretBeamTiles(turret, map = null) {
  if (!map) return turret.beamTiles;
  const stop = turret.beamTiles.findIndex(p => { const door = getDoorAt(map, p.x, p.y); return door && !door.open; });
  return stop < 0 ? turret.beamTiles : turret.beamTiles.slice(0, stop);
}

export function isHazardAt(hazards, x, y, elapsed, player = null, map = null) {
  for (const alien of hazards.aliens) {
    if (player) {
      const pos = getAlienPose(alien, elapsed);
      if (Math.hypot(pos.px - player.px, pos.py - player.py) < 0.43) return true;
    } else {
      const pos = getAlienPosition(alien);
      if (pos.x === x && pos.y === y) return true;
    }
  }

  for (const gate of hazards.laserGates) {
    if (getLaserGatePhase(gate, elapsed) !== 'active') continue;
    if (gate.tiles.some((tile) => tile.x === x && tile.y === y)) return true;
  }

  for (const turret of hazards.turrets) {
    if (getTurretPhase(turret, elapsed) !== 'active') continue;
    if (getTurretBeamTiles(turret, map).some((tile) => tile.x === x && tile.y === y)) return true;
  }

  return false;
}
