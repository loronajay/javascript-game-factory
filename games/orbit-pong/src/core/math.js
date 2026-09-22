export const TAU = Math.PI * 2;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function wrapAngle(angle) {
  const wrapped = angle % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
}

// Signed shortest turn from `current` to `target`.
export function angleDifference(target, current) {
  let difference = wrapAngle(target) - wrapAngle(current);
  if (difference <= -Math.PI) difference += TAU;
  if (difference > Math.PI) difference -= TAU;
  return difference;
}

export function lerpAngle(from, to, amount) {
  return wrapAngle(from + angleDifference(to, from) * clamp(amount, 0, 1));
}

export function approach(current, target, amount) {
  if (current < target) return Math.min(target, current + amount);
  if (current > target) return Math.max(target, current - amount);
  return target;
}

export function normalizeVector(x, y, fallbackX = 1, fallbackY = 0) {
  const length = Math.hypot(x, y);
  if (length <= Number.EPSILON) return { x: fallbackX, y: fallbackY };
  return { x: x / length, y: y / length };
}

export function rayCircleIntersection(origin, velocity, radius) {
  const a = velocity.x * velocity.x + velocity.y * velocity.y;
  if (a <= Number.EPSILON) return null;
  const b = 2 * (origin.x * velocity.x + origin.y * velocity.y);
  const c = origin.x * origin.x + origin.y * origin.y - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const near = (-b - root) / (2 * a);
  const far = (-b + root) / (2 * a);
  const t = near >= 0 ? near : far >= 0 ? far : null;
  if (t === null) return null;
  return {
    x: origin.x + velocity.x * t,
    y: origin.y + velocity.y * t,
    t,
  };
}

export function segmentCircleIntersection(start, end, radius) {
  const velocity = { x: end.x - start.x, y: end.y - start.y };
  const hit = rayCircleIntersection(start, velocity, radius);
  return hit && hit.t <= 1 ? hit : null;
}
