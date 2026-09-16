const EPSILON = 1e-6;

export function sweepCircleAabb(circle, rect, delta) {
  if (!rect) return null;
  const minX = rect.x - circle.radius;
  const maxX = rect.x + rect.width + circle.radius;
  const minY = rect.y - circle.radius;
  const maxY = rect.y + rect.height + circle.radius;

  const inside = circle.x >= minX && circle.x <= maxX && circle.y >= minY && circle.y <= maxY;
  if (inside) {
    const distances = [
      { distance: Math.abs(circle.x - minX), normal: { x: -1, y: 0 } },
      { distance: Math.abs(maxX - circle.x), normal: { x: 1, y: 0 } },
      { distance: Math.abs(circle.y - minY), normal: { x: 0, y: -1 } },
      { distance: Math.abs(maxY - circle.y), normal: { x: 0, y: 1 } },
    ];
    distances.sort((a, b) => a.distance - b.distance);
    return { time: 0, normal: distances[0].normal };
  }

  let nearX = -Infinity;
  let farX = Infinity;
  let nearY = -Infinity;
  let farY = Infinity;

  if (Math.abs(delta.x) < EPSILON) {
    if (circle.x < minX || circle.x > maxX) return null;
  } else {
    const a = (minX - circle.x) / delta.x;
    const b = (maxX - circle.x) / delta.x;
    nearX = Math.min(a, b);
    farX = Math.max(a, b);
  }

  if (Math.abs(delta.y) < EPSILON) {
    if (circle.y < minY || circle.y > maxY) return null;
  } else {
    const a = (minY - circle.y) / delta.y;
    const b = (maxY - circle.y) / delta.y;
    nearY = Math.min(a, b);
    farY = Math.max(a, b);
  }

  const entry = Math.max(nearX, nearY);
  const exit = Math.min(farX, farY);
  if (entry > exit || exit < 0 || entry < 0 || entry > 1) return null;

  const normal = nearX > nearY
    ? { x: delta.x > 0 ? -1 : 1, y: 0 }
    : { x: 0, y: delta.y > 0 ? -1 : 1 };
  return { time: entry, normal };
}

export function chooseEarliestCollision(events, priorityEpsilon = EPSILON) {
  if (!events.length) return null;
  const minimum = Math.min(...events.map((event) => event.time));
  return events
    .filter((event) => Math.abs(event.time - minimum) <= priorityEpsilon)
    .sort((a, b) => a.priority - b.priority)[0];
}

export function boxesOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
}
