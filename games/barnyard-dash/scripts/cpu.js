import { closestPointOnRoad } from "./track.js?v=20260926-course-walls";

const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

function idSide(id) {
  let value = 0;
  for (const character of String(id)) value += character.charCodeAt(0);
  return value % 2 ? -1 : 1;
}

function gateDetour(racer, target, track, brokenObstacles) {
  const gate = track.obstacles.find((obstacle) => {
    if (obstacle.kind !== "gate" || brokenObstacles.includes(obstacle.id)) return false;
    const dx = obstacle.x - racer.x;
    const dy = obstacle.y - racer.y;
    const targetDx = target.x - racer.x;
    const targetDy = target.y - racer.y;
    const ahead = dx * targetDx + dy * targetDy > 0;
    const cannotBreakYet = racer.speed * racer.profile.gatePower < 90;
    return ahead && Math.hypot(dx, dy) < 72 && (racer.lastImpact === "gate" || cannotBreakYet);
  });
  if (!gate) return null;

  const side = idSide(racer.id);
  const clearance = gate.length / 2 + racer.profile.radius + 7;
  return {
    x: gate.x + Math.cos(gate.angle) * clearance * side,
    y: gate.y + Math.sin(gate.angle) * clearance * side,
  };
}

export function cpuControls(racer, track, brokenObstacles = []) {
  const checkpoint = track.checkpoints[Math.min(racer.checkpoint, track.checkpoints.length - 1)] ?? track.finish ?? track.start;
  const nearestRoad = closestPointOnRoad(racer, track);
  const recoveryTarget = nearestRoad.distance > track.roadWidth * 0.42
    ? { x: nearestRoad.x, y: nearestRoad.y }
    : null;
  const detourTarget = recoveryTarget ? null : gateDetour(racer, checkpoint, track, brokenObstacles);
  const target = recoveryTarget ?? detourTarget ?? checkpoint;
  const recovering = Boolean(recoveryTarget || detourTarget);
  const wanted = Math.atan2(target.y - racer.y, target.x - racer.x);
  const turn = wrapAngle(wanted - racer.angle);
  const distance = Math.hypot(target.x - racer.x, target.y - racer.y);
  const hurdleAhead = track.obstacles.find((obstacle) => obstacle.kind === "hurdle"
    && !brokenObstacles.includes(obstacle.id)
    && Math.hypot(obstacle.x - racer.x, obstacle.y - racer.y) < 58);

  return {
    throttle: recovering || Math.abs(turn) < 1.15 || distance > 100,
    brake: Math.abs(turn) > 1.5 && racer.speed > 70,
    left: turn < -0.035,
    right: turn > 0.035,
    // Emit a fresh press only from the ground. Holding jump forever prevents
    // a racer that clipped a rail from ever getting another takeoff edge.
    jump: Boolean(hurdleAhead && racer.jumpHeight <= 0 && !racer.jumpHeld),
  };
}
