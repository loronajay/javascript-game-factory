import { clamp, dot, normalize } from "./math.js";
import { forwardVector, getSpeed, rightVector } from "./vehicle.js";

export function createCpuDriver(racingLine, targetIndex = 1) {
  return { racingLine, targetIndex: targetIndex % racingLine.length };
}

export function updateCpuDriver(driver, vehicle, options = {}) {
  const waypointRadius = options.waypointRadius ?? 58;
  let targetIndex = driver.targetIndex;
  for (let checked = 0; checked < driver.racingLine.length; checked += 1) {
    const target = driver.racingLine[targetIndex];
    if (Math.hypot(target.x - vehicle.x, target.y - vehicle.y) >= waypointRadius) break;
    targetIndex = (targetIndex + 1) % driver.racingLine.length;
  }
  const target = driver.racingLine[targetIndex];
  const direction = normalize({ x: target.x - vehicle.x, y: target.y - vehicle.y });
  const alignment = dot(forwardVector(vehicle.angle), direction);
  const steer = clamp(dot(rightVector(vehicle.angle), direction) / 0.48, -1, 1);
  const speed = getSpeed(vehicle);
  let throttle = 1;
  if (alignment < 0.2) throttle = -0.55;
  else if (Math.abs(steer) > 0.72 && speed > 225) throttle = -0.25;
  else if (speed > 270) throttle = 0;
  return { driver: { ...driver, targetIndex }, input: { throttle, steer } };
}
