export const DIRECTION_IDS = [
  "front",
  "front-right",
  "right",
  "rear-right",
  "rear",
  "rear-left",
  "left",
  "front-left",
];

const DEGREES = 180 / Math.PI;
const RADIANS = Math.PI / 180;

export function normalizeDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}

export function directionForViewer(viewer, fighter) {
  const dx = viewer.x - fighter.x;
  const dz = viewer.z - fighter.z;
  const viewpointDegrees = Math.atan2(dx, dz) * DEGREES;
  const relativeDegrees = normalizeDegrees(viewpointDegrees - (fighter.yaw ?? 0));
  return DIRECTION_IDS[Math.round(relativeDegrees / 45) % DIRECTION_IDS.length];
}

export function yawToward(from, target) {
  return normalizeDegrees(Math.atan2(target.x - from.x, target.z - from.z) * DEGREES);
}

export function projectWorldPoint(point, camera, viewport, near = 0.08) {
  const yaw = camera.yaw * RADIANS;
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  const dx = point.x - camera.x;
  const dz = point.z - camera.z;
  const depth = dx * forwardX + dz * forwardZ;
  if (depth <= near) return null;

  const lateral = dx * rightX + dz * rightZ;
  const scale = viewport.focal / depth;
  return {
    x: viewport.width / 2 + lateral * scale,
    y: viewport.horizon + ((camera.height ?? 1.65) - (point.height ?? 0)) * scale,
    depth,
    scale,
  };
}

export function movePlayer(player, input, deltaSeconds, rules) {
  const yaw = normalizeDegrees(player.yaw + input.turn * rules.turnSpeed * deltaSeconds);
  const radians = yaw * RADIANS;
  const forwardX = Math.sin(radians);
  const forwardZ = Math.cos(radians);
  const rightX = Math.cos(radians);
  const rightZ = -Math.sin(radians);
  const magnitude = Math.hypot(input.forward, input.strafe);
  const normalization = magnitude > 1 ? 1 / magnitude : 1;
  const distance = rules.moveSpeed * deltaSeconds * normalization;
  const limit = rules.halfSize - rules.margin;
  const x = player.x + (forwardX * input.forward + rightX * input.strafe) * distance;
  const z = player.z + (forwardZ * input.forward + rightZ * input.strafe) * distance;

  return {
    ...player,
    x: Math.max(-limit, Math.min(limit, x)),
    z: Math.max(-limit, Math.min(limit, z)),
    yaw,
  };
}
