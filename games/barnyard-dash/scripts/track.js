export const DEFAULT_TRACK = Object.freeze({
  start: Object.freeze({ x: 133, y: 490, angle: -Math.PI / 2 }),
  finish: Object.freeze({ x: 130, y: 450, angle: -Math.PI / 2 }),
  roadWidth: 132,
  road: Object.freeze([
    Object.freeze({ x: 135, y: 510 }),
    Object.freeze({ x: 118, y: 350 }),
    Object.freeze({ x: 145, y: 205 }),
    Object.freeze({ x: 265, y: 115 }),
    Object.freeze({ x: 450, y: 88 }),
    Object.freeze({ x: 650, y: 115 }),
    Object.freeze({ x: 790, y: 220 }),
    Object.freeze({ x: 835, y: 370 }),
    Object.freeze({ x: 760, y: 515 }),
    Object.freeze({ x: 590, y: 585 }),
    Object.freeze({ x: 370, y: 590 }),
    Object.freeze({ x: 205, y: 545 }),
    Object.freeze({ x: 135, y: 510 }),
  ]),
  checkpoints: Object.freeze([
    Object.freeze({ x: 130, y: 260, radius: 80 }),
    Object.freeze({ x: 265, y: 115, radius: 72 }),
    Object.freeze({ x: 650, y: 115, radius: 72 }),
    Object.freeze({ x: 835, y: 370, radius: 72 }),
    Object.freeze({ x: 760, y: 515, radius: 72 }),
    Object.freeze({ x: 370, y: 590, radius: 72 }),
    Object.freeze({ x: 130, y: 450, radius: 64 }),
  ]),
  mud: Object.freeze([
    Object.freeze({ x: 475, y: 96, width: 145, height: 82 }),
    Object.freeze({ x: 810, y: 310, width: 100, height: 120 }),
  ]),
  obstacles: Object.freeze([
    Object.freeze({ id: "hurdle-1", kind: "hurdle", x: 120, y: 330, length: 116, thickness: 4, angle: 0.06 }),
    Object.freeze({ id: "hurdle-2", kind: "hurdle", x: 205, y: 160, length: 116, thickness: 4, angle: 0.93 }),
    Object.freeze({ id: "hurdle-3", kind: "hurdle", x: 560, y: 103, length: 116, thickness: 4, angle: 1.70 }),
    Object.freeze({ id: "hurdle-4", kind: "hurdle", x: 740, y: 182, length: 116, thickness: 4, angle: 2.21 }),
    Object.freeze({ id: "hay-1", kind: "hay", x: 690, y: 145, radius: 21 }),
    Object.freeze({ id: "gate-1", kind: "gate", x: 820, y: 400, length: 52, thickness: 5, angle: 0.48 }),
    Object.freeze({ id: "hurdle-5", kind: "hurdle", x: 790, y: 455, length: 116, thickness: 4, angle: 0.48 }),
    Object.freeze({ id: "hurdle-6", kind: "hurdle", x: 555, y: 586, length: 116, thickness: 4, angle: 1.55 }),
    Object.freeze({ id: "hurdle-7", kind: "hurdle", x: 285, y: 567, length: 116, thickness: 4, angle: 1.84 }),
  ]),
});

/** Tile a broad checkered band perpendicular to the starting heading. */
export function startLineTiles(track, columns = 12, rows = 3) {
  const line = track.finish ?? track.start;
  const width = Math.max(1, track.roadWidth - 12);
  const tileWidth = width / columns;
  const tileDepth = 7;
  const acrossX = -Math.sin(line.angle);
  const acrossY = Math.cos(line.angle);
  const forwardX = Math.cos(line.angle);
  const forwardY = Math.sin(line.angle);
  const tiles = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const across = (column - (columns - 1) / 2) * tileWidth;
      const forward = (row - (rows - 1) / 2) * tileDepth;
      tiles.push({
        x: line.x + acrossX * across + forwardX * forward,
        y: line.y + acrossY * across + forwardY * forward,
        angle: line.angle,
        width: tileWidth,
        depth: tileDepth,
        row,
        column,
        dark: (row + column) % 2 === 0,
      });
    }
  }
  return tiles;
}

