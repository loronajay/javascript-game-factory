// Pure functions for resolving, identifying, and measuring targets.
// Shared by CombatSystem and MovementSystem via the system context.

export function resolveTarget(ref, map, getById) {
  if (!ref) return null;
  if (ref.kind === 'destructibleTile') {
    const wall = map.getDestructible(ref.x, ref.y);
    return wall ? { kind: 'destructibleTile', ...wall } : null;
  }
  if (ref.kind === 'unit') {
    const unit = getById(ref.id);
    return unit && unit.hp > 0 ? { kind: 'unit', unit } : null;
  }
  return null;
}

export function targetKey(ref) {
  if (!ref) return '';
  if (ref.kind === 'destructibleTile') return `tile:${ref.x},${ref.y}`;
  if (ref.kind === 'unit') return `unit:${ref.id}`;
  return '';
}

export function targetCenter(target, map) {
  if (target.kind === 'destructibleTile') return map.tileCenter(target.x, target.y);
  return { x: target.unit.x, y: target.unit.y };
}

export function targetRadius(target, map) {
  if (target.kind === 'destructibleTile') return map.tileSize * 0.5;
  return target.unit.radius;
}

export function distanceToTargetEdge(unit, target, map) {
  const center = targetCenter(target, map);
  return Math.max(0, Math.hypot(center.x - unit.x, center.y - unit.y) - targetRadius(target, map));
}
