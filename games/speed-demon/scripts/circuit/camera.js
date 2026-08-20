import { CAMERA_TUNING, VEHICLE_TUNING } from "./config.js";
import { clamp, exponentialBlend, normalize } from "./math.js";
import { forwardVector, getForwardSpeed, getSpeed } from "./vehicle.js";

export const createCamera = (overrides = {}) => ({
  x: overrides.x ?? 0,
  y: overrides.y ?? 0,
  zoom: overrides.zoom ?? CAMERA_TUNING.maxZoom,
});

export function updateCamera(camera, vehicle, dt, bounds, tuning = CAMERA_TUNING) {
  const speed = getSpeed(vehicle);
  const ratio = clamp(speed / VEHICLE_TUNING.maxForwardSpeed, 0, 1);
  const desiredZoom = tuning.maxZoom - (tuning.maxZoom - tuning.minZoom) * ratio;
  const zoom = camera.zoom + (desiredZoom - camera.zoom) * exponentialBlend(tuning.zoomFollow, dt);
  const lookAhead = clamp(getForwardSpeed(vehicle) * 0.28, -tuning.reverseLookAhead, tuning.maxLookAhead);
  const direction = speed > 2
    ? normalize({ x: vehicle.velocityX, y: vehicle.velocityY })
    : forwardVector(vehicle.angle);
  const blend = exponentialBlend(tuning.follow, dt);
  let x = camera.x + (vehicle.x + direction.x * Math.abs(lookAhead) - camera.x) * blend;
  let y = camera.y + (vehicle.y + direction.y * Math.abs(lookAhead) - camera.y) * blend;
  const halfWidth = bounds.viewportWidth / (2 * zoom);
  const halfHeight = bounds.viewportHeight / (2 * zoom);
  x = clamp(x, halfWidth, bounds.worldWidth - halfWidth);
  y = clamp(y, halfHeight, bounds.worldHeight - halfHeight);
  return { x, y, zoom };
}
