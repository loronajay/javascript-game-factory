import { CONFIG } from '../config.js';
import { distanceSq } from '../utils.js';
import { findPath } from '../pathfinding.js';

export function buildGroupMovePlan({ units, map, worldX, worldY, clearanceForUnit }) {
  const groupRoute = buildGroupRoute({ units, map, worldX, worldY, clearanceForUnit });
  const route = groupRoute?.route ?? null;
  const direction = groupApproachDirection(route, units, worldX, worldY);
  const maxRadius = Math.max(...units.map((unit) => unit.radius));
  const columns = route ? estimateRouteColumns(map, route, maxRadius + 1) : Math.min(3, Math.ceil(Math.sqrt(units.length)));
  const formationMode = columns <= 1 ? 'single-file' : columns === 2 ? 'two-file' : 'grid';
  const ordered = orderUnitsForGroupMove(units, direction, worldX, worldY);
  const offsets = adaptiveFormationOffsets(ordered.length, CONFIG.formationSpacing, columns, direction);

  return {
    route,
    direction,
    columns,
    formationMode,
    ordered,
    assignments: ordered.map((unit, index) => ({
      unit,
      unitId: unit.id,
      targetX: worldX + offsets[index].x,
      targetY: worldY + offsets[index].y,
      slotIndex: index,
      columns,
    })),
  };
}

export function buildGroupRoute({ units, map, worldX, worldY, clearanceForUnit }) {
  if (!units.length) return null;
  const center = units.reduce((acc, unit) => {
    acc.x += unit.x;
    acc.y += unit.y;
    return acc;
  }, { x: 0, y: 0 });
  center.x /= units.length;
  center.y /= units.length;

  const clearance = Math.max(...units.map((unit) => clearanceForUnit(unit)));
  const startRaw = map.worldToTile(center.x, center.y);
  const goalRaw = map.worldToTile(worldX, worldY);
  const start = map.nearestWalkableTileForRadius(startRaw.x, startRaw.y, clearance, 18);
  const goal = map.nearestWalkableTileForRadius(goalRaw.x, goalRaw.y, clearance, 24);
  if (!start || !goal) return null;
  const route = findPath(map, start, goal, { clearance, maxGoalSearchRadius: 24 });
  if (!route.length) return null;
  return { route, clearance };
}

export function groupApproachDirection(route, units, worldX, worldY) {
  if (route && route.length >= 2) {
    const a = route[Math.max(0, route.length - 2)];
    const b = route[route.length - 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len > 0.001) return { x: dx / len, y: dy / len };
  }
  const center = units.reduce((acc, unit) => {
    acc.x += unit.x;
    acc.y += unit.y;
    return acc;
  }, { x: 0, y: 0 });
  center.x /= Math.max(1, units.length);
  center.y /= Math.max(1, units.length);
  const dx = worldX - center.x;
  const dy = worldY - center.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

export function estimateRouteColumns(map, route, clearance) {
  if (!route || route.length === 0) return 3;
  let minColumns = 4;
  for (let i = 0; i < route.length; i++) {
    const prev = route[Math.max(0, i - 1)];
    const next = route[Math.min(route.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const dir = { x: dx / len, y: dy / len };
    const columns = estimateColumnsAtPoint(map, route[i], clearance, dir, Math.max(18, CONFIG.formationSpacing * 0.82));
    minColumns = Math.min(minColumns, columns);
  }
  return Math.max(1, Math.min(3, minColumns));
}

export function estimateColumnsAtPoint(map, point, clearance, dir, spacing) {
  const perp = { x: -dir.y, y: dir.x };
  let count = map.isCircleWalkable(point.x, point.y, clearance) ? 1 : 0;
  for (const side of [-1, 1]) {
    for (let lane = 1; lane <= 2; lane++) {
      const x = point.x + perp.x * spacing * lane * side;
      const y = point.y + perp.y * spacing * lane * side;
      if (!map.isCircleWalkable(x, y, clearance)) break;
      count += 1;
    }
  }
  return count;
}

export function orderUnitsForGroupMove(units, direction, worldX, worldY) {
  const perp = { x: -direction.y, y: direction.x };
  return [...units].sort((a, b) => {
    const aForward = (a.x - worldX) * direction.x + (a.y - worldY) * direction.y;
    const bForward = (b.x - worldX) * direction.x + (b.y - worldY) * direction.y;
    if (Math.abs(aForward - bForward) > 4) return bForward - aForward;
    const aLateral = Math.abs((a.x - worldX) * perp.x + (a.y - worldY) * perp.y);
    const bLateral = Math.abs((b.x - worldX) * perp.x + (b.y - worldY) * perp.y);
    return aLateral - bLateral;
  });
}

export function mergeGroupRouteForUnit({ map, unit, personalPath, groupRoute }) {
  if (!groupRoute || groupRoute.length < 3 || personalPath.length === 0) return personalPath;
  const firstPersonal = personalPath[0];
  let bestIndex = -1;
  let bestD2 = Infinity;
  const maxJoinD2 = Math.pow(map.tileSize * 3, 2);
  for (let i = 1; i < groupRoute.length - 1; i++) {
    const p = groupRoute[i];
    const d2 = distanceSq(firstPersonal.x, firstPersonal.y, p.x, p.y);
    if (d2 < bestD2) {
      bestD2 = d2;
      bestIndex = i;
    }
  }
  if (bestIndex < 0 || bestD2 > maxJoinD2) return personalPath;
  const final = personalPath[personalPath.length - 1];
  const prefix = personalPath.slice(0, 1);
  const shared = groupRoute.slice(bestIndex, -1);
  return dedupeWaypoints([...prefix, ...shared, final]);
}

export function adaptiveFormationOffsets(count, spacing, columns, direction = { x: 1, y: 0 }) {
  if (count <= 1) return [{ x: 0, y: 0 }];
  const dirLen = Math.hypot(direction.x, direction.y) || 1;
  const forward = { x: direction.x / dirLen, y: direction.y / dirLen };
  const perp = { x: -forward.y, y: forward.x };
  const cols = Math.max(1, Math.min(columns || Math.ceil(Math.sqrt(count)), Math.ceil(Math.sqrt(count)), 3));
  const offsets = [];

  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const rowCount = Math.min(cols, count - row * cols);
    const lateral = (col - (rowCount - 1) / 2) * spacing;
    const back = row * spacing;
    offsets.push({
      x: perp.x * lateral - forward.x * back,
      y: perp.y * lateral - forward.y * back,
    });
  }
  return offsets;
}

function dedupeWaypoints(points) {
  const out = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.hypot(last.x - p.x, last.y - p.y) < 2) continue;
    out.push(p);
  }
  return out;
}
