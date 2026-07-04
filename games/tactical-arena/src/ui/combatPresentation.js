export function orderedHitTargets(rolled, findUnitById) {
  if (!rolled || typeof findUnitById !== "function") return [];
  const ids = Array.isArray(rolled.targetIds) && rolled.targetIds.length
    ? rolled.targetIds
    : (rolled.targetId ? [rolled.targetId] : []);
  return ids.map((id) => findUnitById(id)).filter(Boolean);
}