export function pointInRect(point, rect) {
  return point.x >= rect.x - rect.width / 2 && point.x <= rect.x + rect.width / 2
    && point.y >= rect.y - rect.height / 2 && point.y <= rect.y + rect.height / 2;
}

function closestPointOnSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const amount = lengthSquared ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0;
  const x = start.x + dx * amount;
  const y = start.y + dy * amount;
  const distance = Math.hypot(point.x - x, point.y - y);
  return { x, y, distance, amount };
}

export function closestPointOnRoad(point, track) {
  let closest = null;
  for (let index = 1; index < track.road.length; index += 1) {
    const candidate = closestPointOnSegment(point, track.road[index - 1], track.road[index]);
    if (!closest || candidate.distance < closest.distance) closest = candidate;
  }
  const normalLength = closest?.distance ?? 0;
  return {
    ...closest,
    normalX: normalLength ? (point.x - closest.x) / normalLength : 0,
    normalY: normalLength ? (point.y - closest.y) / normalLength : 0,
  };
}

export function distanceFromRoad(point, track) {
  return closestPointOnRoad(point, track).distance;
}

export function segmentCircleIntersection(start, end, circle, radius) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const fx = start.x - circle.x;
  const fy = start.y - circle.y;
  const a = dx * dx + dy * dy;
  const c = fx * fx + fy * fy - radius * radius;
  if (c <= 0) return { amount: 0, x: start.x, y: start.y };
  if (a === 0) return null;
  const b = 2 * (fx * dx + fy * dy);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const amount = (-b - Math.sqrt(discriminant)) / (2 * a);
  return amount >= 0 && amount <= 1
    ? { amount, x: start.x + dx * amount, y: start.y + dy * amount }
    : null;
}

export function segmentCapsuleIntersection(start, end, capsuleStart, capsuleEnd, radius) {
  const pointAt = (amount) => ({
    x: start.x + (end.x - start.x) * amount,
    y: start.y + (end.y - start.y) * amount,
  });
  const sample = (amount) => {
    const point = pointAt(amount);
    const closest = closestPointOnSegment(point, capsuleStart, capsuleEnd);
    return { amount, point, closest, distanceSquared: closest.distance * closest.distance };
  };
  const radiusSquared = radius * radius;
  const initial = sample(0);
  if (initial.distanceSquared <= radiusSquared) {
    return { amount: 0, x: start.x, y: start.y, closestX: initial.closest.x, closestY: initial.closest.y };
  }

  // Distance to a line segment is convex along a movement segment. Find its
  // minimum, then binary-search the first point where the visible collider is hit.
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const third = (high - low) / 3;
    const left = sample(low + third);
    const right = sample(high - third);
    if (left.distanceSquared <= right.distanceSquared) high -= third;
    else low += third;
  }
  const minimumAmount = (low + high) / 2;
  if (sample(minimumAmount).distanceSquared > radiusSquared) return null;

  low = 0;
  high = minimumAmount;
  for (let iteration = 0; iteration < 28; iteration += 1) {
    const middle = (low + high) / 2;
    if (sample(middle).distanceSquared <= radiusSquared) high = middle;
    else low = middle;
  }
  const hit = sample(high);
  return {
    amount: high,
    x: hit.point.x,
    y: hit.point.y,
    closestX: hit.closest.x,
    closestY: hit.closest.y,
  };
}

/** Build fence runs that stop short of each bend, leaving the racing line open at corners. */
export function roadEdgeSegments(track) {
  const result = [];
  for (let index = 1; index < track.road.length; index += 1) {
    const from = track.road[index - 1];
    const to = track.road[index];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const sourceLength = Math.hypot(dx, dy);
    if (!sourceLength) continue;
    const ux = dx / sourceLength;
    const uy = dy / sourceLength;
    const trim = Math.min(track.roadWidth * 0.18, sourceLength * 0.2);
    const offset = track.roadWidth / 2 + 8;
    for (const side of [-1, 1]) {
      const normalX = -uy * offset * side;
      const normalY = ux * offset * side;
      const start = { x: from.x + ux * trim + normalX, y: from.y + uy * trim + normalY };
      const end = { x: to.x - ux * trim + normalX, y: to.y - uy * trim + normalY };
      result.push({ start, end, length: sourceLength - trim * 2, sourceLength });
    }
  }
  return result;
}
